// Runs every test/*.test.mjs against its own server: a free port and a fresh
// scratch copy of test/fixtures/data, so tests never touch the real data/
// folder or a dashboard that's already running. Usage: npm test
import { spawn } from "child_process";
import fs from "fs";
import net from "net";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const only = process.argv[2]; // optional: run just files containing this text
const files = fs.readdirSync(here).filter((f) => f.endsWith(".test.mjs") && (!only || f.includes(only))).sort();

const freePort = () =>
  new Promise((resolve) => {
    const srv = net.createServer().listen(0, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });

async function waitForServer(base, server) {
  for (let i = 0; i < 50; i++) {
    if (server.exitCode !== null) throw new Error("server exited during startup");
    try {
      if ((await fetch(base + "api/status")).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("server didn't start");
}

let failed = 0;
for (const file of files) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "bg-test-"));
  fs.cpSync(path.join(here, "fixtures", "data"), dataDir, { recursive: true });
  const port = await freePort();
  const base = `http://localhost:${port}/`;
  const env = { ...process.env, PORT: String(port), DATA_DIR: dataDir, BASE: base };
  const server = spawn(process.execPath, [path.join(root, "server.js")], { env, stdio: ["ignore", "pipe", "pipe"] });
  let serverLog = "";
  server.stdout.on("data", (d) => (serverLog += d));
  server.stderr.on("data", (d) => (serverLog += d));

  console.log(`\n=== ${file}`);
  let code;
  try {
    await waitForServer(base, server);
    code = await new Promise((resolve) => {
      const t = spawn(process.execPath, [path.join(here, file)], { env, stdio: "inherit" });
      t.on("exit", resolve);
    });
  } catch (e) {
    console.log(`FAIL  ${e.message}\n${serverLog}`);
    code = 1;
  }
  server.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
  if (code !== 0) failed++;
}

console.log(`\n${files.length - failed}/${files.length} test files passed`);
process.exit(failed ? 1 : 0);
