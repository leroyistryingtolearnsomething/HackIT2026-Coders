import { newId, nowIso, likePattern } from '../http.js';

const SELECT = `
  SELECT p.*,
    p.base_votes + COALESCE((SELECT SUM(value) FROM post_votes v WHERE v.post_id = p.id), 0) AS score,
    (SELECT value FROM post_votes v WHERE v.post_id = p.id AND v.client_id = ?) AS my_vote,
    (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count
  FROM posts p`;

function pollFor(db, row, clientId) {
  if (!row.poll) return null;
  const poll = JSON.parse(row.poll);
  const counts = new Map(db.prepare('SELECT option, COUNT(*) AS n FROM poll_votes WHERE post_id = ? GROUP BY option')
    .all(row.id).map(r => [r.option, r.n]));
  const mine = db.prepare('SELECT option FROM poll_votes WHERE post_id = ? AND client_id = ?').get(row.id, clientId);
  return {
    options: poll.options.map((o, i) => ({ label: o.label, votes: o.votes + (counts.get(i) || 0) })),
    myChoice: mine ? mine.option : null
  };
}

function serializePost(db, row, clientId) {
  return {
    id: row.id,
    flair: row.flair,
    author: row.author,
    authorRole: row.author_role,
    title: row.title,
    body: row.body,
    image: row.image,
    created: row.created_at,
    score: row.score,
    myVote: row.my_vote || 0,
    commentCount: row.comment_count,
    poll: pollFor(db, row, clientId),
    verdict: row.verdict ? JSON.parse(row.verdict) : null,
    reportId: row.report_id
  };
}

const hotRank = p => (p.score + 1) / Math.pow((Date.now() - new Date(p.created)) / 3600e3 + 2, 1.4);

const SORTS = {
  hot: (a, b) => hotRank(b) - hotRank(a),
  new: (a, b) => new Date(b.created) - new Date(a.created),
  top: (a, b) => b.score - a.score
};

export function listPosts(db, clientId, { flair, q, sort = 'hot', limit = 50 } = {}) {
  const where = [];
  const params = [clientId];
  if (flair) { where.push('p.flair = ?'); params.push(flair); }
  if (q) {
    where.push("(p.title LIKE ? ESCAPE '\\' OR p.body LIKE ? ESCAPE '\\')");
    params.push(likePattern(q), likePattern(q));
  }
  const sql = `${SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`;
  return db.prepare(sql).all(...params)
    .map(row => serializePost(db, row, clientId))
    .sort(SORTS[sort] || SORTS.hot)
    .slice(0, limit);
}

export function getPost(db, id, clientId, { withComments = false } = {}) {
  const row = db.prepare(`${SELECT} WHERE p.id = ?`).get(clientId, id);
  if (!row) return null;
  const post = serializePost(db, row, clientId);
  if (withComments) post.comments = commentTree(db, id, clientId);
  return post;
}

export function commentTree(db, postId, clientId) {
  const rows = db.prepare(`
    SELECT c.*,
      c.base_votes + COALESCE((SELECT SUM(value) FROM comment_votes v WHERE v.comment_id = c.id), 0) AS score,
      (SELECT value FROM comment_votes v WHERE v.comment_id = c.id AND v.client_id = ?) AS my_vote
    FROM comments c WHERE c.post_id = ? ORDER BY c.created_at`).all(clientId, postId);

  const byId = new Map(rows.map(r => [r.id, {
    id: r.id, author: r.author, role: r.author_role, body: r.body, created: r.created_at,
    score: r.score, myVote: r.my_vote || 0, parentId: r.parent_id, replies: []
  }]));
  const roots = [];
  for (const c of byId.values()) {
    const parent = c.parentId && byId.get(c.parentId);
    (parent ? parent.replies : roots).push(c);
  }
  return roots;
}

export function createPost(db, { flair, author, authorRole = null, authorClient = null, title, body, image = null, poll = null, reportId = null }) {
  const id = newId('p');
  db.prepare(`
    INSERT INTO posts (id, flair, author, author_role, author_client, title, body, image, base_votes, poll, report_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`)
    .run(id, flair, author, authorRole, authorClient, title, body, image, poll ? JSON.stringify(poll) : null, reportId, nowIso());
  if (authorClient) {
    // Authors upvote their own post, like Reddit.
    db.prepare('INSERT INTO post_votes (post_id, client_id, value) VALUES (?, ?, 1)').run(id, authorClient);
  }
  return id;
}
