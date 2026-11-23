# The Android app

The Google Play app is a Trusted Web Activity: a small Android app that opens
the live site full screen in Chrome. It is built with
[Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap/tree/main/packages/cli)
from the web app manifest (`public/manifest.webmanifest`).

The game itself is the site, so every deploy reaches the app too. A new app
release is needed only when the app's own settings change: its name, icon,
colours or address.

## Settings

- Package name: `org.diafyx.beattheoptimizer`. It can never change once the
  app is on Google Play.
- Address: `beat-the-optimizer.saik20533.workers.dev`, the `SITE_URL` of the
  production environment.
- Manifest:
  `https://beat-the-optimizer.saik20533.workers.dev/manifest.webmanifest`.

A new address means a new app release and a new link file
(`/.well-known/assetlinks.json`), so a custom domain is best set up before the
app is published.

## Keep the signing key out of this repository

Bubblewrap creates a signing key, `android.keystore`, protected by two
passwords. Google Play accepts updates only when they are signed with it.

- Make the Android project in its own folder, outside this repository, for
  example `~/beat-the-optimizer-android`. `.gitignore` ignores keystores in
  case one is copied in.
- Keep a backup of `android.keystore`, `twa-manifest.json` and both passwords
  (in a password manager, for example). If the key is lost, Play support can
  reset the upload key, because Google holds the key that signs the app on
  Play (Play App Signing).

## Build the app

1. Install Bubblewrap (Node.js 18 or later). Do not use `sudo`:

   ```bash
   npm i -g @bubblewrap/cli
   ```

2. In the Android project's folder, start the project from the live manifest:

   ```bash
   bubblewrap init --manifest=https://beat-the-optimizer.saik20533.workers.dev/manifest.webmanifest
   ```

   On the first run, Bubblewrap offers to download JDK 17 and the Android
   command-line tools. Say yes. Then it asks for the app's details, with
   answers suggested from the manifest:

   - Application ID: `org.diafyx.beattheoptimizer`.
   - Display mode: `standalone`. Status bar and splash screen colour:
     `#0e1012`.
   - Play Billing and geolocation: no.
   - Key store location and key name: keep the suggested `./android.keystore`
     and `android`. The name and organisation details go into the key's
     certificate; the passwords are the two to keep safe.
   - Anything else: keep the suggested answer.

   The answers are saved in `twa-manifest.json`.

3. Build the app. Bubblewrap asks for both passwords and installs the Android
   build tools on the first build, after you accept their licence:

   ```bash
   bubblewrap build
   ```

   It writes `app-release-bundle.aab`, for Google Play, and
   `app-release-signed.apk`, to try on a phone.

4. To try it, connect an Android phone with USB debugging on, then run
   `bubblewrap install`. Until the site has the link file, the app shows a
   browser bar at the top; that is expected.

## Upload it to Google Play

1. In the [Play Console](https://play.google.com/console), choose
   **Create app**: name "Beat the Optimizer", a game, free.
2. Go to **Test and release**, **Testing**, **Internal testing**, and create a
   release. Play App Signing is on for new apps: keep it. Upload
   `app-release-bundle.aab` and roll the release out to internal testers.
3. Go to **Test and release**, **App integrity**, **App signing**. Copy the
   SHA-256 fingerprints of the **app signing key certificate** and the
   **upload key certificate**. Both go into `/.well-known/assetlinks.json`
   (issue #99). Once that file is live, the app opens full screen.

The Play Console dashboard lists what else it needs before a production
release, such as the store listing, the content rating and, for some personal
accounts, a closed test.

## Release a new version

1. Change the settings in `twa-manifest.json`, then regenerate the project.
   This raises the version code, which Google Play requires for every upload:

   ```bash
   bubblewrap update
   ```

2. Run `bubblewrap build` and upload the new `app-release-bundle.aab` to a
   release in the Play Console.

`bubblewrap update` overwrites files changed by hand in the Android project;
change only `twa-manifest.json`.
