// ============================================================
//  prompt-engine.js  —  v0.1.1
//  (version lives here since this file has no in-app display; keep in sync with package.json) — the always-on server timing engine.
//
//  Reads tasks from Supabase (DATA), holds its own precise in-process
//  timers (the CLOCK — never polls the DB for timing), and fires prompts
//  via deliverPrompt() at the exact second. Mirrors the daily surface's
//  client firing model: for each task with showOn === today and a fireAt,
//  a "warn" stage at (fireAt - warnMin) if warnMin>0, and a "begin" stage
//  at fireAt. Fires once per (taskId | fireAt | stage). Fire-forward-only:
//  a moment already past when the engine (re)reads is never fired.
//
//  Sync: every 60s it re-reads all tasks and reconciles timers — new tasks
//  get scheduled, snoozed tasks (fireAt rewritten → new keys) re-arm, and
//  completed/deleted tasks' pending timers are cancelled. Self-healing:
//  any missed change is caught on the next sweep.
//
//  Restart-safe: on boot it re-reads and schedules only FUTURE moments, so
//  a restart never re-fires the day's past prompts. Fired-state is in-memory
//  (a restart mid-day could in principle re-fire a moment that already fired
//  IF that moment is still in the future — but a fired moment is by definition
//  in the past, so fire-forward-only covers it).
//
//  Transport: deliverPrompt() is the swappable seam. Today it sends text-only
//  email-to-SMS (proven ~8s on T-Mobile; links don't survive that gateway).
//  Swap it for local Termux SMS later (links + sub-second) without touching
//  any timing logic.
//
//  Run:  node prompt-engine.js
//  Requires: config.js, and `npm install nodemailer @supabase/supabase-js`
// ============================================================
const nodemailer = require("nodemailer");
const { createClient } = require("@supabase/supabase-js");
const cfg = require("./config.js");

const RESYNC_MS = 60 * 1000;   // re-read tasks + reconcile every 60s
const db = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);

// one shared mail transport (text-only SMS via the carrier email gateway)
const mailer = nodemailer.createTransport({
  service: "gmail",
  auth: { user: cfg.gmailUser, pass: cfg.gmailAppPassword }
});

// ---- state -------------------------------------------------------------
// scheduled timers, keyed by "taskId|fireAt|stage" → { timeout, atMs }
const timers = new Map();
// keys already fired, so a resync never re-fires. Cleared entries for a key
// whose fireAt changed are handled naturally: the new fireAt makes a NEW key.
const fired = new Set();

// ---- time helpers (local time) -----------------------------------------
function todayStr() {
  const n = new Date();
  const mm = n.getMonth() + 1, dd = n.getDate();
  return n.getFullYear() + "-" + (mm < 10 ? "0" + mm : mm) + "-" + (dd < 10 ? "0" + dd : dd);
}
// today's "HH:MM" → a Date (local) for today at that minute.
function todayAt(hhmm) {
  const p = hhmm.split(":");
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate(),
    parseInt(p[0], 10) || 0, parseInt(p[1], 10) || 0, 0, 0);
}
function minusMinutes(date, mins) {
  return new Date(date.getTime() - mins * 60 * 1000);
}

// ---- the transport seam ------------------------------------------------
// Today: text-only SMS via email gateway. NO link (T-Mobile drops URL-bearing
// gateway mail). The task title IS the message. Language mirrors the app: the
// warn stage is "Prepare", the begin stage is "Perform". Subject-only with an
// EMPTY body — the gateway otherwise delivers subject AND body joined by "/",
// duplicating the text; subject-only sends the message once. Swap this body for
// a local-SMS send later to regain links + speed.
async function deliverPrompt(task, stage) {
  const msg = stage === "warn"
    ? "MIL Prepare: " + task.title + (task.warnMin ? " (in " + task.warnMin + " min)" : "")
    : "MIL Perform: " + task.title;
  try {
    await mailer.sendMail({
      from: cfg.gmailUser,
      to: cfg.smsTo,
      subject: msg,
      text: ""            // empty body: message rides in the subject only, no "/" duplication
    });
    log("FIRED [" + stage + "] " + task.title);
  } catch (e) {
    log("SEND FAILED [" + stage + "] " + task.title + " :: " + (e.message || e));
  }
}

// ---- scheduling --------------------------------------------------------
function log(s) { console.log(new Date().toISOString() + "  " + s); }

// Cancel every scheduled (not-yet-fired) timer, so a resync can rebuild cleanly.
function clearAllTimers() {
  for (const [, v] of timers) clearTimeout(v.timeout);
  timers.clear();
}

// Schedule one stage of one task, if it's in the future and not already fired.
function scheduleStage(task, stage, at) {
  const key = task.id + "|" + task.fireAt + "|" + stage;
  if (fired.has(key)) return;               // already fired this exact moment
  const atMs = at.getTime();
  const delay = atMs - Date.now();
  if (delay < 0) return;                    // fire-forward-only: moment already passed
  if (timers.has(key)) clearTimeout(timers.get(key).timeout); // replace if re-scheduling
  const timeout = setTimeout(function () {
    fired.add(key);
    timers.delete(key);
    deliverPrompt(task, stage);
  }, delay);
  timers.set(key, { timeout: timeout, atMs: atMs });
}

// Read all tasks, rebuild the timer set for today's future fire-moments.
async function resync() {
  const { data, error } = await db.from("items").select("*").eq("kind", "task");
  if (error) { log("resync read failed: " + error.message); return; }

  const today = todayStr();
  clearAllTimers();  // rebuild from scratch each sweep — simple + self-healing

  let scheduled = 0;
  (data || []).forEach(function (row) {
    const d = row.data || {};
    if (d.done) return;
    if (!d.showOn || !d.fireAt) return;      // no prompt
    if (d.showOn !== today) return;          // prompt only fires on its show-on date
    const task = { id: row.id, title: d.title || "(task)", fireAt: d.fireAt,
      warnMin: (typeof d.warnMin === "number" ? d.warnMin : 0) };
    const begin = todayAt(d.fireAt);
    if (task.warnMin > 0) {
      scheduleStage(task, "warn", minusMinutes(begin, task.warnMin));
    }
    scheduleStage(task, "begin", begin);
    scheduled++;
  });
  log("resync: " + (data ? data.length : 0) + " tasks, " + timers.size + " timers armed (" + scheduled + " prompt-tasks today)");
}

// ---- boot --------------------------------------------------------------
async function main() {
  log("prompt-engine starting. Resync every " + (RESYNC_MS / 1000) + "s. Transport: text-only SMS via " + cfg.smsTo);
  await resync();
  setInterval(resync, RESYNC_MS);
}
main().catch(function (e) { log("fatal: " + (e.message || e)); process.exit(1); });
