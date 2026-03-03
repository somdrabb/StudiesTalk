require("dotenv").config();
const twilio = require("twilio");

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const SERVICE_SID = "VAaebf358b767454548df3ddf35ba9fbeb";
const TO_PHONE = "+4917664069892";   // ← your verified number

(async () => {
  try {
    const verification = await client.verify.v2
      .services(SERVICE_SID)
      .verifications.create({
        to: TO_PHONE,
        channel: "sms",
      });

    console.log("\nOTP STATUS =", verification.status, "\n");
  } catch (err) {
    console.error(err);
  }
})();
