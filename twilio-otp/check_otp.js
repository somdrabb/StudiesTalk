require("dotenv").config();
const twilio = require("twilio");

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const SERVICE_SID = "VAaebf358b767454548df3ddf35ba9fbeb";
const TO_PHONE = "+4917664069892"; // your verified number
const CODE = "858895"; // <-- put the OTP you received

(async () => {
  try {
    const result = await client.verify.v2
      .services(SERVICE_SID)
      .verificationChecks.create({
        to: TO_PHONE,
        code: CODE,
      });

    console.log("\nVERIFY STATUS =", result.status);
    console.log("VALID =", result.status === "approved", "\n");
  } catch (err) {
    console.error(err);
  }
})();
