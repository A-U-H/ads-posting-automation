/**
 * aven.bot — Bot API Routes
 */

import { Router } from 'express';
import bot from '../bot/automation.js';
import logger from '../bot/logger.js';
import path from 'path';
import fs from 'fs';

const router = Router();

/**
 * POST /api/bot/start
 * Start the bot with full configuration
 */
router.post('/start', async (req, res) => {
  try {
    const { username, password, title, category, description, country, state, city, photoPath, timerValue, timerUnit } = req.body;

    // Validate required fields
    const missing = [];
    if (!username) missing.push('username');
    if (!password) missing.push('password');
    if (!title) missing.push('title');
    if (!category) missing.push('category');
    if (!description) missing.push('description');
    if (!country) missing.push('country');
    if (!state) missing.push('state');
    if (!city) missing.push('city');
    if (!photoPath) missing.push('photoPath');
    if (!timerValue) missing.push('timerValue');
    if (!timerUnit) missing.push('timerUnit');

    if (missing.length > 0) {
      return res.status(400).json({
        error: `Missing required fields: ${missing.join(', ')}`,
      });
    }

    // Validate photo file or directory exists and has images
    if (!fs.existsSync(photoPath)) {
      return res.status(400).json({
        error: `Photo path not found: ${photoPath}`,
      });
    }
    const photoStat = fs.statSync(photoPath);
    if (photoStat.isDirectory()) {
      const exts = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'];
      const images = fs.readdirSync(photoPath).filter(f => exts.includes(path.extname(f).toLowerCase()));
      if (images.length === 0) {
        return res.status(400).json({
          error: `Folder "${photoPath}" contains no image files (.jpg, .png, .webp). Please put an image in the folder or provide a direct image file path.`,
        });
      }
    }

    // Validate timer
    const timer = parseFloat(timerValue);
    if (isNaN(timer) || timer <= 0) {
      return res.status(400).json({
        error: 'Timer value must be a positive number',
      });
    }

    // Start bot (async — don't await, just fire and forget)
    const mode = req.body.mode === 'test' ? 'test' : 'auto';
    const config = {
      username,
      password,
      title,
      category,
      description,
      country,
      state,
      city,
      photoPath,
      timerValue: timer,
      timerUnit,
    };

    // Fire and forget — bot runs in background
    bot.start(config, { mode }).catch(err => {
      logger.error(`Bot crashed: ${err.message}`);
    });

    res.json({ success: true, message: `Bot started in ${mode} mode` });

  } catch (err) {
    logger.error(`Failed to start bot: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/bot/stop
 * Stop the bot gracefully
 */
router.post('/stop', async (req, res) => {
  try {
    await bot.stop();
    res.json({ success: true, message: 'Bot stopped' });
  } catch (err) {
    logger.error(`Failed to stop bot: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/bot/step
 * Test mode: advance the pending step gate ('next' runs it, 'skip' jumps it)
 */
router.post('/step', async (req, res) => {
  try {
    const action = req.body.action === 'skip' ? 'skip' : 'next';
    const result = bot.advance(action);
    if (!result.ok) {
      return res.status(400).json({ error: result.reason });
    }
    res.json({ success: true, action: result.action });
  } catch (err) {
    logger.error(`Failed to advance step: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/bot/test/next
 * Test mode: run next step
 */
router.post('/test/next', async (req, res) => {
  try {
    const result = bot.advance('next');
    if (!result.ok) {
      return res.status(400).json({ error: result.reason });
    }
    res.json({ success: true, action: 'next' });
  } catch (err) {
    logger.error(`Failed to advance step: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/bot/test/skip
 * Test mode: skip step
 */
router.post('/test/skip', async (req, res) => {
  try {
    const result = bot.advance('skip');
    if (!result.ok) {
      return res.status(400).json({ error: result.reason });
    }
    res.json({ success: true, action: 'skip' });
  } catch (err) {
    logger.error(`Failed to skip step: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/bot/status
 * Get current bot state
 */
router.get('/status', (req, res) => {
  res.json(bot.getStatus());
});

/**
 * GET /api/bot/logs
 * Get recent log entries
 */
router.get('/logs', (req, res) => {
  const count = parseInt(req.query.count) || 100;
  res.json(logger.getEntries(count));
});

export default router;
