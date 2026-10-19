// /out/game.json values that vMix depends on: the broadcast-start countdown
// string and the crew/officials slots.
const BASE = process.env.BASE;
let pass = 0, fail = 0;
const check = (label, ok, extra = "") => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? "  — " + extra : ""}`);
};
const row = async (game) => {
  await fetch(BASE + "api/game", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(game) });
  return (await (await fetch(BASE + "out/game.json")).json())[0];
};

// The vMix countdown-to-time format: {0:<end time>|<display format>}; the
// part after the pipe is the literal format string.
const cases = [
  ["6:45 PM", "", "{0:6:45 PM|HH:mm:ss}", "18:45:00"],
  ["6:45pm", "", "{0:6:45 PM|HH:mm:ss}", "18:45:00"],
  ["6:45 p.m.", "", "{0:6:45 PM|HH:mm:ss}", "18:45:00"],
  ["7 PM", "", "{0:7:00 PM|HH:mm:ss}", "19:00:00"],
  ["12:00 AM", "", "{0:12:00 AM|HH:mm:ss}", "00:00:00"],
  ["12:30 PM", "", "{0:12:30 PM|HH:mm:ss}", "12:30:00"],
  ["18:45", "", "{0:6:45 PM|HH:mm:ss}", "18:45:00"],
  ["6:45 PM", "2026-11-14", "{0:2026-11-14 6:45 PM|HH:mm:ss}", "18:45:00"],
  ["7", "", "", ""],
  ["13:00 PM", "", "", ""],
  ["6:75 PM", "", "", ""],
  ["noon", "", "", ""],
];
for (const [typed, date, countdown, clock] of cases) {
  const r = await row({ broadcastStart: typed, date });
  check(`broadcastStart "${typed}"${date ? " + date" : ""}`, r.broadcastStart === countdown && r.broadcastStartClock === clock, `${r.broadcastStart} / ${r.broadcastStartClock}`);
}

const r = await row({
  away: { teamAbbv: "BC", coach: "A", coachSeason: "11" },
  home: { teamAbbv: "BU", coach: "B", coachSeason: "22" },
  crew: [{ role: "Play by Play", name: "P" }, { role: "", name: "" }, { role: "Camera 3", name: "C1" }, { role: "Camera 3", name: "C2" }],
  officials: [{ role: "Referee", name: "R" }],
});
check("matchup", r.matchup === "Brookfield at Bayport");
check("Season labels (11th, 22nd)", r.awayCoachSeasonLabel === "11th Season" && r.homeCoachSeasonLabel === "22nd Season");
check("Crew slots skip blanks", r.crew1Name === "P" && r.crew2Name === "C1" && r.crew3Name === "C2" && r.crew4Name === "");
check("Crew role fields", r.crewPlayByPlay === "P" && r.crewCamera3 === "C1 & C2");
check("Officials line", r.officialLine === "Referee: R");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
