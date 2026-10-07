import { Router } from 'express';
import { requireClient, requireVolunteer, handleFor } from '../auth.js';
import { FLAIR_IDS, maskPersonal, defaultPoll } from '../shared.js';
import { text, oneOf, notFound, badRequest, newId, nowIso, voteValue } from '../http.js';
import { listPosts, getPost, createPost } from '../models/posts.js';

const author = req => (req.volunteer
  ? { author: req.volunteer.name, authorRole: 'Volunteer' }
  : { author: handleFor(req.clientId), authorRole: null });

export function postsRouter({ db, hub, images }) {
  const r = Router();

  const load = (req, id = req.params.id, opts = { withComments: true }) => {
    const post = getPost(db, id, req.clientId, opts);
    if (!post) throw notFound('Post not found');
    return post;
  };

  /* GET /api/posts?flair=&sort=hot|new|top&q=&limit= */
  r.get('/', (req, res) => {
    res.json(listPosts(db, req.clientId, {
      flair: FLAIR_IDS.includes(req.query.flair) ? req.query.flair : undefined,
      q: typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '',
      sort: req.query.sort,
      limit: Math.min(100, Number(req.query.limit) || 50)
    }));
  });

  r.get('/:id', (req, res) => res.json(load(req)));

  r.post('/', requireClient, (req, res) => {
    const b = req.body || {};
    const flair = oneOf(b.flair, FLAIR_IDS, 'flair');
    const id = createPost(db, {
      flair,
      ...author(req),
      authorClient: req.clientId,
      title: maskPersonal(text(b.title, 'title', { min: 1, max: 140 })),
      body: maskPersonal(text(b.body, 'body', { max: 5000 })),
      image: images.save(b.image),
      poll: defaultPoll(flair)
    });
    hub.send('post', { id, action: 'new' });
    res.status(201).json(load(req, id));
  });

  r.post('/:id/vote', requireClient, (req, res) => {
    const post = load(req, req.params.id, {});
    const value = voteValue(req.body?.value);
    if (value === 0) {
      db.prepare('DELETE FROM post_votes WHERE post_id = ? AND client_id = ?').run(post.id, req.clientId);
    } else {
      db.prepare(`INSERT INTO post_votes (post_id, client_id, value) VALUES (?, ?, ?)
        ON CONFLICT (post_id, client_id) DO UPDATE SET value = excluded.value`).run(post.id, req.clientId, value);
    }
    res.json(load(req, post.id, {}));
  });

  /* Vote in the post's poll; { option: null } removes your vote. */
  r.post('/:id/poll', requireClient, (req, res) => {
    const post = load(req, req.params.id, {});
    if (!post.poll) throw badRequest('This post has no poll');
    const option = req.body?.option;
    if (option === null || option === undefined) {
      db.prepare('DELETE FROM poll_votes WHERE post_id = ? AND client_id = ?').run(post.id, req.clientId);
    } else {
      const i = Number(option);
      if (!Number.isInteger(i) || i < 0 || i >= post.poll.options.length) throw badRequest('Invalid poll option');
      db.prepare(`INSERT INTO poll_votes (post_id, client_id, option) VALUES (?, ?, ?)
        ON CONFLICT (post_id, client_id) DO UPDATE SET option = excluded.option`).run(post.id, req.clientId, i);
    }
    res.json(load(req, post.id, {}));
  });

  r.post('/:id/comments', requireClient, (req, res) => {
    const post = load(req, req.params.id, {});
    const body = maskPersonal(text(req.body?.body, 'body', { min: 1, max: 3000 }));
    const parentId = req.body?.parentId || null;
    if (parentId && !db.prepare('SELECT 1 FROM comments WHERE id = ? AND post_id = ?').get(parentId, post.id)) {
      throw badRequest('The comment you are replying to was not found');
    }
    const id = newId('c');
    const a = author(req);
    db.prepare(`INSERT INTO comments (id, post_id, parent_id, author, author_role, author_client, body, base_votes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`).run(id, post.id, parentId, a.author, a.authorRole, req.clientId, body, nowIso());
    db.prepare('INSERT INTO comment_votes (comment_id, client_id, value) VALUES (?, ?, 1)').run(id, req.clientId);
    hub.send('post', { id: post.id, action: 'comment' });
    res.status(201).json(load(req, post.id));
  });

  /* Volunteers can mark "Is this a scam?" posts with an official verdict. */
  r.post('/:id/verdict', requireVolunteer, (req, res) => {
    const post = load(req, req.params.id, {});
    const result = req.body?.result ?? null;
    if (result !== null) oneOf(result, ['scam', 'legit'], 'result');
    db.prepare('UPDATE posts SET verdict = ? WHERE id = ?')
      .run(result ? JSON.stringify({ result, by: `${req.volunteer.name} · ${req.volunteer.role}` }) : null, post.id);
    hub.send('post', { id: post.id, action: 'verdict' });
    res.json(load(req, post.id));
  });

  return r;
}

export function commentsRouter({ db }) {
  const r = Router();

  r.post('/:id/vote', requireClient, (req, res) => {
    const comment = db.prepare('SELECT id, post_id FROM comments WHERE id = ?').get(req.params.id);
    if (!comment) throw notFound('Comment not found');
    const value = voteValue(req.body?.value);
    if (value === 0) {
      db.prepare('DELETE FROM comment_votes WHERE comment_id = ? AND client_id = ?').run(comment.id, req.clientId);
    } else {
      db.prepare(`INSERT INTO comment_votes (comment_id, client_id, value) VALUES (?, ?, ?)
        ON CONFLICT (comment_id, client_id) DO UPDATE SET value = excluded.value`).run(comment.id, req.clientId, value);
    }
    res.json(getPost(db, comment.post_id, req.clientId, { withComments: true }));
  });

  return r;
}
