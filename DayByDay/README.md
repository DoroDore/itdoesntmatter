# Day by Day

Counts the days since Dec 29. Every morning the whole screen asks you to press **It's a new day.** before you can do anything else. After that you write one "Today I…" sentence and can star days as core memories.

## Install

1. Double-click **Install Day by Day.command**.
   If macOS says it can't verify the developer, right-click the file → **Open** → **Open**.
2. Wait a minute or two while it builds. The first run downloads Electron (about 100 MB), which the app runs on. It uses only tools built into macOS, so you don't need Node.
3. The app opens and is saved in your Applications folder. To keep it in the Dock, right-click its Dock icon → Options → Keep in Dock.

Run the installer again whenever the code in `source/` changes. Your entries are never touched.

## Words

The **Words** tab shows the words you wrote most in a week, month, birthday year or all time. Words are sized by how many days you mentioned them, and the most-used ones sit in the middle.

- **Left out:** little words (I, the, and, really, went…) and time units like "hours". Words that carry meaning, like slept, gym and names, always stay.
- **Merged:** forms of the same word count as one: slept/sleeping, studied/studying, class/classes. A two-word phrase you nearly always use together, like "dining hall", counts as one.
- **Classes:** a word followed by a course number counts as one term. A class is found when it's written in capitals (ESF 30) or appears on two or more days (psych 30). Measurements like "ran 5 miles" or "slept 8 hours" are skipped.
- **A class's name on its own** ("psych" for PSYCH 30): the app asks once whether to count it as the class or keep it separate.
- **Click any word** to see the days it came from, with the word highlighted. From there you can hide the word or count it as a class.
- **Settings → Words** lets you manage classes, words counted together, and hidden words.

## Where your data lives

`~/Library/Application Support/Day by Day/daybyday-data.json`, with one backup per day in `backups/` next to it.
**Settings → Show data file in Finder** opens that folder.

## Files

- `source/index.html` has the whole interface (views, styles and logic).
- `source/main.js` opens the window, saves the data file, and switches to full screen for the new-day prompt.
- `source/icon.icns` is the app icon.
- To run without installing: open Terminal in `source/` and run `npm install`, then `npm start`.
