import { Router } from 'express';
import { requireClient, requireVolunteer, handleFor } from '../auth.js';
import { transaction } from '../db.js';
import { KW, TOWNS, maskPersonal } from '../shared.js';
import { text, oneOf, notFound, newId, nowIso } from '../http.js';
import { listReports, getReport } from '../models/reports.js';
import { createPost } from '../models/posts.js';

export default function reportsRouter({ db, hub, images }) {
  const r = Router();

  const load = (req, id = req.params.id) => {
    const report = getReport(db, id, req.clientId);
    if (!report) throw notFound('Report not found');
    return report;
  };

  const announce = (id, action) => hub.send('report', { id, action });

  /* GET /api/reports?town=&type=&status=&days=&limit= */
  r.get('/', (req, res) => {
    const { town, type, status } = req.query;
    res.json(listReports(db, req.clientId, {
      town: TOWNS.includes(town) ? town : undefined,
      type: KW.SCAM_TYPES.includes(type) ? type : undefined,
      status: ['pending', 'verified', 'rumour'].includes(status) ? status : undefined,
      days: Math.max(0, Number(req.query.days) || 0),
      limit: Math.min(500, Number(req.query.limit) || 200)
    }));
  });

  r.get('/:id', (req, res) => res.json(load(req)));

  /* Residents report a scam. It stays "pending" until a volunteer verifies it. */
  r.post('/', requireClient, (req, res) => {
    const b = req.body || {};
    const id = newId('r');
    const fields = {
      town: oneOf(b.town, TOWNS, 'town'),
      type: oneOf(b.type, KW.SCAM_TYPES, 'type'),
      channel: oneOf(b.channel, KW.CHANNELS, 'channel'),
      title: maskPersonal(text(b.title, 'title', { min: 1, max: 120 })),
      desc: maskPersonal(text(b.desc, 'desc', { max: 2000 })),
      image: images.save(b.image)
    };
    transaction(db, () => {
      db.prepare(`
        INSERT INTO reports (id, town, type, channel, title, description, image, status, base_count, reporter, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?)`)
        .run(id, fields.town, fields.type, fields.channel, fields.title, fields.desc, fields.image, req.clientId, nowIso());
      db.prepare('INSERT INTO report_confirms (report_id, client_id) VALUES (?, ?)').run(id, req.clientId);
    });
    announce(id, 'new');
    res.status(201).json(load(req, id));
  });

  /* "I got this too" — toggles this resident's confirmation. */
  r.post('/:id/confirm', requireClient, (req, res) => {
    const report = load(req);
    if (report.mine) {
      db.prepare('DELETE FROM report_confirms WHERE report_id = ? AND client_id = ?').run(report.id, req.clientId);
    } else {
      db.prepare('INSERT INTO report_confirms (report_id, client_id) VALUES (?, ?)').run(report.id, req.clientId);
    }
    announce(report.id, 'updated');
    res.json(load(req));
  });

  r.post('/:id/verify', requireVolunteer, (req, res) => {
    const report = load(req);
    db.prepare("UPDATE reports SET status = 'verified', verified_by = ? WHERE id = ?")
      .run(`${report.town} CC · ${req.volunteer.name}`, report.id);
    // 'verified' triggers area alerts for residents subscribed to this town.
    announce(report.id, 'verified');
    res.json(load(req));
  });

  r.post('/:id/dismiss', requireVolunteer, (req, res) => {
    const report = load(req);
    db.prepare("UPDATE reports SET status = 'rumour', verified_by = ? WHERE id = ?")
      .run(`${report.town} CC · ${req.volunteer.name}`, report.id);
    announce(report.id, 'updated');
    res.json(load(req));
  });

  /* Open (or create) the community discussion thread for a report. */
  r.post('/:id/discuss', requireClient, (req, res) => {
    const report = load(req);
    const existing = db.prepare('SELECT id FROM posts WHERE report_id = ?').get(report.id);
    if (existing) return res.json({ postId: existing.id });
    const postId = createPost(db, {
      flair: 'alert',
      author: req.volunteer ? req.volunteer.name : handleFor(req.clientId),
      authorRole: req.volunteer ? 'Volunteer' : null,
      authorClient: req.clientId,
      title: `${report.title} (${report.town})`,
      body: report.desc,
      image: report.image,
      reportId: report.id
    });
    hub.send('post', { id: postId, action: 'new' });
    res.status(201).json({ postId });
  });

  return r;
}
