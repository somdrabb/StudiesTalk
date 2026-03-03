const jwt = require('jsonwebtoken');

const APP_ID = process.env.JITSI_APP_ID;
const APP_SECRET = process.env.JITSI_APP_SECRET;

function createToken(options = {}) {
  if (!APP_ID || !APP_SECRET) {
    throw new Error('Missing JWT credentials for Jitsi');
  }

  const now = Math.floor(Date.now() / 1000);
  const claim = {
    context: {
      user: {
        name: options.name || 'guest',
        email: options.email,
      },
      group: options.group,
    },
    aud: 'jitsi',
    iss: APP_ID,
    sub: 'meet.studistalk.de',
    room: options.room || '*',
    moderator: !!options.moderator,
    exp: now + (options.ttlSeconds || 60 * 5),
  };

  return jwt.sign(claim, APP_SECRET);
}

module.exports = {
  createToken,
};
