// Reads a PrestoSports scoreboard page (e.g.
// https://example.prestosports.com/sports/msoc/scoreboard) into plain games.
// The page is server-rendered, so no browser is needed. Each game is a
// `card ... event-row ... event-box` block; its class list says upcoming /
// result (final) / otherwise in progress, `.cal-status` holds the status text
// ("7:00 PM", "Final", ...), and the two `.team-name` entries are away then
// home (the home one is prefixed "at"). Live-game markup hasn't been seen yet
// (only upcoming/final), so the live branch is a best guess.

import { execFile } from "child_process";

const USER_AGENT ="Mozilla/5.0 (Windows NT 10.0; Win64; x64) Broadcast-Graphics";

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decode(text) {
  return text.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => {
    if (e[0] === "#") return String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const textOf = (html) => decode(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();

// Presto adds a state to many names ("Brookfield (KS)", "Harbor State (OH)");
// the Teams table doesn't, so drop a trailing parenthetical before matching.
export const baseTeamName = (name) => name.replace(/\s*\([^)]*\)\s*$/, "").trim();

// Live status wording hasn't been seen yet; if the status holds a game clock,
// split it off into `time` and keep the rest as `period`.
function splitStatus(status, state) {
  if (state !== "live") return { period: status, time: "" };
  const clock = status.match(/\b\d{1,2}:\d{2}\b/);
  if (!clock) return { period: status, time: "" };
  const period = status.replace(clock[0], "").replace(/^[\s\-–|,]+|[\s\-–|,]+$/g, "").replace(/\s{2,}/g, " ");
  return { period, time: clock[0] };
}

export function parseScoreboard(html) {
  const games = [];
  const blocks = html.split(/(?=<div class="card w-100 event-row)/).slice(1);
  for (const block of blocks) {
    const classes = (block.match(/^<div class="([^"]*)"/) || [])[1] || "";
    const names = [...block.matchAll(/class="team-name" title="([^"]*)"/g)].map((m) => decode(m[1]).trim());
    if (names.length !== 2) continue;
    const scores = [...block.matchAll(/class="event-result[^"]*">([\s\S]*?)<\/div>/g)].map((m) => textOf(m[1]));
    const status = textOf((block.match(/class="cal-status[^"]*">([\s\S]*?)<\/div>/) || [])[1] || "");
    // TBA games carry no "upcoming" class, so treat any unscored game as upcoming.
    const state = /\bresult\b/.test(classes)
      ? "final"
      : /\bupcoming\b/.test(classes) || !scores.some(Boolean)
        ? "upcoming"
        : "live";
    const { period, time } = splitStatus(status, state);
    games.push({
      away: names[0],
      home: names[1],
      awayScore: scores[0] || "",
      homeScore: scores[1] || "",
      status,
      period,
      time,
      state,
      conference: /\bconf\b/.test(classes),
    });
  }
  return games;
}

// Cloudflare in front of example.prestosports.com answers Node's own HTTP
// clients with 403 whatever the headers, but lets curl through, so fetch with
// curl (built into Windows 10+) and fall back to Node only if it's missing.
function curlGet(url) {
  return new Promise((resolve, reject) => {
    const args = ["-sSL", "--compressed", "--max-time", "20", "-A", USER_AGENT, "-w", "\n%{http_code}", url];
    execFile(process.platform === "win32" ? "curl.exe" : "curl", args, { maxBuffer: 20 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(Object.assign(new Error(stderr.trim() || err.message), { code: err.code }));
      const cut = stdout.lastIndexOf("\n");
      resolve({ status: Number(stdout.slice(cut + 1)), body: stdout.slice(0, cut) });
    });
  });
}

async function nodeGet(url) {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(20000) });
  return { status: res.status, body: await res.text() };
}

export async function fetchScoreboard(url) {
  const parsed = new URL(url);
  if (!/^https?:$/.test(parsed.protocol)) throw new Error("Scoreboard URL must start with http:// or https://");
  let res;
  try {
    res = await curlGet(parsed.href);
  } catch (e) {
    if (e.code !== "ENOENT") throw new Error(`Couldn't reach the scoreboard: ${e.message}`);
    res = await nodeGet(parsed.href);
  }
  if (res.status !== 200) throw new Error(`Scoreboard returned HTTP ${res.status}`);
  return parseScoreboard(res.body);
}
