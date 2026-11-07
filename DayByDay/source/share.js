// Day by Day: Friends. Talks to a Supabase project over its REST API (no npm packages).
//
// Only what you choose to share leaves the Mac: that you wrote on a given day, your day number
// and streak, and (only if you turn them on for that entry) one line from it and its photo.
// The entries themselves stay in daybyday-data.json.
//
// Sign-in is anonymous: the first time you turn on Friends, Supabase creates an account for this Mac
// and the app keeps its refresh token in sharing.json (readable only by you). Not the Keychain: the
// installer ad-hoc signs each build differently, so macOS would ask for Keychain access after every
// reinstall, and one "Deny" would lose your friend code. Your friend code is how people find you.
const fs = require("fs");
const path = require("path");

const BUCKET = "journal-photos";
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const FRIEND_PHOTO_RE = /^([0-9a-f-]{36})\/(\d{4}-\d{2}-\d{2})\.jpg$/;

class ShareError extends Error {
  constructor(code, message, status) { super(message || code); this.code = code; this.status = status || 0; }
}

/**
 * @param {object} o
 * @param {string} o.dir          where to keep sharing.json and the friend photo cache (userData)
 * @param {string} o.configPath   share-config.json: { "url": "https://xyz.supabase.co", "anonKey": "…" }
 * @param {(name: string) => string|null} o.photoPath  absolute path of one of your saved photos
 * @param {typeof fetch} [o.fetch]
 */
function createSharing(o) {
  const doFetch = o.fetch || fetch;
  const stateFile = path.join(o.dir, "sharing.json");
  const cacheDir = path.join(o.dir, "friend-photos");
  let access = null, accessUntil = 0, refreshing = null, flushing = null;

  /* ---------- config + saved state ---------- */
  function config() {
    try {
      const c = JSON.parse(fs.readFileSync(o.configPath, "utf8"));
      const url = String(c.url || "").trim().replace(/\/+$/, "");
      const key = String(c.anonKey || "").trim();
      // https only, except a local Supabase (supabase start) for development
      const okUrl = /^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(url) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url);
      if (okUrl && key) return { url, key };
    } catch (e) {}
    return null;
  }
  function load() {
    try { return JSON.parse(fs.readFileSync(stateFile, "utf8")) || {}; } catch (e) { return {}; }
  }
  function save(st) {
    fs.mkdirSync(o.dir, { recursive: true });
    const tmp = stateFile + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(st, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, stateFile);
  }
  function update(fn) { const st = load(); fn(st); save(st); return st; }
  const readRefresh = (st) => st.refresh || null;
  function keepSession(r) {
    if (!r || !r.access_token || !r.refresh_token) throw new ShareError("server", "Supabase didn't return a session.");
    access = r.access_token;
    accessUntil = Date.now() + (Number(r.expires_in) || 3600) * 1000;
    // Supabase rotates refresh tokens, so the new one has to be saved every time
    update((st) => { st.refresh = r.refresh_token; if (r.user && r.user.id) st.userId = r.user.id; });
  }

  /* ---------- http ---------- */
  async function call(method, p, { body, raw, auth = true, binary = false, headers = {}, retried = false } = {}) {
    const c = config();
    if (!c) throw new ShareError("not-configured", "Friends isn't set up in this copy of Day by Day.");
    const h = { apikey: c.key, ...headers };
    h.Authorization = "Bearer " + (auth ? await token() : c.key);
    let payload;
    if (raw) payload = raw;
    else if (body !== undefined) { h["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
    let res;
    try {
      res = await doFetch(c.url + p, { method, headers: h, body: payload, signal: AbortSignal.timeout(20000) });
    } catch (e) {
      throw new ShareError("offline", "Couldn't reach Friends. Check your internet connection.");
    }
    if (res.status === 401 && auth && !retried) { access = null; return call(method, p, { body, raw, auth, binary, headers, retried: true }); }
    if (binary && res.ok) return Buffer.from(await res.arrayBuffer());
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
    if (!res.ok) {
      const msg = (data && (data.message || data.msg || data.error_description || data.error)) || `Friends returned an error (${res.status}).`;
      throw new ShareError(res.status === 404 ? "not-found" : "server", String(msg), res.status);
    }
    return data;
  }
  async function token() {
    if (access && Date.now() < accessUntil - 60000) return access;
    if (!refreshing) {
      refreshing = (async () => {
        const rt = readRefresh(load());
        if (!rt) throw new ShareError("not-joined", "Turn on Friends first.");
        try {
          keepSession(await call("POST", "/auth/v1/token?grant_type=refresh_token", { body: { refresh_token: rt }, auth: false }));
        } catch (e) {
          if (e.status >= 400 && e.status < 500 && e.status !== 429) {
            // the sign-in was revoked or deleted (not just an outage); this Mac has to join again
            update((st) => { st.lost = true; delete st.refresh; });
            throw new ShareError("session-lost", "This Mac was signed out of Friends. Turn it on again to get a new code.");
          }
          throw e;
        }
      })().finally(() => { refreshing = null; });
    }
    await refreshing;
    return access;
  }
  const rpc = (fn, args = {}) => call("POST", `/rest/v1/rpc/${fn}`, { body: args });

  /* ---------- public API ---------- */
  function status() {
    const st = load();
    return {
      configured: !!config(),
      joined: !!(st.refresh && st.code),
      lost: !!st.lost,
      name: st.name || "",
      code: st.code || "",
      unsent: Object.keys(st.outbox || {}).length
    };
  }

  async function join(name) {
    const clean = String(name || "").trim();
    if (clean.length < 1 || clean.length > 40) throw new ShareError("bad-input", "Your name needs 1 to 40 characters.");
    if (!readRefresh(load())) {
      // anonymous sign-in (turn on "Allow anonymous sign-ins" in Supabase → Authentication)
      keepSession(await call("POST", "/auth/v1/signup", { body: { data: {} }, auth: false }));
    }
    const p = await rpc("save_profile", { display_name: clean });
    update((st) => { st.name = p.name; st.code = p.code; st.userId = p.id; delete st.lost; });
    flush().catch(() => {});
    return status();
  }
  const rename = join;

  async function friends() {
    const list = await rpc("my_friends");
    return (Array.isArray(list) ? list : []).map((f) => ({
      id: String(f.id), name: String(f.name || ""), state: f.state,
      posts: (f.posts || []).map((p) => ({
        day: String(p.day), count: p.count, streak: p.streak || 0,
        snippet: p.snippet || "", photo: p.photo_path || null, updatedAt: p.updated_at || ""
      }))
    }));
  }
  async function addFriend(code) {
    const clean = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (clean.length !== 6) throw new ShareError("bad-input", "A friend code is 6 letters and numbers.");
    if (clean === load().code) throw new ShareError("bad-input", "That's your own code.");
    return rpc("add_friend", { friend_code: clean });
  }
  async function acceptFriend(id) {
    if (!UUID_RE.test(String(id))) throw new ShareError("bad-input", "Unknown friend.");
    await rpc("accept_friend", { friend: id });
    return true;
  }
  async function removeFriend(id) {
    if (!UUID_RE.test(String(id))) throw new ShareError("bad-input", "Unknown friend.");
    await rpc("remove_friend", { friend: id });
    return true;
  }

  /**
   * Queue what friends see for one day, then try to send it. Kept in an outbox until it goes through,
   * so writing offline still shows up later.
   * @param {{day:string, count?:number, streak?:number, snippet?:string|null, photo?:string|null}} p
   *   photo: the file name of one of your saved photos, only if you chose to share it
   */
  async function push(p) {
    if (!p || !DAY_RE.test(p.day)) throw new ShareError("bad-input", "Bad day.");
    if (!status().joined) return { queued: false };
    const snippet = typeof p.snippet === "string" && p.snippet.trim() ? p.snippet.trim().slice(0, 280) : null;
    const photo = typeof p.photo === "string" && p.photo ? p.photo : null;
    update((st) => {
      st.outbox = st.outbox || {};
      st.outbox[p.day] = { count: num(p.count), streak: num(p.streak) || 0, snippet, photo, at: Date.now() };
    });
    try { await flush(); } catch (e) {}
    return { queued: true, unsent: status().unsent };
  }
  const num = (n) => (Number.isFinite(n) && n >= 0 && n <= 60000 ? Math.floor(n) : null);

  function flush() {
    if (!flushing) flushing = doFlush().finally(() => { flushing = null; });
    return flushing;
  }
  async function doFlush() {
    const st = load();
    if (!st.refresh || !st.code || !st.userId) return 0;
    const days = Object.keys(st.outbox || {}).sort();
    let sent = 0;
    for (const day of days) {
      const item = load().outbox?.[day];
      if (!item) continue;
      const objectPath = `${st.userId}/${day}.jpg`;
      let photoPath = null;
      if (item.photo) {
        const file = o.photoPath(item.photo);
        let bytes = null;
        try { bytes = file ? fs.readFileSync(file) : null; } catch (e) {}
        if (bytes) {
          await call("POST", `/storage/v1/object/${BUCKET}/${objectPath}`, {
            raw: bytes, headers: { "Content-Type": "image/jpeg", "x-upsert": "true", "cache-control": "3600" }
          });
          photoPath = objectPath;
        }
      }
      if (!photoPath) {
        // not shared (or no longer): make sure friends can't still see an old one
        try { await call("DELETE", `/storage/v1/object/${BUCKET}`, { body: { prefixes: [objectPath] } }); } catch (e) { if (e.code === "offline") throw e; }
      }
      await call("POST", "/rest/v1/posts?on_conflict=user_id,day", {
        body: { user_id: st.userId, day, count: item.count, streak: item.streak, snippet: item.snippet, photo_path: photoPath, updated_at: new Date().toISOString() },
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" }
      });
      // only clear it if nothing newer was queued for that day while this was sending
      update((s) => { if (s.outbox && s.outbox[day] && s.outbox[day].at === item.at) delete s.outbox[day]; });
      sent++;
    }
    return sent;
  }

  /** A friend's shared photo as a data URL, cached on disk by its path and version. */
  async function friendPhoto(objectPath, version) {
    const m = FRIEND_PHOTO_RE.exec(String(objectPath || ""));
    if (!m) throw new ShareError("bad-input", "Bad photo.");
    const v = String(version || "").replace(/[^0-9A-Za-z]/g, "").slice(0, 32);
    const base = `${m[1]}_${m[2]}`;
    const file = path.join(cacheDir, `${base}_${v}.jpg`);
    try { return "data:image/jpeg;base64," + fs.readFileSync(file).toString("base64"); } catch (e) {}
    const bytes = await call("GET", `/storage/v1/object/authenticated/${BUCKET}/${m[1]}/${m[2]}.jpg`, { binary: true });
    if (!bytes || bytes.length < 100 || bytes.length > 6e6 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
      throw new ShareError("server", "That photo didn't download properly.");
    }
    fs.mkdirSync(cacheDir, { recursive: true });
    for (const old of fs.readdirSync(cacheDir)) if (old.startsWith(base + "_")) { try { fs.unlinkSync(path.join(cacheDir, old)); } catch (e) {} }
    fs.writeFileSync(file, bytes);
    return "data:image/jpeg;base64," + bytes.toString("base64");
  }

  /** Delete everything you shared and your sign-in. Entries on this Mac aren't touched. */
  async function leave() {
    const st = load();
    if (st.refresh && st.userId) {
      const listed = await call("POST", `/storage/v1/object/list/${BUCKET}`, { body: { prefix: st.userId, limit: 1000, offset: 0 } });
      const names = (Array.isArray(listed) ? listed : []).map((x) => x && x.name).filter((n) => typeof n === "string" && DAY_RE.test(n.slice(0, 10)));
      if (names.length) await call("DELETE", `/storage/v1/object/${BUCKET}`, { body: { prefixes: names.map((n) => `${st.userId}/${n}`) } });
      await rpc("delete_me");
    }
    access = null; accessUntil = 0;
    try { fs.unlinkSync(stateFile); } catch (e) {}
    try { fs.rmSync(cacheDir, { recursive: true, force: true }); } catch (e) {}
    return status();
  }

  return { status, join, rename, friends, addFriend, acceptFriend, removeFriend, push, flush, friendPhoto, leave };
}

module.exports = { createSharing, ShareError };
