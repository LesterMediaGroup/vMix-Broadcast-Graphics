// Top 25 tab: edits save themselves, Set live switches the feed at once.
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
const feed = async () => (await fetch(BASE + "out/graphics/SSN_9225_v5.json")).json();

const dom = await JSDOM.fromURL(BASE, {
  runScripts: "dangerously", resources: "usable", pretendToBeVisual: true, virtualConsole: vc,
  beforeParse(w) {
    w.fetch = (u, o) => fetch(new URL(u, BASE), o);
    w.confirm = () => true;
    w.prompt = () => "Women's Soccer";
  },
});
const { window } = dom;
const doc = window.document;
const $ = (s) => doc.querySelector(s);
const type = (el, v) => { el.value = v; el.dispatchEvent(new window.Event("input", { bubbles: true })); };
await sleep(2500);

$('.tab[data-tab="top25"]').click();
check("No Save button any more", !$("#top25SaveBtn"));
check("Status shows saved on load", $("#top25Status").textContent.includes("Saved"), $("#top25Status").textContent);

const row = $('#top25Table tr[data-i="0"]');
type(row.querySelector(".team-input"), "Brookfield");
type(row.querySelector('[data-f="column1"]'), "10-2");
check("Shows Saving… while typing", $("#top25Status").textContent.includes("Saving"));
await sleep(1500);
check("Saved after typing stops", $("#top25Status").textContent.includes("Saved"));
let f = await feed();
check("Feed row 1 updated without pressing Save", f[0].name === "Brookfield" && f[0].column1 === "10-2" && f[0].sport === "Men's Basketball", `${f[0].name} ${f[0].column1}`);

$("#top25NewBtn").click();
await sleep(1500);
const api = await (await fetch(BASE + "api/graphics/SSN_9225_v5")).json();
check("New preset saved on its own", api.presets.some((p) => p.name === "Women's Soccer") && api.live === "Men's Basketball");
check("Badge says feed still shows the old preset", $("#top25LiveBadge").textContent.includes("Men's Basketball"));

$("#top25LiveBtn").click();
await sleep(500); // no debounce for Set live
f = await feed();
check("Set live switches the feed right away", f[0].sport === "Women's Soccer", f[0].sport);
check("Badge updates to LIVE", $("#top25LiveBadge").textContent.includes("LIVE IN FEED") && $("#top25LiveBtn").disabled);

check("No script errors", errors.length === 0, errors.join(" | "));
console.log(`\n${pass} passed, ${fail} failed`);
window.close();
process.exit(fail ? 1 : 0);
