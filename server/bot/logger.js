/**
 * aven.bot — Structured Logger
 * Ring-buffer logger that emits entries via WebSocket
 */

const MAX_ENTRIES = 500;

class Logger {
  constructor() {
    this.entries = [];
    this.wsServer = null;
    this.lastFrame = null;
  }

  /**
   * Set the WebSocket server reference for broadcasting
   */
  setWsServer(wsServer) {
    this.wsServer = wsServer;
  }

  /**
   * Create a log entry and broadcast it
   */
  _log(level, message) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
    };

    // Ring buffer — remove oldest if full
    if (this.entries.length >= MAX_ENTRIES) {
      this.entries.shift();
    }
    this.entries.push(entry);

    // Console output with color
    const colors = {
      info: '\x1b[36m',
      success: '\x1b[32m',
      warning: '\x1b[33m',
      error: '\x1b[31m',
    };
    const reset = '\x1b[0m';
    const color = colors[level] || '';
    const time = new Date().toLocaleTimeString();
    console.log(`${color}[${time}] [${level.toUpperCase()}] ${message}${reset}`);

    // Broadcast to all WebSocket clients
    this.broadcast('log', entry);
  }

  info(message) {
    this._log('info', message);
  }

  success(message) {
    this._log('success', message);
  }

  warning(message) {
    this._log('warning', message);
  }

  error(message) {
    this._log('error', message);
  }

  /**
   * Get recent log entries
   */
  getEntries(count = 100) {
    return this.entries.slice(-count);
  }

  /**
   * Clear all log entries
   */
  clear() {
    this.entries = [];
  }

  /**
   * Broadcast a message to all connected WebSocket clients
   */
  broadcast(type, data) {
    if (!this.wsServer) return;

    const message = JSON.stringify({ type, data });
    this.wsServer.clients.forEach(client => {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(message);
      }
    });
  }

  /**
   * Broadcast a live frame (JPEG data URL) and remember the last one
   */
  broadcastFrame(dataUrl) {
    this.lastFrame = dataUrl;
    this.broadcast('frame', {
      data: dataUrl,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Last broadcast frame — so late-connecting dashboards can catch up
   */
  getLastFrame() {
    return this.lastFrame;
  }
}

// Singleton
const logger = new Logger();
export default logger;
