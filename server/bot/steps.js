/**
 * aven.bot — Step Definitions
 * Metadata for all 14 automation steps
 */

export const STEPS = [
  { id: 1,  name: 'Open Website',       icon: '🌐', phase: 'setup',  description: 'Navigate to avanture.net' },
  { id: 2,  name: 'Login Page',         icon: '📄', phase: 'setup',  description: 'Verify login form is visible' },
  { id: 3,  name: 'Login',              icon: '🔐', phase: 'auth',   description: 'Fill credentials & authenticate' },
  { id: 4,  name: 'Navigate Profile',   icon: '👤', phase: 'nav',    description: 'Open profile menu → Moji oglasi' },
  { id: 5,  name: 'My Classifieds',     icon: '📋', phase: 'nav',    description: 'Click New Listing' },
  { id: 6,  name: 'New Listing Form',   icon: '📝', phase: 'create', description: 'Verify form page loaded' },
  { id: 7,  name: 'Fill Form',          icon: '✍️',  phase: 'create', description: 'Fill title, category, description, location' },
  { id: 8,  name: 'Upload Photo',       icon: '📸', phase: 'create', description: 'Upload listing image' },
  { id: 9,  name: 'Publish Listing',    icon: '✅', phase: 'create', description: 'Confirm & publish listing' },
  { id: 10, name: 'Wait Timer',         icon: '⏱️',  phase: 'wait',   description: 'Countdown before deletion' },
  { id: 11, name: 'Back to Profile',    icon: '👤', phase: 'delete', description: 'Navigate to Moji oglasi' },
  { id: 12, name: 'Find Listing',       icon: '🔍', phase: 'delete', description: 'Locate listing to delete' },
  { id: 13, name: 'Delete Listing',     icon: '🗑️',  phase: 'delete', description: 'Delete & confirm removal' },
  { id: 14, name: 'Loop Restart',       icon: '🔄', phase: 'loop',   description: 'Restart cycle' },
];

export const BOT_STATES = {
  IDLE: 'idle',
  STARTING: 'starting',
  RUNNING: 'running',
  WAITING: 'waiting',
  WAITING_STEP: 'waiting_step',
  STOPPING: 'stopping',
  ERROR: 'error',
};

export function getStepById(id) {
  return STEPS.find(s => s.id === id);
}

export function getTotalSteps() {
  return STEPS.length;
}
