# Kampung Watch 🛡️

A community-centric website that helps residents **identify, discuss and respond to scams in real time**. Built for HackIT 2026 with an HTML/CSS/JavaScript frontend and a Node.js backend.

Most anti-scam tools work **before** a scam (education, call filtering) or **after** it (reporting, banks). Kampung Watch's main feature works **during** one: scammers win by keeping people alone and in a hurry, so **Pause** brings in the people they trust while it's happening.

## What's inside

| Section | Idea it covers | What you can do |
|---|---|---|
| **Pause** (home page) | Kampung Circle: help *during* a scam | One big button for "someone is pressuring me right now". The resident's **Circle** (family who joined with a 6-letter code) gets a live alert on any page, sees the warning signs the resident taps and who the caller claims to be, and taps *I'm on it* to call. If no one answers within 90 seconds, it **escalates to volunteers** near them. Everyone can message, then close it as *scam stopped*, *false alarm* or *money lost*. The page shows Pauses pressed, scams stopped and the typical time until a person steps in. |
| **Scam Drills** (on the Pause page) | Practising the habit | Circle members send a **safe practice scam** (parcel fee SMS, fake police officer, "new number" from family and more). It pops up like a real message: pressing Pause or deleting it passes; tapping the link shows a 30-second lesson. The Circle sees the result. Volunteers turn a **verified Scam Radar wave into this week's drill for a whole town** with one button, and see pass rates by town. |
| **Home-screen app** | One tap during a scam | The site installs on phones like an app (its own chili-red icon, no browser bar). The icon opens on the big **Pause** button, so help is two taps away, and the rest of the app works as normal. Pressing Pause starts a **5-second countdown** (*Send now* or *Cancel*); it sends by itself if nothing is tapped. **Emergency-button mode** (a setting on the Pause page, off by default) makes opening the app start the countdown straight away, for a phone used only for emergencies. Android also gets a long-press **Pause now** shortcut. Works offline enough to show the helplines. Installing needs an `https://` address (or `localhost`). |
| **Emergency link** | Pause without opening the app | On the Pause page, residents make a private link that can only press Pause for them. On iPhone it goes into a Shortcuts action, so **double-tapping the back of the phone (Back Tap)** or **"Hey Siri, Kampung Pause"** starts the 5-second countdown, even during a call. The link works from any browser (iPhone shortcuts open Safari, which doesn't share the home-screen app's data), then shows who's been alerted and who is calling. The server stores only a hash of it; making a new link or turning it off stops the old one. |
| **Check a message** | "Ask a Neighbour" live help | One-tap *Is this a scam?*, paste a message or upload a screenshot, get an instant red-flag check, and chat with a volunteer who replies within minutes. Seniors can request a **call back** in their language or tap to call the 1799 helpline. |
| **Scam Radar** | Neighbourhood Scam Radar | Live map and feed of anonymised scam reports by town. Reports start as *awaiting verification* until CC/RC volunteers verify them, so rumours don't spread. Choose your area to get **alerts** the moment a scam wave is verified there. |
| **Community** | Reddit-style forum | Post questions with photos, upvote and downvote, threaded replies, topics (Is this a scam? / Scam alert / Tips / Debate / My story), community polls and volunteer-verified verdicts. |
| **Learn** | Online courses | Six short courses with lessons, quizzes and badges, plus a *Spot the scam* mini-game. |

**Ask AI** (its own page, linked from the header): residents chat with an AI (Google Gemini on its free tier, or Anthropic's Claude) about a suspicious message or screenshot, in English, 华语, Melayu or தமிழ். It points out warning signs and next steps, uses the latest verified Scam Radar reports, and can hand the conversation to a volunteer as a case. It needs an API key (see Configuration); without one it shows "not switched on yet".

**Volunteer mode** (the "Volunteer sign in" button in the header) requires a volunteer access code. Volunteers get a shared inbox of resident cases. They can reply, set verdicts, verify or dismiss Radar reports, and mark community posts as scam or legit.

## Run it

You need **Node.js 22.13 or newer**, which includes the built-in SQLite module.

From the project folder:

```bash
npm install
npm start
```

Open http://localhost:3000. The server also serves the website, so you don't need a separate frontend server. Opening `index.html` directly won't work, because the site needs the server.

If port 3000 is busy, choose another port. In PowerShell: `$env:PORT=3001; npm start`.

| Command (in the project folder or in `server/`) | What it does |
|---|---|
| `npm start` | Start the server |
| `npm run dev` | Start and auto-restart when server files change |
| `npm test` | Run the API tests |

### Configuration

Copy `server/.env.example` to `server/.env` to change settings:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Port for the site and API |
| `VOLUNTEER_CODE` | `kampung2026` | Code volunteers enter to sign in. **Change it before sharing the site.** |
| `AUTO_REPLY` | `true` | A simulated volunteer answers new cases, and steps into escalated Pauses, if no human does first (useful for demos) |
| `PAUSE_ESCALATE_SECONDS` | `90` | How long a resident's Circle has to answer a Pause before volunteers are alerted. Shorten it for a live demo. |
| `DATA_DIR` | `server/data` | Where the SQLite database and uploaded images are stored |
| `AI_PROVIDER` | (auto) | `gemini` or `anthropic`. If left out, whichever key is set is used. |
| `GEMINI_API_KEY` | (empty) | Free key from aistudio.google.com/apikey. Never commit it. |
| `ANTHROPIC_API_KEY` | (empty) | Paid key from console.anthropic.com, if you use Claude. Never commit it. |
| `ASSISTANT_DAILY_LIMIT` | `500` | Most assistant replies per day for the whole site, to cap cost |
| `ASSISTANT_MODEL` | `gemini-flash-latest` / `claude-opus-5-5` | Model the assistant uses |

To reset to the demo content, stop the server and delete `server/data/`. It's reseeded on the next start.

## How it fits together

```
Browser (index.html + js/app.js)
   │  fetch /api/...             ← reads and writes
   │  EventSource /api/events    ← live updates pushed by the server
   ▼
Express server (server/src)
   ├─ SQLite database  (server/data/kampung.db)
   └─ Uploaded images  (server/data/uploads)
```

- **Shared data:** reports, posts, comments, votes, polls, cases, Circles, Pauses and drills live on the server.
- **Pause escalation** runs on the server: a timer per open Pause moves it to volunteers if no one in the Circle has responded. Open Pauses are picked up again if the server restarts.
- **Browser-only data:** course progress, the alert area and the text-size setting stay in the browser's `localStorage`.
- **Live updates** use Server-Sent Events. Some networks and free tunnels (like Cloudflare's `trycloudflare.com`) hold that stream back, so if nothing arrives within 5 seconds the browser switches to polling `GET /api/events/poll` every 3 seconds, with the same privacy rules. When a volunteer verifies a report, every resident subscribed to that town gets an alert. Case replies and new comments also appear without refreshing.
- **One source of truth:** the server loads `js/data.js` for towns, scam types, red-flag rules and seed content, so the frontend and backend never disagree.

### Identity (prototype level)

- **Residents** are anonymous. Each browser generates a random ID and sends it as the `X-Client-Id` header. That ID controls "my cases" and votes, and is shown publicly as a handle like `Resident-4821`.
- **Volunteers** sign in with a name, role, area and the shared `VOLUNTEER_CODE`. They get a session token (12 hours), sent as `Authorization: Bearer <token>`. Only a hash of the token is stored.

A real launch would need proper accounts, for example Singpass for residents and individual volunteer logins approved by the CC.

### API

All endpoints are under `/api` and use JSON. Send `X-Client-Id` on every request. 🔒 = volunteer token required.

| Method & path | Purpose |
|---|---|
| `GET /health`, `GET /config`, `GET /me`, `GET /stats` | Server status, settings, your handle, home-page numbers |
| `POST /volunteer/login` · `DELETE /volunteer/session` | Volunteer sign-in and sign-out |
| `GET /events` | Live updates stream (`report`, `case`, `post`, `pause`, `drill`, `circle` events) |
| `GET /events/poll?after=` | The same updates by polling (no `after`: just the latest event id) |
| `GET /reports?town=&type=&status=&days=` · `GET /reports/:id` | Scam Radar feed |
| `POST /reports` | Report a scam (starts as `pending`) |
| `POST /reports/:id/confirm` | Toggle "I got this too" |
| `POST /reports/:id/verify` 🔒 · `POST /reports/:id/dismiss` 🔒 | Verify a scam wave, or mark it as not a scam |
| `POST /reports/:id/discuss` | Open or create the community thread for a report |
| `GET /posts?flair=&sort=hot\|new\|top&q=` · `GET /posts/:id` | Community feed and a post with its comment tree |
| `POST /posts` · `POST /posts/:id/vote` · `POST /posts/:id/poll` | Create a post, vote (`-1`/`0`/`1`), answer the poll |
| `POST /posts/:id/comments` · `POST /comments/:id/vote` | Comment or reply (`parentId`), vote on comments |
| `POST /posts/:id/verdict` 🔒 | Mark a post as `scam` or `legit` |
| `GET /cases` · `GET /cases/:id` | Your cases (volunteers see the shared inbox) |
| `POST /cases` | Ask "Is this a scam?" (text and/or image, optional call-back) |
| `POST /cases/:id/messages` | Reply (resident follow-up or volunteer answer) |
| `POST /cases/:id/verdict` 🔒 | Set `scam`, `suspicious` or `safe` |
| `POST /cases/:id/resolve` · `POST /cases/:id/share` | Close a case, or post an anonymised copy to the community |
| `GET /circles/me` | Your Circle (code, members, drills) and the people you look after |
| `POST /circles` · `POST /circles/code` | Create your Circle or change your name/town, make a new invite code |
| `POST /circles/join` · `DELETE /circles/members/:id` | Join a Circle with its code (`name`, `relation`); remove a member or leave |
| `GET /pauses` · `GET /pauses/:id` · `GET /pauses/stats` | Your Pauses, your Circle's, and (🔒) escalated ones; impact numbers |
| `POST /pauses` | Press Pause (one open Pause at a time; pressing again returns it) |
| `POST /pauses/:id/details` | Resident adds warning signs (`signs`) and who the caller claims to be (`caller`) |
| `POST /pauses/:id/respond` · `POST /pauses/:id/escalate` | "I'm on it" (Circle member or 🔒 volunteer); bring in volunteers now |
| `POST /pauses/:id/messages` · `POST /pauses/:id/resolve` | Message; close as `stopped`, `safe` or `lost` |
| `GET /pause-link` · `POST /pause-link` · `DELETE /pause-link` | Whether you have an emergency link; make a new one (returns the token once); turn it off |
| `POST /pause-link/status` · `POST /pause-link/press` | With `{ token }` in the body (any browser): who would be alerted and who is coming; press Pause |
| `GET /drills/templates` · `GET /drills/suggest?town=` · `GET /drills/stats` | Practice scams, this week's drill for a town, pass rates |
| `POST /drills` | Circle member sends a practice scam (`circleId`, `template`) |
| `POST /drills/estate` 🔒 | Send a drill to every Circle in a town (`town`, or `reportId` of a verified Radar report) |
| `GET /drills/pending` · `POST /drills/:id/result` | Practice messages waiting for you; answer `paused`, `ignored` or `clicked` |
| `POST /assistant/chat` | AI assistant: `{ messages, lang, image? }`, replies as a Server-Sent Events stream |

### Safety built in

- **Hidden personal details:** phone numbers, emails and NRICs are masked before anything is shown publicly.
- **Private cases:** a resident's case can only be seen by that resident and by volunteers.
- **Private Pauses:** only the resident and their Circle see a Pause; volunteers see it only once it has escalated. Circle codes skip look-alike characters, can be replaced at any time, and joining is rate-limited so codes can't be guessed.
- **Image checks:** uploads must be real JPEG, PNG or WebP files (the file contents are checked, not just the extension), at most 2 MB.
- **Rate limits:** write requests are limited per browser, and the volunteer login has a tighter limit.
- **AI assistant:** the API key stays on the server; the browser only talks to `/api/assistant/chat`. Phone numbers, emails and NRICs are masked before a message goes to the AI service. Each browser gets 8 messages a minute, and the whole site has a daily cap.
- **Limited file serving:** the server only serves `index.html`, `css/`, `js/` and uploads. It never serves `server/` or `.git`.

## Files

```
index.html            page shell, header, footer
manifest.webmanifest  makes the site installable: name, icons, start page, "Pause now" shortcut
sw.js                 service worker: install support and an offline fallback (never caches the API)
icons/                home-screen icons, drawn by server/scripts/make-icons.js
css/styles.css        all styling
js/data.js            towns, courses, red-flag rules, demo seed content (shared with the server)
js/app.js             frontend: routing, views, API calls, live updates
server/
  src/index.js        starts the server
  src/app.js          Express app: middleware, routes, static files
  src/db.js           SQLite schema and demo seeding
  src/auth.js         resident IDs, volunteer sessions, rate limiting
  src/events.js       live updates (Server-Sent Events)
  src/bot.js          simulated volunteer for demos
  src/routes/assistant.js  AI assistant: instructions, checks, streamed replies
  src/ai/             one file per AI service (gemini.js, anthropic.js); index.js picks one
  src/images.js       image upload checks and storage
  src/models/         database queries for reports, posts, cases, Circles, Pauses and drills
  src/routes/         API endpoints
  test/api.test.js    API tests
  test/pause.test.js  Circle, Pause escalation and Scam Drill tests
```
