const SELECT = `
  SELECT r.*,
    (SELECT COUNT(*) FROM report_confirms c WHERE c.report_id = r.id) AS confirms,
    EXISTS (SELECT 1 FROM report_confirms c WHERE c.report_id = r.id AND c.client_id = ?) AS mine
  FROM reports r`;

export function serializeReport(row) {
  return {
    id: row.id,
    town: row.town,
    type: row.type,
    channel: row.channel,
    title: row.title,
    desc: row.description,
    image: row.image,
    status: row.status,
    verifiedBy: row.verified_by,
    count: row.base_count + row.confirms,
    mine: !!row.mine,
    created: row.created_at
  };
}

export function listReports(db, clientId, { town, type, status, days, limit = 200 } = {}) {
  const where = [];
  const params = [clientId];
  if (town) { where.push('r.town = ?'); params.push(town); }
  if (type) { where.push('r.type = ?'); params.push(type); }
  if (status) { where.push('r.status = ?'); params.push(status); }
  if (days) { where.push('r.created_at >= ?'); params.push(new Date(Date.now() - days * 86400e3).toISOString()); }
  params.push(limit);
  const sql = `${SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY r.created_at DESC LIMIT ?`;
  return db.prepare(sql).all(...params).map(serializeReport);
}

export function getReport(db, id, clientId) {
  const row = db.prepare(`${SELECT} WHERE r.id = ?`).get(clientId, id);
  return row ? serializeReport(row) : null;
}
