/**
 * aven.bot — Express + WebSocket Server
 * Entry point for the backend
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import botRoutes from './routes/bot.js';
import logger from './bot/logger.js';
import screenshotter from './bot/screenshotter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3001;
const app = express();
const server = createServer(app);

// ─── Middleware ───
app.use(cors());
app.use(express.json());

// ─── Static: Serve screenshots ───
app.use('/screenshots', express.static(screenshotter.getDir()));

// ─── API Routes ───
app.use('/api/bot', botRoutes);

// ─── Production: Serve built frontend ───
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api') && !req.path.startsWith('/screenshots')) {
    res.sendFile(path.join(distPath, 'index.html'));
  }
});

// ─── WebSocket Server ───
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  logger.info('🔌 Dashboard client connected');

  ws.on('close', () => {
    logger.info('🔌 Dashboard client disconnected');
  });

  ws.on('error', (err) => {
    logger.warning(`WebSocket error: ${err.message}`);
  });

  // Send current status on connect
  ws.send(JSON.stringify({
    type: 'connected',
    data: { message: 'Connected to aven.bot server' },
  }));

  // Send the last live frame so a late-joining dashboard catches up instantly
  const lastFrame = logger.getLastFrame();
  if (lastFrame) {
    ws.send(JSON.stringify({
      type: 'frame',
      data: { data: lastFrame, timestamp: new Date().toISOString() },
    }));
  }
});

// Set WebSocket server on logger for broadcasting
logger.setWsServer(wss);

// ─── Start Server ───
server.listen(PORT, () => {
  console.log('');
  console.log('  ╔═══════════════════════════════════════════╗');
  console.log('  ║                                           ║');
  console.log('  ║   🤖  aven.bot Server Running             ║');
  console.log(`  ║   📡  API:  http://localhost:${PORT}          ║`);
  console.log(`  ║   🔌  WS:   ws://localhost:${PORT}/ws        ║`);
  console.log('  ║                                           ║');
  console.log('  ╚═══════════════════════════════════════════╝');
  console.log('');
});
