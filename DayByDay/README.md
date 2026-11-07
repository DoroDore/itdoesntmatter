# Day by Day

Counts the days since your birthday (Dec 29 unless you change it in Settings). Every morning the whole screen asks you to press **It's a new day.** before you can do anything else. After that you write one "Today I…" sentence, or add a photo of your paper journal, and can star days as core memories. With **Friends** you can see whether your friends have written today, and share a line or a photo when you want to.

## Install

1. Double-click **Install Day by Day.command**.
   If macOS says it can't verify the developer, right-click the file → **Open** → **Open**.
2. Wait a minute or two while it builds. The first run downloads Electron (about 100 MB), which the app runs on. It uses only tools built into macOS, so you don't need Node.
3. The app opens and is saved in your Applications folder. To keep it in the Dock, right-click its Dock icon → Options → Keep in Dock.

Run the installer again whenever the code in `source/` changes. Your entries are never touched.

## Paper journals

If you write on paper, click **Add a photo of your paper journal** under "Today I…", or drop a photo onto it. JPEG, PNG and iPhone HEIC all work.

- A photo counts as that day's entry, so the sentence is optional. It counts for your streak, the calendar and the reminder.
- The app keeps a copy at most 2000 px on the long side, redrawn upright and without the camera's metadata, so no location is stored or shared.
- Click a photo to see it larger, or double-click it to open it in Preview.

## Friends

Open the **Friends** tab, type your name and press **Turn on Friends**. You get a six-character friend code.

- **Connecting:** send your code to a friend. When they add it and you accept, or you add theirs, you see each other. Friends of friends don't see you.
- **What friends always see:** whether you've written each day, and your streak.
- **What they see only if you choose:**
  - Under each entry, **Share a line from this entry** (up to 280 characters, starting with your first sentence, which you can edit) and **Share the photo**. Both are off unless you turn them on for that entry. Turning them off later hides them from friends right away and deletes the photo from the server.
  - Under **You** in the Friends tab, **Show friends my day number**. It's off by default because, with the date, it tells friends your birthday. Turning it off removes it from everything you've shared.
- **Your entries never leave the Mac.** Only those few things do.
- The Today tab shows which friends have written today. Click it to open Friends.
- **Leave Friends** (at the bottom of the tab) deletes your code, your friends list and everything you shared. Entries on this Mac stay.

If you write offline, what friends would see waits and is sent when you're back online.

Leave Friends needs a working sign-in, because that's what proves the shares are yours. If a Mac is ever signed out (for example, its sign-in was deleted in Supabase), what it shared stays visible to the friends it had. To remove it, the person running Supabase deletes that user under **Authentication → Users**, which deletes their profile, friendships and posts along with it.

## Setting up Friends (once, by whoever builds the app)

Friends runs on a free [Supabase](https://supabase.com) project that everyone in the group shares.

1. Create a project at supabase.com. The free plan is enough.
2. **SQL Editor → New query**: paste all of `supabase/setup.sql` and press **Run**. It's safe to run again later.
3. **Authentication → Sign In / Providers**: turn on **Allow anonymous sign-ins**. People join with just a name and a friend code, with no email or password.
4. **Project Settings → API**: copy the **Project URL** and the **anon public** key into `source/share-config.json`:
   ```json
   { "url": "https://abcdefgh.supabase.co", "anonKey": "eyJ…" }
   ```
   The anon key is meant to be public. What protects the data are the rules in `setup.sql`: only accepted friends can read your posts and photos, and only you can write yours.
5. Run the installer, then give friends the DayByDay folder (with that file filled in) so they can install it too.

Supabase pauses a free project after a week with no use. If that happens, restore it from the dashboard.

To test, run `dev/test.sh` (in VS Code: **Terminal → Run Task → Test Day by Day**). It tests the Friends client against a fake Supabase and checks that every file parses, using only tools built into macOS. If Postgres is installed (`brew install postgresql@16`), it also tests `setup.sql`'s privacy rules without Supabase.

## Words

The **Words** tab shows the words you wrote most in a week, month, birthday year or all time. Words are sized by how many days you mentioned them, and the most-used ones sit in the middle.

- **Left out:** little words (I, the, and, really, went…) and time units like "hours". Words that carry meaning, like slept, gym and names, always stay.
- **Merged:** forms of the same word count as one: slept/sleeping, studied/studying, class/classes. A two-word phrase you nearly always use together, like "dining hall", counts as one.
- **Classes:** a word followed by a course number counts as one term. A class is found when it's written in capitals (ESF 30) or appears on two or more days (psych 30). Measurements like "ran 5 miles" or "slept 8 hours" are skipped.
- **A class's name on its own** ("psych" for PSYCH 30): the app asks once whether to count it as the class or keep it separate.
- **Click any word** to see the days it came from, with the word highlighted. From there you can hide the word or count it as a class.
- **Settings → Words** lets you manage classes, words counted together, and hidden words.
- Days with only a photo have no words to count, so they don't appear here.

## Where your data lives

Everything is in `~/Library/Application Support/Day by Day/`:

- `daybyday-data.json`: your entries and settings. Before the first save each day, the app copies it to `backups/` (one copy per day).
- `photos/`: photos of paper journals.
- `sharing.json`: your Friends sign-in and anything waiting to send. It's readable only by your account.
- `friend-photos/`: photos friends shared with you, cached so they don't download again.

**Settings → Show data file in Finder** opens that folder.

## Files

- `source/index.html` has the whole interface (views, styles and logic).
- `source/main.js` opens the window, saves the data file, imports photos and switches to full screen for the new-day prompt.
- `source/share.js` is the Friends client (Supabase sign-in, friends, sharing, offline outbox). It runs in the main process, so the page never talks to the network.
- `source/share-config.json` says which Supabase project Friends uses. It's empty until someone sets it up.
- `supabase/setup.sql` creates Friends' tables and privacy rules. `supabase/test/` tests them.
- `source/icon.icns` is the app icon.
- `dev/run.sh` runs the app straight from `source/` without installing, with separate practice data, so your real entries aren't touched. In VS Code, press **⇧⌘B** to run it, or **F5** to run it with the debugger on `main.js`. In the app, **⌥⌘I** opens DevTools for the page. Use the task **Run Day by Day as a new user** to start from empty practice data.
