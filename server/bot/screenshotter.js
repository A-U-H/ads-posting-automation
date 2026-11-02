/**
 * aven.bot — Screenshot Capture Utility
 * Captures and stores Playwright screenshots at each automation step
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCREENSHOTS_DIR = path.join(__dirname, '..', '..', 'screenshots');

class Screenshotter {
  constructor() {
    // Ensure screenshots directory exists
    if (!fs.existsSync(SCREENSHOTS_DIR)) {
      fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
    }
  }

  /**
   * Capture a screenshot of the current page
   * @param {import('playwright').Page} page - Playwright page
   * @param {number} stepId - Step number
   * @param {string} stepName - Human readable step name
   * @returns {string} filename of the saved screenshot
   */
  async capture(page, stepId, stepName) {
    try {
      // Only capture screenshots on errors to prevent the visible browser window from flickering or shrinking
      const isError = stepName.toLowerCase().includes('error');
      if (!isError) {
        return null;
      }

      const timestamp = Date.now();
      const safeName = stepName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      const filename = `step-${stepId}-${safeName}-${timestamp}.png`;
      const filepath = path.join(SCREENSHOTS_DIR, filename);

      await page.screenshot({
        path: filepath,
        fullPage: false,
        type: 'png',
        timeout: 5000,
      });

      logger.info(`📸 Screenshot captured: ${stepName}`);

      // Broadcast screenshot event via WebSocket
      logger.broadcast('screenshot', {
        step: stepId,
        name: stepName,
        filename,
        url: `/screenshots/${filename}`,
        timestamp: new Date().toISOString(),
      });

      return filename;
    } catch (err) {
      logger.warning(`Failed to capture screenshot at step ${stepId}: ${err.message}`);
      return null;
    }
  }

  /**
   * Clean up old screenshots
   */
  cleanup() {
    try {
      const files = fs.readdirSync(SCREENSHOTS_DIR);
      for (const file of files) {
        fs.unlinkSync(path.join(SCREENSHOTS_DIR, file));
      }
      logger.info('🧹 Old screenshots cleaned up');
    } catch (err) {
      logger.warning(`Failed to cleanup screenshots: ${err.message}`);
    }
  }

  /**
   * Get the screenshots directory path
   */
  getDir() {
    return SCREENSHOTS_DIR;
  }
}

const screenshotter = new Screenshotter();
export default screenshotter;
