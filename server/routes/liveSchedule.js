const express = require('express');
const router = express.Router();
const { requireAuth } = require('../utils/authMiddleware');
const liveRoomService = require('../services/liveRoomService');

router.use(express.json());
router.post('/', requireAuth, (req, res) => {
  const payload = {
    ...req.body,
    created_by_user_id: req.user.id,
  };
  const room = liveRoomService.createRoom(payload);
  res.status(201).json({
    liveClassId: room.id,
    roomUrl: room.room_url,
    roomKey: room.room_key,
  });
});

module.exports = router;
