const { NODE_ENV } = require('../env');

const rawDomain = String(process.env.JITSI_DOMAIN || '').trim();
const isDevelopment = NODE_ENV === 'development';
const fallbackDomain = isDevelopment ? 'meet.jit.si' : '';
const domain = rawDomain || fallbackDomain;

if (!domain) {
  throw new Error('[ENV] Missing required env var: JITSI_DOMAIN');
}

if (!isDevelopment && domain === 'meet.jit.si') {
  throw new Error('[ENV] JITSI_DOMAIN must be your self-hosted Jitsi domain in production');
}

const appId = String(process.env.JITSI_APP_ID || '').trim();
const appSecret = String(process.env.JITSI_APP_SECRET || '').trim();
const audience = String(process.env.JITSI_AUDIENCE || 'jitsi').trim() || 'jitsi';
const secureDomain = String(process.env.JITSI_SECURE_DOMAIN || 'true').toLowerCase() === 'true';
const publicOrigin = `${secureDomain ? 'https' : 'http'}://${domain}`;
const canGenerateTokens = Boolean(appId && appSecret && domain !== 'meet.jit.si');

module.exports = {
  domain,
  appId,
  appSecret,
  audience,
  secureDomain,
  publicOrigin,
  canGenerateTokens,
  isDevelopment,
  isPublicDevelopmentFallback: isDevelopment && domain === 'meet.jit.si',
};
