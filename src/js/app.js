/**
 * aven.bot — Main Application Controller
 * High-tech Mission Control orchestrating UI components and server telemetry
 */

import { WebSocketClient } from './websocket.js';
import { Timeline } from './timeline.js';
import { LogViewer } from './logger.js';
import { showToast, openLightbox, closeLightbox, showElement, hideElement, formatTime } from './ui.js';

class App {
  constructor() {
    this.ws = new WebSocketClient();
    this.timeline = null;
    this.logViewer = null;
    this.isRunning = false;
    this.currentState = 'idle';
    this.isTestMode = false;
    this.completedCycles = 0;

    this.init();
  }

  /**
   * Initialize the application
   */
  init() {
    // Initialize components
    this.timeline = new Timeline('timelineTrack');
    this.logViewer = new LogViewer('logEntries');

    // Setup WebSocket
    this.setupWebSocket();

    // Setup UI event handlers
    this.setupFormHandlers();
    this.setupPresetButtons();
    this.setupConsoleTools();
    this.setupPasswordToggle();
    this.setupTimerUnitToggle();
    this.setupModeSelector();
    this.setupTestControls();
    this.setupLogFilters();
    this.setupLightbox();
    this.loadSavedConfig();

    // Connect WebSocket
    this.ws.connect();
  }

  // ═══════════════════════════════════════════════
  //  WEBSOCKET SETUP
  // ═══════════════════════════════════════════════

  setupWebSocket() {
    // Connection state
    this.ws.on('connection', (data) => {
      this.updateConnectionStatus(data.connected);
      if (data.connected) {
        showToast('Connected to aven.bot mission engine', 'success', 2000);
      } else if (data.maxRetriesReached) {
        showToast('Cannot connect to engine server. Please ensure backend is running.', 'error', 0);
      }
    });

    // Server connected event
    this.ws.on('connected', () => {
      this.updateConnectionStatus(true);
    });

    // Bot status updates
    this.ws.on('status', (data) => {
      this.handleStatusUpdate(data);
    });

    // Log entries
    this.ws.on('log', (entry) => {
      this.logViewer.addEntry(entry);
    });

    // Screenshots
    this.ws.on('screenshot', (data) => {
      this.handleScreenshot(data);
    });

    // Live browser frames
    this.ws.on('frame', (data) => {
      this.handleFrame(data);
    });

    // Step-test: current step completed
    this.ws.on('step_done', (data) => {
      const nameEl = document.getElementById('testStepName');
      if (nameEl) nameEl.textContent = `Step ${data.step} complete ✓ — preparing next step...`;
    });

    // Timer countdown
    this.ws.on('timer', (data) => {
      this.handleTimerUpdate(data);
    });

    // Cycle complete
    this.ws.on('complete', (data) => {
      if (data.type === 'listing_created') {
        showToast(`Listing published successfully! (Cycle ${data.cycle})`, 'success');
      } else if (data.type === 'listing_deleted') {
        this.completedCycles++;
        this.updateCycleKPI(data.cycle);
        showToast(`Listing deleted. Starting next cycle loop...`, 'info');
      } else if (data.cycle) {
        this.completedCycles++;
        this.updateCycleKPI(data.cycle);
        showToast(`Cycle ${data.cycle} completed!`, 'success');
      }
    });

    // Errors
    this.ws.on('error', (data) => {
      showToast(`Engine Error: ${data.message}`, 'error', 6000);
      this.updateStateKPI('error', 'Encountered issue');
    });
  }

  // ═══════════════════════════════════════════════
  //  STATUS & KPI HANDLING
  // ═══════════════════════════════════════════════

  handleStatusUpdate(data) {
    const { state, step, stepName, progress, cycle, totalSteps } = data;

    this.currentState = state;

    // Update step display
    if (step && stepName) {
      const stepNameEl = document.getElementById('stepName');
      if (stepNameEl) stepNameEl.textContent = `Step ${step}/${totalSteps || 14} — ${stepName}`;

      // Update timeline
      this.timeline.setActiveStep(step);
    }

    // Update progress bar
    if (progress !== undefined) {
      const progressFill = document.getElementById('progressFill');
      const progressText = document.getElementById('progressText');
      if (progressFill) progressFill.style.width = `${progress}%`;
      if (progressText) progressText.textContent = `${progress}%`;
    }

    // Update cycle badges
    if (cycle !== undefined) {
      const cycleBadge = document.getElementById('cycleBadge');
      if (cycleBadge) cycleBadge.textContent = `Cycle ${cycle || 1}`;
      this.updateCycleKPI(cycle);
    }

    // Update KPI card states
    this.updateStateKPI(state, stepName);

    // Handle state changes
    if (state === 'idle' || state === 'stopping') {
      this.setUIState('idle');
    } else if (state === 'error') {
      this.setUIState('error');
    } else if (state === 'waiting') {
      showElement('timerDisplay');
      this.updateTimerKPI(null, 'Waiting on countdown');
    } else if (state === 'running' || state === 'waiting_step') {
      hideElement('timerDisplay');
      this.updateTimerKPI('--:--', 'Executing steps');
    }

    // Step-test mode panel
    this.handleTestStatus(data);

    // Reset loop steps when starting a new cycle
    if (step === 5 && cycle > 1) {
      this.timeline.resetForNewCycle();
    }
  }

  updateStateKPI(state, detail = '') {
    const textEl = document.getElementById('kpiStateText');
    const subEl = document.getElementById('kpiStateSub');
    const cardEl = document.getElementById('kpiStateCard');

    if (!textEl) return;

    if (cardEl) {
      cardEl.classList.remove('state-running', 'state-waiting');
    }

    if (state === 'running') {
      textEl.textContent = 'RUNNING';
      textEl.style.color = 'var(--cyan-400)';
      if (subEl) subEl.textContent = detail || 'Pipeline active';
      cardEl?.classList.add('state-running');
    } else if (state === 'waiting') {
      textEl.textContent = 'WAITING';
      textEl.style.color = 'var(--warning-400)';
      if (subEl) subEl.textContent = detail || 'Step 10 timer active';
      cardEl?.classList.add('state-waiting');
    } else if (state === 'error') {
      textEl.textContent = 'ERROR';
      textEl.style.color = 'var(--error-400)';
      if (subEl) subEl.textContent = detail || 'Check console logs';
    } else {
      textEl.textContent = 'IDLE';
      textEl.style.color = 'var(--text-primary)';
      if (subEl) subEl.textContent = 'Standby for launch';
    }
  }

  updateCycleKPI(cycle) {
    const cycleText = document.getElementById('kpiCycleText');
    const cycleSub = document.getElementById('kpiCycleSub');
    if (cycleText) cycleText.textContent = `Cycle ${cycle || 1}`;
    if (cycleSub) cycleSub.textContent = `${this.completedCycles} cycles completed`;
  }

  updateTimerKPI(displayTime, subText) {
    const timerText = document.getElementById('kpiTimerText');
    const timerSub = document.getElementById('kpiTimerSub');
    if (timerText && displayTime) timerText.textContent = displayTime;
    if (timerSub && subText) timerSub.textContent = subText;
  }

  handleTestStatus(data) {
    const testPanel = document.getElementById('testPanel');
    if (!testPanel) return;

    if (data.mode !== 'test') {
      hideElement('testPanel');
      return;
    }

    showElement('testPanel');

    const nameEl = document.getElementById('testStepName');
    const btnNext = document.getElementById('btnTestNext');
    const btnSkip = document.getElementById('btnTestSkip');

    if (data.awaitingAdvance && data.nextStep) {
      if (nameEl) nameEl.textContent = `Step ${data.nextStep}/${data.totalSteps || 14} — ${data.nextStepName || 'Next'}`;
      if (btnNext) btnNext.disabled = false;
      if (btnSkip) btnSkip.disabled = false;
    } else if (data.stepName) {
      if (nameEl) nameEl.textContent = `Step ${data.step}/${data.totalSteps || 14} — ${data.stepName} (processing...)`;
      if (btnNext) btnNext.disabled = true;
      if (btnSkip) btnSkip.disabled = true;
    }
  }

  handleFrame(data) {
    const img = document.getElementById('liveImage');
    const placeholder = document.getElementById('livePlaceholder');
    if (img && data.data) {
      img.src = data.data;
      img.style.display = 'block';
      if (placeholder) placeholder.style.display = 'none';
    }
  }

  handleScreenshot(data) {
    this.timeline.addScreenshot(data.step, data);
  }

  handleTimerUpdate(data) {
    const display = data.display || formatTime(data.remaining);
    const countdownEl = document.getElementById('timerCountdown');
    if (countdownEl) {
      countdownEl.textContent = display;
    }
    this.updateTimerKPI(display, 'Counting down to deletion');
    showElement('timerDisplay');
  }

  // ═══════════════════════════════════════════════
  //  UI STATE MANAGEMENT
  // ═══════════════════════════════════════════════

  updateConnectionStatus(connected) {
    const statusEl = document.getElementById('connectionStatus');
    const textEl = statusEl?.querySelector('.status-text');
    const vpnText = document.getElementById('kpiVpnText');

    if (statusEl) {
      statusEl.classList.toggle('connected', connected);
      statusEl.classList.toggle('disconnected', !connected);
    }
    if (textEl) {
      textEl.textContent = connected ? 'Online & Synced' : 'Disconnected';
    }
    if (vpnText) {
      vpnText.textContent = connected ? 'Active / OK' : 'Offline';
      vpnText.style.color = connected ? 'var(--success-400)' : 'var(--error-400)';
    }
  }

  setUIState(state) {
    const startBtn = document.getElementById('btnStart');
    const stopBtn = document.getElementById('btnStop');
    const btnText = startBtn?.querySelector('.btn-text');
    const btnLoading = startBtn?.querySelector('.btn-loading');

    if (state === 'running') {
      this.isRunning = true;

      // Show running panels
      showElement('statusPanel');

      // Update buttons
      if (startBtn) startBtn.style.display = 'none';
      if (stopBtn) stopBtn.style.display = 'inline-flex';

      // Lock form inputs during run
      this.setFormDisabled(true);

    } else if (state === 'idle' || state === 'error') {
      this.isRunning = false;
      this.isTestMode = false;

      // Update buttons
      if (startBtn) {
        startBtn.style.display = 'inline-flex';
        startBtn.disabled = false;
        if (btnText) btnText.style.display = '';
        if (btnLoading) btnLoading.style.display = 'none';
      }
      if (stopBtn) stopBtn.style.display = 'none';

      // Re-enable form
      this.setFormDisabled(false);

      // Hide timer & test controls
      hideElement('timerDisplay');
      hideElement('testPanel');
      this.updateStateKPI('idle');
    }
  }

  setFormDisabled(disabled) {
    const form = document.getElementById('botConfigForm');
    if (!form) return;

    const inputs = form.querySelectorAll('input, textarea, select, button.unit-btn');
    inputs.forEach(input => {
      if (input.type !== 'button' || input.classList.contains('unit-btn')) {
        input.disabled = disabled;
      }
    });

    const formGrid = form.querySelector('.form-grid');
    if (formGrid) {
      formGrid.style.opacity = disabled ? '0.55' : '1';
      formGrid.style.pointerEvents = disabled ? 'none' : '';
    }
  }

  // ═══════════════════════════════════════════════
  //  PRESET TOOLBAR & CONSOLE TOOLS
  // ═══════════════════════════════════════════════

  setupPresetButtons() {
    const demoBtn = document.getElementById('btnFillDemo');
    const resetBtn = document.getElementById('btnResetForm');
    const form = document.getElementById('botConfigForm');

    demoBtn?.addEventListener('click', () => {
      if (!form) return;
      form.elements['username'].value = 'user_demo';
      form.elements['password'].value = 'SecurePass123!';
      form.elements['country'].value = 'Slovenia';
      form.elements['state'].value = 'Osrednjeslovenska';
      form.elements['city'].value = 'Ljubljana';
      form.elements['title'].value = 'Ugodno prodam lepo ohranjeno opremo';
      form.elements['category'].value = 'He seeks her';
      form.elements['description'].value = 'Odlično ohranjeno, malo rabljeno, brezhibno delujoče. Ogled in prevzem možen v Ljubljani. Za več informacij pošljite sporočilo.';
      form.elements['photoPath'].value = 'C:\\Photos\\slika.jpg';
      form.elements['timerValue'].value = '30';
      showToast('⚡ Quick Demo configuration populated!', 'success', 2500);
    });

    resetBtn?.addEventListener('click', () => {
      if (!form) return;
      form.reset();
      showToast('Form cleared to defaults', 'info', 2000);
    });
  }

  setupConsoleTools() {
    // Copy Logs Button
    const copyBtn = document.getElementById('btnCopyLogs');
    copyBtn?.addEventListener('click', async () => {
      const logs = this.logViewer.getPlainText();
      if (!logs) {
        showToast('Console stream is currently empty', 'info', 2000);
        return;
      }
      try {
        await navigator.clipboard.writeText(logs);
        showToast('Console stream copied to clipboard!', 'success', 2000);
      } catch {
        showToast('Failed to copy to clipboard', 'warning', 2000);
      }
    });

    // Search Input
    const searchInput = document.getElementById('logSearchInput');
    searchInput?.addEventListener('input', (e) => {
      this.logViewer.setSearch(e.target.value);
    });
  }

  // ═══════════════════════════════════════════════
  //  FORM HANDLERS
  // ═══════════════════════════════════════════════

  saveFormConfig(config) {
    try {
      localStorage.setItem('aven_bot_config', JSON.stringify(config));
    } catch {}
  }

  loadSavedConfig() {
    try {
      const saved = localStorage.getItem('aven_bot_config');
      if (!saved) return;
      const config = JSON.parse(saved);
      const form = document.getElementById('botConfigForm');
      if (!form) return;
      for (const [key, val] of Object.entries(config)) {
        const input = form.elements[key];
        if (input && val !== undefined) {
          input.value = val;
        }
      }
      if (config.timerUnit) {
        const toggle = document.getElementById('timerUnitToggle');
        toggle?.querySelectorAll('.unit-btn').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.unit === config.timerUnit);
        });
      }
    } catch {}
  }

  setupFormHandlers() {
    const form = document.getElementById('botConfigForm');
    const stopBtn = document.getElementById('btnStop');

    // Start bot
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.startBot();
    });

    // Stop bot
    stopBtn?.addEventListener('click', async () => {
      await this.stopBot();
    });
  }

  async startBot() {
    const form = document.getElementById('botConfigForm');
    const startBtn = document.getElementById('btnStart');
    const btnText = startBtn?.querySelector('.btn-text');
    const btnLoading = startBtn?.querySelector('.btn-loading');

    // Collect form data
    const formData = new FormData(form);
    const config = Object.fromEntries(formData.entries());
    this.isTestMode = config.mode === 'test';
    this.saveFormConfig(config);

    // Basic validation
    const required = ['username', 'password', 'title', 'category', 'description', 'country', 'state', 'city', 'photoPath', 'timerValue'];
    const missing = required.filter(field => !config[field]?.trim());

    if (missing.length > 0) {
      showToast(`Please complete all required fields: ${missing.join(', ')}`, 'warning');
      return;
    }

    // Show loading state
    if (startBtn) startBtn.disabled = true;
    if (btnText) btnText.style.display = 'none';
    if (btnLoading) btnLoading.style.display = '';

    try {
      // Reset log and timeline
      this.logViewer.clear();
      this.timeline.reset();

      const response = await fetch('/api/bot/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      const result = await response.json();

      if (response.ok) {
        showToast(this.isTestMode ? 'Step-Test mode launched — execute steps on demand!' : 'Mission Engine launched!', 'success');
        this.setUIState('running');
      } else {
        showToast(`Failed to start: ${result.error}`, 'error');
        this.setUIState('idle');
      }
    } catch (err) {
      showToast(`Connection error: ${err.message}`, 'error');
      this.setUIState('idle');
    }
  }

  async stopBot() {
    try {
      showToast('Aborting mission engine...', 'info', 2000);

      const response = await fetch('/api/bot/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const result = await response.json();

      if (response.ok) {
        showToast('Engine stopped', 'success');
        this.setUIState('idle');
      } else {
        showToast(`Failed to abort: ${result.error}`, 'error');
      }
    } catch (err) {
      showToast(`Network error: ${err.message}`, 'error');
    }
  }

  // ═══════════════════════════════════════════════
  //  UI CONTROLS SETUP
  // ═══════════════════════════════════════════════

  setupPasswordToggle() {
    const toggleBtn = document.getElementById('togglePassword');
    const passwordInput = document.getElementById('inputPassword');

    toggleBtn?.addEventListener('click', () => {
      const isPassword = passwordInput.type === 'password';
      passwordInput.type = isPassword ? 'text' : 'password';

      const eyeOpen = toggleBtn.querySelector('.eye-open');
      const eyeClosed = toggleBtn.querySelector('.eye-closed');
      if (eyeOpen) eyeOpen.style.display = isPassword ? 'none' : '';
      if (eyeClosed) eyeClosed.style.display = isPassword ? '' : 'none';
    });
  }

  setupTimerUnitToggle() {
    const toggle = document.getElementById('timerUnitToggle');
    const hiddenInput = document.getElementById('inputTimerUnit');

    toggle?.addEventListener('click', (e) => {
      const btn = e.target.closest('.unit-btn');
      if (!btn) return;

      toggle.querySelectorAll('.unit-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (hiddenInput) hiddenInput.value = btn.dataset.unit;
    });
  }

  setupModeSelector() {
    const toggle = document.getElementById('modeToggle');
    const hiddenInput = document.getElementById('inputMode');

    toggle?.addEventListener('click', (e) => {
      const btn = e.target.closest('.mode-btn');
      if (!btn) return;

      toggle.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (hiddenInput) hiddenInput.value = btn.dataset.mode;

      showToast(btn.dataset.mode === 'test' ? 'Step Test mode selected' : 'Auto Run mode selected', 'info', 2000);
    });
  }

  setupTestControls() {
    const btnNext = document.getElementById('btnTestNext');
    const btnSkip = document.getElementById('btnTestSkip');

    btnNext?.addEventListener('click', () => this.sendStepAction('next'));
    btnSkip?.addEventListener('click', () => this.sendStepAction('skip'));
  }

  async sendStepAction(action) {
    try {
      const endpoint = action === 'skip' ? '/api/bot/test/skip' : '/api/bot/test/next';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const result = await response.json();
      if (!response.ok) {
        showToast(`Step not ready: ${result.error}`, 'warning', 3000);
      }
    } catch (err) {
      showToast(`Network error: ${err.message}`, 'error');
    }
  }

  setupLogFilters() {
    const filterBtns = document.querySelectorAll('.log-filter-btn');

    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.logViewer.setFilter(btn.dataset.level);
      });
    });
  }

  setupLightbox() {
    const closeBtn = document.getElementById('lightboxClose');
    closeBtn?.addEventListener('click', closeLightbox);

    this.timeline.setScreenshotClickHandler((screenshot) => {
      openLightbox(screenshot.url, `Step ${screenshot.step}: ${screenshot.name}`);
    });
  }
}

// ═══════════════════════════════════════════════
//  BOOTSTRAP
// ═══════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
