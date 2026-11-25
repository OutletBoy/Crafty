// ---- Recorder controls ----
function setRec(on) {
  if (on === REC.on) return;
  REC.on = on;
  if (on) {
    if (!REC.rows.length) { REC.t0 = nowMs(); REC.dropped = 0; }
    rec("info", "recording on", VERSION);
    if (S.connected) recProbe();
  }
  render();
}
// Lists every characteristic the Crafty offers (with what each can do) and reads each one once.
// Unknown ones that can push updates are subscribed to; the known diagnostic candidates are read every second.
async function recProbe() {
  if (!S.connected || REC.probed) return;
  REC.probed = true; REC.probing = true; REC.diag = []; render();
  for (const [sk, svc] of Object.entries(S.svcs)) {
    let cs = [];
    try { cs = await gatt(() => svc.getCharacteristics()); } catch (e) { rec("probe", sk, "", "", "couldn't list: " + e.message); continue; }
    for (const c of cs) {
      const id = shortId(c.uuid), p = c.properties || {};
      const can = ["read", "write", "writeWithoutResponse", "notify", "indicate"].filter(x => p[x]).join("+");
      let v = null;
      if (p.read) { try { v = await gatt(() => c.readValue()); } catch (e) {} }
      const priv = id === "52"; // the serial number stays out of the recording
      rec("probe", id, v && !priv ? hex(v) : "", v && !priv ? u16(v) : "", `${sk} ${can}${priv ? " (serial, not recorded)" : ""}`);
      const known = Object.values(CH).some(([, u]) => shortId(u) === id);
      if (!known && (p.notify || p.indicate)) {
        c.addEventListener("characteristicvaluechanged", ev => { const v = u16(ev.target.value); rec("notify", id, hex(ev.target.value), v); });
        try { await gatt(() => c.startNotifications()); } catch (e) {}
      }
      if (p.read && DIAG.includes(id)) REC.diag.push(c);
    }
  }
  REC.probing = false;
  rec("info", "probe done", REC.diag.map(c => shortId(c.uuid)).join(" "), "", "read every 10 s");
  render();
}
// While recording: the diagnostics every 10 s, one reading at a time and at low priority, so your taps go first.
let diagBusy = false, diagSlowAt = 0;
async function recPollDiag() {
  if (diagBusy || !REC.diag.length || REC.probing || nowMs() - diagSlowAt < 10000) return;
  diagBusy = true; diagSlowAt = nowMs();
  try {
    for (const c of REC.diag) {
      if (!REC.on || !S.connected) break;
      try { const v = await gatt(() => c.readValue(), { key: "d:" + c.uuid }); rec("poll", shortId(c.uuid), hex(v), u16(v)); } catch (e) {}
    }
  } finally { diagBusy = false; }
}
const mmss = ms => { const s = Math.round(ms / 1000); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
function drawRec() {
  const n = REC.rows.length;
  put($("recBtn"), "@aria-checked", String(REC.on));
  put($("recRow"), "hidden", !REC.on && !n);
  put($("recTitle"), "text", REC.on ? "Recording now" : "Recording stopped");
  put($("recInfo"), "text", n ? `${n.toLocaleString()} readings · ${mmss(REC.rows[n - 1][0] - REC.t0)}${REC.dropped ? " · oldest trimmed" : ""} · kept until you close the page` : "Nothing yet");
  put($("recShare"), "disabled", !n);
}
const csvCell = v => { const s = String(v ?? ""); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
function recCsv() {
  const head = [
    `# Crafty Remote raw recording, page ${VERSION}`,
    `# started ${new Date(REC.t0).toISOString()}, ${REC.rows.length} rows${REC.dropped ? `, ${REC.dropped} oldest rows trimmed` : ""}`,
    `# device ${S.device && S.device.name || "?"}, firmware ${S.fw || "?"}, device unit ${S.devF ? "F" : "C"}, page unit ${S.unit}`,
    `# browser ${navigator.userAgent || "?"}`,
    "ms,time,kind,what,raw,value,note"
  ];
  return head.concat(REC.rows.map(r => [r[0] - REC.t0, new Date(r[0]).toISOString().slice(11, 23), r[1], r[2], r[3], r[4], r[5]].map(csvCell).join(","))).join("\n") + "\n";
}
// Hands a CSV to the phone's share sheet, or saves it to Downloads where there's no share sheet for files.
// Resolves "shared", "saved", "cancelled" (you closed the share sheet) or "failed".
async function shareCsv(name, csv, title, what) {
  try {
    const file = new File([csv], name, { type: "text/csv" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title }); return "shared"; }
  } catch (e) { if (e && e.name === "AbortError") return "cancelled"; }
  // No share sheet for files here: save it to Downloads instead
  try {
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    toast(`Saved to your Downloads as ${name}.`, 6000);
    return "saved";
  } catch (e) { fail(`Couldn't share or save the ${what}: ` + e.message + "."); return "failed"; }
}
const stamp = t => new Date(t).toISOString().slice(0, 16).replace(/[:T]/g, "-");
async function shareRec() {
  if (!REC.rows.length) return;
  await shareCsv(`crafty-recording-${stamp(REC.t0)}.csv`, recCsv(), "Crafty recording", "recording");
}
function clearRec() {
  const old = { rows: REC.rows, t0: REC.t0, dropped: REC.dropped };
  REC.rows = []; REC.dropped = 0; REC.t0 = nowMs(); render();
  toast("Recording cleared.", 7000, { label: "Undo", fn: () => { REC.rows = old.rows.concat(REC.rows); REC.t0 = old.t0; REC.dropped = old.dropped; render(); } });
}
