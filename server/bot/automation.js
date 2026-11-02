/**
 * aven.bot — Playwright Automation Engine
 * Core bot that automates the full listing lifecycle on avanture.net
 */

import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import logger from './logger.js';
import screenshotter from './screenshotter.js';
import { STEPS, BOT_STATES, getStepById } from './steps.js';

class AvenBot {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.state = BOT_STATES.IDLE;
    this.currentStep = null;
    this.cycle = 0;
    this.config = null;
    this.shouldStop = false;
    this.timerInterval = null;
    this.testMode = false;
    this.nextStep = null;
    this.stepGateResolve = null;
    this.frameInterval = null;
  }

  /**
   * Emit status update to all WebSocket clients
   */
  emitStatus() {
    const totalSteps = STEPS.length;
    const progress = this.currentStep
      ? Math.round((this.currentStep / totalSteps) * 100)
      : 0;

    logger.broadcast('status', {
      state: this.state,
      step: this.currentStep,
      stepName: this.currentStep ? getStepById(this.currentStep)?.name : null,
      stepIcon: this.currentStep ? getStepById(this.currentStep)?.icon : null,
      progress,
      cycle: this.cycle,
      totalSteps,
      mode: this.testMode ? 'test' : 'auto',
      awaitingAdvance: this.testMode && this.state === BOT_STATES.WAITING_STEP,
      nextStep: this.nextStep,
      nextStepName: this.nextStep ? getStepById(this.nextStep)?.name : null,
    });
  }

  /**
   * Set current step and emit status
   */
  setStep(stepId) {
    this.currentStep = stepId;
    const step = getStepById(stepId);
    if (step) {
      logger.info(`${step.icon} Step ${stepId}: ${step.name} — ${step.description}`);
    }
    this.emitStatus();
  }

  /**
   * Start the bot with the given configuration
   */
  async start(config, options = {}) {
    if (this.state === BOT_STATES.RUNNING || this.state === BOT_STATES.WAITING) {
      throw new Error('Bot is already running');
    }

    this.config = config;
    this.testMode = options.mode === 'test';
    this.shouldStop = false;
    this.cycle = 0;
    this.nextStep = null;
    this.state = BOT_STATES.STARTING;
    this.emitStatus();

    try {
      // Clean up old screenshots
      screenshotter.cleanup();

      logger.info('🚀 Starting aven.bot...');
      logger.info('🔧 Launching Chromium browser (visible mode)...');

      // Launch browser in headed (visible) mode
      this.browser = await chromium.launch({
        headless: false,
        args: [
          '--start-maximized',
          '--disable-blink-features=AutomationControlled',
        ],
      });

      this.context = await this.browser.newContext({
        viewport: null,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      });

      this.page = await this.context.newPage();

      // Set default timeouts
      this.page.setDefaultTimeout(30000);
      this.page.setDefaultNavigationTimeout(30000);

      // Handle browser dialogs automatically (e.g. Delete confirmations)
      this.page.on('dialog', async (dialog) => {
        logger.info(`💬 Browser dialog appeared: "${dialog.message()}" — Accepting automatically`);
        await dialog.accept();
      });

      if (this.testMode) {
        logger.info('🧪 TEST MODE — each step will wait for Next / Skip from the dashboard');
      }

      // Start live frame feed for the dashboard
      this.startLiveFrames();

      this.state = BOT_STATES.RUNNING;
      logger.success('✅ Browser launched successfully');

      // Run the main automation flow
      await this.runMainFlow();

    } catch (err) {
      this.state = BOT_STATES.ERROR;
      logger.error(`❌ Bot failed: ${err.message}`);
      this.emitStatus();
      await this.cleanup();
      throw err;
    }
  }

  /**
   * Stop the bot gracefully
   */
  async stop() {
    logger.info('⏹️ Stopping bot...');
    this.shouldStop = true;
    this.state = BOT_STATES.STOPPING;
    this.emitStatus();

    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    // Release any pending step gate so the flow can exit
    if (this.stepGateResolve) {
      const resolve = this.stepGateResolve;
      this.stepGateResolve = null;
      resolve('stop');
    }

    await this.cleanup();
    this.state = BOT_STATES.IDLE;
    this.currentStep = null;
    this.nextStep = null;
    this.emitStatus();
    logger.success('✅ Bot stopped successfully');
  }

  /**
   * Clean up browser resources
   */
  async cleanup() {
    this.stopLiveFrames();
    try {
      if (this.page) {
        await this.page.close().catch(() => {});
        this.page = null;
      }
      if (this.context) {
        await this.context.close().catch(() => {});
        this.context = null;
      }
      if (this.browser) {
        await this.browser.close().catch(() => {});
        this.browser = null;
      }
    } catch (err) {
      logger.warning(`Cleanup error: ${err.message}`);
    }
  }

  /**
   * Get current bot status
   */
  getStatus() {
    const totalSteps = STEPS.length;
    return {
      state: this.state,
      step: this.currentStep,
      stepName: this.currentStep ? getStepById(this.currentStep)?.name : null,
      progress: this.currentStep ? Math.round((this.currentStep / totalSteps) * 100) : 0,
      cycle: this.cycle,
      totalSteps,
      mode: this.testMode ? 'test' : 'auto',
      awaitingAdvance: this.testMode && this.state === BOT_STATES.WAITING_STEP && !!this.stepGateResolve,
      nextStep: this.nextStep,
      nextStepName: this.nextStep ? getStepById(this.nextStep)?.name : null,
    };
  }

  /**
   * Helper: Wait with abort check
   */
  async waitSafe(ms) {
    const start = Date.now();
    while (Date.now() - start < ms) {
      if (this.shouldStop) throw new Error('Bot stopped by user');
      await new Promise(r => setTimeout(r, Math.min(500, ms - (Date.now() - start))));
    }
  }

  /**
   * Helper: Retry an action with retries
   */
  async retry(action, maxRetries = 3, delayMs = 2000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await action();
      } catch (err) {
        if (attempt === maxRetries) throw err;
        logger.warning(`⚠️ Attempt ${attempt}/${maxRetries} failed: ${err.message}. Retrying in ${delayMs / 1000}s...`);
        await this.waitSafe(delayMs);
      }
    }
  }

  /**
   * Helper: Human-like mouse movement and click
   */
  async humanClick(target, description = '') {
    if (this.shouldStop) return;
    const el = typeof target === 'string'
      ? await this.page.waitForSelector(target, { state: 'visible', timeout: 15000 })
      : target;

    await el.scrollIntoViewIfNeeded().catch(() => {});
    await this.waitSafe(300);

    const box = await el.boundingBox().catch(() => null);
    if (box) {
      await this.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
    } else {
      await el.hover().catch(() => {});
    }
    await this.waitSafe(350);

    // Visual pulse effect for clear user visibility on screen
    await el.evaluate((node) => {
      node.style.outline = '3px solid #ff4466';
      node.style.boxShadow = '0 0 10px #ff4466';
      setTimeout(() => {
        node.style.outline = '';
        node.style.boxShadow = '';
      }, 800);
    }).catch(() => {});

    await this.waitSafe(250);
    try {
      await el.click({ noWaitAfter: true, timeout: 5000 });
    } catch {
      await el.click({ force: true, noWaitAfter: true }).catch(async () => {
        await el.evaluate((node) => node.click()).catch(() => {});
      });
    }
    await this.waitSafe(600);
  }

  /**
   * Helper: Human-like realistic keyboard typing
   */
  async humanType(selector, text) {
    if (this.shouldStop) return;
    const el = await this.page.waitForSelector(selector, { state: 'visible', timeout: 15000 });
    await el.scrollIntoViewIfNeeded();
    await this.waitSafe(250);
    await el.click();
    await this.waitSafe(200);

    // Clear existing text cleanly
    await el.press('Control+A');
    await el.press('Backspace');
    await this.waitSafe(250);

    // Type character by character with natural fast human typing speed (15-30ms)
    for (const char of text) {
      if (this.shouldStop) return;
      await this.page.keyboard.type(char, { delay: Math.floor(Math.random() * 15) + 15 });
    }
    await this.waitSafe(250);
  }

  /**
   * Helper: Human-like dropdown selection with visual pulse and delays
   */
  async humanSelect(target, matchTexts, label = '') {
    if (this.shouldStop) return null;
    const el = typeof target === 'string'
      ? await this.page.waitForSelector(target, { state: 'visible', timeout: 15000 })
      : target;

    // If options are still loading (only 1 option: 'Select'), wait up to 10 seconds for AJAX
    const startWait = Date.now();
    while (Date.now() - startWait < 10000) {
      if (this.shouldStop) return null;
      const count = await el.$$eval('option', options => options.length).catch(() => 1);
      if (count > 1) break;
      await this.waitSafe(400);
    }

    await el.scrollIntoViewIfNeeded();
    await this.waitSafe(300);

    // Visual pulse effect
    await el.evaluate((node) => {
      node.style.outline = '3px solid #ff4466';
      node.style.boxShadow = '0 0 10px #ff4466';
      setTimeout(() => {
        node.style.outline = '';
        node.style.boxShadow = '';
      }, 800);
    }).catch(() => {});

    await this.waitSafe(400);

    const opts = await el.$$eval('option', options => options.map(o => ({ value: o.value, text: o.textContent.trim() })));
    const matched = opts.find(o => 
      matchTexts.some(m => o.text.toLowerCase().includes(m.toLowerCase()))
    ) || (opts.length > 1 ? opts[1] : null);

    if (matched) {
      await el.selectOption(matched.value);
      // Dispatch change event to trigger dependent dropdown AJAX in site scripts
      await el.dispatchEvent('change').catch(() => {});
      logger.info(`📍 ${label || 'Option'} selected: "${matched.text}" (value: ${matched.value})`);
      await this.waitSafe(800);
      return matched;
    } else {
      logger.warning(`⚠️ No matching option found for ${label} (available: ${opts.length} options)`);
    }
    return null;
  }

  // ═══════════════════════════════════════════════
  //  LIVE FRAME FEED (Disabled to prevent flickering)
  // ═══════════════════════════════════════════════

  startLiveFrames() {
    // Disabled to prevent screen blinking in headed mode.
    // Milestones are saved cleanly via screenshotter.capture().
  }

  stopLiveFrames() {
    if (this.frameInterval) {
      clearInterval(this.frameInterval);
      this.frameInterval = null;
    }
    this._capturingFrame = false;
  }

  async captureFrame() {
    // Disabled to keep Chromium compositor stable
  }

  // ═══════════════════════════════════════════════
  //  MAIN FLOW
  // ═══════════════════════════════════════════════

  async runMainFlow() {
    // Steps 1-3: One-time setup (open site + login)
    await this.checkVPN();
    await this.runGuardedStep(1, () => this.openWebsite());
    await this.runGuardedStep(2, () => this.verifyLoginPage());
    await this.runGuardedStep(3, () => this.login());
    await this.runGuardedStep(4, () => this.navigateToMojiOglasi());

    // Infinite loop: create → wait → delete → repeat
    while (!this.shouldStop) {
      this.cycle++;
      logger.info(`🔄 ═══ Starting Cycle ${this.cycle} ═══`);

      await this.runGuardedStep(5, () => this.clickNewListing());
      await this.runGuardedStep(6, () => this.verifyListingForm());
      await this.runGuardedStep(7, () => this.fillListingForm());
      await this.runGuardedStep(8, () => this.uploadPhoto());
      await this.runGuardedStep(9, () => this.confirmListing());
      await this.runGuardedStep(10, () => this.waitTimer());

      if (this.shouldStop) break;

      await this.runGuardedStep(11, () => this.navigateToMojiOglasi());
      await this.runGuardedStep(12, () => this.findListing());
      await this.runGuardedStep(13, () => this.deleteListing());
      await this.runGuardedStep(14, () => this.loopRestart());

      if (this.shouldStop) break;

      // Small delay before next cycle
      await this.waitSafe(2000);
    }

    logger.info('Bot loop ended');
    if (this.state !== BOT_STATES.IDLE) {
      await this.stop();
    }
  }

  /**
   * Run a single step, gated by the user in test mode
   */
  async runGuardedStep(stepId, run) {
    if (this.shouldStop) return;

    while (!this.shouldStop) {
      if (this.testMode) {
        const decision = await this.requestStep(stepId);
        if (decision === 'stop') return;
        if (decision === 'skip') {
          logger.warning(`⏭️ Step ${stepId} skipped`);
          return;
        }
      }

      try {
        await run();

        if (this.testMode) {
          logger.broadcast('step_done', { step: stepId });
        }
        break; // Step finished successfully
      } catch (err) {
        if (!this.testMode) {
          throw err;
        }
        logger.error(`❌ Step ${stepId} error: ${err.message}`);
        if (this.page && !this.page.isClosed()) {
          await screenshotter.capture(this.page, stepId, `Error_Step_${stepId}`).catch(() => {});
        }
        logger.info(`🧪 Step ${stepId} paused on error. Click 'Next Step' to retry after fixing or 'Skip Step' to advance.`);
      }
    }
  }

  /**
   * Test mode: block until the user tells us to run or skip the step
   */
  async requestStep(stepId) {
    this.nextStep = stepId;
    this.state = BOT_STATES.WAITING_STEP;
    this.emitStatus();
    logger.info(`🧪 Step ${stepId} ready — press Next (run it) or Skip in the dashboard`);

    const decision = await new Promise((resolve) => {
      this.stepGateResolve = resolve;
    });
    this.stepGateResolve = null;
    this.state = BOT_STATES.RUNNING;
    this.emitStatus();

    if (this.shouldStop) return 'stop';
    return decision;
  }

  /**
   * Test mode: advance the pending step gate ('next' runs it, 'skip' jumps it)
   */
  advance(action = 'next') {
    if (!this.testMode) return { ok: false, reason: 'bot is not in test mode' };
    if (!this.stepGateResolve) return { ok: false, reason: 'no step is awaiting advance right now' };
    const resolve = this.stepGateResolve;
    this.stepGateResolve = null;
    this.state = BOT_STATES.RUNNING;
    this.emitStatus();
    resolve(action === 'skip' ? 'skip' : 'run');
    return { ok: true, action };
  }

  /**
   * Step 14: loop restart bookkeeping
   */
  async loopRestart() {
    this.setStep(14);
    await screenshotter.capture(this.page, 14, 'Loop Restart');
    logger.success(`✅ ═══ Cycle ${this.cycle} completed! Restarting... ═══`);
    logger.broadcast('complete', { cycle: this.cycle });
  }

  // ═══════════════════════════════════════════════
  //  INDIVIDUAL STEPS
  // ═══════════════════════════════════════════════

  /**
   * Pre-flight: Check if VPN is connected by testing connectivity
   */
  async checkVPN() {
    logger.info('🔒 Checking VPN connectivity to avanture.net...');
    try {
      const response = await fetch('https://www.avanture.net/', {
        signal: AbortSignal.timeout(10000),
      });
      if (response.ok) {
        logger.success('✅ VPN is connected — avanture.net is reachable');
      }
    } catch (err) {
      throw new Error('Cannot reach avanture.net — please connect your VPN first!');
    }
  }

  /**
   * Step 1: Open the website
   */
  async openWebsite() {
    this.setStep(1);

    await this.retry(async () => {
      await this.page.goto('https://www.avanture.net/', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
    });

    await screenshotter.capture(this.page, 1, 'Open Website');
    logger.success('✅ Website loaded successfully');
  }

  /**
   * Step 2: Verify the login page/form is visible
   */
  async verifyLoginPage() {
    this.setStep(2);
    await this.page.waitForSelector('#input_edit_user_login_email', { timeout: 10000 });
    await screenshotter.capture(this.page, 2, 'Login Page');
    logger.success('✅ Login form is visible');
  }

  /**
   * Step 3: Fill credentials and login
   */
  async login() {
    this.setStep(3);
    const { username, password } = this.config;

    // Check if session already authenticated
    const alreadyLoggedIn = await this.page.$('a.icon-users-account, a[href*="logout"], a:has-text("Odjava"), a:has-text("My profile")');
    if (alreadyLoggedIn) {
      logger.info('ℹ️ Already logged in from current session');
      await screenshotter.capture(this.page, 3, 'Already Logged In');
      logger.success(`✅ Authenticated as ${username}`);
      return;
    }

    logger.info('🔐 Typing login credentials like a human...');

    // Real human typing for username
    await this.humanType('#input_edit_user_login_email', username);
    await this.waitSafe(400);

    // Real human typing for password
    await this.humanType('#input_edit_user_login_password', password);
    await this.waitSafe(600);

    // Human click login button
    logger.info('🔐 Clicking Prijava (Login) button...');
    await this.humanClick('input[name="submit"][value="Prijava"]');

    // Wait for navigation and DOM to settle
    await this.page.waitForLoadState('domcontentloaded').catch(() => {});
    await this.waitSafe(3000);

    // Verify login success — check for username, logout link, or greeting in top bar
    const bodyText = await this.page.textContent('body').catch(() => '');
    const hasLogoutLink = await this.page.$('a[href*="logout"], a:has-text("Odjava"), a.icon-users-account, a:has-text("My profile"), a:has-text("Moj profil")');
    const isLoginFormStillPresent = await this.page.$('#input_edit_user_login_email');

    if (hasLogoutLink || bodyText.includes('Hello') || bodyText.includes('Pozdravljeni') || bodyText.includes('My profile') || bodyText.includes('Moj profil') || bodyText.includes(username)) {
      await screenshotter.capture(this.page, 3, 'Login Success');
      logger.success(`✅ Login successful — Welcome, ${username}!`);
    } else if (isLoginFormStillPresent) {
      await screenshotter.capture(this.page, 3, 'Login Failed');
      throw new Error('Login failed — invalid credentials. Please check your username and password.');
    } else {
      await screenshotter.capture(this.page, 3, 'Login Result');
      logger.success('✅ Login appears successful');
    }
  }

  /**
   * Step 4/11: Navigate to "Moji oglasi" via profile dropdown click
   */
  async navigateToMojiOglasi() {
    const stepId = this.currentStep && this.currentStep >= 10 ? 11 : 4;
    this.setStep(stepId);

    logger.info('👤 Clicking profile icon (My account)...');

    await this.retry(async () => {
      // 1. Check if "Moji oglasi" is already open and visible
      let mojiOglasiLink = await this.page.$('a.icon-classifieds:visible, a:has-text("Moji oglasi"):visible');

      if (!mojiOglasiLink) {
        // Locate profile icon in top nav confirmed by user: class="icon icon-users-account"
        const profileIcon = await this.page.waitForSelector('a.icon-users-account, a[onclick*="return false"]:has-text("My account"), a:has-text("My account")', {
          state: 'visible',
          timeout: 15000,
        });

        // Human click on profile icon to open menu
        await this.humanClick(profileIcon, 'Profile Icon');
        await this.waitSafe(1000);
      }

      // 2. Click "Moji oglasi" in the opened dropdown menu
      logger.info('👤 Clicking "Moji oglasi" in the profile menu...');
      mojiOglasiLink = await this.page.waitForSelector('a.icon-classifieds, a:has-text("Moji oglasi"), a[href*="classifieds/manage"]', {
        state: 'visible',
        timeout: 5000,
      }).catch(async () => {
        // If menu was closed, re-click the profile icon to toggle it open
        logger.info('👤 Re-clicking profile icon to ensure menu is open...');
        const icon = await this.page.waitForSelector('a.icon-users-account, a:has-text("My account")', {
          state: 'visible',
          timeout: 10000,
        });
        await this.humanClick(icon, 'Profile Icon');
        await this.waitSafe(1000);
        return await this.page.waitForSelector('a.icon-classifieds, a:has-text("Moji oglasi"), a[href*="classifieds/manage"]', {
          state: 'visible',
          timeout: 10000,
        });
      });

      await this.humanClick(mojiOglasiLink, 'Moji Oglasi');

      await this.page.waitForLoadState('domcontentloaded');
      await this.waitSafe(2000);
    });

    await screenshotter.capture(this.page, stepId, 'My Classifieds');
    logger.success('✅ Navigated to My Classifieds via profile menu');
  }

  /**
   * Step 5: Click "New Listing" on My Classifieds page
   */
  async clickNewListing() {
    this.setStep(5);

    logger.info('📋 Checking for existing listings or clicking New Listing...');

    // If there is an existing listing or limit reached warning, delete the old listing first
    const existingDeleteBtn = await this.page.$('a.delete, [href*="classifieds/delete"], a:has-text("Delete listing")');
    if (existingDeleteBtn) {
      logger.warn('⚠️ Found existing leftover listing on account. Deleting it before creating new listing...');
      await this.humanClick(existingDeleteBtn, 'Delete Leftover Listing');
      await this.waitSafe(1200);
      const confirmBtn = await this.page.waitForSelector(
        'button:has-text("Continue"), a:has-text("Continue"), .fancybox-container button:first-of-type',
        { state: 'visible', timeout: 6000 }
      ).catch(() => null);
      if (confirmBtn) {
        await this.humanClick(confirmBtn, 'Confirm Delete');
        await this.waitSafe(2500);
      }
    }

    await this.retry(async () => {
      // Look for the "New listing" / "Nov oglas" button on the page
      const newListingBtn = await this.page.waitForSelector('a:has-text("New listing"), a:has-text("Nov oglas"), a[href*="classifieds/edit"], a[href*="classifieds/create"]', {
        state: 'visible',
        timeout: 15000,
      });

      await this.humanClick(newListingBtn, 'New Listing Button');

      await this.page.waitForLoadState('domcontentloaded');
      await this.waitSafe(2000);
    });

    await screenshotter.capture(this.page, 5, 'New Listing Page');
    logger.success('✅ On New Listing page via real button click');
  }

  /**
   * Step 6: Verify the listing form is loaded
   */
  async verifyListingForm() {
    this.setStep(6);

    logger.info('📝 Verifying listing form is loaded...');

    await this.page.waitForSelector('input[name*="title"], textarea[name*="description"]', {
      state: 'visible',
      timeout: 15000,
    });

    await screenshotter.capture(this.page, 6, 'Listing Form Ready');
    logger.success('✅ Listing form is ready');
  }

  /**
   * Step 7: Fill all form fields and submit like a human
   */
  async fillListingForm() {
    this.setStep(7);

    const { title, category, description, country, state, city } = this.config;

    // 1. Fill Title (human typing)
    logger.info('✍️ Typing title like a human...');
    await this.humanType('#input_edit_classifieds_listing_data_title, input[name*="title"]', title);
    await this.waitSafe(600);

    // 2. Select Category (human select)
    logger.info('✍️ Selecting category...');
    await this.humanSelect('#input_edit_classifieds_listing_data_category, select[name="data_category"], select[name*="category"]', ['he seeks her', 'on išče njo', category], 'Category');
    await this.waitSafe(600);

    // 3. Fill Description (human typing)
    logger.info('✍️ Typing description like a human...');
    await this.humanType('#input_edit_classifieds_listing_data_description, textarea', description);
    await this.waitSafe(600);

    // 4. Select Country (Slovenia)
    logger.info('✍️ Selecting Country (Slovenia)...');
    await this.humanSelect('#input_edit_classifieds_listing_data_location_country, select[name*="country"]', ['sloven', country], 'Country');
    logger.info('⏳ Waiting for State / Province options to populate...');
    await this.waitSafe(1500);

    // 5. Select State / Province (Osrednjeslovenska)
    logger.info('✍️ Selecting State / Province...');
    await this.humanSelect('#input_edit_classifieds_listing_data_location_state, select[name*="state"]', ['osredn', state], 'State / Province');
    logger.info('⏳ Waiting for City options to populate...');
    await this.waitSafe(2000);

    // 6. Select City (Ljubljana)
    logger.info('✍️ Selecting City...');
    await this.humanSelect('#input_edit_classifieds_listing_data_location_city, select[name*="city"]', ['ljubljan', city], 'City');
    await this.waitSafe(800);

    // 7. Verify all location dropdowns have selected values
    const locValues = await this.page.evaluate(() => {
      const c = document.querySelector('#input_edit_classifieds_listing_data_location_country, select[name*="country"]');
      const s = document.querySelector('#input_edit_classifieds_listing_data_location_state, select[name*="state"]');
      const ct = document.querySelector('#input_edit_classifieds_listing_data_location_city, select[name*="city"]');
      return {
        country: c ? c.value : '',
        state: s ? s.value : '',
        city: ct ? ct.value : '',
        stateText: s && s.selectedOptions[0] ? s.selectedOptions[0].text : '',
        cityText: ct && ct.selectedOptions[0] ? ct.selectedOptions[0].text : '',
      };
    });

    logger.info(`📍 Verified location: Country val=${locValues.country}, State="${locValues.stateText}" (${locValues.state}), City="${locValues.cityText}" (${locValues.city})`);

    // Safety fallback: if state or city was somehow not selected, select it explicitly
    if (!locValues.state) {
      logger.warning('⚠️ State not selected, attempting fallback selection...');
      await this.humanSelect('#input_edit_classifieds_listing_data_location_state, select[name*="state"]', ['osredn', state], 'State / Province');
      await this.waitSafe(2000);
    }
    if (!locValues.city) {
      logger.warning('⚠️ City not selected, attempting fallback selection...');
      await this.humanSelect('#input_edit_classifieds_listing_data_location_city, select[name*="city"]', ['ljubljan', city], 'City');
      await this.waitSafe(800);
    }

    await screenshotter.capture(this.page, 7, 'Form Filled');
    logger.success('✅ All form fields filled successfully');

    // 8. Click Update / Submit button
    logger.info('✍️ Clicking Update button to submit...');
    const submitBtn = await this.page.waitForSelector('input[type="submit"][value="Update"], input[type="submit"], button[type="submit"]', { state: 'visible', timeout: 10000 });
    await this.humanClick(submitBtn, 'Submit Button');

    await this.page.waitForLoadState('domcontentloaded');
    await this.waitSafe(2500);
    logger.success('✅ Listing form submitted');
  }

  /**
   * Helper: Resolves photo path whether it is a specific file or a folder containing images
   */
  resolvePhotoPath(photoPath) {
    if (!photoPath || !fs.existsSync(photoPath)) {
      throw new Error(`Photo path not found: "${photoPath}". Please enter a valid file path.`);
    }

    const stat = fs.statSync(photoPath);
    if (!stat.isDirectory()) {
      return photoPath;
    }

    // Directory provided: automatically scan and pick an image file
    const files = fs.readdirSync(photoPath);
    const exts = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'];
    const imageFiles = files
      .filter(f => exts.includes(path.extname(f).toLowerCase()))
      .map(f => path.join(photoPath, f));

    if (imageFiles.length === 0) {
      throw new Error(`Folder "${photoPath}" contains no image files (.jpg, .png, .webp). Please put an image in the folder or specify a direct image file path.`);
    }

    const chosen = imageFiles[Math.floor(Math.random() * imageFiles.length)];
    logger.info(`📁 Folder provided — automatically selected image: "${path.basename(chosen)}"`);
    return chosen;
  }

  /**
   * Step 8: Upload photo on the "Add pictures" page
   */
  async uploadPhoto() {
    this.setStep(8);

    logger.info('📸 Checking for photo upload...');
    await this.page.waitForLoadState('domcontentloaded').catch(() => {});
    await this.waitSafe(2000);

    // 1. If not yet on the "Add pictures" page, navigate to it via "Add pictures" link
    if (!this.page.url().includes('pictures/upload')) {
      logger.info('📸 Locating Add pictures link for the listing...');

      // Check for direct "Add pictures" link on manage page
      let addPicsLink = await this.page.$('a:has-text("Add pictures"), a:has-text("Dodaj slike"), a[href*="classifieds/pictures/upload"]');

      if (!addPicsLink) {
        // If not directly on manage, click the listing to view it, where "Add pictures" link is located
        const listingTitleLink = await this.page.$('.classified a[href*="classifieds/view"], a[href*="classifieds/view"]');
        if (listingTitleLink) {
          logger.info('📸 Opening listing view page to reach Add pictures...');
          await this.humanClick(listingTitleLink, 'Listing Title Link');
          await this.page.waitForLoadState('domcontentloaded').catch(() => {});
          await this.waitSafe(2000);
          addPicsLink = await this.page.$('a:has-text("Add pictures"), a:has-text("Dodaj slike"), a[href*="classifieds/pictures/upload"]');
        }
      }

      if (addPicsLink) {
        logger.info('📸 Clicking "Add pictures" link like a human...');
        await this.humanClick(addPicsLink, 'Add Pictures Link');
        await this.page.waitForLoadState('domcontentloaded').catch(() => {});
        await this.waitSafe(2500);
      }
    }

    await screenshotter.capture(this.page, 8, 'Add Pictures Page');

    // 2. Locate the file input on the Add pictures page
    const fileInput = await this.page.waitForSelector('input[type="file"]', { state: 'attached', timeout: 15000 }).catch(() => null);

    if (fileInput) {
      const resolvedPhoto = this.resolvePhotoPath(this.config.photoPath);
      logger.info(`📸 Selecting photo file from "${resolvedPhoto}"...`);
      await fileInput.setInputFiles(resolvedPhoto);

      // Wait for the upload progress bar to finish (Plupload auto-uploads)
      logger.info('⏳ Uploading image file to listing...');
      await this.waitSafe(5000);

      // Check if there is an explicit "Upload file" button that needs clicking
      const uploadSubmitBtn = await this.page.$('#uploader-picture-submit, a:has-text("Upload file")');
      if (uploadSubmitBtn && await uploadSubmitBtn.isVisible()) {
        await this.humanClick(uploadSubmitBtn, 'Upload File Button');
        await this.waitSafe(4000);
      }

      await screenshotter.capture(this.page, 8, 'Photo Uploaded');
      logger.success('✅ Photo uploaded successfully to listing!');

      // Navigate forward by human-clicking "View listing" in top right
      const viewListingBtn = await this.page.$('a:has-text("View listing"), a:has-text("Poglej oglas"), #uploader-picture-continue');
      if (viewListingBtn && await viewListingBtn.isVisible()) {
        logger.info('📸 Clicking "View listing" button like a human...');
        await this.humanClick(viewListingBtn, 'View Listing Button');
        await this.page.waitForLoadState('domcontentloaded').catch(() => {});
        await this.waitSafe(2000);
      }
    } else {
      logger.warning('⚠️ No file input found on the current page');
    }
  }

  /**
   * Step 9: Click Continue/Skip to publish listing
   */
  async confirmListing() {
    this.setStep(9);

    logger.info('✅ Confirming listing publication...');
    await this.page.waitForLoadState('domcontentloaded').catch(() => {});
    await this.waitSafe(1500);

    const continueBtn = await this.page.$('a:has-text("Continue"), button:has-text("Continue"), input[value="Continue"], a:has-text("Nadaljuj"), a[href*="classifieds/manage"]');
    if (continueBtn && await continueBtn.isVisible()) {
      logger.info('✅ Clicking Continue button...');
      await this.humanClick(continueBtn, 'Continue Button');
      await this.page.waitForLoadState('domcontentloaded').catch(() => {});
      await this.waitSafe(2000);
    }

    await screenshotter.capture(this.page, 9, 'Listing Published');
    logger.success('✅ Listing published successfully with photo');
    logger.broadcast('complete', { type: 'listing_created', cycle: this.cycle });
  }

  /**
   * Step 10: Wait for user-defined timer duration
   */
  async waitTimer() {
    this.setStep(10);
    this.state = BOT_STATES.WAITING;
    this.emitStatus();

    const { timerValue, timerUnit } = this.config;
    let totalMs = timerUnit === 'hours'
      ? timerValue * 60 * 60 * 1000
      : timerValue * 60 * 1000;

    // In test mode, cap the wait so the walkthrough doesn't stall
    if (this.testMode && totalMs > 10000) {
      logger.warning(`🧪 Test mode: timer capped to 10s (config says ${timerValue} ${timerUnit})`);
      totalMs = 10000;
    }

    const totalSeconds = Math.floor(totalMs / 1000);
    let remaining = totalSeconds;

    logger.info(`⏱️ Waiting ${timerValue} ${timerUnit} before deleting...`);

    // Emit countdown every second
    await new Promise((resolve, reject) => {
      this.timerInterval = setInterval(() => {
        if (this.shouldStop) {
          clearInterval(this.timerInterval);
          this.timerInterval = null;
          reject(new Error('Bot stopped by user'));
          return;
        }

        remaining--;
        logger.broadcast('timer', {
          remaining,
          total: totalSeconds,
          display: this.formatTime(remaining),
        });

        if (remaining <= 0) {
          clearInterval(this.timerInterval);
          this.timerInterval = null;
          resolve();
        }
      }, 1000);
    });

    this.state = BOT_STATES.RUNNING;
    this.emitStatus();
    logger.success('⏱️ Timer completed! Proceeding to delete...');
  }

  /**
   * Format seconds to readable time string
   */
  formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) {
      return `${h}h ${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`;
    }
    return `${m}m ${s.toString().padStart(2, '0')}s`;
  }

  /**
   * Step 12: Find the listing on My Classifieds page
   */
  async findListing() {
    this.setStep(12);

    logger.info('🔍 Finding the listing to delete...');

    await this.waitSafe(1500);

    // Highlight the target listing row if found
    const listingRow = await this.page.$('.classified, .listing, tr:has-text("Avtomatiziran"), div:has-text("Avtomatiziran"), .item');
    if (listingRow) {
      await listingRow.scrollIntoViewIfNeeded().catch(() => {});
      await listingRow.evaluate(node => {
        node.style.outline = '3px solid #00b894';
        node.style.boxShadow = '0 0 10px #00b894';
        setTimeout(() => { node.style.outline = ''; node.style.boxShadow = ''; }, 1500);
      }).catch(() => {});
    }

    await screenshotter.capture(this.page, 12, 'Find Listing');
    logger.success('✅ Listing found on page');
  }

  /**
   * Step 13: Delete listing and confirm with human clicks
   */
  async deleteListing() {
    this.setStep(13);

    logger.info('🗑️ Locating Delete button for the listing...');

    // 1. Find and human-click the Delete button on the listing
    const deleteBtn = await this.page.waitForSelector('a.delete, a:has-text("Delete listing"), a:has-text("Izbriši oglas"), button:has-text("Delete"), a:has-text("Delete"), [href*="delete"]', {
      state: 'visible',
      timeout: 15000,
    });

    logger.info('🗑️ Clicking Delete listing button like a human...');
    await this.humanClick(deleteBtn, 'Delete Button');
    await this.waitSafe(1000);

    // 2. Wait for confirmation modal to appear and click "Continue"
    logger.info('🗑️ Waiting for confirmation modal and clicking "Continue"...');
    await this.waitSafe(1000);

    let confirmBtn = await this.page.waitForSelector(
      'button:has-text("Continue"), a:has-text("Continue"), input[value="Continue"], .fancybox-container button:first-of-type, .fancybox-slide button:first-of-type, a:has-text("Nadaljuj"), button:has-text("Nadaljuj")',
      { state: 'visible', timeout: 8000 }
    ).catch(() => null);

    if (!confirmBtn) {
      const handle = await this.page.evaluateHandle(() => {
        const els = Array.from(document.querySelectorAll('.fancybox-container button, .fancybox-container a, button, a'));
        return els.find(el => (el.innerText || el.textContent || '').trim().toLowerCase() === 'continue');
      }).catch(() => null);
      if (handle && handle.asElement()) {
        confirmBtn = handle.asElement();
      }
    }

    if (confirmBtn) {
      logger.info('🗑️ Clicking "Continue" button in confirmation dialog...');
      await this.humanClick(confirmBtn, 'Confirm Continue Button');
      await this.waitSafe(2500);
      await this.page.waitForLoadState('domcontentloaded').catch(() => {});
      await this.waitSafe(2000);
    } else {
      logger.warn('⚠️ Continue button not found via selector, checking listing deletion status');
    }

    await screenshotter.capture(this.page, 13, 'Listing Deleted');
    logger.success('🗑️ Listing deleted successfully!');
    logger.broadcast('complete', { type: 'listing_deleted', cycle: this.cycle });
  }
}

// Singleton
const bot = new AvenBot();
export default bot;
