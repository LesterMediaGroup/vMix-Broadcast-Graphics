// --- Game setup (served at /out/game.json) ---
// The current game: sport/date/time/venue plus an away and a home side. Each
// side stores a team abbv (searched by name, like the graphic tabs), the
// team's rank/record for this game, and which of the team's colors and logos
// the graphics should use. Edits save themselves.

const GAME_SIDES = [
  ["away", "Away"],
  ["home", "Home"],
];
const LOGO_KEYS = [
  ["primaryLogo", "Primary"],
  ["secondaryLogo", "Secondary"],
];
const emptyGameSide = () => ({ teamAbbv: "", rank: "", record: "", confRecord: "", coach: "", coachTitle: "Head Coach", coachRecord: "", coachConfRecord: "", coachSeason: "", colorKey: "primaryColor", logoKey: "primaryLogo" });

let gameOptions = { coachTitles: [], crewRoles: [], crewSlots: 0, officialSlots: 0 }; // from /api/game/options
let game = null; // { sport, date, ..., conferenceGame, away: side, home: side, crew: [{ role, name }], officials: [...] }
let gameStartClock = null; // broadcastStart as the feed sends it ({0:6:45 PM|HH:mm:ss}), from the last save
teamsChanged.push(() => game && renderGame());

const escapeAttr = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

const gameSaver = autoSave({
  url: "/api/game",
  body: () => game,
  statusId: "gameStatus",
  onSaved: (data) => {
    gameStartClock = data.broadcastStart;
    renderGameWarnings();
  },
});

function markGameDirty() {
  gameSaver.mark();
  renderGameWarnings();
}

// Shows what vMix gets ("→ {0:6:45 PM|HH:mm:ss}"), checked against the server's parse.
function renderStartClock() {
  const typed = game.broadcastStart.trim();
  // Only a string from the server counts as a verdict; null/undefined (not
  // checked yet, or a server too old to send it) never warns.
  const ok = !typed || typeof gameStartClock !== "string" || !!gameStartClock;
  $("gameStartClock").textContent = typed && gameStartClock ? `→ ${gameStartClock}` : "";
  return ok;
}

function renderGameWarnings() {
  const lines = [];
  if (!renderStartClock()) lines.push(`Broadcast start "${game.broadcastStart.trim()}" isn't a time vMix can use — type it like 6:45 PM.`);
  else if (game.broadcastStart.trim() && !game.date) {
    lines.push("Set the game date too — without it the vMix countdown assumes today, and shows 00:00:00 once that time of day has passed.");
  }
  GAME_SIDES.forEach(([side, label]) => {
    const abbv = game[side].teamAbbv.trim();
    if (abbv && !findTeam(abbv)) lines.push(`${label}: "${abbv}" isn't in Teams (name, colors and logo will be blank in vMix).`);
  });
  const [a, h] = GAME_SIDES.map(([side]) => findTeam(game[side].teamAbbv));
  if (a && h && a.abbv === h.abbv) lines.push("Away and home are the same team.");
  $("gameWarnings").innerHTML = lines.map((l) => `<div>${l}</div>`).join("");
}

// The team's colors (or logos) as radio swatches; `keys` is [[field, label], ...].
function pickOptions(side, team, keys, field, swatch) {
  const options = keys.filter(([key]) => team[key]);
  if (!options.length) return `<span class="empty">—</span>`;
  return `<div class="color-options">${options
    .map(
      ([key, label]) => `
      <label class="color-option ${game[side][field] === key ? "checked" : ""}" title="${escapeAttr(`${label}: ${team[key]}`)}">
        <input type="radio" name="game-${field}-${side}" value="${key}" data-pick="${field}" ${game[side][field] === key ? "checked" : ""} />
        ${swatch ? `<span class="swatch" style="background:${team[key]}"></span>` : label}
      </label>`
    )
    .join("")}</div>`;
}

function renderSideDetails(card, side) {
  const s = game[side];
  const team = findTeam(s.teamAbbv);
  card.querySelector(".team-input").classList.toggle("unknown", !!s.teamAbbv.trim() && !team);
  card.style.setProperty("--team-color", team ? team[s.colorKey] || team.primaryColor : "transparent");
  const details = card.querySelector(".side-details");
  if (!team) {
    details.innerHTML = `<div class="side-empty">${s.teamAbbv.trim() ? "Not in Teams — add it on the Teams tab." : "Pick a team."}</div>`;
    return;
  }
  // A pick that doesn't exist on this team falls back to primary, as in Top 25.
  if (!team[s.colorKey]) s.colorKey = "primaryColor";
  if (!team[s.logoKey]) s.logoKey = "primaryLogo";
  details.innerHTML = `
    <dl class="side-facts">
      <dt>Abbv</dt><dd class="mono">${team.abbv}</dd>
      <dt>Uppercase</dt><dd>${team.nameUppercase || "—"}</dd>
      <dt>Mascot</dt><dd>${team.mascot || "—"}</dd>
      <dt>Color</dt><dd>${pickOptions(side, team, COLOR_KEYS, "colorKey", true)}</dd>
      <dt>Logo</dt><dd>${pickOptions(side, team, LOGO_KEYS, "logoKey", false)}</dd>
      <dt></dt><dd class="path-cell" title="${escapeAttr(team[s.logoKey] || "")}">${team[s.logoKey] || "No logo path"}</dd>
    </dl>`;
  details.querySelectorAll("input[data-pick]").forEach((radio) => {
    radio.onchange = () => {
      s[radio.dataset.pick] = radio.value;
      markGameDirty();
      renderSideDetails(card, side);
    };
  });
}

function renderGame() {
  document.querySelectorAll("#gamePanel [data-g]").forEach((input) => (input.value = game[input.dataset.g]));

  $("gameConference").checked = game.conferenceGame;

  document.querySelectorAll("#gamePanel .game-side[data-side]").forEach((card) => {
    const side = card.dataset.side;
    const s = game[side];
    card.innerHTML = `
      <div class="side-head">
        <h3>${side === "away" ? "Away" : "Home"}</h3>
        <button class="btn btn-ghost btn-sm clear-btn">Clear</button>
      </div>
      <label class="field"><span>Team</span><input class="team-input" list="teamList" placeholder="Search team name" /></label>
      <div class="side-stats">
        <label class="field"><span>Rank</span><input data-f="rank" placeholder="RV / 12" /></label>
        <label class="field"><span>Record</span><input data-f="record" placeholder="0-0" /></label>
        <label class="field"><span>Conf. record</span><input data-f="confRecord" placeholder="0-0" /></label>
      </div>
      <div class="side-coach">
        <label class="field"><span>Coach title</span>
          <select data-f="coachTitle">${gameOptions.coachTitles.map((t) => `<option value="${escapeAttr(t)}">${t}</option>`).join("")}</select>
        </label>
        <label class="field"><span>Coach name</span><input data-f="coach" placeholder="Coach name" /></label>
      </div>
      <div class="side-stats">
        <label class="field"><span>Coach record</span><input data-f="coachRecord" placeholder="120-85" /></label>
        <label class="field"><span>Coach conf. record</span><input data-f="coachConfRecord" placeholder="60-40" /></label>
        <label class="field"><span>Season #</span><input data-f="coachSeason" placeholder="5" /></label>
      </div>
      <div class="side-details"></div>`;

    // Shows the team's name; stores its abbv once the text matches a team.
    const teamInput = card.querySelector(".team-input");
    const initial = findTeam(s.teamAbbv);
    teamInput.value = initial ? initial.name : s.teamAbbv;
    teamInput.oninput = () => {
      const t = findTeam(teamInput.value);
      s.teamAbbv = t ? t.abbv : teamInput.value.trim();
      markGameDirty();
      renderSideDetails(card, side);
    };
    card.querySelectorAll("[data-f]").forEach((input) => {
      input.value = s[input.dataset.f];
      input.oninput = input.onchange = () => {
        s[input.dataset.f] = input.value;
        markGameDirty();
      };
    });
    card.querySelector(".clear-btn").onclick = () => {
      game[side] = emptyGameSide();
      markGameDirty();
      renderGame();
    };
    renderSideDetails(card, side);
  });

  document.querySelectorAll(".game-people").forEach(renderPeople);
  renderGameWarnings();
  gameSaver.render();
}

const peopleMax = (card) => (card.dataset.list === "crew" ? gameOptions.crewSlots : gameOptions.officialSlots);

// Crew roles are a fixed dropdown; a stored role that's no longer on the list
// stays selectable so it isn't silently dropped.
function crewRoleSelect(role) {
  const roles = gameOptions.crewRoles.includes(role) || !role ? gameOptions.crewRoles : [role, ...gameOptions.crewRoles];
  return `<select class="cell-input" data-p="role">
    <option value="" ${role ? "" : "selected"}>Role…</option>
    ${roles.map((r) => `<option value="${escapeAttr(r)}" ${r === role ? "selected" : ""}>${r}</option>`).join("")}
  </select>`;
}

// Crew / officials card: one row per person (role + name), up to the server's max.
function renderPeople(card) {
  const list = game[card.dataset.list];
  const isCrew = card.dataset.list === "crew";
  card.querySelector(".add-btn").disabled = list.length >= peopleMax(card);
  if (isCrew) $("crewAllBtn").disabled = gameOptions.crewRoles.every((r) => list.some((p) => p.role === r));
  card.querySelector(".people-rows").innerHTML = list.length
    ? list
        .map(
          (p, i) => `
      <div class="people-row" data-i="${i}">
        ${isCrew ? crewRoleSelect(p.role) : `<input class="cell-input" data-p="role" list="${card.dataset.roles}" placeholder="Role" />`}
        <input class="cell-input" data-p="name" placeholder="Name" />
        <button class="btn btn-ghost btn-sm remove-btn" title="Remove">✕</button>
      </div>`
        )
        .join("")
    : `<div class="side-empty">None yet.</div>`;
  card.querySelectorAll(".people-row").forEach((row) => {
    const person = list[Number(row.dataset.i)];
    row.querySelectorAll("[data-p]").forEach((input) => {
      input.value = person[input.dataset.p];
      input.oninput = input.onchange = () => {
        person[input.dataset.p] = input.value;
        markGameDirty();
      };
    });
    row.querySelector(".remove-btn").onclick = () => {
      list.splice(Number(row.dataset.i), 1);
      markGameDirty();
      renderPeople(card);
    };
  });
}

document.querySelectorAll(".game-people").forEach((card) => {
  card.querySelector(".add-btn").onclick = () => {
    const list = game[card.dataset.list];
    if (list.length >= peopleMax(card)) return;
    list.push({ role: "", name: "" });
    markGameDirty();
    renderPeople(card);
    card.querySelector(".people-row:last-child [data-p=role]").focus();
  };
});

$("crewAllBtn").onclick = () => {
  const missing = gameOptions.crewRoles.filter((r) => !game.crew.some((p) => p.role === r));
  game.crew.push(...missing.slice(0, gameOptions.crewSlots - game.crew.length).map((role) => ({ role, name: "" })));
  markGameDirty();
  renderPeople(document.querySelector('.game-people[data-list="crew"]'));
};

$("gameConference").onchange = () => {
  game.conferenceGame = $("gameConference").checked;
  markGameDirty();
};

// Clears everything game-specific; sport and the broadcast crew usually carry
// over from one game to the next.
$("gameNewBtn").onclick = () => {
  if (!confirm("Start a new game? This clears teams, details and officials (sport and broadcast crew are kept).")) return;
  game = {
    ...Object.fromEntries(Object.keys(game).filter((k) => typeof game[k] === "string").map((k) => [k, ""])),
    sport: game.sport,
    conferenceGame: false,
    away: emptyGameSide(),
    home: emptyGameSide(),
    crew: game.crew,
    officials: [],
  };
  markGameDirty();
  renderGame();
};

document.querySelectorAll("#gamePanel [data-g]").forEach((input) => {
  input.oninput = () => {
    game[input.dataset.g] = input.value;
    // The countdown value includes the date, so both re-check after the save.
    if (input.dataset.g === "broadcastStart" || input.dataset.g === "date") gameStartClock = null;
    markGameDirty();
  };
});

$("gameSwapBtn").onclick = () => {
  [game.away, game.home] = [game.home, game.away];
  markGameDirty();
  renderGame();
};

appReady.then(async () => {
  let feedRow;
  [game, gameOptions, [feedRow]] = await Promise.all(
    [fetch("/api/game"), fetch("/api/game/options"), fetch("/out/game.json")].map((r) => r.then((x) => x.json()))
  );
  gameStartClock = feedRow.broadcastStart ?? null;
  renderGame();
});
