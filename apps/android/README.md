# Android TV Player

Kotlin + Jetpack Compose TV primitives, **Media3 ExoPlayer** (disk cache + stall recovery), **Supabase** (anonymous auth, PostgREST, **Realtime** on `device_playlists` / `playlist_items`), and **DataStore** for device state.

HTTPS uses the **platform TLS stack** (system trust store) for Supabase, Coil, and ExoPlayer. If images or video fail while the API still works, check **system date/time**, OS updates for root CAs, and captive portals / TLS-inspecting networks.

Typography uses **Google Sans** (same `@fontsource-variable/google-sans` latin file as the web app), bundled at `app/src/main/res/font/google_sans.ttf`.

## Configure

1. Copy `local.properties.example` → `local.properties` at this directory (`apps/android/`), **or** put the same keys in `local.properties` at the **repository root** (Gradle merges both; values in `apps/android/` override the root file).
2. Fill `sdk.dir`, `supabase.url`, and `supabase.anon.key` (same anon key as the web app). Replace every `YOUR_…` placeholder — leaving the template values produces a **missing config** error at launch instead of connecting.
3. In Supabase Dashboard → **Authentication → Providers**, enable **Anonymous sign-ins**.

## Run

Open this folder in Android Studio and run on an Android TV / emulator with a landscape display.

### TV emulator DNS (macOS)

If the app stays on **Starting…** and logcat shows `HttpRequestTimeoutException` for `*.supabase.co`, the emulator often has **broken DNS** (ping to `8.8.8.8` works, but `ping google.com` fails). Cold-boot with explicit DNS:

```bash
chmod +x scripts/start-tv-emulator.sh
./scripts/start-tv-emulator.sh TV_1
```

Or manually: `emulator -avd TV_1 -dns-server 8.8.8.8,8.8.4.4 -no-snapshot-load`

Verify: `adb shell ping -c 1 nlkjbfwhzzpebsunmzrw.supabase.co` should resolve.

## Tests

- **Unit:** `./gradlew :app:testDebugUnitTest`
- **Instrumented (device/emulator):** `./gradlew :app:connectedDebugAndroidTest`

## Release builds

`release` has **R8 minification** enabled. After dependency upgrades, verify `./gradlew :app:assembleRelease` and smoke-test pairing + image + video on a real device.

Sign every release with the **same keystore** — Android only allows in-place upgrades when the signing certificate matches. Bump `versionCode` in `app/build.gradle.kts` on every publish.

## In-app OTA (sideloaded fleets)

Paired TVs poll Supabase for a newer active build (`00026_app_releases.sql`), download the APK from the public `onesign-releases` MinIO bucket, verify SHA-256, and launch the system installer.

1. Apply migration `packages/database/migrations/00026_app_releases.sql`.
2. Build a signed release APK: `./gradlew :app:assembleRelease`
3. Publish the APK to MinIO (`onesign-releases` bucket + `app_releases` row, then `activate_app_release`). The web console **Settings** → **TV app updates (OTA)** is read-only.
4. On first launch (before the pairing code), the TV shows a **one-time setup** screen: open **Install unknown apps** → turn on **Allow** for OneSign TV → press Back. Pairing starts automatically. Later OTA updates only need a tap on **Install** in the system prompt.
5. The app re-checks for updates every ~6 hours and on cold start.

Device telemetry already reports installed `version_code` so you can spot stragglers in the dashboard.

## MVP behavior

- On first launch the app runs **one-time TV setup** (install permission for OTA on Android 8+), then signs in **anonymously**, generates a **six-digit pairing code**, inserts a `devices` row (`registered_session_id` = anonymous user id), and shows the code full-screen.
- It polls the `devices` row until an admin links it from the web dashboard (`owner_id` set via `link_device_by_pairing_code`). **Realtime** nudges manifest refresh when assignments or playlist items change.
- Cached playback JSON allows a cold start with the last known slides when the network is down (best-effort).
- Use **Reset registration** during development to clear local pairing state.

## Pre-release QA (manual)

1. Pair a TV with the web dashboard; confirm **playback** (image + video) and **orientation** if you use it.
2. Edit the assigned playlist on the web; confirm the TV picks up changes (Realtime + poll).
3. Toggle **admin playback pause** if implemented; confirm standby vs slides.
4. **Airplane mode** or unplug Ethernet briefly; confirm recovery and cache behavior match expectations.

## Future work

- **Room** (or similar) for structured offline playlist metadata if you outgrow JSON cache + Exo disk cache alone.
