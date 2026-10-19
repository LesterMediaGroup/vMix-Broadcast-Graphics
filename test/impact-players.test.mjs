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
const api = async (p, body) =>
  (await fetch(BASE + p, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {})).json();

await api("api/game", { sport: "Women's Volleyball" });

const dom = await JSDOM.fromURL(BASE, {
  runScripts: "dangerously",
  resources: "usable",
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(window) {
    window.fetch = (u, o) => fetch(new URL(u, BASE), o);
    window.confirm = () => true;
  },
});
const { window } = dom;
const doc = window.document;
const $ = (s) => doc.querySelector(s);
const type = (el, v) => {
  el.value = v;
  el.dispatchEvent(new window.Event("input", { bubbles: true }));
};
const feed = () => fetch(BASE + "out/graphics/SSN_9048_v3.json").then((r) => r.json());
await sleep(2500);

$('.tab[data-tab="impact"]').click();
check("Impact tab visible", $("#impactPanel").style.display === "");
const rows = [...doc.querySelectorAll("#impactTable tr[data-i]")];
check("4 player rows", rows.length === 4);
check("Title defaults to IMPACT PLAYERS", $("#impactTitle").value === "IMPACT PLAYERS");

const r0 = rows[0];
type(r0.querySelector(".team-input"), "Brookfield");
type(r0.querySelector('[data-f="pos"]'), "oh");
type(r0.querySelector('[data-f="number"]'), "12");
type(r0.querySelector('[data-f="first"]'), "Jane");
type(r0.querySelector('[data-f="last"]'), "Doe");
const sec = r0.querySelector('input[type=radio][value="secondaryColor"]');
sec.checked = true;
sec.dispatchEvent(new window.Event("change"));
type(rows[1].querySelector(".team-input"), "Bayport");
type(rows[1].querySelector('[data-f="number"]'), "4");
type(rows[1].querySelector('[data-f="headshot"]'), "D:\\Shots\\custom.png");
type(rows[2].querySelector(".team-input"), "Nope U");
check("Unknown team warned", $("#impactWarnings").textContent.includes("Nope U"));
await sleep(1500);
check("Saved status", $("#impactStatus").textContent.includes("Saved"), $("#impactStatus").textContent);
check("Headshot-folder warning shown (folder unset)", $("#impactWarnings").textContent.includes("Headshots folder"), $("#impactWarnings").textContent);
check("Sport placeholder from Game setup", $("#impactSport").placeholder.includes("Women's Volleyball"), $("#impactSport").placeholder);

let f = await feed();
check("Feed has 4 rows", f.length === 4);
check("P1 text fields", f[0].pos === "OH" && f[0].number === "12" && f[0].first === "Jane" && f[0].last === "Doe", JSON.stringify([f[0].pos, f[0].first]));
check("P1 color = secondary", f[0].color === "#a32638", f[0].color);
check("P1 logo resolved", f[0].logo.includes("Raven Mascot.png"));
check("P1 headshot blank without folder", f[0].headshot === "");
check("P2 override headshot", f[1].headshot === "D:\\Shots\\custom.png", f[1].headshot);
check("Sport falls back to Game setup", f[0].sport === "Women's Volleyball");

// Set the headshot folder through the Settings modal
$("#settingsBtn").click();
await sleep(300);
type($("#s-headshotRoot"), "Headshots");
type($("#s-headshotExt"), "jpg");
$("#settingsSaveBtn").click();
await sleep(800);
f = await feed();
check("P1 headshot built from folder/team/sport/number", f[0].headshot === "C:\\Users\\vMix\\Dropbox\\Headshots\\Brookfield\\Women's Volleyball\\12.jpg", f[0].headshot);
check("Tab shows the built path", rows[0].querySelector(".headshot-path").textContent === f[0].headshot);
check("Folder warning cleared", !$("#impactWarnings").textContent.includes("Headshots folder"));

// Sport override, hide, move
type($("#impactSport"), "Volleyball");
rows[1].querySelector(".show-input").checked = false;
rows[1].querySelector(".show-input").dispatchEvent(new window.Event("change"));
await sleep(1500);
f = await feed();
check("Sport override used in path", f[0].headshot.endsWith("\\Volleyball\\12.jpg") && f[0].sport === "Volleyball");
check("Hidden player goes out blank", f[1].visible === false && f[1].number === "" && f[1].headshot === "" && f[1].logo === "");
doc.querySelector('#impactTable tr[data-i="0"] .down-btn').click();
await sleep(1500);
f = await feed();
check("Move down swaps P1/P2", f[1].first === "Jane" && f[0].first === "");

check("No script errors", errors.length === 0, errors.join(" | "));
console.log(`\n${pass} passed, ${fail} failed`);
window.close();
process.exit(fail ? 1 : 0);
