# Stage 0 — Instrumented email-to-SMS transport test

Proves the client end: can the server text your phone with a link, and how fast?
One `send-test.js` run = insert a `prompt_sends` row (stamps `sent_at`) + email-to-SMS
a ping link. Tap the link the instant you hear the sound → `ping.html` stamps
`opened_at` → the delta is your round-trip latency. `review.html` shows the table.

## One-time setup

### 1. Supabase table
In the Supabase SQL editor, run `schema.sql` (creates `prompt_sends` with anon
insert/read/update policies — timing data only, nothing sensitive).

### 2. Fill in credentials
- Copy `config.example.js` → `config.js`, fill in:
  - `gmailAppPassword` (the app-password)
  - `smsTo` (your 10-digit number + `@tmomail.net`)
  - `supabaseUrl`, `supabaseAnonKey` (same as the daily surface app uses)
- In `ping.html` and `review.html`, replace `PUT_SUPABASE_URL_HERE` /
  `PUT_SUPABASE_ANON_KEY_HERE` with the same values.

### 3. Host ping.html + review.html
These go in the **new prompt-server repo** under `/test`, with GitHub Pages enabled
on that repo. They'll be reachable at
`https://mweller001.github.io/the-prompt-server/test/ping.html` (matches
`pingBaseUrl` in config). Add a `.nojekyll` file at the repo root so Pages serves
the static files raw (lesson from the daily-surface repo). Adjust the repo name in
`pingBaseUrl` if you name it differently.

### 4. Where the sender runs — the phone (Termux) or any machine
**To prove the logic first, run on any computer with Node.** Then move to the phone.

On an Android phone via **Termux**:
```
pkg install nodejs
# copy this folder to the phone (or git clone), then:
cd prompt-server
npm install
node send-test.js "first"
```
The phone sends over WiFi — no SIM needed (email-to-SMS rides the internet to
T-Mobile's gateway, which delivers the SMS to your number).

## Running a test

```
node send-test.js "label"
```
Then: **the instant your phone makes the SMS sound, tap the link.** The page shows
the round-trip delta and logs it. Repeat a dozen times at various moments.

Open `review.html` to see all sends, with fastest / average / slowest. In test mode
(tap-immediately), those deltas ≈ true transport latency. That number decides whether
email-to-SMS is production-viable or a stopgap.

## Notes
- SMS body is kept < 160 chars so it won't split.
- If sends silently stop someday: check the gaming account
  (`reynholdt001@gmail.com`) for a Google security block — it's unmonitored.
- Rotate the app-password after first success (it was typed once in chat).
- Rolling-window cleanup of `prompt_sends` is a later, deferred increment
  (nightly pg_cron / edge function — the correct use of edge functions:
  periodic, latency-insensitive housekeeping).

---

# The prompt engine (prompt-engine.js)

The always-on timing engine. Reads tasks from Supabase, holds precise in-process
timers, and fires prompts via SMS at the exact second — mirroring the daily
surface's client firing model (warn stage at fireAt−warnMin, begin stage at fireAt),
so prompts fire even when the app is closed and the phone is asleep (SMS
store-and-forward delivers held texts when the phone wakes).

## Run
```
node prompt-engine.js
```
Leave it running (see "keeping it alive" below). It logs each resync and each fire.

## How it works
- **Data from Supabase, timing in-process.** Re-reads all tasks every 60s and
  reconciles timers (new tasks scheduled, snoozed tasks re-armed, done/deleted
  cancelled). Never polls the DB for timing — the clock is local setTimeout.
- **Fire-forward-only.** A fire-moment already past when read is never fired, so
  a restart never replays the day's past prompts.
- **Fires once per (taskId | fireAt | stage).** Snooze rewrites fireAt in the app
  → new key → the moment re-arms. Same "whole unit slides" behavior as the client.
- **Transport = deliverPrompt().** Today: text-only SMS via the email gateway
  (T-Mobile drops URL-bearing gateway mail, so no link — the task title IS the
  message). Swap deliverPrompt for local Termux SMS later to regain links + speed.

## Keeping it alive on the phone (Termux)
Android will try to kill background processes. To keep the engine running:
```
termux-wake-lock          # hold a wake-lock so Termux isn't doze-killed
node prompt-engine.js     # (or run under a keep-alive; see below)
```
Also exempt Termux from battery optimization in Android settings. The real
overnight-survival test: set a task to fire at 3am, leave the phone idle from
evening, confirm the SMS arrives. If Android kills it despite the wake-lock,
that's when the Win10 box becomes the fallback host.

## Test-send tools (Stage 0, transport characterization — already done)
- `send-test.js` — instrumented single send with ping link (measures round-trip).
- `plaintest.js` / `linktest.js` — bare deliverability probes.
- Finding: T-Mobile email-to-SMS = text-only, ~8s. Links need local SMS (pending SIM).
