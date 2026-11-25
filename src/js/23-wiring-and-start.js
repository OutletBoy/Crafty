// ---- Wiring ----
$("gearBtn").addEventListener("click", () => { renderLights(); showSheet("settings"); });
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
for (const id of ["pfBase", "pfMax", "pfStep", "pfMins"]) $(id).addEventListener("input", climbHint);
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
// Clearing and resetting can be undone from the toast for a few seconds
$("histClear").addEventListener("click", () => {
  if (!H.length) return;
  const old = H; H = []; saveHist(); renderHistory();
  toast(`Cleared ${old.length} session${old.length === 1 ? "" : "s"}.`, 7000, { label: "Undo", fn: () => { H = cleanHist([...H, ...old]); H.sort((a, b) => b.start - a.start); saveHist(); renderHistory(); } });
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
  else if (e.key === KEY.model && !S.connected) M = cleanModel(store.json(KEY.model));
  else return;
  render();
});
document.addEventListener("touchmove", e => { if (!e.target.closest || !e.target.closest("input, .scroll")) e.preventDefault(); }, { passive: false });
$("verTag").textContent = "v" + VERSION.split(" ").pop();
$("verNote").textContent = `Page version ${VERSION}. Everything is kept on this phone; nothing is sent anywhere.`;
if (store.damaged.length) toast("Some saved data was damaged and has been reset. A copy was kept on this phone.", 6000, null, "err");
renderLights(); renderTerps();
booted = true;
render();
