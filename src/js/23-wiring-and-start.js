// ---- Wiring ----
$("gearBtn").addEventListener("click", () => { renderLights(); renderSens(); showSheet("settings"); });
$("setDone").addEventListener("click", closeSheets);
$("histBtn").addEventListener("click", openHist);
$("histClose").addEventListener("click", closeSheets);
$("profBtn").addEventListener("click", openProf);
$("profDone").addEventListener("click", closeSheets);
$("profNew").addEventListener("click", () => editProfile(null));
$("pfSteady").addEventListener("click", () => setEditMode("steady"));
$("pfClimb").addEventListener("click", () => setEditMode("climb"));
$("pfSave").addEventListener("click", saveEdit);
$("pfCancel").addEventListener("click", showProfList);
$("pfDel").addEventListener("click", deleteEdit);
$("pfTerp").addEventListener("change", syncTerpField);
for (const id of ["pfBase", "pfMax", "pfStep", "pfEvery"]) $(id).addEventListener("input", climbHint);
$("mainBtn").addEventListener("click", () => S.connected ? toggleHeater() : S.connecting ? null : (stopReconnect(), connect()));
$("toast").addEventListener("click", () => { $("toast").hidden = true; });
$("findBtn").addEventListener("click", findDevice);
$("discBtn").addEventListener("click", () => S.connected || S.reconnecting ? disconnect() : forgetDevice());
$("led").addEventListener("input", e => setLed(e.target.value));
const setUnit = u => { S.unit = u; store.set(KEY.unit, u); renderTerps(); render(); };
$("unitF").addEventListener("click", () => setUnit("F"));
$("unitC").addEventListener("click", () => setUnit("C"));
$("recBtn").addEventListener("click", () => setRec(!REC.on));
$("recShare").addEventListener("click", shareRec);
$("recClear").addEventListener("click", clearRec);
$("gtBtn").addEventListener("click", gtStart);
$("gtMain").addEventListener("click", gtStart);
$("pullBtn").addEventListener("click", pullTap);
$("gStop").addEventListener("click", () => gtStop(""));
$("gShare").addEventListener("click", shareRec);
$("lbBtn").addEventListener("click", lbNew);
$("lbCont").addEventListener("click", lbOpen);
$("lbMain").addEventListener("click", () => lbOld() ? lbNew() : lbOpen());
$("lbNew").addEventListener("click", lbNew);
$("lbAskShare").addEventListener("click", lbAskShare);
$("lbAskDrop").addEventListener("click", lbAskDrop);
$("lbAskNo").addEventListener("click", lbAskHide);
$("lbClose").addEventListener("click", () => lbClose());
$("lbUndo").addEventListener("click", lbUndo);
$("lbShare").addEventListener("click", () => lbShare());
$("lbAct").addEventListener("click", () => {
  if (!S.connected) { if (!S.connecting) { stopReconnect(); connect(); } }
  else if (!heatingNow() && !S.pending) toggleHeater();
  else if (LB.tempOff) lbApplyTemp("you set it back");
});
$("lbTMinus").addEventListener("click", () => lbTempStep(-1));
$("lbTPlus").addEventListener("click", () => lbTempStep(1));
for (const [k, , id] of LB_KINDS) {
  const el = $(id);
  el.addEventListener("pointerdown", ev => { if (ev.button > 0) return; ev.preventDefault(); lbDown(k, el, ev.pointerId); });
  el.addEventListener("pointerup", ev => lbUp(ev.pointerId));
  el.addEventListener("pointercancel", ev => lbCancelHold("cancel", ev.pointerId));
  el.addEventListener("lostpointercapture", ev => lbCancelHold("cancel", ev.pointerId));
  el.addEventListener("contextmenu", ev => ev.preventDefault());
  el.addEventListener("keydown", ev => { if (ev.key === " " || ev.key === "Enter") { ev.preventDefault(); if (!ev.repeat) lbDown(k, el, "key"); } });
  el.addEventListener("keyup", ev => { if (ev.key === " " || ev.key === "Enter") { ev.preventDefault(); lbUp("key"); } });
}
// The wait cover sits over the buttons: pressing it says why, Go anyway (after the minimum wait) lifts it
$("lbWait").addEventListener("pointerdown", ev => { if (ev.target === $("lbGo")) return; ev.preventDefault(); lbWaitNudge(); });
$("lbWait").addEventListener("contextmenu", ev => ev.preventDefault());
$("lbGo").addEventListener("click", lbGoAnyway);
// A finger that comes up somewhere the button can't hear (if the phone refused to keep the touch on it) still ends the hold
window.addEventListener("pointerup", ev => lbUp(ev.pointerId));
window.addEventListener("pointercancel", ev => lbCancelHold("cancel", ev.pointerId));
window.addEventListener("blur", () => lbCancelHold("hidden"));
$("newBowl").addEventListener("click", () => {
  const old = { p: B.p, hits: B.hits, mark: CL.mark };
  newBowl(false);
  toast("New bowl started.", 5000, { label: "Undo", fn: () => { B.p = old.p; B.hits = old.hits; CL.mark = old.mark; fcSave(); render(); } });
});
// Clearing and resetting can be undone from the toast for a few seconds
$("histClear").addEventListener("click", () => {
  if (!H.length) return;
  const old = H; H = []; saveHist(); renderHistory();
  toast(`Cleared ${old.length} session${old.length === 1 ? "" : "s"}.`, 7000, { label: "Undo", fn: () => { H = cleanHist([...H, ...old]); H.sort((a, b) => b.start - a.start); saveHist(); renderHistory(); } });
});
$("bestReset").addEventListener("click", () => {
  if (!M.bestArea) return;
  const b = M.bestArea, at = M.bestAt; M.bestArea = 0; M.bestAt = 0; fcSave(); render();
  toast("Best pull cleared.", 7000, { label: "Undo", fn: () => { if (b > M.bestArea) { M.bestArea = b; M.bestAt = at; } fcSave(); render(); } });
});
$("resetFc").addEventListener("click", () => {
  const old = M; M = { ...FC0, hlog: [] }; fcSave(); render();
  toast("Learning reset. Estimates are back to the starting figures.", 7000, { label: "Undo", fn: () => { M = old; fcSave(); render(); } });
});
// Another tab of this page saved something: pick it up here, so two open tabs never undo each other's changes.
// (Only the tab connected to the Crafty writes the learned numbers, so those are only taken when this tab isn't connected.)
window.addEventListener("storage", e => {
  if (e.key === KEY.prof) { P = cleanProfiles(store.json(KEY.prof)); if ($("profEditView").hidden) renderProfList(); }
  else if (e.key === KEY.hist) { H = cleanHist(store.json(KEY.hist)); renderHistory(); }
  else if (e.key === KEY.light) { const l = e.newValue; if (LIGHTS.some(x => x[0] === l)) { lightMode = l; renderLights(); } }
  else if (e.key === KEY.unit) { if (e.newValue === "C" || e.newValue === "F") S.unit = e.newValue; }
  else if (e.key === KEY.pd) { const j = store.json(KEY.pd); if (j && SENS[j.sens]) { pdSens = j.sens; renderSens(); } if (j && j.gtDone) gtDone = true; }
  else if (e.key === KEY.model && !S.connected) M = cleanModel(store.json(KEY.model));
  else return;
  render();
});
document.addEventListener("touchmove", e => { if (!e.target.closest || !e.target.closest("input, .scroll")) e.preventDefault(); }, { passive: false });
$("verTag").textContent = "v" + VERSION.split(" ").pop();
$("verNote").textContent = `Page version ${VERSION}. Everything is kept on this phone; nothing is sent anywhere.`;
if (store.damaged.length) toast("Some saved data was damaged and has been reset. A copy was kept on this phone.", 6000, null, "err");
renderLights(); renderSens(); renderTerps();
booted = true;
render();
