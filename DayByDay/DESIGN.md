# Design notes: Theo's app family

Day by Day is the first app in a small set of personal Mac apps. Read this before building a sibling app so it looks and behaves like part of the same family.

**The family so far:** Day by Day ("29", counts days, in the DayByDay folder), Point by Point (".00", spending log, in the PointByPoint folder) and Word by Word ("/", poems with every version kept, in the WordByWord folder). Names follow the "X by X" pattern with a one-syllable word.

## Stack

- **Electron 33.4.11** with no npm dependencies at runtime. The whole interface is one `index.html` with inline CSS and JS. `main.js` handles the window, the data file, the menu bar and notifications. `preload.js` exposes a small `window.dbd` API via `contextBridge`.
- **Build:** `Install Day by Day.command` uses only built-in macOS tools. It downloads Electron's darwin zip with `curl`, unpacks it with `ditto`, copies the app files into `Contents/Resources/app`, edits `Info.plist` with `PlistBuddy`, ad-hoc signs it with `codesign --sign -`, and copies it to /Applications. It needs no Node, because the packager tool failed on Node 26. It logs to `install-log.txt`. Keep the `.command` file executable (`chmod +x`). Every app uses the same Electron version and one shared download in `~/Library/Caches/Theo Apps/Electron/`, so only the first install downloads it.
- **Data:** one JSON file in `~/Library/Application Support/<App Name>/`, written atomically. Before the first save of each day, the previous file is copied to a dated file in `backups/`, so a bad save can't overwrite the only good copy. There's a "Show data file in Finder" button and Markdown and JSON export.
- **Credits:** the About panel reads "Developed by Theo", © Theo. Bundle IDs are `com.theo.<appname>`.

## Look

- **Palette (calm greens):** all colors are CSS tokens on `:root`, redefined under `prefers-color-scheme: dark`.
  - Light: `--bg #EEF3EF`, `--surface #FFFFFF`, `--ink #13241B`, `--muted #5B6F64`, `--line #D3DFD7`, `--accent #2C7A57`, `--wash #E1EEE5`, `--gold #9A7008`, `--gold-soft #F4ECD4`
  - Dark: `--bg #0D1612`, `--surface #14211B`, `--ink #E2EDE6`, `--muted #8EA597`, `--line #243A2F`, `--accent #6CC99A`, `--wash #1A2D23`, `--gold #E0BB55`, `--gold-soft #2A2615`
  - Signature "forest" surfaces, the same in both themes: `--forest #16392B`, `--forest-deep #0D241A`, `--mint #E4F2E8`, `--mint-dim #8DB59D`. They're used for full-screen moments and the menu bar card.
  - Gold is used only for things that are special: core memories, milestones, ready time capsules, and (in Point by Point) a month where you spent less than the last one, and (in Word by Word) a poem's anniversary. Never for warnings.
- **Type:** fonts are bundled locally as woff2 in `fonts/` (from @fontsource), never loaded from the web.
  - Bricolage Grotesque (wght, 800 for big numbers) is the display face.
  - Newsreader (italic for prompts like "Today I…") is for writing.
  - JetBrains Mono is for small numeric labels.
  - The system font is used for UI.
- **Layout:** one centered column (max 680px) under a draggable hidden-inset title strip, with pill tabs at the top right. Cards ("paper") are white surfaces with 1px `--line` borders and 16–22px radius. Uppercase 11px letter-spaced labels. Chips for tags and choices, with `aria-pressed`. Tabular numbers everywhere digits line up.
- **Motion:** sparing. Numbers count up with an ease-out. Popovers and reveals open from the center outward (`clip-path: inset(0 50% 0 50%)` to full). Everything respects `prefers-reduced-motion`.
- **Copy:** short, plain and warm. Buttons say exactly what happens.

## Patterns worth reusing

- **Menu bar:** a template icon (black plus alpha, `trayTemplate.png` and `@2x`). Left-click opens a small forest-green card, a `type: "panel"` BrowserWindow so it doesn't pull you out of full-screen apps. Right-click shows Open and Quit. Closing the window hides the app to the menu bar and optionally hides the Dock icon.
- **App icon:** a rounded-square forest gradient (#2E7050 to #14402E) with one bold mint mark in Bricolage 800. Day by Day uses "29", Point by Point uses ".00", Word by Word uses "/" (drawn slightly heavier so it matches the digits' weight). A sibling app should use its own single mark in the same treatment.
- **Settings:** grouped paper cards. Toggles save immediately; for related fields there's one explicit "Save" button.
- **Photos:** import through `sips` (built into macOS, so HEIC works), then redraw on a canvas in the page. That makes the photo upright, at most 2000px, and free of metadata (no location). Store it next to the data file in `photos/`, referenced by file name.
- **Sharing (Day by Day's Friends):**
  - Local-first: only a small, explicit set of things leaves the Mac, and each optional piece is off by default for every item.
  - The network lives in a main-process module (`share.js`) that talks to Supabase over plain `fetch`, so the page's CSP stays `'self'` and there are no npm dependencies.
  - Sign-in is anonymous and people connect with friend codes. Privacy is enforced by row-level security in `supabase/setup.sql`, never by the client.
  - Writes queue in an outbox and send when there's a connection.
