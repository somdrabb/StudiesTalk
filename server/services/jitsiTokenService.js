const jwt = require('jsonwebtoken');

function generateJitsiToken({ user = {}, room }) {
  const secret = process.env.JITSI_SECRET;
  if (!secret) {
    throw new Error('Missing JITSI_SECRET environment variable');
  }

  const claims = {
    aud: 'studistalk',
    iss: 'studistalk',
    sub: 'meet.studistalk.de',
    room: room || '*',
    context: {
      user: {
        name: user.name || 'Guest',
        email: user.email,
        moderator: ['teacher', 'school_admin'].includes(user.role),
      },
    },
  };

  return jwt.sign(claims, secret, { expiresIn: '4h' });
}

module.exports = {
  generateJitsiToken,
};
