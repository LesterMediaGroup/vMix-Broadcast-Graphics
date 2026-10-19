// --- Impact Players (vMix title SSN_9048_v3) ---
// Four players, each from any team. Row N of the feed maps to the GT Designer
// layers PN_*. The team's logo and chosen color come from Teams; the headshot
// is built on the server from Settings → Headshots folder unless a path is
// typed for that player. Edits save themselves.

const IMPACT_TITLE = "SSN_9048_v3";
const emptyImpactPlayer = () => ({
  visible: true,
  teamAbbv: "",
  pos: "",
  number: "",
  first: "",
  last: "",
  headshot: "",
  colorKey: "primaryColor",
  logoKey: "primaryLogo",
});

let impact = null; // { title, sport, players: [...] }
let impactFeed = []; // last /out feed, for the resolved headshot paths
teamsChanged.push(() => impact && renderImpact());
settingsChanged.push(() => impact && refreshImpactFeed());

const impactSaver = autoSave({
  url: `/api/graphics/${IMPACT_TITLE}`,
  body: () => impact,
  statusId: "impactStatus",
  onSaved: () => !impactSaver.busy() && refreshImpactFeed(),
});

function markImpactDirty() {
  impactSaver.mark();
  renderImpactWarnings();
}

// The feed is the source of truth for headshot paths (and the Game setup
// sport when this tab's is blank), so read it back after each save.
async function refreshImpactFeed() {
  try {
    impactFeed = await (await fetch(`/out/graphics/${IMPACT_TITLE}.json`)).json();
  } catch {
    return;
  }
  $("impactSport").placeholder = impactFeed[0] && impactFeed[0].sport ? `${impactFeed[0].sport} (from Game setup)` : "Set a sport";
  $("impactTable").querySelectorAll("tr[data-i]").forEach((tr) => {
    const row = impactFeed[Number(tr.dataset.i)];
    const el = tr.querySelector(".headshot-path");
    el.textContent = row && row.headshot ? row.headshot : "—";
    el.title = el.textContent;
  });
  renderImpactWarnings();
}

function renderImpactWarnings() {
  const lines = [];
  const sport = impact.sport || (impactFeed[0] && impactFeed[0].sport);
  impact.players.forEach((p, i) => {
    if (!p.visible) return;
    const team = findTeam(p.teamAbbv);
    if (p.teamAbbv.trim() && !team) lines.push(`Player ${i + 1}: "${p.teamAbbv.trim()}" isn't in Teams (logo and color will be blank).`);
    if (!p.headshot && team && p.number && !sport) lines.push(`Player ${i + 1}: no sport set, so the headshot path can't be built.`);
  });
  // Everything needed is there but the server still built no path: the
  // Headshots folder setting is empty.
  const unbuilt = impact.players.some(
    (p, i) => p.visible && !p.headshot && p.number && sport && findTeam(p.teamAbbv) && impactFeed[i] && !impactFeed[i].headshot
  );
  if (unbuilt) lines.push("Set Settings → Headshots folder so headshot paths can be built.");
  $("impactWarnings").innerHTML = lines.map((l) => `<div>${l}</div>`).join("");
}

function impactColorOptions(p, i) {
  const team = findTeam(p.teamAbbv);
  if (!team) return `<span class="empty">—</span>`;
  if (!team[p.colorKey]) p.colorKey = "primaryColor";
  return `<div class="color-options">${COLOR_KEYS.filter(([key]) => team[key])
    .map(
      ([key, label]) => `
      <label class="color-option ${p.colorKey === key ? "checked" : ""}" title="${label} ${team[key]}">
        <input type="radio" name="impact-color-${i}" value="${key}" ${p.colorKey === key ? "checked" : ""} />
        <span class="swatch" style="background:${team[key]}"></span>
      </label>`
    )
    .join("")}</div>`;
}

function renderImpact() {
  $("impactTitle").value = impact.title;
  $("impactSport").value = impact.sport;

  $("impactTable").innerHTML = `
    <table>
      <thead>
        <tr>
          <th></th><th>#</th><th>Team</th><th>Pos</th><th>No.</th><th>First</th><th>Last</th>
          <th>Color (BKG)</th><th>Headshot</th><th></th>
        </tr>
      </thead>
      <tbody>
        ${impact.players
          .map(
            (p, i) => `
          <tr data-i="${i}" class="${p.visible ? "" : "hidden-slot"}">
            <td class="show-cell"><input type="checkbox" class="show-input" ${p.visible ? "checked" : ""} title="Show in graphic" /></td>
            <td class="rank-cell team-color-cell">${i + 1}</td>
            <td><input class="cell-input team-input" list="teamList" placeholder="Search team name" /></td>
            <td><input class="cell-input pos-input" data-f="pos" placeholder="OH" /></td>
            <td><input class="cell-input num-input" data-f="number" placeholder="00" /></td>
            <td><input class="cell-input name-input" data-f="first" placeholder="First" /></td>
            <td><input class="cell-input name-input" data-f="last" placeholder="Last" /></td>
            <td class="color-cell"></td>
            <td>
              <div class="headshot-cell">
                <span class="path-cell headshot-path">—</span>
                <input class="cell-input" data-f="headshot" placeholder="Override path (optional)" />
              </div>
            </td>
            <td class="row-actions">
              <button class="btn btn-ghost btn-sm up-btn" title="Move up" ${i === 0 ? "disabled" : ""}>▲</button>
              <button class="btn btn-ghost btn-sm down-btn" title="Move down" ${i === impact.players.length - 1 ? "disabled" : ""}>▼</button>
              <button class="btn btn-ghost btn-sm clear-btn">Clear</button>
            </td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>`;

  $("impactTable").querySelectorAll("tr[data-i]").forEach((tr) => {
    const i = Number(tr.dataset.i);
    const p = impact.players[i];
    const teamInput = tr.querySelector(".team-input");
    const colorCell = tr.querySelector(".color-cell");

    const refreshTeam = () => {
      const team = findTeam(p.teamAbbv);
      teamInput.classList.toggle("unknown", !!p.teamAbbv.trim() && !team);
      tr.querySelector(".team-color-cell").style.setProperty("--team-color", team ? team[p.colorKey] || team.primaryColor : "transparent");
      colorCell.innerHTML = impactColorOptions(p, i);
      colorCell.querySelectorAll("input[type=radio]").forEach((radio) => {
        radio.onchange = () => {
          p.colorKey = radio.value;
          markImpactDirty();
          refreshTeam();
        };
      });
    };

    tr.querySelector(".show-input").onchange = (e) => {
      p.visible = e.target.checked;
      tr.classList.toggle("hidden-slot", !p.visible);
      markImpactDirty();
    };

    // Shows the team's name; stores its abbv once the text matches a team.
    const initial = findTeam(p.teamAbbv);
    teamInput.value = initial ? initial.name : p.teamAbbv;
    teamInput.oninput = () => {
      const t = findTeam(teamInput.value);
      p.teamAbbv = t ? t.abbv : teamInput.value.trim();
      refreshTeam();
      markImpactDirty();
    };

    tr.querySelectorAll("input[data-f]").forEach((input) => {
      const f = input.dataset.f;
      input.value = p[f];
      input.oninput = () => {
        p[f] = f === "pos" ? input.value.toUpperCase() : input.value;
        markImpactDirty();
      };
    });
    refreshTeam();

    const swap = (j) => {
      [impact.players[i], impact.players[j]] = [impact.players[j], impact.players[i]];
      markImpactDirty();
      renderImpact();
    };
    tr.querySelector(".up-btn").onclick = () => swap(i - 1);
    tr.querySelector(".down-btn").onclick = () => swap(i + 1);
    tr.querySelector(".clear-btn").onclick = () => {
      impact.players[i] = emptyImpactPlayer();
      markImpactDirty();
      renderImpact();
    };
  });

  impactSaver.render();
  refreshImpactFeed();
}

$("impactTitle").oninput = () => {
  impact.title = $("impactTitle").value;
  markImpactDirty();
};
$("impactSport").oninput = () => {
  impact.sport = $("impactSport").value;
  markImpactDirty();
};

appReady.then(async () => {
  impact = await (await fetch(`/api/graphics/${IMPACT_TITLE}`)).json();
  renderImpact();
});
