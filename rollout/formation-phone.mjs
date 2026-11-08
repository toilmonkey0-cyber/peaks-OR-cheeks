// FORMATION phone bench: puts the LOCAL build on Aaron's Android phone over USB with working haptics.
// The trick: `adb reverse` makes the phone's localhost reach this PC, and localhost is a SECURE
// context — so navigator.vibrate works (the LAN http:// link can never buzz).
//   node formation-phone.mjs            serve (if needed) + wire + open FORMATION on the phone
//   node formation-phone.mjs --reload   reload the open phone tab after a rebuild (feel-tuning loop)
// Needs: USB debugging on, phone authorized, `npm run build` done. Port 9222 is taken on this PC → CDP uses 9333.
import { execFileSync, spawn } from "node:child_process";

const PORT = 4174;
const CDP = 9333;
const URL_ = `http://localhost:${PORT}/#formation`;
const run = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8" }).trim();

const devices = run("adb", ["devices"]).split("\n").slice(1).filter((l) => /\tdevice$/.test(l));
if (!devices.length) {
  console.log("No phone on USB. Plug it in, unlock it, and accept the debugging prompt.");
  process.exit(1);
}
console.log("phone:", devices[0].split("\t")[0]);

const up = await fetch(`http://localhost:${PORT}/`).then((r) => r.ok, () => false);
if (!up) {
  // detached so it outlives this script (and any task wrapper)
  spawn("node", ["node_modules/vite/bin/vite.js", "preview", "--host", "--port", String(PORT), "--strictPort"], { detached: true, stdio: "ignore" }).unref();
  for (let i = 0; i < 30 && !(await fetch(`http://localhost:${PORT}/`).then((r) => r.ok, () => false)); i++) await new Promise((r) => setTimeout(r, 300));
  console.log("preview started on", PORT);
}

run("adb", ["reverse", `tcp:${PORT}`, `tcp:${PORT}`]);
run("adb", ["forward", `tcp:${CDP}`, "localabstract:chrome_devtools_remote"]);

if (process.argv.includes("--reload")) {
  const tabs = await (await fetch(`http://127.0.0.1:${CDP}/json`)).json();
  const tab = tabs.find((t) => t.url.startsWith(`http://localhost:${PORT}`));
  if (!tab) { console.log("No FORMATION tab open on the phone; run without --reload first."); process.exit(1); }
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res) => { ws.onopen = res; });
  // drop the service worker so the phone takes THIS build, then hard-reload
  ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression: "navigator.serviceWorker?.getRegistrations().then(rs => Promise.all(rs.map(r => r.unregister())))", awaitPromise: true } }));
  await new Promise((r) => setTimeout(r, 500));
  ws.send(JSON.stringify({ id: 2, method: "Page.reload", params: { ignoreCache: true } }));
  await new Promise((r) => setTimeout(r, 400));
  ws.close();
  console.log("reloaded on the phone");
} else {
  run("adb", ["shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", URL_, "com.android.chrome"]);
  console.log("opened", URL_, "on the phone — haptics live (secure context via localhost)");
}
