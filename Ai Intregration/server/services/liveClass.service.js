const crypto = require('crypto');
const jitsiJwt = require('./jitsiJwt.service');

const upcomingStore = new Map(); // temporary store until DB hooked up

function buildRoomUrl(roomKey) {
  return `https://meet.studistalk.de/${encodeURIComponent(roomKey)}`;
}

async function listUpcoming() {
  return Array.from(upcomingStore.values());
}

async function schedule(payload = {}) {
  const now = new Date().toISOString();
  const roomKey = payload.room_key || `course-${payload.course_id || '0'}-${Date.now()}`;
  const liveClass = {
    id: payload.id || crypto.randomUUID(),
    course_id: payload.course_id || null,
    title: payload.title || 'Live Class',
    room_key: roomKey,
    room_url: buildRoomUrl(roomKey),
    starts_at: payload.starts_at || now,
    ends_at: payload.ends_at || now,
    created_by_user_id: payload.created_by_user_id || null,
    status: payload.status || 'scheduled',
    created_at: now,
    updated_at: now,
  };

  upcomingStore.set(liveClass.id, liveClass);
  return liveClass;
}

async function getById(id) {
  const liveClass = upcomingStore.get(id);
  if (!liveClass) {
    throw new Error('Live class not found');
  }

  const token =
    process.env.JITSI_APP_ID && process.env.JITSI_APP_SECRET
      ? jitsiJwt.createToken({
          room: liveClass.room_key,
          moderator: false,
        })
      : null;

  return {
    ...liveClass,
    room_url: liveClass.room_url,
    permissions: {
      can_join: true,
      can_share_screen: true,
      is_moderator: false,
    },
    token,
  };
}

module.exports = {
  listUpcoming,
  schedule,
  getById,
};
