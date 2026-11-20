const key = 'orbit-keep-screen-on';
let desired = localStorage.getItem(key) === '1';
let lock = null;
let requesting = false;
let onStatus = () => {};

export const keepScreenOn = () => desired;

function status(message) { onStatus(message); }

async function acquire() {
  if (!desired) return status('Экран будет гаснуть по настройкам телефона.');
  if (document.visibilityState !== 'visible') return status('Ожидание возвращения в приложение.');
  if (!('wakeLock' in navigator)) return status('Браузер не поддерживает удержание экрана.');
  if ((lock && !lock.released) || requesting) return;
  requesting = true;
  try {
    const next = await navigator.wakeLock.request('screen');
    if (!desired || document.visibilityState !== 'visible') { await next.release(); return; }
    lock = next;
    next.addEventListener('release', () => {
      if (lock === next) lock = null;
      status(desired ? 'Экран снова может погаснуть. Вернитесь в приложение, чтобы возобновить.' : 'Экран будет гаснуть по настройкам телефона.');
    });
    status('Экран останется включённым, пока приложение открыто и видно.');
  } catch (error) { status(`Не удалось удержать экран: ${error.message}`); }
  finally { requesting = false; }
}

export function initWakeLock(listener = () => {}) {
  onStatus = listener;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void acquire();
    else status(desired ? 'Ожидание возвращения в приложение.' : 'Экран будет гаснуть по настройкам телефона.');
  });
  void acquire();
}

export async function setKeepScreenOn(enabled) {
  desired = Boolean(enabled);
  localStorage.setItem(key, desired ? '1' : '0');
  if (!desired) {
    const old = lock; lock = null;
    if (old && !old.released) await old.release();
    status('Экран будет гаснуть по настройкам телефона.');
  } else await acquire();
}

