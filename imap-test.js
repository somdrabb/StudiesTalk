require("dotenv").config();
const { ImapFlow } = require("imapflow");

(async () => {
  const client = new ImapFlow({
    host: process.env.IONOS_IMAP_HOST,
    port: Number(process.env.IONOS_IMAP_PORT || 993),
    secure: String(process.env.IONOS_IMAP_SECURE || "true").toLowerCase() === "true",
    disableAuthMethods: ["PLAIN"],
    auth: {
      user: process.env.IONOS_IMAP_USER,
      pass: process.env.IONOS_IMAP_PASS
    },
    logger: false
  });

  try {
    await client.connect();
    console.log("✅ Connected + authenticated");

    const lock = await client.getMailboxLock("INBOX");
    try {
      const status = await client.status("INBOX", { messages: true, unseen: true });
      console.log("INBOX status:", status);
    } finally {
      await lock.release();
    }

    await client.logout();
  } catch (e) {
    console.error("❌ IMAP test failed:", e.message);
    process.exitCode = 1;
  }
})();
