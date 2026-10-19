const $ = (id) => document.getElementById(id);

let teams = [];
let confs = [];
let editing = null; // { kind: 'team'|'conference', abbv: string|null (null = new) }
const teamsChanged = []; // callbacks run after teams/conferences reload
const settingsChanged = []; // callbacks run after Settings are saved

const FIELDS = ["abbv", "nameUppercase", "name", "mascot", "primaryColor", "secondaryColor", "accentColor", "primaryLogo", "secondaryLogo"];

document.querySelectorAll(".tab").forEach((tab) => {
  tab.onclick = () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    document.querySelectorAll(".panel-view").forEach((p) => {
      p.style.display = p.id === tab.dataset.tab + "Panel" ? "" : "none";
    });
  };
});

// Debounced auto-save for tabs whose edits save themselves (Game setup and the
// graphic tabs without a send step). mark() after every edit; the latest
// state from body() is POSTed 600ms after typing stops, saves run in order,
// and onSaved(data) runs after each one. The status element shows
// Saving… / Saved / the error.
function autoSave({ url, body, statusId, onSaved = () => {} }) {
  let timer = null;
  let inFlight = 0;
  let chain = Promise.resolve();
  let error = "";
  const busy = () => !!timer || inFlight > 0;
  const render = () => {
    const el = $(statusId);
    if (error) [el.textContent, el.className] = [error, "save-status error"];
    else if (busy()) [el.textContent, el.className] = ["Saving…", "save-status dirty"];
    else [el.textContent, el.className] = ["● Saved — vMix sees changes on its next read", "save-status live"];
  };
  const flush = () => {
    clearTimeout(timer);
    timer = null;
    inFlight++;
    const payload = JSON.stringify(body());
    chain = chain.then(async () => {
      let data = {};
      try {
        const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: payload });
        data = await res.json();
        error = data.ok ? "" : data.error || "Save failed.";
      } catch {
        error = "Save failed — is the server running?";
      }
      inFlight--;
      render();
      if (data.ok) await onSaved(data);
    });
    return chain;
  };
  const mark = () => {
    clearTimeout(timer);
    timer = setTimeout(flush, 600);
    render();
  };
  window.addEventListener("beforeunload", (e) => {
    if (busy()) e.preventDefault();
  });
  return { mark, flush, render, busy };
}

function renderTable(container, rows, kind) {
  if (!rows.length) {
    container.innerHTML = `<div style="padding:20px;color:var(--text-dim);">None yet — add one to get started.</div>`;
    return;
  }
  const html = `
    <table>
      <thead>
        <tr>
          <th>Abbv</th><th>Name</th><th>Mascot</th><th>Colors</th><th>Primary logo</th><th></th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (r) => `
          <tr data-abbv="${r.abbv}">
            <td class="abbv-cell">${r.abbv}</td>
            <td>${r.name}</td>
            <td>${r.mascot || ""}</td>
            <td>
              <div class="swatch-row">
                ${[r.primaryColor, r.secondaryColor, r.accentColor]
                  .map((c) => (c ? `<span class="swatch" style="background:${c}" title="${c}"></span>` : ""))
                  .join("")}
              </div>
            </td>
            <td class="path-cell" title="${r.primaryLogo || ""}">${r.primaryLogo || "—"}</td>
            <td class="row-actions">
              <button class="btn btn-ghost btn-sm edit-btn">Edit</button>
              <button class="btn btn-danger btn-sm delete-btn">Delete</button>
            </td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>`;
  container.innerHTML = html;

  container.querySelectorAll("tr[data-abbv]").forEach((tr) => {
    const abbv = tr.dataset.abbv;
    const row = rows.find((r) => r.abbv === abbv);
    tr.querySelector(".edit-btn").onclick = () => openModal(kind, row);
    tr.querySelector(".delete-btn").onclick = () => deleteRow(kind, abbv);
  });
}

async function loadAll() {
  const [teamsRes, confsRes, statusRes] = await Promise.all([
    fetch("/api/teams"),
    fetch("/api/conferences"),
    fetch("/api/status"),
  ]);
  teams = await teamsRes.json();
  confs = await confsRes.json();
  const status = await statusRes.json();
  $("versionTag").textContent = "v" + status.version;
  $("masthead-sub").textContent = `${status.teamCount} teams · ${status.conferenceCount} conferences`;

  renderTable($("teamsTable"), [...teams].sort((a, b) => a.name.localeCompare(b.name)), "team");
  renderTable($("confsTable"), confs, "conference");

  // Searched by name in the Top 25 tab; the abbv shows as the hint.
  $("teamList").innerHTML = [...teams]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((t) => `<option value="${t.name.replace(/"/g, "&quot;")}">${t.abbv}</option>`)
    .join("");
  teamsChanged.forEach((fn) => fn()); // graphic tabs re-resolve names/logos
}

function openModal(kind, row) {
  editing = { kind, abbv: row ? row.abbv : null };
  $("modalTitle").textContent = row ? `Edit ${kind}` : `Add ${kind}`;
  $("modalStatus").textContent = "";
  FIELDS.forEach((f) => {
    $("f-" + f).value = row ? row[f] || "" : "";
  });
  $("f-abbv").disabled = !!row; // key can't change once created; delete + re-add instead
  $("editModal").style.display = "flex";
}

function closeModal() {
  $("editModal").style.display = "none";
  editing = null;
}

$("addTeamBtn").onclick = () => openModal("team", null);
$("addConfBtn").onclick = () => openModal("conference", null);
$("modalCancelBtn").onclick = closeModal;

$("modalSaveBtn").onclick = async () => {
  const body = {};
  FIELDS.forEach((f) => (body[f] = $("f-" + f).value));
  if (!body.abbv.trim()) {
    $("modalStatus").textContent = "Abbreviation is required.";
    return;
  }
  const endpoint = editing.kind === "team" ? "/api/teams" : "/api/conferences";
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) {
    $("modalStatus").textContent = data.error || "Save failed.";
    return;
  }
  closeModal();
  loadAll();
};

async function deleteRow(kind, abbv) {
  if (!confirm(`Delete ${abbv}? This can't be undone.`)) return;
  const endpoint = kind === "team" ? `/api/teams/${encodeURIComponent(abbv)}` : `/api/conferences/${encodeURIComponent(abbv)}`;
  await fetch(endpoint, { method: "DELETE" });
  loadAll();
}

// --- Settings ---

$("settingsBtn").onclick = async () => {
  const settings = await (await fetch("/api/settings")).json();
  $("s-basePath").value = settings.basePath || "";
  $("s-headshotRoot").value = settings.headshotRoot || "";
  $("s-headshotExt").value = settings.headshotExt || ".png";
  $("settingsStatus").textContent = "";
  $("settingsModal").style.display = "flex";
};
$("settingsCancelBtn").onclick = () => ($("settingsModal").style.display = "none");
$("settingsSaveBtn").onclick = async () => {
  const res = await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      basePath: $("s-basePath").value,
      headshotRoot: $("s-headshotRoot").value,
      headshotExt: $("s-headshotExt").value,
    }),
  });
  const data = await res.json();
  if (!data.ok) {
    $("settingsStatus").textContent = data.error || "Save failed.";
    return;
  }
  $("settingsModal").style.display = "none";
  settingsChanged.forEach((fn) => fn());
};

// --- Top 25 (vMix title SSN_9225_v5) ---
// State holds one preset per sport; `live` is the one the feed serves. Slots are
// positional: slot index + 1 is the rank, so reordering = moving slots.

const TOP25_TITLE = "SSN_9225_v5";
const COLOR_KEYS = [
  ["primaryColor", "Primary"],
  ["secondaryColor", "Secondary"],
  ["accentColor", "Accent"],
];
const emptySlot = () => ({ teamAbbv: "", column1: "", column2: "", visible: true, colorKey: "primaryColor" });

let top25 = null; // { nameFormat, live, presets: [{ name, asOf, slots }] }
let editingPreset = null; // preset name shown in the tab (not necessarily live)
teamsChanged.push(() => top25 && renderTop25());

// Accepts a team name or abbv (case-insensitive); slots store the abbv once matched.
function findTeam(text) {
  const key = text.trim().toUpperCase();
  if (!key) return null;
  return teams.find((t) => t.abbv.toUpperCase() === key) || teams.find((t) => t.name.toUpperCase() === key) || null;
}
const currentPreset = () => top25.presets.find((p) => p.name === editingPreset);

// Edits save themselves, like the other graphic tabs.
const top25Saver = autoSave({ url: `/api/graphics/${TOP25_TITLE}`, body: () => top25, statusId: "top25Status" });
const markTop25Dirty = () => top25Saver.mark();

function teamPreview(abbv) {
  if (!abbv.trim()) return `<span class="empty">—</span>`;
  const t = findTeam(abbv);
  if (!t) return `<span class="missing">Not in Teams</span>`;
  return `<span>${t[top25.nameFormat] || ""}</span>`;
}

function colorOptions(slot, i) {
  const t = slot.teamAbbv.trim() && findTeam(slot.teamAbbv);
  if (!t) return `<span class="empty">—</span>`;
  const options = COLOR_KEYS.filter(([key]) => t[key]);
  return `<div class="color-options">${options
    .map(
      ([key, label]) => `
      <label class="color-option ${slot.colorKey === key ? "checked" : ""}" title="${label} ${t[key]}">
        <input type="radio" name="color-${i}" value="${key}" ${slot.colorKey === key ? "checked" : ""} />
        <span class="swatch" style="background:${t[key]}"></span>
      </label>`
    )
    .join("")}</div>`;
}

function renderTop25Warnings() {
  const unknown = [];
  const seen = new Set();
  const dupes = new Set();
  currentPreset().slots.forEach((s, i) => {
    if (!s.teamAbbv.trim() || !s.visible) return;
    const t = findTeam(s.teamAbbv);
    const key = t ? t.abbv : s.teamAbbv.trim().toUpperCase();
    if (!t) unknown.push(`#${i + 1} ${s.teamAbbv.trim()}`);
    if (seen.has(key)) dupes.add(key);
    seen.add(key);
  });
  const lines = [];
  if (unknown.length) lines.push(`Not in Teams (name/logo will be blank in vMix): ${unknown.join(", ")}`);
  if (dupes.size) lines.push(`Ranked more than once: ${[...dupes].join(", ")}`);
  $("top25Warnings").innerHTML = lines.map((l) => `<div>${l}</div>`).join("");
}

// "Teams shown" reads as Top N when the visible slots are exactly 1..N,
// otherwise as a custom count.
function renderShowCount() {
  const slots = currentPreset().slots;
  const count = slots.filter((s) => s.visible).length;
  const isTopN = slots.every((s, i) => s.visible === i < count);
  const counts = [5, 10, 15, 20, 25];
  if (isTopN && !counts.includes(count)) counts.push(count);
  counts.sort((a, b) => a - b);
  $("top25ShowCount").innerHTML =
    (isTopN ? "" : `<option value="" selected>${count} (custom)</option>`) +
    counts.map((n) => `<option value="${n}" ${isTopN && n === count ? "selected" : ""}>Top ${n}</option>`).join("");
  const all = $("top25ShowAll");
  if (all) {
    all.checked = count === slots.length;
    all.indeterminate = count > 0 && count < slots.length;
  }
}

function renderPresetBar() {
  $("top25Preset").innerHTML = top25.presets
    .map(
      (p) =>
        `<option value="${p.name.replace(/"/g, "&quot;")}" ${p.name === editingPreset ? "selected" : ""}>${p.name}${
          p.name === top25.live ? "  ● LIVE" : ""
        }</option>`
    )
    .join("");
  const isLive = editingPreset === top25.live;
  $("top25LiveBadge").textContent = isLive ? "● LIVE IN FEED" : `Feed is showing: ${top25.live}`;
  $("top25LiveBadge").className = "live-badge" + (isLive ? " on" : "");
  $("top25LiveBtn").disabled = isLive;
  $("top25DeleteBtn").disabled = top25.presets.length < 2;
}

function renderTop25() {
  const preset = currentPreset();
  renderPresetBar();
  $("top25AsOf").value = preset.asOf;
  $("top25NameFormat").value = top25.nameFormat;

  $("top25Table").innerHTML = `
    <table>
      <thead>
        <tr>
          <th><input type="checkbox" id="top25ShowAll" title="Show / hide all" /></th>
          <th>#</th><th>Team</th><th>Name (as sent)</th><th>Logo color</th><th>W-L</th><th>Conf.</th><th></th>
        </tr>
      </thead>
      <tbody>
        ${preset.slots
          .map(
            (s, i) => `
          <tr data-i="${i}" class="${s.visible ? "" : "hidden-slot"}">
            <td class="show-cell"><input type="checkbox" class="show-input" ${s.visible ? "checked" : ""} title="Show in graphic" /></td>
            <td class="rank-cell">${i + 1}</td>
            <td><input class="cell-input team-input" list="teamList" placeholder="Search team name" /></td>
            <td><div class="team-preview"></div></td>
            <td class="color-cell"></td>
            <td><input class="cell-input stat-input" data-f="column1" placeholder="0-0" /></td>
            <td><input class="cell-input stat-input" data-f="column2" placeholder="0-0" /></td>
            <td class="row-actions">
              <button class="btn btn-ghost btn-sm up-btn" title="Move up" ${i === 0 ? "disabled" : ""}>▲</button>
              <button class="btn btn-ghost btn-sm down-btn" title="Move down" ${i === preset.slots.length - 1 ? "disabled" : ""}>▼</button>
              <button class="btn btn-ghost btn-sm clear-btn">Clear</button>
            </td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>`;

  $("top25ShowAll").onchange = (e) => {
    preset.slots.forEach((s) => (s.visible = e.target.checked));
    markTop25Dirty();
    renderTop25();
  };

  $("top25Table").querySelectorAll("tr[data-i]").forEach((tr) => {
    const i = Number(tr.dataset.i);
    const slot = preset.slots[i];
    const preview = tr.querySelector(".team-preview");
    const colorCell = tr.querySelector(".color-cell");
    const teamInput = tr.querySelector(".team-input");

    const refreshTeam = () => {
      preview.innerHTML = teamPreview(slot.teamAbbv);
      teamInput.classList.toggle("unknown", !!slot.teamAbbv.trim() && !findTeam(slot.teamAbbv));
      // Fall back to primary if the picked color doesn't exist on this team.
      const t = findTeam(slot.teamAbbv);
      if (t && !t[slot.colorKey]) slot.colorKey = "primaryColor";
      colorCell.innerHTML = colorOptions(slot, i);
      colorCell.querySelectorAll("input[type=radio]").forEach((radio) => {
        radio.onchange = () => {
          slot.colorKey = radio.value;
          markTop25Dirty();
          refreshTeam();
        };
      });
    };

    tr.querySelector(".show-input").onchange = (e) => {
      slot.visible = e.target.checked;
      tr.classList.toggle("hidden-slot", !slot.visible);
      markTop25Dirty();
      renderShowCount();
      renderTop25Warnings();
    };

    // Shows the team's name; stores its abbv once the text matches a team.
    // Unmatched text is kept as typed and flagged "Not in Teams".
    const initialTeam = findTeam(slot.teamAbbv);
    teamInput.value = initialTeam ? initialTeam.name : slot.teamAbbv;
    teamInput.oninput = () => {
      const t = findTeam(teamInput.value);
      slot.teamAbbv = t ? t.abbv : teamInput.value.trim();
      refreshTeam();
      renderTop25Warnings();
      markTop25Dirty();
    };

    tr.querySelectorAll("input[data-f]").forEach((input) => {
      const f = input.dataset.f;
      input.value = slot[f];
      input.oninput = () => {
        slot[f] = input.value;
        markTop25Dirty();
      };
    });
    refreshTeam();

    const swap = (j) => {
      [preset.slots[i], preset.slots[j]] = [preset.slots[j], preset.slots[i]];
      markTop25Dirty();
      renderTop25();
    };
    tr.querySelector(".up-btn").onclick = () => swap(i - 1);
    tr.querySelector(".down-btn").onclick = () => swap(i + 1);
    tr.querySelector(".clear-btn").onclick = () => {
      preset.slots[i] = emptySlot();
      markTop25Dirty();
      renderTop25();
    };
  });

  renderShowCount();
  renderTop25Warnings();
}

$("top25Preset").onchange = () => {
  editingPreset = $("top25Preset").value;
  renderTop25();
};

function askPresetName(message, initial) {
  const name = (prompt(message, initial) || "").trim();
  if (!name) return null;
  if (top25.presets.some((p) => p.name === name)) {
    alert(`A preset named "${name}" already exists.`);
    return null;
  }
  return name;
}

$("top25NewBtn").onclick = () => {
  const name = askPresetName("New preset name (sport):", "Women's Soccer");
  if (!name) return;
  top25.presets.push({ name, asOf: "", slots: Array.from({ length: 25 }, emptySlot) });
  editingPreset = name;
  markTop25Dirty();
  renderTop25();
};

$("top25RenameBtn").onclick = () => {
  const preset = currentPreset();
  const name = askPresetName("Rename preset:", preset.name);
  if (!name) return;
  if (top25.live === preset.name) top25.live = name;
  preset.name = name;
  editingPreset = name;
  markTop25Dirty();
  renderTop25();
};

$("top25DeleteBtn").onclick = () => {
  if (top25.presets.length < 2) return;
  if (!confirm(`Delete the "${editingPreset}" preset? This can't be undone.`)) return;
  top25.presets = top25.presets.filter((p) => p.name !== editingPreset);
  if (!top25.presets.some((p) => p.name === top25.live)) top25.live = top25.presets[0].name;
  editingPreset = top25.live;
  markTop25Dirty();
  renderTop25();
};

// Switching the live preset is an on-air change, so it saves right away.
$("top25LiveBtn").onclick = () => {
  top25.live = editingPreset;
  renderPresetBar();
  top25Saver.flush();
};

$("top25AsOf").oninput = () => {
  currentPreset().asOf = $("top25AsOf").value;
  markTop25Dirty();
};

$("top25NameFormat").onchange = () => {
  top25.nameFormat = $("top25NameFormat").value;
  markTop25Dirty();
  renderTop25();
};

$("top25ShowCount").onchange = () => {
  const n = Number($("top25ShowCount").value);
  if (!n) return;
  currentPreset().slots.forEach((s, i) => (s.visible = i < n));
  markTop25Dirty();
  renderTop25();
};

async function loadTop25() {
  top25 = await (await fetch(`/api/graphics/${TOP25_TITLE}`)).json();
  editingPreset = top25.live;
  renderTop25();
  top25Saver.render();
}

const appReady = loadAll().then(loadTop25);
