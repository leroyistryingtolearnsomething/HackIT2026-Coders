/* Scam Drills: family send a safe practice scam to someone in their Circle, and
   volunteers turn a newly verified Scam Radar wave into a drill for a whole town. */
import { Router } from 'express';
import { requireClient, requireVolunteer } from '../auth.js';
import { transaction } from '../db.js';
import { KW, TOWNS } from '../shared.js';
import { oneOf, notFound, badRequest, HttpError, newId, nowIso } from '../http.js';
import { getCircle, membership, circleAudience } from '../models/circles.js';
import {
  drillTemplate, templateForType, getDrillRow, serializeDrill, suggestDrill, drillStats, hasPendingDrill
} from '../models/drills.js';

const RESULTS = ['paused', 'ignored', 'clicked'];

export default function drillsRouter({ db, hub }) {
  const r = Router();
  r.use(requireClient);

  const insert = db.prepare(`INSERT INTO drills
    (id, template, target_client, circle_id, town, sender_client, sender_name, sender_kind, report_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  const announce = (row, kind) => hub.send('drill', { id: row.id, kind }, c => c.clientId === row.target_client);

  r.get('/templates', (req, res) => res.json(KW.DRILLS));

  /* "This week's drill" for a town: its newest verified scam wave. */
  r.get('/suggest', (req, res) => res.json(suggestDrill(db, oneOf(req.query.town, TOWNS, 'town'))));

  r.get('/stats', (req, res) => {
    const town = TOWNS.includes(req.query.town) ? req.query.town : null;
    const byTown = db.prepare('SELECT DISTINCT town FROM drills ORDER BY town').all()
      .map(({ town: t }) => ({ town: t, ...drillStats(db, t) }));
    res.json({ overall: drillStats(db, town), byTown });
  });

  /* Practice messages waiting for this resident. */
  r.get('/pending', (req, res) => {
    const rows = db.prepare('SELECT * FROM drills WHERE target_client = ? AND result IS NULL ORDER BY created_at DESC').all(req.clientId);
    res.json(rows.map(row => serializeDrill(row, req)));
  });

  /* A Circle member sends a drill to the person they look after. */
  r.post('/', (req, res) => {
    const b = req.body || {};
    const circle = getCircle(db, String(b.circleId || ''));
    const me = circle && membership(db, circle.id, req.clientId);
    if (!me) throw notFound('Circle not found');
    const template = b.template ? drillTemplate(b.template) : templateForType(suggestDrill(db, circle.town).report?.type);
    if (!template) throw badRequest('Unknown drill');
    if (hasPendingDrill(db, circle.owner_client)) {
      throw new HttpError(409, `${circle.owner_name} hasn’t answered the last practice message yet.`);
    }
    const id = newId('d');
    insert.run(id, template.id, circle.owner_client, circle.id, circle.town, req.clientId, me.name, 'circle', null, nowIso());
    const row = getDrillRow(db, id);
    announce(row, 'new');
    res.status(201).json(serializeDrill(row, req));
  });

  /* Volunteers send a drill to every Circle in a town, usually from a verified Radar report. */
  r.post('/estate', requireVolunteer, (req, res) => {
    const b = req.body || {};
    let town, template, reportId = null;
    if (b.reportId) {
      const report = db.prepare('SELECT id, town, type, status FROM reports WHERE id = ?').get(String(b.reportId));
      if (!report) throw notFound('Report not found');
      if (report.status !== 'verified') throw badRequest('Verify the report before turning it into a drill');
      ({ town } = report);
      template = templateForType(report.type);
      reportId = report.id;
    } else {
      town = oneOf(b.town, TOWNS, 'town');
      template = drillTemplate(b.template) || templateForType(suggestDrill(db, town).report?.type);
    }
    const targets = db.prepare('SELECT * FROM circles WHERE town = ?').all(town)
      .filter(c => !hasPendingDrill(db, c.owner_client));
    const sender = `${req.volunteer.name} · ${req.volunteer.role}`;
    const now = nowIso();
    const rows = transaction(db, () => targets.map(c => {
      const id = newId('d');
      insert.run(id, template.id, c.owner_client, c.id, town, null, sender, 'volunteer', reportId, now);
      return getDrillRow(db, id);
    }));
    rows.forEach(row => announce(row, 'new'));
    res.status(201).json({ town, template: template.id, sent: rows.length });
  });

  /* The resident's answer: pressed Pause, deleted it, or tapped the link. */
  r.post('/:id/result', (req, res) => {
    const row = getDrillRow(db, req.params.id);
    if (!row || row.target_client !== req.clientId) throw notFound('Drill not found');
    if (row.result) throw badRequest('You’ve already answered this one');
    const result = oneOf(req.body?.result, RESULTS, 'result');
    db.prepare('UPDATE drills SET result = ?, answered_at = ? WHERE id = ?').run(result, nowIso(), row.id);
    const done = getDrillRow(db, row.id);
    // Tell the whole Circle how it went, and whoever sent it.
    const audience = row.circle_id ? circleAudience(db, row.circle_id) : new Set();
    if (row.sender_client) audience.add(row.sender_client);
    const circle = row.circle_id && getCircle(db, row.circle_id);
    hub.send('drill', { id: row.id, kind: 'result', result, name: circle ? circle.owner_name : null },
      c => audience.has(c.clientId) && c.clientId !== row.target_client);
    res.json(serializeDrill(done, req));
  });

  return r;
}

