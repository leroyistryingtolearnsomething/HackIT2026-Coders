/* AI assistant: residents chat with an AI (Gemini or Claude, see src/ai/) about a
   suspicious message. The browser never sees the API key — it talks to this route,
   which calls the AI service and streams the reply back as Server-Sent Events. */
import { Router } from 'express';
import { requireClient, rateLimit } from '../auth.js';
import { KW, maskPersonal } from '../shared.js';
import { HttpError, badRequest, text } from '../http.js';
import { decodeImageDataUrl } from '../images.js';
import { listReports } from '../models/reports.js';

const LANGUAGES = { en: 'English', zh: 'Simplified Chinese', ms: 'Malay', ta: 'Tamil' };
const MAX_TURNS = 20;

/* Stable instructions: identical on every request so they can be prompt-cached. */
const SYSTEM_PROMPT = `You are the Kampung Watch assistant, part of a community website in Singapore where neighbours help each other check suspicious messages, calls and offers and decide what to do safely. Residents of every age use it, often when they are unsure, under pressure or want a second opinion.

How to help
- Read what the resident shares (text or a screenshot) and point out the specific warning signs you see, in plain words.
- Give clear next steps: what not to do (don't tap links, don't reply, don't pay, don't share OTPs) and how to check through official channels the resident finds themselves, such as the number on the back of their card or the organisation's official app or website.
- You are a first look, not the final word. You cannot confirm that something is a scam or genuine. For anything uncertain or high-stakes, suggest sending it to a trained volunteer with the "Send this chat to a volunteer" button under the chat.
- If money may be leaving their account right now, or they have already shared bank details, OTPs or passwords, start with this: call their bank's 24-hour hotline now (the number on the back of their card), and call 999 if they are in danger or money is being taken right now. For advice, the ScamShield Helpline 1799 is open all day.
- Never ask for passwords, OTPs, PINs, full card or bank account numbers, NRIC numbers or Singpass details. If the resident starts sharing them, ask them to stop and explain that nobody genuine needs them.
- Don't state facts you're not sure of, such as whether a particular phone number or website belongs to an organisation. Explain how to check instead.
- Be warm and calm. Never make the resident feel foolish; scams are designed to fool careful people.

Style
- Reply in the language named in the conversation context.
- Keep replies short: one or two sentences of answer, then at most four short numbered steps when steps help.
- Write plain text only. Don't use markdown such as asterisks, hashes or tables.
- Use simple, everyday words anyone can follow.

Warning signs Kampung Watch teaches residents to look for
${KW.FLAG_RULES.map(r => `- ${r.label}: ${r.tip}`).join('\n')}

Help lines in Singapore
${KW.HELPLINES.map(h => `- ${h.label}: ${h.number} (${h.note})`).join('\n')}

What Kampung Watch offers
- Ask a Neighbour (home page): send a message to a trained volunteer, or ask for a call back in English, Mandarin, Malay, Tamil or Hokkien.
- Scam Radar: scam waves reported by residents and verified by Community Centre and RC volunteers, by town.
- Community: residents ask questions and share tips.
- Learn: short courses and a Spot-the-scam game.

Scope
Stay on scams, online safety and how to use Kampung Watch. For unrelated requests, say briefly that you can only help with scams and staying safe online.`;

/* Changes per request (language, latest verified scam waves), so it sits after the cached block. */
function contextBlock(db, lang) {
  const recent = listReports(db, null, { status: 'verified', days: 14, limit: 12 });
  const waves = recent.length
    ? recent.map(r => `- ${r.town}: ${r.title} (${r.type}, ${r.count} residents reported it)`).join('\n')
    : '- None verified in the last 14 days.';
  return `Conversation context
- Reply in ${LANGUAGES[lang]}.
- Scam waves verified by Kampung Watch volunteers in the last 14 days:
${waves}`;
}

/* Checks the chat history from the browser and turns it into Claude messages. */
function buildMessages(body) {
  const history = body.messages;
  if (!Array.isArray(history) || history.length === 0 || history.length > MAX_TURNS) {
    throw badRequest(`messages must be a list of 1 to ${MAX_TURNS} turns`);
  }
  const messages = history.map((m, i) => {
    const role = i % 2 === 0 ? 'user' : 'assistant';
    if (!m || m.role !== role) throw badRequest('messages must alternate user and assistant, starting with user');
    const content = role === 'user'
      ? maskPersonal(text(m.content, 'message', { min: 1, max: 2000 }))
      : text(m.content, 'message', { min: 1, max: 4000 });
    return { role, content };
  });
  if (messages[messages.length - 1].role !== 'user') throw badRequest('the last message must be from the user');

  const image = body.image ? decodeImageDataUrl(body.image) : null;
  return { messages, image };
}

const GENERIC_ERROR = 'Sorry, the assistant couldn’t answer just now. Please try again, or ask a volunteer.';

export default function assistantRouter({ db, config, assistant }) {
  const r = Router();
  let day = '', usedToday = 0;

  r.post('/chat', requireClient, rateLimit({ max: config.assistantPerMinute }), async (req, res) => {
    if (!assistant) throw new HttpError(503, 'The assistant isn’t switched on. Add GEMINI_API_KEY (free) or ANTHROPIC_API_KEY to server/.env and restart the server.');

    const today = new Date().toISOString().slice(0, 10);
    if (today !== day) { day = today; usedToday = 0; }
    if (usedToday >= config.assistantDailyLimit) {
      throw new HttpError(429, 'The assistant has reached today’s limit. Please ask a volunteer instead.');
    }

    const lang = LANGUAGES[req.body?.lang] ? req.body.lang : 'en';
    const { messages, image } = buildMessages(req.body || {});
    usedToday++;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no'
    });
    const send = data => res.write(`data: ${JSON.stringify(data)}\n\n`);

    // Stop paying for (and generating) a reply nobody is reading.
    const controller = new AbortController();
    res.on('close', () => { if (!res.writableEnded) controller.abort(); });

    try {
      const result = await assistant.reply({
        system: SYSTEM_PROMPT,
        context: contextBlock(db, lang),
        messages,
        image,
        signal: controller.signal,
        onText: delta => send({ type: 'text', text: delta })
      });
      if (result.stopReason === 'refusal') {
        send({ type: 'refusal', text: 'I can’t help with that one. A trained volunteer can: use “Send this chat to a volunteer”.' });
      }
      send({ type: 'done', stopReason: result.stopReason });
      const u = result.usage || {};
      console.log(`[assistant] ${assistant.name}: in ${u.input ?? '?'} (cached ${u.cached || 0}) out ${u.output ?? '?'}`);
    } catch (err) {
      if (controller.signal.aborted || assistant.isAbort(err)) return; // the resident closed the chat
      console.error(`[assistant] ${assistant.name}`, err.status || '', err.message);
      if (!res.writableEnded) send({ type: 'error', message: assistant.describeError(err) || GENERIC_ERROR });
    }
    if (!res.writableEnded) res.end();
  });

  return r;
}
