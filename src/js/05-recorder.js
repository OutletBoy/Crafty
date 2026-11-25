// ---- Raw data recorder (Settings > Pull detection) ----
// Off by default. While on, every reading, write and pull-detector decision is kept in memory with a timestamp,
// and every characteristic the Crafty offers is listed once, so pull detection can be tuned from real data.
// Nothing is sent anywhere: Share hands a CSV file to the phone's share sheet (or saves it to Downloads).
const REC = { on: false, rows: [], t0: 0, dropped: 0, probed: false, probing: false, diag: [], max: 60000 };
// The pull-labeling session (see "Pull labeling" below). Declared here because rec() feeds it.
const LB = { open: false, t0: 0, n: 0, labels: [], rows: [], auto: [], dev: [], trimmed: 0, devName: "", fw: "", devF: false,
             hold: null, tick: null, wait: null, waitT: null, temp: null, tempOff: false, applying: false, recWas: false, msg: "", msgAt: 0, saveT: null, listKey: "",
             page: "", sharedKey: "", asking: false };
function rec(kind, key, a = "", b = "", note = "") {
  if (!REC.on && !LB.open) return;
  const row = [nowMs(), kind, key, a, b, note];
  if (REC.on) {
    if (REC.rows.length >= REC.max) { REC.rows.splice(0, 10000); REC.dropped += 10000; }
    REC.rows.push(row);
  }
  if (LB.open) lbRow(row);
  render();
}

