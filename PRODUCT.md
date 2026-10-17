# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

An installable PWA (home-screen icon, standalone display, Android "Pause now" shortcut, offline helpline fallback). Phone-first in use, but the same site serves desktop.

## Users

Residents of Singapore of all ages, primarily in HDB towns. Seniors are an important segment (the most targeted, and the reason for the A+ text-size setting), but they are not the sole design centre: the product has to work for any resident who gets a message or call that feels off.

Around each resident:

- **Their Circle:** family and trusted people who joined with a 6-letter code. They receive live Pause alerts, see the warning signs and who the caller claims to be, and tap *I'm on it* to call.
- **Volunteers:** CC/RC volunteers (Digital Ambassadors, CC Scam-Busters) who are identity-confirmed (Singpass demo) and have passed the Intermediate courses. They work a shared case inbox, verify or dismiss Scam Radar reports, give verdicts on posts, step into escalated Pauses and send town-wide Scam Drills.

The resident's job ranges from calm ("is this SMS a scam?") to acute ("someone is pressuring me to pay right now").

## Product Purpose

Kampung Watch helps residents identify, discuss and respond to scams in real time. Its centre is **Pause**: one button for "someone is pressuring me right now" that brings the resident's Circle in while the scam is happening, and escalates to nearby volunteers if no one answers within 90 seconds.

Around Pause: **Check a message** (red-flag check plus a live volunteer, call-back, 1799 helpline), **Scam Radar** (volunteer-verified, anonymised reports by town with alerts), **Community** (forum with volunteer verdicts), **Learn** (courses, quizzes, badges, *Spot the scam*), **Scam Drills** (safe practice scams from the Circle or a whole town), and **Ask AI**.

Current success: winning HackIT 2026. The live demo and the Pause story have to land with judges within minutes.

## Positioning

Most anti-scam tools work before a scam (education, call filtering) or after it (reporting, banks). Kampung Watch works **during** one. Scammers win by keeping people alone and in a hurry; Pause breaks both by putting the people the resident already trusts into the moment, with community volunteers as the backstop. The "kampung" idea (neighbours looking out for each other) is the mechanism, not decoration.

## Operating Context

- Used on a phone, often mid-call or mid-chat with a scammer: under time pressure, stressed, one-handed. Pause is two taps from the home-screen icon, with a 5-second *Send now / Cancel* countdown; Emergency-button mode starts the countdown on open.
- The emergency link lets a resident press Pause from any browser, including iPhone Shortcuts, Back Tap and "Hey Siri, Kampung Pause", even during a call.
- Singapore context: ScamShield Helpline 1799, police 999, ScamShield app, CPF/MOM/police impersonation scams, HDB towns, CCs and RCs.
- Live updates over Server-Sent Events, with a polling fallback for networks that hold the stream back.
- Demo context: a hackathon judging session. `AUTO_REPLY` simulates a volunteer, and `PAUSE_ESCALATE_SECONDS` can be shortened for the live demo.

## Capabilities and Constraints

- **Four languages are a hard rule:** every screen must work in English, 华语, Bahasa Melayu and தமிழ். Design for longer strings and Tamil script, not just English.
- Current stack: plain HTML/CSS/JS frontend (`index.html`, `js/app.js`, `css/`), served by a Node.js 22.13+ Express server with built-in SQLite. `js/data.js` is shared by frontend and server.
- Identity is prototype-level: residents are anonymous (random client ID shown as handles like `Resident-4821`); volunteers sign in after a Singpass demo and course checks. A real launch would need real accounts.
- Privacy is a product rule: phone numbers, emails and NRICs are masked before anything is shown publicly or sent to an AI; cases are private to the resident and volunteers; Pauses are visible only to the resident and their Circle until they escalate.
- Radar reports start as *awaiting verification* until volunteers verify them, so rumours don't spread.
- Ask AI needs an API key (Gemini or Anthropic); without one it shows "not switched on yet".
- Terminology: Pause, Circle, *I'm on it*, Scam Radar, Scam Drills, Check a message / Ask a Neighbour, Ask AI, Volunteer mode, *scam stopped / false alarm / money lost*.

## Brand Commitments

- Name: **Kampung Watch**. Tagline in use: "Spot scams together" / "Neighbours helping neighbours spot, discuss and stop scams."
- Logo: a kampung house with a tick (inline SVG in `index.html`); home-screen icons in `icons/`, drawn by `server/scripts/make-icons.js`.
- Voice in the shipped copy: plain, direct, calm, imperative in a crisis ("Don't pay. Call someone you trust."), warm and local in community content (Aunty/Uncle volunteers, kampung spirit).

## Evidence on Hand

- Everything in `js/data.js` (volunteers such as Aunty Mei Ling and Uncle Tan, posts, reports, stories) is **demo seed content**, not real people, cases or testimonials.
- Impact numbers on the Pause page (Pauses pressed, scams stopped, time until a person steps in) are computed from the demo database, not real-world results.
- Singapore helplines (1799, 999) and the ScamShield app are real public resources the product points to; no partnership or endorsement with SPF, NCPC or ScamShield is recorded, so future work must not imply one.

## Product Principles

1. **During, not before or after.** Pause is the hero; every other feature supports getting a trusted person into the moment.
2. **Never alone, never rushed.** Counter the scammer's two weapons: bring people in, and slow the resident down without slowing help down.
3. **Verified before amplified.** Community signal is valuable only once a trained volunteer has checked it; the UI must make that status unmistakable.
4. **Works for every neighbour.** Any age, any of the four languages, any confidence level, on a phone, under stress.
5. **Private by default.** Show the least needed for help to happen; mask personal details everywhere.

## Accessibility & Inclusion

- **WCAG 2.2 AA is required.**
- A+ text-size setting, reduced-motion support, skip link, and large tap targets for the crisis path.
- Four languages and scripts (see Capabilities); copy must survive translation length and stay plain-spoken.
