# OnPurpose

A habit tracker built around one fast screen: habits down the side, days across
the top, and a tap to record. The aim is to make tracking so quick that it
becomes a seamless part of the day. Open the app, tap a familiar position, and
get on with life.

**Status: early development.** The app is not yet in any app store and the name
is provisional. It runs on iPhone and Android; which launches first is still
being decided. Data stays on the device: there is no account, server or sync.

## Features

- **Habit-by-day grid.** Rows keep the order you choose. Scroll back through
  history, or pull past today to reveal future dates. It adapts to portrait and
  landscape.
- **Four entry types.** Checkbox, daily total (numeric), categories, and free
  text.
- **Goals that change over time.** Per-day conditions, weekday schedules, period
  quotas (at least, at most or between N days per week or interval) and on/off
  cycles. Each goal version applies from a chosen date, so earlier results stay
  as they were.
- **Statistics per habit.** Completion, streaks, trends, calendars, time of day
  and category frequency.
- **Notes.** Markdown notes per habit, with a full-screen editor, links,
  recoverable drafts and version history.
- **History and Undo.** Every change goes into an append-only local log.
  History groups rapid corrections and supports Undo and Redo. Backups export
  and restore the full log.
- **Personalisation.** Colours and optional emoji or icons for each habit.
  System, dark and light themes with custom backgrounds. Adjustable grid sizes,
  text size and checkbox style. An option to hide habits completed today.

Not yet built: comments, skipped or excused days, and sync. The plan is a free
tier plus a one-time unlock; see [project goals](PROJECT_GOALS.md).

## Getting started

You need Node.js 24 (see `.nvmrc`), npm and git. To run the app on a phone you
also need Expo Go for SDK 57; a simulator or emulator works too.

```sh
git clone https://github.com/SnowCode1/OnPurpose.git
cd OnPurpose
npm ci
npm start
```

Sign in to the same Expo account on the computer and in Expo Go, then scan the
terminal's QR code with the phone. Keep both on the same network. You don't need
an environment file. For phone setup,
Android over USB and troubleshooting, see the
[development guide](docs/DEVELOPMENT.md).

```sh
npm run web             # browser preview, useful for layout only
npm run check           # TypeScript, lint and formatting
npm test                # storage, replay, date, layout and other test suites
npm run export:ios      # verify the iOS JavaScript bundle (not a signed build)
npm run export:android  # verify the Android JavaScript bundle
```

Optional maintainer tooling is described in the development guide: phone
screenshot sharing, isolated sample data and grid performance diagnostics.

## Documentation

- [Project goals](PROJECT_GOALS.md): purpose, confirmed requirements and open
  questions
- [Documentation index](docs/README.md): every guide, grouped by topic
- [Development setup](docs/DEVELOPMENT.md) and [testing](docs/TESTING.md)
- [Architecture](docs/ARCHITECTURE.md) and [storage design](docs/STORAGE.md)
- [Decision log](docs/DECISIONS.md)
- [Contributing](CONTRIBUTING.md)
- [Instructions for AI coding assistants](AGENTS.md) (also loaded through
  [CLAUDE.md](CLAUDE.md))

## Licence

Copyright (C) 2026 Daniel Adams

This program is free software: you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation, either version 3 of the License, or (at your option) any later
version. It is distributed WITHOUT ANY WARRANTY; see [LICENSE](LICENSE) for the
full terms.

The licence covers the code, not the project's name or app icon. Forks must use
a different name and icon. Contributions are accepted under the
[contributor licence agreement](CLA.md).

Third-party notices, including the Expo template's MIT notice, are kept in
[docs/licenses](docs/licenses/README.md).
