/* Loads js/data.js (the frontend's reference data) so the server uses the same
   towns, scam types, red-flag rules and seed content as the browser. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { WEB_ROOT } from './config.js';

const sandbox = {};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(WEB_ROOT, 'js', 'data.js'), 'utf8'), sandbox, { filename: 'js/data.js' });

export const KW = sandbox.KW;
export const TOWNS = Object.keys(KW.TOWNS);
export const FLAIR_IDS = KW.FLAIRS.map(f => f.id);

export function analyse(text) {
  const flags = KW.FLAG_RULES.filter(r => r.re.test(text));
  const level = flags.length >= 3 ? 'high' : flags.length >= 1 ? 'medium' : 'low';
  return { flags: flags.map(f => f.id), level };
}

/* Hide personal details before anything is shown publicly. */
export function maskPersonal(text) {
  return String(text || '')
    .replace(/\b[689]\d{3}[ -]?\d{4}\b/g, '[phone hidden]')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email hidden]')
    .replace(/\b[STFGM]\d{7}[A-Z]\b/gi, '[NRIC hidden]');
}

export function defaultPoll(flair) {
  if (flair === 'ask') return { options: [{ label: 'Scam', votes: 0 }, { label: 'Looks legit', votes: 0 }, { label: 'Not sure', votes: 0 }] };
  if (flair === 'debate') return { options: [{ label: 'Agree', votes: 0 }, { label: 'Disagree', votes: 0 }, { label: 'It depends', votes: 0 }] };
  return null;
}
