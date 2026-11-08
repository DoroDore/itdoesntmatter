# Design notes: Theo's app family

Day by Day is the first app in a small set of personal Mac apps. Read this before building a sibling app so it looks and behaves like part of the same family.

**The family so far:** Day by Day ("29", counts days, in the DayByDay folder), Point by Point (".00", spending log, in the PointByPoint folder) and Word by Word ("/", poems with every version kept, in the WordByWord folder). Names follow the "X by X" pattern with a one-syllable word.

## Stack

- **Electron 33.4.11** with no npm dependencies at runtime. The whole interface is one `index.html` with inline CSS and JS. `main.js` handles the window, the data file, the menu bar and notifications. `preload.js` exposes a small `window.dbd` API via `contextBridge`.
- **Build:** `Install Day by Day.command` uses only built-in macOS tools. It downloads Electron's darwin zip with `curl`, unpacks it with `ditto`, copies the app files into `Contents/Resources/app`, edits `Info.plist` with `PlistBuddy`, ad-hoc signs it with `codesign --sign -`, and copies it to /Applications. It needs no Node, because the packager tool failed on Node 26. It logs to `install-log.txt`. Keep the `.command` file executable (`chmod +x`). Every app uses the same Electron version and one shared download in `~/Library/Caches/Theo Apps/Electron/`, so only the first install downloads it.
- **Data:** one JSON file in `~/Library/Application Support/<App Name>/`, written atomically. Before the first save of each day, the previous file is copied to a dated file in `backups/`, so a bad save can't overwrite the only good copy. There's a "Show data file in Finder" button and Markdown and JSON export.
- **Credits:** the About panel reads "Developed by Theo", © Theo. Bundle IDs are `com.theo.<appname>`.

## Look

- **Day by Day's look (a paper journal on a pale blue desk, since 1.8):** Day by Day moved off the family greens to match hand-lettered posters and prints: pale blue paper, dark brown ink, crimson for special things, and a cream label like a pasted-on tag. All colors are tokens on `:root`, redefined under `prefers-color-scheme: dark`, where it turns over to brown paper with pale blue ink. Every text color passes WCAG AA (4.5:1) on the surfaces it sits on, including the sheet, folder and envelope.
  - Light: `--bg #DFE8F3`, `--surface #E9EFF7`, `--ink #2A1A15`, `--muted #584640`, `--line #A5AFBD` (rules), `--hair #C4CFDD` (fine rules), `--accent #3A241D` (text on it `#E3EBF4`), `--wash #D0DCEA`, `--stamp #93302A` (crimson), `--cream #EEE8D8`, `--danger #8C2820`
  - Dark: `--bg #1C1310`, `--surface #251915`, `--ink #D3DEEC`, `--muted #9EAABD`, `--line #5C483E`, `--hair #3B2C26`, `--accent #C2D0E4`, `--wash #30221D`, `--stamp #E59C90`, `--cream #3A2620`, `--danger #EC9484`
  - Paper goods (light / dark): `--sheet #FCFBF7 / #2A1E19` with `--rule #C5D5E8 / #3A4452` and a crimson `--margin`, `--binding #3A241D / #0E0907`, `--folder #E4D8BC / #3A2B22` with `--folder-front #EADFC6 / #43332A`, `--env #F3EDE0 / #33251F` with `--env-flap #E7DDC8 / #3D2D26`.
  - The curtain and the menu bar card use their own `--c-*` tokens. The page and the curtain carry a faint paper grain (`--grain`, an SVG noise tile).
  - Crimson and the cream label take gold's place: they mark only special things (core memories, "Today I…", top words, year titles, opened capsules, stamps and postmarks). `--danger` is for warnings.
  - **No cards.** The app's own pages sit on the desk, divided by fine rules (`--line`, `--hair`), with square corners (2px at most). Inputs are underlines, buttons are thin boxes, the primary button is solid ink in spaced capitals, and chosen chips are solid ink. Photos and opened capsules sit on the page like pasted-in paper, with a small shadow.
  - **The journal is real paper.** The day's entry is a sheet on a pad: a glued binding on top, a dotted perforation, blue rules, a crimson margin, and a few sheets' edges underneath. **Tear off and file** tears it along a ragged edge (seeded by the date, so a page always tears the same way), lifts it and drops it into a manila folder whose tab is the date; **Take it out** pulls it back onto the pad. The Calendar reads past days out of the same folders. Motion uses the Web Animations API and is skipped under reduced motion.
  - **The envelope** holds what friends get from a page. Open, the chosen line sticks out of it on a slip of the sheet; filing slides the slip in, folds the flap over and sends it off. A filed page shows its sealed envelope with a stamp (the "29" mark) and a postmark. What friends sent you appears as slips from their pages.
  - **Masthead:** the title is centered in thin type, with the cream "29" label pasted over its edge and tilted slightly. Tabs underneath are spaced capitals, the chosen one underlined.
  - **Ornament:** a double rule around the new-day curtain and the menu bar card. Nothing is set in italic, and there's no flourish.
- **Family palette (calm greens, still used by Point by Point and Word by Word):**
  - Light: `--bg #EEF3EF`, `--surface #FFFFFF`, `--ink #13241B`, `--muted #5B6F64`, `--line #D3DFD7`, `--accent #2C7A57`, `--wash #E1EEE5`, `--gold #9A7008`, `--gold-soft #F4ECD4`
  - Dark: `--bg #0D1612`, `--surface #14211B`, `--ink #E2EDE6`, `--muted #8EA597`, `--line #243A2F`, `--accent #6CC99A`, `--wash #1A2D23`, `--gold #E0BB55`, `--gold-soft #2A2615`
  - Signature "forest" surfaces, the same in both themes: `--forest #16392B`, `--forest-deep #0D241A`, `--mint #E4F2E8`, `--mint-dim #8DB59D`. They're used for full-screen moments and the menu bar card.
  - Gold is used only for things that are special: core memories, milestones, ready time capsules, and (in Point by Point) a month where you spent less than the last one, and (in Word by Word) a poem's anniversary. Never for warnings.
- **Type:** fonts are bundled locally as woff2 in `fonts/` (from @fontsource), never loaded from the web.
  - Bricolage Grotesque (wght, 800 for big numbers) is the family's display face.
  - **Day by Day uses one face, Fraunces** (variable: `wght` 100–900, `opsz`, `SOFT`, `WONK`; the "full" files from @fontsource-variable, Latin and Latin Extended). Weight varies on purpose, like the posters it's modeled on:
    - big numbers and titles are thin and upright (200–450, `--swash`: `"SOFT" 0, "WONK" 0`, so h, m and n stand straight), writing is light (`--write`, 340), and credits are bold spaced capitals (600–650) or solid stat numbers (650). Only the upright files are bundled, and `font-synthesis: none` keeps the browser from faking an italic;
    - weight is also data: written days are bold on the calendar and empty days light, the word cloud runs 250–800 by how often a word comes up, and the new-day number is a hairline (200) until you press the button, then fills in to 500;
    - optical size follows the font size on its own; numbers use `lining-nums`.
  - Newsreader (italic for prompts like "Today I…") is the family's writing face.
  - JetBrains Mono is for small numeric labels.
  - The system font is used for UI.
- **Layout (the family's):** one centered column (max 680px) under a draggable hidden-inset title strip, with pill tabs at the top right. Cards ("paper") are white surfaces with 1px `--line` borders and 16–22px radius. Uppercase 11px letter-spaced labels. Chips for tags and choices, with `aria-pressed`. Tabular numbers everywhere digits line up.
- **Motion:** sparing. Numbers count up with an ease-out. Popovers and reveals open from the center outward (`clip-path: inset(0 50% 0 50%)` to full). Everything respects `prefers-reduced-motion`.
- **Copy:** short, plain and warm. Buttons say exactly what happens.

## Patterns worth reusing

- **Menu bar:** a template icon (black plus alpha, `trayTemplate.png` and `@2x`). Left-click opens a small card (forest green in the family; a framed card of the pale blue paper in Day by Day), a `type: "panel"` BrowserWindow so it doesn't pull you out of full-screen apps. Right-click shows Open and Quit. Closing the window hides the app to the menu bar and optionally hides the Dock icon.
- **App icon:** a rounded-square forest gradient (#2E7050 to #14402E) with one bold mint mark in Bricolage 800. Day by Day uses "29", Point by Point uses ".00", Word by Word uses "/" (drawn slightly heavier so it matches the digits' weight). A sibling app should use its own single mark in the same treatment.
- **Settings:** grouped paper cards. Toggles save immediately; for related fields there's one explicit "Save" button.
- **Photos:** import through `sips` (built into macOS, so HEIC works), then redraw on a canvas in the page. That makes the photo upright, at most 2000px, and free of metadata (no location). Store it next to the data file in `photos/`, referenced by file name.
- **Sharing (Day by Day's Friends):**
  - Local-first: only a small, explicit set of things leaves the Mac, and each optional piece is off by default for every item.
  - The network lives in a main-process module (`share.js`) that talks to Supabase over plain `fetch`, so the page's CSP stays `'self'` and there are no npm dependencies.
  - Sign-in is anonymous and people connect with friend codes. Privacy is enforced by row-level security in `supabase/setup.sql`, never by the client.
  - Writes queue in an outbox and send when there's a connection.
