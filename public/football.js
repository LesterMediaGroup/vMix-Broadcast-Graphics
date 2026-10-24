// --- Football stats (/out/football.json) ---
// Stats come from a PrestoSports StatsEntry XML: the server reads the URL or
// file path every few seconds while Auto-update is on, or takes a file loaded
// here. This tab edits those settings and shows what the feed is sending.

let fbView = null; // GET /api/football: { source, autoUpdate, pollSeconds, updatedAt, loadedFrom, status, warnings, row, statOptions }

const fbSaver = autoSave({
  url: "/api/football",
  body: () => ({ source: $("footballSource").value.trim(), autoUpdate: $("footballAutoUpdate").checked, pollSeconds: Number($("footballPollSeconds").value) }),
  statusId: "footballSaveStatus",
  onSaved: (data) => showFootball(data),
});

const fbEsc = (v) => escapeAttr(String(v ?? ""));

function showFootball(view) {
  fbView = view;
  renderFootballStatus();
  renderFootballSummary();
}

function renderFootballStatus() {
  const { status, updatedAt, loadedFrom, warnings, autoUpdate } = fbView;
  $("footballUpdatedAt").textContent = updatedAt ? `${new Date(updatedAt).toLocaleTimeString()} — ${loadedFrom}` : "never";
  const el = $("footballStatus");
  el.className = "presto-status";
  if (!status) el.textContent = autoUpdate && fbView.source ? "Auto-update on — waiting for first check…" : "";
  else if (!status.ok) {
    el.className = "presto-status error";
    el.textContent = `Last check ${new Date(status.at).toLocaleTimeString()}: ${status.error}` +
      (/Cloudflare/.test(status.error) ? ". Open the URL in a browser to download the XML, then use Load file…" : "");
  } else el.innerHTML = `Last check ${new Date(status.at).toLocaleTimeString()} · <span class="ok">read OK</span>`;
  $("footballWarnings").innerHTML = warnings.map((w) => `<div>${fbEsc(w)}</div>`).join("");
}

function renderFootballSummary() {
  const r = fbView.row;
  if (!r.loaded) {
    $("footballSummary").innerHTML = `<div style="padding:20px;color:var(--text-dim);">No stats loaded. Enter the XML's URL or file path and press Check now, or use Load file….</div>`;
    return;
  }
  const quarters = Object.keys(r).filter((k) => /^awayQ\d+$/.test(k)).length;
  const hasOT = r.awayOT !== "" || r.homeOT !== "";
  const qs = Array.from({ length: quarters }, (_, i) => i + 1);
  const team = (side) => `
    <tr>
      <td class="abbv-cell">${fbEsc(r[side + "Abbv"])}${r[side + "HasBall"] ? " 🏈" : ""}</td>
      <td>${fbEsc(r[side + "XmlName"])} <span class="dim">${fbEsc(r[side + "Record"])}</span></td>
      ${qs.map((q) => `<td>${fbEsc(r[`${side}Q${q}`])}</td>`).join("")}
      ${hasOT ? `<td>${fbEsc(r[side + "OT"])}</td>` : ""}
      <td><strong>${fbEsc(r[side + "Score"])}</strong></td>
      <td>${fbEsc(r[side + "Timeouts"])}</td>
    </tr>`;
  const situation = [r.pregame ? "PREGAME" : r.gameStatus, r.downDistance, r.ballOn && `Ball on ${r.ballOn}`].filter(Boolean).join(" · ");
  const cap = (k) => k[0].toUpperCase() + k.slice(1);
  const leaders = [["passing", "Passing"], ["rushing", "Rushing"], ["receiving", "Receiving"], ["tackles", "Tackles"]];
  const leader = (side, kind) => {
    const K = side + cap(kind);
    return r[K + "Name"] ? `#${fbEsc(r[K + "Number"])} ${fbEsc(r[K + "Name"])}<br /><span class="dim">${fbEsc(r[K + "Line"])}</span>` : "—";
  };

  $("footballSummary").innerHTML = `
    <table class="fb-table">
      <thead><tr><th></th><th>Team</th>${qs.map((q) => `<th>${q}</th>`).join("")}${hasOT ? "<th>OT</th>" : ""}<th>T</th><th>TO</th></tr></thead>
      <tbody>${team("away")}${team("home")}</tbody>
    </table>
    <div class="fb-situation"><strong>${fbEsc(situation)}</strong>${r.lastPlay ? ` — ${fbEsc(r.lastPlay)}` : ""}</div>
    ${r.lastScore ? `<div class="fb-situation">Last score (${fbEsc(r.lastScoreTeam)}): ${fbEsc(r.lastScore)}</div>` : ""}
    <div class="fb-columns">
      <table class="fb-table">
        <thead><tr><th>Team stat</th><th>${fbEsc(r.awayAbbv)}</th><th>${fbEsc(r.homeAbbv)}</th><th>Feed field</th></tr></thead>
        <tbody>
          ${fbView.statOptions
            .map(
              ({ key, label }) => `
            <tr><td>${fbEsc(label)}</td><td>${fbEsc(r["away" + cap(key)])}</td><td>${fbEsc(r["home" + cap(key)])}</td><td class="dim"><code>away/home${cap(key)}</code></td></tr>`
            )
            .join("")}
        </tbody>
      </table>
      <table class="fb-table">
        <thead><tr><th>Leader</th><th>${fbEsc(r.awayAbbv)}</th><th>${fbEsc(r.homeAbbv)}</th></tr></thead>
        <tbody>${leaders.map(([kind, label]) => `<tr><td>${label}</td><td>${leader("away", kind)}</td><td>${leader("home", kind)}</td></tr>`).join("")}</tbody>
      </table>
    </div>`;
}

async function loadFootballView() {
  try {
    showFootball(await (await fetch("/api/football")).json());
  } catch {}
}

$("footballSource").oninput = () => fbSaver.mark();
$("footballPollSeconds").onchange = () => fbSaver.mark();
// Turning auto-update on/off should take effect right away, so it saves.
$("footballAutoUpdate").onchange = () => fbSaver.flush();

async function footballAction(url, options, busyText) {
  const el = $("footballStatus");
  el.className = "presto-status";
  el.textContent = busyText;
  let data;
  try {
    data = await (await fetch(url, { method: "POST", ...options })).json();
  } catch {
    data = { ok: false, error: "Couldn't reach the dashboard server." };
  }
  if (data.row) showFootball(data);
  if (!data.ok) {
    el.className = "presto-status error";
    el.textContent = data.error;
  }
}

$("footballCheckBtn").onclick = async () => {
  await fbSaver.flush(); // check the URL as typed, not the last saved one
  await footballAction("/api/football/check", {}, "Reading the stats XML…");
};

$("footballFileBtn").onclick = () => $("footballFile").click();
$("footballFile").onchange = async () => {
  const file = $("footballFile").files[0];
  $("footballFile").value = "";
  if (!file) return;
  await footballAction(
    `/api/football/xml?name=${encodeURIComponent(file.name)}`,
    { headers: { "Content-Type": "text/xml" }, body: await file.text() },
    `Loading ${file.name}…`
  );
};

$("footballClearBtn").onclick = async () => {
  if (!confirm("Clear the loaded football stats? The URL / file settings are kept.")) return;
  await footballAction("/api/football/clear", {}, "Clearing…");
};

// Auto-updates happen on the server; refresh what's shown while the tab is open.
setInterval(() => {
  if ($("footballPanel").style.display === "" && !fbSaver.busy()) loadFootballView();
}, 3000);

appReady.then(async () => {
  await loadFootballView();
  if (!fbView) return;
  $("footballSource").value = fbView.source;
  $("footballAutoUpdate").checked = fbView.autoUpdate;
  $("footballPollSeconds").value = String(fbView.pollSeconds);
  fbSaver.render();
});
