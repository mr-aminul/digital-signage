# Database (Supabase / PostgreSQL)

SQL migrations in `migrations/` are **idempotent-friendly** ordered files. Apply them in filename order using:

- Supabase Dashboard → **SQL** → paste each file, or  
- [Supabase CLI](https://supabase.com/docs/guides/cli): `supabase db push` (when linked to a project)

## What the first migration creates

- **Tables**: `profiles`, `devices`, `media`, `playlists`, `playlist_items`, `device_playlists`
- **RLS**: owner-scoped access for the web dashboard; TV devices use **anonymous auth** (`registered_session_id = auth.uid()`)
- **Realtime**: tables added to `supabase_realtime` publication where live updates matter
- **Indexes**: common filters (`owner_id`, `device_id`, `playlist_id`, `pairing_code`)

## Storage (MinIO on VPS)

Media files and TV APKs are stored in **MinIO**, not Supabase Storage. Supabase holds metadata only (`media.storage_path`, `app_releases.storage_path`).

1. Create buckets `onesign-media` and `onesign-releases` on MinIO (public read for TV playback).
2. Run `scripts/init-onesign-minio-buckets.sh` on the VPS (requires `mc` CLI).
3. Configure `apps/web/.env.local` — see `apps/web/.env.example` for `NEXT_PUBLIC_MEDIA_BASE_URL`, `S3_*`, and Android `local.properties` for `media.base.url`.

Legacy migration `00002_storage_media.sql` documented Supabase buckets; new uploads go to MinIO via the web API.

## TV authentication (important)

The Android app should call **Supabase Anonymous Sign-in** before inserting or subscribing to `devices`. That gives `auth.uid()` on the TV without a service role key, which satisfies RLS and enables Realtime.

## Environment variables (web)

See `apps/web/.env.example` for `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
