"use strict";

function normalize(v) {
  return String(v || "").trim();
}

function buildFrom() {
  const ionosFromName = normalize(process.env.IONOS_SMTP_FROM_NAME);
  const ionosFromUser = normalize(process.env.IONOS_SMTP_USER);
  const fallbackName = normalize(process.env.EMAIL_FROM_NAME || "StudisNest powered by StudisTalk");
  const fallbackEmail = normalize(process.env.EMAIL_FROM_EMAIL);
  const fromName = ionosFromName || fallbackName;
  const fromEmail = ionosFromUser || fallbackEmail;
  if (!fromEmail.includes("@")) {
    throw new Error("EMAIL_FROM_EMAIL or IONOS_SMTP_USER is missing or invalid.");
  }
  return `${fromName} <${fromEmail}>`;
}

let nodemailerInstance = null;
function ensureNodemailer() {
  if (nodemailerInstance) return nodemailerInstance;
  try {
    nodemailerInstance = require("nodemailer");
    return nodemailerInstance;
  } catch (err) {
    throw new Error("nodemailer not installed. Run: npm install nodemailer");
  }
}

function makeProvider() {
  const envProvider = String(process.env.EMAIL_PROVIDER || "").trim().toLowerCase();
  const hasIonosConfig =
    normalize(process.env.IONOS_SMTP_HOST) &&
    normalize(process.env.IONOS_SMTP_USER) &&
    normalize(process.env.IONOS_SMTP_PASS);
  const provider = envProvider || (hasIonosConfig ? "ionos" : "disabled");

  // =========================
  // DISABLED (DEV SAFE MODE)
  // =========================
  if (provider === "disabled") {
    return {
      name: "disabled",
      async send({ to, subject }) {
        console.log("[EMAIL disabled]", { to, subject });
        return { ok: true, disabled: true };
      }
    };
  }

  // =========================
  // GMAIL SMTP (LEGACY)
  // =========================
  if (provider === "gmail") {
    const nodemailer = ensureNodemailer();

    const user = normalize(process.env.GMAIL_SMTP_USER);
    const pass = normalize(process.env.GMAIL_SMTP_PASS);

    if (!user || !pass) {
      throw new Error("GMAIL_SMTP_USER or GMAIL_SMTP_PASS missing.");
    }

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: { user, pass }
    });

    return {
      name: "gmail",
      async send({ to, subject, text, html, replyTo }) {
        return transporter.sendMail({
          from: buildFrom(),
          to,
          subject,
          text,
          html,
          replyTo
        });
      }
    };
  }

  // =========================
  // IONOS SMTP (PRIMARY)
  // =========================
  if (provider === "ionos" || provider === "smtp") {
    const nodemailer = ensureNodemailer();

    const host = normalize(process.env.IONOS_SMTP_HOST);
    const portRaw = normalize(process.env.IONOS_SMTP_PORT);
    const secureRaw = normalize(process.env.IONOS_SMTP_SECURE);
    const user = normalize(process.env.IONOS_SMTP_USER);
    const pass = normalize(process.env.IONOS_SMTP_PASS);

    if (!host || !portRaw || !user || !pass) {
      throw new Error("IONOS SMTP configuration is incomplete.");
    }

    const transporter = nodemailer.createTransport({
      host,
      port: Number(portRaw) || 465,
      secure: secureRaw === "true",
      auth: { user, pass }
    });

    return {
      name: "ionos",
      async send({ to, subject, text, html, replyTo }) {
        return transporter.sendMail({
          from: buildFrom(),
          to,
          subject,
          text,
          html,
          replyTo
        });
      }
    };
  }

  throw new Error(`Unknown EMAIL_PROVIDER: ${provider}`);
}

const provider = makeProvider();

async function sendPlatformEmail({ to, subject, text, html, replyTo }) {
  if (!to || !to.includes("@")) {
    throw new Error("Invalid recipient email.");
  }
  return provider.send({ to, subject, text, html, replyTo });
}

module.exports = {
  sendPlatformEmail,
  providerName: provider.name
};
