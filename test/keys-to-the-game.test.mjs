import { JSDOM, VirtualConsole } from "jsdom";

const BASE = process.env.BASE;
const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => errors.push("jsdomError: " + e.message));
vc.on("error", (...a) => errors.push("console.error: " + a.join(" ")));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (label, ok, extra = "") => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? "  — " + extra : ""}`);
};
const post = (p, body) => fetch(BASE + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const feed = async () => (await (await fetch(BASE + "out/graphics/SSN_5006_v01.json")).json())[0];

// Game setup: Brookfield (secondary color) at Bayport
await post("api/game", { away: { teamAbbv: "BC", colorKey: "secondaryColor" }, home: { teamAbbv: "BU" } });

const dom = await JSDOM.fromURL(BASE, {
  runScripts: "dangerously", resources: "usable", pretendToBeVisual: true, virtualConsole: vc,
  beforeParse(w) { w.fetch = (u, o) => fetch(new URL(u, BASE), o); w.confirm = () => true; },
});
const { window } = dom;
const doc = window.document;
const $ = (s) => doc.querySelector(s);
const type = (el, v) => { el.value = v; el.dispatchEvent(new window.Event("input", { bubbles: true })); };
await sleep(2500);

$('.tab[data-tab="keys"]').click();
await sleep(500);
check("Keys tab visible", $("#keysPanel").style.display === "");
check("Game setup still renders only its own 2 team cards", doc.querySelectorAll("#gamePanel .game-side[data-side]").length === 2 && $('#keysPanel .keys-side[data-side="away"] .team-input') === null);
const away = $('.keys-side[data-side="away"]'), home = $('.keys-side[data-side="home"]');
check("Cards titled from Game setup", away.querySelector("h3").textContent === "Away — Brookfield" && home.querySelector("h3").textContent === "Home — Bayport", away.querySelector("h3").textContent);
check("Home is in feed by default", home.classList.contains("on-air") && home.querySelector(".on-air-badge").textContent.includes("IN FEED"));
check("Side dropdown shows team names", [...$("#keysSide").options].map((o) => o.textContent).join(" | ") === "Away — Brookfield | Home — Bayport");
check("SubHeader placeholder is auto team name", $("#keysSubHeader").placeholder === "BAYPORT (auto)", $("#keysSubHeader").placeholder);
check("3 keys per side", away.querySelectorAll(".key-row").length === 3 && home.querySelectorAll(".key-row").length === 3);

const fill = (card, i, topic, stat) => {
  const row = card.querySelectorAll(".key-row")[i];
  type(row.querySelector('[data-k="topic"]'), topic);
  type(row.querySelector('[data-k="stat"]'), stat);
};
fill(home, 0, "WIN THE GLASS", "Outrebounding opponents by 8.2 per game");
fill(home, 2, "HOT FROM THREE", "38.5% from deep");
fill(away, 0, "PROTECT THE BALL", "Only 11 turnovers per game");
await sleep(1500);
check("Saved", $("#keysStatus").textContent.includes("Saved"), $("#keysStatus").textContent);

let f = await feed();
check("Feed: header default", f.header === "KEYS TO THE GAME");
check("Feed: subHeader auto = home uppercase", f.subHeader === "BAYPORT");
check("Feed: home keys", f.topic1 === "WIN THE GLASS" && f.stat1 === "Outrebounding opponents by 8.2 per game" && f.topic2 === "" && f.topic3 === "HOT FROM THREE");
check("Feed: both teams", f.vName === "Brookfield" && f.vMascot === "Ravens" && f.hName === "Bayport" && f.hMascot === "Wildcats");
check("Feed: away color uses Game setup pick", f.vColor === "#a32638", f.vColor);
check("Feed: logos present", f.vLogo.endsWith(".png") && f.hLogo.endsWith(".png"));
check("Feed: keysTeam = home", f.keysTeamName === "Bayport" && f.keysTeamColor === f.hColor);

away.querySelector(".air-btn").click(); // switches immediately (no debounce)
await sleep(800);
f = await feed();
check("Use these keys → away keys in feed", f.side === "away" && f.topic1 === "PROTECT THE BALL" && f.topic3 === "" && f.subHeader === "BROOKFIELD", `${f.side} ${f.topic1}`);
check("UI marks away as in feed", away.classList.contains("on-air") && !home.classList.contains("on-air") && $("#keysSide").value === "away");
check("Home keys kept while away is live", (await (await fetch(BASE + "api/graphics/SSN_5006_v01")).json()).keys.home[0].topic === "WIN THE GLASS");

type($("#keysSubHeader"), "HSU vs. BC");
type($("#keysHeader"), "3 KEYS");
await sleep(1500);
f = await feed();
check("Typed header/subHeader override", f.header === "3 KEYS" && f.subHeader === "HSU vs. BC");

away.querySelector(".clear-btn").click();
await sleep(1500);
f = await feed();
check("Clear empties that side", f.topic1 === "" && f.stat1 === "");

// Game setup change flows in when the tab is reopened
await post("api/game", { away: { teamAbbv: "CMU" }, home: { teamAbbv: "BU" } });
$('.tab[data-tab="game"]').click();
$('.tab[data-tab="keys"]').click();
await sleep(800);
check("Reopening tab picks up new Game setup team", away.querySelector("h3").textContent === "Away — Cedar Mill", away.querySelector("h3").textContent);
await post("api/game", {});
$('.tab[data-tab="keys"]').click();
await sleep(800);
check("Warns when the keys side has no team", $("#keysWarnings").textContent.includes("No away team"), $("#keysWarnings").textContent);

check("No script errors", errors.length === 0, errors.join(" | "));
console.log(`\n${pass} passed, ${fail} failed`);
window.close();
process.exit(fail ? 1 : 0);
