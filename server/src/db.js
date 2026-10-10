/* SQLite storage (built into Node 22.13+ as node:sqlite). */
import { DatabaseSync } from 'node:sqlite';
import { KW } from './shared.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS reports (
  id           TEXT PRIMARY KEY,
  town         TEXT NOT NULL,
  type         TEXT NOT NULL,
  channel      TEXT NOT NULL,
  title        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  image        TEXT,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rumour')),
  verified_by  TEXT,
  base_count   INTEGER NOT NULL DEFAULT 0,
  reporter     TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reports_created ON reports (created_at);

CREATE TABLE IF NOT EXISTS report_confirms (
  report_id  TEXT NOT NULL REFERENCES reports (id) ON DELETE CASCADE,
  client_id  TEXT NOT NULL,
  PRIMARY KEY (report_id, client_id)
);

CREATE TABLE IF NOT EXISTS posts (
  id           TEXT PRIMARY KEY,
  flair        TEXT NOT NULL,
  author       TEXT NOT NULL,
  author_role  TEXT,
  author_client TEXT,
  title        TEXT NOT NULL,
  body         TEXT NOT NULL DEFAULT '',
  image        TEXT,
  base_votes   INTEGER NOT NULL DEFAULT 0,
  poll         TEXT,              -- JSON: { options: [{ label, votes }] }
  verdict      TEXT,              -- JSON: { result: 'scam' | 'legit', by }
  report_id    TEXT,
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS post_votes (
  post_id    TEXT NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  client_id  TEXT NOT NULL,
  value      INTEGER NOT NULL CHECK (value IN (-1, 1)),
  PRIMARY KEY (post_id, client_id)
);

CREATE TABLE IF NOT EXISTS poll_votes (
  post_id    TEXT NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  client_id  TEXT NOT NULL,
  option     INTEGER NOT NULL,
  PRIMARY KEY (post_id, client_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id           TEXT PRIMARY KEY,
  post_id      TEXT NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  parent_id    TEXT REFERENCES comments (id) ON DELETE CASCADE,
  author       TEXT NOT NULL,
  author_role  TEXT,
  author_client TEXT,
  body         TEXT NOT NULL,
  base_votes   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments (post_id);

CREATE TABLE IF NOT EXISTS comment_votes (
  comment_id TEXT NOT NULL REFERENCES comments (id) ON DELETE CASCADE,
  client_id  TEXT NOT NULL,
  value      INTEGER NOT NULL CHECK (value IN (-1, 1)),
  PRIMARY KEY (comment_id, client_id)
);

CREATE TABLE IF NOT EXISTS cases (
  id           TEXT PRIMARY KEY,
  client_id    TEXT NOT NULL,
  channel      TEXT NOT NULL,
  text         TEXT NOT NULL DEFAULT '',
  image        TEXT,
  flags        TEXT NOT NULL DEFAULT '[]',   -- JSON array of red-flag ids
  level        TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'replied', 'resolved')),
  verdict      TEXT CHECK (verdict IN ('scam', 'suspicious', 'safe')),
  volunteer    TEXT,                         -- JSON: { name, role, area, bot? }
  callback     TEXT,                         -- JSON: { name, phone, lang }
  shared_post  TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cases_client ON cases (client_id);

CREATE TABLE IF NOT EXISTS case_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id    TEXT NOT NULL REFERENCES cases (id) ON DELETE CASCADE,
  sender     TEXT NOT NULL CHECK (sender IN ('resident', 'vol', 'system')),
  name       TEXT,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_case ON case_messages (case_id);

-- Kampung Circle: the family and neighbours a resident wants alerted when they press Pause.
CREATE TABLE IF NOT EXISTS circles (
  id           TEXT PRIMARY KEY,
  owner_client TEXT NOT NULL UNIQUE,
  owner_name   TEXT NOT NULL,
  town         TEXT NOT NULL,
  invite_code  TEXT NOT NULL UNIQUE,
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS circle_members (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  circle_id  TEXT NOT NULL REFERENCES circles (id) ON DELETE CASCADE,
  client_id  TEXT NOT NULL,
  name       TEXT NOT NULL,
  relation   TEXT NOT NULL,
  joined_at  TEXT NOT NULL,
  UNIQUE (circle_id, client_id)
);
CREATE INDEX IF NOT EXISTS idx_members_client ON circle_members (client_id);

-- Pause: "someone is pressuring me right now". Goes to the Circle first, then volunteers.
CREATE TABLE IF NOT EXISTS pauses (
  id           TEXT PRIMARY KEY,
  client_id    TEXT NOT NULL,
  circle_id    TEXT REFERENCES circles (id) ON DELETE SET NULL,
  name         TEXT NOT NULL,
  town         TEXT,
  signs        TEXT NOT NULL DEFAULT '[]',  -- JSON array of KW.PAUSE_SIGNS ids
  caller       TEXT,
  note         TEXT NOT NULL DEFAULT '',
  stage        TEXT NOT NULL CHECK (stage IN ('circle', 'volunteer')),
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  outcome      TEXT CHECK (outcome IN ('stopped', 'safe', 'lost')),
  responder    TEXT,                         -- JSON: { name, kind: 'circle' | 'volunteer', detail, bot? }
  created_at   TEXT NOT NULL,
  escalated_at TEXT,
  responded_at TEXT,
  resolved_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_pauses_client ON pauses (client_id);

CREATE TABLE IF NOT EXISTS pause_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  pause_id   TEXT NOT NULL REFERENCES pauses (id) ON DELETE CASCADE,
  sender     TEXT NOT NULL CHECK (sender IN ('resident', 'circle', 'vol', 'system')),
  name       TEXT,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pause_messages ON pause_messages (pause_id);

-- Scam Drills: practice scams sent by a Circle member or to a whole town by volunteers.
CREATE TABLE IF NOT EXISTS drills (
  id            TEXT PRIMARY KEY,
  template      TEXT NOT NULL,
  target_client TEXT NOT NULL,
  circle_id     TEXT REFERENCES circles (id) ON DELETE CASCADE,
  town          TEXT NOT NULL,
  sender_client TEXT,
  sender_name   TEXT NOT NULL,
  sender_kind   TEXT NOT NULL CHECK (sender_kind IN ('circle', 'volunteer')),
  report_id     TEXT,
  result        TEXT CHECK (result IN ('paused', 'ignored', 'clicked')),
  created_at    TEXT NOT NULL,
  answered_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_drills_target ON drills (target_client);

-- Emergency links: a private link that can only press Pause for one resident
-- (for an iPhone Back Tap or Siri shortcut). Only a hash of the token is stored.
CREATE TABLE IF NOT EXISTS pause_links (
  token_hash TEXT PRIMARY KEY,
  client_id  TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

-- Courses a resident has passed. The server marks the quiz; volunteers need the Intermediate ones.
CREATE TABLE IF NOT EXISTS course_passes (
  client_id  TEXT NOT NULL,
  course_id  TEXT NOT NULL,
  score      INTEGER NOT NULL,
  passed_at  TEXT NOT NULL,
  PRIMARY KEY (client_id, course_id)
);

-- Who a volunteer really is. In this prototype it's a demo stand-in for Singpass (method 'singpass-demo').
CREATE TABLE IF NOT EXISTS identity_checks (
  client_id   TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  method      TEXT NOT NULL,
  verified_at TEXT NOT NULL
);

-- AI translations of what residents write, so each text is only translated once per language.
CREATE TABLE IF NOT EXISTS translations (
  lang       TEXT NOT NULL,
  source     TEXT NOT NULL,
  text       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (lang, source)
);

CREATE TABLE IF NOT EXISTS volunteer_sessions (
  token_hash TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  role       TEXT NOT NULL,
  area       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
`;

export function openDb(file) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  if (!db.prepare('SELECT 1 FROM reports LIMIT 1').get()) seed(db);
  return db;
}

export function transaction(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/* Fill an empty database with the same demo content the prototype shipped with. */
function seed(db) {
  const data = KW.seed();
  const insertReport = db.prepare(`
    INSERT INTO reports (id, town, type, channel, title, description, image, status, verified_by, base_count, created_at)
    VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`);
  const insertPost = db.prepare(`
    INSERT INTO posts (id, flair, author, title, body, image, base_votes, poll, verdict, created_at)
    VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`);
  const insertComment = db.prepare(`
    INSERT INTO comments (id, post_id, parent_id, author, author_role, body, base_votes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);

  const addComments = (postId, parentId, list) => {
    for (const c of list) {
      insertComment.run(c.id, postId, parentId, c.author, c.role || null, c.body, c.votes, c.created);
      addComments(postId, c.id, c.replies || []);
    }
  };

  transaction(db, () => {
    for (const r of data.reports) {
      insertReport.run(r.id, r.town, r.type, r.channel, r.title, r.desc, r.status, r.verifiedBy, r.count, r.created);
    }
    for (const p of data.posts) {
      insertPost.run(p.id, p.flair, p.author, p.title, p.body, p.votes,
        p.poll ? JSON.stringify(p.poll) : null, p.verdict ? JSON.stringify(p.verdict) : null, p.created);
      addComments(p.id, null, p.comments);
    }
  });
}
