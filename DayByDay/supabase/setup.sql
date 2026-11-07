-- Day by Day: friends and sharing.
-- Run once in your Supabase project: Dashboard → SQL Editor → New query → paste all of this → Run.
-- Safe to run again: functions and policies are replaced, and tables keep their data. Tables are only
-- created if missing, though, so changing a column or check later needs its own `alter table`.
--
-- What lives here is only what people choose to share:
--   profiles     a display name and a friend code
--   friendships  who asked whom, and whether it was accepted
--   posts        one row per day you wrote: the day number, streak, and (only if you turn it on
--                for that entry) one line from it and the path of its photo
-- Journal entries themselves never leave the Mac.

-- 1. Tables -------------------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  code text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  created_at timestamptz not null default now()
);

create table if not exists public.friendships (
  requester uuid not null references public.profiles (id) on delete cascade,
  addressee uuid not null references public.profiles (id) on delete cascade,
  accepted boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (requester, addressee),
  check (requester <> addressee)
);
-- one row per pair, whichever direction it was asked in
create unique index if not exists friendships_pair
  on public.friendships (least(requester, addressee), greatest(requester, addressee));
create index if not exists friendships_addressee on public.friendships (addressee);

create table if not exists public.posts (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,                          -- the writer's own calendar date
  count int check (count between 0 and 60000),
  streak int not null default 0 check (streak between 0 and 60000),
  snippet text check (char_length(snippet) between 1 and 280),
  photo_path text,
  updated_at timestamptz not null default now(),
  primary key (user_id, day),
  -- a post can only point at its owner's photo for that day
  check (photo_path is null or photo_path = user_id::text || '/' || to_char(day, 'YYYY-MM-DD') || '.jpg')
);
create index if not exists posts_photo_path on public.posts (photo_path) where photo_path is not null;

-- 2. Who can see what ---------------------------------------------------------------------------
-- Everything is read through row-level security. Writes go through the functions below,
-- except posts, which you can write (only your own) directly.

alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.posts enable row level security;

revoke all on public.profiles, public.friendships, public.posts from anon;
revoke insert, update, delete on public.profiles, public.friendships from authenticated;
grant select on public.profiles, public.friendships to authenticated;
grant select, insert, update, delete on public.posts to authenticated;

-- Are you and `other` friends? Only ever about the caller, so nobody can use it to map
-- who else is friends with whom.
create or replace function public.is_friend(other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.friendships f
    where f.accepted
      and ((f.requester = auth.uid() and f.addressee = other)
        or (f.requester = other and f.addressee = auth.uid()))
  );
$$;

drop policy if exists "daybyday: see yourself and people you're connected to" on public.profiles;
create policy "daybyday: see yourself and people you're connected to" on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1 from public.friendships f
      where (f.requester = (select auth.uid()) and f.addressee = profiles.id)
         or (f.addressee = (select auth.uid()) and f.requester = profiles.id)
    )
  );

drop policy if exists "daybyday: see your own friendships" on public.friendships;
create policy "daybyday: see your own friendships" on public.friendships
  for select to authenticated
  using ((select auth.uid()) in (requester, addressee));

drop policy if exists "daybyday: read your posts and friends' posts" on public.posts;
create policy "daybyday: read your posts and friends' posts" on public.posts
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_friend(user_id));

drop policy if exists "daybyday: add your own posts" on public.posts;
create policy "daybyday: add your own posts" on public.posts
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "daybyday: change your own posts" on public.posts;
create policy "daybyday: change your own posts" on public.posts
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "daybyday: delete your own posts" on public.posts;
create policy "daybyday: delete your own posts" on public.posts
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- the first version had are_friends(a, b), which answered for any two people
drop function if exists public.are_friends(uuid, uuid);

-- 3. Functions the app calls ------------------------------------------------------------------

-- six characters without look-alikes (no 0/O, 1/I/L)
create or replace function public.new_friend_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  c text;
begin
  loop
    c := '';
    for i in 1..6 loop
      c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.profiles where code = c);
  end loop;
  return c;
end $$;

-- Join, or change your name. Returns your profile (with your friend code).
create or replace function public.save_profile(display_name text) returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  clean text := btrim(coalesce(display_name, ''));
  p public.profiles;
begin
  if me is null then raise exception 'Sign in first.'; end if;
  if char_length(clean) not between 1 and 40 then raise exception 'Your name needs 1 to 40 characters.'; end if;
  insert into public.profiles (id, name, code) values (me, clean, public.new_friend_code())
  on conflict (id) do update set name = excluded.name
  returning * into p;
  return p;
end $$;

-- Add someone by their code. If they already asked you, you become friends right away.
create or replace function public.add_friend(friend_code text) returns json
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  them public.profiles;
  clean text := upper(regexp_replace(coalesce(friend_code, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  if me is null or not exists (select 1 from public.profiles where id = me) then
    raise exception 'Turn on Friends first.';
  end if;
  select * into them from public.profiles where code = clean;
  if them.id is null then raise exception 'No one has the code %.', clean; end if;
  if them.id = me then raise exception 'That''s your own code.'; end if;
  -- they already asked you: that's a yes
  update public.friendships set accepted = true where requester = them.id and addressee = me;
  if not found then
    insert into public.friendships (requester, addressee) values (me, them.id) on conflict do nothing;
  end if;
  return json_build_object(
    'id', them.id,
    'name', them.name,
    'state', (select case when f.accepted then 'friends' else 'sent' end
              from public.friendships f
              where (f.requester = me and f.addressee = them.id) or (f.requester = them.id and f.addressee = me))
  );
end $$;

create or replace function public.accept_friend(friend uuid) returns void
language sql security definer set search_path = '' as $$
  update public.friendships set accepted = true
  where requester = friend and addressee = auth.uid();
$$;

-- Decline a request, cancel one you sent, or unfriend.
create or replace function public.remove_friend(friend uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.friendships
  where (requester = auth.uid() and addressee = friend)
     or (requester = friend and addressee = auth.uid());
$$;

-- Everyone you're connected to, with each friend's three most recent posts.
-- Runs as the caller, so the policies above decide what comes back.
create or replace function public.my_friends() returns json
language sql stable security invoker set search_path = '' as $$
  select coalesce(json_agg(x order by x.state, lower(x.name)), '[]'::json)
  from (
    select p.id, p.name,
           case when f.accepted then 'friends'
                when f.requester = auth.uid() then 'sent'
                else 'received' end as state,
           (select coalesce(json_agg(q order by q.day desc), '[]'::json)
              from (select po.day, po.count, po.streak, po.snippet, po.photo_path, po.updated_at
                      from public.posts po
                     where po.user_id = p.id and f.accepted
                     order by po.day desc
                     limit 3) q) as posts
      from public.friendships f
      join public.profiles p
        on p.id = case when f.requester = auth.uid() then f.addressee else f.requester end
     where auth.uid() in (f.requester, f.addressee)
  ) x;
$$;

-- Leave Friends: deletes your profile, friendships and posts, then the sign-in itself.
-- The app deletes your shared photos through the Storage API first.
create or replace function public.delete_me() returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Sign in first.'; end if;
  delete from public.profiles where id = me;  -- cascades to friendships and posts
  begin
    delete from auth.users where id = me;
  exception when others then
    null;  -- everything you shared is already gone; an orphaned anonymous sign-in holds nothing
  end;
end $$;

revoke execute on function public.is_friend(uuid), public.new_friend_code(),
  public.save_profile(text), public.add_friend(text), public.accept_friend(uuid),
  public.remove_friend(uuid), public.my_friends(), public.delete_me() from public, anon;
grant execute on function public.is_friend(uuid), public.save_profile(text),
  public.add_friend(text), public.accept_friend(uuid), public.remove_friend(uuid),
  public.my_friends(), public.delete_me() to authenticated;

-- 4. Shared photos ---------------------------------------------------------------------------
-- A private bucket. Each person writes only in a folder named after their user id. A friend can read
-- a photo only while one of its owner's posts points at it, so unsharing hides it right away even if
-- deleting the file fails. JPEG only, 5 MB at most (the app sends about 0.5 MB).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('journal-photos', 'journal-photos', false, 5242880, array['image/jpeg'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "daybyday: upload your own photos" on storage.objects;
create policy "daybyday: upload your own photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'journal-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "daybyday: replace your own photos" on storage.objects;
create policy "daybyday: replace your own photos" on storage.objects
  for update to authenticated
  using (bucket_id = 'journal-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'journal-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "daybyday: delete your own photos" on storage.objects;
create policy "daybyday: delete your own photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'journal-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "daybyday: see your photos and friends' photos" on storage.objects;
drop policy if exists "daybyday: see your photos and the ones friends share" on storage.objects;
create policy "daybyday: see your photos and the ones friends share" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'journal-photos'
    and ((storage.foldername(name))[1] = (select auth.uid())::text
         -- posts' own rules limit this to accepted friends
         or exists (select 1 from public.posts p where p.photo_path = storage.objects.name))
  );

-- the first version gave friends the whole folder through this
drop function if exists public.is_friend_folder(text);
