import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { JSDOM, VirtualConsole } from "jsdom";

const BASE = process.env.BASE;
const here = path.dirname(fileURLToPath(import.meta.url));
const FINAL_XML = path.join(here, "fixtures", "Football-final.xml");
const PREGAME_XML = path.join(here, "fixtures", "football-pregame-sample.xml");
const finalXml = fs.readFileSync(FINAL_XML, "utf8");

let pass = 0, fail = 0;
const check = (label, ok, extra = "") => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? "  — " + extra : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const post = (p, body) => fetch(BASE + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const upload = (xml, name = "game.xml") =>
  fetch(BASE + `api/football/xml?name=${name}`, { method: "POST", headers: { "Content-Type": "text/xml" }, body: xml });
const feed = async () => (await (await fetch(BASE + "out/football.json")).json())[0];
const view = async () => (await fetch(BASE + "api/football")).json();
const statsFeed = async () => (await (await fetch(BASE + "out/graphics/SSN_9120_v1.json")).json())[0];

// --- Nothing loaded ---
let f = await feed();
check("Empty feed is one row, loaded false", f.loaded === false);

// --- Pregame (hand-made sample) ---
let res = await upload(fs.readFileSync(PREGAME_XML, "utf8"), "pregame.xml");
check("Pregame XML loads", res.ok, String(res.status));
f = await feed();
check("Pregame: loaded, pregame, no status text", f.loaded && f.pregame && !f.final && f.gameStatus === "", f.gameStatus);
check("Pregame: scores 0, stats 0, blank leaders", f.awayScore === "0" && f.homeScore === "0" && f.awayTotalYards === 0 && f.homePassing === "0-0-0" && f.awayPassingName === "");
check("Pregame: no down & distance", f.downDistance === "" && f.ballOn === "" && f.possession === "");
check("Pregame: timeouts", f.awayTimeouts === "3" && f.homeTimeouts === "3");
let v = await view();
check("Warns XML teams aren't in Teams", v.warnings.length === 2 && v.warnings[0].includes("William Penn (IA)"), v.warnings.join(" | "));
check("Unmatched teams go out by XML id", f.awayAbbv === "WPU" && f.homeAbbv === "CSC");

// --- Final, with both teams in Teams and Game setup ---
await post("api/teams", { abbv: "WP", name: "William Penn", nameUppercase: "WILLIAM PENN", mascot: "Statesmen", primaryColor: "#00205B" });
await post("api/teams", { abbv: "CSC", name: "Culver-Stockton", nameUppercase: "CULVER-STOCKTON", mascot: "Wildcats", primaryColor: "#002D72" });
await post("api/game", { away: { teamAbbv: "WP" }, home: { teamAbbv: "CSC" } });
res = await upload(finalXml, "Football-final.xml");
check("Final XML loads", res.ok);
v = await view();
check("No warnings once teams match", v.warnings.length === 0, v.warnings.join(" | "));
check("Loaded-from shows the file name", v.loadedFrom === "Uploaded file: Football-final.xml", v.loadedFrom);
f = await feed();
check("Team matched by name without the state", f.awayAbbv === "WP" && f.homeAbbv === "CSC", `${f.awayAbbv} ${f.homeAbbv}`);
check("Final status", f.final && f.period === "FINAL" && f.gameStatus === "FINAL");
check("Score + linescore", f.awayScore === "28" && f.homeScore === "29" && f.awayQ2 === "14" && f.homeQ3 === "13" && f.awayOT === "");
check("Team totals", f.awayTotalYards === 472 && f.homeTotalYards === 462 && f.awayFirstDowns === 21 && f.awayRushing === "33-239");
check("Passing / downs / penalties", f.awayPassing === "16-27-3" && f.homeThirdDown === "3-15" && f.homeFourthDown === "1-3" && f.homePenalties === "7-62");
check("Turnovers = fumbles lost + INTs", f.awayTurnovers === 4 && f.homeTurnovers === 0);
check("Time of possession, red zone, punting", f.awayTimeOfPossession === "28:09" && f.homeRedZone === "5-8" && f.awayPunting === "3-40.3");
check("Averages", f.awayYardsPerPlay === "7.9" && f.awayYardsPerRush === "7.2");
check("Passing leader", f.awayPassingName === "Christian Benning" && f.awayPassingNumber === "1" && f.awayPassingLine === "10-15, 123 YDS, 1 INT", f.awayPassingLine);
check("Rushing leader", f.homeRushingName === "Peyton Hill" && f.homeRushingLine === "17 CAR, 140 YDS" && f.awayRushingLast === "Carey Jr.");
check("Receiving / tackles leaders", f.awayReceivingName === "Kendrick Canon" && f.awayReceivingLine === "5 REC, 100 YDS" && f.awayTacklesLine === "9 TKL");
check("Last score", f.lastScore === "Liam Thornton 11 yd run (Diego Lopez kick)" && f.lastScoreTeam === "CSC" && f.lastScoreSide === "home", f.lastScore);
check("No down & distance after the game", f.downDistance === "" && f.possession === "");
check("Venue fields", f.venue === "Poulton Srtadium" && f.attendance === "1171");

// Same two teams reversed in Game setup: the sides follow Game setup.
await post("api/game", { away: { teamAbbv: "CSC" }, home: { teamAbbv: "WP" } });
f = await feed();
check("Sides follow Game setup when reversed", f.awayAbbv === "CSC" && f.awayScore === "29" && f.homeScore === "28" && f.homeTotalYards === 472);
await post("api/game", { away: { teamAbbv: "WP" }, home: { teamAbbv: "CSC" } });

// --- A game in progress (the final file, edited) ---
const live = finalXml
  .replace('complete="Y" running="F" period="4"', 'complete="N" running="T" period="4"')
  .replace(/<downtogo [^>]*>/, '<downtogo hasball="H" id="" down="3" togo="7" spot="V5" context="H,3,7,V05" qtr="4" clock="05:32" vtoh="2" htoh="1" lastplay="Liam Thornton rush for 4 yards.">');
await upload(live);
f = await feed();
check("Live: quarter + clock", f.gameStatus === "4th 05:32" && f.period === "4th" && f.clock === "05:32", f.gameStatus);
check("Live: goal to go + ball on", f.downDistance === "3rd & Goal" && f.ballOn === "WP 5", `${f.downDistance} / ${f.ballOn}`);
check("Live: possession", f.possession === "home" && f.homeHasBall === true && f.awayHasBall === false);
await upload(live.replace('spot="V5"', 'spot="H40"'));
f = await feed();
check("Live: own territory", f.downDistance === "3rd & 7" && f.ballOn === "CSC 40", `${f.downDistance} / ${f.ballOn}`);
await upload(live.replace('period="4"', 'period="2"').replace(/qtr="4" clock="05:32"/, 'qtr="2" clock="00:00"'));
check("Halftime", (await feed()).gameStatus === "HALFTIME");
await upload(live.replace('period="4"', 'period="5"').replace('complete="N"', 'complete="Y"').replace("</linescore>", '<lineprd prd="5" score="6"></lineprd></linescore>'));
f = await feed();
check("Overtime final", f.gameStatus === "FINAL/OT" && f.awayOT === 6, `${f.gameStatus} ${f.awayOT}`);

// --- Team Stats rows from football ---
await upload(finalXml);
await post("api/graphics/SSN_9120_v1", {
  scoreSource: "football",
  hScore: "1",
  rows: [{ source: "totalYards" }, { source: "passing", label: "PASSING" }, { label: "TYPED", home: "5", away: "6" }],
});
let s = await statsFeed();
check("Team Stats: scores from football (home = left)", s.hScore === "29" && s.vScore === "28", `${s.hScore} ${s.vScore}`);
check("Team Stats: label defaults to the stat's", s.label1 === "TOTAL YARDS" && s.hStat1 === "462" && s.vStat1 === "472");
check("Team Stats: typed label kept", s.label2 === "PASSING" && s.hStat2 === "20-32-0" && s.vStat2 === "16-27-3");
check("Team Stats: typed rows unchanged", s.label3 === "TYPED" && s.hStat3 === "5" && s.vStat3 === "6");
check("Team Stats: bad source dropped", (await (await post("api/graphics/SSN_9120_v1", { rows: [{ source: "nope" }] })).json()).state.rows[0].source === "");

// --- Reading from a file path ---
res = await post("api/football", { source: path.join(here, "fixtures", "missing.xml"), autoUpdate: false, pollSeconds: 5 });
check("Settings save", res.ok);
let c = await (await post("api/football/check", {})).json();
check("Missing file reported", c.ok === false && c.error.startsWith("No file at"), c.error);
await post("api/football/clear", {});
await post("api/football", { source: FINAL_XML, autoUpdate: true, pollSeconds: 5 });
await sleep(1500);
v = await view();
check("Auto-update reads the file", v.row.loaded && v.row.awayScore === "28" && v.status && v.status.ok && v.loadedFrom === FINAL_XML, JSON.stringify(v.status));
check("Settings kept", v.source === FINAL_XML && v.autoUpdate === true && v.pollSeconds === 5);
await post("api/football", { source: FINAL_XML, autoUpdate: false, pollSeconds: 5 });
check("Settings save keeps the stats", (await view()).row.loaded);

// --- Bad input ---
res = await upload("<html><body>Just a moment...</body></html>");
check("Non-football file rejected", res.status === 400 && (await res.json()).error.includes("<fbgame>"));
check("Rejected file doesn't replace the stats", (await feed()).awayScore === "28");

// --- Dashboard ---
const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => errors.push("jsdomError: " + e.message));
vc.on("error", (...a) => errors.push("console.error: " + a.join(" ")));
const dom = await JSDOM.fromURL(BASE, {
  runScripts: "dangerously", resources: "usable", pretendToBeVisual: true, virtualConsole: vc,
  beforeParse(w) { w.fetch = (u, o) => fetch(new URL(u, BASE), o); w.confirm = () => true; },
});
const { window } = dom;
const doc = window.document;
const $ = (sel) => doc.querySelector(sel);
await sleep(2500);

$('.tab[data-tab="football"]').click();
await sleep(300);
check("Football tab visible", $("#footballPanel").style.display === "");
check("Settings shown", $("#footballSource").value === FINAL_XML && $("#footballPollSeconds").value === "5" && !$("#footballAutoUpdate").checked);
const summary = $("#footballSummary").textContent;
check("Summary shows score, stats and leaders", summary.includes("472") && summary.includes("Christian Benning") && summary.includes("FINAL"), summary.slice(0, 120));

$('.tab[data-tab="stats"]').click();
await sleep(300);
const sel = $('#statsTable tr[data-i="0"] select[data-f="source"]');
check("Team Stats rows offer football stats", sel && [...sel.options].some((o) => o.value === "totalYards"));
sel.value = "totalYards";
sel.dispatchEvent(new window.Event("change", { bubbles: true }));
await sleep(1500);
s = await statsFeed();
check("Picking a football stat fills the feed", s.label1 === "TOTAL YARDS" && s.hStat1 === "462", `${s.label1} ${s.hStat1}`);
const homeInput = $('#statsTable tr[data-i="0"] [data-f="home"]');
check("Football-filled values are read-only and shown", homeInput.disabled && homeInput.value === "462", homeInput.value);

$('.tab[data-tab="football"]').click();
$("#footballClearBtn").click();
await sleep(500);
check("Clear stats", (await feed()).loaded === false && $("#footballSummary").textContent.includes("No stats loaded"));
check("Team Stats football values go blank", (await statsFeed()).hStat1 === "");

check("No browser errors", errors.length === 0, errors.join(" | "));
window.close();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
