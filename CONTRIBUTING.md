# Contributing

Thanks for your interest in OnPurpose. The project is in early development with
a single maintainer (called "the founder" throughout the docs). Bug reports,
phone test results and suggestions are welcome as GitHub issues.

## Before you start

- Read [PROJECT_GOALS.md](PROJECT_GOALS.md). The core goal is quick, reliable,
  familiar-position habit tracking. Changes that add navigation, dashboards,
  accounts or a backend need a clear requirement first.
- Open an issue to discuss any change that expands product scope before you
  build it.
- **Sign the contributor licence agreement.** Before your first pull request
  can be merged, sign the [CLA](CLA.md). The CLA Assistant bot comments on your
  pull request with a link; signing takes a minute with your GitHub account and
  covers your future contributions too. If the bot hasn't commented, ask in the
  pull request.

## Why there is a CLA

The founder is the sole copyright holder of OnPurpose. That keeps the project
open source under the GPL while letting the founder publish the app through app
stores, whose terms are not compatible with the GPL. The CLA preserves this.
You keep the copyright in your contribution and grant the founder a broad
licence to use it, including outside the GPL. In return, the founder commits to
keeping every accepted contribution available under GPLv3 or later. Read the
[agreement](CLA.md) for the exact terms.

## Making a change

1. Use Node.js 24 and npm. Run `npm ci`, then follow the
   [development guide](docs/DEVELOPMENT.md) to run the app.
2. Keep the change focused, and match the style of the surrounding code.
3. Run `npm run check` and `npm test`. For changes that affect native imports,
   Expo configuration or platform-specific code, also run `npm run export:ios`
   and `npm run export:android`. CI runs `check`, `test` and `export:ios` on
   every push and pull request.
4. Check behaviour on a phone where it matters, following
   [TESTING.md](docs/TESTING.md). Report which checks ran and what remains
   unverified on a device.

## Pull requests

Explain the user-visible problem, the resulting behaviour and how you verified
it. Include a screenshot or recording when it helps assess a UI change.

## Documentation

Update the relevant doc when you change setup, behaviour or architecture.
Describe the current state in place rather than appending a dated narrative.
Record decisions and their reasons in [DECISIONS.md](docs/DECISIONS.md), and
dated test evidence in [TEST_LOG.md](docs/TEST_LOG.md).
[docs/README.md](docs/README.md) lists every guide.

## Data and secrets

Keep demo and sample data separate from real user data. Never commit
credentials, signing keys, tokens, `.env.local`, phone captures or real habit
data. `EXPO_PUBLIC_*` variables are embedded in the app, so they are never
secret.

## AI coding assistants

If you use an AI coding assistant, point it at [AGENTS.md](AGENTS.md). That file
holds the project's architecture rules and invariants.
