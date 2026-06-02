-- In-app OTA for sideloaded Android TV builds.
-- Run after 00025_tv_revision_playback_secret.sql

create table if not exists public.app_releases (
  id uuid primary key default gen_random_uuid(),
  version_code int not null,
  version_name text not null,
  storage_path text not null,
  sha256 text not null,
  release_notes text,
  is_active boolean not null default false,
  package_name text not null default 'dev.signage.tv',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  constraint app_releases_version_code_package_unique unique (version_code, package_name),
  constraint app_releases_sha256_hex check (sha256 ~ '^[a-f0-9]{64}$')
);

create index if not exists app_releases_active_lookup_idx
  on public.app_releases (package_name, version_code desc)
  where is_active = true;

comment on table public.app_releases is
  'Published Android APK builds for in-app OTA. Exactly one row per package_name should be active.';

alter table public.app_releases enable row level security;

drop policy if exists app_releases_select_authenticated on public.app_releases;
create policy app_releases_select_authenticated on public.app_releases
  for select to authenticated
  using (true);

drop policy if exists app_releases_insert_authenticated on public.app_releases;
create policy app_releases_insert_authenticated on public.app_releases
  for insert to authenticated
  with check (auth.uid() = created_by);

drop policy if exists app_releases_update_authenticated on public.app_releases;
create policy app_releases_update_authenticated on public.app_releases
  for update to authenticated
  using (true)
  with check (true);

drop policy if exists app_releases_delete_authenticated on public.app_releases;
create policy app_releases_delete_authenticated on public.app_releases
  for delete to authenticated
  using (true);

-- APK binaries (public read so TVs can download without a signed URL).
insert into storage.buckets (id, name, public)
values ('releases', 'releases', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists releases_objects_select_public on storage.objects;
create policy releases_objects_select_public on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'releases');

drop policy if exists releases_objects_insert_authenticated on storage.objects;
create policy releases_objects_insert_authenticated on storage.objects
  for insert to authenticated
  with check (bucket_id = 'releases');

drop policy if exists releases_objects_update_authenticated on storage.objects;
create policy releases_objects_update_authenticated on storage.objects
  for update to authenticated
  using (bucket_id = 'releases');

drop policy if exists releases_objects_delete_authenticated on storage.objects;
create policy releases_objects_delete_authenticated on storage.objects
  for delete to authenticated
  using (bucket_id = 'releases');

create or replace function public.activate_app_release(p_release_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_package_name text;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = 'P0001';
  end if;

  select r.package_name
  into v_package_name
  from public.app_releases r
  where r.id = p_release_id;

  if v_package_name is null then
    raise exception 'release_not_found' using errcode = 'P0001';
  end if;

  update public.app_releases
  set is_active = false
  where package_name = v_package_name
    and id <> p_release_id;

  update public.app_releases
  set is_active = true
  where id = p_release_id;
end;
$$;

revoke all on function public.activate_app_release(uuid) from public;
grant execute on function public.activate_app_release(uuid) to authenticated;

-- TV polls this with its installed version_code; returns the newest active build above it.
create or replace function public.tv_check_app_update(
  p_version_code int,
  p_package_name text default 'dev.signage.tv'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_release public.app_releases%rowtype;
begin
  if p_version_code is null or p_version_code < 0 then
    return jsonb_build_object('updateAvailable', to_jsonb(false));
  end if;

  select *
  into v_release
  from public.app_releases r
  where r.is_active = true
    and r.package_name = coalesce(nullif(trim(p_package_name), ''), 'dev.signage.tv')
    and r.version_code > p_version_code
  order by r.version_code desc
  limit 1;

  if not found then
    return jsonb_build_object('updateAvailable', to_jsonb(false));
  end if;

  return jsonb_build_object(
    'updateAvailable', to_jsonb(true),
    'versionCode', to_jsonb(v_release.version_code),
    'versionName', to_jsonb(v_release.version_name),
    'storagePath', to_jsonb(v_release.storage_path),
    'sha256', to_jsonb(v_release.sha256),
    'releaseNotes', to_jsonb(v_release.release_notes)
  );
end;
$$;

revoke all on function public.tv_check_app_update(int, text) from public;
grant execute on function public.tv_check_app_update(int, text) to anon, authenticated;
