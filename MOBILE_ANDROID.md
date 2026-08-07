# Salu Salon Android app

The Android project is a Capacitor shell around the deployed Next.js dashboard.
That keeps bookings, authentication, API routes, and UI updates on the same live
deployment instead of freezing a server-rendered app inside the APK.

## Build

```sh
npm run android:apk
```

The debug APK is written to:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Set `CAPACITOR_SERVER_URL` before syncing to point a development build at a
different HTTPS deployment. The production default is
`https://salu-salon.vercel.app`.

This app needs an internet connection because bookings and messages are live.
If the server cannot be reached, the native shell shows a branded retry screen.
