/* ============================================================
   nukrax.goal — data.js
   Central data manager. Single source of truth.
   All pages read/write through the NKX object exposed here.
   ============================================================ */

(function (global) {
  'use strict';

  const STORAGE_KEY = 'nkx_goal_state_v1';
  const SCHEMA_VERSION = 1;

  const DAY_MS = 86400000;

  // ---------- defaults ----------
  function defaultState() {
    const today = new Date();
    return {
      meta: {
        username: '@CosmoLanex',
        createdAt: today.toISOString(),
        version: SCHEMA_VERSION
      },
      goal: {
        amount: 200000,
        targetDate: '2026-12-25',
        startDate: dateKey(today)
      },
      capital: 0,
      dailyTarget: 200,
      history: [],              // { id, type, amount, delta, balanceAfter, timestamp, note }
      dailyConfirmations: {},   // 'YYYY-MM-DD' -> true
      settings: {
        animationsEnabled: true,
        theme: 'dark'
      }
    };
  }

  // ---------- helpers ----------
  function dateKey(d) {
    // Local-time YYYY-MM-DD, not UTC — matters for "today" boundaries
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function todayKey() {
    return dateKey(new Date());
  }

  function uid() {
    return 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function fmtINR(n, opts) {
    opts = opts || {};
    const neg = n < 0;
    n = Math.abs(Math.round(n));
    let s = n.toString();
    let lastThree = s.substring(s.length - 3);
    let other = s.substring(0, s.length - 3);
    if (other !== '') lastThree = ',' + lastThree;
    const formatted = other.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + lastThree;
    return (neg ? '-' : '') + (opts.symbol === false ? '' : '\u20B9') + formatted;
  }

  // ---------- store ----------
  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return defaultState();
      // shallow-merge to survive schema additions in future versions
      const def = defaultState();
      return {
        meta: Object.assign({}, def.meta, parsed.meta),
        goal: Object.assign({}, def.goal, parsed.goal),
        capital: typeof parsed.capital === 'number' ? parsed.capital : 0,
        dailyTarget: typeof parsed.dailyTarget === 'number' ? parsed.dailyTarget : 200,
        history: Array.isArray(parsed.history) ? parsed.history : [],
        dailyConfirmations: parsed.dailyConfirmations && typeof parsed.dailyConfirmations === 'object' ? parsed.dailyConfirmations : {},
        settings: Object.assign({}, def.settings, parsed.settings)
      };
    } catch (e) {
      console.warn('nkx: failed to load state, using defaults', e);
      return defaultState();
    }
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error('nkx: failed to persist state', e);
    }
    emit('change');
  }

  // ---------- event bus ----------
  const listeners = {};
  function on(evt, fn) {
    (listeners[evt] = listeners[evt] || []).push(fn);
    return () => off(evt, fn);
  }
  function off(evt, fn) {
    if (!listeners[evt]) return;
    listeners[evt] = listeners[evt].filter(f => f !== fn);
  }
  function emit(evt, payload) {
    (listeners[evt] || []).forEach(fn => {
      try { fn(payload); } catch (e) { console.error(e); }
    });
  }

  // ---------- mutations ----------
  function addManualEarning(amount, note) {
    amount = Number(amount);
    if (!amount || amount <= 0) throw new Error('Amount must be a positive number');
    state.capital += amount;
    const entry = {
      id: uid(),
      type: 'manual',
      amount: amount,
      delta: amount,
      balanceAfter: state.capital,
      timestamp: new Date().toISOString(),
      note: note || ''
    };
    state.history.push(entry);
    persist();
    return entry;
  }

  function editManualEarning(id, newAmount, newNote) {
    const idx = state.history.findIndex(e => e.id === id);
    if (idx === -1) throw new Error('Entry not found');
    const entry = state.history[idx];
    if (entry.type !== 'manual') throw new Error('Only manual earnings can be edited');
    newAmount = Number(newAmount);
    if (!newAmount || newAmount <= 0) throw new Error('Amount must be a positive number');
    const diff = newAmount - entry.amount;
    entry.amount = newAmount;
    entry.delta = entry.type === 'auto200' ? entry.delta : newAmount;
    if (typeof newNote === 'string') entry.note = newNote;
    // shift capital + recompute all running balances from this point forward
    state.capital += diff;
    recomputeRunningBalances();
    persist();
    return entry;
  }

  function deleteEntry(id) {
    const idx = state.history.findIndex(e => e.id === id);
    if (idx === -1) throw new Error('Entry not found');
    const entry = state.history[idx];
    if (entry.type === 'auto200') {
      const key = dateKey(new Date(entry.timestamp));
      delete state.dailyConfirmations[key];
    }
    state.capital -= entry.delta;
    state.history.splice(idx, 1);
    recomputeRunningBalances();
    persist();
  }

  function recomputeRunningBalances() {
    // Recompute balanceAfter for every entry in chronological order from a base of 0
    // (capital_adjust entries store absolute target values via `amount`, others store deltas)
    const sorted = clone(state.history).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    let running = 0;
    sorted.forEach(e => {
      if (e.type === 'capital_adjust') {
        running = e.amount; // absolute value set by the adjustment
      } else {
        running += e.delta;
      }
      e.balanceAfter = running;
    });
    // write back in original (insertion) order but with corrected balanceAfter
    const byId = {};
    sorted.forEach(e => { byId[e.id] = e.balanceAfter; });
    state.history.forEach(e => { e.balanceAfter = byId[e.id]; });
    state.capital = running;
  }

  function withdrawMoney(amount, note) {
    amount = Number(amount);
    if (!amount || amount <= 0) throw new Error('Amount must be a positive number');
    if (amount > state.capital) throw new Error('You can\'t take out more than your current capital');
    state.capital -= amount;
    const entry = {
      id: uid(),
      type: 'withdrawal',
      amount: amount,
      delta: -amount,
      balanceAfter: state.capital,
      timestamp: new Date().toISOString(),
      note: note || ''
    };
    state.history.push(entry);
    persist();
    return entry;
  }

  function confirmDailyTwoHundred() {
    const key = todayKey();
    if (state.dailyConfirmations[key]) {
      throw new Error('Already confirmed today');
    }
    const amount = state.dailyTarget;
    state.capital += amount;
    state.dailyConfirmations[key] = true;
    const entry = {
      id: uid(),
      type: 'auto200',
      amount: amount,
      delta: amount,
      balanceAfter: state.capital,
      timestamp: new Date().toISOString(),
      note: 'Daily confirmation'
    };
    state.history.push(entry);
    persist();
    return entry;
  }

  function isDailyConfirmedToday() {
    return !!state.dailyConfirmations[todayKey()];
  }

  function setCapital(newAmount, note) {
    newAmount = Number(newAmount);
    if (isNaN(newAmount) || newAmount < 0) throw new Error('Capital must be a non-negative number');
    const oldAmount = state.capital;
    const delta = newAmount - oldAmount;
    state.capital = newAmount;
    const entry = {
      id: uid(),
      type: 'capital_adjust',
      amount: newAmount,       // absolute value after adjustment
      delta: delta,
      balanceAfter: newAmount,
      timestamp: new Date().toISOString(),
      note: note || `Capital set to ${fmtINR(newAmount)}`
    };
    state.history.push(entry);
    persist();
    return entry;
  }

  function setGoal(amount, targetDate) {
    if (amount != null) {
      amount = Number(amount);
      if (!amount || amount <= 0) throw new Error('Goal amount must be positive');
      state.goal.amount = amount;
    }
    if (targetDate) {
      state.goal.targetDate = targetDate;
    }
    persist();
  }

  function setDailyTarget(amount) {
    amount = Number(amount);
    if (!amount || amount <= 0) throw new Error('Daily target must be positive');
    state.dailyTarget = amount;
    persist();
  }

  function setSetting(key, value) {
    state.settings[key] = value;
    persist();
  }

  function resetDashboard() {
    const def = defaultState();
    state.capital = 0;
    state.goal = def.goal;
    state.dailyTarget = 200;
    persist();
  }

  function clearHistory() {
    state.history = [];
    state.dailyConfirmations = {};
    persist();
  }

  function fullReset() {
    state = defaultState();
    persist();
  }

  // ---------- import / export ----------
  function exportJSON() {
    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      schemaVersion: SCHEMA_VERSION,
      state: state
    }, null, 2);
  }

  function importJSON(json) {
    let parsed;
    try {
      parsed = JSON.parse(json);
    } catch (e) {
      throw new Error('Invalid JSON file');
    }
    const incoming = parsed.state || parsed; // tolerate raw-state files too
    if (!incoming || typeof incoming !== 'object') throw new Error('Malformed backup file');
    const def = defaultState();
    state = {
      meta: Object.assign({}, def.meta, incoming.meta),
      goal: Object.assign({}, def.goal, incoming.goal),
      capital: typeof incoming.capital === 'number' ? incoming.capital : 0,
      dailyTarget: typeof incoming.dailyTarget === 'number' ? incoming.dailyTarget : 200,
      history: Array.isArray(incoming.history) ? incoming.history : [],
      dailyConfirmations: incoming.dailyConfirmations && typeof incoming.dailyConfirmations === 'object' ? incoming.dailyConfirmations : {},
      settings: Object.assign({}, def.settings, incoming.settings)
    };
    persist();
  }

  // ---------- derived / computed ----------
  function getStats() {
    const goalAmount = state.goal.amount;
    const capital = state.capital;
    const remaining = Math.max(0, goalAmount - capital);
    const progressPct = goalAmount > 0 ? Math.min(100, (capital / goalAmount) * 100) : 0;

    const start = parseLocalDate(state.goal.startDate);
    const target = parseLocalDate(state.goal.targetDate);
    const now = new Date();
    const nowKey = dateKey(now);

    const totalDays = Math.max(1, Math.round((target - start) / DAY_MS));
    const daysPassed = Math.max(0, Math.round((parseLocalDate(nowKey) - start) / DAY_MS));
    const daysRemaining = Math.max(0, Math.round((target - parseLocalDate(nowKey)) / DAY_MS));

    const dailyPaceNeeded = daysRemaining > 0 ? remaining / daysRemaining : remaining;

    const expectedByToday = totalDays > 0 ? Math.min(goalAmount, (goalAmount / totalDays) * daysPassed) : 0;
    const paceDelta = capital - expectedByToday;
    const paceStatus = paceDelta >= 0 ? 'ahead' : 'behind';

    // today's earnings
    const todaysEntries = state.history.filter(e => dateKey(new Date(e.timestamp)) === nowKey && e.type !== 'capital_adjust');
    const todaysEarnings = todaysEntries.reduce((sum, e) => sum + e.delta, 0);

    const totalEarnings = state.history
      .filter(e => e.type !== 'capital_adjust')
      .reduce((sum, e) => sum + e.delta, 0);

    // estimated completion date at current average daily pace
    const activeDays = getActiveDayKeys();
    const avgPerActiveDay = activeDays.length > 0 ? totalEarnings / activeDays.length : 0;
    let estimatedCompletion = null;
    if (avgPerActiveDay > 0 && remaining > 0) {
      const daysNeeded = Math.ceil(remaining / avgPerActiveDay);
      estimatedCompletion = new Date(now.getTime() + daysNeeded * DAY_MS);
    }

    return {
      capital,
      goalAmount,
      remaining,
      progressPct,
      totalDays,
      daysPassed: Math.min(daysPassed, totalDays),
      daysRemaining,
      dailyPaceNeeded,
      todaysEarnings,
      totalEarnings,
      paceStatus,
      paceDelta: Math.abs(paceDelta),
      streak: getStreak(),
      estimatedCompletion,
      isComplete: capital >= goalAmount
    };
  }

  function parseLocalDate(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function getActiveDayKeys() {
    const set = new Set();
    state.history.forEach(e => {
      if (e.type === 'manual' || e.type === 'auto200') set.add(dateKey(new Date(e.timestamp)));
    });
    return Array.from(set);
  }

  function getStreak() {
    const activeDays = new Set(getActiveDayKeys());
    if (activeDays.size === 0) return 0;
    let streak = 0;
    let cursor = new Date();
    // if today has no activity yet, start counting from yesterday
    if (!activeDays.has(dateKey(cursor))) {
      cursor = new Date(cursor.getTime() - DAY_MS);
    }
    while (activeDays.has(dateKey(cursor))) {
      streak++;
      cursor = new Date(cursor.getTime() - DAY_MS);
    }
    return streak;
  }

  function getWeeklySummary() {
    return summarizeByRange(7);
  }
  function getMonthlySummary() {
    return summarizeByRange(30);
  }
  function summarizeByRange(days) {
    const cutoff = Date.now() - days * DAY_MS;
    const entries = state.history.filter(e => e.type !== 'capital_adjust' && new Date(e.timestamp).getTime() >= cutoff);
    const total = entries.reduce((sum, e) => sum + e.delta, 0);
    return { total, count: entries.length, entries };
  }

  function getRecentActivity(limit) {
    limit = limit || 8;
    return clone(state.history)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
  }

  function getHistory() {
    return clone(state.history).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  function getState() {
    return clone(state);
  }

  // ---------- public API ----------
  global.NKX = {
    // reads
    getState,
    getStats,
    getHistory,
    getRecentActivity,
    getWeeklySummary,
    getMonthlySummary,
    isDailyConfirmedToday,
    // writes
    addManualEarning,
    editManualEarning,
    deleteEntry,
    withdrawMoney,
    confirmDailyTwoHundred,
    setCapital,
    setGoal,
    setDailyTarget,
    setSetting,
    resetDashboard,
    clearHistory,
    fullReset,
    // backup
    exportJSON,
    importJSON,
    // utils
    fmtINR,
    dateKey,
    todayKey,
    // events
    on,
    off
  };

})(window);
