// ---- The Crafty's own use detector ----
// 0x71 counts down to the Crafty's auto-off and jumps back to the top when the Crafty itself senses use. Both of
// Outlet's guided tests showed it jumping back exactly when the page's temperature detector counted a pull, and
// never for the soft or short pulls. That makes it the honest benchmark for what this Crafty can sense at all.
// It's only noted in the recording and the test summary; it never counts a pull, because pressing the Crafty's
// buttons or changing the temperature resets it too.
const DEV = { last: null, uses: [], wroteAt: 0 };
function devTimer(v, t) {
  if (DEV.last != null && v > DEV.last + 5 && t - DEV.wroteAt > 5000) { DEV.uses.push(t); if (DEV.uses.length > 200) DEV.uses.shift(); if (LB.open) LB.dev.push(t); rec("dev", "use sensed", v, DEV.last, "the Crafty's own auto-off timer reset"); }
  DEV.last = v;
}
// While recording: the other diagnostics every 10 s, one reading at a time and at low priority, so your taps go
// first. (Round 7 read battery current four times a second to look for pulls in heater power. Outlet's second test
// showed the heater pulses on and off every few seconds whether or not anyone pulls, and the average current was
// no higher during the soft pulls than at rest, so that fast reading was dropped.)
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
    `# device ${S.device && S.device.name || "?"}, firmware ${S.fw || "?"}, device unit ${S.devF ? "F" : "C"}, page unit ${S.unit}, sensitivity ${pdSens}`,
    `# learned: usual pull ${M.typArea.toFixed(2)} °C·s over ${M.pulls} pulls, full bowl ${M.pFull.toFixed(1)}`,
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

