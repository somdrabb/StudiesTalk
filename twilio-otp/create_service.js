require("dotenv").config();
const twilio = require("twilio");

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

(async () => {
  try {
    const service = await client.verify.v2.services.create({
      friendlyName: "My OTP Service",
    });

    console.log("\nVERIFY_SERVICE_SID =", service.sid, "\n");
  } catch (err) {
    console.error(err);
  }
})();
