// Tests source/share.js against an in-memory fake Supabase, using the JavaScript engine built into macOS.
// Run with dev/test.sh.
const SRC = arguments[0];

/* ---------- Node shims (just what share.js uses) ---------- */
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
class Buffer extends Uint8Array {
  static from(x) {
    if (typeof x === "string") { const a = new Buffer(x.length); for (let i = 0; i < x.length; i++) a[i] = x.charCodeAt(i) & 255; return a; }
    if (x instanceof ArrayBuffer) return new Buffer(x.slice(0));
    if (ArrayBuffer.isView(x)) { const a = new Buffer(x.length); a.set(x); return a; }
    throw new Error("Buffer.from shim: " + typeof x);
  }
  toString(enc) {
    if (enc !== "base64") return String.fromCharCode(...this);
    let s = "";
    for (let i = 0; i < this.length; i += 3) {
      const n = (this[i] << 16) | ((this[i + 1] || 0) << 8) | (this[i + 2] || 0);
      s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < this.length ? B64[(n >> 6) & 63] : "=") + (i + 2 < this.length ? B64[n & 63] : "=");
    }
    return s;
  }
}
const files = new Map(); // path -> {data, mode}
const enoent = (p) => Object.assign(new Error("ENOENT " + p), { code: "ENOENT" });
const fs = {
  readFileSync(p, enc) { if (!files.has(p)) throw enoent(p); const d = files.get(p).data; return enc ? (typeof d === "string" ? d : d.toString()) : (typeof d === "string" ? Buffer.from(d) : d); },
  writeFileSync(p, data, opts) { files.set(p, { data, mode: opts && opts.mode }); },
  renameSync(a, b) { if (!files.has(a)) throw enoent(a); files.set(b, files.get(a)); files.delete(a); },
  unlinkSync(p) { if (!files.delete(p)) throw enoent(p); },
  mkdirSync() {},
  existsSync(p) { return files.has(p); },
  readdirSync(dir) { return [...files.keys()].filter((k) => k.startsWith(dir + "/")).map((k) => k.slice(dir.length + 1)); },
  rmSync(dir) { for (const k of [...files.keys()]) if (k.startsWith(dir + "/")) files.delete(k); }
};
const path = { join: (...a) => a.join("/").replace(/\/+/g, "/"), dirname: (p) => p.replace(/\/[^/]*$/, "") };
const AbortSignal = { timeout: () => undefined };
function loadShare() {
  const module = { exports: {} };
  const req = (n) => ({ fs, path })[n] || (() => { throw new Error("no module " + n); })();
  new Function("require", "module", "exports", "Buffer", "AbortSignal", "fetch", read(SRC))(req, module, module.exports, Buffer, AbortSignal, undefined);
  return module.exports;
}

/* ---------- fake Supabase ---------- */
const server = {
  offline: false, n: 0, users: {}, access: {}, refresh: {}, profiles: {}, friendships: [], posts: {}, objects: {}, calls: [],
  issue(uid) { const t = ++this.n; this.access["at" + t] = uid; this.refresh["rt" + t] = uid; return { access_token: "at" + t, refresh_token: "rt" + t, expires_in: 3600, user: { id: uid } }; },
  friends(a, b) { return this.friendships.some((f) => f.accepted && ((f.r === a && f.a === b) || (f.r === b && f.a === a))); }
};
const JPEG = (() => { const a = new Uint8Array(400); a[0] = 0xff; a[1] = 0xd8; a[2] = 0xff; for (let i = 3; i < 400; i++) a[i] = i & 255; return a; })();
function respond(status, body, bin) {
  return {
    status, ok: status >= 200 && status < 300,
    text: async () => (body === undefined ? "" : typeof body === "string" ? body : JSON.stringify(body)),
    arrayBuffer: async () => bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)
  };
}
async function fakeFetch(url, opts) {
  if (server.offline) throw new TypeError("fetch failed");
  const u = url.replace("https://test.supabase.co", "");
  const h = opts.headers || {};
  server.calls.push(opts.method + " " + u);
  if (h.apikey !== "anon-key") return respond(401, { message: "bad apikey" });
  const body = opts.body && typeof opts.body === "string" ? JSON.parse(opts.body) : opts.body;
  if (u === "/auth/v1/signup") { const uid = "0000000" + (server.uids = (server.uids || 0) + 1) + "-aaaa-bbbb-cccc-000000000000"; server.users[uid] = true; return respond(200, server.issue(uid)); }
  if (u === "/auth/v1/token?grant_type=refresh_token") {
    if (server.refreshFail) return respond(server.refreshFail.status, server.refreshFail.body);
    const uid = server.refresh[body.refresh_token];
    if (!uid) return respond(400, { error: "invalid_grant", error_description: "Invalid Refresh Token: Refresh Token Not Found" });
    delete server.refresh[body.refresh_token]; // rotation
    return respond(200, server.issue(uid));
  }
  const me = server.access[(h.Authorization || "").replace("Bearer ", "")];
  if (!me) return respond(401, { message: "JWT expired" });
  const rpc = u.match(/^\/rest\/v1\/rpc\/(\w+)$/);
  if (rpc) {
    const fn = rpc[1];
    if (fn === "save_profile") { const p = server.profiles[me] || (server.profiles[me] = { id: me, code: "ABCDEFGHJK"[(server.codes = (server.codes || 0) + 1)] + "K7P2Q" }); p.name = body.display_name.trim(); return respond(200, p); }
    if (fn === "add_friend") {
      const them = Object.values(server.profiles).find((p) => p.code === body.friend_code);
      if (!them) return respond(400, { code: "P0001", message: `No one has the code ${body.friend_code}.` });
      const back = server.friendships.find((f) => f.r === them.id && f.a === me);
      if (back) back.accepted = true;
      else if (!server.friendships.some((f) => f.r === me && f.a === them.id)) server.friendships.push({ r: me, a: them.id, accepted: false });
      const f = server.friendships.find((x) => (x.r === me && x.a === them.id) || (x.r === them.id && x.a === me));
      return respond(200, { id: them.id, name: them.name, state: f.accepted ? "friends" : "sent" });
    }
    if (fn === "accept_friend") { for (const f of server.friendships) if (f.r === body.friend && f.a === me) f.accepted = true; return respond(204); }
    if (fn === "remove_friend") { server.friendships = server.friendships.filter((f) => !((f.r === me && f.a === body.friend) || (f.r === body.friend && f.a === me))); return respond(204); }
    if (fn === "my_friends") {
      const out = server.friendships.filter((f) => f.r === me || f.a === me).map((f) => {
        const other = f.r === me ? f.a : f.r;
        const posts = f.accepted ? Object.values(server.posts).filter((p) => p.user_id === other).sort((a, b) => (a.day < b.day ? 1 : -1)).slice(0, 3) : [];
        return { id: other, name: server.profiles[other].name, state: f.accepted ? "friends" : f.r === me ? "sent" : "received", posts };
      });
      return respond(200, out);
    }
    if (fn === "delete_me") { delete server.profiles[me]; server.friendships = server.friendships.filter((f) => f.r !== me && f.a !== me); for (const k in server.posts) if (server.posts[k].user_id === me) delete server.posts[k]; delete server.users[me]; return respond(204); }
    return respond(404, { message: "no rpc " + fn });
  }
  if (u === "/rest/v1/posts?on_conflict=user_id,day" && opts.method === "POST") {
    if (body.user_id !== me) return respond(403, { message: "new row violates row-level security policy" });
    if (!/resolution=merge-duplicates/.test(h.Prefer || "")) return respond(409, { message: "duplicate key" });
    if (server.badDays && server.badDays.has(body.day)) return respond(400, { code: "22P02", message: "unsupported Unicode escape sequence" });
    if (body.snippet && /[\ud800-\udbff](?![\udc00-\udfff])|(^|[^\ud800-\udbff])[\udc00-\udfff]/.test(body.snippet)) return respond(400, { code: "22P05", message: "lone surrogate" });
    server.posts[me + body.day] = { ...body }; return respond(201);
  }
  if (u.startsWith("/rest/v1/posts?user_id=eq.") && opts.method === "PATCH") {
    const uid = u.split("eq.")[1];
    for (const p of Object.values(server.posts)) if (p.user_id === uid && uid === me) Object.assign(p, body); // RLS: only your own rows
    return respond(204);
  }
  const obj = u.match(/^\/storage\/v1\/object\/journal-photos\/(.+)$/);
  if (obj && opts.method === "POST") {
    if (!obj[1].startsWith(me + "/")) return respond(403, { message: "new row violates row-level security policy" });
    if (h["Content-Type"] !== "image/jpeg") return respond(415, { message: "mime" });
    server.objects[obj[1]] = opts.body; return respond(200, { Key: "journal-photos/" + obj[1] });
  }
  if (u === "/storage/v1/object/journal-photos" && opts.method === "DELETE") {
    if (server.failDelete) return respond(500, { message: "storage hiccup" });
    const gone = body.prefixes.filter((p) => p.startsWith(me + "/") && server.objects[p]);
    for (const p of gone) delete server.objects[p]; return respond(200, gone.map((name) => ({ name })));
  }
  if (u === "/storage/v1/object/list/journal-photos") {
    return respond(200, Object.keys(server.objects).filter((k) => k.startsWith(body.prefix + "/")).map((k) => ({ name: k.slice(body.prefix.length + 1) })));
  }
  const get = u.match(/^\/storage\/v1\/object\/authenticated\/journal-photos\/(([^/]+)\/.+)$/);
  if (get) {
    // like setup.sql: a friend's photo is readable only while one of their posts points at it
    const shared = server.friends(me, get[2]) && Object.values(server.posts).some((p) => p.photo_path === get[1]);
    if (get[2] !== me && !shared) return respond(400, { message: "Object not found" });
    return server.objects[get[1]] ? respond(200, undefined, server.objects[get[1]]) : respond(400, { message: "Object not found" });
  }
  return respond(404, { message: "no route " + opts.method + " " + u });
}

/* ---------- tests ---------- */
let passed = 0, failed = 0;
const ok = (cond, msg) => { if (cond) { passed++; print("PASS " + msg); } else { failed++; print("FAIL " + msg); } };
const rejects = async (p, code, msg) => { try { await p; ok(false, msg + " (did not throw)"); } catch (e) { ok(e.code === code, msg + ` [${e.code}: ${e.message}]`); } };

(async () => {
  try {
    const { createSharing } = loadShare();
    files.set("/cfg/empty.json", { data: JSON.stringify({ url: "", anonKey: "" }) });
    files.set("/cfg/http.json", { data: JSON.stringify({ url: "http://evil.example.com", anonKey: "k" }) });
    files.set("/cfg/ok.json", { data: JSON.stringify({ url: "https://test.supabase.co/", anonKey: "anon-key" }) });
    const photoPath = (n) => (/^\d{4}-\d{2}-\d{2}-\d{13}\.jpg$/.test(n) ? "/ana/photos/" + n : null);

    const off = createSharing({ dir: "/x", configPath: "/cfg/empty.json", photoPath, fetch: fakeFetch });
    ok(!off.status().configured, "empty config means Friends isn't set up");
    await rejects(off.friends(), "not-configured", "calls fail clearly when not set up");
    ok(!createSharing({ dir: "/x", configPath: "/cfg/http.json", photoPath, fetch: fakeFetch }).status().configured, "a plain-http server (not localhost) is refused");

    const ana = createSharing({ dir: "/ana", configPath: "/cfg/ok.json", photoPath, fetch: fakeFetch });
    const ben = createSharing({ dir: "/ben", configPath: "/cfg/ok.json", photoPath, fetch: fakeFetch });
    ok(ana.status().configured && !ana.status().joined, "configured, not joined yet");
    ok((await ana.push({ day: "2026-11-07" })).queued === false, "nothing is queued before joining");
    await rejects(ana.join("   "), "bad-input", "blank name refused");

    const sa = await ana.join("  Ana ");
    ok(sa.joined && sa.name === "Ana" && sa.code.length === 6, "Ana joins: " + JSON.stringify(sa));
    ok(files.get("/ana/sharing.json").mode === 0o600, "sharing.json is written readable only by you");
    const sb = await ben.join("Ben");
    await rejects(ana.addFriend(sa.code), "bad-input", "adding your own code is refused");
    await rejects(ana.addFriend("ZZ"), "bad-input", "short code refused before calling the server");
    await rejects(ana.addFriend("ZZZZZZ"), "server", "unknown code shows the server's message");

    const added = await ana.addFriend(sb.code.toLowerCase().slice(0, 3) + "-" + sb.code.slice(3));
    ok(added.state === "sent" && added.name === "Ben", "Ana adds Ben by code (lowercase and dash ok)");
    let bf = await ben.friends();
    ok(bf.length === 1 && bf[0].state === "received" && bf[0].name === "Ana", "Ben sees Ana's request");
    await rejects(ben.acceptFriend("not-a-uuid"), "bad-input", "accept checks the id");
    await ben.acceptFriend(bf[0].id);
    let af = await ana.friends();
    ok(af[0].state === "friends", "after Ben accepts, they're friends");

    files.set("/ana/photos/2026-11-07-1762500000000.jpg", { data: Buffer.from(JPEG) });
    const r1 = await ana.push({ day: "2026-11-07", count: 313, streak: 4, snippet: "  went to the farmers market  ", photo: "2026-11-07-1762500000000.jpg" });
    ok(r1.queued && r1.unsent === 0, "Ana shares a line and a photo; nothing left unsent");
    ok(server.objects[sa.code && Object.keys(server.objects)[0]] && Object.keys(server.objects)[0].endsWith("/2026-11-07.jpg"), "photo uploaded to Ana's folder as the day's file");
    bf = await ben.friends();
    const post = bf[0].posts[0];
    ok(post.day === "2026-11-07" && post.snippet === "went to the farmers market" && post.count === 313 && post.streak === 4, "Ben sees Ana's post: " + JSON.stringify(post));
    const url = await ben.friendPhoto(post.photo, post.updatedAt);
    ok(url.startsWith("data:image/jpeg;base64,/9j/"), "Ben downloads Ana's photo as a JPEG data URL");
    const before = server.calls.length;
    await ben.friendPhoto(post.photo, post.updatedAt);
    ok(server.calls.length === before, "second view of the same photo comes from the disk cache");
    await rejects(ben.friendPhoto("../../etc/passwd", "1"), "bad-input", "photo paths are checked");
    await rejects(ana.push({ day: "11/07/2026" }), "bad-input", "bad day refused");

    const r2 = await ana.push({ day: "2026-11-07", count: 313, streak: 4, snippet: null, photo: null });
    ok(Object.keys(server.objects).length === 0, "turning sharing off deletes the photo from the server");
    ok(server.posts[af[0].id ? Object.keys(server.posts)[0] : ""].snippet === null, "…and clears the line");

    server.offline = true;
    const r3 = await ana.push({ day: "2026-11-08", count: 314, streak: 5 });
    ok(r3.queued && r3.unsent === 1, "offline: the day waits in the outbox");
    await rejects(ana.friends(), "offline", "offline errors say so");
    server.offline = false;
    await ana.flush();
    ok(ana.status().unsent === 0 && Object.values(server.posts).some((p) => p.day === "2026-11-08"), "back online: the outbox sends");

    // a missed day filled in later is marked as such
    let bp = (await ben.friends())[0].posts.find((p) => p.day === "2026-11-08");
    ok(bp && bp.late === false && bp.streakLate === 0, "a day filed on time isn't marked");
    await ana.push({ day: "2026-11-06", count: 312, streak: 3, late: true, streakLate: 1 });
    await ana.push({ day: "2026-11-08", count: 314, streak: 5, streakLate: 9 });
    const bposts = (await ben.friends())[0].posts;
    bp = bposts.find((p) => p.day === "2026-11-06");
    ok(bp && bp.late === true && bp.streakLate === 1, "Ben sees that Ana filled in Nov 6 later");
    bp = bposts.find((p) => p.day === "2026-11-08");
    ok(bp && bp.late === false && bp.streakLate === 5, "the count of filled-in days never exceeds the streak");

    for (const k in server.access) delete server.access[k]; // every access token expires
    af = await ana.friends();
    ok(af.length === 1, "an expired token is refreshed and the call retried");
    const rt = JSON.parse(files.get("/ana/sharing.json").data).refresh;
    ok(server.refresh[rt] === sa.code ? false : !!server.refresh[rt], "the rotated refresh token is the one saved");

    for (const k in server.access) delete server.access[k];
    for (const k in server.refresh) if (server.refresh[k] === af[0].id) delete server.refresh[k]; // Ben's sign-in revoked
    await rejects(ben.friends(), "session-lost", "a revoked sign-in is reported as signed out");
    ok(!ben.status().joined && ben.status().lost, "…and the app knows to offer joining again");
    const sb2 = await ben.join("Ben");
    ok(sb2.joined && !sb2.lost, "joining again works (a new account)");

    files.set("/ana/photos/2026-11-09-1762600000000.jpg", { data: Buffer.from(JPEG) });
    await ana.push({ day: "2026-11-09", count: 315, streak: 6, photo: "2026-11-09-1762600000000.jpg" });
    ok(Object.keys(server.objects).length === 1, "Ana shares another photo");
    const left = await ana.leave();
    ok(!left.joined && Object.keys(server.objects).length === 0, "leaving deletes Ana's shared photos");
    ok(!Object.values(server.profiles).some((p) => p.name === "Ana") && !Object.values(server.posts).some((p) => p.day === "2026-11-09"), "…and her profile and posts");
    ok(!files.has("/ana/sharing.json"), "…and forgets the sign-in on this Mac");

    /* ---- fixes from the security review ---- */
    const cy = createSharing({ dir: "/cy", configPath: "/cfg/ok.json", photoPath: (n) => "/cy/photos/" + n, fetch: fakeFetch });
    const dee = createSharing({ dir: "/dee", configPath: "/cfg/ok.json", photoPath: (n) => "/dee/photos/" + n, fetch: fakeFetch });
    await cy.join("Cy");
    let sd = await dee.join("Dee");
    const cyId = JSON.parse(files.get("/cy/sharing.json").data).userId;
    await cy.addFriend(sd.code); await dee.acceptFriend(cyId);

    // only a sign-in that's really gone signs you out
    for (const k in server.access) delete server.access[k];
    server.refreshFail = { status: 401, body: { message: "Invalid API key" } };
    await rejects(cy.friends(), "server", "a rejected API key during refresh is an error…");
    ok(cy.status().joined && !cy.status().lost, "…but keeps the sign-in (a rotated key must not strand shares)");
    server.refreshFail = { status: 429, body: { message: "Too many requests" } };
    await rejects(cy.friends(), "server", "a rate-limited refresh is an error…");
    ok(cy.status().joined, "…and keeps the sign-in too");
    server.refreshFail = null;
    ok((await cy.friends()).length === 1, "once the server is fine again, the same sign-in still works");
    for (const k in server.access) delete server.access[k];
    server.refreshFail = { status: 400, body: { code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token: Refresh Token Not Found" } };
    await rejects(dee.friends(), "session-lost", "GoTrue's refresh_token_not_found does sign you out");
    ok(!dee.status().joined && dee.status().lost, "…and the app offers joining again");
    server.refreshFail = null;
    sd = await dee.join("Dee");
    await cy.addFriend(sd.code); await dee.acceptFriend(cyId);

    // one day the server rejects doesn't hold up the rest
    server.badDays = new Set(["2026-11-10"]);
    server.offline = true;
    await cy.push({ day: "2026-11-10", streak: 1, snippet: "x" });
    await cy.push({ day: "2026-11-11", streak: 2 });
    server.offline = false;
    await cy.flush();
    ok(cy.status().unsent === 0 && cy.status().stuck === 1, "a day the server rejects is set aside: " + JSON.stringify(cy.status()));
    ok(!!server.posts[cyId + "2026-11-11"], "…and the day after it still goes out");
    server.badDays = new Set();
    await cy.push({ day: "2026-11-10", streak: 1 });
    ok(cy.status().stuck === 0 && !!server.posts[cyId + "2026-11-10"], "saving that day again sends it and clears the warning");

    // emoji are never cut in half
    await cy.push({ day: "2026-11-12", streak: 3, snippet: "🙂".repeat(300) });
    const sn = server.posts[cyId + "2026-11-12"] && server.posts[cyId + "2026-11-12"].snippet;
    ok(!!sn && Array.from(sn).length === 280, "a 300-emoji line is trimmed to 280 whole emoji and accepted");

    // unsharing: the post lets go of the photo first, and a failed delete is retried
    files.set("/cy/photos/2026-11-12-1762700000000.jpg", { data: Buffer.from(JPEG) });
    await cy.push({ day: "2026-11-12", streak: 3, photo: "2026-11-12-1762700000000.jpg" });
    const pf = (await dee.friends())[0].posts.find((p) => p.day === "2026-11-12");
    ok(!!pf && !!(await dee.friendPhoto(pf.photo, pf.updatedAt)), "Dee sees Cy's photo");
    ok(fs.readdirSync("/dee/friend-photos").length === 1, "…and it's cached");
    server.failDelete = true; server.calls = [];
    await cy.push({ day: "2026-11-12", streak: 3, photo: null });
    const iPost = server.calls.findIndex((c) => c.startsWith("POST /rest/v1/posts")), iDel = server.calls.findIndex((c) => c.startsWith("DELETE /storage"));
    ok(iPost >= 0 && iDel > iPost, "unsharing updates the post before deleting the file");
    await rejects(dee.friendPhoto(pf.photo, "v2"), "server", "with the file still there, Dee can't fetch it anymore");
    ok(JSON.parse(files.get("/cy/sharing.json").data).cleanup.length === 1 && cy.status().unsent === 0, "the failed delete is remembered, and the post still counted as sent");
    await cy.push({ day: "2026-11-13", streak: 4 });
    ok(!!server.posts[cyId + "2026-11-13"], "a delete that keeps failing doesn't hold up new days");
    server.failDelete = false;
    await cy.flush();
    ok(JSON.parse(files.get("/cy/sharing.json").data).cleanup.length === 0 && !Object.keys(server.objects).some((k) => k.startsWith(cyId)), "…and it's finished on a later flush");
    await dee.friends();
    ok(fs.readdirSync("/dee/friend-photos").length === 0, "Dee's cached copy is removed once it's no longer shared");

    // sharing again after a failed delete isn't undone by the retry
    files.set("/cy/photos/2026-11-14-1762800000000.jpg", { data: Buffer.from(JPEG) });
    server.failDelete = true;
    await cy.push({ day: "2026-11-14", streak: 5 });
    server.failDelete = false;
    await cy.push({ day: "2026-11-14", streak: 5, photo: "2026-11-14-1762800000000.jpg" });
    await cy.flush();
    ok(!!server.objects[cyId + "/2026-11-14.jpg"], "re-sharing cancels a pending delete of the same photo");

    // a photo that's already up isn't sent again
    const uploads = () => server.calls.filter((c) => c.startsWith("POST /storage/v1/object/journal-photos/")).length;
    server.calls = [];
    await cy.push({ day: "2026-11-14", streak: 6, snippet: "changed a tag", photo: "2026-11-14-1762800000000.jpg" });
    ok(uploads() === 0 && server.posts[cyId + "2026-11-14"].photo_path === cyId + "/2026-11-14.jpg", "re-sending a day with the same photo doesn't upload it again, and the post still points at it");
    files.set("/cy/photos/2026-11-14-1762900000000.jpg", { data: Buffer.from(JPEG) });
    server.calls = [];
    await cy.push({ day: "2026-11-14", streak: 6, photo: "2026-11-14-1762900000000.jpg" });
    ok(uploads() === 1, "a replaced photo is uploaded");
    await cy.push({ day: "2026-11-14", streak: 6, photo: null });
    ok(!server.objects[cyId + "/2026-11-14.jpg"], "…unsharing it deletes it");
    server.calls = [];
    await cy.push({ day: "2026-11-14", streak: 6, photo: "2026-11-14-1762900000000.jpg" });
    ok(uploads() === 1 && !!server.objects[cyId + "/2026-11-14.jpg"], "…and sharing it again uploads it again");

    // the day number can be taken back from everything shared
    await cy.push({ day: "2026-11-15", count: 320, streak: 6 });
    ok(server.posts[cyId + "2026-11-15"].count === 320, "the day number is shared when you choose to");
    await cy.hideCounts();
    ok(Object.values(server.posts).filter((p) => p.user_id === cyId).every((p) => p.count === null), "hiding it clears it from every post you've shared");
  } catch (e) {
    failed++; print("CRASH " + e + "\n" + e.stack);
  }
  print(`\n${passed} passed, ${failed} failed`);
})();
