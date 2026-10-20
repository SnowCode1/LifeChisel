# Landing page

The public landing page lives in `apps/landing`. It uses the name LifeChisel
(the repository and domain name); the final brand is still open, and the web
app still says OnPurpose. The layout came from rounds of mockups with the
founder (design "G", 16 October 2026); the wording and section order were
rewritten from mockup "A" (20 October 2026). See DECISIONS.md.

## What it is

- **Plain static HTML and CSS**, built with Vite, with no framework. A landing
  page is read, not used, so all of its text is in `index.html`, where it loads
  fast and search engines can read it. Small scripts in `src/` add the
  pictures and interactive examples on top.
- **One page, always dark on pure black** (founder decision: black says
  minimal best). Text and section headings are Instrument Sans; Gabarito, a
  bold geometric face, is kept for the hero headline, the wordmark and the
  closing line (founder choices). Both are bundled from
  `@fontsource-variable` packages so the page makes no requests to font
  services. Colours and fonts are tokens at the top of `src/styles.css`.
- **Sections, in order:** header; hero (headline, large store and browser
  buttons, the Everyday screenshot with the web app's sidebar cropped off);
  three reasons to use it on the left and, on the right, a large app icon,
  the wordmark, the free tier and the store buttons again (arranged like
  Obsidian's page); then one section per thing it does for you, each with a
  small
  label, an outcome heading, two short paragraphs and a picture beside it
  (alternating sides): the grid, the four kinds of habit, goals; the five
  example setups in a carousel; the interactive statistics example; notes;
  History and Undo; pricing with short questions; a closing call to action
  under the large icon; footer.
- **Detail only on request.** The full list of goal repeats, chart
  explanations, what History keeps and the pricing questions sit in
  `<details>` elements that open on a click.

## Founder direction

The founder's preferences from the mockup rounds (15–16 October 2026). Follow
them when changing the page, and record new feedback here.

**Look**

- Black background and a minimal look. A light, warm "Paper" version was tried
  and not chosen.
- Instrument Sans for text and section headings, with a bold geometric
  display face (Gabarito) only for the few big moments: the hero headline,
  the wordmark and the closing line. Using it everywhere makes the page too
  intense (founder, 20 October 2026). The founder asked for something like
  the headings on Obsidian's and MacroFactor's sites, both bold geometric
  faces; Instrument Serif was tried the same day and rejected because its
  curvy italic style clashed with the rest of the page. Sora, Outfit, Red
  Hat Display, Plus Jakarta Sans, a wide Archivo and Unbounded were compared
  for the display face. Instrument Sans was chosen on 16 October over Geist
  (too generic), Inter, Manrope, Plus Jakarta Sans, Schibsted Grotesk, Space
  Grotesk and a Bricolage Grotesque heading pairing.
- Large download buttons with the platform's picture, near the top, again
  under a large app icon in the middle, and at the end, like Obsidian's
  page. The official App Store and Google Play badges replace them once the
  store links exist.
- The chosen layout grew out of the "phone and browser" showcase direction:
  a centred headline over a browser-sized grid beside a phone-sized one. The
  first scaffold's layout, the light editorial version, an interactive
  try-it demo grid and a quiet single-column version were tried and not
  chosen.
- Visual polish matters beyond the font; refine spacing, alignment and
  details by checking the rendered page, not only the code.

**Content to keep**

- The headline "The habit grid built for muscle memory." is still the
  founder's favourite, but alternatives are being explored (20 October 2026).
  "The habit tracker you'll still be using in March." was tried with mockup A
  and rejected.
- The four habit kinds (checkbox, number, category, text), each shown with
  real-looking cells.
- Goals, and that each habit's goal is customisable.
- History with Undo.
- Statistics showing the real range of charts, not a single basic view (now
  headed "Look back and notice things.").
- A carousel of the five sample presets, with captions, using real
  screenshots of the app.
- Open source, with a link to the GitHub repository.
- Pricing and the free tier as they stand.

**How to say it**

- Explain what the app does for the reader, not what it has (founder feedback,
  20 October 2026: the earlier page read like a robotic feature list).
  Obsidian's page was the model: each section heading names an outcome ("See
  your whole week at a glance", "Mistakes take one tap to fix"), a small label
  above it names the feature, and two or three plain sentences explain how.
  Use real examples (three times a week, five days on and two off) rather
  than general claims, and write the way a person talks: "you", contractions,
  short sentences.
- Still plain and specific. Avoid wording that sounds generated or like
  marketing ("versatile", "seamless", "powerful"): the founder rejected "Every
  change remembered. Any of them undone." for that reason. No big promises
  about changing someone's life. The three short reasons under the hero
  ("Quick to fill in.", "Fits the way you live.", "Yours to keep.") were
  accepted with mockup A.
- Do not state the obvious. "Rows stay where you put them" was removed for
  saying nothing a visitor needed.
- Keep extra detail behind clickable sections (`<details>`) so the page stays
  short for people who only skim.

**Scope**

- Describe the product at launch, not the current state: iPhone, Android and
  the web app, and use either on one device or with an account synced between
  devices. Do not say "no account needed", because accounts and sync are
  planned.
- Not decided, so not on the page: whether sync is free or part of the
  unlock, the store links, the final brand and the domain.

## Scripts

| File              | What it does                                                                                                                                                                                                                                                                |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/main.ts`     | Points the web app and store links at `src/config.ts`, fills in the year and starts the others                                                                                                                                                                              |
| `src/grid.ts`     | Draws the decorative week grid beside "See your whole week at a glance" from fictional habits, dated so the rightmost column is the visitor's Today (four days on phones); hidden from screen readers                                                                       |
| `src/carousel.ts` | The example carousel: a sideways scroll-snap track that also works by swiping, with name pills, arrows and arrow keys; the track takes the height of the slide in view                                                                                                      |
| `src/stats.ts`    | A year of fictional reading minutes shown like the apps' statistics screen: 30 days, 90 days and Year, headline, tiles and six charts with one reading line. Every figure is worked out from the generated days. It is a demonstration; the apps' calculations stay in core |

## Screenshots

`public/screenshots/` holds the carousel images: each sample preset from
`dev/samplePresets.ts`, captured from the web app at 1200 px wide
(`<id>.webp`) and at 390 px for phones (`<id>-phone.webp`), both at 2× and
cropped to the grid. The hero reuses the Everyday pair, cropped further by
CSS on wide screens to hide the web app's sidebar. They were taken in a
headless browser from
`npm run web:dev` with `?sample=<id>`, after removing the development-only
sample controls and pressing Today. Retake them when the grid's look changes,
and update each image's `width` and `height` in `index.html`.

## Content rules

The page describes the product as it will be at launch (founder decision, 16
October 2026), not the current development state: the iPhone and Android
apps, the web app, and optional sign-in with sync between devices. Pricing is
the free tier of five active habits plus the one-time US$9.99 unlock, and
records, History, exports and backups are never locked. Wording stays plain
and specific (founder feedback: avoid copy that sounds generated or like
marketing). Keep maintainer-only planning out of the page.

Before the page is published, set the store links in `src/config.ts`; until
then the iPhone and Android buttons point at the closing section.

## Where the links go

`src/config.ts` holds `APP_URL` (`/app/` in builds, which assumes the web app is
served under the same site, and the web app's development server
`http://localhost:5173/` in development) and `STORE_URLS`. Both sites are
hosted together on Vercel; see Hosting in [WEB.md](WEB.md#hosting).

`npm run web:dev` (`scripts/web-dev.mjs`) starts both development servers, so
the web app's brand and this page's links reach each other. Both ports are
strict: a busy port stops that one server rather than moving it to a port the
links do not point at.

## Commands

Run from the repository root:

| Command                   | Use                                                       |
| ------------------------- | --------------------------------------------------------- |
| `npm run landing:dev`     | Development server on port 5175 (this page only)          |
| `npm run landing:build`   | Typecheck and build static files into `apps/landing/dist` |
| `npm run landing:preview` | Serve the production build locally (port 4175)            |

`npm run check` typechecks the landing page with both apps.

## Not done yet

- Store listings and their links.
- A privacy policy and imprint, which store listings will need.
- Final brand and analytics (if any) for the page. The domain (lifechisel.app)
  and hosting are chosen but the site is private until launch. The page says
  LifeChisel while the web app and the screenshots still say OnPurpose; retake
  the screenshots once the app is renamed.
- Social preview images (`og:image`) and a sitemap.
