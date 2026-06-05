# Web Dashboard

Next.js 14 (App Router) console for managing TVs, playlists, and uploads.

## Setup

```bash
pnpm install
cp .env.example .env.local
```

Fill `.env.local` with Supabase URL/anon key **and** MinIO settings (see `.env.example` for `NEXT_PUBLIC_MEDIA_BASE_URL`, `S3_*`). Apply SQL migrations from `packages/database/migrations` in the Supabase SQL editor.

Create MinIO buckets `onesign-media` and `onesign-releases` on your VPS (`scripts/init-onesign-minio-buckets.sh`).

Enable **Anonymous sign-ins** (Authentication → Providers) so the Android TV app can register devices without a service role key.

## Develop

```bash
pnpm dev
```

## Stack notes

- Drag-and-drop uses [`@hello-pangea/dnd`](https://github.com/hello-pangea/dnd), the maintained fork compatible with React 18 (same API as `react-beautiful-dnd`).
- Sessions are handled with `@supabase/ssr` and `middleware.ts` so protected routes stay in sync with cookies.

## Deploy (Vercel)

Set `NEXT_PUBLIC_SUPABASE_*`, `NEXT_PUBLIC_MEDIA_BASE_URL`, `NEXT_PUBLIC_RELEASES_BASE_URL`, and server-only `S3_*` variables in the Vercel project settings.
