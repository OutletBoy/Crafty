# Crafty Remote source

The page people use is a single file (`crafty-rN.html`) so that it opens anywhere: the website, a downloaded copy, or the phone's Files app. From r10 on, that file is built from the parts in this folder. Edit the parts and rebuild. Never edit a built page by hand.

Only Node is needed. There are no packages to install.

## What each part does

`page.html` is the outline. A line that reads exactly `@include <file>` is replaced by that file. `@include js/*.js` takes every `.js` file in `js/`, in name order.

- `styles.css`: all the look, including the landscape and small-screen rules.
- `body.html`: all the markup: the ring, buttons, sheets and Settings.
- `js/`: one script, cut into parts. They share one scope, so a part can use anything an earlier part declared. Order matters for anything that runs straight away.
  - `00-version.js`: `"use strict"` and `VERSION`. It must stay first.
  - `01-protocol.js`: the Crafty's Bluetooth addresses and value formats.
  - `02-saved-data.js`: the `store` wrapper around localStorage (read-only, full and damaged cases).
  - `03-state.js`: the live state object `S`.
  - `04-bluetooth.js`: reading, writing and subscribing to values.
  - `05-recorder.js`: the raw data recorder (`REC`) and `rec()`, which feeds it.
  - `06-units-and-dom.js`: °C/°F, and helpers like `$`, `put` and `render`.
  - `07-ring-and-draw.js`: ring drawing, `draw()` (the one place the screen is updated), toasts and buzz.
  - `08-writes.js`: debounced writes, so dragging doesn't flood Bluetooth.
  - `09-connection.js`: connect, disconnect, reconnect and reading the device's values.
  - `10-estimates.js`: the battery estimate and what it learns, and the saved session and climb clock.
  - `12-session-and-climb.js`: sessions (heater on to off), the climb clock (minutes at temperature, carried over a quick reheat), and the once-a-few-seconds read loop.
  - `12a-keep-heating.js`: Keep heating (r19). Restarts the Crafty's auto-off countdown while the page is open, connected and heating, with a 30-minute cap. It only re-sends the target temperature (same value, or one degree down and back); it never writes the auto-off time itself.
  - `13-history.js`: session history kept on the phone.
  - `14-terpenes.js`, `15-profiles.js`, `16-lighting.js`: those features and their sheets.
  - `17-ring-controls.js`: drag the ring, and hold − or + to repeat.
  - `18-sheets-and-settings.js`: how sheets open and close (with the phone's Back button), and the Settings sheet.
  - `19-recorder-controls.js`: recording on and off (Settings > Diagnostics), the diagnostics poll, and sharing the recording as a CSV.
  - `19a-strain-data.js`: the built-in strain list (r17). Made by `tools/make-strain-data.js`; don't edit it by hand.
  - `20-strains.js`: strains and batches, filling a strain in from the built-in list, and adding a list from a link or pasted text.
  - `21-photos.js`: bud photos, kept in IndexedDB on the phone.
  - `23-wiring-and-start.js`: button wiring, then start-up. It must stay last.

To add a part, give it a number between its neighbours, like `12a-something.js` or a renumbered set. Number 22 is free. A new file in `js/` is picked up without touching `page.html`.

## The built-in strain list

`js/19a-strain-data.js` holds about 4,000 strains with their effects, flavors and terpenes, so a strain fills in with nothing sent anywhere. It's made from two open datasets, which aren't kept here (14 MB):

- Cannabis Intelligence Database by Shannon Goddard, https://github.com/Shannon-Goddard/ci-strains-pro (`raw-data.csv`), licensed under CC BY 4.0.
- Kushy Cannabis Dataset, https://github.com/kushyapp/cannabis-dataset (`Dataset/Strains/strains-kushy_api.2017-11-14.csv`), MIT License, (c) Kushy.

To remake it, download both CSVs and run `node src/tools/make-strain-data.js <raw-data.csv> <kushy csv>`. The tool cuts free text down to fixed word lists, merges listings of the same strain, and leaves out side effects. Both credits must stay in the page (Settings > Help) and in the site README. Never add personal strains to the list: the repository is public.

## Build

```
node src/build.js
```

This writes `crafty-rN.html` next to `src/`, where N comes from `VERSION` in `js/00-version.js`.

- `node src/build.js --check` changes nothing. It fails if the built page doesn't match the source.
- A build that's already listed in `site/index.html` won't be replaced, because it may already be on the site. Bump `VERSION` for a new build. Use `--force` only when that build hasn't been uploaded yet.

The build stops with a clear message if a part is missing, if a part contains `</script>` or `</style>` (which would cut the page short), or if `VERSION` has no build number.

## Test

```
node tests/run-all.js crafty-rN.html
```

This runs every test against that build, comparing with the build before it where a test needs one. Everything must pass.

`tests/build.test.js` checks that the page is exactly a fresh build of `src/`, that every part is used once, and that the page still loads nothing from other files.

Real recordings live in `tests/data/`. Pull counting was removed in r13, so no test replays them any more; they're kept as a record. Keep `tests/` off the public site, because the recordings are the user's own sessions.

There's no real browser here. Layout tests work from the CSS, and the real check is a phone running Chrome on Android.

## Release

1. Make the change in `src/`, and bump `VERSION` in `js/00-version.js` (for example `"2026-11-26 r11"`).
2. Run `node src/build.js`.
3. Run `node tests/run-all.js crafty-rN.html`. Everything must pass. Then run it again with `--release` so the next build is checked against this one.
4. Copy the build into `site/`, and add it at the top of the list in `site/index.html`, marked latest. Keep the old builds.
5. Ask the user before anything is pushed. One yes covers one upload. The site lives at https://outletboy.github.io/Crafty/ (capital C) and republishes about a minute after a push.

## Later ideas

- Offline use and a home-screen app (a service worker and a manifest). These were left out of r10 on purpose, so the split changed nothing people would notice.
