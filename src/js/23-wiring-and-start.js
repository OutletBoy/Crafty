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
for (const id of ["pfBase", "pfMax"]) $(id).addEventListener("input", climbHint);
$("strBtn").addEventListener("click", openStrains);
$("strDone").addEventListener("click", closeSheets);
$("strAdd").addEventListener("click", addStrain);
$("strNewName").addEventListener("keydown", e => { if (e.key === "Enter") addStrain(); });
$("strPasteAdd").addEventListener("click", pasteStrains);
$("stLook").addEventListener("click", () => lookUp(stEdit));
$("stSave").addEventListener("click", saveStrain);
$("stBack").addEventListener("click", () => { renderStrList(); showStrView("list"); });
$("stDel").addEventListener("click", deleteStrain);
$("stAddBatch").addEventListener("click", addBatch);
$("stTerps").addEventListener("input", () => { $("stTerpHint").textContent = terpHint(listOf($("stTerps").value)); });
$("btSave").addEventListener("click", saveBatch);
$("btBack").addEventListener("click", () => openStrain(stEdit));
$("btDel").addEventListener("click", deleteBatch);
$("btPhotoAdd").addEventListener("click", () => $("btFile").click());
$("btPhotoDel").addEventListener("click", removePhoto);
$("btFile").addEventListener("change", photoPicked);
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
$("bmSpent").addEventListener("click", () => bmSpent(false));
$("bmStill").addEventListener("click", bmStill);
$("bmNew").addEventListener("click", bmNewBowl);
// Clearing and resetting can be undone from the toast for a few seconds
$("histClear").addEventListener("click", () => {
  if (!H.length) return;
  const old = H; H = []; saveHist(); renderHistory();
  toast(`Cleared ${old.length} session${old.length === 1 ? "" : "s"}.`, 7000, { label: "Undo", fn: () => { H = cleanHist([...H, ...old]); H.sort((a, b) => b.start - a.start); saveHist(); renderHistory(); } });
});
$("resetFc").addEventListener("click", () => {
  const old = M, oldBL = BL, oldST = JSON.stringify(ST); M = { ...FC0, hlog: [] }; BL = cleanMeter(null);
  for (const x of ST.list) for (const y of [x, ...x.batches]) { y.k = BML0.k; y.taps = 0; } // strains keep their names, batches and photos
  fcSave(); saveMeter(); saveStrains(); render();
  toast("Learning reset. Estimates are back to the starting figures.", 7000, { label: "Undo", fn: () => { M = old; BL = oldBL; ST = cleanStrains(JSON.parse(oldST)); fcSave(); saveMeter(); saveStrains(); render(); } });
});
// Another tab of this page saved something: pick it up here, so two open tabs never undo each other's changes.
// (Only the tab connected to the Crafty writes the learned numbers, so those are only taken when this tab isn't connected.)
window.addEventListener("storage", e => {
  if (e.key === KEY.prof) { P = cleanProfiles(store.json(KEY.prof)); if ($("profEditView").hidden) renderProfList(); }
  else if (e.key === KEY.hist) { H = cleanHist(store.json(KEY.hist)); renderHistory(); }
  else if (e.key === KEY.light) { const l = e.newValue; if (LIGHTS.some(x => x[0] === l)) { lightMode = l; renderLights(); } }
  else if (e.key === KEY.unit) { if (e.newValue === "C" || e.newValue === "F") S.unit = e.newValue; }
  else if (e.key === KEY.model && !S.connected) M = cleanModel(store.json(KEY.model));
  else if (e.key === KEY.meter && !S.connected) BL = cleanMeter(store.json(KEY.meter));
  else if (e.key === KEY.strains) { ST = cleanStrains(store.json(KEY.strains)); if (openSh === "str" && stView === "list") renderStrList(); }
  else return;
  render();
});
document.addEventListener("touchmove", e => { if (!e.target.closest || !e.target.closest("input, .scroll")) e.preventDefault(); }, { passive: false });
$("verTag").textContent = "v" + VERSION.split(" ").pop();
$("verNote").textContent = `Page version ${VERSION}. Everything is kept on this phone. The one thing ever sent is a strain's name, to StrainAPI, when you add a strain by name or tap Look up.`;
if (store.damaged.length) toast("Some saved data was damaged and has been reset. A copy was kept on this phone.", 6000, null, "err");
renderLights(); renderTerps();
booted = true;
render();
offerImport();
setTimeout(() => prunePhotos(), 8000);
