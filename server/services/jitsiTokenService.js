const jwt = require('jsonwebtoken');
const config = require('../config/jitsi');

function generateJitsiToken({ user = {}, room, moderator = false, ttlSeconds = 2 * 60 * 60 }) {
  if (!config.appId || !config.appSecret) {
    throw new Error('Missing JITSI_APP_ID or JITSI_APP_SECRET environment variable');
  }

  const now = Math.floor(Date.now() / 1000);
  const claims = {
    aud: config.audience,
    iss: config.issuer || config.appId,
    sub: config.subject || config.domain,
    room: room || '*',
    moderator: Boolean(moderator),
    exp: now + Math.max(60, Number(ttlSeconds) || 2 * 60 * 60),
    context: {
      user: {
        name: user.name || 'Guest',
        email: user.email,
        avatar: user.avatarUrl || user.avatar_url || null,
        moderator: Boolean(moderator),
      },
      studiestalk: {
        workspaceId: user.workspace_id || user.workspaceId || null,
        userId: user.id || null,
      },
    },
  };

  return jwt.sign(claims, config.appSecret);
}

module.exports = {
  generateJitsiToken,
};
