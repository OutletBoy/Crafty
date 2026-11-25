// ---- Bluetooth operations ----
// The Crafty takes one operation at a time. Writes (your taps) jump ahead of background reads, a read that's
// already waiting isn't queued twice, and nothing can wait forever: a stuck operation times out and the next one runs.
const withTimeout = (p, ms) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(ERR("TimeoutError")), ms);
  p.then(v => { clearTimeout(t); res(v); }, e => { clearTimeout(t); rej(e); });
});
const ERR = (name, message = "") => Object.assign(new Error(message), { name });
const ops = []; let opBusy = false;
function gatt(fn, o = {}) {
  if (o.key) { const q = ops.find(x => x.key === o.key); if (q) return q.p; }
  const op = { fn, key: o.key || null, prio: !!o.prio, timeout: o.timeout || CFG.opTimeout };
  op.p = new Promise((res, rej) => { op.res = res; op.rej = rej; });
  if (op.prio) { const i = ops.findIndex(x => !x.prio); i < 0 ? ops.push(op) : ops.splice(i, 0, op); } else ops.push(op);
  pump();
  return op.p;
}
async function pump() {
  if (opBusy) return;
  const op = ops.shift(); if (!op) return;
  opBusy = true;
  try { op.res(await withTimeout(Promise.resolve().then(op.fn), op.timeout)); } catch (e) { op.rej(e); }
  opBusy = false; pump();
}
const flushOps = () => { for (const op of ops.splice(0)) op.rej(ERR("NetworkError", "disconnected")); };
const read = k => S.chars[k] ? gatt(() => S.chars[k].readValue(), { key: "r:" + k }) : Promise.resolve(null);
const write = (k, buf) => {
  if (!S.chars[k]) return Promise.reject(new Error("your Crafty doesn't offer this over Bluetooth"));
  rec("write", k, hex(new DataView(buf)), u16(new DataView(buf)));
  DEV.wroteAt = nowMs(); // a write resets the Crafty's own use timer, so it isn't a pull
  return gatt(() => (S.chars[k].writeValueWithResponse || S.chars[k].writeValue).call(S.chars[k], buf), { prio: true });
};

