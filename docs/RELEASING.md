# Path to an open-source App Store release

This is the plan for releasing OnPurpose on the App Store. It is not a
declaration that the app is ready to publish: nothing is App Store ready yet.
There is no signed build, App Store Connect record or in-app purchase, and
`eas.json` only prepares an internal preview profile. Requirements were checked
on 4 October 2026; recheck them before acting.

Which platform launches first is undecided (see the 12 October 2026 entry in
[DECISIONS.md](DECISIONS.md)). The iPhone release matters more; launching on
Android first is cheaper, since Google Play registration is a one-time US$25
against US$99 a year for Apple. This guide covers the App Store path; the Google
Play path is not yet documented here. An F-Droid build without proprietary
libraries is also wanted, at the lowest priority.

## 1. Validate on the phone

Start with Expo Go (see [DEVELOPMENT.md](DEVELOPMENT.md)). Agree the initial
release scope and confirm the fast checkoff interaction on the phone before
investing in release infrastructure.

## 2. Create the project's own builds

### Release performance test before App Store setup

For a quick no-account comparison, use the paired Expo Go sessions described in
[DEVELOPMENT.md](DEVELOPMENT.md#compare-development-and-production-javascript).
They disable profiling, sample data and motion tools and compare development
JavaScript with production/minified JavaScript. Expo Go's native host stays the
same, so this is not full release-build evidence.

`eas.json` contains a `preview` profile with internal distribution,
`developmentClient: false` and an explicit iOS `buildConfiguration: Release`. It
builds a standalone signed app with its JavaScript bundled, without a
development server or public App Store submission. The developer-only tools and
fictional history remain excluded by `__DEV__`, and the profile also sets their
flags to false. No cloud project, bundle identifier, Apple signing or device
registration has been configured yet; the profile is prepared, not an
installable build.

Without a Mac, use EAS (it builds on hosted Macs) with
[internal distribution](https://docs.expo.dev/build/internal-distribution/) once
an active paid Apple Developer membership and an Expo account are available.
Choose a provisional testing bundle identifier (the final name remains open),
link the intended Expo project, sign in through EAS CLI in a local terminal and
register the iPhone before the first ad hoc build. Never commit or share
credentials. Review current EAS build quotas before starting the cloud job. No
dev-client dependency is needed for this Release preview. The manual commands
after setup are:

```sh
npx eas-cli@latest device:create
npx eas-cli@latest build --platform ios --profile preview
```

Open the completed build's install link on the registered iPhone. Unlike Expo
Go, this app has its own storage container. Use a fictional backup in that
container to match the test list, history and appearance, or compare empty
preset data in both hosts. Do not compare a small empty Release list with a
large populated development list and report the difference as a speedup.
Preview builds and signing are manual; there is no automatic submission or
deployment. See Expo's
[internal-build tutorial](https://docs.expo.dev/tutorial/eas/internal-distribution-builds/).

### Development build for daily work

Use an Expo account and Apple Developer Program membership for the EAS physical
iPhone signing workflow. Apple lists membership at US$99 per year, with regional
pricing shown during enrolment. EAS service quotas and pricing are separate;
review the current plan before scheduling cloud builds.

When the accounts are ready, choose the stable iOS bundle identifier, link the
correct Expo project, and install `expo-dev-client` with `npx expo install`. Run
EAS CLI login and build configuration, then create development and production
profiles alongside the prepared preview profile in `eas.json`. Register the
physical device as EAS directs for an ad hoc development build. These account
steps are not done yet.

After configuration, the typical commands are:

```sh
npx eas-cli@latest build --platform ios --profile development
npx expo start --dev-client
```

These are future steps; the app cannot complete them without credentials and
build configuration. EAS builds iOS on hosted Macs; local iOS compilation and
the iOS Simulator still require macOS.

## 3. Add the in-app unlock

The founder decided on a free tier of five habits plus a one-time US$9.99
unlock for unlimited habits (10 and 12 October 2026; see
[DECISIONS.md](DECISIONS.md)). None of this is implemented yet. The plan:

- Enforce the limit: the paywall appears when creating a sixth habit, never
  during onboarding. Payment must never lock existing records, export, backups,
  History or the Loop import; reaching the limit only prevents adding more.
  Archived habits do not count. Release builds start without the development
  preset habits; a short first-run walkthrough shows how to create the first
  ones.
- Add an in-app purchase library that covers StoreKit and Google Play Billing,
  such as `expo-iap` or RevenueCat's `react-native-purchases`. It is native
  code, so it needs the development build from step 2; Expo Go cannot test
  purchases. See Expo's
  [in-app purchases guide](https://docs.expo.dev/guides/in-app-purchases/).
- In App Store Connect, the Account Holder signs the Paid Apps Agreement and
  completes the tax and banking details it requires. Then create the unlock as a
  one-time (non-consumable) in-app purchase.
- Handle restoring purchases: offer a visible Restore Purchases action and
  recognise an existing unlock after reinstalling or on a new device. Once
  sync accounts exist, the unlock belongs to the account on every platform
  (see [SYNC.md](SYNC.md)), so choose a purchase library that can carry it,
  such as RevenueCat.
- Test purchases with App Store sandbox accounts and through TestFlight before
  release. Update the privacy disclosures if the chosen library collects data.

## 4. Test a production build through TestFlight

Complete native build configuration for the selected SDK and current Apple
requirements. In particular, SDK 57 has additional scene-lifecycle requirements
when built with Xcode 27; follow current Expo guidance or upgrade the SDK before
choosing that toolchain. Do not blindly pin a future EAS image.

After creating the App Store Connect app record and configuring production:

```sh
npx eas-cli@latest build --platform ios --profile production
npx eas-cli@latest submit --platform ios
```

EAS Submit uploads the build to App Store Connect/TestFlight. It does not itself
publish a public App Store release. Complete the beta tests in
[TESTING.md](TESTING.md), including real launch timing, persistence, upgrades,
purchases and accessibility.

## 5. Prepare the public release

The GPLv3 licence, public repository and contribution guidance are in place.
Remaining items:

- Finalise the name, bundle identifier, icon, screenshots, supported devices and
  iOS versions.
- Confirm the third-party notices in [docs/licenses](licenses/README.md) are
  complete, and generate full notices (or in-app acknowledgements) from the
  production dependency tree for distributed binaries.
- Keep contribution terms compatible with App Store distribution: outside
  contributions need an agreement that preserves sole copyright (see
  [CONTRIBUTING.md](../CONTRIBUTING.md)).
- Implement the unlock and free-tier limit (step 3).
- Decide the support contact/URL and data recovery expectations.
- Provide a privacy policy and accurate store disclosures (Apple's privacy
  labels, Google's Data safety form) based on the app's actual code and
  dependencies, including the planned crash reporting and analytics. Update them
  if sync is added.
- Complete App Store metadata, age rating, export compliance, review information
  and any applicable accessibility declarations using the current submission
  flow.
- Submit the selected build for App Review, resolve feedback, and release it.

## References

- [Apple Developer enrolment and cost](https://developer.apple.com/programs/enroll/)
- [EAS Build](https://docs.expo.dev/build/introduction/)
- [Development builds](https://docs.expo.dev/develop/development-builds/introduction/)
- [EAS Submit for iOS, including Linux support](https://docs.expo.dev/submit/ios/)
- [Expo SDK 57 and Xcode 27 notes](https://expo.dev/changelog/sdk-57)
- [Expo in-app purchases guide](https://docs.expo.dev/guides/in-app-purchases/)
- [App Store Connect agreements](https://developer.apple.com/help/app-store-connect/manage-agreements/sign-and-update-agreements)
