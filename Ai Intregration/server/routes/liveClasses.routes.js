const express = require('express');
const router = express.Router();
const liveClassService = require('../services/liveClass.service');
const pdfSyncService = require('../services/pdfSync.service');
const slideStateService = require('../services/slideState.service');

router.get('/', async (req, res, next) => {
  try {
    const classes = await liveClassService.listUpcoming();
    res.json(classes);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const liveClass = await liveClassService.schedule(req.body);
    res.status(201).json({
      liveClassId: liveClass.id,
      roomUrl: liveClass.room_url,
      roomKey: liveClass.room_key,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const info = await liveClassService.getById(req.params.id);
    res.json(info);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/slides', async (req, res, next) => {
  try {
    const deck = await pdfSyncService.uploadDeck(req.params.id, req.body);
    res.status(201).json(deck);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/slides/page', async (req, res, next) => {
  try {
    const page = Number(req.body.page);
    if (Number.isNaN(page) || page < 1) {
      return res.status(400).json({ error: 'page must be a positive integer' });
    }
    const state = await slideStateService.setPage(req.params.id, page);
    // TODO: emit WebSocket event on slides:<liveClassId> so students get updates
    res.json(state);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
