// ---- Protocol (from the open-source reactive-volcano-app, storzandbickel-ble and gocrafty projects) ----
const SUFFIX = "-4c45-4b43-4942-265a524f5453";
const U = h => h.padStart(8, "0") + SUFFIX;
const SVC = { s1: U("1"), s2: U("2"), s3: U("3") };
const CH = {
  current:   ["s1", U("11")], // °C x10 (0.1 °C steps), notify
  target:    ["s1", U("21")], // °C x10, read/write (°F x10 when the Crafty is set to °F)
  boost:     ["s1", U("31")], // boost offset °C x10, read/write
  battery:   ["s1", U("41")], // %, notify
  led:       ["s1", U("51")], // 0-100
  heaterOn:  ["s1", U("81")], // write 0x0000
  heaterOff: ["s1", U("91")], // write 0x0000
  firmware:  ["s2", U("32")], // text, e.g. "V03.10"
  serial:    ["s2", U("52")], // text, first 8 chars
  project:   ["s3", U("93")], // bit4 heater, bit5 boost, bit6 superboost, bit8 at temperature
  status2:   ["s3", U("1c3")], // bit2 setpoint reached (pulses ~2 s), bit3 find device
  power:     ["s3", U("83")],  // bit0 charger connected
  useHours:  ["s3", U("23")],  // lifetime heater use, whole hours
  useMins:   ["s3", U("1e3")]  // ...plus minutes (firmware 2.51 and newer)
};
// Undocumented diagnostics seen on older firmware (forum reverse-engineering): battery and heater voltage, battery
// current, raw sensor temperatures. Only read while "Record raw data" is on, so a recording shows what the Crafty reports.
const DIAG = ["63", "73", "b3", "c3", "d3", "e3", "f3", "103", "113", "71"];
const LIM = { MIN: 40, MAX: 210, BOOST_MAX: 30 };
// Timing for connecting and for getting the Crafty back after a dropout. Kept in one object so it's easy to tune.
const CFG = { connectTimeout: 12000, opTimeout: 6000, retryDelays: [1000, 2000, 4000, 8000, 15000, 30000, 30000], resumeWindow: 5 * 60000 };
const BIT = { HEATER: 1 << 4, BOOST: 1 << 5, SUPER: 1 << 6, ATTEMP: 1 << 8, READY: 1 << 2, FIND: 1 << 3 };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const u16 = dv => !dv || dv.byteLength === 0 ? 0 : dv.byteLength === 1 ? dv.getUint8(0) : dv.getUint16(0, true);
const enc16 = v => { const b = new ArrayBuffer(2); new DataView(b).setUint16(0, Math.round(v) & 0xffff, true); return b; };
const text = dv => new TextDecoder().decode(new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength)).replace(/\0+$/, "").trim();
const hex = dv => !dv || !dv.byteLength ? "" : Array.from(new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength), x => x.toString(16).padStart(2, "0")).join(" ");
const shortId = uuid => String(uuid).slice(0, 8).replace(/^0+/, "");
const nowMs = () => Date.now();

