// ============================================================
//  send-test.js  —  v0.1.0  —  Stage 0 instrumented transport test.
//  (Stage-0 tooling; version dates this file's last real change.)
//  One run = one prompt fired:
//    1. insert a prompt_sends row stamped sent_at = now
//    2. email-to-SMS a short message + a ping link carrying that row id
//  When you tap the link, ping.html stamps opened_at, and the
//  delta (opened_at - sent_at) is the round-trip latency.
//
//  Run:  node send-test.js "optional label"
//  Requires: config.js (copied from config.example.js), and
//            `npm install nodemailer @supabase/supabase-js`
// ============================================================
const nodemailer = require("nodemailer");
const { createClient } = require("@supabase/supabase-js");
const cfg = require("./config.js");

const label = process.argv[2] || "test";

async function main() {
  const db = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);

  // 1. insert the send row, stamped at dispatch time.
  const sentAt = new Date().toISOString();
  const { data, error } = await db
    .from("prompt_sends")
    .insert([{ label: label, sent_at: sentAt }])
    .select();
  if (error) { console.error("Supabase insert failed:", error.message); process.exit(1); }
  const row = data[0];
  console.log("inserted row id:", row.id, "sent_at:", sentAt);

  // 2. build the ping link + send email-to-SMS.
  const pingUrl = cfg.pingBaseUrl + "?ping=" + encodeURIComponent(row.id);
  // Keep the SMS short. Subject often shows as the message on email-to-SMS.
  const smsBody = "MIL prompt [" + label + "] " + pingUrl;

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: cfg.gmailUser, pass: cfg.gmailAppPassword }
  });

  const t0 = Date.now();
  await transporter.sendMail({
    from: cfg.gmailUser,
    to: cfg.smsTo,
    subject: smsBody,      // put it in subject; many gateways show the subject
    text: smsBody          // and body, so it lands either way
  });
  const t1 = Date.now();
  console.log("email dispatched in", (t1 - t0), "ms");
  console.log("SMS should arrive shortly. Tap the link the INSTANT you hear it.");
  console.log("ping link:", pingUrl);
  process.exit(0);
}

main().catch(function (e) { console.error("error:", e.message || e); process.exit(1); });
