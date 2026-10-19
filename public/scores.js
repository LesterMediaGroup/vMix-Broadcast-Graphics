// --- Conference Scores scores (vMix title SSN_5018_v3) ---
// Same preset model as the Top 25 tab: one preset per sport, `live` is the one
// the feed serves. Six game slots; T1 = away (top row), T2 = home.
// A game's source is "manual" (typed here) or "relay" (score/period/time come
// from POST /api/graphics/SSN_5018_v3/relay and are read-only here).
// Edits save themselves; the send mode decides when vMix sees them: Automatic
// = with every save, Manual = only when "Send to vMix" is pressed.

const SCORES_TITLE = "SSN_5018_v3";
const SCORE_FIELDS = ["t1Score", "t2Score", "period", "time"];
const emptyGame = () => ({
  visible: true,
  t1Abbv: "",
  t2Abbv: "",
  t1Score: "",
  t2Score: "",
  period: "",
  time: "",
  source: "manual",
});

let scores = null; // { nameFormat, live, presets: [{ name, sportLabel, heading, conferenceAbbv, games }], relayUpdatedAt }
let scoresEditing = null; // preset name shown in the tab (not necessarily live)
teamsChanged.push(() => scores && renderScores());

const scoresPreset = () => scores.presets.find((p) => p.name === scoresEditing);
const sameTeams = (a, b) =>
  a.t1Abbv.trim().toUpperCase() === b.t1Abbv.trim().toUpperCase() &&
  a.t2Abbv.trim().toUpperCase() === b.t2Abbv.trim().toUpperCase();

function setScoresStatus(text, cls = "") {
  $("scoresStatus").textContent = text;
  $("scoresStatus").className = "save-status " + cls;
}

let saveTimer = null;
let savesInFlight = 0;
let saveChain = Promise.resolve();
let saveError = "";
let lastSentAt = null;

// Every edit schedules a quiet save; nothing is re-rendered on save so typing
// isn't interrupted.
function markScoresDirty() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveScores, 600);
  renderSendState();
}

function renderSendState() {
  const manual = scores.sendMode === "manual";
  $("scoresSendMode").value = scores.sendMode;
  $("scoresSendBtn").style.display = manual ? "" : "none";
  $("scoresSendBtn").classList.toggle("attention", manual && !!scores.unsent);
  if (saveError) return setScoresStatus(saveError, "error");
  if (saveTimer || savesInFlight) return setScoresStatus("Saving…", "dirty");
  if (!manual) return setScoresStatus("● vMix updates with every change", "live");
  if (scores.unsent) return setScoresStatus("Changes not sent to vMix yet", "dirty");
  setScoresStatus(lastSentAt ? `Sent to vMix ${lastSentAt.toLocaleTimeString()}` : "vMix is up to date");
}

function renderScoresRelayAt() {
  $("scoresRelayAt").textContent = scores.relayUpdatedAt
    ? new Date(scores.relayUpdatedAt).toLocaleString()
    : "never";
}

function renderScoresWarnings() {
  const lines = [];
  scoresPreset().games.forEach((g, i) => {
    if (!g.visible) return;
    const unknown = [g.t1Abbv, g.t2Abbv].filter((t) => t.trim() && !findTeam(t));
    if (unknown.length) lines.push(`Game ${i + 1}: not in Teams (name/logo blank in vMix): ${unknown.join(", ")}`);
    if (g.source === "relay" && !(g.t1Abbv.trim() && g.t2Abbv.trim())) {
      lines.push(`Game ${i + 1}: relay games need both teams set so the relay can match them.`);
    }
  });
  $("scoresWarnings").innerHTML = lines.map((l) => `<div>${l}</div>`).join("");
}

function renderScoresPresetBar() {
  $("scoresPreset").innerHTML = scores.presets
    .map(
      (p) =>
        `<option value="${p.name.replace(/"/g, "&quot;")}" ${p.name === scoresEditing ? "selected" : ""}>${p.name}${
          p.name === scores.live ? "  ● LIVE" : ""
        }</option>`
    )
    .join("");
  const isLive = scoresEditing === scores.live;
  $("scoresLiveBadge").textContent = isLive ? "● LIVE IN FEED" : `Feed is showing: ${scores.live}`;
  $("scoresLiveBadge").className = "live-badge" + (isLive ? " on" : "");
  $("scoresLiveBtn").disabled = isLive;
  $("scoresDeleteBtn").disabled = scores.presets.length < 2;
}

function renderScores() {
  const preset = scoresPreset();
  renderScoresPresetBar();
  renderScoresRelayAt();
  $("scoresSportLabel").value = preset.sportLabel;
  $("scoresHeading").value = preset.heading;
  $("scoresNameFormat").value = scores.nameFormat;
  $("scoresPrestoUrl").value = preset.prestoUrl;
  $("scoresPollSeconds").value = String(preset.pollSeconds);
  $("scoresAutoUpdate").checked = preset.autoUpdate;
  renderPrestoStatus();
  $("scoresConference").innerHTML =
    `<option value="">(none)</option>` +
    confs
      .map((c) => `<option value="${c.abbv}" ${c.abbv === preset.conferenceAbbv ? "selected" : ""}>${c.abbv} — ${c.name}</option>`)
      .join("");

  $("scoresTable").innerHTML = `
    <table>
      <thead>
        <tr>
          <th><input type="checkbox" id="scoresShowAll" title="Show / hide all" /></th>
          <th>Game</th><th>Away (T1)</th><th>Score</th><th>Home (T2)</th><th>Score</th>
          <th>Period</th><th>Time</th><th>Source</th><th></th>
        </tr>
      </thead>
      <tbody>
        ${preset.games
          .map(
            (g, i) => `
          <tr data-i="${i}" class="${g.visible ? "" : "hidden-slot"}">
            <td class="show-cell"><input type="checkbox" class="show-input" ${g.visible ? "checked" : ""} title="Show in graphic" /></td>
            <td class="rank-cell">${i + 1}</td>
            <td><input class="cell-input team-input" data-team="t1Abbv" list="teamList" placeholder="Search team name" /></td>
            <td><input class="cell-input score-input" data-f="t1Score" /></td>
            <td><input class="cell-input team-input" data-team="t2Abbv" list="teamList" placeholder="Search team name" /></td>
            <td><input class="cell-input score-input" data-f="t2Score" /></td>
            <td><input class="cell-input period-input" data-f="period" list="periodList" /></td>
            <td><input class="cell-input time-input" data-f="time" placeholder="12:34" /></td>
            <td>
              <select class="source-select">
                <option value="manual" ${g.source === "manual" ? "selected" : ""}>Manual</option>
                <option value="relay" ${g.source === "relay" ? "selected" : ""}>Relay</option>
              </select>
            </td>
            <td class="row-actions">
              <button class="btn btn-ghost btn-sm up-btn" title="Move up" ${i === 0 ? "disabled" : ""}>▲</button>
              <button class="btn btn-ghost btn-sm down-btn" title="Move down" ${i === preset.games.length - 1 ? "disabled" : ""}>▼</button>
              <button class="btn btn-ghost btn-sm swap-btn" title="Swap away/home">⇅</button>
              <button class="btn btn-ghost btn-sm clear-btn">Clear</button>
            </td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>`;

  const showAll = $("scoresShowAll");
  const shown = preset.games.filter((g) => g.visible).length;
  showAll.checked = shown === preset.games.length;
  showAll.indeterminate = shown > 0 && shown < preset.games.length;
  showAll.onchange = () => {
    preset.games.forEach((g) => (g.visible = showAll.checked));
    markScoresDirty();
    renderScores();
  };

  $("scoresTable").querySelectorAll("tr[data-i]").forEach((tr) => {
    const i = Number(tr.dataset.i);
    const game = preset.games[i];

    tr.querySelector(".show-input").onchange = (e) => {
      game.visible = e.target.checked;
      markScoresDirty();
      renderScores();
    };

    // Team boxes show the name and store the abbv once the text matches a team.
    tr.querySelectorAll("input[data-team]").forEach((input) => {
      const f = input.dataset.team;
      const t = findTeam(game[f]);
      input.value = t ? t.name : game[f];
      input.classList.toggle("unknown", !!game[f].trim() && !t);
      input.oninput = () => {
        const match = findTeam(input.value);
        game[f] = match ? match.abbv : input.value.trim();
        input.classList.toggle("unknown", !!game[f] && !match);
        renderScoresWarnings();
        markScoresDirty();
      };
    });

    // Relay games' score fields are filled by the relay; switch to Manual to type.
    tr.querySelectorAll("input[data-f]").forEach((input) => {
      const f = input.dataset.f;
      input.value = game[f];
      input.readOnly = game.source === "relay";
      input.classList.toggle("relay-locked", game.source === "relay");
      input.title = game.source === "relay" ? "Filled by the relay — set Source to Manual to edit" : "";
      input.oninput = () => {
        game[f] = input.value;
        markScoresDirty();
      };
    });

    tr.querySelector(".source-select").onchange = (e) => {
      game.source = e.target.value;
      markScoresDirty();
      renderScores();
    };

    const move = (j) => {
      [preset.games[i], preset.games[j]] = [preset.games[j], preset.games[i]];
      markScoresDirty();
      renderScores();
    };
    tr.querySelector(".up-btn").onclick = () => move(i - 1);
    tr.querySelector(".down-btn").onclick = () => move(i + 1);
    tr.querySelector(".swap-btn").onclick = () => {
      [game.t1Abbv, game.t2Abbv] = [game.t2Abbv, game.t1Abbv];
      [game.t1Score, game.t2Score] = [game.t2Score, game.t1Score];
      markScoresDirty();
      renderScores();
    };
    tr.querySelector(".clear-btn").onclick = () => {
      preset.games[i] = emptyGame();
      markScoresDirty();
      renderScores();
    };
  });

  renderScoresWarnings();
  renderSendState();
}

$("scoresPreset").onchange = () => {
  scoresEditing = $("scoresPreset").value;
  renderScores();
};

function askScoresPresetName(message, initial) {
  const name = (prompt(message, initial) || "").trim();
  if (!name) return null;
  if (scores.presets.some((p) => p.name === name)) {
    alert(`A preset named "${name}" already exists.`);
    return null;
  }
  return name;
}

$("scoresNewBtn").onclick = () => {
  const name = askScoresPresetName("New preset name (sport):", "Women's Basketball");
  if (!name) return;
  const current = scoresPreset();
  scores.presets.push({
    name,
    sportLabel: current.sportLabel,
    heading: current.heading,
    conferenceAbbv: current.conferenceAbbv,
    prestoUrl: "",
    autoUpdate: false,
    pollSeconds: 30,
    games: Array.from({ length: 6 }, emptyGame),
  });
  scoresEditing = name;
  markScoresDirty();
  renderScores();
};

$("scoresRenameBtn").onclick = () => {
  const preset = scoresPreset();
  const name = askScoresPresetName("Rename preset:", preset.name);
  if (!name) return;
  if (scores.live === preset.name) scores.live = name;
  preset.name = name;
  scoresEditing = name;
  markScoresDirty();
  renderScores();
};

$("scoresDeleteBtn").onclick = () => {
  if (scores.presets.length < 2) return;
  if (!confirm(`Delete the "${scoresEditing}" preset? This can't be undone.`)) return;
  scores.presets = scores.presets.filter((p) => p.name !== scoresEditing);
  if (!scores.presets.some((p) => p.name === scores.live)) scores.live = scores.presets[0].name;
  scoresEditing = scores.live;
  markScoresDirty();
  renderScores();
};

$("scoresLiveBtn").onclick = () => {
  scores.live = scoresEditing;
  renderScoresPresetBar();
  saveScores();
};

$("scoresSportLabel").oninput = () => {
  scoresPreset().sportLabel = $("scoresSportLabel").value;
  markScoresDirty();
};
$("scoresHeading").oninput = () => {
  scoresPreset().heading = $("scoresHeading").value;
  markScoresDirty();
};
$("scoresConference").onchange = () => {
  scoresPreset().conferenceAbbv = $("scoresConference").value;
  markScoresDirty();
};
$("scoresNameFormat").onchange = () => {
  scores.nameFormat = $("scoresNameFormat").value;
  markScoresDirty();
};

// Saves run one at a time, each sending the latest state.
function saveScores() {
  clearTimeout(saveTimer);
  saveTimer = null;
  savesInFlight++;
  renderSendState();
  saveChain = saveChain.then(async () => {
    try {
      const res = await fetch(`/api/graphics/${SCORES_TITLE}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scores),
      });
      const data = await res.json();
      saveError = data.ok ? "" : data.error || "Save failed.";
      if (data.ok) scores.unsent = data.state.unsent;
    } catch {
      saveError = "Save failed — is the server running?";
    }
    savesInFlight--;
    renderSendState();
  });
  return saveChain;
}

$("scoresSendMode").onchange = () => {
  const mode = $("scoresSendMode").value;
  if (mode === "auto" && scores.unsent && !confirm("Switching to Automatic sends your current changes to vMix now. Continue?")) {
    $("scoresSendMode").value = scores.sendMode;
    return;
  }
  scores.sendMode = mode;
  saveScores();
};

$("scoresSendBtn").onclick = async () => {
  await saveScores(); // make sure the latest edits are on the server first
  if (saveError) return;
  const data = await (await fetch(`/api/graphics/${SCORES_TITLE}/send`, { method: "POST" })).json();
  if (!data.ok) {
    saveError = data.error || "Send failed.";
  } else {
    scores.unsent = data.state.unsent;
    lastSentAt = new Date();
  }
  renderSendState();
};

// --- PrestoSports auto-update ---
// The server does the polling (per preset, while Auto-update is on); the tab
// only edits the settings and shows the last result.

let prestoStatus = {}; // preset name -> { at, ok, error?, found, matched, missing }

function renderPrestoStatus() {
  const el = $("scoresPrestoStatus");
  const preset = scoresPreset();
  const st = prestoStatus[preset.name];
  el.className = "presto-status";
  if (!st) {
    el.textContent = preset.autoUpdate ? "Auto-update on — waiting for first check…" : "";
    return;
  }
  const when = new Date(st.at).toLocaleTimeString();
  if (!st.ok) {
    el.className = "presto-status error";
    el.textContent = `Last check ${when}: ${st.error}`;
    return;
  }
  const parts = [`Last check ${when}`, `${st.found} games on scoreboard`];
  parts.push(st.matched.length ? `<span class="ok">updated game ${st.matched.join(", ")}</span>` : "no Relay games matched");
  if (st.missing.length) parts.push(`not on scoreboard: game ${st.missing.join(", ")}`);
  el.innerHTML = parts.join(" · ");
}

$("scoresPrestoUrl").oninput = () => {
  scoresPreset().prestoUrl = $("scoresPrestoUrl").value.trim();
  markScoresDirty();
};
$("scoresPollSeconds").onchange = () => {
  scoresPreset().pollSeconds = Number($("scoresPollSeconds").value);
  markScoresDirty();
};
// Turning auto-update on/off should take effect right away, so it saves.
$("scoresAutoUpdate").onchange = () => {
  scoresPreset().autoUpdate = $("scoresAutoUpdate").checked;
  saveScores();
};

$("scoresCheckBtn").onclick = async () => {
  const el = $("scoresPrestoStatus");
  el.className = "presto-status";
  el.textContent = "Checking scoreboard…";
  const res = await fetch(`/api/graphics/${SCORES_TITLE}/presto/poll`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ preset: scoresEditing }),
  });
  const data = await res.json();
  if (!data.ok) {
    el.className = "presto-status error";
    el.textContent = data.error;
    return;
  }
  prestoStatus[scoresEditing] = data.status;
  await pollRelay();
  renderPrestoStatus();
};

// Import: list the scoreboard's games, fill empty slots with the picked ones.
let importGames = [];
const baseTeamName = (name) => name.replace(/\s*\([^)]*\)\s*$/, "").trim();

function renderImportList() {
  const showAll = $("importShowAll").checked;
  const rows = importGames
    .map((g, idx) => ({ g, idx }))
    .filter(({ g }) => showAll || g.awayAbbv || g.homeAbbv);
  $("importInfo").textContent = `${rows.length} of ${importGames.length} games`;
  if (!rows.length) {
    $("importList").innerHTML = `<div style="padding:20px;color:var(--text-dim);">No games${showAll ? "" : " with a team from Teams"} on this scoreboard.</div>`;
    return;
  }
  const team = (name, abbv) => (abbv ? `<span class="known" title="In Teams as ${abbv}">${name}</span>` : name);
  $("importList").innerHTML = `
    <table>
      <thead><tr><th></th><th>Away</th><th></th><th>Home</th><th></th><th>Status</th></tr></thead>
      <tbody>
        ${rows
          .map(
            ({ g, idx }) => `
          <tr>
            <td><input type="checkbox" class="import-pick" data-idx="${idx}" /></td>
            <td>${team(g.away, g.awayAbbv)}</td><td>${g.awayScore}</td>
            <td>${team(g.home, g.homeAbbv)}</td><td>${g.homeScore}</td>
            <td>${g.status}</td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>`;
}

$("scoresImportBtn").onclick = async () => {
  const url = $("scoresPrestoUrl").value.trim();
  if (!url) {
    alert("Enter the PrestoSports scoreboard URL first.");
    return;
  }
  $("importList").textContent = "Loading…";
  $("importInfo").textContent = "";
  $("importModal").style.display = "flex";
  const data = await (await fetch(`/api/presto/scoreboard?url=${encodeURIComponent(url)}`)).json();
  if (!data.ok) {
    $("importList").innerHTML = `<div style="padding:20px;color:var(--accent-error);">${data.error}</div>`;
    return;
  }
  importGames = data.games;
  renderImportList();
};

$("importShowAll").onchange = renderImportList;
$("importCancelBtn").onclick = () => ($("importModal").style.display = "none");

$("importAddBtn").onclick = () => {
  const picked = [...$("importList").querySelectorAll(".import-pick:checked")].map((c) => importGames[Number(c.dataset.idx)]);
  if (!picked.length) return;
  const games = scoresPreset().games;
  const empty = games.map((g, i) => i).filter((i) => !games[i].t1Abbv && !games[i].t2Abbv);
  if (picked.length > empty.length) {
    alert(`Only ${empty.length} empty game slot${empty.length === 1 ? "" : "s"} — clear some games or pick fewer.`);
    return;
  }
  picked.forEach((g, n) => {
    games[empty[n]] = {
      visible: true,
      t1Abbv: g.awayAbbv || baseTeamName(g.away),
      t2Abbv: g.homeAbbv || baseTeamName(g.home),
      t1Score: g.awayScore,
      t2Score: g.homeScore,
      period: g.period,
      time: g.time,
      source: "relay",
    };
  });
  $("importModal").style.display = "none";
  markScoresDirty();
  renderScores();
};

// Pull relay-pushed scores into the tab without touching unsaved manual edits:
// only relay games whose teams still match the server copy are updated.
async function pollRelay() {
  if (!scores) return;
  let server;
  try {
    prestoStatus = await (await fetch(`/api/graphics/${SCORES_TITLE}/presto`)).json();
    renderPrestoStatus();
    server = await (await fetch(`/api/graphics/${SCORES_TITLE}`)).json();
  } catch {
    return;
  }
  if (!saveTimer && !savesInFlight) {
    scores.unsent = server.unsent;
    renderSendState();
  }
  if (server.relayUpdatedAt === scores.relayUpdatedAt) return;
  scores.relayUpdatedAt = server.relayUpdatedAt;
  renderScoresRelayAt();
  scores.presets.forEach((p) => {
    const sp = server.presets.find((x) => x.name === p.name);
    if (!sp) return;
    p.games.forEach((g, i) => {
      const sg = sp.games[i];
      if (g.source !== "relay" || sg.source !== "relay" || !sameTeams(g, sg)) return;
      SCORE_FIELDS.forEach((f) => (g[f] = sg[f]));
      if (p.name !== scoresEditing) return;
      const tr = $("scoresTable").querySelector(`tr[data-i="${i}"]`);
      SCORE_FIELDS.forEach((f) => (tr.querySelector(`[data-f="${f}"]`).value = sg[f]));
    });
  });
}

window.addEventListener("beforeunload", (e) => {
  if (saveTimer || savesInFlight) e.preventDefault();
});

async function loadScores() {
  scores = await (await fetch(`/api/graphics/${SCORES_TITLE}`)).json();
  scoresEditing = scores.live;
  renderScores();
  setInterval(pollRelay, 3000);
}

appReady.then(loadScores);
