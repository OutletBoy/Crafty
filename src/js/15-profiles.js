// ---- Profiles and auto-climb ----
// Temperatures are stored in °C. A climb steps up by "step" each time another "mins" minutes at temperature pass.
const fromF = f => (f - 32) * 5 / 9;
const PROF0 = {
  active: "default",
  list: [
    { id: "default", name: "Default", mode: "steady", base: 185, step: 5.5, mins: 2, max: 205 },
    { id: "climb", name: "Slow climb", mode: "climb", base: fromF(360), step: 50 / 9, mins: 2, max: fromF(400), light: "heat" }
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

// Steps up once for every "mins" minutes at temperature since the last step. Never while you drag.
function climbCheck() {
  const pr = activeProfile();
  if (pr.mode !== "climb" || !S.connected || S.dragging || S.target == null) return;
  const top = clamp(pr.max, LIM.MIN, LIM.MAX);
  if (S.target >= top - 0.4) return;
  const n = Math.floor((CL.min - CL.mark) / pr.mins + 1e-9);
  if (n < 1) return;
  CL.mark += n * pr.mins;
  setTarget(Math.min(top, S.target + n * pr.step), 0);
  const m = Math.round(CL.min);
  toast(`Stepping up to ${fmt(S.target)}° after ${m} min at temperature`, 2800);
  buzz([8, 60, 8]);
}
function terpText() {
  const t = terpOf(TP);
  return t && S.connected ? `${t.name} · ${t.note.split(".")[0].split(",")[0]}` : "";
}
function climbText() {
  const pr = activeProfile();
  if (pr.mode !== "climb" || !S.connected || S.target == null) return "";
  if (S.target >= clamp(pr.max, LIM.MIN, LIM.MAX) - 0.4) return "Climb: at top temp";
  const next = Math.min(clamp(pr.max, LIM.MIN, LIM.MAX), S.target + pr.step);
  return `Next ${fmt(next)}° in ${Math.max(1, Math.ceil(CL.mark + pr.mins - CL.min - 1e-9))} min`;
}
function renderClimb() {
  const pr = activeProfile(), show = pr.mode === "climb" && S.connected && S.target != null;
  put($("climbBg"), "@opacity", show ? "1" : "0");
  put($("climbArc"), "@opacity", show ? "0.9" : "0");
  put($("climbArc"), "strokeDashoffset", String(CLIMBLEN * (1 - clamp((CL.min - CL.mark) / pr.mins, 0, 1))));
  put($("profName"), "text", pr.name);
  const t = terpOf(TP);
  put($("profSub"), "text", t ? t.name : pr.mode === "climb" ? `Climb to ${fmt(pr.max)}°` : `Steady ${fmt(startOf(pr))}°`);
  put($("profBtn"), "class", "qbtn prof" + (pr.mode === "climb" ? " climb" : ""));
}
function useProfile(id) {
  P.active = id; saveProfiles();
  const pr = activeProfile();
  TP = pr.terp && terpOf(pr.terp) ? pr.terp : null; renderTerps();
  if (S.connected) setTarget(startOf(pr), 0);
  CL.mark = CL.min;
  closeSheets(); render();
}

// Profile sheet
let editing = null, editMode = "steady";
const profDesc = p => {
  const t = terpOf(p.terp), from = t ? `${t.name} (${fmt(t.c)}°)` : `${fmt(p.base)}°`;
  return p.mode === "climb" ? `Climb ${from} to ${fmt(p.max)}°, +${Math.round(dU(p.step))}° every ${p.mins} min` : `Steady at ${from}`;
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
  const p = id ? P.list.find(x => x.id === id) : { id: null, name: "", mode: "climb", base: fromF(360), step: 50 / 9, mins: 2, max: fromF(400) };
  if (!p) { renderProfList(); return; }
  editing = p.id;
  for (const el of document.querySelectorAll(".pfU")) el.textContent = "(°" + S.unit + ")";
  $("pfName").value = p.name;
  $("pfBase").value = Math.round(toU(p.base));
  $("pfMax").value = Math.round(toU(p.max));
  $("pfStep").value = Math.round(dU(p.step));
  $("pfMins").value = p.mins;
  $("pfLight").value = p.light || "";
  $("pfTerp").value = terpOf(p.terp) ? p.terp : ""; syncTerpField();
  setEditMode(p.mode);
  $("pfDel").hidden = !p.id || p.id === "default";
  $("profTitle").textContent = p.id ? "Edit profile" : "New profile";
  $("profListView").hidden = true; $("profEditView").hidden = false;
}
// Reads the form. Returns null (and says which) when a number is missing.
function readForm() {
  const n = id => parseFloat($(id).value);
  const terp = terpOf($("pfTerp").value) ? $("pfTerp").value : "";
  const base = terp ? clamp(terpOf(terp).c, LIM.MIN, LIM.MAX) : clamp(fromU(n("pfBase")), LIM.MIN, LIM.MAX);
  let max = clamp(fromU(n("pfMax")), LIM.MIN, LIM.MAX);
  const step = clamp(S.unit === "F" ? n("pfStep") * 5 / 9 : n("pfStep"), 1, 30);
  const mins = clamp(Math.round(n("pfMins")), 1, 15);
  if ([base, max, step, mins].some(v => !isFinite(v))) return null;
  if (max < base) max = base;
  return { base, max, step, mins, terp };
}
// Tells you, as you type, where the climb will end up
function climbHint() {
  const f = editMode === "climb" && readForm();
  if (!f) { $("pfHint").textContent = editMode === "climb" ? "Fill in every number to see where this climb ends up." : ""; return; }
  const steps = Math.ceil((f.max - f.base) / f.step - 1e-6), reach = steps * f.mins;
  // Once a few sessions are logged, say when the climb runs past your usual session
  const usual = M.sessions >= 3 ? Math.round(M.sessMin) : 0;
  $("pfHint").textContent = steps <= 0 ? "Top temp is the start temp, so this won't climb."
    : `Reaches ${fmt(f.max)}° after about ${reach} min at temperature.` + (usual && reach > usual ? ` Your sessions usually last about ${usual} min, so step more often or by more to get there.` : "");
}
function saveEdit() {
  const f = readForm();
  if (!f) { toast("Fill in every number first.", 2500); return; }
  const name = ($("pfName").value || "").trim().slice(0, 24) || (editMode === "climb" ? "My climb" : "My profile");
  const data = { name, mode: editMode, ...f, light: $("pfLight").value || "" };
  const existing = editing && P.list.find(x => x.id === editing);
  if (existing) Object.assign(existing, data);
  else { const id = "p" + nowMs().toString(36); P.list.push({ id, ...data }); editing = id; } // new, or deleted in another tab meanwhile
  saveProfiles();
  if (editing === P.active) { TP = f.terp || null; renderTerps(); if (S.connected) setTarget(f.base, 0); CL.mark = CL.min; }
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

