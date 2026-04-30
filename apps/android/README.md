# Android TV Player

Kotlin + Jetpack Compose TV primitives, **Media3 ExoPlayer**, **Supabase** (anonymous auth + PostgREST), and **DataStore** for device state.

## Configure

1. Copy `local.properties.example` → `local.properties` at this directory (`apps/android/`), **or** put the same keys in `local.properties` at the **repository root** (Gradle merges both; values in `apps/android/` override the root file).
2. Fill `sdk.dir`, `supabase.url`, and `supabase.anon.key` (same anon key as the web app). Replace every `YOUR_…` placeholder — leaving the template values produces a **missing config** error at launch instead of connecting.
3. In Supabase Dashboard → **Authentication → Providers**, enable **Anonymous sign-ins**.

## Run

Open this folder in Android Studio and run on an Android TV / emulator with a landscape display.

## MVP behavior

- On first launch the app signs in **anonymously**, generates a **six-digit pairing code**, inserts a `devices` row (`registered_session_id` = anonymous user id), and shows the code full-screen.
- It polls the `devices` row until `owner_id` is populated from the web dashboard (`link_device_by_pairing_code` RPC path).
- Use **Reset registration** during development to clear local pairing state.

## Next steps (not fully wired in this scaffold)

- **Room** cache for playlists/media metadata (dependencies removed temporarily to keep Gradle lean—add `room-runtime`, `ksp`, and entities when you flesh out offline mode).
- **Realtime** channel on `device_playlists` / `playlist_items` instead of polling.
- **ExoPlayer** loop for signed storage URLs returned from PostgREST joins.
