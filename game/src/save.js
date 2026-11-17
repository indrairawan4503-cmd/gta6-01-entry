// save.js — localStorage save for Solmar Bay: cash, story progress,
// collectibles, taxi fares done and best chase stats. Versioned key so
// future builds never read a stale shape.

const SAVE_KEY = 'solmar-bay-save-v1';

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    return data;
  } catch (e) {
    return null;
  }
}

export function writeSave(state) {
  try {
    const data = {
      version: 1,
      cash: Math.floor(state.cash),
      missionsDone: state.missionsDone.slice(),
      coinsCollected: state.coinsCollected.slice(),
      faresDone: state.faresDone,
      bestChaseSeconds: state.bestChaseSeconds,
      totalEarned: Math.floor(state.totalEarned),
      savedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (e) {
    // storage full or blocked (private mode): the game still plays
  }
}

export function clearSave() {
  try { window.localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
}
