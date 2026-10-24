import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { fetchScoreboard, fetchPage, baseTeamName } from "./presto.js";
import { parseFootball, footballRow, TEAM_STATS, statField } from "./football.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// DATA_DIR / PORT can be overridden (the tests run on a scratch copy of the data).
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, "data");
const GRAPHICS_DIR = path.join(DATA_DIR, "graphics");
const TEAMS_PATH = path.join(DATA_DIR, "teams.json");
const CONFS_PATH = path.join(DATA_DIR, "conferences.json");
const SETTINGS_PATH = path.join(DATA_DIR, "settings.json");
const APP_VERSION = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8")).version;

const shortPath = (p) => path.join("data", path.relative(DATA_DIR, p));

// A missing file means "nothing saved yet" and gets the fallback. A file that
// exists but can't be read or parsed throws instead: treating it as empty
// would let the next save overwrite whatever it held.
function loadJson(filePath, fallback) {
  let text;
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch (e) {
    if (e.code === "ENOENT") return fallback;
    throw new Error(`Can't read ${shortPath(filePath)}: ${e.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(
      `${shortPath(filePath)} is damaged (${e.message}). ` +
        `The previous version is next to it as ${path.basename(filePath)}.bak — copy it over the damaged file to restore it.`
    );
  }
}

// Written to a temp file and renamed into place, so a crash or power loss
// mid-save leaves the old file intact rather than a half-written one. The
// version being replaced is kept as <file>.bak.
function saveJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  if (fs.existsSync(filePath)) fs.copyFileSync(filePath, `${filePath}.bak`);
  fs.renameSync(tmp, filePath);
}

// Startup reads: refuse to start on a damaged file rather than run with empty data.
function loadOrExit(filePath, fallback) {
  try {
    return loadJson(filePath, fallback);
  } catch (e) {
    console.error(`\nNot starting: ${e.message}\n`);
    process.exit(1);
  }
}

let teams = loadOrExit(TEAMS_PATH, []);
let conferences = loadOrExit(CONFS_PATH, []);

// --- Settings: machine-specific, so data/settings.json is gitignored ---

const DEFAULT_SETTINGS = {
  basePath: "C:\\Users\\vMix\\Dropbox",
  // Headshots live at <headshotRoot>\<Team name>\<Sport>\<Number><headshotExt>;
  // headshotRoot may be relative to basePath like logo paths.
  headshotRoot: "",
  headshotExt: ".png",
};

let settings = { ...DEFAULT_SETTINGS, ...loadOrExit(SETTINGS_PATH, {}) };

// Logo paths may be absolute (used as-is) or relative to settings.basePath, so
// moving to another machine only means changing basePath. vMix runs on Windows,
// so resolve with win32 semantics regardless of where this server runs.
function resolveAssetPath(p) {
  if (!p) return "";
  if (path.win32.isAbsolute(p) || !settings.basePath) return p;
  return path.win32.join(settings.basePath, p);
}

function resolveRow(row) {
  return {
    ...row,
    primaryLogo: resolveAssetPath(row.primaryLogo),
    secondaryLogo: resolveAssetPath(row.secondaryLogo),
  };
}

// Matches abbv first, then full name, so a ranking typed by name before the
// team existed in Teams resolves once it's added.
function findTeam(text) {
  const key = (text || "").trim().toUpperCase();
  if (!key) return null;
  return teams.find((t) => t.abbv.toUpperCase() === key) || teams.find((t) => t.name.toUpperCase() === key) || null;
}

const TEAM_FIELDS = [
  "abbv",
  "nameUppercase",
  "name",
  "mascot",
  "primaryColor",
  "secondaryColor",
  "accentColor",
  "primaryLogo",
  "secondaryLogo",
];

function normalizeTeam(body) {
  const out = {};
  for (const f of TEAM_FIELDS) out[f] = typeof body[f] === "string" ? body[f].trim() : "";
  return out;
}

const str = (v) => (typeof v === "string" ? v.trim() : "");

// --- Graphics registry ---
// Keyed by the EXACT vMix / GT Designer title name. A design version bump
// (_v6, ...) gets a new entry rather than changing an existing one, so vMix
// bindings to older titles keep working.
//   defaults()  -> initial stored state
//   normalize(body, prev) -> sanitize a POSTed body into stored state
//   feed()      -> the /out/graphics/<title>.json payload
//   relay()     -> optional: apply a push from an outside source (see SSN_5018_v3)
//   send()      -> optional: copy the working state to what the feed serves
//   unsent()    -> optional: true if the working state differs from what the feed serves

const NAME_FORMATS = ["name", "nameUppercase", "abbv"]; // which team field feeds a graphic's names
const nameFormatOf = (v) => (NAME_FORMATS.includes(v) ? v : "name");

// Graphics with one saved preset per sport. `live` picks the preset the feed
// serves, so switching sports never changes the URL vMix points at.
function normalizePresets(raw, normalizeOne, fallbackName, requestedLive) {
  const presets = [];
  (Array.isArray(raw) ? raw : []).forEach((p, i) => {
    const preset = normalizeOne(p || {}, `Preset ${i + 1}`);
    if (!presets.some((x) => x.name === preset.name)) presets.push(preset);
  });
  if (!presets.length) presets.push(normalizeOne({}, fallbackName));
  const live = presets.some((p) => p.name === requestedLive) ? requestedLive : presets[0].name;
  return { live, presets };
}

const TOP25_SLOTS = 25;
const TEAM_COLOR_KEYS = ["primaryColor", "secondaryColor", "accentColor"];

function normalizeTop25Preset(p, fallbackName) {
  const slots = Array.isArray(p.slots) ? p.slots : [];
  return {
    name: str(p.name) || fallbackName,
    asOf: str(p.asOf),
    slots: Array.from({ length: TOP25_SLOTS }, (_, i) => {
      const s = slots[i] || {};
      return {
        teamAbbv: str(s.teamAbbv),
        column1: str(s.column1),
        column2: str(s.column2),
        visible: s.visible !== false,
        colorKey: TEAM_COLOR_KEYS.includes(s.colorKey) ? s.colorKey : "primaryColor",
      };
    }),
  };
}

const GRAPHICS = {
  // Top 25. GT Designer layers per row N (1-25): TeamN{Name, Column1,
  // Column2, LogoColor, Logo}. No rank/abbv layers — rank is the slot number.
  // Stores one preset per sport; `live` picks which one the feed serves, so
  // switching sports never changes the URL vMix points at.
  SSN_9225_v5: {
    label: "Top 25",
    defaults: () => ({ nameFormat: "name", live: "", presets: [] }),
    normalize: (body) => {
      // 0.2.0 stored a single ranking ({ sport, asOf, slots }) — wrap it as a preset.
      const raw = Array.isArray(body.presets)
        ? body.presets
        : Array.isArray(body.slots)
          ? [{ ...body, name: body.sport }]
          : [];
      return {
        nameFormat: nameFormatOf(body.nameFormat),
        ...normalizePresets(raw, normalizeTop25Preset, "Men's Basketball", body.live),
      };
    },
    // One row per slot so vMix sees 25 rows; sport/asOf/nameFormat repeat on
    // every row since vMix binds by column. Hidden slots go out blank so the
    // row's layers are empty in the graphic.
    feed: (state) => {
      const preset = state.presets.find((p) => p.name === state.live);
      return preset.slots.map((s, i) => {
        const team = s.visible ? findTeam(s.teamAbbv) : null;
        return {
          rank: i + 1,
          visible: s.visible,
          teamAbbv: team ? team.abbv : s.visible ? s.teamAbbv : "",
          name: team ? team[state.nameFormat] : "",
          logo: team ? resolveAssetPath(team.primaryLogo) : "",
          logoColor: team ? team[s.colorKey] || team.primaryColor : "",
          column1: s.visible ? s.column1 : "",
          column2: s.visible ? s.column2 : "",
          sport: preset.name,
          asOf: preset.asOf,
          nameFormat: state.nameFormat,
        };
      });
    },
  },

  // "Conference Scores" conference scores, 6 games. GT Designer layers per game
  // N (1-6): GN{T1Logo, T1Name, T1Score, T2Logo, T2Name, T2Score, Period, Time}
  // (Game 3's period layer is misnamed "G3 Period"), plus graphic-wide Sport,
  // Conference (the heading text), PRMYColor and SecColor.
  // T1 is the top row (away), T2 the bottom (home). Each game is either
  // "manual" or "relay"; only relay games take score updates, from
  // POST /api/graphics/SSN_5018_v3/relay or from the preset's PrestoSports
  // scoreboard when its autoUpdate is on (see pollPresto below).
  // sendMode: the feed serves `sent`, a snapshot of the working state. In
  // "auto" every change (dashboard, relay, Presto) is copied to `sent` at once;
  // in "manual" only POST /api/graphics/SSN_5018_v3/send copies it.
  SSN_5018_v3: {
    label: "Conference Scores",
    defaults: () => ({ nameFormat: "name", live: "", presets: [], relayUpdatedAt: "", sendMode: "manual", sent: null }),
    normalize: (body, prev) => {
      const next = {
        nameFormat: nameFormatOf(body.nameFormat),
        ...normalizePresets(body.presets, normalizeScoresPreset, "Men's Basketball", body.live),
        relayUpdatedAt: prev ? prev.relayUpdatedAt : str(body.relayUpdatedAt),
        sendMode: SEND_MODES.includes(body.sendMode) ? body.sendMode : prev ? prev.sendMode : "manual",
        // Clients never set `sent` directly; it's only read back from disk.
        sent: prev ? prev.sent : body.sent && typeof body.sent === "object" ? scoresSnapshot(normalizeScoresSent(body.sent)) : null,
      };
      // A dashboard save must not roll back scores the relay pushed after the
      // page loaded, so relay games keep the stored score/period/time.
      if (prev) {
        next.presets.forEach((p) => {
          const old = prev.presets.find((x) => x.name === p.name);
          if (!old) return;
          p.games.forEach((g, i) => {
            const o = old.games[i];
            if (g.source === "relay" && o.source === "relay" && sameMatchup(g, o) === "same") {
              Object.assign(g, pick(o, SCORE_FIELDS));
            }
          });
        });
      }
      if (next.sendMode === "auto" || !next.sent) next.sent = scoresSnapshot(next);
      return next;
    },
    feed: (state) => scoresFeed(state.sent),
    send: (state) => {
      state.sent = scoresSnapshot(state);
      return state;
    },
    unsent: (state) => JSON.stringify(scoresFeed(state)) !== JSON.stringify(scoresFeed(state.sent)),
    // One row per game (6 rows); graphic-wide fields repeat on every row.
    feedOf: (state) => {
      const preset = state.presets.find((p) => p.name === state.live);
      const conf = conferences.find((c) => c.abbv === preset.conferenceAbbv);
      return preset.games.map((g, i) => {
        const side = (text) => {
          const team = g.visible ? findTeam(text) : null;
          return {
            abbv: team ? team.abbv : g.visible ? text : "",
            name: team ? team[state.nameFormat] : "",
            logo: team ? resolveAssetPath(team.primaryLogo) : "",
          };
        };
        const t1 = side(g.t1Abbv);
        const t2 = side(g.t2Abbv);
        return {
          game: i + 1,
          visible: g.visible,
          t1Abbv: t1.abbv,
          t1Name: t1.name,
          t1Logo: t1.logo,
          t1Score: g.visible ? g.t1Score : "",
          t2Abbv: t2.abbv,
          t2Name: t2.name,
          t2Logo: t2.logo,
          t2Score: g.visible ? g.t2Score : "",
          period: g.visible ? g.period : "",
          time: g.visible ? g.time : "",
          source: g.source,
          sport: preset.sportLabel,
          heading: preset.heading,
          primaryColor: conf ? conf.primaryColor : "",
          secondaryColor: conf ? conf.secondaryColor : "",
          preset: preset.name,
          nameFormat: state.nameFormat,
        };
      });
    },
    // Body: { preset?: name (default: live), games: [{ away, home, awayScore,
    // homeScore, period, time }] }. away/home may be abbv or full name. Each
    // incoming game updates the relay game with the same two teams, in either
    // order; anything unmatched is reported back, never added.
    relay: (state, body) => {
      const preset = state.presets.find((p) => p.name === (str(body.preset) || state.live));
      if (!preset) return { error: `No preset named "${str(body.preset)}".` };
      const matched = [];
      const unmatched = [];
      (Array.isArray(body.games) ? body.games : []).forEach((inc) => {
        const incoming = {
          t1Abbv: str(inc.away),
          t2Abbv: str(inc.home),
          t1Score: String(inc.awayScore ?? "").trim(),
          t2Score: String(inc.homeScore ?? "").trim(),
          period: str(inc.period),
          time: str(inc.time),
        };
        const i = preset.games.findIndex((g) => g.source === "relay" && sameMatchup(g, incoming));
        if (i === -1) {
          unmatched.push(`${incoming.t1Abbv} at ${incoming.t2Abbv}`);
          return;
        }
        const g = preset.games[i];
        const swapped = sameMatchup(g, incoming) === "swapped";
        Object.assign(g, {
          t1Score: swapped ? incoming.t2Score : incoming.t1Score,
          t2Score: swapped ? incoming.t1Score : incoming.t2Score,
          period: incoming.period,
          time: incoming.time,
        });
        matched.push(i + 1);
      });
      state.relayUpdatedAt = new Date().toISOString();
      if (state.sendMode === "auto") state.sent = scoresSnapshot(state);
      return { state, matched, unmatched };
    },
  },

  // Impact Players, 4 players. GT Designer layers per player N (1-4):
  // PN_{FIRST, LAST, POS, NUMBER, HEADSHOT, Logo, BKG, Rip_Effect}, plus the
  // graphic-wide "IMPACT PLAYERS" text. Each player can be from any team; the
  // team's logo/color are looked up from Teams, and the headshot is built
  // from settings.headshotRoot unless a path is typed for that player.
  SSN_9048_v3: {
    label: "Impact Players",
    defaults: () => ({ title: "IMPACT PLAYERS", sport: "", players: [] }),
    normalize: (body) => {
      const players = Array.isArray(body.players) ? body.players : [];
      return {
        title: typeof body.title === "string" ? body.title.trim() : "IMPACT PLAYERS",
        sport: str(body.sport), // blank = use Game setup's sport
        players: Array.from({ length: IMPACT_PLAYERS }, (_, i) => {
          const p = players[i] || {};
          return {
            visible: p.visible !== false,
            teamAbbv: str(p.teamAbbv),
            pos: str(p.pos),
            number: str(p.number),
            first: str(p.first),
            last: str(p.last),
            headshot: str(p.headshot), // override; blank = built from settings
            colorKey: TEAM_COLOR_KEYS.includes(p.colorKey) ? p.colorKey : "primaryColor",
            logoKey: LOGO_KEYS.includes(p.logoKey) ? p.logoKey : "primaryLogo",
          };
        }),
      };
    },
    // One row per player (4 rows); title/sport repeat on every row.
    feed: (state) => {
      const sport = state.sport || loadGame().sport;
      return state.players.map((p, i) => {
        const team = p.visible ? findTeam(p.teamAbbv) : null;
        const on = (v) => (p.visible ? v : "");
        return {
          player: i + 1,
          visible: p.visible,
          teamAbbv: team ? team.abbv : on(p.teamAbbv),
          teamName: team ? team.name : "",
          pos: on(p.pos),
          number: on(p.number),
          first: on(p.first),
          last: on(p.last),
          headshot: p.visible ? headshotPath(p, team, sport) : "",
          logo: team ? resolveAssetPath(team[p.logoKey] || team.primaryLogo) : "",
          color: team ? team[p.colorKey] || team.primaryColor : "",
          primaryColor: team ? team.primaryColor : "",
          secondaryColor: team ? team.secondaryColor : "",
          accentColor: team ? team.accentColor : "",
          title: state.title,
          sport,
        };
      });
    },
  },
};

const IMPACT_PLAYERS = 4;
const GAME_KEYS = 3;
const TEAM_STAT_ROWS = 5;

// Team Stats, full screen. GT Designer layers: HEADER, SUBHEADER; home on the
// left (H SCHOOL, hSCORE, H NAME = mascot, H Stat 1-5, H TEAM COLOR and the
// H colorbars; the home logo is baked into the design) and away on the right
// (V SCHOOL, vSCORE, V NAME, V LOGO, V Stat 1-5, V TEAM COLOR / colorbars);
// Center Logo; and the middle labels, which are numbered bottom-up in the
// title: row 1 = STAT9, row 2 = STAT8, ... row 5 = STAT5. Teams come from
// Game setup. Scores and stats are typed in the tab, or come from the loaded
// football stats: a row whose `source` is a TEAM_STATS key (football.js), and
// the scores when scoreSource is "football", are read from the football feed
// each time this feed is read, so they follow every auto-update. centerLogo
// is "home", "away", "none", or a conference abbv.
GRAPHICS.SSN_9120_v1 = {
  label: "Team Stats",
  defaults: () => ({ header: "TEAM STATS", subHeader: "", hScore: "", vScore: "", scoreSource: "typed", centerLogo: "home", rows: [] }),
  normalize: (body) => {
    const rows = Array.isArray(body.rows) ? body.rows : [];
    return {
      header: typeof body.header === "string" ? body.header.trim() : "TEAM STATS",
      subHeader: str(body.subHeader),
      hScore: str(body.hScore),
      vScore: str(body.vScore),
      scoreSource: body.scoreSource === "football" ? "football" : "typed",
      centerLogo: typeof body.centerLogo === "string" ? body.centerLogo.trim() || "home" : "home",
      rows: Array.from({ length: TEAM_STAT_ROWS }, (_, i) => {
        const r = rows[i] || {};
        const source = TEAM_STATS.some(([key]) => key === r.source) ? r.source : "";
        return { label: str(r.label), home: str(r.home), away: str(r.away), source };
      }),
    };
  },
  // One row. label1-5 are top to bottom; bind label1 to STAT9 ... label5 to STAT5.
  feed: (state) => {
    const g = gameFeed(loadGame())[0];
    const conf = conferences.find((c) => c.abbv === state.centerLogo);
    const centerLogo =
      { home: g.homeLogo, away: g.awayLogo, none: "" }[state.centerLogo] ?? (conf ? resolveAssetPath(conf.primaryLogo) : "");
    const fb = footballFeed();
    const fromFootball = (field) => (fb.loaded ? String(fb[field] ?? "") : "");
    const scoresFromFootball = state.scoreSource === "football";
    const row = {
      header: state.header,
      subHeader: state.subHeader,
      hSchool: g.homeNameUppercase,
      vSchool: g.awayNameUppercase,
      hName: g.homeMascot,
      vName: g.awayMascot,
      hScore: scoresFromFootball ? fromFootball("homeScore") : state.hScore,
      vScore: scoresFromFootball ? fromFootball("awayScore") : state.vScore,
      hLogo: g.homeLogo,
      vLogo: g.awayLogo,
      centerLogo,
      hColor: g.homeColor,
      vColor: g.awayColor,
      hSecondaryColor: g.homeSecondaryColor,
      vSecondaryColor: g.awaySecondaryColor,
    };
    state.rows.forEach((r, i) => {
      const stat = TEAM_STATS.find(([key]) => key === r.source);
      row[`label${i + 1}`] = r.label || (stat ? stat[1] : "");
      row[`hStat${i + 1}`] = stat ? fromFootball(statField("home", r.source)) : r.home;
      row[`vStat${i + 1}`] = stat ? fromFootball(statField("away", r.source)) : r.away;
    });
    return [row];
  },
};

// Keys to the Game. GT Designer layers: Header, SubHeader; Topic 1-3 (the
// headline) and Stat 1-3 (the line under it); and both teams' VLogo/VMascot
// and HLogo/HMascot, with VNameBox/HNameBox in each team's color. Teams come
// from Game setup. Keys are written per side and `side` picks which set (and
// which team's name/colors) goes out.
GRAPHICS.SSN_5006_v01 = {
  label: "Keys to the Game",
  defaults: () => ({ header: "KEYS TO THE GAME", subHeader: "", side: "home", keys: {} }),
  normalize: (body) => {
    const keys = body.keys && typeof body.keys === "object" ? body.keys : {};
    const sideKeys = (list) =>
      Array.from({ length: GAME_KEYS }, (_, i) => {
        const k = (Array.isArray(list) && list[i]) || {};
        return { topic: str(k.topic), stat: str(k.stat) };
      });
    return {
      header: typeof body.header === "string" ? body.header.trim() : "KEYS TO THE GAME",
      subHeader: str(body.subHeader), // blank = the keys team's uppercase name
      side: GAME_SIDES.includes(body.side) ? body.side : "home",
      keys: { away: sideKeys(keys.away), home: sideKeys(keys.home) },
    };
  },
  // One row: the keys for `side`, plus both teams from Game setup.
  feed: (state) => {
    const g = gameFeed(loadGame())[0];
    const team = (side) => ({
      abbv: g[`${side}Abbv`],
      name: g[`${side}Name`],
      nameUppercase: g[`${side}NameUppercase`],
      mascot: g[`${side}Mascot`],
      logo: g[`${side}Logo`],
      color: g[`${side}Color`],
      secondaryColor: g[`${side}SecondaryColor`],
    });
    const [v, h, k] = [team("away"), team("home"), team(state.side)];
    const row = {
      header: state.header,
      subHeader: state.subHeader || k.nameUppercase,
      side: state.side,
    };
    state.keys[state.side].forEach((key, i) => {
      row[`topic${i + 1}`] = key.topic;
      row[`stat${i + 1}`] = key.stat;
    });
    for (const [prefix, t] of [["v", v], ["h", h], ["keysTeam", k]]) {
      Object.assign(row, {
        [`${prefix}Abbv`]: t.abbv,
        [`${prefix}Name`]: t.name,
        [`${prefix}Mascot`]: t.mascot,
        [`${prefix}Logo`]: t.logo,
        [`${prefix}Color`]: t.color,
        [`${prefix}SecondaryColor`]: t.secondaryColor,
      });
    }
    return [row];
  },
};

// <headshotRoot>\<Team name>\<Sport>\<Number><ext>, or the player's typed
// override. Blank when there isn't enough to build it.
function headshotPath(p, team, sport) {
  if (p.headshot) return resolveAssetPath(p.headshot);
  if (!settings.headshotRoot || !team || !sport || !p.number) return "";
  return resolveAssetPath(path.win32.join(settings.headshotRoot, team.name, sport, p.number + settings.headshotExt));
}

const SCORES_GAMES = 6;
const SEND_MODES = ["auto", "manual"];

// The part of SSN_5018_v3's state that reaches vMix.
const scoresSnapshot = (state) => structuredClone({ nameFormat: state.nameFormat, live: state.live, presets: state.presets });
const normalizeScoresSent = (sent) => ({
  nameFormat: nameFormatOf(sent.nameFormat),
  ...normalizePresets(sent.presets, normalizeScoresPreset, "Men's Basketball", sent.live),
});
const scoresFeed = (snapshot) => GRAPHICS.SSN_5018_v3.feedOf(snapshot);
const SCORE_FIELDS = ["t1Score", "t2Score", "period", "time"];
const pick = (obj, keys) => Object.fromEntries(keys.map((k) => [k, obj[k]]));
const teamKey = (text) => {
  const team = findTeam(text);
  return (team ? team.abbv : text || "").trim().toUpperCase();
};

// "same" if a and b list the same two teams in order, "swapped" if reversed.
function sameMatchup(a, b) {
  const [a1, a2, b1, b2] = [a.t1Abbv, a.t2Abbv, b.t1Abbv, b.t2Abbv].map(teamKey);
  if (!a1 || !a2) return null;
  if (a1 === b1 && a2 === b2) return "same";
  if (a1 === b2 && a2 === b1) return "swapped";
  return null;
}

function normalizeScoresPreset(p, fallbackName) {
  const games = Array.isArray(p.games) ? p.games : [];
  const text = (v, fallback) => (typeof v === "string" ? v.trim() : fallback);
  return {
    name: str(p.name) || fallbackName,
    sportLabel: text(p.sportLabel, "COLLEGE BASKETBALL"),
    heading: text(p.heading, "AROUND THE CONFERENCE"),
    conferenceAbbv: text(p.conferenceAbbv, "PVAC"),
    prestoUrl: str(p.prestoUrl),
    autoUpdate: p.autoUpdate === true,
    pollSeconds: PRESTO_POLL_OPTIONS.includes(Number(p.pollSeconds)) ? Number(p.pollSeconds) : 30,
    games: Array.from({ length: SCORES_GAMES }, (_, i) => {
      const g = games[i] || {};
      return {
        visible: g.visible !== false,
        t1Abbv: str(g.t1Abbv),
        t2Abbv: str(g.t2Abbv),
        t1Score: str(g.t1Score),
        t2Score: str(g.t2Score),
        period: str(g.period),
        time: str(g.time),
        source: g.source === "relay" ? "relay" : "manual",
      };
    }),
  };
}

const graphicPath = (title) => path.join(GRAPHICS_DIR, `${title}.json`);

// --- PrestoSports auto-update for SSN_5018_v3 ---
// Every preset with autoUpdate on and a prestoUrl gets its scoreboard fetched
// every pollSeconds; the games are fed through the same relay matching as the
// POST endpoint, so only that preset's relay games change. Status is kept in
// memory only.

const SCORES_TITLE = "SSN_5018_v3";
const PRESTO_POLL_OPTIONS = [15, 30, 60, 120];
const prestoStatus = {}; // preset name -> { at, ok, error?, found, matched, missing }
const prestoLastPoll = {};
const prestoInFlight = {};

// Presto names often carry a state ("Clearwater (IA)"); try as-is, then without it.
function prestoTeam(name) {
  const team = findTeam(name) || findTeam(baseTeamName(name));
  return { abbv: team ? team.abbv : "", key: team ? team.abbv : baseTeamName(name) };
}

async function pollPrestoPreset(presetName, url) {
  const at = new Date().toISOString();
  try {
    const games = await fetchScoreboard(url);
    // Reload after the fetch so a dashboard save made meanwhile isn't lost.
    const result = GRAPHICS[SCORES_TITLE].relay(loadGraphic(SCORES_TITLE), {
      preset: presetName,
      games: games.map((g) => ({ ...g, away: prestoTeam(g.away).key, home: prestoTeam(g.home).key })),
    });
    if (result.error) throw new Error(result.error);
    saveJson(graphicPath(SCORES_TITLE), result.state);
    const preset = result.state.presets.find((p) => p.name === presetName);
    const missing = preset.games
      .map((g, i) => ({ g, n: i + 1 }))
      .filter(({ g, n }) => g.source === "relay" && g.t1Abbv && g.t2Abbv && !result.matched.includes(n))
      .map(({ n }) => n);
    prestoStatus[presetName] = { at, ok: true, found: games.length, matched: result.matched, missing };
  } catch (e) {
    prestoStatus[presetName] = { at, ok: false, error: e.message };
  }
  return prestoStatus[presetName];
}

function pollPresto() {
  let state;
  try {
    state = loadGraphic(SCORES_TITLE);
  } catch (e) {
    console.error(`PrestoSports auto-update skipped: ${e.message}`);
    return;
  }
  for (const p of state.presets) {
    if (!p.autoUpdate || !p.prestoUrl || prestoInFlight[p.name]) continue;
    if (!p.games.some((g) => g.source === "relay")) continue;
    if (Date.now() - (prestoLastPoll[p.name] || 0) < p.pollSeconds * 1000) continue;
    prestoInFlight[p.name] = true;
    prestoLastPoll[p.name] = Date.now();
    pollPrestoPreset(p.name, p.prestoUrl).finally(() => (prestoInFlight[p.name] = false));
  }
}

setInterval(pollPresto, 5000);

function loadGraphic(title) {
  const g = GRAPHICS[title];
  return g.normalize(loadJson(graphicPath(title), null) || g.defaults());
}

// --- Game setup: the current game's away/home teams and details ---
// Replaces the spreadsheet's game setup cells (AwayUpper/HomeUpper and the
// lookups off them). Teams are stored by abbv and looked up at request time,
// so editing a team in Teams flows straight into /out/game.json. Later
// single-game graphics (Locator, Scoreboard, ...) read their teams from here.

const GAME_PATH = path.join(DATA_DIR, "game.json");
const GAME_SIDES = ["away", "home"];
const LOGO_KEYS = ["primaryLogo", "secondaryLogo"];
const COACH_TITLES = ["Head Coach", "Interim Head Coach", "Assistant Coach", "Graduate Assistant"];

// "5" -> "5th Season"; anything that isn't a plain number passes through.
function seasonLabel(v) {
  const n = Number(v);
  if (!v || !Number.isInteger(n) || n < 1) return v;
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : { 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th";
  return `${n}${suffix} Season`;
}
const GAME_TEXT_FIELDS = ["sport", "date", "time", "broadcastStart", "venue", "location", "event", "series", "lastMeeting", "attendance"];
// The broadcast crew roles offered in the dashboard, in display order. Each
// also gets its own feed field (crewPlayByPlay, crewCamera3, ...) so a
// graphic can bind a role directly, whatever slot it's in.
const CREW_ROLES = [
  ["Director", "Director"],
  ["Producer", "Producer"],
  ["GFX Associate Producer", "GfxAssociateProducer"],
  ["Associate Director", "AssociateDirector"],
  ["Operations", "Operations"],
  ["Technical Director", "TechnicalDirector"],
  ["Audio 1 (A1)", "Audio1"],
  ["Audio 2 (A2)", "Audio2"],
  ["Audio 3 (A3)", "Audio3"],
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => [`Camera ${n}`, `Camera${n}`]),
  ["Replay Operator", "ReplayOperator"],
  ["Video Engineer", "VideoEngineer"],
  ["GFX Operator", "GfxOperator"],
  ["Graphics Interface", "GraphicsInterface"],
  ["Stage Manager", "StageManager"],
  ["Play by Play", "PlayByPlay"],
  ["Analyst", "Analyst"],
  ["Analyst Stats", "AnalystStats"],
];
// vMix binds fixed columns, so crew/officials go out as numbered slots
// (crew1Name, official3Role, ...). One crew slot per role; football's
// 7-person officiating crew sets that max.
const CREW_SLOTS = CREW_ROLES.length;
const OFFICIAL_SLOTS = 7;

function normalizeGameSide(s) {
  s = s && typeof s === "object" ? s : {};
  return {
    teamAbbv: str(s.teamAbbv),
    rank: str(s.rank),
    record: str(s.record),
    confRecord: str(s.confRecord),
    coach: str(s.coach),
    coachTitle: COACH_TITLES.includes(s.coachTitle) ? s.coachTitle : "Head Coach",
    coachRecord: str(s.coachRecord),
    coachConfRecord: str(s.coachConfRecord),
    coachSeason: str(s.coachSeason),
    colorKey: TEAM_COLOR_KEYS.includes(s.colorKey) ? s.colorKey : "primaryColor",
    logoKey: LOGO_KEYS.includes(s.logoKey) ? s.logoKey : "primaryLogo",
  };
}

// A list of { role, name }, capped at `max`; blank rows are kept so the
// dashboard can show a row someone just added.
const normalizePeople = (list, max) =>
  (Array.isArray(list) ? list : []).slice(0, max).map((p) => ({ role: str(p && p.role), name: str(p && p.name) }));

function normalizeGame(body) {
  const game = Object.fromEntries(GAME_TEXT_FIELDS.map((f) => [f, str(body[f])]));
  return {
    ...game,
    conferenceGame: body.conferenceGame === true,
    away: normalizeGameSide(body.away),
    home: normalizeGameSide(body.home),
    crew: normalizePeople(body.crew, CREW_SLOTS),
    officials: normalizePeople(body.officials, OFFICIAL_SLOTS),
  };
}

// Numbered slots plus a one-line version ("Play-by-Play: A · Analyst: B")
// for a single text layer. Filled entries are packed to the front.
function peopleFields(prefix, list, slots) {
  const filled = list.filter((p) => p.name);
  const row = {};
  for (let i = 0; i < slots; i++) {
    row[`${prefix}${i + 1}Name`] = filled[i] ? filled[i].name : "";
    row[`${prefix}${i + 1}Role`] = filled[i] ? filled[i].role : "";
  }
  row[`${prefix}Line`] = filled.map((p) => (p.role ? `${p.role}: ${p.name}` : p.name)).join(" · ");
  return row;
}

const loadGame = () => normalizeGame(loadJson(GAME_PATH, {}));

// One flat row (in a one-element array, like every other feed) so vMix can
// bind awayName, homeColor, etc. directly. `<side>Color` / `<side>Logo` are the
// picks made in the tab; the full set of team colors/logos is there too.
// Broadcast start is typed as "6:45 PM" (or "18:45"). Returns
// { clock: "18:45:00", display: "6:45 PM" }, or null when the text isn't a time.
function parseClock(text) {
  const m = /^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*([ap])?\.?\s*m?\.?$/i.exec(text.trim());
  if (!m) return null;
  let [h, min, sec] = [Number(m[1]), Number(m[2] || 0), Number(m[3] || 0)];
  const ampm = m[4] && m[4].toLowerCase();
  if (min > 59 || sec > 59) return null;
  if (ampm) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (ampm === "p" ? 12 : 0);
  } else if (h > 23 || !m[2]) {
    return null; // a bare "7" is ambiguous without AM/PM
  }
  const pad = (n) => String(n).padStart(2, "0");
  const h12 = h % 12 || 12;
  const clock = `${pad(h)}:${pad(min)}:${pad(sec)}`;
  const display = `${h12}:${pad(min)}${sec ? ":" + pad(sec) : ""} ${h < 12 ? "AM" : "PM"}`;
  return { clock, display };
}

// vMix "countdown to time of day": {0:<end time>|<display format>}; the part
// after the pipe is the literal format string. Without a date vMix assumes
// today, so a start earlier than the current time of day (e.g. tomorrow's
// 4:00 AM) counts as already passed and shows 00:00:00; the game date is
// included whenever it's set.
function broadcastCountdown(game) {
  const start = parseClock(game.broadcastStart);
  if (!start) return "";
  return `{0:${game.date ? game.date + " " : ""}${start.display}|HH:mm:ss}`;
}

function gameFeed(game) {
  const start = parseClock(game.broadcastStart);
  const row = {
    ...Object.fromEntries(GAME_TEXT_FIELDS.map((f) => [f, game[f]])),
    broadcastStart: broadcastCountdown(game),
    broadcastStartDisplay: start ? start.display : "",
    broadcastStartClock: start ? start.clock : "",
    conferenceGame: game.conferenceGame,
    matchup: "",
  };
  for (const side of GAME_SIDES) {
    const s = game[side];
    const team = findTeam(s.teamAbbv);
    const t = (f) => (team ? team[f] : "");
    Object.assign(row, {
      [`${side}Abbv`]: team ? team.abbv : s.teamAbbv,
      [`${side}Name`]: t("name"),
      [`${side}NameUppercase`]: t("nameUppercase"),
      [`${side}Mascot`]: t("mascot"),
      [`${side}Rank`]: s.rank,
      [`${side}Record`]: s.record,
      [`${side}ConfRecord`]: s.confRecord,
      [`${side}Coach`]: s.coach,
      [`${side}CoachTitle`]: s.coach ? s.coachTitle : "",
      [`${side}CoachRecord`]: s.coachRecord,
      [`${side}CoachConfRecord`]: s.coachConfRecord,
      [`${side}CoachSeason`]: s.coachSeason,
      [`${side}CoachSeasonLabel`]: seasonLabel(s.coachSeason),
      [`${side}Color`]: team ? team[s.colorKey] || team.primaryColor : "",
      [`${side}PrimaryColor`]: t("primaryColor"),
      [`${side}SecondaryColor`]: t("secondaryColor"),
      [`${side}AccentColor`]: t("accentColor"),
      [`${side}Logo`]: team ? resolveAssetPath(team[s.logoKey] || team.primaryLogo) : "",
      [`${side}PrimaryLogo`]: team ? resolveAssetPath(team.primaryLogo) : "",
      [`${side}SecondaryLogo`]: team ? resolveAssetPath(team.secondaryLogo) : "",
    });
  }
  if (row.awayName && row.homeName) row.matchup = `${row.awayName} at ${row.homeName}`;
  Object.assign(row, peopleFields("crew", game.crew, CREW_SLOTS), peopleFields("official", game.officials, OFFICIAL_SLOTS));
  // Two people in one role (rare) come out as "A & B".
  for (const [role, key] of CREW_ROLES) {
    row[`crew${key}`] = game.crew.filter((p) => p.role === role && p.name).map((p) => p.name).join(" & ");
  }
  return [row];
}

// --- Football stats: a PrestoSports StatsEntry XML (see football.js) ---
// The XML comes from a URL or a file path, read every pollSeconds while
// autoUpdate is on, or is uploaded from the dashboard. data/football.json
// keeps the settings and the last stats read (`game`, already parsed), and is
// only rewritten when the stats change. The last check's result is kept in
// memory only.

const FOOTBALL_PATH = path.join(DATA_DIR, "football.json");
const FOOTBALL_POLL_OPTIONS = [5, 10, 15, 30, 60];
let footballStatus = null; // { at, ok, error? }
let footballLastPoll = 0;
let footballInFlight = false;

function normalizeFootball(body, prev) {
  return {
    source: str(body.source),
    autoUpdate: body.autoUpdate === true,
    pollSeconds: FOOTBALL_POLL_OPTIONS.includes(Number(body.pollSeconds)) ? Number(body.pollSeconds) : 10,
    // Only loading an XML changes the stats; a settings save keeps them.
    game: prev ? prev.game : body.game && typeof body.game === "object" ? body.game : null,
    updatedAt: prev ? prev.updatedAt : str(body.updatedAt),
    loadedFrom: prev ? prev.loadedFrom : str(body.loadedFrom),
  };
}

const loadFootball = () => normalizeFootball(loadJson(FOOTBALL_PATH, {}));

// The abbv in Teams for an XML team (id "CSC", name "Culver-Stockton (MO)"), or "".
function xmlTeamAbbv(t) {
  const team = findTeam(t.id) || findTeam(t.name) || findTeam(baseTeamName(t.name));
  return team ? team.abbv : "";
}

// Which XML team (V/H) is away and which is home: the XML's visitor and home,
// unless Game setup has the same two teams the other way round.
function footballSides(fbGame, g) {
  const [v, h] = [xmlTeamAbbv(fbGame.teams.V), xmlTeamAbbv(fbGame.teams.H)];
  const reversed = v && h && g.awayAbbv === h && g.homeAbbv === v;
  return reversed ? { away: "H", home: "V" } : { away: "V", home: "H" };
}

function footballFeed(state = loadFootball()) {
  if (!state.game) return { loaded: false };
  const fbGame = state.game;
  const abbvOf = (vh) => xmlTeamAbbv(fbGame.teams[vh]) || fbGame.teams[vh].id;
  return { ...footballRow(fbGame, footballSides(fbGame, gameFeed(loadGame())[0]), abbvOf), updatedAt: state.updatedAt };
}

// Mismatches worth flagging on the Football tab.
function footballWarnings(state) {
  if (!state.game) return [];
  const { V, H } = state.game.teams;
  const out = [];
  for (const t of [V, H]) {
    if (!xmlTeamAbbv(t)) out.push(`"${t.name}" (${t.id}) from the XML isn't in Teams, so it goes out by its XML id.`);
  }
  const g = gameFeed(loadGame())[0];
  const xml = [xmlTeamAbbv(V), xmlTeamAbbv(H)];
  if (g.awayAbbv && g.homeAbbv && !(xml.includes(g.awayAbbv) && xml.includes(g.homeAbbv))) {
    out.push(`The XML is ${V.name} at ${H.name}, but Game setup is ${g.awayAbbv} at ${g.homeAbbv}.`);
  }
  return out;
}

// Parses `text` and saves it if the stats changed. Throws on a bad file.
function storeFootballXml(text, from) {
  const game = parseFootball(text);
  const state = loadFootball(); // reloaded so a settings save made meanwhile is kept
  if (JSON.stringify(game) !== JSON.stringify(state.game)) {
    Object.assign(state, { game, updatedAt: new Date().toISOString(), loadedFrom: from });
    saveJson(FOOTBALL_PATH, state);
  }
}

async function readFootballSource(source) {
  if (/^https?:\/\//i.test(source)) return (await fetchPage(source, "Stats XML")).body;
  try {
    return fs.readFileSync(source, "utf8");
  } catch (e) {
    throw new Error(e.code === "ENOENT" ? `No file at ${source}` : `Can't read ${source}: ${e.message}`);
  }
}

async function checkFootball(source) {
  const at = new Date().toISOString();
  try {
    storeFootballXml(await readFootballSource(source), source);
    footballStatus = { at, ok: true };
  } catch (e) {
    footballStatus = { at, ok: false, error: e.message };
  }
  return footballStatus;
}

function pollFootball() {
  let state;
  try {
    state = loadFootball();
  } catch (e) {
    console.error(`Football auto-update skipped: ${e.message}`);
    return;
  }
  if (!state.autoUpdate || !state.source || footballInFlight) return;
  if (Date.now() - footballLastPoll < state.pollSeconds * 1000) return;
  footballInFlight = true;
  footballLastPoll = Date.now();
  checkFootball(state.source).finally(() => (footballInFlight = false));
}

setInterval(pollFootball, 1000);

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/status", (req, res) => {
  res.json({ version: APP_VERSION, teamCount: teams.length, conferenceCount: conferences.length });
});

// --- Settings ---

app.get("/api/settings", (req, res) => {
  res.json(settings);
});

app.post("/api/settings", (req, res) => {
  const body = req.body || {};
  const ext = str(body.headshotExt) || DEFAULT_SETTINGS.headshotExt;
  settings = {
    ...settings,
    basePath: str(body.basePath),
    headshotRoot: str(body.headshotRoot),
    headshotExt: ext.startsWith(".") ? ext : "." + ext,
  };
  saveJson(SETTINGS_PATH, settings);
  res.json({ ok: true, settings });
});

// --- Teams: full CRUD, keyed by abbv (matches the spreadsheet's Team Abbv) ---

app.get("/api/teams", (req, res) => {
  res.json(teams);
});

app.post("/api/teams", (req, res) => {
  const team = normalizeTeam(req.body || {});
  if (!team.abbv) {
    return res.status(400).json({ ok: false, error: "abbv is required (this is the team's unique key)." });
  }
  const existingIndex = teams.findIndex((t) => t.abbv === team.abbv);
  if (existingIndex === -1) teams.push(team);
  else teams[existingIndex] = team;
  saveJson(TEAMS_PATH, teams);
  res.json({ ok: true, team });
});

app.delete("/api/teams/:abbv", (req, res) => {
  const before = teams.length;
  teams = teams.filter((t) => t.abbv !== req.params.abbv);
  saveJson(TEAMS_PATH, teams);
  res.json({ ok: true, deleted: before !== teams.length });
});

// --- Conferences: same pattern, keyed by abbv ---

app.get("/api/conferences", (req, res) => {
  res.json(conferences);
});

app.post("/api/conferences", (req, res) => {
  const conf = normalizeTeam(req.body || {}); // same field shape
  if (!conf.abbv) {
    return res.status(400).json({ ok: false, error: "abbv is required (this is the conference's unique key)." });
  }
  const existingIndex = conferences.findIndex((c) => c.abbv === conf.abbv);
  if (existingIndex === -1) conferences.push(conf);
  else conferences[existingIndex] = conf;
  saveJson(CONFS_PATH, conferences);
  res.json({ ok: true, conference: conf });
});

app.delete("/api/conferences/:abbv", (req, res) => {
  const before = conferences.length;
  conferences = conferences.filter((c) => c.abbv !== req.params.abbv);
  saveJson(CONFS_PATH, conferences);
  res.json({ ok: true, deleted: before !== conferences.length });
});

// --- Game setup ---

app.get("/api/game", (req, res) => {
  res.json(loadGame());
});

app.get("/api/game/options", (req, res) => {
  res.json({ coachTitles: COACH_TITLES, crewRoles: CREW_ROLES.map(([role]) => role), crewSlots: CREW_SLOTS, officialSlots: OFFICIAL_SLOTS });
});

app.post("/api/game", (req, res) => {
  const game = normalizeGame(req.body || {});
  saveJson(GAME_PATH, game);
  res.json({ ok: true, game, broadcastStart: broadcastCountdown(game) });
});

// --- Graphics: stored state for the dashboard, keyed by exact vMix title ---

// `unsent` is computed, never stored: whether vMix is behind the working state.
const withUnsent = (g, state) => (g.unsent ? { ...state, unsent: g.unsent(state) } : state);

app.get("/api/graphics/:title", (req, res) => {
  const g = GRAPHICS[req.params.title];
  if (!g) return res.status(404).json({ ok: false, error: "Unknown graphic." });
  res.json(withUnsent(g, loadGraphic(req.params.title)));
});

app.post("/api/graphics/:title", (req, res) => {
  const g = GRAPHICS[req.params.title];
  if (!g) return res.status(404).json({ ok: false, error: "Unknown graphic." });
  const state = g.normalize(req.body || {}, loadGraphic(req.params.title));
  saveJson(graphicPath(req.params.title), state);
  res.json({ ok: true, state: withUnsent(g, state) });
});

app.post("/api/graphics/:title/send", (req, res) => {
  const g = GRAPHICS[req.params.title];
  if (!g || !g.send) return res.status(404).json({ ok: false, error: "This graphic has no send step." });
  const state = g.send(loadGraphic(req.params.title));
  saveJson(graphicPath(req.params.title), state);
  res.json({ ok: true, state: withUnsent(g, state) });
});

app.post("/api/graphics/:title/relay", (req, res) => {
  const g = GRAPHICS[req.params.title];
  if (!g || !g.relay) return res.status(404).json({ ok: false, error: "This graphic has no relay input." });
  const result = g.relay(loadGraphic(req.params.title), req.body || {});
  if (result.error) return res.status(400).json({ ok: false, error: result.error });
  saveJson(graphicPath(req.params.title), result.state);
  res.json({ ok: true, matched: result.matched, unmatched: result.unmatched });
});

// --- PrestoSports scoreboard: import list, check-now, status ---

app.get("/api/presto/scoreboard", async (req, res) => {
  try {
    const games = await fetchScoreboard(String(req.query.url || ""));
    res.json({
      ok: true,
      games: games.map((g) => ({ ...g, awayAbbv: prestoTeam(g.away).abbv, homeAbbv: prestoTeam(g.home).abbv })),
    });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.post(`/api/graphics/${SCORES_TITLE}/presto/poll`, async (req, res) => {
  const name = str((req.body || {}).preset);
  const preset = loadGraphic(SCORES_TITLE).presets.find((p) => p.name === name);
  if (!preset) return res.status(404).json({ ok: false, error: `No preset named "${name}".` });
  if (!preset.prestoUrl) return res.status(400).json({ ok: false, error: "Set and save a scoreboard URL first." });
  prestoLastPoll[name] = Date.now();
  res.json({ ok: true, status: await pollPrestoPreset(name, preset.prestoUrl) });
});

app.get(`/api/graphics/${SCORES_TITLE}/presto`, (req, res) => {
  res.json(prestoStatus);
});

// --- Football stats ---

const footballView = (state) => ({
  source: state.source,
  autoUpdate: state.autoUpdate,
  pollSeconds: state.pollSeconds,
  updatedAt: state.updatedAt,
  loadedFrom: state.loadedFrom,
  status: footballStatus,
  warnings: footballWarnings(state),
  row: footballFeed(state),
  statOptions: TEAM_STATS.map(([key, label]) => ({ key, label })),
});

app.get("/api/football", (req, res) => {
  res.json(footballView(loadFootball()));
});

// Settings only: { source, autoUpdate, pollSeconds }.
app.post("/api/football", (req, res) => {
  const prev = loadFootball();
  const state = normalizeFootball(req.body || {}, prev);
  saveJson(FOOTBALL_PATH, state);
  // A new source, or auto-update just turned on, is read on the next tick.
  if (state.source !== prev.source || (state.autoUpdate && !prev.autoUpdate)) footballLastPoll = 0;
  res.json({ ok: true, ...footballView(state) });
});

app.post("/api/football/check", async (req, res) => {
  const state = loadFootball();
  if (!state.source) return res.status(400).json({ ok: false, error: "Enter a stats URL or file path first." });
  footballLastPoll = Date.now();
  const status = await checkFootball(state.source);
  res.json({ ...footballView(loadFootball()), ok: status.ok, error: status.error });
});

// The XML itself is the request body (the dashboard's Load file button).
app.post("/api/football/xml", express.text({ type: () => true, limit: "20mb" }), (req, res) => {
  try {
    storeFootballXml(typeof req.body === "string" ? req.body : "", `Uploaded file: ${str(req.query.name) || "XML"}`);
  } catch (e) {
    return res.status(400).json({ ok: false, error: e.message });
  }
  footballStatus = { at: new Date().toISOString(), ok: true };
  res.json({ ok: true, ...footballView(loadFootball()) });
});

// Clears the loaded stats for a new game; the source settings are kept.
app.post("/api/football/clear", (req, res) => {
  const state = { ...loadFootball(), game: null, updatedAt: "", loadedFrom: "" };
  saveJson(FOOTBALL_PATH, state);
  footballStatus = null;
  res.json({ ok: true, ...footballView(state) });
});

// --- Public feeds, for vMix or any other tool to read ---

app.get("/out/teams.json", (req, res) => {
  res.json(teams.map(resolveRow));
});

app.get("/out/conferences.json", (req, res) => {
  res.json(conferences.map(resolveRow));
});

app.get("/out/game.json", (req, res) => {
  res.json(gameFeed(loadGame()));
});

app.get("/out/football.json", (req, res) => {
  res.json([footballFeed()]);
});

app.get("/out/graphics/:title.json", (req, res) => {
  const g = GRAPHICS[req.params.title];
  if (!g) return res.status(404).json({ ok: false, error: "Unknown graphic." });
  res.json(g.feed(loadGraphic(req.params.title)));
});

// A damaged data file (see loadJson) fails just that request, with the reason.
app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(500).json({ ok: false, error: err.message });
});

const PORT = Number(process.env.PORT) || 4174;
app.listen(PORT, () => {
  console.log(`Broadcast Graphics running: http://localhost:${PORT}`);
});
