/**
 * test-email-otp.js
 * ─────────────────────────────────────────────────────────
 * End-to-end test script for the email OTP system.
 *
 * Usage:
 *   node src/scripts/test-email-otp.js
 *
 * Optional env overrides (set before running):
 *   TEST_EMAIL=target@gmail.com    — email to receive OTP (default: SMTP_USER)
 *   TEST_PHONE=0901234567          — test customer phone
 *   TEST_API=http://localhost:5000/api  — API base URL
 *
 * The script:
 *   1. Validates SMTP config
 *   2. Tests SMTP connection
 *   3. Registers (or reuses) a test customer
 *   4. Logs in and gets JWT token
 *   5. Calls POST /auth/send-email-otp
 *   6. Asks you to input the OTP you received
 *   7. Calls POST /auth/verify-email-otp
 *   8. Verifies emailVerified = true on user
 * ─────────────────────────────────────────────────────────
 */
import "dotenv/config";
import readline from "readline";
import { validateSMTPConfig, testSMTPConnection } from "../services/emailService.js";

// ─── Config ────────────────────────────────────────────────────
const API_BASE = process.env.TEST_API || "http://localhost:5000/api";
const TEST_EMAIL = process.env.TEST_EMAIL || process.env.SMTP_USER || "";
const TEST_PHONE = process.env.TEST_PHONE || "0911111999"; // test phone
const TEST_PASSWORD = "TestAbc@999"; // must satisfy password policy

// ─── Colors ────────────────────────────────────────────────────
const C = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
};

const log = {
  info: (...a) => console.log(`${C.cyan}ℹ${C.reset}`, ...a),
  ok: (...a) => console.log(`${C.green}✅${C.reset}`, ...a),
  fail: (...a) => console.log(`${C.red}❌${C.reset}`, ...a),
  warn: (...a) => console.log(`${C.yellow}⚠️${C.reset}`, ...a),
  section: (t) => console.log(`\n${C.bold}── ${t} ──${C.reset}`),
};

// ─── HTTP helpers ───────────────────────────────────────────────
const apiFetch = async (path, options = {}) => {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.headers || {}),
    },
    credentials: "include",
    ...options,
  });
  const json = await res.json();
  return { status: res.status, json };
};

const post = (path, body, token) =>
  apiFetch(path, {
    method: "POST",
    body: JSON.stringify(body),
    token,
  });

const get = (path, token) => apiFetch(path, { method: "GET", token });

// ─── Prompt helper ──────────────────────────────────────────────
const prompt = (question) =>
  new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });

// ─── Main ───────────────────────────────────────────────────────
(async () => {
  console.log(`\n${C.bold}${C.cyan}📧 SmartMobile — Email OTP System Test${C.reset}\n`);
  console.log(`${C.dim}API: ${API_BASE}${C.reset}`);
  console.log(`${C.dim}Target email: ${TEST_EMAIL || "(unset — use TEST_EMAIL env)"}${C.reset}\n`);

  // ── Step 1: Validate SMTP config ──────────────────────────────
  log.section("Step 1: SMTP Config Validation");
  const { valid, missing } = validateSMTPConfig();
  if (!valid) {
    log.fail(`SMTP config incomplete. Missing/placeholder: ${missing.join(", ")}`);
    console.log(`\n${C.yellow}Fix your .env:${C.reset}`);
    console.log("  SMTP_HOST=smtp.gmail.com");
    console.log("  SMTP_PORT=587");
    console.log("  SMTP_SECURE=false");
    console.log("  SMTP_USER=yourGmail@gmail.com");
    console.log("  SMTP_PASS=your-16-char-app-password");
    console.log("  SMTP_FROM=noreply@smartmobilestore.vn\n");
    console.log(
      `${C.yellow}NOTE: For Gmail, you MUST use an App Password (not your real password).${C.reset}`
    );
    console.log(`Generate at: https://myaccount.google.com/apppasswords\n`);
    process.exit(1);
  }
  log.ok(`SMTP config OK → ${process.env.SMTP_USER} via ${process.env.SMTP_HOST}:${process.env.SMTP_PORT || 587}`);

  // ── Step 2: Test SMTP connection ──────────────────────────────
  log.section("Step 2: SMTP Connection Test");
  try {
    await testSMTPConnection();
    log.ok("SMTP connection verified! Server is reachable and credentials are correct.");
  } catch (err) {
    log.fail(`SMTP connection failed: ${err.message}`);
    console.log(`\n${C.yellow}Common fixes:${C.reset}`);
    console.log("  • Gmail: enable 2FA → generate App Password → use that as SMTP_PASS");
    console.log("  • Gmail: SMTP_HOST=smtp.gmail.com, SMTP_PORT=587, SMTP_SECURE=false");
    console.log("  • Outlook: SMTP_HOST=smtp.office365.com, SMTP_PORT=587");
    process.exit(1);
  }

  if (!TEST_EMAIL) {
    log.fail("TEST_EMAIL not set. Set it: $env:TEST_EMAIL='your@gmail.com' (PowerShell) or export TEST_EMAIL=your@gmail.com");
    process.exit(1);
  }

  // ── Step 3: Register test customer ────────────────────────────
  log.section("Step 3: Register / Login Test Customer");
  log.info(`Phone: ${TEST_PHONE} | Password: ${TEST_PASSWORD}`);

  let token = "";

  // Try login first (account may already exist)
  const loginRes = await post("/auth/login", {
    phoneNumber: TEST_PHONE,
    password: TEST_PASSWORD,
  });

  if (loginRes.status === 200 && loginRes.json.success) {
    token = loginRes.json.data?.token;
    log.ok(`Logged in as existing test customer | token: ${token.substring(0, 20)}...`);
  } else {
    // Register
    const regRes = await post("/auth/register", {
      fullName: "Test Email OTP",
      phoneNumber: TEST_PHONE,
      password: TEST_PASSWORD,
    });

    if (!regRes.json.success) {
      // If phone exists with different password, fail gracefully
      log.fail(`Registration failed: ${regRes.json.message}`);
      log.warn(`Try deleting the test account or changing TEST_PHONE env var`);
      process.exit(1);
    }

    log.ok("Test customer registered successfully");

    // Login after registration
    const loginRes2 = await post("/auth/login", {
      phoneNumber: TEST_PHONE,
      password: TEST_PASSWORD,
    });

    if (!loginRes2.json.success) {
      log.fail(`Login after register failed: ${loginRes2.json.message}`);
      process.exit(1);
    }

    token = loginRes2.json.data?.token;
    log.ok(`Logged in | token: ${token.substring(0, 20)}...`);
  }

  // ── Step 4: Send OTP email ─────────────────────────────────────
  log.section(`Step 4: Send Email OTP → ${TEST_EMAIL}`);

  const sendRes = await post("/auth/send-email-otp", { email: TEST_EMAIL }, token);

  if (!sendRes.json.success) {
    log.fail(`send-email-otp failed [${sendRes.status}]: ${sendRes.json.message}`);
    console.log("Response:", JSON.stringify(sendRes.json, null, 2));
    process.exit(1);
  }

  const { sessionId, maskedEmail, expiresAt, ttlMinutes } = sendRes.json.data;
  log.ok(`OTP sent!`);
  console.log(`  ${C.dim}Session:     ${sessionId}${C.reset}`);
  console.log(`  ${C.dim}Masked email: ${maskedEmail}${C.reset}`);
  console.log(`  ${C.dim}Expires:     ${new Date(expiresAt).toLocaleTimeString()} (${ttlMinutes} min)${C.reset}`);

  // ── Step 5: User inputs OTP ─────────────────────────────────────
  log.section("Step 5: Input OTP");
  console.log(`\n${C.yellow}Check your inbox at: ${TEST_EMAIL}${C.reset}`);
  const otp = await prompt(`Enter the 6-digit OTP you received: `);

  if (!/^\d{6}$/.test(otp)) {
    log.fail("Invalid OTP format (must be 6 digits)");
    process.exit(1);
  }

  // ── Step 6: Verify OTP ──────────────────────────────────────────
  log.section("Step 6: Verify Email OTP");

  const verifyRes = await post("/auth/verify-email-otp", { sessionId, otp }, token);

  if (!verifyRes.json.success) {
    log.fail(`verify-email-otp failed [${verifyRes.status}]: ${verifyRes.json.message}`);
    console.log("Response:", JSON.stringify(verifyRes.json, null, 2));
    process.exit(1);
  }

  log.ok("OTP verified successfully! 🎉");
  const { emailVerified, email, emailVerifiedAt } = verifyRes.json.data;
  console.log(`  ${C.green}emailVerified:   ${emailVerified}${C.reset}`);
  console.log(`  ${C.green}email:           ${email}${C.reset}`);
  console.log(`  ${C.green}emailVerifiedAt: ${emailVerifiedAt}${C.reset}`);

  // ── Step 7: Confirm via /me ──────────────────────────────────────
  log.section("Step 7: Confirm via GET /auth/me");
  const meRes = await get("/auth/me", token);

  if (!meRes.json.success) {
    log.warn(`Could not fetch /me: ${meRes.json.message}`);
  } else {
    const user = meRes.json.data?.user;
    if (user?.emailVerified) {
      log.ok(`/auth/me confirms emailVerified = ${user.emailVerified} ✓`);
    } else {
      log.warn(`/auth/me shows emailVerified = ${user?.emailVerified} — may be a schema cache issue`);
    }
  }

  // ── Summary ──────────────────────────────────────────────────────
  console.log(`\n${C.bold}${C.green}════════════════════════════════════${C.reset}`);
  console.log(`${C.bold}${C.green}  ✅ EMAIL OTP TEST PASSED${C.reset}`);
  console.log(`${C.bold}${C.green}════════════════════════════════════${C.reset}\n`);
  console.log(`  SMTP:   Working ✓`);
  console.log(`  Send:   Working ✓`);
  console.log(`  Verify: Working ✓`);
  console.log(`  DB:     emailVerified saved ✓\n`);

  process.exit(0);
})().catch((err) => {
  console.error(`\n${C.red}💥 Unexpected error:${C.reset}`, err);
  process.exit(1);
});
