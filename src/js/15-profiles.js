// ---- Profiles and Follow the bowl ----
// Temperatures are stored in °C. A "Follow the bowl" profile (saved as mode "climb", the name older pages used) starts at
// its start temp and steps up one 5 °F level each time the bowl meter says the level you're at is spent, up to its top temp.
// It replaced the timed climb in r15. "step" and "mins" are older pages' timed-climb settings, kept so older pages still read them.
const fromF = f => (f - 32) * 5 / 9;
const PROF0 = {
  active: "default",
  list: [
    { id: "default", name: "Default", mode: "steady", base: 185, step: 5.5, mins: 2, max: 205 },
    { id: "climb", name: "Follow the bowl", mode: "climb", base: fromF(360), step: 50 / 9, mins: 2, max: fromF(400), light: "heat" }
  ]
};
// Each saved profile is checked field by field; a bad field gets a safe value instead of breaking the list.
// Default always exists and the active profile always points at a real one.
// Older pages stepped every N pulls, then every N % of the bowl. Pulls become the same share of a 12-pull bowl,
// and a share of the bowl becomes minutes of an ~8-minute session (20% is about 2 minutes).
function cleanProfiles(j) {
  const out = JSON.parse(JSON.stringify(PROF0));
  if (!j || !Array.isArray(j.list)) return out;
  const seen = new Set();
  const list = j.list.filter(p => p && typeof p.id === "string" && !seen.has(p.id) && seen.add(p.id)).map(p => {
    const base = num(p.base, 185, LIM.MIN, LIM.MAX);
    const every = num(p.every, isFinite(p.thr) ? Math.round(num(p.thr, 3, 0.5, 30) / 12 * 20) * 5 : 20, 5, 50);
    const mins = Math.round(num(p.mins, Math.max(1, Math.round(every * 8 / 100)), 1, 15));
    return { id: p.id, name: (typeof p.name === "string" && p.name.trim().slice(0, 24)) || "My profile", mode: p.mode === "climb" ? "climb" : "steady",
             base, max: Math.max(base, num(p.max, LIM.MAX, LIM.MIN, LIM.MAX)), step: num(p.step, 5.5, 1, 30), mins,
             light: typeof p.light === "string" ? p.light : "", terp: typeof p.terp === "string" ? p.terp : "" };
  });
  if (!list.some(p => p.id === "default")) list.unshift(out.list[0]);
  return { active: list.some(p => p.id === j.active) ? j.active : "default", list };
}
let P = cleanProfiles(store.json(KEY.prof));
const saveProfiles = () => store.set(KEY.prof, P);
const activeProfile = () => P.list.find(p => p.id === P.active) || P.list[0];

// Follow the bowl. A step needs all three: the level you're at reads spent, the chamber has been within 1.5 °C of the
// target for 10 s (so a reading mid-heat-up can't trigger it), and 45 s settled at this level since the last step.
// Setting the temperature yourself pauses it; Resume, a new bowl or picking the profile again starts it again.
const FOL = { near: 1.5, settle: 10, dwell: 45 };
const FL = { paused: false, near: 0, dwell: 0, topSaid: false };
const followTop = pr => clamp(pr.max, LIM.MIN, LIM.MAX);
const following = () => activeProfile().mode === "climb" && S.connected && S.target != null;
const followOwns = () => following() && !FL.paused; // while it's in charge, it does the talking when a level runs out
// The next level up from T, never past the top
const nextLevel = (T, top) => { top = Math.min(top, LIM.MAX); if (T >= top - 0.4) return null; const b = BANDS.find(x => x > T + 0.5); return b == null ? top : Math.min(top, b); };
function followReset() { FL.paused = false; FL.near = 0; FL.dwell = 0; FL.topSaid = false; }
// Every second the heater's on, from fcTick
function followTick(dt) {
  if (!followOwns() || S.dragging || !F.heaterOn) return;
  const s = dt * 60;
  if (S.current != null && Math.abs(S.current - effTarget()) <= FOL.near) { FL.near += s; FL.dwell += s; } else FL.near = 0;
  if (levelFill(effTarget()) < 1 || FL.near < FOL.settle || FL.dwell < FOL.dwell) return;
  const T = S.target, to = nextLevel(T, followTop(activeProfile()));
  if (to == null) {
    if (!FL.topSaid) { FL.topSaid = true; toast(`${fmt(T)}° is spent, and that's this profile's top temp. Time for a new bowl.`, 7000); buzz([8, 60, 8]); }
    return;
  }
  FL.near = 0; FL.dwell = 0;
  setTarget(to, 0);
  toast(`Stepping up to ${fmt(to)}°. ${fmt(T)}° is spent.`, 7000, { label: "Not yet", fn: () => followNotYet(T, to) });
  buzz([8, 60, 8]);
}
// "Not yet": back down, and the meter learns this level lasts a bit longer
function followNotYet(from, to) {
  if (!S.connected || Math.abs(S.target - to) > 0.2) return; // the temperature has moved on since
  setTarget(from, 0);
  FL.near = 0; FL.dwell = 0;
  bmStillAt(from, true);
  toast(`Back to ${fmt(from)}°. The meter will give this level longer.`, 4000);
}
function followPause() {
  if (!followOwns()) return;
  FL.paused = true;
  toast("Follow the bowl paused because you set the temperature.", 7000, { label: "Resume", fn: followResume });
}
function followResume() { FL.paused = false; FL.near = 0; FL.dwell = 0; render(); }
function terpText() {
  const t = terpOf(TP);
  return t && S.connected ? `${t.name} · ${t.note.split(".")[0].split(",")[0]}` : "";
}
function climbText() {
  if (!following()) return "";
  if (FL.paused) return "Follow paused";
  const to = nextLevel(S.target, followTop(activeProfile()));
  return to == null ? "Following: at top temp" : `Next ${fmt(to)}° when this level is spent`;
}
function renderClimb() {
  const pr = activeProfile(), show = following();
  put($("climbBg"), "@opacity", show ? "1" : "0");
  put($("climbArc"), "@opacity", show && !FL.paused ? "0.9" : "0");
  put($("climbArc"), "strokeDashoffset", String(CLIMBLEN * (1 - (show ? levelFill(effTarget()) : 0))));
  put($("profName"), "text", pr.name);
  const t = terpOf(TP);
  put($("profSub"), "text", t ? t.name : pr.mode === "climb" ? `Follow to ${fmt(pr.max)}°` : `Steady ${fmt(startOf(pr))}°`);
  put($("profBtn"), "class", "qbtn prof" + (pr.mode === "climb" ? " climb" : ""));
}
function useProfile(id) {
  P.active = id; saveProfiles();
  const pr = activeProfile();
  TP = pr.terp && terpOf(pr.terp) ? pr.terp : null; renderTerps();
  if (S.connected) setTarget(startOf(pr), 0);
  followReset();
  closeSheets(); render();
}

// Profile sheet
let editing = null, editMode = "steady";
const profDesc = p => {
  const t = terpOf(p.terp), from = t ? `${t.name} (${fmt(t.c)}°)` : `${fmt(p.base)}°`;
  return p.mode === "climb" ? `Follows the bowl, ${from} up to ${fmt(p.max)}°` : `Steady at ${from}`;
};
function renderProfList() {
  $("profList").replaceChildren(...P.list.map(p => {
    const row = document.createElement("div"); row.className = "prow" + (p.id === P.active ? " on" : "");
    const pick = document.createElement("button"); pick.className = "pick";
    const dotEl = document.createElement("i"), txt = document.createElement("span");
    const b = document.createElement("b"); b.textContent = p.name;
    const sm = document.createElement("small"); sm.textContent = profDesc(p);
    txt.append(b, sm); pick.append(dotEl, txt); pick.addEventListener("click", () => useProfile(p.id));
    const ed = document.createElement("button"); ed.className = "btn"; ed.textContent = "Edit";
    ed.addEventListener("click", () => editProfile(p.id));
    row.append(pick, ed); return row;
  }));
}
const showProfList = () => { $("profListView").hidden = false; $("profEditView").hidden = true; $("profTitle").textContent = "Profiles"; };
function openProf() { renderTerps(); renderProfList(); showProfList(); showSheet("prof"); }
function setEditMode(m) {
  editMode = m;
  $("pfSteady").className = m === "steady" ? "on" : ""; $("pfClimb").className = m === "climb" ? "on" : "";
  for (const el of document.querySelectorAll(".climbOnly")) el.hidden = m !== "climb";
  climbHint();
}
function editProfile(id) {
  const p = id ? P.list.find(x => x.id === id) : { id: null, name: "", mode: "climb", base: fromF(360), max: fromF(400) };
  if (!p) { renderProfList(); return; }
  editing = p.id;
  for (const el of document.querySelectorAll(".pfU")) el.textContent = "(°" + S.unit + ")";
  $("pfName").value = p.name;
  $("pfBase").value = Math.round(toU(p.base));
  $("pfMax").value = Math.round(toU(p.max));
  $("pfLight").value = p.light || "";
  $("pfTerp").value = terpOf(p.terp) ? p.terp : ""; syncTerpField();
  setEditMode(p.mode);
  $("pfDel").hidden = !p.id || p.id === "default";
  $("profTitle").textContent = p.id ? "Edit profile" : "New profile";
  $("profListView").hidden = true; $("profEditView").hidden = false;
}
// Reads the form. Returns null when a number is missing.
function readForm() {
  const n = id => parseFloat($(id).value);
  const terp = terpOf($("pfTerp").value) ? $("pfTerp").value : "";
  const base = terp ? clamp(terpOf(terp).c, LIM.MIN, LIM.MAX) : clamp(fromU(n("pfBase")), LIM.MIN, LIM.MAX);
  let max = editMode === "climb" ? clamp(fromU(n("pfMax")), LIM.MIN, LIM.MAX) : base;
  if ([base, max].some(v => !isFinite(v))) return null;
  if (max < base) max = base;
  return { base, max, terp };
}
// Tells you, as you type, how many levels this will step through
function climbHint() {
  const f = editMode === "climb" && readForm();
  if (!f) { $("pfHint").textContent = editMode === "climb" ? "Fill in the start and top temps to see the steps." : ""; return; }
  let n = 0, T = f.base;
  for (let to; (to = nextLevel(T, f.max)) != null && n < 40; n++) T = to;
  $("pfHint").textContent = n === 0 ? "Top temp is the start temp, so this won't step up."
    : `Steps up ${n} time${n === 1 ? "" : "s"}, one level each time the bowl meter says a level is spent, ending at ${fmt(f.max)}°.`;
}
function saveEdit() {
  const f = readForm();
  if (!f) { toast("Fill in every number first.", 2500); return; }
  const name = ($("pfName").value || "").trim().slice(0, 24) || (editMode === "climb" ? "My follow" : "My profile");
  const data = { name, mode: editMode, ...f, light: $("pfLight").value || "" };
  const existing = editing && P.list.find(x => x.id === editing);
  if (existing) Object.assign(existing, data);
  else { const id = "p" + nowMs().toString(36); P.list.push({ id, ...data }); editing = id; } // new, or deleted in another tab meanwhile
  saveProfiles();
  if (editing === P.active) { TP = f.terp || null; renderTerps(); if (S.connected) setTarget(f.base, 0); followReset(); }
  renderProfList(); showProfList(); render();
}
function deleteEdit() {
  if (!editing || editing === "default") return;
  const idx = P.list.findIndex(x => x.id === editing); if (idx < 0) return;
  const gone = P.list[idx], wasActive = P.active === gone.id;
  P.list.splice(idx, 1);
  if (wasActive) P.active = "default";
  saveProfiles(); renderProfList(); showProfList(); render();
  toast(`Deleted ${gone.name}.`, 7000, { label: "Undo", fn: () => {
    if (!P.list.some(x => x.id === gone.id)) P.list.splice(Math.min(idx, P.list.length), 0, gone);
    if (wasActive) P.active = gone.id;
    saveProfiles(); renderProfList(); render();
  } });
}
function syncTerpField() {
  const t = terpOf($("pfTerp").value);
  $("pfBase").disabled = !!t;
  if (t) $("pfBase").value = Math.round(toU(clamp(t.c, LIM.MIN, LIM.MAX)));
  climbHint();
}
$("pfTerp").replaceChildren(...[["", "None, use start temp"], ...TERPS.map(t => [t.id, `${t.name} · ${t.note.split(".")[0]}`])].map(([v, l]) => Object.assign(document.createElement("option"), { value: v, textContent: l })));

