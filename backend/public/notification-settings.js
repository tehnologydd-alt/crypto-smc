const key = 'orbit-notification-preferences';
const eventTypes = ['CREATED', 'ENTRY', 'TP1', 'TP2', 'TP3', 'STOP', 'INVALIDATED', 'EXPIRED', 'DATA_GAP'];

export function getPreferences() {
  let input = {};
  try { input = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch { /* reset corrupt local state */ }
  return { selectedOnly: input.selectedOnly === true,
    selectedIds: Array.isArray(input.selectedIds) ? input.selectedIds.filter(id => typeof id === 'string') : [],
    events: Object.fromEntries(eventTypes.map(type => [type, input.events?.[type] !== false])) };
}

export function savePreferences(preferences) { localStorage.setItem(key, JSON.stringify(preferences)); }

export async function syncPreferences(preferences) {
  const endpoint = localStorage.getItem('orbit-push-endpoint');
  if (!endpoint) return false;
  const token = localStorage.getItem('orbit-token') || '';
  const response = await fetch('/api/subscription/preferences', { method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ endpoint, preferences }) });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${response.status}`);
  }
  return true;
}

