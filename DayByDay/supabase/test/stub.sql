-- Stand-ins for Supabase, used only by run.sh. Never run this in a real Supabase project.
-- Minimal stand-ins for what Supabase provides, so setup.sql's policies can be tested.
create role anon nologin;

create role authenticated nologin;

create schema auth;

create table auth.users (id uuid primary key);

create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

grant usage on schema auth to anon, authenticated;

grant execute on function auth.uid() to anon, authenticated;

create schema storage;

create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);

create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid, unique (bucket_id, name));

create function storage.foldername(name text) returns text[] language plpgsql as $$ declare _parts text[]; begin select string_to_array(name, '/') into _parts; return _parts[1:array_length(_parts,1)-1]; end $$;

alter table storage.objects enable row level security;

grant usage on schema storage to anon, authenticated;

grant all on storage.objects to authenticated;

grant select on storage.buckets to authenticated;

grant execute on function storage.foldername(text) to authenticated;

grant usage on schema public to anon, authenticated;

alter default privileges in schema public grant all on tables to anon, authenticated;

alter default privileges in schema public grant execute on functions to anon, authenticated;

insert into auth.users values ('aaaaaaaa-0000-0000-0000-000000000000'), ('bbbbbbbb-0000-0000-0000-000000000000'), ('cccccccc-0000-0000-0000-000000000000');

