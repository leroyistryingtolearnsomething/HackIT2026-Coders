# Tap-to-call links in the help line use Action Blue

Written against: `23a8e70` plus uncommitted working-tree changes (the Apple-style restyle of `css/styles.css`, not yet committed when this plan was written)

Status: applied and validated on 2026-10-18. `.cf-help a` now uses `var(--action)`. Checked on `#/pause`, `#/ask` and `#/sos/<token>`, in all four languages, at 375px with A+ and at 1280px: the links measure 5.57:1 and their tap area is 52px tall. The footer and the live Pause steps are unchanged, and `npm test` passed 40 of 40.

## Evidence chain

- Surface: Pause page idle state (`#/pause`, `#/home`), the emergency-link page (`#/sos/<token>`) and Check a message (`#/ask`). On each, the help line reads "Money leaving your account right now? Call 999. For advice, call the ScamShield Helpline 1799." and both numbers are `tel:` links.
- Problem: those two links render in ink (`--color-text`), bold, with no underline. On the same Pause task, the live Pause steps ("Wait for the call, or call the ScamShield Helpline 1799.") render the same 1799 link in Action Blue. The same number, tappable in both places, appears in two colours inside one flow.
- Design evidence:
  - `css/styles.css` lines 5–7 (header comment): "Colour rule: one action colour, Action Blue, for everything you can tap (links, buttons, focus, selection)."
  - `DESIGN.md`, Do's: "Use `{colors.primary}` (Action Blue #0066cc) for every interactive element — links, pill CTAs, focus signals — and nothing else."
  - `css/styles.css` line 146: `a { color: var(--action); }`, the global link colour every other link inherits.
- Owner: `css/styles.css`, the `.cf-help a` rule (lines 420–424). It overrides the global link colour with `color: var(--color-text)`.
- Scope and affected surfaces: every `<p class="cf-help">` that contains links:
  - `js/app.js` ~line 1303: `drawPauseZone`, the "Who gets the alert" block on the Pause idle page.
  - `js/app.js` ~line 1784: `renderSos`, the emergency-link page before Pause is pressed.
  - `js/app.js` line 801 (`#askHelp`), filled at ~line 888: Check a message.
- Uncertainty: none for the colour. Contrast is already measured: `#0066cc` is 5.57:1 on `#ffffff` and 5.07:1 on the parchment `#f6f4f0`, both above the 4.5:1 body-text requirement. All three help lines render on white.

## Design decision

Remove the help line's private ink colour, so its tap-to-call links follow the documented colour rule like every other link. Keep everything else about the rule: the 600 weight, no underline until hover, and the enlarged 44px tap area. Those exist so an older resident can find and hit the number, and they don't conflict with the colour rule.

## Reuse

- `--action` (defined in the `:root` token block of `css/styles.css`, `#0066cc`), the same token the global `a` rule uses.
- Exemplar: `css/styles.css` line 146, `a { color: var(--action); }`, as rendered by the 1799 link in `pauseStepsHTML` (`js/app.js` ~line 1453).

No new primitive is needed.

## Changes

1. `css/styles.css`, rule `.cf-help a` (around lines 420–424)
   - Change: replace `color: var(--color-text);` with `color: var(--action);`. Leave the rest of the declaration as it is.
   - Preserve: `font-weight: 600; text-decoration: none;`, the `display: inline-block` tap-area padding and negative margin, and the hover underline rule on the next line (`.cf-help a:hover { text-decoration: underline; }`).
   - Verify: on `#/pause`, `#/ask` and an emergency-link page, the computed `color` of `.cf-help a` is `rgb(0, 102, 204)`. The surrounding help text stays `--ink-78`.

No change to `js/app.js` is needed: the markup already uses `<a href="tel:…">` through `telLink()` and `call()`.

## Scope

- Inherit: all three `.cf-help` help lines listed above.
- Verify: the footer helpline list (`.helpline-list a`) already renders in Action Blue through the global `a` rule; confirm it is unchanged. Confirm the live Pause steps' 1799 link is unchanged.
- Exclude:
  - `.cf-help` text that is not a link stays `--ink-78`.
  - The Pause button, the "Call 999 · Police" and "Call 1799" buttons (`.btn-call`, chili and outlined) are buttons, not inline links, and keep their own styling.
  - Do not change `.cf-note`, which shares the `.cf-help, .cf-note` colour rule on line 415.

## Validation

- Product: a resident on the Pause page can see that 999 and 1799 are tappable, in the same colour as every other link, and tapping either still opens the phone dialler.
- Interface:
  - Routes: `#/pause` (no Circle set up, and with a Circle), `#/ask`, `#/sos/<token>` (make one from "Even faster: an emergency link…" on the Pause page).
  - Languages: English, 华语, Bahasa Melayu, தமிழ். The numbers are not translated, but the surrounding sentence wraps differently.
  - Text size: with and without the A+ setting.
  - Viewports: 375×812 and 1280×800.
  - Hover on a fine pointer: an underline appears.
  - Contrast: the link measures at least 4.5:1 against its rendered background.
- System: no new colour or token is introduced. `.cf-help a` now matches the global link colour, and no other rule redefines tel-link colour.
- Repository: `npm test` → all API tests pass (40 at the time of writing). This change touches CSS only, so this is a no-regression check.

## Stop conditions

- Stop if `.cf-help` is found inside a dark surface (for example the header, the dark impact tile or a toast). Action Blue fails there, and the plan would need `--action-on-dark` for that context.
- Stop if the colour-rule comment at the top of `css/styles.css` or the Do's in `DESIGN.md` have changed to give emergency numbers a different colour.

## Design documentation

- After acceptance and validation: none required. The rule is already documented in the `css/styles.css` header comment and `DESIGN.md`. This change brings `.cf-help a` into line with them.
