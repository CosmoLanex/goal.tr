/* ============================================================
   nukrax.goal — settings.js
   Settings view module. Exposed as window.SettingsView.
   ============================================================ */

window.SettingsView = (function () {
  'use strict';

  let initialized = false;

  function populate() {
    const state = NKX.getState();
    document.getElementById('goalAmountInput').value = state.goal.amount;
    document.getElementById('targetDateInput').value = state.goal.targetDate;
    document.getElementById('dailyTargetInput').value = state.dailyTarget;
    document.getElementById('animToggle').checked = state.settings.animationsEnabled !== false;
    document.getElementById('startedDateDisplay').textContent =
      new Date(state.goal.startDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function bindDanger(btnId, boxId, yesId, noId, action, successMsg) {
    const box = document.getElementById(boxId);
    document.getElementById(btnId).addEventListener('click', () => box.classList.add('show'));
    document.getElementById(noId).addEventListener('click', () => box.classList.remove('show'));
    document.getElementById(yesId).addEventListener('click', () => {
      action();
      box.classList.remove('show');
      NKXAnim.toast(successMsg);
    });
  }

  function init() {
    if (initialized) return;
    initialized = true;

    document.getElementById('goalForm').addEventListener('submit', e => {
      e.preventDefault();
      try {
        const amount = parseFloat(document.getElementById('goalAmountInput').value);
        const date = document.getElementById('targetDateInput').value;
        const dailyTarget = parseFloat(document.getElementById('dailyTargetInput').value);
        NKX.setGoal(amount, date);
        NKX.setDailyTarget(dailyTarget);
        NKXAnim.toast('Goal settings saved');
      } catch (err) {
        NKXAnim.toast(err.message, { warn: true });
      }
    });

    document.getElementById('animToggle').addEventListener('change', e => {
      NKX.setSetting('animationsEnabled', e.target.checked);
      NKXAnim.toast(e.target.checked ? 'Animations enabled' : 'Animations reduced');
    });

    document.getElementById('btnExport').addEventListener('click', () => {
      const json = NKX.exportJSON();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nukrax-goal-backup-${NKX.todayKey()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      NKXAnim.toast('Backup exported');
    });

    const importInput = document.getElementById('importFileInput');
    document.getElementById('btnImport').addEventListener('click', () => importInput.click());
    importInput.addEventListener('change', () => {
      const file = importInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          NKX.importJSON(reader.result);
          NKXAnim.toast('Backup restored');
        } catch (err) {
          NKXAnim.toast(err.message, { warn: true });
        }
        importInput.value = '';
      };
      reader.onerror = () => NKXAnim.toast('Could not read file', { warn: true });
      reader.readAsText(file);
    });

    bindDanger('btnClearHistory', 'confirmClearHistory', 'confirmClearHistoryYes', 'confirmClearHistoryNo',
      () => NKX.clearHistory(), 'History cleared');
    bindDanger('btnResetDash', 'confirmResetDash', 'confirmResetDashYes', 'confirmResetDashNo',
      () => NKX.resetDashboard(), 'Dashboard reset');
    bindDanger('btnFullReset', 'confirmFullReset', 'confirmFullResetYes', 'confirmFullResetNo',
      () => NKX.fullReset(), 'All data wiped');

    NKX.on('change', populate);
    NKXAnim.bindPressFeedback('#view-settings .btn');
  }

  return { init, render: populate };
})();
