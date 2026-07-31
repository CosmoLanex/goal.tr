/* ============================================================
   nukrax.goal — dashboard.js
   Dashboard view module. Exposed as window.DashboardView.
   Preloader, nav burger, and view-switching live in app.js.
   ============================================================ */

window.DashboardView = (function () {
  'use strict';

  const fmt = NKX.fmtINR;
  let firstRender = true;
  let prevStats = null;
  let initialized = false;

  function fmtDate(d) {
    if (!d) return '—';
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function fmtDateShort(d) {
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }
  function fmtTime(d) {
    return new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function render() {
    const s = NKX.getStats();
    const state = NKX.getState();

    document.getElementById('heroGoalAmt').textContent = fmt(s.goalAmount);
    document.getElementById('heroTargetDate').textContent = fmtDate(new Date(state.goal.targetDate + 'T00:00:00'));

    const ring = document.getElementById('ringFill');
    NKXAnim.animateRing(ring, s.progressPct);
    animateNumberEl(document.getElementById('ringPct'), prevStats ? prevStats.progressPct : 0, s.progressPct, v => Math.round(v) + '%');

    animateNumberEl(document.getElementById('figCapital'), prevStats ? prevStats.capital : 0, s.capital, fmt);
    document.getElementById('figGoal').textContent = fmt(s.goalAmount);
    animateNumberEl(document.getElementById('figRemaining'), prevStats ? prevStats.remaining : s.remaining, s.remaining, fmt);
    NKXAnim.animateBar(document.getElementById('barFill'), s.progressPct);

    document.getElementById('statDaysRemaining').textContent = s.daysRemaining;
    document.getElementById('statDaysPassed').textContent = `${s.daysPassed} of ${s.totalDays} days passed`;

    animateNumberEl(document.getElementById('statPaceNeeded'), prevStats ? prevStats.dailyPaceNeeded : s.dailyPaceNeeded, s.dailyPaceNeeded, fmt);
    const paceEl = document.getElementById('statPaceStatus');
    if (s.isComplete) {
      paceEl.textContent = 'goal reached 🎉';
      paceEl.style.color = 'var(--good)';
    } else if (s.paceStatus === 'ahead') {
      paceEl.textContent = `ahead by ${fmt(s.paceDelta)}`;
      paceEl.style.color = 'var(--good)';
    } else {
      paceEl.textContent = `behind by ${fmt(s.paceDelta)}`;
      paceEl.style.color = 'var(--warn)';
    }

    animateNumberEl(document.getElementById('miniToday'), prevStats ? prevStats.todaysEarnings : s.todaysEarnings, s.todaysEarnings, fmt);
    document.getElementById('miniTodayFoot').textContent = s.todaysEarnings !== 0 ? 'logged today' : 'nothing logged yet today';

    animateNumberEl(document.getElementById('miniTotal'), prevStats ? prevStats.totalEarnings : s.totalEarnings, s.totalEarnings, fmt);
    document.getElementById('miniStreak').textContent = `${s.streak} day${s.streak === 1 ? '' : 's'}`;

    document.getElementById('estCompletion').textContent = s.estimatedCompletion ? fmtDateShort(s.estimatedCompletion) : '—';

    const week = NKX.getWeeklySummary();
    const month = NKX.getMonthlySummary();
    document.getElementById('weekTotal').textContent = fmt(week.total);
    document.getElementById('weekCount').textContent = `${week.count} entr${week.count === 1 ? 'y' : 'ies'}`;
    document.getElementById('monthTotal').textContent = fmt(month.total);
    document.getElementById('monthCount').textContent = `${month.count} entr${month.count === 1 ? 'y' : 'ies'}`;

    renderActivity();
    renderConfirmButton();
    renderTakeOutHint();

    prevStats = s;
    firstRender = false;
  }

  function animateNumberEl(el, from, to, format) {
    if (firstRender) { el.textContent = format(to); return; }
    NKXAnim.animateCounter(el, from, to, { format, duration: NKXAnim.DURATION.counter });
  }

  function renderActivity() {
    const list = document.getElementById('activityList');
    const recent = NKX.getRecentActivity(6);
    if (!recent.length) {
      list.innerHTML = `<div class="empty-state"><p>No activity yet. Add your first earning to get started.</p></div>`;
      return;
    }
    list.innerHTML = recent.map(e => {
      const iconClass = e.type === 'auto200' ? 'auto' : (e.type === 'capital_adjust' ? 'adjust' : (e.type === 'withdrawal' ? 'withdraw' : ''));
      const icon = e.type === 'auto200' ? '✓' : (e.type === 'capital_adjust' ? '⟳' : (e.type === 'withdrawal' ? '−' : '+'));
      const title = e.type === 'auto200' ? 'Daily ₹200 confirmed'
        : e.type === 'capital_adjust' ? `Capital adjusted to ${fmt(e.amount)}`
        : e.type === 'withdrawal' ? (e.note ? `Took out — ${escapeHtml(e.note)}` : 'Took out money')
        : (e.note ? escapeHtml(e.note) : 'Manual earning');
      const amountClass = e.type === 'capital_adjust' ? 'neutral' : (e.delta < 0 ? 'negative' : '');
      const amountText = e.type === 'capital_adjust'
        ? (e.delta >= 0 ? '+' : '') + fmt(e.delta)
        : (e.delta < 0 ? '−' + fmt(Math.abs(e.delta)) : '+' + fmt(e.delta));
      return `
        <div class="act-row">
          <div class="act-icon ${iconClass}">${icon}</div>
          <div class="act-body">
            <div class="act-title">${title}</div>
            <div class="act-time">${fmtDateShort(e.timestamp)} · ${fmtTime(e.timestamp)}</div>
          </div>
          <div class="act-amount ${amountClass}">${amountText}</div>
        </div>`;
    }).join('');
  }

  function renderConfirmButton() {
    const btn = document.getElementById('btnConfirm200');
    if (NKX.isDailyConfirmedToday()) {
      btn.textContent = "Today's ₹200 Confirmed ✓";
      btn.disabled = true;
    } else {
      btn.textContent = "Confirm Today's ₹200";
      btn.disabled = false;
    }
  }

  function renderTakeOutHint() {
    const hint = document.getElementById('withdrawAvailableHint');
    if (hint) hint.textContent = `Available: ${fmt(NKX.getState().capital)}`;
  }

  function openModal(el) { el.classList.add('show'); }
  function closeModal(el) { el.classList.remove('show'); }

  function init() {
    if (initialized) return;
    initialized = true;

    // ---------- modal: add earning ----------
    const modalEarning = document.getElementById('modalEarning');
    const earningAmount = document.getElementById('earningAmount');
    const earningNote = document.getElementById('earningNote');

    document.getElementById('btnAddEarning').addEventListener('click', () => {
      earningAmount.value = '';
      earningNote.value = '';
      openModal(modalEarning);
      setTimeout(() => earningAmount.focus(), 200);
    });
    document.getElementById('earningCancel').addEventListener('click', () => closeModal(modalEarning));
    modalEarning.addEventListener('click', e => { if (e.target === modalEarning) closeModal(modalEarning); });
    document.getElementById('earningSubmit').addEventListener('click', () => {
      try {
        const amt = parseFloat(earningAmount.value);
        NKX.addManualEarning(amt, earningNote.value.trim());
        closeModal(modalEarning);
        NKXAnim.toast(`Added ${fmt(amt)} to your capital`);
      } catch (e) {
        NKXAnim.toast(e.message, { warn: true });
      }
    });
    earningAmount.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('earningSubmit').click(); });

    // ---------- modal: take out money ----------
    const modalWithdraw = document.getElementById('modalWithdraw');
    const withdrawAmount = document.getElementById('withdrawAmount');
    const withdrawNote = document.getElementById('withdrawNote');

    document.getElementById('btnTakeOut').addEventListener('click', () => {
      withdrawAmount.value = '';
      withdrawNote.value = '';
      renderTakeOutHint();
      openModal(modalWithdraw);
      setTimeout(() => withdrawAmount.focus(), 200);
    });
    document.getElementById('withdrawCancel').addEventListener('click', () => closeModal(modalWithdraw));
    modalWithdraw.addEventListener('click', e => { if (e.target === modalWithdraw) closeModal(modalWithdraw); });
    document.getElementById('withdrawSubmit').addEventListener('click', () => {
      try {
        const amt = parseFloat(withdrawAmount.value);
        NKX.withdrawMoney(amt, withdrawNote.value.trim());
        closeModal(modalWithdraw);
        NKXAnim.toast(`Took out ${fmt(amt)}`);
      } catch (e) {
        NKXAnim.toast(e.message, { warn: true });
      }
    });
    withdrawAmount.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('withdrawSubmit').click(); });

    // ---------- modal: edit capital ----------
    const modalCapital = document.getElementById('modalCapital');
    const capitalAmount = document.getElementById('capitalAmount');

    document.getElementById('btnEditCapital').addEventListener('click', () => {
      capitalAmount.value = NKX.getState().capital;
      openModal(modalCapital);
      setTimeout(() => { capitalAmount.focus(); capitalAmount.select(); }, 200);
    });
    document.getElementById('capitalCancel').addEventListener('click', () => closeModal(modalCapital));
    modalCapital.addEventListener('click', e => { if (e.target === modalCapital) closeModal(modalCapital); });
    document.getElementById('capitalSubmit').addEventListener('click', () => {
      try {
        const amt = parseFloat(capitalAmount.value);
        NKX.setCapital(amt);
        closeModal(modalCapital);
        NKXAnim.toast(`Capital updated to ${fmt(amt)}`);
      } catch (e) {
        NKXAnim.toast(e.message, { warn: true });
      }
    });
    capitalAmount.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('capitalSubmit').click(); });

    // ---------- confirm 200 ----------
    document.getElementById('btnConfirm200').addEventListener('click', () => {
      try {
        NKX.confirmDailyTwoHundred();
        NKXAnim.toast("₹200 confirmed for today");
      } catch (e) {
        NKXAnim.toast(e.message, { warn: true });
      }
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { closeModal(modalEarning); closeModal(modalWithdraw); closeModal(modalCapital); }
    });

    // ---------- "view full history" jumps to the history view ----------
    document.getElementById('btnViewAllHistory').addEventListener('click', () => {
      if (window.NKXApp) window.NKXApp.switchView('history');
    });

    NKX.on('change', render);
    NKXAnim.bindPressFeedback('#view-dashboard .btn');
  }

  return { init, render };
})();
