# Salu Salon Android app

The Android project is a Capacitor shell around the deployed Next.js dashboard.
That keeps bookings, authentication, API routes, and UI updates on the same live
deployment instead of freezing a server-rendered app inside the APK.

## Build

```sh
npm run android:apk
```

The Gradle debug APK is written to:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

For the `0.2.3` release, copy that exact artifact to:

```text
releases/Salu-Salon-0.2.3.apk
```

Its expected package metadata is `com.salusalon.dashboard`, version code `3`,
and version name `0.2.3`. Verify it with Android build tools:

```sh
aapt dump badging releases/Salu-Salon-0.2.3.apk | head -n 1
shasum -a 256 releases/Salu-Salon-0.2.3.apk
```

Set `CAPACITOR_SERVER_URL` before syncing to point a development build at a
different HTTPS deployment. The production default is
`https://salu-salon.vercel.app`.

This app needs an internet connection because bookings and messages are live.
If the server cannot be reached, the native shell shows a branded retry screen.

The Android shell disables WebView debugging and Capacitor logging in production.
Hardware Back closes an open message thread first, returns other sections to
Today, and exits only from Today. Safe-area padding is owned by the shared web
shell and the offline screen uses the same 48px minimum target.

The checked-in APK is a debug-signed reproducibility artifact. For Play Store or
external production distribution, build the same version as a release bundle
with the salon's protected signing key; never commit that key or its passwords.
