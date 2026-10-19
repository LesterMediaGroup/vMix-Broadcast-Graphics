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
const feed = async () => (await (await fetch(BASE + "out/graphics/SSN_9120_v1.json")).json())[0];

await post("api/game", { away: { teamAbbv: "BC" }, home: { teamAbbv: "BU" } });

const dom = await JSDOM.fromURL(BASE, {
  runScripts: "dangerously", resources: "usable", pretendToBeVisual: true, virtualConsole: vc,
  beforeParse(w) { w.fetch = (u, o) => fetch(new URL(u, BASE), o); w.confirm = () => true; },
});
const { window } = dom;
const doc = window.document;
const $ = (s) => doc.querySelector(s);
const type = (el, v) => { el.value = v; el.dispatchEvent(new window.Event("input", { bubbles: true })); };
const choose = (el, v) => { el.value = v; el.dispatchEvent(new window.Event("change", { bubbles: true })); };
await sleep(2500);

$('.tab[data-tab="stats"]').click();
await sleep(500);
check("Stats tab visible", $("#statsPanel").style.display === "");
check("Columns: home left, away right", $('th[data-side="home"]').textContent === "Home — BAYPORT" && $('th[data-side="away"]').textContent === "Away — BROOKFIELD", $('th[data-side="home"]').textContent);
check("5 stat rows + score row", doc.querySelectorAll("#statsTable tr[data-i]").length === 5 && !!$('[data-score="hScore"]'));
check("Center logo options include conference", [...$("#statsCenterLogo").options].map((o) => o.value).join(",") === "home,away,PVAC,none");

type($('[data-score="hScore"]'), "41");
type($('[data-score="vScore"]'), "38");
const rows = [...doc.querySelectorAll("#statsTable tr[data-i]")];
const fill = (i, home, label, away) => {
  type(rows[i].querySelector('[data-f="home"]'), home);
  type(rows[i].querySelector('[data-f="label"]'), label);
  type(rows[i].querySelector('[data-f="away"]'), away);
};
fill(0, "45.2%", "fg%", "38.9%");
fill(1, "22", "REBOUNDS", "17");
fill(4, "6", "TURNOVERS", "11");
type(rows[2].querySelector('[data-f="home"]'), "9");
check("Warns about numbers without a label", $("#statsWarnings").textContent.includes("Row 3"), $("#statsWarnings").textContent);
type($("#statsSubHeader"), "HALFTIME");
await sleep(1500);
check("Saved", $("#statsStatus").textContent.includes("Saved"));

let f = await feed();
check("Feed: header/subHeader", f.header === "TEAM STATS" && f.subHeader === "HALFTIME");
check("Feed: schools + mascots", f.hSchool === "BAYPORT" && f.vSchool === "BROOKFIELD" && f.hName === "Wildcats" && f.vName === "Ravens");
check("Feed: scores", f.hScore === "41" && f.vScore === "38");
check("Feed: row 1 (label uppercased)", f.label1 === "FG%" && f.hStat1 === "45.2%" && f.vStat1 === "38.9%");
check("Feed: row 5", f.label5 === "TURNOVERS" && f.hStat5 === "6" && f.vStat5 === "11");
check("Feed: colors + logos", f.hColor === "#F4761D" && f.vColor === "#272727" && f.vLogo.includes("Raven Mascot") && f.centerLogo === f.hLogo);

choose($("#statsCenterLogo"), "PVAC");
await sleep(1500);
f = await feed();
check("Center logo = conference", f.centerLogo.includes("PRAIRIE_VALLEY"), f.centerLogo);
choose($("#statsCenterLogo"), "none");
await sleep(1500);
check("Center logo none", (await feed()).centerLogo === "");

doc.querySelector('#statsTable tr[data-i="4"] .up-btn').click();
await sleep(1500);
f = await feed();
check("Move up swaps rows 4/5", f.label4 === "TURNOVERS" && f.label5 === "");
doc.querySelector('#statsTable tr[data-i="0"] .clear-btn').click();
await sleep(1500);
f = await feed();
check("Clear row", f.label1 === "" && f.hStat1 === "");

await post("api/game", { away: { teamAbbv: "CMU" }, home: { teamAbbv: "BU" } });
$('.tab[data-tab="game"]').click();
$('.tab[data-tab="stats"]').click();
await sleep(800);
check("Reopening tab picks up new Game setup team", $('th[data-side="away"]').textContent === "Away — CEDAR MILL");

check("No script errors", errors.length === 0, errors.join(" | "));
console.log(`\n${pass} passed, ${fail} failed`);
window.close();
process.exit(fail ? 1 : 0);
