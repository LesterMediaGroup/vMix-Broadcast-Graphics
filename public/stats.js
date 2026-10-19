// --- Team Stats (vMix title SSN_9120_v1) ---
// Full-screen comparison: home on the left, away on the right, as in the
// graphic. Teams come from Game setup (read back from the feed); the scores
// and five stat rows (label + home value + away value) are typed here.
// Edits save themselves.

const STATS_TITLE = "SSN_9120_v1";
const emptyStatRow = () => ({ label: "", home: "", away: "" });

let statsState = null; // { header, subHeader, hScore, vScore, centerLogo, rows: [{ label, home, away }] }
let statsFeed = null; // last /out row: team names and colors from Game setup

const statsSaver = autoSave({
  url: `/api/graphics/${STATS_TITLE}`,
  body: () => statsState,
  statusId: "statsStatus",
  onSaved: () => !statsSaver.busy() && refreshStatsFeed(),
});

async function refreshStatsFeed() {
  try {
    [statsFeed] = await (await fetch(`/out/graphics/${STATS_TITLE}.json`)).json();
  } catch {
    return;
  }
  renderStatsTeams();
}

// Column headings, center-logo choices and warnings: everything that depends
// on Game setup. Inputs are left alone so typing isn't interrupted.
function renderStatsTeams() {
  const f = statsFeed || {};
  const head = (side, school, color) => {
    const th = $("statsTable").querySelector(`th[data-side="${side}"]`);
    if (!th) return;
    th.textContent = `${side === "home" ? "Home" : "Away"} — ${school || "no team in Game setup"}`;
    th.style.setProperty("--team-color", color || "transparent");
  };
  head("home", f.hSchool, f.hColor);
  head("away", f.vSchool, f.vColor);

  const options = [
    ["home", `Home team logo${f.hSchool ? ` (${f.hSchool})` : ""}`],
    ["away", `Away team logo${f.vSchool ? ` (${f.vSchool})` : ""}`],
    ...confs.map((c) => [c.abbv, `${c.abbv} conference logo`]),
    ["none", "None"],
  ];
  if (!options.some(([v]) => v === statsState.centerLogo)) options.push([statsState.centerLogo, `${statsState.centerLogo} (not in Conferences)`]);
  $("statsCenterLogo").innerHTML = options
    .map(([v, label]) => `<option value="${escapeAttr(v)}" ${v === statsState.centerLogo ? "selected" : ""}>${escapeAttr(label)}</option>`)
    .join("");

  const lines = [];
  if (statsFeed && (!f.hSchool || !f.vSchool)) lines.push("Set both teams in Game setup — names, mascots, logos and colors come from there.");
  statsState.rows.forEach((r, i) => {
    if (!r.label && (r.home || r.away)) lines.push(`Row ${i + 1} has numbers but no stat label.`);
  });
  $("statsWarnings").innerHTML = lines.map((l) => `<div>${l}</div>`).join("");
}

function renderStats() {
  $("statsHeader").value = statsState.header;
  $("statsSubHeader").value = statsState.subHeader;

  $("statsTable").innerHTML = `
    <table>
      <thead>
        <tr><th>#</th><th class="stat-side" data-side="home"></th><th class="stat-side">Stat</th><th class="stat-side" data-side="away"></th><th></th></tr>
      </thead>
      <tbody>
        <tr class="score-row">
          <td class="rank-cell"></td>
          <td class="stat-side"><input class="cell-input stat-value" data-score="hScore" placeholder="0" /></td>
          <td class="stat-side">SCORE</td>
          <td class="stat-side"><input class="cell-input stat-value" data-score="vScore" placeholder="0" /></td>
          <td></td>
        </tr>
        ${statsState.rows
          .map(
            (r, i) => `
        <tr data-i="${i}">
          <td class="rank-cell">${i + 1}</td>
          <td class="stat-side"><input class="cell-input stat-value" data-f="home" placeholder="888" /></td>
          <td class="stat-side"><input class="cell-input stat-label" data-f="label" list="statLabels" placeholder="Stat label" /></td>
          <td class="stat-side"><input class="cell-input stat-value" data-f="away" placeholder="888" /></td>
          <td class="row-actions">
            <button class="btn btn-ghost btn-sm up-btn" title="Move up" ${i === 0 ? "disabled" : ""}>▲</button>
            <button class="btn btn-ghost btn-sm down-btn" title="Move down" ${i === statsState.rows.length - 1 ? "disabled" : ""}>▼</button>
            <button class="btn btn-ghost btn-sm clear-btn">Clear</button>
          </td>
        </tr>`
          )
          .join("")}
      </tbody>
    </table>`;

  $("statsTable").querySelectorAll("input[data-score]").forEach((input) => {
    input.value = statsState[input.dataset.score];
    input.oninput = () => {
      statsState[input.dataset.score] = input.value;
      statsSaver.mark();
    };
  });
  $("statsTable").querySelectorAll("tr[data-i]").forEach((tr) => {
    const i = Number(tr.dataset.i);
    const row = statsState.rows[i];
    tr.querySelectorAll("input[data-f]").forEach((input) => {
      input.value = row[input.dataset.f];
      input.oninput = () => {
        row[input.dataset.f] = input.dataset.f === "label" ? input.value.toUpperCase() : input.value;
        statsSaver.mark();
        renderStatsTeams();
      };
    });
    const swap = (j) => {
      [statsState.rows[i], statsState.rows[j]] = [statsState.rows[j], statsState.rows[i]];
      statsSaver.mark();
      renderStats();
    };
    tr.querySelector(".up-btn").onclick = () => swap(i - 1);
    tr.querySelector(".down-btn").onclick = () => swap(i + 1);
    tr.querySelector(".clear-btn").onclick = () => {
      statsState.rows[i] = emptyStatRow();
      statsSaver.mark();
      renderStats();
    };
  });

  renderStatsTeams();
  statsSaver.render();
}

$("statsHeader").oninput = () => {
  statsState.header = $("statsHeader").value;
  statsSaver.mark();
};
$("statsSubHeader").oninput = () => {
  statsState.subHeader = $("statsSubHeader").value;
  statsSaver.mark();
};
$("statsCenterLogo").onchange = () => {
  statsState.centerLogo = $("statsCenterLogo").value;
  statsSaver.mark();
};

// Game setup may have changed teams since this tab was drawn.
document.querySelector('.tab[data-tab="stats"]').addEventListener("click", () => statsState && refreshStatsFeed());
teamsChanged.push(() => statsState && refreshStatsFeed());

appReady.then(async () => {
  statsState = await (await fetch(`/api/graphics/${STATS_TITLE}`)).json();
  renderStats();
  refreshStatsFeed();
});
