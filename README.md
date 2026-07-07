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
