/* Simulated volunteer, so demos work even when no human volunteer is online.
   A human volunteer who replies first always takes over the case.
   Turn off with AUTO_REPLY=false. */
import { KW } from './shared.js';
import { getCaseRow, addMessage, updateCase, notifyCase } from './models/cases.js';
import { getPauseRow, addPauseMessage, claimPause, notifyPause } from './models/pauses.js';

const ASSIGN_AFTER_MS = 2500;
const REPLY_AFTER_MS = 9000;
const FOLLOW_UP_AFTER_MS = 5000;
const PAUSE_PICKUP_AFTER_MS = 4000;

export function replyFor(row) {
  const flags = KW.FLAG_RULES.filter(r => JSON.parse(row.flags).includes(r.id));
  const flagText = flags.map(f => '• ' + f.label).join('\n');
  const callback = row.callback ? JSON.parse(row.callback) : null;
  const greet = callback && callback.name ? `Hi ${callback.name}! ` : 'Hi! ';
  let body, verdict;
  if (row.level === 'high') {
    verdict = 'scam';
    body = `${greet}Thanks for checking with us first. This looks like a scam. I noticed:\n${flagText}\n\nPlease don’t click any links, reply or transfer money. Block the sender and report it in the ScamShield app. If you’ve already shared bank details, call your bank’s 24-hour hotline right away.`;
  } else if (row.level === 'medium') {
    verdict = 'suspicious';
    body = `${greet}There are some warning signs here:\n${flagText}\n\nDon’t act on it yet. Contact the organisation directly using the number on their official website or the back of your card — not the one in the message. Happy to help you check further!`;
  } else {
    verdict = row.text ? 'safe' : null;
    body = `${greet}I don’t see obvious red flags${row.text ? '' : ' yet — could you describe what the message says'}. Stay careful though: if they later ask for money, OTPs or personal details, that’s a scam sign. Can you tell me who sent it and whether there’s a link?`;
  }
  if (callback) body += `\n\nI’ll call you at ${callback.phone} in ${callback.lang} within 15 minutes.`;
  return { body, verdict };
}

export function createBot({ db, hub, enabled }) {
  const timers = new Set();
  const later = (ms, fn) => {
    const t = setTimeout(() => {
      timers.delete(t);
      try { fn(); } catch (err) { console.error('[bot]', err); }
    }, ms);
    timers.add(t);
  };

  const volunteerOf = row => (row.volunteer ? JSON.parse(row.volunteer) : null);

  function assign(caseId) {
    const row = getCaseRow(db, caseId);
    if (!row || row.status !== 'waiting' || row.volunteer) return;
    const v = KW.VOLUNTEERS[Math.floor(Math.random() * KW.VOLUNTEERS.length)];
    updateCase(db, caseId, { volunteer: { name: v.name, role: v.role, area: v.area, bot: true } });
    addMessage(db, caseId, 'system', null, `${v.name} (${v.role}, ${v.area}) has picked up your case.`);
    notifyCase(hub, row, 'assigned');
  }

  function reply(caseId) {
    const row = getCaseRow(db, caseId);
    const v = row && volunteerOf(row);
    if (!row || row.status !== 'waiting' || !v || !v.bot) return;
    const { body, verdict } = replyFor(row);
    addMessage(db, caseId, 'vol', `${v.name} · ${v.role}`, body);
    updateCase(db, caseId, { status: 'replied', verdict });
    notifyCase(hub, row, 'reply', { by: v.name });
  }

  function followUp(caseId) {
    const row = getCaseRow(db, caseId);
    const v = row && volunteerOf(row);
    if (!row || row.status !== 'replied' || !v || !v.bot) return;
    addMessage(db, caseId, 'vol', `${v.name} · ${v.role}`,
      'Thanks for the extra info! My advice stays the same — don’t share OTPs or send money. If you’re still unsure, call the ScamShield Helpline at 1799 and they can check with you.');
    notifyCase(hub, row, 'reply', { by: v.name });
  }

  /* A volunteer near the resident steps in when their Circle hasn't. */
  function pickUpPause(pauseId) {
    const row = getPauseRow(db, pauseId);
    if (!row || row.status !== 'open' || row.responder) return;
    const v = KW.VOLUNTEERS.find(x => x.area === row.town) || KW.VOLUNTEERS[0];
    if (!claimPause(db, row, { name: v.name, kind: 'volunteer', detail: `${v.role}, ${v.area}`, bot: true })) return;
    addPauseMessage(db, pauseId, 'system', null, `${v.name} (${v.role}, ${v.area}) is on it and will call you now.`);
    addPauseMessage(db, pauseId, 'vol', `${v.name} · ${v.role}`,
      'Hello, I’m a volunteer from your neighbourhood. Please don’t transfer any money or share any codes. It’s OK to hang up on them. Real officers and banks will never mind. I’m calling you now.');
    notifyPause(db, hub, row, 'responding', { by: v.name });
  }

  return {
    enabled,
    onPauseEscalated(pauseId) {
      if (enabled) later(PAUSE_PICKUP_AFTER_MS, () => pickUpPause(pauseId));
    },
    onCaseCreated(caseId) {
      if (!enabled) return;
      later(ASSIGN_AFTER_MS, () => assign(caseId));
      later(REPLY_AFTER_MS, () => reply(caseId));
    },
    onResidentMessage(caseId) {
      if (enabled) later(FOLLOW_UP_AFTER_MS, () => followUp(caseId));
    },
    stop() {
      timers.forEach(clearTimeout);
      timers.clear();
    }
  };
}
