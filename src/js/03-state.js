// ---- State ----
const S = { device: null, svcs: {}, chars: {}, connected: false, connecting: false, current: null, target: null, boost: null,
            battery: null, led: null, project: 0, status2: 0, power: 0, seen: {}, lifeH: null, lifeM: null, fw: "", serial: "",
            unit: "F", devF: false, pending: false, dragging: false,
            reconnecting: false, userDisc: false, lostAt: 0, retryT: null, everConnected: false };
{ const u = store.raw(KEY.unit); if (u === "C" || u === "F") S.unit = u; }

