import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { createAssistant } from './ai/index.js';
import { loadConfig, WEB_ROOT } from './config.js';
import { openDb } from './db.js';
import { createHub } from './events.js';
import { createImageStore } from './images.js';
import { createBot } from './bot.js';
import { identify, rateLimit } from './auth.js';
import { HttpError } from './http.js';
import miscRouter from './routes/misc.js';
import reportsRouter from './routes/reports.js';
import casesRouter from './routes/cases.js';
import { postsRouter, commentsRouter } from './routes/posts.js';
import assistantRouter from './routes/assistant.js';
import circlesRouter from './routes/circles.js';
import pausesRouter from './routes/pauses.js';
import drillsRouter from './routes/drills.js';
import pauseLinksRouter from './routes/pauseLinks.js';
import { createPauseWatch } from './models/pauses.js';

export function createApp(overrides = {}) {
  // Tests pass their own `assistant` provider (or null); otherwise it's built from server/.env.
  const { assistant: assistantOverride, ...configOverrides } = overrides;
  const config = loadConfig(configOverrides);
  fs.mkdirSync(config.dataDir, { recursive: true });

  const db = openDb(config.dbFile);
  const hub = createHub();
  const images = createImageStore(config.uploadsDir);
  const bot = createBot({ db, hub, enabled: config.autoReply });
  const assistant = 'assistant' in overrides ? assistantOverride : createAssistant(config);
  const pauseWatch = createPauseWatch({ db, hub, bot, delayMs: config.pauseEscalateMs });
  const ctx = { db, hub, images, bot, config, assistant, pauseWatch };

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');

  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin', // map tile servers require a Referer
      'X-Frame-Options': 'SAMEORIGIN'
    });
    next();
  });

  /* ---------- API ---------- */
  const api = express.Router();
  api.use(express.json({ limit: '4mb' }));
  api.use(identify(db));
  api.use(rateLimit({ max: config.writeLimitPerMinute }));
  api.use('/', miscRouter(ctx));
  api.use('/reports', reportsRouter(ctx));
  api.use('/posts', postsRouter(ctx));
  api.use('/comments', commentsRouter(ctx));
  api.use('/cases', casesRouter(ctx));
  api.use('/assistant', assistantRouter(ctx));
  api.use('/circles', circlesRouter(ctx));
  api.use('/pauses', pausesRouter(ctx));
  api.use('/drills', drillsRouter(ctx));
  api.use('/pause-link', pauseLinksRouter(ctx));
  api.use((req, res, next) => next(new HttpError(404, 'No such API endpoint')));
  api.use((err, req, res, next) => {
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'That upload is too large.' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body is not valid JSON.' });
    const status = err.status || 500;
    if (status >= 500 && !(err instanceof HttpError)) console.error(err); // expected errors aren't crashes
    res.status(status).json({ error: status >= 500 ? 'Something went wrong on the server.' : err.message });
  });
  app.use('/api', api);

  /* ---------- Website ---------- */
  // Only the public folders are served — never server/, .git, etc.
  app.use('/uploads', express.static(config.uploadsDir, { maxAge: '7d', fallthrough: false }));
  app.use('/css', express.static(path.join(WEB_ROOT, 'css')));
  app.use('/js', express.static(path.join(WEB_ROOT, 'js')));
  app.get('/', (req, res) => res.sendFile(path.join(WEB_ROOT, 'index.html')));
  // Installable app: manifest, icons and the service worker (served from the root so it covers the whole site).
  app.use('/icons', express.static(path.join(WEB_ROOT, 'icons'), { maxAge: '7d' }));
  // iPhones and some browsers look for the icon at these fixed addresses too.
  const icon = file => (req, res) => res.type('image/png').sendFile(path.join(WEB_ROOT, 'icons', file));
  app.get(['/apple-touch-icon.png', '/apple-touch-icon-precomposed.png'], icon('apple-touch-icon.png'));
  app.get('/favicon.ico', icon('icon-192.png'));
  app.get('/manifest.webmanifest', (req, res) =>
    res.type('application/manifest+json').sendFile(path.join(WEB_ROOT, 'manifest.webmanifest')));
  app.get('/sw.js', (req, res) => {
    res.set('Cache-Control', 'no-cache'); // so phones pick up a new service worker straight away
    res.type('text/javascript').sendFile(path.join(WEB_ROOT, 'sw.js'));
  });

  const close = () => {
    bot.stop();
    pauseWatch.stop();
    hub.closeAll();
    db.close();
  };

  return { app, ctx, close };
}
