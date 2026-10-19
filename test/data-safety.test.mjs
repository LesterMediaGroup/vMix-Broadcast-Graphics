// Saves keep a .bak and never leave a half-written file; a damaged file is
// reported and never overwritten; a damaged teams.json stops startup.
import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const BASE = process.env.BASE;
const DATA = process.env.DATA_DIR;
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const check = (label, ok, extra = "") => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? "  — " + extra : ""}`);
};
const post = (p, body) => fetch(BASE + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const read = (p) => JSON.parse(fs.readFileSync(path.join(DATA, p), "utf8"));

await post("api/game", { sport: "First" });
await post("api/game", { sport: "Second" });
check("Save writes the new version", read("game.json").sport === "Second");
check("Previous version kept as .bak", read("game.json.bak").sport === "First");
check("No temp files left behind", !fs.readdirSync(DATA).some((f) => f.endsWith(".tmp")));

// Damage a graphic's file: requests fail with the reason, the file isn't overwritten.
const file = path.join(DATA, "graphics", "SSN_9048_v3.json");
await post("api/graphics/SSN_9048_v3", { title: "X" });
fs.writeFileSync(file, '{"title": "X", "play');
const out = await fetch(BASE + "out/graphics/SSN_9048_v3.json");
const outBody = await out.json();
check("Feed of damaged file returns an error", out.status === 500 && /damaged/.test(outBody.error), outBody.error);
const save = await (await post("api/graphics/SSN_9048_v3", { title: "Y" })).json();
check("Saving over a damaged file is refused", save.ok === false && /\.bak/.test(save.error));
check("Damaged file left untouched for recovery", fs.readFileSync(file, "utf8") === '{"title": "X", "play');
const other = await fetch(BASE + "out/game.json");
check("Other feeds keep working", other.ok);

// A damaged teams.json stops a fresh server from starting.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bg-damaged-"));
fs.writeFileSync(path.join(dir, "teams.json"), '[{"abbv":');
const r = spawnSync(process.execPath, [path.join(root, "server.js")], { env: { ...process.env, DATA_DIR: dir, PORT: "0" }, encoding: "utf8", timeout: 10000 });
fs.rmSync(dir, { recursive: true, force: true });
check("Damaged teams.json: refuses to start", r.status === 1 && /Not starting: data[\\/]teams\.json is damaged/.test(r.stderr), r.stderr.trim());

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
