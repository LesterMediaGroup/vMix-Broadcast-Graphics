// Reads a PrestoSports StatsEntry football XML (the Stat Crew layout: an
// <fbgame> with <venue>, <status>, one <team> per side holding <linescore>,
// <totals> and <player>s, then <scores>, <drives> and <plays>) into plain
// data, and builds the one-row /out/football.json feed from it.
//
// Only the finished-game file has been seen so far. A pregame file is
// assumed to have the same elements with zero or missing stats, so every
// read below defaults to 0 / "".

import { decode } from "./presto.js";

// --- A small XML reader ---
// These files are elements with attributes and no text content, so text
// between tags is ignored. Unclosed or stray closing tags are tolerated.

const TOKEN =
  /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>|<\/\s*([\w:.-]+)\s*>|<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
const ATTR = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

export function parseXml(text) {
  const root = { tag: "", attrs: {}, children: [] };
  const stack = [root];
  for (const m of text.matchAll(TOKEN)) {
    const [, close, open, attrText, selfClose] = m;
    if (close) {
      const i = stack.findLastIndex((n) => n.tag === close);
      if (i > 0) stack.length = i;
      continue;
    }
    if (!open) continue; // comment, <?xml?>, CDATA, doctype
    const attrs = {};
    for (const a of (attrText || "").matchAll(ATTR)) attrs[a[1]] = decode(a[2] ?? a[3]).trim();
    const node = { tag: open, attrs, children: [] };
    stack[stack.length - 1].children.push(node);
    if (!selfClose) stack.push(node);
  }
  return root;
}

const child = (node, tag) => (node ? node.children.find((c) => c.tag === tag) : undefined);
const childrenOf = (node, tag) => (node ? node.children.filter((c) => c.tag === tag) : []);
const attr = (node, name) => (node && node.attrs[name]) || "";

// <totals totoff_yards="472"><rush yds="239"/>... -> { totoff_yards: "472", "rush.yds": "239" }
function flatStats(node) {
  const out = {};
  if (!node) return out;
  for (const [k, v] of Object.entries(node.attrs)) out[k] = v;
  for (const c of node.children) for (const [k, v] of Object.entries(c.attrs)) out[`${c.tag}.${k}`] = v;
  return out;
}

function readTeam(node) {
  const line = child(node, "linescore");
  const player = (p) => {
    const stats = {};
    for (const c of p.children) for (const [k, v] of Object.entries(c.attrs)) stats[`${c.tag}.${k}`] = v;
    return {
      uni: attr(p, "uni"),
      name: attr(p, "name") || attr(p, "shortname"),
      pos: attr(p, "opos") || attr(p, "dpos"),
      stats,
    };
  };
  return {
    id: attr(node, "id"),
    name: attr(node, "name"),
    record: attr(node, "record"),
    confRecord: attr(node, "conf-record"),
    score: attr(line, "score") || "0",
    // Per-period scores by period number; a period with no entry yet is "".
    periods: Object.fromEntries(childrenOf(line, "lineprd").map((l) => [attr(l, "prd"), attr(l, "score")])),
    totals: flatStats(child(node, "totals")),
    players: childrenOf(node, "player").map(player),
  };
}

// The XML as stored in data/football.json and read by footballRow().
export function parseFootball(text) {
  const fb = child(parseXml(text), "fbgame");
  if (!fb) throw new Error("This isn't a football stats XML (there's no <fbgame> in it).");
  const venue = child(fb, "venue");
  const status = child(fb, "status");
  const rules = child(venue, "rules");
  const plays = child(fb, "plays");
  const dtg = child(plays, "downtogo");
  const teams = childrenOf(fb, "team");
  const side = (vh) => teams.find((t) => attr(t, "vh") === vh);
  if (!side("V") || !side("H")) throw new Error("This football XML doesn't have both a visiting (V) and a home (H) team.");
  const playCount = childrenOf(plays, "qtr").reduce((n, q) => n + childrenOf(q, "play").length, 0);
  return {
    generated: attr(fb, "generated"),
    venue: Object.fromEntries(["date", "location", "stadium", "start", "attend", "temp", "weather", "wind"].map((k) => [k, attr(venue, k)])),
    quarters: Number(attr(rules, "qtrs")) || 4,
    status: {
      complete: attr(status, "complete") === "Y",
      running: attr(status, "running") === "T",
      period: Number(attr(status, "period") || attr(dtg, "qtr")) || 0,
      clock: attr(status, "clock") || attr(dtg, "clock"),
      pregame: playCount === 0,
    },
    situation: {
      hasBall: attr(dtg, "hasball"), // "V" / "H" / ""
      down: Number(attr(dtg, "down")) || 0,
      togo: Number(attr(dtg, "togo")) || 0,
      spot: attr(dtg, "spot"), // "V37" = the visitors' 37
      vTimeouts: attr(dtg, "vtoh"),
      hTimeouts: attr(dtg, "htoh"),
      lastPlay: attr(dtg, "lastplay"),
    },
    teams: { V: readTeam(side("V")), H: readTeam(side("H")) },
    scores: childrenOf(child(fb, "scores"), "score").map((s) => ({ ...s.attrs })),
    message: attr(child(fb, "message"), "text"),
  };
}

// --- Derived values ---

const num = (stats, key) => Number(stats[key]) || 0;
const avg = (total, count) => (count ? (total / count).toFixed(1) : "0.0");
const ordinal = (n) => `${n}${{ 1: "st", 2: "nd", 3: "rd" }[n] || "th"}`;

// Team stat rows, in the order the dashboard offers them. The key becomes the
// feed field (awayTotalYards, homeThirdDown, ...) and the label is what Team
// Stats shows when a row takes its values from here.
export const TEAM_STATS = [
  ["firstDowns", "FIRST DOWNS", (t) => num(t, "firstdowns.no")],
  ["totalYards", "TOTAL YARDS", (t) => num(t, "totoff_yards")],
  ["totalPlays", "TOTAL PLAYS", (t) => num(t, "totoff_plays")],
  ["yardsPerPlay", "YARDS PER PLAY", (t) => avg(num(t, "totoff_yards"), num(t, "totoff_plays"))],
  ["rushYards", "RUSHING YARDS", (t) => num(t, "rush.yds")],
  ["rushing", "RUSHES-YARDS", (t) => `${num(t, "rush.att")}-${num(t, "rush.yds")}`],
  ["yardsPerRush", "YARDS PER RUSH", (t) => avg(num(t, "rush.yds"), num(t, "rush.att"))],
  ["passYards", "PASSING YARDS", (t) => num(t, "pass.yds")],
  ["passing", "COMP-ATT-INT", (t) => `${num(t, "pass.comp")}-${num(t, "pass.att")}-${num(t, "pass.int")}`],
  ["thirdDown", "3RD DOWN", (t) => `${num(t, "conversions.thirdconv")}-${num(t, "conversions.thirdatt")}`],
  ["fourthDown", "4TH DOWN", (t) => `${num(t, "conversions.fourthconv")}-${num(t, "conversions.fourthatt")}`],
  ["turnovers", "TURNOVERS", (t) => num(t, "fumbles.lost") + num(t, "pass.int")],
  ["penalties", "PENALTIES", (t) => `${num(t, "penalties.no")}-${num(t, "penalties.yds")}`],
  ["timeOfPossession", "TIME OF POSS.", (t) => t["misc.top"] || "0:00"],
  ["sacks", "SACKS", (t) => num(t, "defense.sacks")],
  ["redZone", "RED ZONE", (t) => `${num(t, "redzone.scores")}-${num(t, "redzone.att")}`],
  ["punting", "PUNTS-AVG", (t) => `${num(t, "punt.no")}-${t["punt.avg"] || "0.0"}`],
];

// The feed field holding a team stat for one side: ("home", "totalYards") -> "homeTotalYards".
export const statField = (side, key) => `${side}${key[0].toUpperCase()}${key.slice(1)}`;

// Leaders per side: the player with the most of `key`, among those with any
// of `has`. `line` is the one-line summary under the name.
const join = (parts) => parts.filter(Boolean).join(", ");
const LEADERS = [
  ["passing", "pass.yds", "pass.att", (s) => join([`${num(s, "pass.comp")}-${num(s, "pass.att")}`, `${num(s, "pass.yds")} YDS`, num(s, "pass.td") && `${num(s, "pass.td")} TD`, num(s, "pass.int") && `${num(s, "pass.int")} INT`])],
  ["rushing", "rush.yds", "rush.att", (s) => join([`${num(s, "rush.att")} CAR`, `${num(s, "rush.yds")} YDS`, num(s, "rush.td") && `${num(s, "rush.td")} TD`])],
  ["receiving", "rcv.yds", "rcv.no", (s) => join([`${num(s, "rcv.no")} REC`, `${num(s, "rcv.yds")} YDS`, num(s, "rcv.td") && `${num(s, "rcv.td")} TD`])],
  ["tackles", "defense.tot_tack", "defense.tot_tack", (s) => join([`${num(s, "defense.tot_tack")} TKL`, num(s, "defense.sacks") && `${num(s, "defense.sacks")} SACK`, num(s, "defense.int") && `${num(s, "defense.int")} INT`])],
];

function leader(players, key, has) {
  return players.filter((p) => num(p.stats, has) > 0).reduce((best, p) => (!best || num(p.stats, key) > num(best.stats, key) ? p : best), null);
}

// Rosters with more players than numbers share numbers, and the XML tells
// them apart with a letter ("1B", "1O"); the jersey shows just the digits.
const jersey = (uni) => uni.replace(/[A-Za-z]+$/, "");

function periodLabel(n, quarters) {
  if (n <= quarters) return ordinal(n);
  return n === quarters + 1 ? "OT" : `${n - quarters}OT`;
}

// "1st & 10", "3rd & Goal"; blank when nobody has the ball.
function downDistance(sit, toGoal) {
  if (!sit.hasBall || !sit.down) return "";
  return `${ordinal(sit.down)} & ${toGoal !== null && sit.togo >= toGoal ? "Goal" : sit.togo}`;
}

function scoreText(s) {
  const yds = s.yds ? `${s.yds} yd ` : "";
  if (s.type === "FG") return `${s.scorer} ${yds}field goal`;
  if (s.type === "SAF") return "Safety";
  if (s.type !== "TD") return [s.scorer, s.type].filter(Boolean).join(" ");
  const how = { RUSH: "run", PASS: `pass from ${s.passer}` }[s.how] || `${(s.how || "").toLowerCase()} return`;
  const kind = (s.pattype || "kick").toLowerCase();
  const pat = !s.pattype ? "" : s.patres === "GOOD" ? ` (${s.patby} ${kind})` : ` (${kind} failed)`;
  return `${s.scorer} ${yds}${how}${pat}`;
}

// One flat row. `sides` says which XML team is away and which is home
// ({ away: "V", home: "H" } unless Game setup has them the other way round),
// and `abbvOf(vh)` gives the abbv to show for an XML team.
export function footballRow(game, sides, abbvOf) {
  const row = { loaded: !!game };
  if (!game) return row;
  const { status, situation: sit, quarters } = game;
  const sideOf = (vh) => (sides.away === vh ? "away" : sides.home === vh ? "home" : "");

  // Yards to the goal line for the team with the ball; "V37" is the visitors' 37.
  const spot = /^([VH])?(\d+)$/.exec(sit.spot);
  const yardLine = spot ? Number(spot[2]) : null;
  const toGoal = spot && sit.hasBall ? (spot[1] === sit.hasBall ? 100 - yardLine : yardLine) : null;
  const ballOn = !spot ? "" : yardLine === 50 || !spot[1] ? String(yardLine) : `${abbvOf(spot[1])} ${yardLine}`;

  const period = status.period ? periodLabel(status.period, quarters) : "";
  const atZero = /^0?0:00$/.test(status.clock);
  let gameStatus = "";
  if (status.complete) gameStatus = status.period > quarters ? `FINAL/${period}` : "FINAL";
  else if (status.pregame) gameStatus = "";
  else if (atZero && status.period === quarters / 2) gameStatus = "HALFTIME";
  else if (atZero) gameStatus = `END OF ${period.toUpperCase()}`;
  else gameStatus = `${period} ${status.clock}`.trim();

  const live = !status.complete && !status.pregame;
  const last = game.scores[game.scores.length - 1];
  Object.assign(row, {
    generated: game.generated,
    pregame: status.pregame,
    final: status.complete,
    period: status.complete ? "FINAL" : period,
    periodNumber: status.period,
    clock: status.clock,
    gameStatus,
    possession: live ? sideOf(sit.hasBall) : "",
    down: live && sit.down ? sit.down : "",
    togo: live && sit.down ? sit.togo : "",
    downDistance: live ? downDistance(sit, toGoal) : "",
    ballOn: live ? ballOn : "",
    lastPlay: sit.lastPlay,
    lastScore: last ? scoreText(last) : "",
    lastScoreTeam: last ? abbvOf(last.vh) : "",
    lastScoreSide: last ? sideOf(last.vh) : "",
    message: game.message,
    venue: game.venue.stadium,
    location: game.venue.location,
    attendance: game.venue.attend,
    weather: [game.venue.temp, game.venue.weather, game.venue.wind && `Wind ${game.venue.wind}`].filter(Boolean).join(", "),
  });

  for (const [side, vh] of [["away", sides.away], ["home", sides.home]]) {
    const t = game.teams[vh];
    const extraPeriods = Object.entries(t.periods).filter(([p]) => Number(p) > quarters);
    Object.assign(row, {
      [`${side}Abbv`]: abbvOf(vh),
      [`${side}XmlName`]: t.name,
      [`${side}Score`]: t.score,
      [`${side}Record`]: t.record,
      [`${side}ConfRecord`]: t.confRecord,
      [`${side}HasBall`]: live && sit.hasBall === vh,
      [`${side}Timeouts`]: vh === "V" ? sit.vTimeouts : sit.hTimeouts,
      [`${side}OT`]: extraPeriods.length ? extraPeriods.reduce((n, [, s]) => n + (Number(s) || 0), 0) : "",
    });
    for (let q = 1; q <= quarters; q++) row[`${side}Q${q}`] = t.periods[q] ?? "";
    for (const [key, , fn] of TEAM_STATS) row[statField(side, key)] = fn(t.totals);
    for (const [kind, key, has, line] of LEADERS) {
      const p = leader(t.players, key, has);
      const K = statField(side, kind);
      const [first, ...rest] = p ? p.name.split(/\s+/) : [""];
      Object.assign(row, {
        [`${K}Name`]: p ? p.name : "",
        [`${K}First`]: first,
        [`${K}Last`]: rest.join(" "),
        [`${K}Number`]: p ? jersey(p.uni) : "",
        [`${K}Pos`]: p ? p.pos : "",
        [`${K}Line`]: p ? line(p.stats) : "",
      });
    }
  }
  return row;
}
