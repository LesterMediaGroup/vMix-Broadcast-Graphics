# Changelog

## 1.0.0

First stable starting point: the dashboard and every feed below are ready for
real use, and later versions build on this one. Still open:

- No full rehearsal in vMix yet. Every tab and feed passes the automated tests
  (`npm test`), but layouts and layer bindings haven't been checked in vMix
  end to end.
- The Impact Players headshot folder layout
  (`<folder>\<Team name>\<Sport>\<Number>.png`) hasn't been confirmed
  against the real files.
- Logos and headshots are file paths, so they only show on vMix computers
  where Dropbox is at the same path (see README → Connecting vMix).

Changes since 0.8.0:

- **Safer saves.** Data files are written to a temp file and swapped in, so a
  crash mid-save can't leave a half-written file, and the previous version is
  kept as `<name>.bak`. A damaged file is reported by name and never treated
  as empty or overwritten. A damaged `teams.json` / `conferences.json` /
  `settings.json` stops startup; a damaged graphic file fails only that
  graphic. The PrestoSports auto-update skips a damaged file instead of
  crashing the server.
- **Top 25 saves itself** like the other tabs. The Save button is gone,
  and **Set live** switches the feed immediately.
- **Restarts by itself** when the app's code changes (`npm start` uses
  `node --watch`). There's a new Mac starter, **`start.command`**, which also
  prints the address other computers use for vMix.
- **Tests** live in `test/` and run with `npm test`. Each file gets its own
  server and a scratch copy of the data. New tests cover Top 25, data safety,
  and the Game setup feed (broadcast start countdown, crew, officials).
- `PORT` and `DATA_DIR` environment variables override the port and data
  folder.
- README rewritten: starting it on Windows or Mac, connecting vMix on one or
  two computers, a reference for every graphic, known issues in the title
  files, and backups.

## 0.8.0

- **Team Stats** tab and feed for vMix title `SSN_9120_v1`:
  `/out/graphics/SSN_9120_v1.json`, one row. It's a full-screen home vs. away
  comparison.
  - Both teams' names, mascots, logos, and colors come from Game setup.
    Scores and 5 stat rows (label, home value, away value) are typed in the
    tab, laid out like the graphic, with home on the left.
  - Stat labels are suggested per sport and sent uppercase. Header and
    subheader (`HALFTIME`, `FINAL`, ...) are editable. Center logo can be
    home, away, a conference, or none.
  - The title's middle labels are numbered bottom-up (`STAT9` is the top
    row), so the README lists which `labelN` binds to which layer.

## 0.7.0

- **Keys to the Game** tab and feed for vMix title `SSN_5006_v01`:
  `/out/graphics/SSN_5006_v01.json`, one row.
  - 3 keys, each a headline (`Topic N`) and a stat line under it (`Stat N`).
    They're written separately for the away and home team, and **Use these
    keys** picks which set goes to vMix.
  - Both teams' logos, mascots, and colors come from Game setup (`VLogo` /
    `VMascot` / `VNameBox`, `HLogo` / `HMascot` / `HNameBox`), plus
    `keysTeam…` fields for the team the keys are about.
  - Header defaults to `KEYS TO THE GAME`, and SubHeader to the keys team's
    name.
- Auto-saving tabs (Game setup, Impact Players, Keys) share one save helper.

## 0.6.0

- **Impact Players** tab and feed for vMix title `SSN_9048_v3`:
  `/out/graphics/SSN_9048_v3.json`, with 4 rows (row N = player N, layers
  `PN_*`).
  - Per player: team (any team, searched by name), position abbv, number,
    first and last name, and which team color goes to `PN_BKG`. Logo and
    colors come from Teams.
  - Headshots are built from **Settings → Headshots folder** as
    `<folder>\<Team name>\<Sport>\<Number>.png`, with the file type
    adjustable. A per-player override path is available. Sport defaults to
    Game setup's.
  - Editable title text, show/hide, move, and clear per player. Edits save
    themselves.

## 0.5.0

- **Game setup** tab and feed: `/out/game.json`, one row for the current
  game. This is Phase 2 on the roadmap.
  - Game fields: sport, date, time, venue, and location.
  - Away and home sides: team (searched by name, stored as abbv), rank,
    record, and conference record. You can also pick which team color and
    logo the graphics use.
  - The feed gives each side's name, uppercase name, mascot, chosen color and
    logo, and all of the team's colors and logos (`awayName`, `homeColor`, and
    so on). Team fields are looked up from Teams when the feed is read.
  - Broadcast start time: typed as `6:45 PM`, sent as `broadcastStart` in the
    form the vMix countdown reads, `{0:2026-11-14 6:45 PM|HH:mm:ss}` (with
    the game date when set, so the countdown targets the right day), plus
    `broadcastStartDisplay` (`6:45 PM`) and `broadcastStartClock`
    (`18:45:00`).
  - Also: event title, series record, last meeting, attendance, a
    conference-game flag, a `matchup` line.
  - Coach per side: title (Head Coach, Interim Head Coach, Assistant Coach,
    Graduate Assistant), name, overall and conference coaching records, and
    season number. The feed also has `CoachSeasonLabel` ("5th Season").
  - **Broadcast crew** and **officials** (up to 7), each a role and a name.
    Crew roles are a fixed dropdown of 25 production and on-air roles, with
    **+ All roles** to add a row for each. The feed has numbered slots
    (`crew1Name`, `official1Role`, and so on), `crewLine` / `officialLine`
    with everyone on one line, and a field per crew role (`crewPlayByPlay`,
    `crewCamera3`, ...).
  - **New game** clears everything except the sport and the broadcast crew.
  - **Swap sides** and a per-side **Clear**. Edits save themselves. Stored in
    `data/game.json`.

## 0.4.0

- **Conference Scores** tab and feed for vMix title `SSN_5018_v3`:
  `/out/graphics/SSN_5018_v3.json`, with 6 rows (row N = game N).
  - Presets per sport with **Set live**, and a Name field dropdown, same as
    Top 25.
  - Per preset: the graphic's sport text, heading text, and which conference
    supplies `primaryColor` / `secondaryColor`.
  - Per game: away (T1) and home (T2) picked by team name, scores, period,
    time, and a show checkbox. There are also move, swap-sides, and clear
    buttons.
  - Each game's **Source** is Manual or Relay. Relay games get score, period,
    and time from `POST /api/graphics/SSN_5018_v3/relay`. The tab picks up
    relay updates every 3 seconds, and saving the tab never overwrites them.
- **Send to vMix: Automatic / Manual** on Conference Scores. Edits save
  themselves, so the Save button is gone. In Automatic, every change goes to
  the feed right away, including relay and Presto updates. In Manual, the feed
  keeps the last version you sent until you press **Send to vMix**, and the
  tab shows when vMix is behind. It's stored as `sendMode` in the data file.
  `/api/graphics/SSN_5018_v3/send` does the send.
- **PrestoSports auto-update** (per preset): a scoreboard URL, how often to
  check it, and an auto-update switch. Check now and Import games are there
  too. The server fetches the page with Windows' `curl.exe`, because the
  site's Cloudflare blocks Node's own requests.
- Preset handling is now shared between graphics in `server.js`.

## 0.3.0

Top 25 (`SSN_9225_v5`) additions:

- **Presets per sport.** Each preset is saved separately. **Set live** picks
  which one `/out/graphics/SSN_9225_v5.json` serves, so the vMix URL stays the
  same. A 0.2.0 single ranking becomes the first preset automatically.
- **Show/hide per team**, a show-all toggle, and a **Teams shown → Top N**
  quick-set. Hidden rows go out blank. There's a new `visible` field in the feed.
- **Logo color picker** per ranked team (primary / secondary / accent) that
  feeds `logoColor`.
- **Name field** dropdown for the whole graphic: team name, UPPERCASE name, or
  abbv, sent as `name`. It's saved as `nameFormat` in the data file, and every
  feed row repeats it.
- **Team search by name.** The Team box autocompletes team names (abbv shown
  as the hint) and stores the abbv behind the scenes. A name typed before the
  team exists in Teams resolves automatically once the team is added.
- Feed change: `nameUppercase` was removed, since `name` now follows the
  dropdown.

## 0.2.0

- **Settings** (masthead button): `basePath`, default
  `C:\Users\vMix\Dropbox`. Logo paths without a drive letter
  are resolved against it in every `/out` feed; absolute paths pass through
  unchanged. Stored in `data/settings.json`, which is gitignored because it's
  per-machine.
- `/out/teams.json` and `/out/conferences.json` now return resolved logo
  paths (`/api/*` still returns what's stored).
- **Top 25** tab and feed for vMix title `SSN_9225_v5`:
  `/out/graphics/SSN_9225_v5.json`. The tab has 25 ranked slots (team abbv,
  W-L, conf. record), move up/down, and warnings for teams that aren't in
  the Teams table or are ranked twice. Stored in
  `data/graphics/SSN_9225_v5.json`.
- Graphics registry in `server.js`: each graphic is keyed by its exact
  vMix/GT Designer title name, served at `/out/graphics/<title>.json`.

## 0.1.0

- Initial release: Teams and Conferences reference database, with full
  CRUD (add/edit/delete) through a dashboard at `http://localhost:4174`.
- Sample seed data: 16 fictional teams in a fictional conference (`PVAC`).
- `/out/teams.json` and `/out/conferences.json` feeds, same shape as the
  dashboard, ready for future graphic feeds (or vMix directly) to read.
- This is Phase 1 of 4 — see the Roadmap section in `README.md` for
  what's next (game setup, rosters, then the individual graphic feeds).
