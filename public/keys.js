// --- Keys to the Game (vMix title SSN_5006_v01) ---
// Three keys (a Topic headline and a Stat line under it), written separately
// for the away and home team. `side` picks which set goes to vMix. Both
// teams' logos, mascots and colors come from Game setup, so the tab reads
// them back from the feed. Edits save themselves.

const KEYS_TITLE = "SSN_5006_v01";

let keysState = null; // { header, subHeader, side, keys: { away: [{ topic, stat }], home: [...] } }
let keysFeed = null; // last /out row: team names, colors and the auto SubHeader

const keysSaver = autoSave({
  url: `/api/graphics/${KEYS_TITLE}`,
  body: () => keysState,
  statusId: "keysStatus",
  onSaved: () => !keysSaver.busy() && refreshKeysFeed(),
});

function markKeysDirty() {
  keysSaver.mark();
}

// Team details for a side, from the feed ("v"/"h" prefixes).
function keysTeam(side) {
  const p = side === "away" ? "v" : "h";
  return keysFeed ? { name: keysFeed[`${p}Name`], abbv: keysFeed[`${p}Abbv`], color: keysFeed[`${p}Color`] } : { name: "", abbv: "", color: "" };
}

const sideLabel = (side) => `${side === "away" ? "Away" : "Home"} — ${keysTeam(side).name || keysTeam(side).abbv || "no team in Game setup"}`;

async function refreshKeysFeed() {
  try {
    [keysFeed] = await (await fetch(`/out/graphics/${KEYS_TITLE}.json`)).json();
  } catch {
    return;
  }
  renderKeysTeams();
}

// The parts that depend on Game setup / the on-air side; key inputs are left
// alone so typing isn't interrupted.
function renderKeysTeams() {
  $("keysSide").innerHTML = GAME_SIDES.map(
    ([side]) => `<option value="${side}" ${side === keysState.side ? "selected" : ""}>${escapeAttr(sideLabel(side))}</option>`
  ).join("");
  const auto = keysFeed && !keysState.subHeader ? keysFeed.subHeader : "";
  $("keysSubHeader").placeholder = auto ? `${auto} (auto)` : "Team name (auto)";

  document.querySelectorAll(".keys-side").forEach((card) => {
    const side = card.dataset.side;
    const onAir = side === keysState.side;
    card.classList.toggle("on-air", onAir);
    card.style.setProperty("--team-color", keysTeam(side).color || "transparent");
    card.querySelector("h3").textContent = sideLabel(side);
    card.querySelector(".on-air-badge").textContent = onAir ? "● IN FEED" : "";
    card.querySelector(".air-btn").style.display = onAir ? "none" : "";
  });

  const lines = [];
  if (keysFeed && !keysTeam(keysState.side).abbv) {
    lines.push(`No ${keysState.side} team is set in Game setup, so the logo, mascot and colors will be blank.`);
  }
  $("keysWarnings").innerHTML = lines.map((l) => `<div>${l}</div>`).join("");
}

function renderKeys() {
  $("keysHeader").value = keysState.header;
  $("keysSubHeader").value = keysState.subHeader;

  document.querySelectorAll(".keys-side").forEach((card) => {
    const side = card.dataset.side;
    card.innerHTML = `
      <div class="side-head">
        <h3></h3>
        <div class="row-actions">
          <span class="on-air-badge"></span>
          <button class="btn btn-live btn-sm air-btn" title="Send this team's keys to vMix">Use these keys</button>
          <button class="btn btn-ghost btn-sm clear-btn">Clear</button>
        </div>
      </div>
      ${keysState.keys[side]
        .map(
          (k, i) => `
        <div class="key-row" data-i="${i}">
          <span class="rank-cell">${i + 1}</span>
          <div class="key-fields">
            <input class="cell-input" data-k="topic" placeholder="Key ${i + 1} headline, e.g. WIN THE GLASS" />
            <input class="cell-input" data-k="stat" placeholder="Stat line, e.g. Outrebounding opponents by 8.2 per game" />
          </div>
        </div>`
        )
        .join("")}`;

    card.querySelectorAll(".key-row").forEach((row) => {
      const key = keysState.keys[side][Number(row.dataset.i)];
      row.querySelectorAll("input[data-k]").forEach((input) => {
        input.value = key[input.dataset.k];
        input.oninput = () => {
          key[input.dataset.k] = input.value;
          markKeysDirty();
        };
      });
    });
    card.querySelector(".air-btn").onclick = () => setKeysSide(side);
    card.querySelector(".clear-btn").onclick = () => {
      if (!confirm(`Clear the ${side} keys?`)) return;
      keysState.keys[side] = keysState.keys[side].map(() => ({ topic: "", stat: "" }));
      markKeysDirty();
      renderKeys();
    };
  });

  renderKeysTeams();
  keysSaver.render();
}

// Switching sides is an on-air change, so it saves right away.
function setKeysSide(side) {
  keysState.side = side;
  renderKeysTeams();
  keysSaver.flush();
}

$("keysSide").onchange = () => setKeysSide($("keysSide").value);
$("keysHeader").oninput = () => {
  keysState.header = $("keysHeader").value;
  markKeysDirty();
};
$("keysSubHeader").oninput = () => {
  keysState.subHeader = $("keysSubHeader").value;
  markKeysDirty();
};

// Game setup may have changed teams since this tab was drawn.
document.querySelector('.tab[data-tab="keys"]').addEventListener("click", () => keysState && refreshKeysFeed());
teamsChanged.push(() => keysState && refreshKeysFeed());

appReady.then(async () => {
  keysState = await (await fetch(`/api/graphics/${KEYS_TITLE}`)).json();
  renderKeys();
  refreshKeysFeed();
});
