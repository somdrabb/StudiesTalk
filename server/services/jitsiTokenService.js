const jwt = require('jsonwebtoken');
const config = require('../config/jitsi');

function generateJitsiToken({ user = {}, room, moderator = false }) {
  if (!config.appId || !config.appSecret) {
    throw new Error('Missing JITSI_APP_ID or JITSI_APP_SECRET environment variable');
  }

  const now = Math.floor(Date.now() / 1000);
  const claims = {
    aud: config.audience,
    iss: config.appId,
    sub: config.domain,
    room: room || '*',
    moderator: Boolean(moderator),
    exp: now + 60 * 60,
    context: {
      user: {
        name: user.name || 'Guest',
        email: user.email,
        moderator: Boolean(moderator),
      },
    },
  };

  return jwt.sign(claims, config.appSecret);
}

module.exports = {
  generateJitsiToken,
};
