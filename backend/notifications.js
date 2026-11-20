export const NOTIFICATION_EVENTS = ['CREATED', 'ENTRY', 'TP1', 'TP2', 'TP3', 'STOP', 'INVALIDATED', 'EXPIRED', 'DATA_GAP'];

export function normalizePreferences(value = {}) {
  const input = value && typeof value === 'object' ? value : {};
  const events = Object.fromEntries(NOTIFICATION_EVENTS.map(type => [type, input.events?.[type] !== false]));
  const selectedIds = Array.isArray(input.selectedIds) ? [...new Set(input.selectedIds.filter(id => typeof id === 'string' && id.length <= 150))].slice(0, 500) : [];
  return { events, selectedOnly: input.selectedOnly === true, selectedIds };
}

export function shouldNotify(subscription, signal, event) {
  const preferences = normalizePreferences(subscription.preferences);
  if (!preferences.events[event.type]) return false;
  if (preferences.selectedOnly && !preferences.selectedIds.includes(signal.id)) return false;
  // Quality filtering applies only to discovery. Once a signal is followed,
  // its entry and exit events must still arrive independently.
  if (event.type === 'CREATED' && signal.quality?.trusted && !signal.quality.recommended && !preferences.selectedOnly) return false;
  return true;
}

