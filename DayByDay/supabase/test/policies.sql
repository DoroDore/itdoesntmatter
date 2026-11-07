create function pg_temp.as_user(u text) returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', u, false); end $$;

set role authenticated;

select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000000');

do $$ declare p record; begin select * into p from public.save_profile('  Ana  '); assert p.name = 'Ana', 'name trimmed'; assert p.code ~ '^[A-HJKMNP-Z2-9]{6}$', 'code alphabet: ' || p.code; raise notice 'PASS: A joined with code %', p.code; end $$;

insert into public.posts (user_id, day, count, streak, snippet, photo_path) values ('aaaaaaaa-0000-0000-0000-000000000000', '2026-11-07', 313, 4, 'went to the farmers market', 'aaaaaaaa-0000-0000-0000-000000000000/2026-11-07.jpg');

do $$ begin assert to_regprocedure('public.are_friends(uuid, uuid)') is null and to_regprocedure('public.is_friend_folder(text)') is null, 'FAIL: old helper functions still exist'; raise notice 'PASS: no function answers about other people''s friendships'; end $$;

do $$ begin begin insert into public.posts (user_id, day) values ('bbbbbbbb-0000-0000-0000-000000000000', '2026-11-07'); raise exception 'FAIL: A posted as B'; exception when insufficient_privilege then raise notice 'PASS: A cannot post as B'; end; end $$;

do $$ begin begin insert into public.posts (user_id, day, photo_path) values ('aaaaaaaa-0000-0000-0000-000000000000', '2026-11-06', 'bbbbbbbb-0000-0000-0000-000000000000/2026-11-06.jpg'); raise exception 'FAIL: A pointed at B''s photo'; exception when check_violation then raise notice 'PASS: posts can only point at your own photo'; end; end $$;

do $$ begin begin insert into public.posts (user_id, day, snippet) values ('aaaaaaaa-0000-0000-0000-000000000000', '2026-11-05', repeat('x', 281)); raise exception 'FAIL: 281-char snippet accepted'; exception when check_violation then raise notice 'PASS: snippet capped at 280'; end; end $$;

do $$ begin begin update public.profiles set name = 'Hacked' where true; raise exception 'FAIL: direct profile update allowed'; exception when insufficient_privilege then raise notice 'PASS: profiles only change through save_profile'; end; end $$;

do $$ begin begin insert into public.friendships (requester, addressee, accepted) values ('aaaaaaaa-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000000', true); raise exception 'FAIL: A forced a friendship'; exception when insufficient_privilege then raise notice 'PASS: friendships only change through functions'; end; end $$;

insert into storage.objects (bucket_id, name) values ('journal-photos', 'aaaaaaaa-0000-0000-0000-000000000000/2026-11-07.jpg'), ('journal-photos', 'aaaaaaaa-0000-0000-0000-000000000000/2026-11-06.jpg');

do $$ begin begin insert into storage.objects (bucket_id, name) values ('journal-photos', 'bbbbbbbb-0000-0000-0000-000000000000/2026-11-07.jpg'); raise exception 'FAIL: A uploaded into B''s folder'; exception when insufficient_privilege then raise notice 'PASS: A cannot upload into B''s folder'; end; end $$;

select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000000');

do $$ begin perform public.save_profile('Ben'); raise notice 'PASS: B joined'; end $$;

do $$ begin assert (select count(*) from public.posts where user_id = 'aaaaaaaa-0000-0000-0000-000000000000') = 0, 'FAIL: B sees A posts before friendship'; assert (select count(*) from public.profiles) = 1, 'FAIL: B sees strangers'' profiles'; assert (select count(*) from storage.objects) = 0, 'FAIL: B sees A photo before friendship'; raise notice 'PASS: strangers see nothing'; end $$;

select pg_temp.as_user('cccccccc-0000-0000-0000-000000000000');

do $$ begin perform public.save_profile('Cy'); raise notice 'PASS: C joined'; end $$;

select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000000');

do $$ declare r json; bcode text; begin select code into bcode from public.profiles where name = 'Ben'; assert bcode is null, 'FAIL: A can read B''s code before connecting'; reset role; select code into bcode from public.profiles where name = 'Ben'; set role authenticated; r := public.add_friend(lower(substr(bcode,1,3)) || '-' || lower(substr(bcode,4))); assert r->>'state' = 'sent', 'FAIL: state ' || r::text; assert r->>'name' = 'Ben', 'FAIL: name'; raise notice 'PASS: A sent B a request by code (case and dashes ignored): %', r; end $$;

do $$ declare r json; bcode text; begin reset role; select code into bcode from public.profiles where name = 'Ben'; set role authenticated; r := public.add_friend(bcode); assert r->>'state' = 'sent', 'FAIL: repeat add changed state'; raise notice 'PASS: adding twice is harmless'; end $$;

do $$ declare acode text; begin select code into acode from public.profiles where id = auth.uid(); begin perform public.add_friend(acode); raise exception 'FAIL: added self'; exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; raise notice 'PASS: own code refused: %', sqlerrm; end; end $$;

do $$ begin begin perform public.add_friend('ZZZZZZ'); raise exception 'FAIL: unknown code accepted'; exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; raise notice 'PASS: unknown code refused: %', sqlerrm; end; end $$;

select pg_temp.as_user('cccccccc-0000-0000-0000-000000000000');

do $$ begin perform public.accept_friend('aaaaaaaa-0000-0000-0000-000000000000'); reset role; assert (select not accepted from public.friendships where requester = 'aaaaaaaa-0000-0000-0000-000000000000'), 'FAIL: C accepted a request meant for B'; set role authenticated; raise notice 'PASS: only the addressee can accept'; end $$;

select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000000');

do $$ declare j json; begin j := public.my_friends(); assert json_array_length(j) = 1 and j->0->>'state' = 'received' and json_array_length(j->0->'posts') = 0, 'FAIL: pending view ' || j::text; assert (select count(*) from public.posts where user_id = 'aaaaaaaa-0000-0000-0000-000000000000') = 0, 'FAIL: pending request shows posts'; raise notice 'PASS: B sees the request from A, but not A''s posts yet'; end $$;

do $$ declare j json; begin perform public.accept_friend('aaaaaaaa-0000-0000-0000-000000000000'); j := public.my_friends(); assert j->0->>'state' = 'friends', 'FAIL: not friends'; assert j->0->'posts'->0->>'snippet' = 'went to the farmers market', 'FAIL: snippet ' || j::text; assert (select count(*) from storage.objects) = 1, 'FAIL: friend cannot see photo'; raise notice 'PASS: after accepting, B sees A''s post and photo: %', j; end $$;

do $$ begin begin delete from public.posts where user_id = 'aaaaaaaa-0000-0000-0000-000000000000'; assert (select count(*) from public.posts where user_id = 'aaaaaaaa-0000-0000-0000-000000000000') = 1, 'FAIL: B deleted A''s post'; raise notice 'PASS: friends can read but not delete your posts'; end; end $$;

do $$ begin assert (select count(*) from storage.objects where name like '%2026-11-06.jpg') = 0, 'FAIL: friend sees a photo no post points at'; raise notice 'PASS: friends see only photos a post shares, not the whole folder'; end $$;

select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000000');

update public.posts set photo_path = null where day = '2026-11-07';

select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000000');

do $$ begin assert (select count(*) from storage.objects) = 0, 'FAIL: unshared photo still readable by a friend'; raise notice 'PASS: unsharing a photo hides it from friends at once, even before the file is deleted'; end $$;

select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000000');

do $$ begin assert (select count(*) from storage.objects) = 2, 'FAIL: owner cannot see own photos'; raise notice 'PASS: you always see your own photos'; end $$;

update public.posts set photo_path = 'aaaaaaaa-0000-0000-0000-000000000000/2026-11-07.jpg' where day = '2026-11-07';

select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000000');

select pg_temp.as_user('cccccccc-0000-0000-0000-000000000000');

do $$ begin assert (select count(*) from public.posts) = 0 and (select count(*) from storage.objects) = 0 and (select count(*) from public.profiles) = 1 and json_array_length(public.my_friends()) = 0, 'FAIL: C sees the A-B friendship'; raise notice 'PASS: a third person sees none of it'; end $$;

reset role;

set role anon;

do $$ begin begin perform count(*) from public.posts; raise exception 'FAIL: anon read posts'; exception when insufficient_privilege then raise notice 'PASS: signed-out requests are refused'; end; end $$;

do $$ begin begin perform public.my_friends(); raise exception 'FAIL: anon ran my_friends'; exception when insufficient_privilege then raise notice 'PASS: signed-out requests cannot call functions'; end; end $$;

reset role;

set role authenticated;

select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000000');

do $$ begin perform public.remove_friend('aaaaaaaa-0000-0000-0000-000000000000'); assert (select count(*) from public.posts where user_id = 'aaaaaaaa-0000-0000-0000-000000000000') = 0, 'FAIL: still sees posts after unfriending'; assert json_array_length(public.my_friends()) = 0, 'FAIL'; raise notice 'PASS: unfriending hides everything again'; end $$;

select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000000');

do $$ begin perform public.delete_me(); reset role; assert not exists (select 1 from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000000'), 'FAIL: profile left'; assert not exists (select 1 from public.posts where user_id = 'aaaaaaaa-0000-0000-0000-000000000000'), 'FAIL: posts left'; assert not exists (select 1 from auth.users where id = 'aaaaaaaa-0000-0000-0000-000000000000'), 'FAIL: auth user left'; set role authenticated; raise notice 'PASS: leaving deletes profile, posts and sign-in'; end $$;

reset role;

