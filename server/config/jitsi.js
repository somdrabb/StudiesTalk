const domain = process.env.JITSI_DOMAIN || 'meet.studistalk.de';
const appId = process.env.JITSI_APP_ID || '';
const appSecret = process.env.JITSI_APP_SECRET || '';
const secureDomain = String(process.env.JITSI_SECURE_DOMAIN || 'false').toLowerCase() === 'true';

module.exports = {
  domain,
  appId,
  appSecret,
  secureDomain,
};
