/* Scam Drills: safe practice scams that build the habit of pressing Pause. */
import { KW } from '../shared.js';

export const drillTemplate = id => KW.DRILLS.find(d => d.id === id);

/* The drill that matches a Scam Radar report type, so a verified wave can become a drill. */
export const templateForType = type => KW.DRILLS.find(d => d.types.includes(type)) || KW.DRILLS[0];

export function getDrillRow(db, id) {
  return db.prepare('SELECT * FROM drills WHERE id = ?').get(id);
}

export function serializeDrill(row, viewer) {
  const t = drillTemplate(row.template) || KW.DRILLS[0];
  const isTarget = row.target_client === viewer.clientId;
  return {
    id: row.id,
    created: row.created_at,
    town: row.town,
    message: { channel: t.channel, from: t.from, text: t.text, link: t.link },
    template: t.id,
    name: t.name,
    lesson: t.lesson,
    // The resident only learns who sent the practice scam after they've answered it.
    sender: isTarget && !row.result ? null : { name: row.sender_name, kind: row.sender_kind },
    reportId: row.report_id,
    result: row.result,
    passed: row.result ? row.result !== 'clicked' : null,
    answered: row.answered_at
  };
}

/* The newest verified scam wave in a town, and the drill that matches it. */
export function suggestDrill(db, town) {
  const since = new Date(Date.now() - 14 * 86400e3).toISOString();
  const report = db.prepare(`SELECT id, title, type, created_at FROM reports
    WHERE town = ? AND status = 'verified' AND created_at >= ? ORDER BY created_at DESC LIMIT 1`).get(town, since);
  const template = report ? templateForType(report.type) : KW.DRILLS[0];
  return {
    town,
    report: report && { id: report.id, title: report.title, type: report.type, created: report.created_at },
    template: { id: template.id, name: template.name, channel: template.channel, from: template.from, text: template.text }
  };
}

export function drillStats(db, town) {
  const where = town ? 'WHERE town = ?' : '';
  const row = db.prepare(`SELECT COUNT(*) AS sent,
      COALESCE(SUM(result IS NOT NULL), 0) AS answered,
      COALESCE(SUM(result = 'paused'), 0) AS paused,
      COALESCE(SUM(result = 'ignored'), 0) AS ignored,
      COALESCE(SUM(result = 'clicked'), 0) AS clicked
    FROM drills ${where}`).get(...(town ? [town] : []));
  const passed = row.paused + row.ignored;
  return { ...row, passed, passRate: row.answered ? Math.round(passed / row.answered * 100) : null };
}

/* Only one unanswered drill per resident at a time. */
export function hasPendingDrill(db, clientId) {
  return !!db.prepare('SELECT 1 FROM drills WHERE target_client = ? AND result IS NULL').get(clientId);
}
