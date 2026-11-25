// ---- Raw data recorder (Settings > Diagnostics) ----
// Off by default. While on, every reading and write is kept in memory with a timestamp, and every characteristic
// the Crafty offers is listed once, so a problem can be looked into from real data.
// Nothing is sent anywhere: Share hands a CSV file to the phone's share sheet (or saves it to Downloads).
const REC = { on: false, rows: [], t0: 0, dropped: 0, probed: false, probing: false, diag: [], max: 60000 };
function rec(kind, key, a = "", b = "", note = "") {
  if (!REC.on) return;
  if (REC.rows.length >= REC.max) { REC.rows.splice(0, 10000); REC.dropped += 10000; }
  REC.rows.push([nowMs(), kind, key, a, b, note]);
  render();
}
