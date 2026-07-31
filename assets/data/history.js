/* ============================================================
   nukrax.goal — history.js
   History view module. Exposed as window.HistoryView.
   ============================================================ */

window.HistoryView = (function () {
  'use strict';

  const fmt = NKX.fmtINR;
  const DAY_MS = 86400000;

  let activeType = 'all';
  let activeRange = 'all';
  let searchTerm = '';
  let initialized = false;
  let editingId = null;

  function fmtDateShort(d) { return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); }
  function fmtTime(d) { return new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }); }
  function dayGroupLabel(key) {
    const today = NKX.todayKey();
    const yesterday = NKX.dateKey(new Date(Date.now() - DAY_MS));
    if (key === today) return 'Today';
    if (key === yesterday) return 'Yesterday';
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function withinRange(entry) {
    if (activeRange === 'all') return true;
    const t = new Date(entry.timestamp).getTime();
    const now = Date.now();
    if (activeRange === 'today') return NKX.dateKey(new Date(entry.timestamp)) === NKX.todayKey();
    if (activeRange === 'week') return t >= now - 7 * DAY_MS;
    if (activeRange === 'month') return t >= now - 30 * DAY_MS;
    return true;
  }
  function matchesSearch(entry) {
    if (!searchTerm) return true;
    const hay = `${entry.note || ''} ${entry.type} ${entry.amount}`.toLowerCase();
    return hay.includes(searchTerm.toLowerCase());
  }
  function getFiltered() {
    return NKX.getHistory().filter(e => {
      if (activeType !== 'all' && e.type !== activeType) return false;
      if (!withinRange(e)) return false;
      if (!matchesSearch(e)) return false;
      return true;
    });
  }

  function render() {
    const state = NKX.getState();
    const all = NKX.getHistory();
    const totalEarned = all.filter(e => e.type !== 'capital_adjust').reduce((s, e) => s + e.delta, 0);
    document.getElementById('stripCount').textContent = all.length;
    document.getElementById('stripTotal').textContent = fmt(totalEarned);
    document.getElementById('stripBalance').textContent = fmt(state.capital);

    const filtered = getFiltered();
    const container = document.getElementById('timelineContainer');

    if (!filtered.length) {
      container.innerHTML = `<div class="empty-state"><p>No entries match your filters.</p></div>`;
      return;
    }

    const groups = {};
    const order = [];
    filtered.forEach(e => {
      const key = NKX.dateKey(new Date(e.timestamp));
      if (!groups[key]) { groups[key] = []; order.push(key); }
      groups[key].push(e);
    });

    container.innerHTML = order.map(key => {
      const entries = groups[key];
      const dayTotal = entries.filter(e => e.type !== 'capital_adjust').reduce((s, e) => s + e.delta, 0);
      const rows = entries.map(e => renderRow(e)).join('');
      const totalClass = dayTotal < 0 ? 'd-total negative' : 'd-total';
      const totalText = dayTotal === 0 ? '' : (dayTotal > 0 ? `<span class="${totalClass}">+${fmt(dayTotal)}</span>` : `<span class="${totalClass}">−${fmt(Math.abs(dayTotal))}</span>`);
      return `
        <div class="day-group">
          <div class="day-heading">
            <span class="d-date">${dayGroupLabel(key)}</span>
            <span class="d-line"></span>
            ${totalText}
          </div>
          <div class="timeline">${rows}</div>
        </div>`;
    }).join('');

    bindRowActions();
  }

  function renderRow(e) {
    const iconClass = e.type === 'auto200' ? 'auto' : (e.type === 'capital_adjust' ? 'adjust' : (e.type === 'withdrawal' ? 'withdraw' : ''));
    const icon = e.type === 'auto200' ? '✓' : (e.type === 'capital_adjust' ? '⟳' : (e.type === 'withdrawal' ? '−' : '+'));
    const title = e.type === 'auto200' ? 'Daily ₹200 confirmed'
      : e.type === 'capital_adjust' ? `Capital adjusted to ${fmt(e.amount)}`
      : e.type === 'withdrawal' ? (e.note ? escapeHtml(e.note) : 'Took out money')
      : (e.note ? escapeHtml(e.note) : 'Manual earning');
    const amountClass = e.type === 'capital_adjust' ? 'neutral' : (e.delta < 0 ? 'negative' : '');
    const amountText = e.type === 'capital_adjust'
      ? (e.delta >= 0 ? '+' : '') + fmt(e.delta)
      : (e.delta < 0 ? '−' + fmt(Math.abs(e.delta)) : '+' + fmt(e.delta));
    const canEdit = e.type === 'manual';
    return `
      <div class="t-row" data-id="${e.id}">
        <div class="t-icon ${iconClass}">${icon}</div>
        <div class="t-body">
          <div class="t-title">${title}</div>
          <div class="t-meta">${fmtDateShort(e.timestamp)} · ${fmtTime(e.timestamp)}</div>
          <div class="confirm-inline" id="confirm-${e.id}">
            <span>Delete this entry permanently?</span>
            <button class="btn btn-sm btn-danger confirm-yes" data-id="${e.id}">Delete</button>
            <button class="btn btn-sm btn-ghost confirm-no" data-id="${e.id}">Cancel</button>
          </div>
        </div>
        <div class="t-right">
          <div class="t-amount ${amountClass}">${amountText}</div>
          <div class="t-balance">bal: ${fmt(e.balanceAfter)}</div>
        </div>
        <div class="t-actions">
          ${canEdit ? `<button class="t-action-btn edit-btn" data-id="${e.id}" title="Edit">✎</button>` : ''}
          <button class="t-action-btn danger delete-btn" data-id="${e.id}" title="Delete">✕</button>
        </div>
      </div>`;
  }

  function bindRowActions() {
    document.querySelectorAll('#view-history .edit-btn').forEach(btn => {
      btn.addEventListener('click', () => openEditModal(btn.dataset.id));
    });
    document.querySelectorAll('#view-history .delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById(`confirm-${btn.dataset.id}`).classList.add('show');
      });
    });
    document.querySelectorAll('#view-history .confirm-no').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById(`confirm-${btn.dataset.id}`).classList.remove('show');
      });
    });
    document.querySelectorAll('#view-history .confirm-yes').forEach(btn => {
      btn.addEventListener('click', () => {
        try {
          NKX.deleteEntry(btn.dataset.id);
          NKXAnim.toast('Entry deleted');
        } catch (e) {
          NKXAnim.toast(e.message, { warn: true });
        }
      });
    });
  }

  function openEditModal(id) {
    const entry = NKX.getHistory().find(e => e.id === id);
    if (!entry) return;
    editingId = id;
    document.getElementById('editAmount').value = entry.amount;
    document.getElementById('editNote').value = entry.note || '';
    document.getElementById('modalEdit').classList.add('show');
    setTimeout(() => document.getElementById('editAmount').focus(), 200);
  }

  function init() {
    if (initialized) return;
    initialized = true;

    const modalEdit = document.getElementById('modalEdit');
    document.getElementById('editCancel').addEventListener('click', () => modalEdit.classList.remove('show'));
    modalEdit.addEventListener('click', e => { if (e.target === modalEdit) modalEdit.classList.remove('show'); });
    document.getElementById('editSubmit').addEventListener('click', () => {
      try {
        const amt = parseFloat(document.getElementById('editAmount').value);
        const note = document.getElementById('editNote').value.trim();
        NKX.editManualEarning(editingId, amt, note);
        modalEdit.classList.remove('show');
        NKXAnim.toast('Entry updated');
      } catch (e) {
        NKXAnim.toast(e.message, { warn: true });
      }
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') modalEdit.classList.remove('show'); });

    document.getElementById('typeChips').addEventListener('click', e => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      document.querySelectorAll('#typeChips .chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeType = chip.dataset.type;
      render();
    });
    document.getElementById('rangeChips').addEventListener('click', e => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      document.querySelectorAll('#rangeChips .chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeRange = chip.dataset.range;
      render();
    });
    let searchDebounce;
    document.getElementById('searchInput').addEventListener('input', e => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => { searchTerm = e.target.value; render(); }, 180);
    });

    NKX.on('change', render);
    NKXAnim.bindPressFeedback('#view-history .btn, #view-history .chip');
  }

  return { init, render };
})();
