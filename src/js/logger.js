/**
 * aven.bot — Log Viewer Component
 * High-tech terminal console stream with search, filtering, and copy
 */

export class LogViewer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.entries = [];
    this.maxEntries = 500;
    this.filter = 'all';
    this.searchTerm = '';
    this.autoScroll = true;
    this.isHovered = false;

    // Pause auto-scroll on hover
    const viewer = this.container?.closest('.log-viewer');
    if (viewer) {
      viewer.addEventListener('mouseenter', () => {
        this.isHovered = true;
      });
      viewer.addEventListener('mouseleave', () => {
        this.isHovered = false;
        this.scrollToBottom();
      });
    }

    this.renderEmpty();
  }

  /**
   * Render empty state
   */
  renderEmpty() {
    if (!this.container) return;
    this.container.innerHTML = '<div style="color: var(--text-dim); padding: 12px; font-family: var(--font-mono);">Waiting for engine telemetry...</div>';
  }

  /**
   * Add a log entry
   */
  addEntry(entry) {
    if (!this.container) return;

    // Remove empty state
    const emptyEl = this.container.querySelector('div:only-child');
    if (emptyEl && emptyEl.textContent.includes('Waiting for engine')) {
      emptyEl.remove();
    }

    // Store entry
    if (this.entries.length >= this.maxEntries) {
      this.entries.shift();
      const firstChild = this.container.firstChild;
      if (firstChild) this.container.removeChild(firstChild);
    }
    this.entries.push(entry);

    // Create DOM element
    const el = this.createEntryElement(entry);

    // Apply filter & search
    if (!this.matchesCurrentFilters(entry)) {
      el.style.display = 'none';
    }

    this.container.appendChild(el);

    // Auto-scroll
    if (!this.isHovered) {
      this.scrollToBottom();
    }
  }

  /**
   * Create a log entry DOM element
   */
  createEntryElement(entry) {
    const el = document.createElement('div');
    el.className = `log-entry ${entry.level}`;

    const time = new Date(entry.timestamp).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const levelBadges = {
      info: `<span style="color:#06b6d4;font-weight:700;">[INFO]</span>`,
      success: `<span style="color:#10b981;font-weight:700;">[OK]</span>`,
      warning: `<span style="color:#f59e0b;font-weight:700;">[WARN]</span>`,
      error: `<span style="color:#ef4444;font-weight:700;">[ERR]</span>`,
    };

    el.innerHTML = `
      <span class="log-time">${time}</span>
      <span class="log-badge">${levelBadges[entry.level] || levelBadges.info}</span>
      <span class="log-msg">${this.escapeHtml(entry.message)}</span>
    `;

    return el;
  }

  matchesCurrentFilters(entry) {
    if (this.filter !== 'all' && entry.level !== this.filter) {
      return false;
    }
    if (this.searchTerm && !entry.message.toLowerCase().includes(this.searchTerm.toLowerCase())) {
      return false;
    }
    return true;
  }

  /**
   * Set the log level filter
   */
  setFilter(level) {
    this.filter = level;
    this.applyAllFilters();
  }

  /**
   * Set text search filter
   */
  setSearch(term) {
    this.searchTerm = term;
    this.applyAllFilters();
  }

  applyAllFilters() {
    if (!this.container) return;
    const entries = this.container.querySelectorAll('.log-entry');
    entries.forEach((el, index) => {
      const entry = this.entries[index];
      if (entry && this.matchesCurrentFilters(entry)) {
        el.style.display = '';
      } else {
        el.style.display = 'none';
      }
    });
  }

  /**
   * Scroll to the bottom of the log viewer
   */
  scrollToBottom() {
    const viewer = this.container?.closest('.log-viewer');
    if (viewer) {
      viewer.scrollTop = viewer.scrollHeight;
    }
  }

  /**
   * Clear all log entries
   */
  clear() {
    this.entries = [];
    this.renderEmpty();
  }

  /**
   * Export plain text representation of logs for copying
   */
  getPlainText() {
    return this.entries.map(e => {
      const time = new Date(e.timestamp).toISOString();
      return `[${time}] [${e.level.toUpperCase()}] ${e.message}`;
    }).join('\n');
  }

  /**
   * Escape HTML for safe rendering
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
