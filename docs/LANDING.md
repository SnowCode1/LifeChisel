# Landing page

The public landing page lives in `apps/landing`. It is a scaffold: the
structure and styling are in place, and the copy is a first draft for the
founder to rewrite. OnPurpose is still a working name.

## What it is

- **Plain static HTML and CSS**, built with Vite, with no framework. A landing
  page is read, not used, so it loads fastest and is indexed best as static
  markup. `src/main.ts` only points the "Open the web app" links at the web
  app and fills in the year.
- **One page:** a header (brand, Features, Pricing, Source and Open the web
  app), a hero with a picture of the grid, six features, pricing, and a
  footer with the copyright and licence.
- **The grid picture** is a static, decorative HTML table (hidden from screen
  readers), drawn in the apps' default dark theme with habit colours from the
  presets. At phone width it keeps Today and the three days before it.
- **Theme:** dark by default, with a light version on warm Paper following the
  system setting. Colours are tokens at the top of `src/styles.css`, and the
  font is set once in `--font-ui` (the system font, as in the apps).

## Content rules

The copy may only claim confirmed scope from PROJECT_GOALS.md: the grid and
fixed row order, the four entry types, dated goals and quotas, statistics,
History with Undo, backups, storage on the device without an account, the GPL
licence, and the free tier of five active habits plus the one-time US$9.99
unlock (records, History, exports and backups never locked). Store apps are
described as coming soon until they are published. Do not promise sync, the
Loop import or other planned features as available, and keep maintainer-only
planning out of the page.

## Where the web app is

`src/config.ts` holds `APP_URL`, the page's only setting: `/app/` in builds,
which assumes the web app is served under the same site, and the web app's
development server (`http://localhost:5173/`) during development. Hosting is
not chosen yet; change it there when it is.

## Commands

Run from the repository root:

| Command                   | Use                                                       |
| ------------------------- | --------------------------------------------------------- |
| `npm run landing:dev`     | Development server on port 5175                           |
| `npm run landing:build`   | Typecheck and build static files into `apps/landing/dist` |
| `npm run landing:preview` | Serve the production build locally (port 4175)            |

`npm run check` typechecks the landing page with both apps.

## Not done yet

- Real screenshots or a short video of the apps, store badges and links.
- A privacy policy and imprint, which store listings will need.
- Final brand, domain, hosting and analytics (if any) for the page.
- Social preview images (`og:image`) and a sitemap.
