// ============================================================
//  config.example.js  —  v0.1.0  (template; version dates last real change)
//  COPY THIS TO config.js AND FILL IN.
//  config.js is git-ignored / never committed. The real secrets
//  live only in config.js on the server phone.
// ============================================================
module.exports = {
  // --- Gmail sender (the unmonitored gaming account) ---
  gmailUser: "reynholdt001@gmail.com",
  gmailAppPassword: "PUT_APP_PASSWORD_HERE",   // 16-char app-password, no spaces

  // --- Where the SMS goes (your phone via T-Mobile email-to-SMS gateway) ---
  // Your 10-digit number, no dashes, @tmomail.net
  smsTo: "PUT_YOUR_10_DIGIT_NUMBER_HERE@tmomail.net",

  // --- Supabase (same project the daily surface uses) ---
  supabaseUrl: "https://vjkuksmwycnklkfpngtq.supabase.co",
  supabaseAnonKey: "sb_publishable_2gnanut8Zvt6cyt8BBCUfw_e4ZU81YA",

  // --- The ping-page base URL (where the SMS link points) ---
  // The tap-target that stamps opened_at. Hosted in the prompt-server repo's /test dir.
  // Update the repo name below if you name it something other than "the-prompt-server".
  pingBaseUrl: "https://mweller001.github.io/the-prompt-server/test/ping.html"
};
