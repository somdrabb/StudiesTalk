const express = require('express');
const { requireAuth } = require('../utils/authMiddleware');
const { generateJitsiToken } = require('../services/jitsiTokenService');

const router = express.Router();

router.post('/token', requireAuth, async (req, res) => {
  const { room } = req.body;
  try {
    const token = generateJitsiToken({ user: req.user, room });
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
