---
name: Kampung Watch
description: Neighbours helping neighbours spot, discuss and stop scams, with one calm button for the moment it matters.
colors:
  action-blue: "#0066cc"
  action-blue-hover: "#0057ad"
  action-blue-pressed: "#004a93"
  action-blue-wash: "#e8f1fb"
  action-blue-on-dark: "#2997ff"
  page-white: "#ffffff"
  parchment: "#f6f4f0"
  ink: "#1f1d1a"
  header-black: "#1b1a18"
  tile-black: "#24221f"
  on-dark-text: "#f6f4f0"
  on-dark-muted: "#a8a399"
  field-edge: "#857f76"
  avatar-stone: "#ebe7e0"
  chili: "#962f1f"
  chili-deep: "#6e2216"
  chili-light: "#eeab9c"
  chili-wash: "#fbe9e4"
  pandan: "#2f7d55"
  pandan-deep: "#1e5638"
  pandan-wash: "#e6f3ea"
  kaya: "#7a530a"
  kaya-ring: "#9a6b0e"
  kaya-light: "#f1d9a2"
  kaya-wash: "#f8eccf"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, Inter, Segoe UI, Roboto, sans-serif"
    fontSize: "3.5rem"
    fontWeight: 600
    lineHeight: "3.75rem"
    letterSpacing: "-0.015em"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, Inter, Segoe UI, Roboto, sans-serif"
    fontSize: "2.5rem"
    fontWeight: 600
    lineHeight: "2.75rem"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, Inter, Segoe UI, Roboto, sans-serif"
    fontSize: "2rem"
    fontWeight: 600
    lineHeight: "2.5rem"
  verdict:
    fontFamily: "-apple-system, BlinkMacSystemFont, Inter, Segoe UI, Roboto, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: "2.125rem"
  body-large:
    fontFamily: "-apple-system, BlinkMacSystemFont, Inter, Segoe UI, Roboto, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 400
    lineHeight: "1.875rem"
  button-large:
    fontFamily: "-apple-system, BlinkMacSystemFont, Inter, Segoe UI, Roboto, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: "1.5rem"
  subtitle:
    fontFamily: "-apple-system, BlinkMacSystemFont, Inter, Segoe UI, Roboto, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: "2rem"
  lead:
    fontFamily: "-apple-system, BlinkMacSystemFont, Inter, Segoe UI, Roboto, sans-serif"
    fontSize: "1.1875rem"
    fontWeight: 400
    lineHeight: "1.875rem"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, Inter, Segoe UI, Roboto, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: "1.625rem"
    letterSpacing: "-0.011em"
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, Inter, Segoe UI, Roboto, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: "1.5rem"
    letterSpacing: "0"
  meta:
    fontFamily: "-apple-system, BlinkMacSystemFont, Inter, Segoe UI, Roboto, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: "1.5rem"
rounded:
  sm: "5px"
  md: "8px"
  lg: "18px"
  pill: "999px"
spacing:
  "1": "5px"
  "2": "10px"
  "3": "15px"
  "4": "20px"
  "6": "30px"
  "8": "40px"
  section-gap: "48px"
  page-gutter: "72px"
components:
  button-primary:
    backgroundColor: "{colors.action-blue}"
    textColor: "{colors.page-white}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "10px 22px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.action-blue-hover}"
  button-primary-active:
    backgroundColor: "{colors.action-blue-pressed}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.action-blue}"
    rounded: "{rounded.pill}"
    padding: "10px 22px"
    height: "44px"
  button-secondary-hover:
    backgroundColor: "{colors.action-blue-wash}"
    textColor: "{colors.action-blue-hover}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.action-blue}"
    rounded: "{rounded.md}"
    padding: "10px 10px"
    height: "44px"
  button-pause:
    backgroundColor: "{colors.chili}"
    textColor: "{colors.page-white}"
    rounded: "{rounded.pill}"
    padding: "10px 22px"
    height: "52px"
  pause-button:
    backgroundColor: "{colors.chili}"
    textColor: "{colors.page-white}"
    rounded: "{rounded.pill}"
    size: "240px"
  input:
    backgroundColor: "{colors.page-white}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
    height: "44px"
  tag-scam:
    backgroundColor: "{colors.chili-wash}"
    textColor: "{colors.chili-deep}"
    typography: "{typography.meta}"
    rounded: "{rounded.pill}"
    padding: "2px 12px"
  tag-safe:
    backgroundColor: "{colors.pandan-wash}"
    textColor: "{colors.pandan-deep}"
    typography: "{typography.meta}"
    rounded: "{rounded.pill}"
    padding: "2px 12px"
  tag-pending:
    backgroundColor: "transparent"
    textColor: "{colors.kaya}"
    typography: "{typography.meta}"
    rounded: "{rounded.pill}"
    padding: "2px 12px"
  nav-link:
    backgroundColor: "{colors.header-black}"
    textColor: "{colors.on-dark-text}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "44px"
  dark-tile:
    backgroundColor: "{colors.tile-black}"
    textColor: "{colors.on-dark-text}"
    rounded: "{rounded.lg}"
    padding: "40px 72px"
---

# Design System: Kampung Watch

## Overview

**Creative North Star: "The Calm Neighbour"**

Kampung Watch is opened at the worst moment of someone's week: a caller is shouting, an SMS says the account is frozen, and the person holding the phone is often over sixty. The design behaves like the neighbour you knock on for help. It is unhurried, it speaks plainly, and it does not raise its voice, except for the one thing that matters. Pages are white and quiet, with generous space so a frightened person can think. Warmth comes from the words and from three kopitiam colours that each carry a single meaning, never from decoration.

The structure is Apple's: one action colour, pill-shaped actions, flat surfaces, a slim black header and sections told apart by a change of surface rather than by rules. The product rules sit on top of it. Nothing a resident reads is smaller than 16px. Every screen works in English, 华语, Bahasa Melayu and தமிழ். Contrast meets WCAG 2.2 AA everywhere. Chili red is reserved for Pause and for scams, so the eye learns that red means "stop and get help".

The mood is calm, plain and trustworthy. Restraint is the default, so the few loud moments (the Pause button, a verified scam wave, a red flag lighting up in a message) land.

**Key Characteristics:**
- White pages, one parchment tile per page, one dark tile for the numbers that matter
- One action colour (Action Blue) for everything tappable; colour otherwise only means something
- Pill-shaped actions, 44px minimum touch targets, a press that answers the moment a finger lands
- A 16px floor for anything residents read; body copy at 17px
- Flat surfaces; shadows only on things that float, plus the Pause button's single product shadow

## Colors

A near-monochrome warm neutral page with one blue for action and three kopitiam colours that each mean exactly one thing.

### Primary
- **Action Blue** (`{colors.action-blue}`): every link, button, focus ring and selected control. It is the only colour that means "you can tap this". Hover and press step darker (`{colors.action-blue-hover}`, `{colors.action-blue-pressed}`); a pale wash (`{colors.action-blue-wash}`) fills secondary buttons on hover. On the black header and dark toasts, links use the brighter `{colors.action-blue-on-dark}`.

### Secondary
- **Chili** (`{colors.chili}`): Pause and scams. The big Pause button, the header's Pause pill, verified scam counts, red-flag numbers and verdicts. A pale **Chili Wash** (`{colors.chili-wash}`) backs scam tags and the red-flag highlights inside a pasted message; **Chili Light** (`{colors.chili-light}`) is the scam colour on dark tiles.

### Tertiary
- **Pandan** (`{colors.pandan}`): safe. "You stopped it", "Likely safe", passed courses, a volunteer on the way. Text uses **Pandan Deep** (`{colors.pandan-deep}`) on **Pandan Wash** (`{colors.pandan-wash}`).
- **Kaya** (`{colors.kaya}`): not known yet. A report awaiting a volunteer's check, a case waiting for a reply, a "Suspicious" verdict. Map rings use **Kaya Ring** (`{colors.kaya-ring}`); on dark tiles the count uses **Kaya Light** (`{colors.kaya-light}`).

### Neutral
- **Page White** (`{colors.page-white}`): the page and every field.
- **Parchment** (`{colors.parchment}`): the one tinted tile per page, panels and the footer. Barely warm, so it reads as paper rather than grey.
- **Ink** (`{colors.ink}`): all text (16.8:1 on white). Secondary text is Ink at 78% or 70% opacity, never a separate grey.
- **Header Black** (`{colors.header-black}`) and **Tile Black** (`{colors.tile-black}`): the header, and the dark tiles that hold Pause's impact numbers and the Radar headline. Text on them is **On-dark Text** (`{colors.on-dark-text}`) or **On-dark Muted** (`{colors.on-dark-muted}`, 6.9:1 on the header).
- **Field Edge** (`{colors.field-edge}`): the border of every field, chosen to reach 3:1 against white, parchment and the header.
- **Avatar Stone** (`{colors.avatar-stone}`): the initials circle for people.

### Named Rules
**The One Action Rule.** Action Blue is the only colour that means "tap here". Never colour a button chili, pandan or kaya because of what it is about; colour it by what it does. (Pause and the emergency call buttons are the one exception: they are the emergency.)

**The Three Meanings Rule.** Chili means scam or Pause, pandan means safe, kaya means not known yet. Never use them as decoration, and always pair them with a word or icon, because colour alone carries no meaning for everyone.

## Typography

**Display Font:** San Francisco on Apple devices (`-apple-system`), Inter everywhere else
**Body Font:** the same family, one voice for the whole app
**Script fonts:** the phone's own Chinese font; Noto Sans Tamil, loaded only when Tamil is chosen

**Character:** A single neutral sans that reads like a well-set public notice: confident headlines at weight 600, calm body copy, no second family competing for attention.

### Hierarchy
- **Display** (600, `{typography.display}`, 56px): the one headline that opens Pause and the Radar tile. Balanced, at most about 18 characters wide; drops to 34px on phones.
- **Headline** (600, 40px): page titles such as "Got a message that feels off? Ask the kampung." and the live Pause headline.
- **Title** (600, 32px): section titles such as "Reports" and "Your Kampung Circle".
- **Verdict** (600, 28px): the red-flag verdict, such as "6 red flags. Don't tap, don't pay."
- **Subtitle** (600, 24px): sub-sections and lesson titles.
- **Body Large** (400, 20px / 30px): text people type or read under stress: the Check a message box, the Ask AI box.
- **Lead** (400, 19px / 30px): the paragraph under a page title, about 46 characters wide.
- **Body** (400, 17px / 26px, -0.011em): all reading copy. Intros and prose stay under 60 to 75 characters a line.
- **Button Large** (400, 18px): large buttons and the Pause subtitle.
- **Label** (600, 16px, no capitals, no tracking): small headings above groups, such as "Alerts for your town". Capitals mean nothing in Chinese or Tamil, so labels are never uppercase.
- **Meta** (400, 16px): times, counts, tags.

Numbers in tables and counts use tabular, lining figures. "Text size A+" scales every size by 122%, because sizes are set in rem.

### Named Rules
**The Sixteen Pixel Floor Rule.** Nothing a resident reads is smaller than 16px, in any language, on any screen. If it doesn't fit at 16px, the layout changes, not the type.

**The One Voice Rule.** One family, five weights of meaning carried by size and 400/600 only. Never introduce a second family for flavour.

## Layout

Content sits in a page up to 1440px wide with 72px side gutters, shrinking to 16px on phones. Sections are separated by 48px and by a change of surface: each page alternates white with one parchment tile, and pages with numbers that matter (Pause's impact, the Radar headline) open them on a dark tile. Spacing steps are 5, 10, 15, 20, 30 and 40px (`{spacing.1}` to `{spacing.8}`).

Breakpoints are structural, not cosmetic:
- **Below 1800px (Tamil) / 1200px (others):** the header menu folds behind "Menu", with the Pause pill kept visible.
- **Below 1024px:** the Radar reports table becomes a stack of cards.
- **Below 960px:** two-column page heads and the Radar alerts band stack.
- **Below 720px (phones):** one column, 16px gutters, 34px display type, filters behind "Filter reports", Radar stats as one line each, reports five at a time, and the floating "Is this a scam?" button appears.
- **Below 480px:** the header shows only the logo, the Pause pill and Menu.

**The Room To Think Rule.** When a screen gets crowded, fold the uncommon (filters, extra options) behind a clearly named toggle rather than shrinking anything.

## Elevation & Depth

Flat by default. Depth comes from surface changes (white, parchment, tile black), not shadows. Shadows appear only on things that float above the page: dialogs, toasts, the countdown box and the phone's floating button (`0 0 0 1px rgba(0,0,0,.06), 0 8px 24px rgba(0,0,0,.12)` and the larger `0 16px 40px` version). Cards and buttons never carry a shadow.

**The One Product Shadow Rule.** The Pause button is the only object with a product shadow (`3px 5px 30px rgba(0,0,0,.22)`) and a soft chili halo. Nothing else on any page may look as lifted.

## Shapes

Three radii and a pill. Gently rounded small things (5px), fields and utility buttons (8px), cards, panels and tiles (18px). Every action button, tag and header pill is a full pill (999px). The Pause button is a perfect circle, 240px across. Borders are 1px, used for fields and secondary buttons only; sections never get outlines.

**The Pill Means Action Rule.** A pill is something you can press or a status tag; a rectangle with 8px corners is a field or a quiet utility. Never make a decorative pill.

## Components

### Buttons
Confident, round and quick to answer.
- **Shape:** full pill (`{rounded.pill}`), at least 44px tall; large buttons 52px.
- **Primary:** Action Blue fill, white text. One filled button per view: the main action.
- **Secondary:** transparent with a 1px Action Blue border and blue text; fills with the blue wash on hover.
- **Ghost:** blue text only, 8px corners, for small utilities ("Not me", "Remove").
- **Pause / Call:** chili fill, white text, used only for sending an alert and for calling 999 or 1799.
- **Press:** every button scales to 0.95 in 160ms the moment it is touched, so the press is felt before the finger lifts. Focus shows a 2px Action Blue ring with a 2px gap.

### Chips / Tags
- **Style:** pill, 16px text, 2px × 12px padding. Scam tags are chili on chili wash, safe tags pandan on pandan wash, "awaiting check" tags a dashed kaya outline.
- **Topics and filters:** pressed state is an Action Blue fill with white text.

### Cards / Containers
- **Corner Style:** 18px.
- **Background:** parchment for panels and the one tinted tile; tile black for impact numbers.
- **Shadow Strategy:** none (see Elevation & Depth).
- **Internal Padding:** 30 to 40px on desktop, 20px on phones.

### Inputs / Fields
- **Style:** white field, 1px Field Edge border, 8px corners, 44px minimum height, 17px text; the Check a message box uses 20px text.
- **Focus:** 2px Action Blue ring outside the border.
- **Error:** the message names the problem and the fix, in the reader's language.

### Navigation
A slim header-black bar. The logo tile, then the Pause pill (chili, always visible), then the pages in On-dark Text; the current page sits on a translucent white pill at weight 600. The language picker, A+ and Volunteer sign in sit at the right in muted on-dark text. On narrower screens the pages fold behind "Menu"; Escape closes it.

### The Pause Button (signature)
A 240px chili circle with "Pause" at 60px and a one-line subtitle ("Alert my Circle" or "Alert a volunteer"). Pressing it starts a 5-second countdown with "Send now" and "Cancel, I tapped by mistake" (Cancel takes the focus). Where the browser supports View Transitions and the person has not asked for reduced motion, the button grows into the countdown box and the box flows into the live screen, in 420ms; otherwise the screens simply switch. The alert is sent whatever the animation does.

### Red-flag Highlights (signature)
In Check a message, risky phrases in the pasted text get a chili wash and a 2px chili underline, drawn on a copy of the text behind the box so typing, pasting and screen readers behave normally. Each flag in the list beside it quotes the phrase it found.

## Do's and Don'ts

### Do:
- **Do** keep one filled Action Blue button per view, and make every other action secondary or ghost.
- **Do** use chili, pandan and kaya only for scam/Pause, safe and not-known-yet, always with a word beside the colour.
- **Do** keep anything residents read at 16px or larger, and check every new screen in Tamil, the longest of the four languages.
- **Do** separate sections with a surface change (white, parchment, tile black) instead of lines.
- **Do** give every control a 44px target and a press that scales to 0.95.
- **Do** honour reduced motion: nothing moves or scales for people who ask for less motion.

### Don't:
- **Don't** colour a button by its topic; blue is for action, and chili is only for Pause and emergency calls.
- **Don't** add shadows to cards or buttons; the Pause button's is the only product shadow.
- **Don't** put a small label above a heading, uppercase a label, or track it out.
- **Don't** use a second font family, or a size between the documented roles.
- **Don't** make an alert, a send or a cancel depend on an animation finishing.

## Reference: Apple Analysis

<!-- Source: VoltAgent/awesome-design-md, design-md/apple/DESIGN.md (MIT License). An analysis of apple.com, copied in as this project's design reference on 2026-10-18. Kampung Watch is not affiliated with Apple. -->

The analysis of apple.com this system started from, kept for reference. Where it disagrees with the sections above, the sections above win: they describe what Kampung Watch actually ships (for example, its 16px text floor and its three meaning colours).


### Overview

Apple's web presence is a masterclass in **reverent product photography framed by near-invisible UI**. Every page is a stack of edge-to-edge product "tiles" — alternating light and dark canvases, each centered on a hero headline, a one-line tagline, two tiny blue pill CTAs, and an impossibly crisp product render. Nothing competes with the product. Typography is confident but quiet; color is either pure white, an off-white parchment, or a near-black tile; interactive elements are a single, quiet blue.

Density is unusually low even by contemporary SaaS standards. Each tile occupies roughly one viewport, and there is no decorative chrome — no borders, no gradients, no decorative frames, no shadows on headlines. Elevation appears only when a product image rests on a surface (a single soft `rgba(0, 0, 0, 0.22) 3px 5px 30px` drop for visual weight). The result is a catalog that feels more like a museum gallery: the wall disappears and the artifact takes over.

Store and shop surfaces retain the same chassis but switch modes. The product configurator (iPhone 17 Pro, accessories grid) introduces a tight grid of white utility cards at `apple rounded.lg` (18px) radius with a thin border, paired with a persistent thin sub-nav strip. The environment page leans darker and more editorial. Across all five surfaces the typographic system, spacing rhythm, and the single blue accent are consistent — this is one design language expressed at different volumes.

**Key Characteristics:**
- Photography-first presentation; UI recedes so the product can speak.
- Alternating full-bleed tile sections: white/parchment ↔ near-black, with the color change itself acting as the section divider.
- Single blue accent (`apple colors.primary` — #0066cc) carries every interactive element. No second brand color exists.
- Two button grammars: tiny blue pill CTAs (`apple rounded.pill`) and compact utility rects (`apple rounded.sm`).
- SF Pro Display + SF Pro Text — negative letter-spacing at display sizes for the signature "Apple tight" headline feel.
- Whisper-soft elevation used only when a product image needs to breathe — exactly one drop-shadow in the entire system.
- Tight two-row nav: slim `apple component.global-nav` + product-specific `apple component.sub-nav-frosted` with persistent right-aligned primary CTA.
- Section rhythm across multiple pages: light hero → dark product tile → light utility tile → dark tile → parchment footer — a predictable pulse.

### Colors

> **Source pages analyzed:** homepage, environment, store, iPhone 17 Pro buy page, accessories index. The color system is identical across all five surfaces; only the surface-mode mix differs.

#### Brand & Accent
- **Action Blue** (`apple colors.primary` — #0066cc): The single brand-level interactive color. All text links, all blue pill CTAs ("Learn more", "Buy"), and the focus ring root. This is Apple's quiet but universal "click me" signal. Press state shifts to a slightly darker variant via the active scale transform rather than a hex change.
- **Focus Blue** (`apple colors.primary-focus` — #0071e3): A marginally brighter sibling of Action Blue, reserved for the keyboard focus ring on buttons (`outline: 2px solid`).
- **Sky Link Blue** (`apple colors.primary-on-dark` — #2997ff): A brighter blue used on dark surfaces for in-copy links and inline callouts, where Action Blue would disappear against the tile background.

#### Surface
- **Pure White** (`apple colors.canvas` — #ffffff): The dominant canvas. Content, utility cards, store tiles, configurator grids.
- **Parchment** (`apple colors.canvas-parchment` — #f5f5f7): The signature Apple off-white. Used for alternating light tiles, footer region, and the default page canvas in store utility sections. Just different enough from white to create rhythm.
- **Pearl Button** (`apple colors.surface-pearl` — #fafafc): A near-white used as the fill for secondary "ghost" buttons — lighter than the parchment canvas so the button still reads as a button against `apple colors.canvas-parchment`.
- **Near-Black Tile 1** (`apple colors.surface-tile-1` — #272729): The primary dark-tile surface on the homepage product grid.
- **Near-Black Tile 2** (`apple colors.surface-tile-2` — #2a2a2c): A micro-step lighter — used where a dark tile sits directly above or below Tile 1 to create the faintest separation.
- **Near-Black Tile 3** (`apple colors.surface-tile-3` — #252527): A micro-step darker — used at the bottom of the stack and in embedded video/player frames.
- **Pure Black** (`apple colors.surface-black` — #000000): Reserved for true void — video player backgrounds, edge-to-edge photographic overlays, the global nav bar background.
- **Translucent Chip Gray** (`apple colors.surface-chip-translucent` — #d2d2d7): The base hex of the translucent gray chip used over photography for circular control buttons. In production, applied at ~64% alpha as `rgba(210, 210, 215, 0.64)`.

#### Text
- **Near-Black Ink** (`apple colors.ink` — #1d1d1f): The voice of every headline, every body paragraph, and the dark utility button's fill. Chosen instead of pure black to keep the page feeling photographic rather than printed.
- **Body** (`apple colors.body` — #1d1d1f): Same hex as ink — Apple uses one near-black tone for all text on light surfaces.
- **Body On Dark** (`apple colors.body-on-dark` — #ffffff): All text on dark tiles and on the global nav bar.
- **Body Muted** (`apple colors.body-muted` — #cccccc): Secondary copy on dark tiles where pure white would be too loud.
- **Ink Muted 80** (`apple colors.ink-muted-80` — #333333): Body text on the white Pearl Button surface — slightly softer than pure black.
- **Ink Muted 48** (`apple colors.ink-muted-48` — #7a7a7a): Disabled button text and legal fine-print.

#### Hairlines & Borders
- **Divider Soft** (`apple colors.divider-soft` — #f0f0f0): The "border" tone on secondary buttons — functions as a ring shadow rather than a hard line. In production, often applied as `rgba(0, 0, 0, 0.04)`.
- **Hairline** (`apple colors.hairline` — #e0e0e0): The 1px hairline border on store utility cards and configurator chips.

#### Brand Gradient
**No decorative gradients.** Atmospheric depth on product photography (the iPhone 17 Pro camera plate, the Apple Watch bands, AirPods reflections) is inherent to the imagery, not a CSS gradient overlay. The environment page's hero uses photographic atmosphere (mountain vista at dawn) but no gradient tokens are defined. Apple is the rare luxury-brand site with zero gradient-based design tokens.

### Typography

#### Font Family
- **Display**: `SF Pro Display, system-ui, -apple-system, sans-serif` — Apple's proprietary display face, optimized for sizes ≥ 19px. Defines the voice of every headline.
- **Body / UI**: `SF Pro Text, system-ui, -apple-system, sans-serif` — the text-optimized variant used for body copy, captions, buttons, and links below 20px.
- **OpenType features**: `font-variant-numeric: numerator` is enabled on numeric links (pricing tables, spec sheets). Display sizes rely on tight tracking rather than contextual ligatures.

#### Hierarchy

| Token | Size | Weight | Line Height | Letter Spacing | Use |
|---|---|---|---|---|---|
| `apple typography.hero-display` | 56px | 600 | 1.07 | -0.28px | Hero headline; the signature "Apple tight" tracking |
| `apple typography.display-lg` | 40px | 600 | 1.10 | 0 | Tile headlines atop every product tile |
| `apple typography.display-md` | 34px | 600 | 1.47 | -0.374px | Section heads (SF Pro Text at display proportions) |
| `apple typography.lead` | 28px | 400 | 1.14 | 0.196px | Product tile subcopy |
| `apple typography.lead-airy` | 24px | 300 | 1.5 | 0 | Environment-page lead paragraphs (the rare weight 300) |
| `apple typography.tagline` | 21px | 600 | 1.19 | 0.231px | Sub-tile tagline; sub-nav category name |
| `apple typography.body-strong` | 17px | 600 | 1.24 | -0.374px | Inline strong emphasis |
| `apple typography.body` | 17px | 400 | 1.47 | -0.374px | Default paragraph |
| `apple typography.dense-link` | 17px | 400 | 2.41 | 0 | Footer / store utility link lists (relaxed leading) |
| `apple typography.caption` | 14px | 400 | 1.43 | -0.224px | Secondary captions, button text |
| `apple typography.caption-strong` | 14px | 600 | 1.29 | -0.224px | Emphasized captions |
| `apple typography.button-large` | 18px | 300 | 1.0 | 0 | Store hero CTAs (the rare weight 300) |
| `apple typography.button-utility` | 14px | 400 | 1.29 | -0.224px | Utility/nav button labels |
| `apple typography.fine-print` | 12px | 400 | 1.0 | -0.12px | Fine-print, footer body |
| `apple typography.micro-legal` | 10px | 400 | 1.3 | -0.08px | Micro legal disclaimers |
| `apple typography.nav-link` | 12px | 400 | 1.0 | -0.12px | Global nav menu items |

#### Principles

- **Negative letter-spacing at display sizes.** Every headline at 17px and up carries a slight tracking tighten (`-0.12 → -0.374px`). This produces the iconic "Apple tight" headline cadence. Never used at 12px or below.
- **Body copy at 17px, not 16px.** Apple breaks the SaaS convention and runs paragraph text at 17px. The extra pixel gives the page an unmistakable "reading, not scanning" pace.
- **Weight 300 is real and rare.** Used deliberately on a handful of large-size reads (`apple typography.button-large` at 18px/300 and `apple typography.lead-airy` at 24px/300). It's not an accident — it's a light-atmosphere cue reserved for moments where the content should feel airy.
- **Weight 600, not 700, for headlines.** Apple's headlines sit at weight 600. Weight 700 is used sparingly for `apple typography.tagline` (21px) when a touch more assertion is needed.
- **Line-height is context-specific.** Display sizes use 1.07–1.19 (tight). Body uses 1.47. Utility link stacks in the footer/store use an unusually relaxed 2.41 (`apple typography.dense-link`). The 2.41 is not a bug — it's how the footer's dense link columns breathe.
- **Weight 500 is deliberately absent.** The ladder is 300 / 400 / 600 / 700. Mid-weight readings always use 600.

#### Note on Font Substitutes
SF Pro is Apple's proprietary system font. When building off-system:

- Use `system-ui, -apple-system, BlinkMacSystemFont` as the first stack entry — on macOS/iOS/Safari this resolves to the real SF Pro.
- For non-Apple platforms, **Inter** (Google Fonts, variable) is the closest open-source equivalent. Inter at weight 600 with `font-feature-settings: "ss03"` approximates SF Pro's rounded "a" character.
- Nudge `letter-spacing` down by `-0.01em` on display sizes to re-create the Apple tight feel; Inter's default tracking runs slightly wider than SF Pro.
- For body text, tighten line-height by `0.03` (from 1.47 → 1.44) when substituting Inter — Inter's taller x-height needs less leading.

### Layout

#### Spacing System
- **Base unit:** 8px. Sub-base values (2, 4, 5, 6, 7) are used for tight typographic adjustments; structural layout snaps to 8/12/16/20/24.
- **Tokens:** `apple spacing.xxs` 4px · `apple spacing.xs` 8px · `apple spacing.sm` 12px · `apple spacing.md` 17px · `apple spacing.lg` 24px · `apple spacing.xl` 32px · `apple spacing.xxl` 48px · `apple spacing.section` 80px.
- **Section vertical padding:** `apple spacing.section` (80px) inside a product tile; tiles stack edge-to-edge with 0 gap (the color change provides the break).
- **Card padding:** `apple spacing.lg` (24px) inside utility grid cards.
- **Button padding:** 8–11px vertical, 15–22px horizontal.
- **Universal rhythm constants:** the 17px body line-height multiplier (~25px line) and 21px tagline size show up on every analyzed page.

#### Grid & Container
- **Max content width:** ~980px on text-heavy sections (environment), ~1440px on product grids (store, accessories), full-bleed for product tiles (homepage).
- **Column patterns:** 3 to 5 column utility card grid on store/accessories; 2-column side-by-side tiles on homepage occasional sections; single-column centered stack on product tile heroes.
- **Gutters:** 20–24px between cards in a utility grid.

#### Whitespace Philosophy
Apple's whitespace is the product's pedestal. Every tile begins with at least 64px of air above its headline and 48–64px below. Product renders are never crowded; the nearest content to a product image is at least 40px away. The footer is the only area that breaks this — there, Apple goes deliberately dense to make the full information architecture visible at a glance.

### Elevation & Depth

| Level | Treatment | Use |
|---|---|---|
| Flat | No shadow, no border | Full-bleed tiles, global nav, footer, body sections |
| Soft hairline | 1px `rgba(0, 0, 0, 0.08)` border | Utility cards, sub-nav frosted-glass separator |
| Backdrop blur | `backdrop-filter: blur(N)` on Parchment 80% | Sub-nav and the iPhone buy floating sticky bar |
| Product shadow | `rgba(0, 0, 0, 0.22) 3px 5px 30px 0` | Product renders resting on a surface (the only true "shadow" in the system) |

**Shadow philosophy.** Apple uses **exactly one** drop-shadow, and it is applied to photographic product imagery — never to cards, never to buttons, never to text. Elevation in the UI comes from (a) surface-color change (light tile ↔ dark tile) and (b) backdrop-blur on sticky bars. The single shadow is about giving the product weight, not about UI hierarchy.

#### Decorative Depth
- **Atmospheric imagery** on the environment page (photographic vista) supplies mood; no CSS gradient involved.
- **Edge-to-edge tile alternation** creates rhythm without borders or shadows — the color change itself is the divider.
- **Backdrop-filter blur** on `apple component.sub-nav-frosted` and `apple component.floating-sticky-bar` creates a "floating over content" effect that's functional, not decorative.

### Shapes

#### Border Radius Scale

| Token | Value | Use |
|---|---|---|
| `apple rounded.none` | 0px | Full-bleed product tiles (no corner rounding) |
| `apple rounded.xs` | 5px | Inline links when styled as subtle chips (rare) |
| `apple rounded.sm` | 8px | Dark utility buttons (Sign In, Bag), inline card imagery |
| `apple rounded.md` | 11px | White Pearl Button capsules |
| `apple rounded.lg` | 18px | Store utility cards, accessories grid cards |
| `apple rounded.pill` | 9999px | Primary blue pill CTAs, sub-nav buy button, configurator option chips, search input — the signature Apple pill |
| `apple rounded.full` | 9999px / 50% | Circular control chips floating over photography |

#### Photography Geometry
- **Hero imagery**: full-bleed, 21:9 or taller on the homepage; 16:9 on environment and shop pages. Product renders are photographic-realistic, often shot on a tinted surface that becomes the tile background.
- **Product renders**: PNG/WebP with transparency; rest on a surface tile and pick up the system shadow.
- **Accessory grid**: square 1:1 crops at `apple rounded.lg` (18px) radius, light neutral backgrounds, product centered with 20–40px internal padding.
- **No rounded imagery in hero tiles** — images are full-bleed rectangular. Rounding (`apple rounded.sm`, `apple rounded.lg`) appears only on inline card imagery.
- Lazy-loading via responsive `srcset` and `sizes` across all breakpoints; CDN-optimized WebP.

### Components

#### Top Navigation

**`global-nav`** — Persistent, ultra-thin black nav bar pinned to the top of every page. Background `apple colors.surface-black`, height 44px, text `apple colors.on-dark` in `apple typography.nav-link` (12px / 400 / -0.12px tracking). Links are quiet, spaced ~20px apart, running edge-to-edge across the top. Right-aligned cluster: Search, Bag icons — always visible. On mobile, collapses to hamburger at ~834px and the Apple logo centers.

**`sub-nav-frosted`** — Surface-specific nav that sticks below the global nav. Background `apple colors.canvas-parchment` at 80% opacity with backdrop-filter blur, creating a frosted-glass effect. Height 52px. Content on left: product category name ("iPhone", "Store", "Accessories") in `apple typography.tagline` (21px / 600). Content right: inline nav links in `apple typography.button-utility` (14px), ending in a persistent `apple component.button-primary` ("Buy") or a utility link.

#### Buttons

**`button-primary`** — The signature Apple action. Background `apple colors.primary` (Action Blue #0066cc), text `apple colors.on-primary` in `apple typography.body` (SF Pro Text 17px / 400), rounded `apple rounded.pill` (full pill — capsule-shaped), padding 11px × 22px. The full-pill radius IS the brand action signal.
- Active state: `apple component.button-primary-active` — `transform: scale(0.95)` (the system-wide micro-interaction).
- Focus state: `apple component.button-primary-focus` — 2px solid `apple colors.primary-focus` outline.

**`button-secondary-pill`** — Used as the second CTA when two blue pills appear together ("Learn more" / "Buy"). Background transparent, text `apple colors.primary`, 1px solid `apple colors.primary` border, rounded `apple rounded.pill`, padding 11px × 22px. Reads as a "ghost pill."

**`button-dark-utility`** — Global nav actions (Sign In, Bag, language selector). Background `apple colors.ink` (#1d1d1f), text `apple colors.on-dark` in `apple typography.button-utility` (14px / 400 / -0.224px tracking), rounded `apple rounded.sm` (8px), padding 8px × 15px. Active state shrinks via `transform: scale(0.95)`.

**`button-pearl-capsule`** — Product-card secondary button. Background `apple colors.surface-pearl` (#fafafc), text `apple colors.ink-muted-80` in `apple typography.caption` (14px), 3px solid `apple colors.divider-soft` border (functions as a soft ring rather than a visible line), rounded `apple rounded.md` (11px), padding 8px × 14px.

**`button-store-hero`** — A larger primary CTA used on store hero surfaces. Same Action Blue + Paper White as `apple component.button-primary`, but with `apple typography.button-large` (18px / 300 — note the rare weight 300) and slightly more padding (14px × 28px). Used sparingly on the store landing.

**`button-icon-circular`** — Floats over photography. 44 × 44px, background `apple colors.surface-chip-translucent` at ~64% alpha, icon in `apple colors.ink`, rounded `apple rounded.full`. Used for carousel controls, close buttons, and in-image controls (product image thumbnails on the iPhone buy page).

**`text-link`** — Inline body links in `apple colors.primary` (Action Blue). Underlined or non-underlined per context.

**`text-link-on-dark`** — Inline body links on dark tiles in `apple colors.primary-on-dark` (Sky Link Blue #2997ff) — Action Blue would disappear against `apple colors.surface-tile-1`.

#### Cards & Containers

**`product-tile-light`** — Full-bleed light tile. Background `apple colors.canvas` (white), text `apple colors.ink`, rounded `apple rounded.none` (0 — tiles touch edges), vertical padding `apple spacing.section` (80px). Centered stack: product name in `apple typography.display-lg` (40px / 600) → one-line tagline in `apple typography.lead` (28px / 400) → two `apple component.button-primary` CTAs ("Learn more" / "Buy") → product render resting on the surface with the system shadow.

**`product-tile-parchment`** — Same as `apple component.product-tile-light` but on `apple colors.canvas-parchment` (#f5f5f7). Used to break two consecutive white tiles.

**`product-tile-dark`** — Full-bleed dark tile. Background `apple colors.surface-tile-1` (#272729), text `apple colors.on-dark`, rounded `apple rounded.none`, vertical padding `apple spacing.section` (80px). Same content stack as the light tile but with `apple component.text-link-on-dark` for inline copy and `apple component.button-primary` (Action Blue still works on the dark surface). Used on the homepage product grid as the alternating dark band.

**`product-tile-dark-2`** — Variant on `apple colors.surface-tile-2` (#2a2a2c). Used where a dark tile sits directly above or below `apple component.product-tile-dark` to create the faintest separation through micro-step lightness change.

**`product-tile-dark-3`** — Variant on `apple colors.surface-tile-3` (#252527). Used at the bottom of the stack and in embedded video/player frames.

**`store-utility-card`** — Used in store grid and accessories grid. Background `apple colors.canvas` (white), 1px solid `apple colors.hairline` border, rounded `apple rounded.lg` (18px), padding `apple spacing.lg` (24px). Top: product image (1:1 crop with `apple rounded.sm` (8px) inner image radius). Below: product name in `apple typography.body-strong` (17px / 600), price in `apple typography.body` (17px / 400), and a `apple component.text-link` ("Buy" or "Learn more"). No shadow by default; product render itself carries the system product-shadow.

**`configurator-option-chip`** — Pill-shaped tappable cell used in the iPhone 17 Pro buy page. Background `apple colors.canvas`, text `apple colors.ink` in `apple typography.caption`, rounded `apple rounded.pill`, padding 12px × 16px. Contains a small product thumbnail + label + price delta. Arranged in a grid of 4–5 options per row.

**`configurator-option-chip-selected`** — Selected state. Border upgrades to 2px solid `apple colors.primary-focus`. Same shape, same content.

**`environment-quote-card`** — A photographic-canvas hero specific to the environment page. Dark photographic backdrop (mountain vista at dawn) with `apple colors.surface-tile-1` as the fallback color, centered white-text headline in `apple typography.display-lg` (40px), small green "Apple 2030" pictographic logo above the headline, single `apple component.button-primary` below. Padding `apple spacing.section` (80px).

**`floating-sticky-bar`** — Floats at the bottom of the viewport on the iPhone 17 Pro buy page during scroll. Background `apple colors.canvas-parchment` at 80% opacity with `backdrop-filter: blur(N)`, height 64px, padding 12px × 32px. Left: running price total in `apple typography.body`. Right: `apple component.button-primary` ("Add to Bag").

#### Inputs & Forms

**`search-input`** — The accessories search input. Background `apple colors.canvas`, text `apple colors.ink` in `apple typography.body` (17px), 1px solid `rgba(0, 0, 0, 0.08)` border, rounded `apple rounded.pill` (full pill — search is also pill-shaped, matching the CTA grammar), padding 12px × 20px, height 44px. Leading icon: search glyph at 14px, muted tint.

Error and validation states were not surfaced in the analyzed pages.

#### Footer

**`footer`** — Background `apple colors.canvas-parchment` (#f5f5f7), text `apple colors.ink-muted-80`. Link columns in `apple typography.dense-link` (17px / 400 / 2.41 line-height — the relaxed leading is what makes the dense columns scannable). Column headings in `apple typography.caption-strong` (14px / 600). Legal row at the very bottom in `apple typography.fine-print` (12px / 400) with `apple colors.ink-muted-48` text. Vertical padding 64px.

### Do's and Don'ts

#### Do
- Use `apple colors.primary` (Action Blue #0066cc) for every interactive element — links, pill CTAs, focus signals — and nothing else. The single accent is non-negotiable.
- Set headlines in `apple typography.hero-display` or `apple typography.display-lg` with negative letter-spacing (`-0.28 → -0.374px`) to get the signature "Apple tight" cadence.
- Run body copy at `apple typography.body` (17px / 400 / 1.47 / -0.374px) — not 16px. The extra pixel defines the brand's reading pace.
- Alternate `apple component.product-tile-light` (or parchment) and `apple component.product-tile-dark` for full-bleed section rhythm. The color change IS the divider.
- Reserve `apple rounded.pill` for the primary blue CTA and any other element that should read as an "action" (configurator chips, search input, sticky bar CTA).
- Apply the single product-shadow (`rgba(0, 0, 0, 0.22) 3px 5px 30px`) only to product renders resting on a surface — never on cards, buttons, or text.
- Use `transform: scale(0.95)` as the active/press state on every button — it's the system-wide micro-interaction.
- Keep the global nav `apple colors.surface-black` (true black) — it's the only place pure black appears on most pages.

#### Don't
- Don't introduce a second accent color; every "click me" signal is `apple colors.primary` (Action Blue).
- Don't add shadows to cards, buttons, or text — shadow is reserved for product imagery.
- Don't use gradients as decorative backgrounds; atmosphere comes from photography.
- Don't set body copy at weight 500 — Apple's ladder is 300 / 400 / 600 / 700, with 500 deliberately absent. Body is always 400; strong inline is 600; display is 600.
- Don't round full-bleed tiles — tiles are rectangular and edge-to-edge; the color change is the divider.
- Don't tighten line-height below 1.47 for body copy — the editorial leading is part of the brand.
- Don't mix radii grammars — use `apple rounded.sm` for compact utility, `apple rounded.lg` for utility cards, `apple rounded.pill` for pills, and nothing in between (except the rare `apple rounded.md` Pearl Button).
- Don't use `apple colors.primary-on-dark` (Sky Link Blue) on light surfaces — it's the dark-tile-only variant. Action Blue is for light surfaces.

### Responsive Behavior

#### Breakpoints

| Name | Width | Key Changes |
|---|---|---|
| Small phone | ≤ 419px | Single-column tiles; sub-nav collapses to category name + primary CTA only; hero typography drops to 28px |
| Phone | 420–640px | Single-column stack; product renders scale to 80% of tile width; hero h1 drops to 34px |
| Large phone | 641–735px | Tiles transition to tighter padding (48px vertical vs 80px); fine-print wraps |
| Tablet portrait | 736–833px | Global nav collapses to hamburger; sub-nav hides category chips, keeps primary CTA |
| Tablet landscape | 834–1023px | Global nav returns fully expanded; 3-column utility grids become 2-column |
| Small desktop | 1024–1068px | Product tiles use 2/3 width with margin gutters; hero h1 stays at 40px |
| Desktop | 1069–1440px | Full layout; 4–5 column store grids; 1440px content max |
| Wide desktop | ≥ 1441px | Content locks at 1440px, margins absorb extra width |

The structural breakpoints that matter for agents: 1440px (content lock), 1068px (small-desktop), 833px (tablet landscape switch), 734px (tablet portrait), 640px (phone), 480px (small phone).

#### Touch Targets
- Minimum 44 × 44px. `apple component.button-primary` lands at ~44 × 100px (with the full-pill radius making the visible hit area more generous than the label suggests).
- `apple component.button-icon-circular` is exactly 44 × 44px.
- Global nav utility links are smaller (~32 × 80px) — they deliberately sit at a tighter target because they're precision desktop actions, and the mobile hamburger replaces them at ≤ 833px.

#### Collapsing Strategy
- **Global nav**: full horizontal link row on desktop → collapses to Apple logo + hamburger + bag icon at 834px and below.
- **Sub-nav**: category name + inline links + primary CTA → category name + primary CTA only at mobile; inline links move into a hamburger tray.
- **Product tiles**: stack from 2-column to 1-column at 834px; vertical padding tightens from 80px → 48px at small-phone.
- **Utility grids** (store, accessories): 5-col → 4-col (1440px) → 3-col (1068px) → 2-col (834px) → 1-col (640px).
- **Hero typography**: `apple typography.hero-display` (56px) → `apple typography.display-lg` (40px) at 1068px → 34px at 640px → 28px at 419px.

#### Image Behavior
- All product imagery uses responsive `srcset` with breakpoint-matched crops.
- Hero photography may switch art direction at mobile (e.g., the environment page's vista crops to a taller aspect ratio on mobile, framing the subject differently).
- Product renders maintain their 1:1 or 4:3 aspect ratios across breakpoints; only scale changes.
- Lazy-loading is default; the above-fold hero loads eagerly.

### Iteration Guide

1. Focus on ONE component at a time. Reference its YAML key directly (`apple component.product-tile-dark`, `apple component.search-input`).
2. Variants of an existing component (`-active`, `-focus`, `-2`, `-3`) live as separate entries in `components:`.
3. Use `apple token.refs` everywhere — never inline hex.
4. Never document hover. Default and Active/Pressed states only.
5. Display headlines stay SF Pro Display 600 with negative letter-spacing. Body stays SF Pro Text 400 at 17px. The boundary is unbreakable.
6. The single drop-shadow (`rgba(0, 0, 0, 0.22) 3px 5px 30px`) is reserved for product photography only.
7. When in doubt about emphasis: alternate surface (light → dark tile) before adding chrome.

### Known Gaps

- Form validation and error states were not surfaced on the analyzed pages; only the neutral search input is documented.
- The homepage's embedded video/player frame uses `apple colors.surface-black`; interior player controls are not documented (they're a platform widget, not a web-design token).
- Some component imagery is dynamic (rotating product hero) and its specific copy varies per surface — component specs name the structure, not the rotating content.
- Dark-mode counterparts for store and accessories utility cards were not surfaced on the analyzed pages; the system documented is the daytime/light-dominant variant Apple ships by default.
- Atmospheric photography (environment page mountain vista) is a content asset, not a design token; the documented `apple component.environment-quote-card` describes the structural surface only.
- The exact backdrop-filter blur radius on `apple component.sub-nav-frosted` and `apple component.floating-sticky-bar` is platform-dependent; production CSS uses `saturate(180%) blur(20px)` as a typical baseline but the value isn't formalized as a token.
