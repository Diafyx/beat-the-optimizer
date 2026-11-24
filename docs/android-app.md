# The Android app

The Google Play app is a [Capacitor](https://capacitorjs.com/) app that carries
its own copy of the game. `npm run build-app` builds the site for the app into
`dist-app/` (`scripts/lib/app-build.ts`), `npx cap sync android` copies it into
the Android project in `android/`, and Gradle builds the app from there.

So a deploy of the site does not reach the app. A change to the game, a new
level included, reaches app players only with the next upload to Google Play.

Version 1 of the app, in the first closed test, was a Trusted Web Activity
built with Bubblewrap. Version 2 is the first built with Capacitor: same
package name, same upload key.

## Settings

- Package name: `org.diafyx.beattheoptimizer`, in `capacitor.config.ts` and
  `android/app/build.gradle`. It can never change once the app is on Google
  Play.
- Version: `versionCode` and `versionName` in `android/app/build.gradle`.
  Google Play needs a higher `versionCode` for every upload.
- Share link: the app's pages are served from `https://localhost`, so its share
  card links to `SITE_URL`, which the app build needs. Use the production
  address, `https://beat-the-optimizer.saik20533.workers.dev`.
- Sharing: the app's WebView has no `navigator.share`, so **Share your
  result** opens Android's share sheet through Capacitor's Share plugin
  (`src/ui/native-share.ts`). Only the app build loads it.
- Launcher icons: rendered from `public/icons/icon.svg` and `maskable.svg` by
  `node scripts/android-icons.ts`. Run it again when either SVG changes.
- Colours: the game's `#0E1012` behind the launcher icon, the splash screen and
  the page (`android/app/src/main/res/values/`).

## Keep the signing key out of this repository

Google Play accepts an upload only when it is signed with the upload key. The
key is a keystore file with a password. Play App Signing is on, so Google holds
the key that signs the app on players' phones, and Play support can reset a
lost upload key, which takes days.

- Keep the keystore outside this repository, for example in
  `~/beat-the-optimizer-android/android.keystore`. `.gitignore` ignores
  `*.keystore` and `*.jks` in case one is copied in.
- Keep its password in a password manager, and a copy of the keystore off this
  machine.
- The build reads the key from the environment, never from a file in the
  repository:
  - `BTO_KEYSTORE`: the keystore's path. Without it, the release build is
    unsigned.
  - `BTO_KEYSTORE_PASSWORD`: its password.
  - `BTO_KEY_ALIAS`: the key's name, `android` if unset.
  - `BTO_KEY_PASSWORD`: the key's own password, the keystore's if unset.

## Install the tools (once)

- Node.js, a version from `engines` in `package.json`, and `npm ci` in this
  repository.
- JDK 21, which Capacitor 8 needs. On Ubuntu:

  ```bash
  sudo apt install openjdk-21-jdk
  ```

- The Android SDK with Android 16 (API 36), from Android Studio or the
  [command-line tools](https://developer.android.com/tools). With the
  command-line tools:

  ```bash
  sdkmanager "platforms;android-36" "build-tools;35.0.0" "platform-tools"
  ```

Gradle downloads itself and the Android libraries on the first build, about
1.3 GB in `~/.gradle`.

## Build the release bundle

Run these from the repository's root folder, one at a time.

1. Build the site for the app and copy it into the Android project:

   ```bash
   SITE_URL=https://beat-the-optimizer.saik20533.workers.dev npm run build-app
   ```

   ```bash
   npx cap sync android
   ```

2. Tell Gradle where Java and the Android SDK are. The paths here are
   examples; use your own:

   ```bash
   export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64 ANDROID_HOME=$HOME/Android/Sdk
   ```

3. Point the build at the keystore, then type its password. `read -rs` shows
   nothing while you type and keeps the password out of the shell's history:

   ```bash
   export BTO_KEYSTORE=$HOME/beat-the-optimizer-android/android.keystore
   ```

   ```bash
   read -rs BTO_KEYSTORE_PASSWORD && export BTO_KEYSTORE_PASSWORD
   ```

4. Build the bundle:

   ```bash
   (cd android && ./gradlew bundleRelease)
   ```

   It writes `android/app/build/outputs/bundle/release/app-release.aab`.

5. Forget the password:

   ```bash
   unset BTO_KEYSTORE_PASSWORD
   ```

6. Check that the bundle is signed with the upload key. The SHA-256 line must
   match the **Upload key certificate** in the Play Console, under **Test and
   release**, **App integrity**, **App signing**:

   ```bash
   keytool -printcert -jarfile android/app/build/outputs/bundle/release/app-release.aab
   ```

If Gradle stops with `Connect timed out` while it downloads, the network may
not route IPv6. Make Java use IPv4, then build again:

```bash
export GRADLE_OPTS=-Djava.net.preferIPv4Stack=true
```

## Try it on a phone

Turn on USB debugging on an Android phone (Settings, About phone, tap **Build
number** seven times, then Developer options, **USB debugging**), and connect
it. After step 2 above, this builds and installs a debug version, which needs
no key:

```bash
(cd android && ./gradlew installDebug)
```

## Upload it to Google Play

1. In the [Play Console](https://play.google.com/console), open the app, then
   **Test and release**, **Testing**, and the track, for example **Closed
   testing**, **Alpha**.
2. Choose **Create new release**, then **Upload**, and pick
   `app-release.aab`.
3. Keep the suggested release name, write what changed in the release notes,
   then choose **Next** and **Save**.
4. Go to **Publishing overview** and send the changes for review.

## Release a new version

1. In a pull request, raise `versionCode` by one and set `versionName` in
   `android/app/build.gradle`.
2. Once it is merged, build the release bundle from `main` and upload it as
   above.

The `android` job in CI builds a debug app whenever `android/`,
`capacitor.config.ts` or `scripts/android-icons.ts` change. A Capacitor
upgrade is an update to the `@capacitor/*` packages, then `npx cap sync
android`; a new major version also needs `npx cap migrate`. The Share plugin,
`@capacitor/share`, has its own version numbers, with the same major version
as Capacitor.
