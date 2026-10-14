# Documentation

Start with [PROJECT_GOALS.md](../PROJECT_GOALS.md) for the product's purpose,
confirmed requirements and open questions.

## Working on the code

| Document                           | Purpose                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------- |
| [DEVELOPMENT.md](DEVELOPMENT.md)   | Setup on Linux, Windows or macOS; iPhone, Android and web; commands; optional tooling |
| [ARCHITECTURE.md](ARCHITECTURE.md) | How the app is structured, subsystem responsibilities, known limits                   |
| [STORAGE.md](STORAGE.md)           | Event log, replay, Undo, versions, backup format                                      |
| [WEB.md](WEB.md)                   | The browser app, the shared core package, web storage and commands                    |
| [LANDING.md](LANDING.md)           | The static landing page scaffold, its content rules and commands                      |
| [PERFORMANCE.md](PERFORMANCE.md)   | Grid rendering design, diagnostics and investigation log                              |
| [TESTING.md](TESTING.md)           | Automated checks, phone regression checklist, usability study                         |
| [RELEASING.md](RELEASING.md)       | Internal builds, TestFlight, the in-app unlock and the path to the App Store          |

## Features

| Document                                   | Purpose                                                     |
| ------------------------------------------ | ----------------------------------------------------------- |
| [HABIT_MANAGEMENT.md](HABIT_MANAGEMENT.md) | Adding, editing, reordering, archiving and deleting habits  |
| [GOALS.md](GOALS.md)                       | Completion goals, schedules, period quotas and cycles       |
| [STATISTICS.md](STATISTICS.md)             | Per-habit statistics screens and how results are calculated |
| [DESCRIPTIONS.md](DESCRIPTIONS.md)         | Markdown notes, the editor, drafts and note history         |
| [SETTINGS.md](SETTINGS.md)                 | Every setting, its default, and how preferences are stored  |
| [HABIT_ICONS.md](HABIT_ICONS.md)           | Emoji and icon-pack habit symbols                           |

## Records

| Document                                 | Purpose                                               |
| ---------------------------------------- | ----------------------------------------------------- |
| [DECISIONS.md](DECISIONS.md)             | Decisions, their rationale and what would change them |
| [TEST_LOG.md](TEST_LOG.md)               | Dated phone and automated test evidence               |
| [licenses/README.md](licenses/README.md) | Third-party notices                                   |

## Conventions

- **Founder** means the project owner and maintainer. **Assistant** means an AI
  coding assistant used during development. The docs record which decisions the
  founder made and which are assistant proposals awaiting review.
- Guides describe current behaviour. History belongs in DECISIONS.md and
  TEST_LOG.md.
- Do not mark phone tests or milestones complete until they have actually
  happened.
