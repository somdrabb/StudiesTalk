const crypto = require('crypto');
const config = require('../config/jitsi');

const roomsById = new Map();
const roomsByKey = new Map();

function buildRoomUrl(roomKey) {
  return `https://${config.domain}/${encodeURIComponent(roomKey)}`;
}

function generateSuffix(length = 12) {
  return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
}

function createRoom(options = {}) {
  const now = new Date().toISOString();
  const roomKey = options.room_key || `class-${now.replace(/[^0-9]/g, '')}-${generateSuffix()}`;
  const id = options.id || crypto.randomUUID();

  const room = {
    id,
    title: options.title || 'Live Class',
    course_id: options.course_id || null,
    room_key: roomKey,
    room_url: buildRoomUrl(roomKey),
    starts_at: options.starts_at || now,
    ends_at: options.ends_at || now,
    created_by_user_id: options.created_by_user_id || null,
    status: options.status || 'scheduled',
    created_at: options.created_at || now,
    updated_at: options.updated_at || now,
  };

  roomsById.set(id, room);
  roomsByKey.set(roomKey, room);
  return room;
}

function listRooms() {
  return Array.from(roomsById.values());
}

function findById(id) {
  return roomsById.get(id) || null;
}

function findByKey(key) {
  return roomsByKey.get(key) || null;
}

module.exports = {
  createRoom,
  listRooms,
  findById,
  findByKey,
};
