import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/* Repo root — where index.html, css/ and js/ live. */
export const WEB_ROOT = path.resolve(here, '..', '..');

const KEY_VARS = { gemini: 'GEMINI_API_KEY', anthropic: 'ANTHROPIC_API_KEY' };
const DEFAULT_MODELS = { gemini: 'gemini-flash-latest', anthropic: 'claude-opus-5-5' };

/* AI_PROVIDER wins; otherwise use whichever key is set (Gemini first, as it has a free tier). */
function pickProvider() {
  const chosen = (process.env.AI_PROVIDER || '').trim().toLowerCase();
  if (KEY_VARS[chosen]) return chosen;
  if (process.env.GEMINI_API_KEY) return 'gemini';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  return null;
}

export function loadConfig(overrides = {}) {
  const aiProvider = pickProvider();
  const dataDir = path.resolve(process.env.DATA_DIR || path.join(here, '..', 'data'));
  return {
    port: Number(process.env.PORT) || 3000,
    dataDir,
    dbFile: path.join(dataDir, 'kampung.db'),
    uploadsDir: path.join(dataDir, 'uploads'),
    volunteerCode: process.env.VOLUNTEER_CODE || 'kampung2026',
    usingDefaultCode: !process.env.VOLUNTEER_CODE,
    autoReply: process.env.AUTO_REPLY !== 'false',
    // Pause: how long the resident's Circle has to answer before volunteers are alerted.
    pauseEscalateMs: (Number(process.env.PAUSE_ESCALATE_SECONDS) || 90) * 1000,
    sessionHours: 12,
    writeLimitPerMinute: 60,
    // AI assistant: on when the chosen provider's API key is set in server/.env.
    aiProvider,
    assistantEnabled: Boolean(aiProvider && process.env[KEY_VARS[aiProvider]]),
    assistantModel: process.env.ASSISTANT_MODEL || DEFAULT_MODELS[aiProvider] || null,
    assistantDailyLimit: Number(process.env.ASSISTANT_DAILY_LIMIT) || 500,
    assistantPerMinute: 8,
    ...overrides
  };
}
