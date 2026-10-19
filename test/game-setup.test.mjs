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

const dom = await JSDOM.fromURL(BASE, {
  runScripts: "dangerously",
  resources: "usable",
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(window) {
    window.fetch = (u, o) => fetch(new URL(u, BASE), o);
    window.confirm = () => true;
    window.alert = () => {};
  },
});
const { window } = dom;
const doc = window.document;
const $ = (sel) => doc.querySelector(sel);
const $$ = (sel) => [...doc.querySelectorAll(sel)];
const type = (el, value) => {
  el.value = value;
  el.dispatchEvent(new window.Event("input", { bubbles: true }));
};
const choose = (el, value) => {
  el.value = value;
  el.dispatchEvent(new window.Event("change", { bubbles: true }));
};
const feed = async () => (await (await fetch(BASE + "out/game.json")).json())[0];

await sleep(2500); // scripts load + appReady + /api/game

$('.tab[data-tab="game"]').click();
check("Game setup tab shows its panel", $("#gamePanel").style.display === "" && $("#teamsPanel").style.display === "none");
check("Away and home cards rendered", $$(".game-side[data-side] .team-input").length === 2);
check("Crew and officials cards rendered", $$(".game-people").length === 2);

// Game details
type($('[data-g="sport"]'), "Men's Basketball");
type($('[data-g="venue"]'), "Harbor Fieldhouse");
type($('[data-g="series"]'), "HSU leads 24-18");
$("#gameConference").checked = true;
$("#gameConference").dispatchEvent(new window.Event("change"));

// Teams
const away = $('.game-side[data-side="away"]');
const home = $('.game-side[data-side="home"]');
type(away.querySelector(".team-input"), "Brookfield");
type(home.querySelector(".team-input"), "Bayport");
check("Away details show mascot after picking team", away.querySelector(".side-details").textContent.includes("Ravens"));
check("Away card stripe uses team color", away.style.getPropertyValue("--team-color") === "#272727");
type(away.querySelector('[data-f="record"]'), "3-1");
type(away.querySelector('[data-f="coach"]'), "Coach A");
const titleSel = away.querySelector('select[data-f="coachTitle"]');
check("Coach title dropdown has 4 titles, defaults to Head Coach", titleSel.options.length === 4 && titleSel.value === "Head Coach", [...titleSel.options].map((o) => o.value).join(", "));
choose(titleSel, "Interim Head Coach");
type(away.querySelector('[data-f="coachRecord"]'), "120-85");
type(away.querySelector('[data-f="coachConfRecord"]'), "60-40");
type(away.querySelector('[data-f="coachSeason"]'), "3");
const secColor = away.querySelector('input[data-pick="colorKey"][value="secondaryColor"]');
secColor.checked = true;
secColor.dispatchEvent(new window.Event("change"));
check("Color pick re-renders as checked", away.querySelector('input[data-pick="colorKey"][value="secondaryColor"]').checked);
type(home.querySelector(".team-input"), "Nowhere State");
check("Unknown team flagged in warnings", $("#gameWarnings").textContent.includes("Nowhere State"));
type(home.querySelector(".team-input"), "Bayport");
check("Warning clears once team matches", $("#gameWarnings").textContent === "");

// Crew
const crew = $('.game-people[data-list="crew"]');
check("Crew empty to start", crew.querySelectorAll(".people-row").length === 0);
crew.querySelector(".add-btn").click();
const firstSelect = crew.querySelector(".people-row select");
check("Crew role is a dropdown with 25 roles + placeholder", firstSelect && firstSelect.options.length === 26, `${firstSelect && firstSelect.options.length} options`);
choose(firstSelect, "Play by Play");
type(crew.querySelector('.people-row input[data-p="name"]'), "Sam Rivera");
$("#crewAllBtn").click();
const rows = crew.querySelectorAll(".people-row");
check("+ All roles fills to 25 rows without duplicating Play by Play", rows.length === 25, `${rows.length} rows`);
check("+ Add and + All roles disabled at 25", crew.querySelector(".add-btn").disabled && $("#crewAllBtn").disabled);
const analystRow = [...rows].find((r) => r.querySelector("select").value === "Analyst");
type(analystRow.querySelector('input[data-p="name"]'), "Sam Smith");
crew.querySelector(".people-row:last-child .remove-btn").click();
check("Remove deletes a row", crew.querySelectorAll(".people-row").length === 24);

// Officials
const offs = $('.game-people[data-list="officials"]');
offs.querySelector(".add-btn").click();
type(offs.querySelector('input[data-p="role"]'), "Referee");
type(offs.querySelector('input[data-p="name"]'), "Ref One");
check("Official role is free text with datalist", offs.querySelector('input[data-p="role"]').getAttribute("list") === "officialRoles");

check("Status shows Saving while debounced", $("#gameStatus").textContent.includes("Saving"));
await sleep(1500);
check("Status shows Saved after autosave", $("#gameStatus").textContent.includes("Saved"), $("#gameStatus").textContent);

let f = await feed();
check("Feed: matchup", f.matchup === "Brookfield at Bayport", f.matchup);
check("Feed: away secondary color", f.awayColor === "#a32638", f.awayColor);
check("Feed: record/coach", f.awayRecord === "3-1" && f.awayCoach === "Coach A");
check("Feed: coach title/records/season", f.awayCoachTitle === "Interim Head Coach" && f.awayCoachRecord === "120-85" && f.awayCoachConfRecord === "60-40" && f.awayCoachSeason === "3" && f.awayCoachSeasonLabel === "3rd Season", `${f.awayCoachTitle} ${f.awayCoachSeasonLabel}`);
check("Feed: no title when no coach", f.homeCoachTitle === "");
check("Feed: conferenceGame/series/venue", f.conferenceGame === true && f.series === "HSU leads 24-18" && f.venue === "Harbor Fieldhouse");
check("Feed: crewPlayByPlay", f.crewPlayByPlay === "Sam Rivera");
check("Feed: crewAnalyst", f.crewAnalyst === "Sam Smith");
check("Feed: crew slots packed (1 = PBP, 2 = Analyst)", f.crew1Role === "Play by Play" && f.crew2Name === "Sam Smith");
check("Feed: officials", f.official1Name === "Ref One" && f.officialLine === "Referee: Ref One");

// Swap
$("#gameSwapBtn").click();
check("Swap moves Bayport to away in the UI", away.querySelector(".team-input").value === "Bayport");
await sleep(1200);
f = await feed();
check("Feed after swap", f.matchup === "Bayport at Brookfield" && f.homeCoach === "Coach A" && f.homeCoachTitle === "Interim Head Coach", f.matchup);
check("Swap moves coach title in the UI", home.querySelector('select[data-f="coachTitle"]').value === "Interim Head Coach");

// Reload keeps state
const before = JSON.stringify(await (await fetch(BASE + "api/game")).json());

// New game
$("#gameNewBtn").click();
await sleep(1200);
const g = await (await fetch(BASE + "api/game")).json();
check("New game clears teams, details and officials", !g.away.teamAbbv && !g.home.teamAbbv && !g.series && !g.venue && g.officials.length === 0 && g.conferenceGame === false);
check("New game keeps sport and crew", g.sport === "Men's Basketball" && g.crew.length === 24 && g.crew[0].name === "Sam Rivera");
check("UI cleared too", away.querySelector(".team-input").value === "" && $('[data-g="venue"]').value === "");

check("No script errors", errors.length === 0, errors.join(" | "));
console.log(`\n${pass} passed, ${fail} failed`);
window.close();
process.exit(fail ? 1 : 0);
