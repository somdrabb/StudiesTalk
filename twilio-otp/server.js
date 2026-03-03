require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const twilio = require("twilio");
const app = express();
app.use(express.json());
app.use(cors());
app.use(helmet());
// Basic rate limits (adjust as you like)
const sendLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,              // 5 requests/min per IP
  message: { error: "Too many OTP requests. Try again later." },
});
const checkLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: "Too many attempts. Try again later." },
});

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

// Health check
app.get("/", (req, res) => res.json({ ok: true }));

// 1) Send OTP
app.post("/otp/start", sendLimiter, async (req, res) => {
  try {
    const { phone, channel } = req.body;

    if (!phone) return res.status(400).json({ error: "phone is required" });

    // Allowed channels
    const ch = channel === "call" ? "call" : "sms";

    const v = await client.verify.v2
      .services(serviceSid)
      .verifications.create({ to: phone, channel: ch });

    // Do NOT expose too much detail in production
    return res.json({ status: v.status }); // "pending"
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 2) Verify OTP
app.post("/otp/check", checkLimiter, async (req, res) => {
  try {
    const { phone, code } = req.body;

    if (!phone || !code) {
      return res.status(400).json({ error: "phone and code are required" });
    }

    const c = await client.verify.v2
      .services(serviceSid)
      .verificationChecks.create({ to: phone, code });

    return res.json({
      status: c.status,               // "approved" if correct
      valid: c.status === "approved",
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`OTP server running on http://localhost:${port}`));
