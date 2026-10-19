# Broadcast Graphics

A dashboard for college athletics broadcast graphics in vMix. It replaces a
broadcast graphics spreadsheet: teams, the current game, and each graphic's
content are edited in a browser and served as JSON feeds that vMix reads as
Data Sources.

The repo ships with **sample data**: a fictional conference (the Prairie Valley
Athletic Conference, `PVAC`) with 16 made-up schools. Replace it with your own
teams on the Teams tab, or by editing the files in `data/`.

**What's built:** Teams and Conferences, Game setup (`/out/game.json`, for
anything single-game), and five graphic feeds: Top 25, Conference Scores,
Impact Players, Keys to the Game, and Team Stats. See [Roadmap](#roadmap) for
what's next.

## Starting it

Needs [Node.js](https://nodejs.org) 18.11 or newer (the LTS version is fine).

- **Windows:** double-click **`start.bat`**.
- **Mac:** double-click **`start.command`**. If macOS says it can't be opened,
  right-click it → **Open** the first time.

The first run installs what it needs, then starts the dashboard at
**http://localhost:4174**. Keep the window open, because closing it stops the
feeds. The dashboard restarts itself when the app's code is updated, so there's
no need to restart it after an update.

## Connecting vMix

In vMix: **Settings → Data Sources → Add → JSON**, paste the feed URL, and turn
on **Auto Refresh** (every 1–2 seconds).

| Graphic | Feed path |
|---|---|
| Game setup | `/out/game.json` |
| Top 25 | `/out/graphics/SSN_9225_v5.json` |
| Conference Scores | `/out/graphics/SSN_5018_v3.json` |
| Impact Players | `/out/graphics/SSN_9048_v3.json` |
| Keys to the Game | `/out/graphics/SSN_5006_v01.json` |
| Team Stats | `/out/graphics/SSN_9120_v1.json` |
| Teams / Conferences | `/out/teams.json`, `/out/conferences.json` |

Put the dashboard computer's address in front of the path:

- **vMix on the same computer as the dashboard:** `http://localhost:4174/out/game.json`
- **vMix on another computer:** `http://<dashboard computer's IP>:4174/out/game.json`,
  for example `http://192.168.1.50:4174/out/game.json`. The Mac starter prints
  this address when it starts. On Windows, run `ipconfig` and use the
  **IPv4 Address**.

If another computer can't connect:

1. Open the feed URL in a browser on that computer first. If the browser can't
   load it, vMix can't either.
2. Both computers must be on the same network (same first three numbers of the
   IP, e.g. `192.168.1.x`).
3. The dashboard computer's firewall must allow Node.js. Windows asks the first
   time `start.bat` runs; allow it on **Private** networks.
4. Give the dashboard computer a fixed IP (a DHCP reservation on the router),
   or the address, and every vMix Data Source, breaks when it changes.

**Logos and headshots are file paths**, like
`C:\Users\vMix\Dropbox\Logos\Schools\Bayport\Bayport.png`. Each vMix computer opens
them from its own drive, so images only show on computers where Dropbox is at
that same path. Text, numbers, and colors work everywhere. The simplest setup is
to run the dashboard on the main vMix computer.

## How the dashboard works

- **Edits save themselves** on every tab. The status next to each tab's title
  shows *Saving…* then *Saved*. vMix picks up the change on its next refresh.
  Conference Scores also has a **Manual** send mode, where vMix only updates when
  you press **Send to vMix**.
- **Teams and Conferences** are the reference tables: abbreviation (the unique
  key), names, mascot, three colors, and two logo paths. Graphics look teams up
  by abbv when the feed is read, so editing a team updates every feed at once.
- **Team boxes search by name.** Type part of a school's name and pick it; the
  tab stores its abbv. A name that isn't in Teams is flagged, and the graphic's
  name, logo, and colors for it go out blank.
- **Game setup** is the current matchup. Keys to the Game and Team Stats take
  their teams from it, and `/out/game.json` serves it for anything else.

## Graphics reference

Each graphic's feed is named after its **exact** vMix / GT Designer title name.
When a title's design version is bumped (`_v6`), it gets a new feed, and the old
one keeps working for existing vMix bindings.

Feeds are arrays. One-row feeds bind row 1. Multi-row feeds put each slot in
its own row: bind row N to the layers numbered N.

### Game setup — `/out/game.json`

The current game, one row. On the tab: sport, date, game time, broadcast start,
venue, location, event title, series record, last meeting, attendance, and
conference game; then for each side, the team, rank, record, conference record,
which team color and logo to use, and the coach (title, name, overall and
conference records, season number). Below that, the broadcast crew and the
officials. **⇄ Swap sides** flips away and home. **New game** clears everything
except the sport and the broadcast crew.

Game fields:

- `sport`, `date`, `time` (game time, as typed), `venue`, `location`, `event`,
  `series`, `lastMeeting`, `attendance`, `conferenceGame` (true/false),
  `matchup` (`Brookfield at Bayport`)
- `broadcastStart`: when the stream goes on air, in the form vMix's
  countdown-to-time reads, `{0:6:45 PM|HH:mm:ss}`. The part after the `|` is
  the literal display format. Type the time like `6:45 PM`; the tab shows the
  exact value and warns if it can't read it. When the game date is set it's
  included (`{0:2026-11-14 6:45 PM|HH:mm:ss}`). Without a date vMix assumes
  today, so a start earlier than the current time of day shows 00:00:00.
- `broadcastStartDisplay` (`6:45 PM`) and `broadcastStartClock` (`18:45:00`)
  for plain text

Each side has the same fields, prefixed `away` or `home` (`awayName`,
`homeColor`, ...):

- `Abbv`, `Name`, `NameUppercase`, `Mascot`, `Rank`, `Record`, `ConfRecord`
- `Coach`, `CoachTitle` (Head Coach, Interim Head Coach, Assistant Coach, or
  Graduate Assistant; blank without a coach name), `CoachRecord`,
  `CoachConfRecord`, `CoachSeason` (`5`), `CoachSeasonLabel` (`5th Season`)
- `Color` and `Logo`: the color and logo picked on the tab
- `PrimaryColor`, `SecondaryColor`, `AccentColor`, `PrimaryLogo`, `SecondaryLogo`

Crew and officials:

- Numbered slots, with blank entries skipped: `crew1Name` / `crew1Role` through
  `crew25…`, and `official1Name` / `official1Role` through `official7…`
- `crewLine` / `officialLine`: everyone on one line
  (`Play by Play: A · Analyst: B`)
- One field per crew role, so a graphic can bind a role whatever slot it's in:
  `crewPlayByPlay`, `crewAnalyst`, `crewAnalystStats`, `crewDirector`,
  `crewCamera3`, and so on. Two people in one role come out as `A & B`. The 25
  roles are listed in `CREW_ROLES` in `server.js`; **+ All roles** adds a row
  for each.

### Top 25 — `SSN_9225_v5`

25 rows, row N = rank N, bound to the layers `TeamN*`. Each row has `rank`,
`visible`, `teamAbbv`, `name`, `logo`, `logoColor`, `column1` (W-L), `column2`
(CONF.), `sport`, `asOf`, and `nameFormat`.

- **Presets:** one saved ranking per sport. The feed always serves the preset
  marked live; **Set live** switches it immediately.
- **Teams shown:** a show checkbox per row, a show-all checkbox, and
  **Teams shown → Top N**. Hidden rows go out blank.
- **Logo color:** primary, secondary, or accent per team, sent as `logoColor`.
- **Name field** (all presets): `name` carries the team name, the UPPERCASE
  name, or the abbv.

### Conference Scores — `SSN_5018_v3`

6 rows, row N = game N, bound to the layers `GN*`. T1 is the top row (away)
and T2 the bottom (home). Each row has `game`, `visible`, `t1Abbv`, `t1Name`,
`t1Logo`, `t1Score`, `t2Abbv`, `t2Name`, `t2Logo`, `t2Score`, `period`, `time`,
and `source`, plus graphic-wide fields repeated on every row: `sport` (the
`Sport` layer), `heading` (the `Conference` layer), `primaryColor` /
`secondaryColor` (for `PRMYColor` / `SecColor`, from the chosen conference),
`preset`, and `nameFormat`.

Presets, Set live, show/hide, and the Name field work as in Top 25.

**Send to vMix:**

- **Automatic:** every change goes to vMix right away, including relay and
  PrestoSports score updates.
- **Manual:** vMix keeps what you last sent. The tab says "Changes not sent to
  vMix yet" and highlights **Send to vMix** until you press it. Set live also
  waits for the send.

**Score sources.** Each game is **Manual** (typed on the tab) or **Relay**.
Relay games take score, period, and time from:

- **PrestoSports auto-update** (per preset): a scoreboard URL, how often to
  check it, and an auto-update switch. **Check now** fetches once, and
  **Import games** fills empty slots from the scoreboard as Relay games.
- **Anything that POSTs to `/api/graphics/SSN_5018_v3/relay`:**

  ```json
  {
    "preset": "Men's Basketball",
    "games": [
      { "away": "CMU", "home": "Brookfield", "awayScore": 41, "homeScore": 38,
        "period": "2nd Half", "time": "12:01" }
    ]
  }
  ```

  `preset` is optional (defaults to the live one), and `away` / `home` can be an
  abbv or a team name. Each incoming game updates the Relay game with the same
  two teams, swapping the scores if they arrive reversed. Unmatched games are
  listed in the response's `unmatched` and never added; Manual games are never
  touched.

The tab shows relay updates within 3 seconds. Relay score fields are read-only
there; switch a game to Manual to override it.

### Impact Players — `SSN_9048_v3`

4 rows, row N = player N. Bind `first`, `last`, `pos`, `number`, `headshot`,
`logo` to `PN_FIRST`, `PN_LAST`, `PN_POS`, `PN_NUMBER`, `PN_HEADSHOT`,
`PN_Logo`, and `PN_BKG`'s color to `color`. Rows also have `player`, `visible`,
`teamAbbv`, `teamName`, `primaryColor`, `secondaryColor`, `accentColor`,
`title` (the `IMPACT PLAYERS` layer), and `sport`.

- Each player can be from any team; you pick which team color `color` carries.
- **Headshots** are built as `<Headshots folder>\<Team name>\<Sport>\<Number>.png`.
  Set the folder and file type in **Settings**. The sport is the tab's **Sport**
  box, or Game setup's when that's blank. The tab shows each player's path, and
  a player's **Override** box takes any other path.
- Show/hide, move, and clear per player. Hidden players go out blank.

### Keys to the Game — `SSN_5006_v01`

One row: 3 keys for one team, plus both teams from Game setup.

| Field | Layer |
|---|---|
| `header` (default `KEYS TO THE GAME`) | `Header` |
| `subHeader` (default: the keys team's name) | `SubHeader` |
| `topic1`–`topic3` (headline) | `Topic 1`–`Topic 3` |
| `stat1`–`stat3` (line under it) | `Stat 1`–`Stat 3` |
| `vLogo`, `vMascot`, `vColor` (away) | `VLogo`, `VMascot`, `VNameBox` |
| `hLogo`, `hMascot`, `hColor` (home) | `HLogo`, `HMascot`, `HNameBox` |

Keys are written separately for away and home; **Use these keys** (or the
**Keys for** dropdown) picks which set goes to vMix right away. `keysTeamName`,
`keysTeamColor`, `keysTeamSecondaryColor`, and `keysTeamLogo` follow the team
the keys are about, for the key boxes, lines, or top bar. There are also
`vName`, `hName`, and `…SecondaryColor`.

### Team Stats — `SSN_9120_v1`

One row: a full-screen comparison, home on the left and away on the right.
Teams come from Game setup; scores and up to 5 stat rows are typed on the tab.

| Field | Layer |
|---|---|
| `header` (default `TEAM STATS`), `subHeader` (`HALFTIME`, `FINAL`, ...) | `HEADER`, `SUBHEADER` |
| `hSchool`, `vSchool` | `H SCHOOL`, `V SCHOOL` |
| `hName`, `vName` (mascots) | `H NAME`, `V NAME` |
| `hScore`, `vScore` | `hSCORE`, `vSCORE` |
| `hStat1`–`hStat5`, `vStat1`–`vStat5` | `H Stat 1`–`5`, `V Stat 1`–`5` |
| `label1`, `label2`, `label3`, `label4`, `label5` (top to bottom) | `STAT9`, `STAT8`, `STAT7`, `STAT6`, `STAT5` |
| `vLogo` | `V LOGO` |
| `centerLogo` (home, away, a conference, or none) | `Center Logo` |
| `hColor`, `vColor` (plus `…SecondaryColor`) | `H TEAM COLOR`, `V TEAM COLOR`, colorbars |

Stat labels suggest common stats per sport and are sent uppercase.

### Known issues in the title files

Fix these in GT Designer when convenient; until then, bind them by hand.

- **Top 25:** misspelled layers `Team5Colmun1`, `Team7Colmun1` / `Colmun2`,
  `Team9Colmun1`, and `Team23Column12`.
- **Conference Scores:** game 3's period layer is `G3 Period` (with a space).
- **Keys to the Game:** inconsistent names `K1Line` vs `Key2Line`, and
  `Key2 Box` (with a space).
- **Team Stats:** the stat labels are numbered bottom-up (see the table above).
  There's no home logo layer: the home school's logo is part of the design,
  so it shows even if the home team is away. Make it an image layer bound to
  `hLogo` to fix that; the feed already sends it.

## Settings

The **Settings** button (top right) holds per-computer settings, stored in
`data/settings.json`:

- **Base path** (default `C:\Users\vMix\Dropbox`): logo paths
  without a drive letter are resolved against it in every feed, so a new
  computer only needs this one setting changed. Absolute paths work as-is.
- **Headshots folder** and **file type**, for Impact Players (see above). The
  folder can be relative to the base path.

## Data and backups

Everything lives in the `data/` folder as JSON: `teams.json`,
`conferences.json`, `game.json`, `settings.json`, and one file per graphic in
`data/graphics/`.

- Each save keeps the previous version next to the file as `<name>.bak`.
- Saves are written to a temporary file and then swapped in, so a crash or
  power loss mid-save can't leave a half-written file.
- If a file is ever damaged anyway, the app says which one and never overwrites
  it. A damaged `teams.json`, `conferences.json`, or `settings.json` stops the
  dashboard from starting; a damaged graphic file only fails that graphic. To
  recover, copy `<name>.bak` over the damaged file.

The included teams and conference are fictional sample data. Their logo paths
are relative (`Logos\Schools\<Name>\<Name>.png`), so they resolve against the
**Base path** setting.

## Development

- `npm test` runs every test in `test/`. Each test file gets its own server on
  a free port and a scratch copy of `test/fixtures/data`, so tests never touch
  the real `data/` folder or a dashboard that's already running.
- `npm start` runs with `node --watch`, restarting when the code changes.
  `npm run start:once` runs without it.
- `PORT` and `DATA_DIR` environment variables override the port and data folder.
- New graphics go in the `GRAPHICS` registry in `server.js`, keyed by the exact
  vMix title name, with a tab in `public/`. Auto-saving tabs use `autoSave()`
  from `public/app.js`.

## Roadmap

1. ~~Teams + Conferences~~ — done
2. ~~Game setup~~ — done
3. **Roster manager:** per team, per sport: number, name, position, class,
   height, hometown, previous school. Headshots would then come from the
   roster, using the same `<Team name>\<Sport>\<Number>` folder layout.
4. **More graphics**, one at a time: Starting 5 (`SSN_5007_v1`, ready to
   build), Locator, Breakboard, Scoreboard, Post Game Interview, and Count Down
   to Tip.
