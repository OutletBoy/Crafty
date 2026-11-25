// ---- Recorder controls ----
function setRec(on) {
  if (on === REC.on) return;
  REC.on = on;
  if (on) {
    if (!REC.rows.length) { REC.t0 = nowMs(); REC.dropped = 0; }
    rec("info", "recording on", VERSION, pdSens);
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
        c.addEventListener("characteristicvaluechanged", ev => { const v = u16(ev.target.value); rec("notify", id, hex(ev.target.value), v); if (id === "71") devTimer(v, nowMs()); });
        try { await gatt(() => c.startNotifications()); } catch (e) {}
      }
      if (p.read && DIAG.includes(id)) REC.diag.push(c);
    }
  }
  REC.probing = false;
  rec("info", "probe done", REC.diag.map(c => shortId(c.uuid)).join(" "), "", "read every 10 s");
  render();
}
