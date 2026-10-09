/* Lists every piece of interface text and checks it has a translation in js/i18n.js.
   Run from the project root:
     node server/scripts/check-translations.js          (summary + anything missing)
     node server/scripts/check-translations.js --keys   (print every English key)
   Exits with code 1 if anything is missing, so it can run in CI. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { WEB_ROOT } from '../src/config.js';

const read = f => fs.readFileSync(path.join(WEB_ROOT, f), 'utf8');
const sandbox = {};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(read('js/data.js'), sandbox);
vm.runInContext(read('js/i18n.js'), sandbox);
const KW = sandbox.KW;

const keys = new Set();
const add = s => { if (typeof s === 'string' && s.trim()) keys.add(s); };

/* 1. Every string literal handed to t(), tx() or th() in app.js, including both sides of
      a ternary such as t(n === 1 ? '{n} reply' : '{n} replies'). */
const app = read('js/app.js');
const lit = String.raw`'((?:[^'\\]|\\.)*)'`;
const unquote = s => s.replace(/\\(.)/g, '$1');
for (const m of app.matchAll(new RegExp(String.raw`\b(?:t|tx|th)\(\s*` + lit, 'g'))) add(unquote(m[1]));
for (const m of app.matchAll(new RegExp(String.raw`\b(?:t|tx|th)\((?:[^()\n]|\([^()\n]*\))*?\?\s*` + lit + String.raw`\s*:\s*` + lit, 'g'))) {
  add(unquote(m[1])); add(unquote(m[2]));
}

/* 2. Fixed lists in app.js that are translated where they're shown, e.g. tx(OUTCOMES[x][0]). */
const listBlock = name => {
  const i = app.indexOf(`const ${name} = {`);
  const block = app.slice(i, app.indexOf('};', i));
  for (const m of block.matchAll(new RegExp(String.raw`\[\s*` + lit, 'g'))) add(unquote(m[1]));
  for (const m of block.matchAll(new RegExp(String.raw`:\s*` + lit, 'g'))) add(unquote(m[1]));
};
['OUTCOMES', 'DRILL_RESULTS', 'VERDICTS', 'COURSE_TAG', 'TYPE_PHRASE'].forEach(listBlock);
for (const m of app.matchAll(/const verdict = \{([^}]*)\}/g)) {
  for (const v of m[1].matchAll(new RegExp(lit, 'g'))) add(unquote(v[1]));
}
// Labels passed through helper functions: filter('all', 'All courses'), stat(n, 'Pauses pressed'), sort tabs, levels.
for (const m of app.matchAll(new RegExp(String.raw`\b(?:filter|topic|stat)\([^,()]+,\s*` + lit, 'g'))) add(unquote(m[1]));
for (const m of app.matchAll(new RegExp(String.raw`\bstat\(.*,\s*` + lit + String.raw`\)`, 'g'))) add(unquote(m[1]));
for (const m of app.matchAll(new RegExp(String.raw`\['(?:hot|new|top|all)',\s*` + lit + String.raw`\]`, 'g'))) add(unquote(m[1]));
const langs = app.match(/const CALLBACK_LANGS = \[([^\]]*)\]/);
if (langs) for (const m of langs[1].matchAll(new RegExp(lit, 'g'))) add(unquote(m[1]));

/* 3. Data shown to people from js/data.js. */
Object.keys(KW.TOWNS).forEach(add);
KW.FLAIRS.forEach(f => add(f.label));
KW.SCAM_TYPES.forEach(add);
KW.CHANNELS.forEach(add);
KW.PAUSE_SIGNS.forEach(s => add(s.label));
KW.PAUSE_CALLERS.forEach(add);
KW.RELATIONS.forEach(add);
KW.HELPLINES.forEach(h => { add(h.label); add(h.note); });
KW.FLAG_RULES.forEach(r => { add(r.label); add(r.tip); });
KW.DRILLS.forEach(d => { add(d.name); add(d.text); add(d.from); add(d.channel); d.lesson.forEach(add); });
KW.COURSES.forEach(c => { add(c.title); add(c.blurb); add(c.level); });
KW.VOLUNTEERS.forEach(v => add(v.role));
// Roles volunteers sign in with (server/src/routes/misc.js), and fixed roles/poll answers from the server.
['Digital Ambassador', 'RC Volunteer', 'Student Volunteer', 'CC Scam-Buster', 'Volunteer',
  'Scam', 'Looks legit', 'Not sure', 'Agree', 'Disagree', 'It depends'].forEach(add);

/* 4. Fixed text in index.html (data-t="…"). */
for (const m of read('index.html').matchAll(/data-t="([^"]+)"/g)) add(m[1].replace(/&amp;/g, '&'));

// Brand and place names stay as they are.
// 'English text' only appears in a code comment.
['English text', 'Kampung Watch', 'SG-Parcel', 'SG-BankAlert', '+65 9xxx 2093', ', '].forEach(k => keys.delete(k));

const all = [...keys].sort((a, b) => a.localeCompare(b));
if (process.argv.includes('--keys')) {
  console.log(JSON.stringify(all, null, 1));
  process.exit(0);
}
let missing = 0;
for (const lang of ['zh', 'ms', 'ta']) {
  const dict = (KW.I18N && KW.I18N[lang]) || {};
  const gaps = all.filter(k => !(k in dict));
  missing += gaps.length;
  console.log(`${lang}: ${all.length - gaps.length} of ${all.length} translated`);
  gaps.slice(0, 15).forEach(k => console.log('   missing: ' + k));
  if (gaps.length > 15) console.log(`   …and ${gaps.length - 15} more`);
}
process.exit(missing ? 1 : 0);
