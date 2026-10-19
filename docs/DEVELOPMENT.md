# Development setup

This guide covers setting up a computer to run OnPurpose, the project commands,
testing on an iPhone or Android phone, and the optional tooling the maintainer
uses for phone testing. Development happens on Linux and Windows without a Mac.
The primary test device is a physical iPhone 16 Pro (iOS version still to be
recorded); a Samsung Galaxy S21 (Android 15) is used over USB. macOS also works
and adds the iOS Simulator.

Setup steps were checked against official sources on 4 October 2026, and the
Expo Go notes on 10 October 2026. Versions and service requirements change;
recheck the linked sources before an upgrade or release.

## What the tools mean

- **React:** the system for describing the interface and how it responds to taps.
- **React Native:** renders that interface using native phone controls.
- **TypeScript:** JavaScript with checks that catch many mistakes before running.
- **Expo:** the tools and compatible libraries around React Native.
- **Metro:** the local server that sends development JavaScript to the phone.
- **Expo Go:** a prebuilt app for trying supported Expo code on your phone.
- **Development build:** your own app with development tools and your native
  dependencies; needed as the project moves toward production.
- **EAS Build / Submit:** Expo's cloud build and upload services. They build iOS
  apps on hosted Macs and send them to App Store Connect, so no Mac is needed.

React Native with Expo is the project's implementation choice, not the only way
to make an iOS app. It suits development on Linux and Windows with a physical
iPhone. The app was generated from `blank-typescript@sdk-57` using
create-expo-app 5.0.0.

## Prerequisites

- **Node.js 24.** `package.json` requires `>=24 <25`, and `.nvmrc` selects 24
  for nvm users. The tests use Node 24's built-in SQLite binding.
- **npm**, which comes with Node. `package-lock.json` pins the exact
  dependencies; install them with `npm ci`.
- **git.**
- **A device or simulator:** Expo Go for SDK 57 on an iPhone or Android phone
  (see [Expo Go and SDK versions](#expo-go-and-sdk-versions)), the iOS Simulator
  on macOS, or an Android emulator.
- **Optional:** Android SDK Platform-Tools (`adb`) for an Android phone over USB.

No env file is needed to run the app. `.env.local` only holds the
[optional development flags](#optional-development-flags).

## First run

1. Clone the repository and run `npm ci` in its folder.
2. On an iPhone, install
   [Expo Go from the App Store](https://apps.apple.com/app/expo-go/id982107779).
   The listing checked on 4 October 2026 offered version 57.0.9 (React Native
   0.86), requiring iOS 16.4 or later. For an Android phone, follow
   [Android phone over USB](#android-phone-over-usb) instead of steps 3–4.
3. On a physical iPhone, Expo's current documentation says Expo Go opens a
   project only when Expo CLI and Expo Go are signed in to the same Expo account.
   Create a free account if needed, run `npx expo login` in this folder, and sign
   in to Expo Go with the same account. Enter credentials only in the terminal or
   the app, never in project files.
4. Put the computer and phone on the same Wi-Fi network and run `npm start`.
   Scan the terminal's QR code with the iPhone Camera and open the link in Expo
   Go. Allow local-network access if iOS asks.
5. Tap checkbox cells in the sample grid; a second tap unchecks them. Tap a
   numeric cell to enter a daily total. Tap a name to open its Notes/Statistics
   sheet; hold a name for actions or drag-to-reorder. Entries and settings save
   locally, so a reload keeps them.
6. Edit `App.tsx` and save. The phone should refresh with the change.

### Simulators, emulators and the browser

- **macOS:** after `npm start`, press `i` to open the iOS Simulator (Xcode
  required). Expo CLI installs a matching Expo Go in the simulator.
- **Android emulator:** with an emulator running, press `a` after `npm start`.
- **Linux and Windows** cannot run the iOS Simulator, Xcode or `expo run:ios`.
  Use a physical iPhone, and EAS for iOS builds (see [RELEASING.md](RELEASING.md)).
- **Browser app:** `npm run web:dev` runs the separate browser app in
  `apps/web` (port 5173) together with the landing page (port 5175), so the
  links between them work; see [WEB.md](WEB.md).
- **Landing page:** `npm run landing:dev` runs only the static landing page in
  `apps/landing`; see [LANDING.md](LANDING.md).
- **Expo browser preview:** `npm run web` is a limited preview of the phone screens. It stores data in browser
  `localStorage` (`packages/core/src/storage/browserRepository.ts`), not SQLite, and shows a
  notice instead of the habit grid, because the Skia canvas grid is built for
  phones only and web is not developed. It is not evidence that the app behaves
  correctly on a phone.

### Portrait and landscape

The app permits rotation, and the grid measures usable width after safe-area
insets. Turn off the iPhone's Portrait Orientation Lock to test landscape. After
changing `app.json`, exit and reopen the project in Expo Go so the manifest
reloads; Fast Refresh alone may keep the previous orientation setting. Test
numeric entry with the keyboard open in landscape as well as the main grid.

## Expo Go and SDK versions

The project uses Expo SDK 57. Store builds of Expo Go support one SDK at a time,
and Expo has announced a store release that supports only SDK 58
([expo.dev/go](https://expo.dev/go) still listed SDK 57 as the latest on
10 October 2026). Once the store version moves to SDK 58 it will not open this
project. Check the SDK of your installed Expo Go, then:

- **Android:** install the SDK 57 Expo Go build from
  [expo.dev/go](https://expo.dev/go). To stop Google Play replacing it, open Expo
  Go in Google Play, tap ⋮ and untick **Enable auto update**.
- **macOS:** use the iOS Simulator; Expo CLI installs the matching Expo Go there.
- **iPhone:** the App Store offers only the current Expo Go. Turning off
  automatic app updates delays the change. After that, use a development build
  (see [RELEASING.md](RELEASING.md); it needs an Apple Developer membership) or
  wait for the project's SDK 58 upgrade.

Trust the installed Expo Go version and the current download page over older
Expo troubleshooting pages, some of which describe an earlier freeze at SDK 54.

## Commands

| Command                         | Use                                                                         |
| ------------------------------- | --------------------------------------------------------------------------- |
| `npm start`                     | Start Expo Go development on port 8081 over the local network               |
| `npm run start:clear`           | Start with a cleared Metro cache                                            |
| `npm run start:tunnel`          | Try a tunnel if Wi-Fi isolation blocks local access                         |
| `npm run android`               | Forward port 8081 over USB with `adb reverse` and open Expo Go on the phone |
| `npm run web`                   | Limited Expo browser preview; the grid shows a notice (browser storage)     |
| `npm run web:dev`               | Browser app (`apps/web`) and landing page development servers               |
| `npm run web:build`             | Typecheck and build the browser app into `apps/web/dist/`                   |
| `npm run web:preview`           | Serve the browser app's production build locally                            |
| `npm run sync:dev`              | Sync server (`apps/sync`) locally with a local D1 database; see SYNC.md     |
| `npm run sync:build`            | Bundle both sync server environments without deploying                      |
| `npm run sync:deploy:dev`       | Deploy the development sync server (after the setup in SYNC.md)             |
| `npm run typecheck`             | TypeScript checks for the phone, web, landing and sync code                 |
| `npm run lint`                  | ESLint checks                                                               |
| `npm run format`                | Format the repository with Prettier                                         |
| `npm run format:check`          | Check formatting without changing files                                     |
| `npm run check`                 | Typecheck, lint and format check together                                   |
| `npm test`                      | Full Node suite (`scripts/`, `apps/web/test/`) with heap and time limits    |
| `npm run test:calendar`         | Calendar and local-date tests only                                          |
| `npm run test:preview`          | Preview receiver tests only                                                 |
| `npm run doctor`                | Expo's environment and dependency diagnostics                               |
| `npm run export:ios`            | Compile and export the iOS JavaScript bundle and assets locally             |
| `npm run export:android`        | Compile and export the Android JavaScript bundle and assets locally         |
| `npm run android:screenshot`    | Save the USB Android screen to `.dev/android/latest.png`                    |
| `npm run preview:server`        | Optional: receive phone previews (see below)                                |
| `npm run start:compare-dev`     | Optional: development JavaScript on port 8083 for a comparison              |
| `npm run start:production-js`   | Optional: production JavaScript on port 8082 for a comparison               |
| `npm run benchmark:grid`        | Synthetic CPU timings for grid preparation and store edits                  |
| `npm run benchmark:bottlenecks` | Store/repository timings against temporary fictional SQLite files           |

Stop a foreground server with Ctrl+C. Expo's own dependency installer is
`npx expo install <package>`; see [Dependencies](#dependencies).

GitHub Actions (`.github/workflows/check.yml`) runs `npm ci`, `npm run check`,
`npm test` and `npm run export:ios` on Ubuntu, with Node from `.nvmrc`, on every
push and pull request. Run the same locally before opening a pull request, and
add `npm run export:android` when changing platform-specific code.

For a focused suite, keep the same limits as `npm test`, for example:

```sh
node --max-old-space-size=256 --test --test-timeout=15000 scripts/storage.test.mjs
node --max-old-space-size=256 --test --test-timeout=15000 scripts/statistics.test.mjs
```

The tests run the production SQL and replay logic against Node's SQLite binding.
The native bridge, Files UI and phone interactions still need phone testing; see
[TESTING.md](TESTING.md), including how to diagnose runaway tests.

## If the phone will not connect

- Check the same Wi-Fi, local-network permission, the Expo Go SDK and, on an
  iPhone, the same Expo account on the computer and in Expo Go.
- Temporarily disconnect a VPN if it prevents LAN routing. Guest Wi-Fi may
  isolate devices even when the network name is the same.
- Allow the Metro port shown in the terminal (8081 by default) through your
  firewall on your trusted local network. Do not disable the firewall wholesale.
  On Windows, when Windows Defender Firewall asks about Node.js, allow it on
  private networks only, and set your Wi-Fi network's profile to Private
  (not yet verified by the maintainer).
- With an Android phone, use USB instead: `npm run android` forwards the port
  with `adb reverse`, so Wi-Fi is not involved.
- Try `npm run start:tunnel`. Expo may offer to install its ngrok helper; tunnel
  availability depends on an external service and can be slower.
- For SDK mismatches, compare `package.json` with the installed Expo Go version
  (see [Expo Go and SDK versions](#expo-go-and-sdk-versions)). Run
  `npm run doctor`; use `npx expo install --fix` after an intentional upgrade.

## Android phone over USB

Which platform launches first is undecided (see the 12 October 2026 entry in
[DECISIONS.md](DECISIONS.md)). Unlike an iPhone,
an Android phone can be driven from Linux or Windows: `adb` (Android Debug
Bridge) lets the computer, and an AI assistant with terminal access, install,
open, screenshot and read logs from a USB-connected phone.

SDK 57 / React Native 0.86 require **Android 7.0 (API 24) or later** (from
`minSdk` in `node_modules/react-native/gradle/libs.versions.toml`). Check
Settings → About phone → Android version first.

1. On the phone, open Settings → About phone and tap **Build number** seven times
   to show Developer options. In Developer options, turn on **USB debugging**.
2. Install Android SDK Platform-Tools on the computer:
   - **Ubuntu/Debian:** `android-sdk-platform-tools-common` supplies the udev
     rules that let a normal user reach the phone; `scrcpy` is optional screen
     mirroring with mouse and keyboard control.

     ```sh
     sudo apt install adb android-sdk-platform-tools-common scrcpy
     ```

   - **Windows:** install Platform-Tools with Android Studio's SDK Manager (into
     `%LOCALAPPDATA%\Android\Sdk\platform-tools`), with
     `winget install Google.PlatformTools`, or from Google's Platform-Tools zip,
     and make sure the folder containing `adb.exe` is on `PATH`. Samsung phones
     need Samsung's Android USB driver for Windows; other makers publish their
     own (winget and drivers not yet verified by the maintainer).
   - **macOS:** `brew install android-platform-tools` (not yet verified by the
     maintainer).

3. Connect with a data-capable USB cable, unlock the phone and accept **Allow USB
   debugging?** (tick "Always allow from this computer"). `adb devices -l` must
   list the phone as `device`, not `unauthorized` or empty. If the computer does
   not see the phone at all (`lsusb` on Linux, Device Manager on Windows), try
   another cable or port; many cables only charge. On Windows, a missing USB
   driver has the same symptom.
4. Install [Expo Go from Google Play](https://play.google.com/store/apps/details?id=host.exp.exponent)
   or from [expo.dev/go](https://expo.dev/go). Its SDK must match `package.json`
   (57); see [Expo Go and SDK versions](#expo-go-and-sdk-versions).
5. Run `npm run android`. It forwards port 8081 over the cable (`adb reverse`)
   and opens `exp://127.0.0.1:8081` in Expo Go, so Wi-Fi is not involved. Loading
   over Wi-Fi (`exp://<LAN IP>:8081`) failed on the Galaxy S21 for an unknown
   reason (firewall or network), which is why USB is the default route. If Metro
   is already running from `npm start`, run `adb reverse tcp:8081 tcp:8081` and
   `adb shell am start -a android.intent.action.VIEW -d exp://127.0.0.1:8081 host.exp.exponent`.

Useful device commands (read-only unless noted):

| Command                                      | Use                                          |
| -------------------------------------------- | -------------------------------------------- |
| `adb devices -l`                             | Confirm the phone is connected/authorised    |
| `adb shell getprop ro.build.version.release` | Android version                              |
| `npm run android:screenshot`                 | Save the screen to `.dev/android/latest.png` |
| `adb logcat -d -t 300 "*:E"`                 | Recent native errors after a crash           |
| `scrcpy`                                     | Mirror and control the phone on the desktop  |
| `adb reverse tcp:8081 tcp:8081`              | Reach Metro over USB when Wi-Fi blocks it    |

The double quotes around `*:E` work in bash, PowerShell and cmd.exe.
`android:screenshot` is a Node script, so it also works on Windows, where npm
scripts run in cmd.exe. Screenshots taken with adb need no preview receiver,
gesture or pairing token, and stay in ignored `.dev/`. The face-down preview
gesture uploads over Wi-Fi, so it is untested on Android and may hit the same
Wi-Fi block. Expo's "Failed to resolve the Android SDK path" messages are
harmless here: Expo Go needs only `adb`, not the full Android SDK.

Do not install, uninstall or clear app data on a phone that holds real habit
data without the owner's agreement.

## Local storage in development

On a phone, the app keeps a versioned SQLite database across Expo reloads.
Changing code does not wipe the store or reseed sample habits. Expo Go and a
standalone app have separate storage containers, so export a backup before
moving between builds or uninstalling. There is no reset command or destructive
recovery button.

Settings → Backups → Export backup opens the share sheet; choose Save to Files.
Restore backup validates the file first and asks before replacing data,
retaining a local copy. After adding a native storage or file dependency, fully
reload Expo Go (restart Metro with `npm run start:clear` if it cannot resolve an
installed module).

[STORAGE.md](STORAGE.md) states the current event and backup versions. Newer
builds read every older version, but older builds refuse newer data rather than
reset it, so do not go back to an older build after a newer one has written to
the store. The web preview keeps separate data in browser `localStorage`.

## Dependencies

- Install Expo and native packages with `npx expo install <package>` so versions
  match SDK 57. After adding a native or Babel-affecting library, restart Metro
  with `npm run start:clear` and fully reload Expo Go so cached transforms do not
  keep the previous configuration.
- **Skia.** The habit grid's date area is drawn with
  `@shopify/react-native-skia` 2.6.2, which Expo Go for SDK 57 bundles. npm
  blocks the package's install script. Expo Go and EAS builds do not need it
  approved, but a local native build does: approve the script or run
  `npx install-skia`. The web build shows a notice instead of the grid, so a web
  check is not grid evidence.
- **Date picker.** `@react-native-community/datetimepicker` 9.1.0 has its config
  plugin in `app.json` and is
  [included in Expo Go](https://docs.expo.dev/versions/v57.0.0/sdk/date-time-picker/).
  Native builds include it on their next build. The browser preview uses
  `StartDateField.web.tsx` instead of the native picker.
- **Animation and controls.** Reanimated, Worklets, the community Slider and
  Expo LinearGradient use SDK-compatible versions available in Expo Go.
  Reanimated's Babel plugin comes from `babel-preset-expo`, so the project has
  no custom Babel configuration. The grid's scrolling and taps use
  react-native-gesture-handler with `GestureHandlerRootView` at the app root on
  all platforms. See
  [Expo Reanimated setup](https://docs.expo.dev/versions/v57.0.0/sdk/reanimated/).
- **SVG.** Icons use `react-native-svg` 15.15.4, which Expo Go includes. See the
  [Expo SVG reference](https://docs.expo.dev/versions/v57.0.0/sdk/svg/).
- **Notes editor.** The full-screen description editor is a bundled Expo
  DOM/Tiptap surface, and the native readers use `markdown-it`'s browser build;
  neither needs an extra native build. See [DESCRIPTIONS.md](DESCRIPTIONS.md).

### Dependency audit

Run `npm audit`. Current findings are transitive advisories in the Expo and React
Native toolchain. The suggested automatic fixes downgrade Expo and React Native
far below this setup, so do not run `npm audit fix --force`. Expo Doctor's
compatibility checks passing does not resolve these findings. Track upstream
patches and reassess the affected paths before a beta or public release.

## App text sizing

Use `Text`/`TextInput` from `src/Typography.tsx` for app text, and
`useAppWindowDimensions` where layout depends on font scale. The provider
applies only the app's text-size multiplier; native controls keep OS font
scaling. The layout hook combines both scales, as does the DOM editor.
`textSize.ts` owns validated bounds and pure style calculations. Do not scale
nested text independently or override native `defaultProps`. Grid tick and cross
marks use the combined scale explicitly and stay decorative; other fixed
interface icons keep their own sizing.

## Feature documentation

Behaviour is documented with each feature rather than here:

- [HABIT_MANAGEMENT.md](HABIT_MANAGEMENT.md): adding, editing, reordering,
  archiving and deleting habits, and entry types.
- [STATISTICS.md](STATISTICS.md) and [GOALS.md](GOALS.md): statistics screens,
  completion rules, dated goals, period quotas and cycles.
- [DESCRIPTIONS.md](DESCRIPTIONS.md): notes, the editor, drafts and history.
- [HABIT_ICONS.md](HABIT_ICONS.md): emoji and icon catalogues and licences.
- [SETTINGS.md](SETTINGS.md): display preferences, sizes, themes and backups.
- [ARCHITECTURE.md](ARCHITECTURE.md): module layout, including the top bar,
  History and Settings panels.
- [STORAGE.md](STORAGE.md), [PERFORMANCE.md](PERFORMANCE.md) and
  [TESTING.md](TESTING.md): persistence, performance and phone checks.

## Optional development flags

None of these are needed to run the app. To use them, copy `.env.example` to
`.env.local` (ignored by Git) and edit it. After a change, restart `npm start`
and fully reload the app; Fast Refresh does not pick up env changes.

Every tool these flags enable is development-only: the code sits behind
`__DEV__` and is excluded from production JavaScript, even if a flag is left on.
`EXPO_PUBLIC_*` values are embedded in the app bundle, so never put secrets in
them.

| Flag                          | Default in `.env.example` | Enables                                                                                                                                         |
| ----------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `EXPO_PUBLIC_DEV_PREVIEW`     | `false`                   | [Preview sharing](#share-an-app-preview-from-the-phone) to a receiver on your computer; also needed to send grid diagnostics reports            |
| `EXPO_PUBLIC_PREVIEW_URL`     | example address           | The receiver's address: your computer's LAN IP and port, such as `http://192.168.1.100:8765`                                                    |
| `EXPO_PUBLIC_PREVIEW_TOKEN`   | empty                     | The pairing token shared by the app and receiver                                                                                                |
| `EXPO_PUBLIC_DEV_MOCK_DATA`   | `false`                   | Start in [sample data](#sample-data) mode after each full reload                                                                                |
| `EXPO_PUBLIC_DEV_PERFORMANCE` | `false`                   | Timing counters and Settings → Development → [Grid diagnostics](#grid-diagnostics-and-benchmarks)                                               |
| `EXPO_PUBLIC_DEV_COMPARISON`  | unset                     | Set only by the [comparison launchers](#compare-development-and-production-javascript); turns the other tools off. Never put it in an env file. |

## Optional maintainer tooling

The rest of this guide covers tools the maintainer uses for phone testing:
preview sharing, sample data, grid diagnostics and the comparison launchers.
None of them is needed to run the app or contribute.

### Share an app preview from the phone

Preview sharing captures the visible native app from any screen, using a
deliberate face-down-and-back gesture, and uploads a PNG to a receiver on your
computer. The receiver writes `.dev/previews/latest.png` and a dated copy. No
photo-library permission or manual screenshot transfer is needed. This is not
streaming or remote control. If you use an AI coding assistant with workspace
access, it can read `latest.png` directly once the app confirms the save.

1. Copy `.env.example` to `.env.local` if you do not already have one.
2. Set `EXPO_PUBLIC_DEV_PREVIEW=true`.
3. Set `EXPO_PUBLIC_PREVIEW_URL` to your computer's LAN address and port, for
   example `http://192.168.1.100:8765`. Do not use the phone's IP or localhost.
   To find the address:
   - Linux: `ip -4 route get 1.1.1.1` shows it after `src`.
   - Windows: `ipconfig` shows it as the Wi-Fi adapter's IPv4 Address.
   - macOS: `ipconfig getifaddr en0` (not yet verified by the maintainer).
4. Generate a random pairing token with the command in `.env.example` and put it
   in `EXPO_PUBLIC_PREVIEW_TOKEN`. The app and receiver read the same file.
5. Run `npm run preview:server` in a second terminal and leave it running. Run
   one receiver per port; it stops when its terminal closes.
6. Restart `npm start` and fully reload the app in Expo Go.
7. From any screen (including pickers and the description editor), gently turn
   the phone so its screen faces down. Hold until one firm haptic tap (roughly
   half a second), then turn it back toward you within four seconds and pause
   briefly. The settled screen is captured; two firm taps, 110 ms apart, confirm
   that the receiver saved it. This does not use or change Expo Go's shake
   gesture.
8. Holding the month/year label or a dialog or panel title also captures a
   preview. Settings → Development has a **Share preview** button and the gesture
   instructions as an accessible fallback. Nothing is added to the main grid.
9. An upload failure offers **Retry**, which sends the already-captured image
   rather than capturing the error alert. A new gesture captures a fresh screen.
   The app distinguishes capture, network/timeout, pairing and receiver failures.
   Successful saves are announced to VoiceOver without a popup.

Only one capture or upload runs at a time across all triggers. Motion sampling
runs at 10 Hz while the app is active, with no per-sample React updates, and
stops on backgrounding. A stable viewing pose, face-down dwell, settled return,
deadline and cooldown guard against ordinary rotation, shaking or leaving the
phone face down. No motion data is stored or uploaded. Gesture comfort and
captures of native sheets, keyboards and DOM editors still need acceptance
testing on the phone; the stronger haptic pattern still needs feedback.

Screenshots and local settings are ignored by Git. Dated captures stay until you
delete them. The capture covers the visible app area, not off-screen scroll
content. Browser capture is not available.

To turn it off, set `EXPO_PUBLIC_DEV_PREVIEW=false`, reload the app and stop the
receiver with Ctrl+C. The native library may still be linked into a native build;
the flag gates the feature, not the dependency.

Use this only on a trusted local network. The receiver binds only to the
configured address, checks the pairing token, rejects browser-origin requests,
limits uploads to 12 MB of JSON and has no download endpoint. The token is
embedded in the development bundle and is not a production secret. The local
HTTP connection is unencrypted, so do not port-forward or expose the receiver.
Expo's Metro tunnel does not carry it. When changing networks, update the URL,
restart the receiver and reload the app. If a firewall blocks the phone, allow
only the receiver's port on your trusted network (on Windows, a private network).

Run `npm run test:preview` for receiver authentication, payload, size,
persistence and failure-response checks. References:
[Expo environment variables](https://docs.expo.dev/guides/environment-variables/)
and [native screenshots](https://docs.expo.dev/versions/latest/sdk/captureRef/).

### Sample data

In a development session, Settings → Development → Sample data switches to an
isolated, in-memory history; the brand label shows SAMPLE DATA. Use the normal
grid and statistics screens: edits, Undo/Redo, colours and archive actions
affect only the sample. Settings → Development → Reset sample data rebuilds it
relative to today's local date. Turning Sample data off returns to the real
store. A full reload starts a new sample session; in-session toggles keep the
sample until it is reset.

`EXPO_PUBLIC_DEV_MOCK_DATA=true` starts in sample mode after each full reload;
`false` starts with real data. No app-data reset, seeding into an existing
database or backup import is involved. Backup controls are hidden or disabled in
sample mode, its repository rejects restores, and History and the archive say
that sample changes are temporary.

The fixture contains entirely fictional data:

- All 12 presets with 180 days of checkbox and numeric entries
  (`packages/core/src/dev/sampleData.ts`, a deterministic event log in a memory-only
  ChangeStore). `SampleDataMode.tsx` owns the switch.
- Progressively longer notes on Go for a walk, Read and Meditate, up to about
  2,200, 8,000 and 18,000 characters (`sampleDescriptions.ts`), for testing the
  Notes sheet, reader and editor at each size.
- Workout (multiple categories) and Daily highlight (free text) with sixty days
  of values (`sampleRecords.ts`).
- Explicit goals (`sampleGoals.ts`): Read changes from 15 to 30 minutes fourteen
  days ago; Drink water targets eight glasses; Workout matches Run/Strength on
  Monday, Wednesday and Friday; Daily highlight completes with nonblank text.
- Timing examples (`sampleTiming.ts`): Walk on a 5-day-on/2-off cycle, Meditate
  3 weeks on/1 off, and Workout with 2–4 successful days per week on alternating
  weeks.

#### Marketing presets

With Sample data on, Settings → Development lists five more fictional
histories beside the development set, for screenshots and demos. Each is a
complete 180-day log of its own (`packages/core/src/dev/samplePresets.ts`
builds it; each person is one file in `dev/presets/`) using all four habit
types, goals, notes and a usual logging time per habit:

| Id          | Name                | Habits            | Shows                                                                                                                  |
| ----------- | ------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `everyday`  | Everyday            | 5 (the free tier) | Walk, water, reading, Dinner categories, One good thing                                                                |
| `learner`   | Learning & practice | 6                 | Spanish minutes with a raised goal, a word a day, piano with practice types, focus sessions                            |
| `wellbeing` | Mood & wellbeing    | 8                 | Feelings, meditation, gratitude, screen time, a default-on Alcohol-free box, fortnightly therapy                       |
| `athlete`   | Marathon training   | 10                | Session types with a weekly quota, distance, session notes, how the legs feel, resting heart rate, weight, physio days |
| `health`    | Medication & health | 11                | Doses, a Sunday injection, blood pressure, pain, symptom categories, sleep, water, notes for appointments              |

Today looks like an evening in progress: habits usually logged before 8 pm are
filled in and later ones are still open. `EXPO_PUBLIC_DEV_MOCK_DATA=athlete`
(any preset id) starts in that preset after a full reload; `true` still starts
in the development set. On the web, `?sample=athlete` does the same and the
sidebar shows a picker under the Sample data switch. The sample labels (SAMPLE
DATA in the top bar, the History and sidebar notes) still show, so crop or hide
them in marketing captures.

These modules extend only the sample store; never use them to change real
habits or their saved descriptions. App loads them behind `__DEV__`, so the
production iOS export excludes their code whatever the env value; verify this
when changing the gate. Tests cover replay validity, DST and leap dates,
statistics variety, numeric zeros versus gaps, independent stores, sample
Undo/Redo, reset and blocked backup replacement; preset tests check that every
preset is deterministic, valid on DST and leap dates, uses all four habit types
and fills each row in the last two weeks. See
[STATISTICS.md](STATISTICS.md) and [GOALS.md](GOALS.md) for what each example
exercises.

### Grid diagnostics and benchmarks

With `EXPO_PUBLIC_DEV_PERFORMANCE=true`, the app records aggregate grid and store
timings that can be inspected in React Native DevTools, and Settings →
Development → Grid diagnostics records a run of the canvas grid (it has no
reduced renderer modes to compare). Start a run, return to the grid,
wait two seconds, then repeat the same scroll and rotation actions. **Stop and
send** uploads the report through the paired preview receiver, so it also needs
`EXPO_PUBLIC_DEV_PREVIEW=true`. Reports contain fixed numeric metrics only and
arrive in the ignored `.dev/performance/` folder as latest.json, with earlier
dated reports kept alongside.
A failed send can retry the in-memory report. Runs end after one minute, when
the app becomes inactive, or when the sample source changes or resets. Release
bundles exclude these controls, and the flags never alter habit history.

`npm run benchmark:bottlenecks` runs the production store and repository against
temporary fictional Node SQLite files with a 256 MiB heap limit, and
`npm run benchmark:grid` times grid preparation. Both are desktop CPU timings,
not iPhone rendering or native SQLite bridge measurements. See
[PERFORMANCE.md](PERFORMANCE.md) for the metrics, how to interpret them and
their limits.

### Compare development and production JavaScript

For a quick performance comparison on the physical iPhone, start two terminals:

```sh
npm run start:compare-dev
npm run start:production-js
```

The development comparison uses port 8083. The production-JavaScript comparison
uses port 8082 with Expo's `--no-dev --minify` options. Both use one Metro worker,
clear the cache and run the ordinary saved habit list, with sample mode,
profiling and preview capture turned off by a temporary
`EXPO_PUBLIC_DEV_COMPARISON=true` override. The launchers own that variable:
SDK 57's development env module merges env files over runtime variables, so
setting the other flags to false at runtime is not enough. The comparison gate
in `developmentFeatures.ts` disables their App mounts and all performance
recording; literal `__DEV__` import guards still exclude native dev tools from
release bundles. The launchers do not edit `.env.local`, reset storage or stop
an ordinary development server on port 8081.

Open each terminal's QR code in Expo Go. Both sessions share the same Expo Go
project storage (their manifests have the same scope key). Compare the same
saved list, appearance, date range, flings and rotations after downloading and
bundling settle. Edits in either session are real saved edits, so use the same
existing records for scroll tests. Preview capture and Save timings are
unavailable; use observations or an iPhone screen recording.

Production JavaScript in Expo Go is a useful partial test, not a compiled iOS
release build: Expo Go remains the native host. React Native warns about
development overhead; see
[React Native performance](https://reactnative.dev/docs/performance). For a
compiled Release comparison, use the internal preview profile in
[RELEASING.md](RELEASING.md). Close both terminals to stop them, then scan the
ordinary port-8081 QR code to return to sample data and development tools.

### AI assistants and Expo MCP

Expo has an [official MCP server](https://docs.expo.dev/mcp/) at
`https://mcp.expo.dev/mcp`, authenticated with an Expo account through OAuth. It
can help AI assistants with Expo documentation and EAS builds. Its documented
iOS automation is limited to simulators on macOS; it cannot operate a physical
iPhone. It is not configured in this repository. Test interactions on the
physical phone and share observations, screenshots or recordings. With Android
over USB, an assistant with terminal access can use `adb` and
`npm run android:screenshot` instead.

## Official references

- [Create the first app](https://docs.expo.dev/tutorial/create-your-first-app/)
- [Start developing and connect a device](https://docs.expo.dev/get-started/start-developing/)
- [Expo Go downloads](https://expo.dev/go)
- [Expo SDK 57 release notes](https://expo.dev/changelog/sdk-57)
- [iOS simulator requirements](https://docs.expo.dev/workflow/ios-simulator/)
- [Development builds](https://docs.expo.dev/develop/development-builds/introduction/)
