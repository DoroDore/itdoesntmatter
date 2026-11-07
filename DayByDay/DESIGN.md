# Design notes: Theo's app family

Day by Day is the first app in a small set of personal Mac apps. Read this before building a sibling app so it looks and behaves like part of the same family.

**The family so far:** Day by Day ("29", counts days, in the DayByDay folder), Point by Point (".00", spending log, in the PointByPoint folder) and Word by Word ("/", poems with every version kept, in the WordByWord folder). Names follow the "X by X" pattern with a one-syllable word.

## Stack

- **Electron 33.4.11** with no npm dependencies at runtime. The whole interface is one `index.html` with inline CSS and JS. `main.js` handles the window, the data file, the menu bar and notifications. `preload.js` exposes a small `window.dbd` API via `contextBridge`.
- **Build:** `Install Day by Day.command` uses only built-in macOS tools. It downloads Electron's darwin zip with `curl`, unpacks it with `ditto`, copies the app files into `Contents/Resources/app`, edits `Info.plist` with `PlistBuddy`, ad-hoc signs it with `codesign --sign -`, and copies it to /Applications. It needs no Node, because the packager tool failed on Node 26. It logs to `install-log.txt`. Keep the `.command` file executable (`chmod +x`). Every app uses the same Electron version and one shared download in `~/Library/Caches/Theo Apps/Electron/`, so only the first install downloads it.
- **Data:** one JSON file in `~/Library/Application Support/<App Name>/`, written atomically. Before the first save of each day, the previous file is copied to a dated file in `backups/`, so a bad save can't overwrite the only good copy. There's a "Show data file in Finder" button and Markdown and JSON export.
- **Credits:** the About panel reads "Developed by Theo", © Theo. Bundle IDs are `com.theo.<appname>`.

## Look

- **Day by Day's palette (blue paper, brown ink, since 1.8):** Day by Day moved off the family greens to match a hand-lettered print: light blue paper, dark brown ink, and a cream label with a rust-red stamp. All colors are tokens on `:root`, redefined under `prefers-color-scheme: dark`, where it turns over to brown paper with blue ink. Every text color passes WCAG AA on the surfaces it sits on.
  - Light: `--bg #A7B8D3`, `--surface #BFCCE0`, `--ink #2A1A15`, `--muted #54433E`, `--line #8E98AE`, `--accent #4A2D24` (text on it `#D6DFEC`), `--wash #AEBDD6`, `--stamp #7A3329`, `--cream #E6E0CF`, `--danger #80271D`
  - Dark: `--bg #1E1411`, `--surface #291C17`, `--ink #CDD8EA`, `--muted #97A3B8`, `--line #4E3B32`, `--accent #A9BAD5`, `--wash #35251F`, `--stamp #DE9F8F`, `--cream #3B2620`, `--danger #E8907F`
  - The curtain and the menu bar card use their own `--c-*` tokens: a full sheet of the paper in light mode, brown in dark mode. The page and the curtain carry a faint paper grain (`--grain`, an SVG noise tile).
  - The stamp and the cream label take gold's place: they mark only special things (core memories, milestones, opened capsules). `--danger` is for warnings.
- **Family palette (calm greens, still used by Point by Point and Word by Word):**
  - Light: `--bg #EEF3EF`, `--surface #FFFFFF`, `--ink #13241B`, `--muted #5B6F64`, `--line #D3DFD7`, `--accent #2C7A57`, `--wash #E1EEE5`, `--gold #9A7008`, `--gold-soft #F4ECD4`
  - Dark: `--bg #0D1612`, `--surface #14211B`, `--ink #E2EDE6`, `--muted #8EA597`, `--line #243A2F`, `--accent #6CC99A`, `--wash #1A2D23`, `--gold #E0BB55`, `--gold-soft #2A2615`
  - Signature "forest" surfaces, the same in both themes: `--forest #16392B`, `--forest-deep #0D241A`, `--mint #E4F2E8`, `--mint-dim #8DB59D`. They're used for full-screen moments and the menu bar card.
  - Gold is used only for things that are special: core memories, milestones, ready time capsules, and (in Point by Point) a month where you spent less than the last one, and (in Word by Word) a poem's anniversary. Never for warnings.
- **Type:** fonts are bundled locally as woff2 in `fonts/` (from @fontsource), never loaded from the web.
  - Bricolage Grotesque (wght, 800 for big numbers) is the family's display face.
  - **Day by Day uses one face, Fraunces** (variable: `wght` 100–900, `opsz`, `SOFT`, `WONK`; the "full" files from @fontsource-variable, Latin and Latin Extended). Weight carries the meaning:
    - writing is light (`--write`, 340), the interface is regular, labels are 650 in spaced capitals, and numbers and headings are 700–850;
    - display type is soft and a little wonky (`--soft`: `"SOFT" 100, "WONK" 1`), after the hand-lettered posters it's modeled on;
    - weight is also data: written days are bold on the calendar and empty days light, the word cloud runs 250–900 by how often a word comes up, and the new-day number is thin (200) until you press the button, then fills in to 850;
    - optical size follows the font size on its own; numbers use `lining-nums`.
  - The new-day curtain has a printed-card frame (a double rule inset 22px).
  - Newsreader (italic for prompts like "Today I…") is the family's writing face.
  - JetBrains Mono is for small numeric labels.
  - The system font is used for UI.
- **Layout:** one centered column (max 680px) under a draggable hidden-inset title strip, with pill tabs at the top right. Cards ("paper") are white surfaces with 1px `--line` borders and 16–22px radius. Uppercase 11px letter-spaced labels. Chips for tags and choices, with `aria-pressed`. Tabular numbers everywhere digits line up.
- **Motion:** sparing. Numbers count up with an ease-out. Popovers and reveals open from the center outward (`clip-path: inset(0 50% 0 50%)` to full). Everything respects `prefers-reduced-motion`.
- **Copy:** short, plain and warm. Buttons say exactly what happens.

## Patterns worth reusing

- **Menu bar:** a template icon (black plus alpha, `trayTemplate.png` and `@2x`). Left-click opens a small card (forest green in the family; blue paper in Day by Day), a `type: "panel"` BrowserWindow so it doesn't pull you out of full-screen apps. Right-click shows Open and Quit. Closing the window hides the app to the menu bar and optionally hides the Dock icon.
- **App icon:** a rounded-square forest gradient (#2E7050 to #14402E) with one bold mint mark in Bricolage 800. Day by Day uses "29", Point by Point uses ".00", Word by Word uses "/" (drawn slightly heavier so it matches the digits' weight). A sibling app should use its own single mark in the same treatment.
- **Settings:** grouped paper cards. Toggles save immediately; for related fields there's one explicit "Save" button.
- **Photos:** import through `sips` (built into macOS, so HEIC works), then redraw on a canvas in the page. That makes the photo upright, at most 2000px, and free of metadata (no location). Store it next to the data file in `photos/`, referenced by file name.
- **Sharing (Day by Day's Friends):**
  - Local-first: only a small, explicit set of things leaves the Mac, and each optional piece is off by default for every item.
  - The network lives in a main-process module (`share.js`) that talks to Supabase over plain `fetch`, so the page's CSP stays `'self'` and there are no npm dependencies.
  - Sign-in is anonymous and people connect with friend codes. Privacy is enforced by row-level security in `supabase/setup.sql`, never by the client.
  - Writes queue in an outbox and send when there's a connection.
