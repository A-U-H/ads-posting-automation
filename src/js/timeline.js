/**
 * aven.bot — Timeline Renderer
 * Renders the step-by-step visual timeline with high-tech SVG icons
 */

const STEPS = [
  {
    id: 1,
    name: 'Open Site',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`
  },
  {
    id: 2,
    name: 'Login Page',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><polyline points="10 17 15 12 10 7"></polyline><line x1="15" y1="12" x2="3" y2="12"></line></svg>`
  },
  {
    id: 3,
    name: 'Login',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`
  },
  {
    id: 4,
    name: 'Profile Nav',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`
  },
  {
    id: 5,
    name: 'Classifieds',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>`
  },
  {
    id: 6,
    name: 'Form Page',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>`
  },
  {
    id: 7,
    name: 'Fill Form',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`
  },
  {
    id: 8,
    name: 'Photo',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`
  },
  {
    id: 9,
    name: 'Publish',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`
  },
  {
    id: 10,
    name: 'Timer',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`
  },
  {
    id: 11,
    name: 'Back Nav',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>`
  },
  {
    id: 12,
    name: 'Find',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`
  },
  {
    id: 13,
    name: 'Delete',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`
  },
  {
    id: 14,
    name: 'Loop',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>`
  },
];

export class Timeline {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.stepStates = {};
    this.screenshots = {};
    this.render();
  }

  /**
   * Initial render of timeline steps
   */
  render() {
    if (!this.container) return;

    this.container.innerHTML = STEPS.map(step => `
      <div class="timeline-step pending" id="timeline-step-${step.id}" data-step="${step.id}">
        <div class="timeline-step-icon">${step.icon}</div>
        <div class="timeline-step-label">${step.name}</div>
      </div>
    `).join('');

    // Click handlers for screenshot preview
    this.container.querySelectorAll('.timeline-step').forEach(el => {
      el.addEventListener('click', () => {
        const stepId = parseInt(el.dataset.step);
        if (this.screenshots[stepId]) {
          this.onScreenshotClick?.(this.screenshots[stepId]);
        }
      });
    });
  }

  /**
   * Update a step's state
   */
  updateStep(stepId, state) {
    this.stepStates[stepId] = state;
    const el = document.getElementById(`timeline-step-${stepId}`);
    if (!el) return;

    // Remove all state classes
    el.classList.remove('pending', 'active', 'completed', 'error');
    el.classList.add(state);

    // Auto-scroll to active step
    if (state === 'active') {
      el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }

  /**
   * Set the current active step (marks previous as completed)
   */
  setActiveStep(stepId) {
    STEPS.forEach(step => {
      if (step.id < stepId) {
        this.updateStep(step.id, 'completed');
      } else if (step.id === stepId) {
        this.updateStep(step.id, 'active');
      } else {
        if (this.stepStates[step.id] !== 'completed') {
          this.updateStep(step.id, 'pending');
        }
      }
    });
  }

  /**
   * Store a screenshot for a step
   */
  addScreenshot(stepId, screenshotData) {
    this.screenshots[stepId] = screenshotData;

    const el = document.getElementById(`timeline-step-${stepId}`);
    if (el) {
      el.classList.add('has-screenshot');
      el.style.cursor = 'pointer';
      el.title = 'Click to view high-res screenshot';
    }
  }

  /**
   * Reset timeline for a new cycle
   */
  resetForNewCycle() {
    for (let i = 5; i <= 14; i++) {
      this.updateStep(i, 'pending');
      delete this.screenshots[i];
    }
  }

  /**
   * Reset entire timeline
   */
  reset() {
    this.stepStates = {};
    this.screenshots = {};
    this.render();
  }

  /**
   * Set callback for screenshot click
   */
  setScreenshotClickHandler(handler) {
    this.onScreenshotClick = handler;
  }
}
