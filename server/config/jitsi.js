const { NODE_ENV } = require('../env');

const rawDomain = String(process.env.JITSI_DOMAIN || '').trim();
const isDevelopment = NODE_ENV === 'development';
const fallbackDomain = isDevelopment ? 'meet.jit.si' : '';
const domain = rawDomain || fallbackDomain;

if (!domain) {
  throw new Error('[ENV] Missing required env var: JITSI_DOMAIN');
}

const appId = String(process.env.JITSI_APP_ID || '').trim();
const appSecret = String(process.env.JITSI_APP_SECRET || '').trim();
const audience = String(process.env.JITSI_JWT_AUDIENCE || process.env.JITSI_AUDIENCE || 'jitsi').trim() || 'jitsi';
const issuer = String(process.env.JITSI_JWT_ISSUER || process.env.JITSI_APP_ID || '').trim();
const subject = String(process.env.JITSI_JWT_SUBJECT || domain).trim() || domain;
const secureDomain = String(process.env.JITSI_SECURE_DOMAIN || 'true').toLowerCase() === 'true';
const publicOrigin = `${secureDomain ? 'https' : 'http'}://${domain}`;
const isPublicMeetDomain = domain === 'meet.jit.si';
const isJaasDomain = domain === '8x8.vc';
const canGenerateTokens = Boolean(appId && appSecret && !isPublicMeetDomain);

function buildMeetingUrl(roomName = '') {
  const normalizedRoomName = String(roomName || '').trim();
  if (!normalizedRoomName) return '';
  const encodedRoom = encodeURIComponent(normalizedRoomName);
  if (isJaasDomain) {
    const appSegment = encodeURIComponent(appId || '');
    return `${publicOrigin}/${appSegment}/${encodedRoom}`;
  }
  return `${publicOrigin}/${encodedRoom}`;
}

module.exports = {
  domain,
  appId,
  appSecret,
  audience,
  issuer,
  subject,
  secureDomain,
  publicOrigin,
  canGenerateTokens,
  isPublicMeetDomain,
  isJaasDomain,
  buildMeetingUrl,
  isDevelopment,
  isPublicDevelopmentFallback: isDevelopment && isPublicMeetDomain,
};
