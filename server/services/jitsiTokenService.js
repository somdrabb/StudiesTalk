const jwt = require('jsonwebtoken');
const config = require('../config/jitsi');

function generateJitsiToken({ user = {}, room, moderator = false, ttlSeconds = 2 * 60 * 60, runtimeConfig = null }) {
  const effectiveConfig = runtimeConfig || config;
  if (!effectiveConfig.appId || !effectiveConfig.appSecret) {
    throw new Error('Missing JITSI_APP_ID or JITSI_APP_SECRET environment variable');
  }

  const now = Math.floor(Date.now() / 1000);
  const claims = {
    aud: effectiveConfig.audience,
    iss: effectiveConfig.issuer || effectiveConfig.appId,
    sub: effectiveConfig.subject || effectiveConfig.domain,
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

  return jwt.sign(claims, effectiveConfig.appSecret);
}

module.exports = {
  generateJitsiToken,
};
