/* ================= HISTORY ================= */
let HISTORY_ROWS = [];

function parseHistoryDate(value){
  if(!value) return null;
  const match = String(value).match(/^(\d{2})-(\d{2})-(\d{4})[ T](\d{2}):(\d{2}):(\d{2})/);
  if(match) return new Date(`${match[3]}-${match[2]}-${match[1]}T${match[4]}:${match[5]}:${match[6]}`);
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function renderHistoryRows(rows){
  const tbodyH = document.getElementById('history-body');
  if(!tbodyH) return;
  if(rows.length===0){
    tbodyH.innerHTML = `<tr><td colspan="9" class="empty-state">No trades match these filters</td></tr>`;
    return;
  }
  tbodyH.innerHTML = rows.map(t=>{
    const typeClass = t.type === 'Sell' ? 'sell' : 'buy';
    const pnlClass = (t.profit ?? 0) >= 0 ? 'pnl-pos' : 'pnl-neg';
    const pnlStr = t.profit!=null ? (t.profit>=0?'+':'') + t.profit.toFixed(2) : '—';
    return `<tr>
      <td>${t.ticket}</td><td>${escapeHtml(t.symbol)}</td>
      <td><span class="type-pill ${typeClass}">${t.type}</span></td>
      <td>${t.open_time||'—'}</td><td>${t.open_price??'—'}</td>
      <td>${t.close_time||'—'}</td><td>${t.close_price??'—'}</td>
      <td>${t.qty??'—'}</td><td class="${pnlClass}">${pnlStr}</td>
    </tr>`;
  }).join('');
}

function applyHistoryFilters(){
  const symbol = document.querySelector('#history-filters .chip-filter.active')?.dataset.symbol || '';
  const type = document.getElementById('history-type')?.value || '';
  const fromValue = document.getElementById('history-from')?.value;
  const toValue = document.getElementById('history-to')?.value;
  const from = fromValue ? new Date(fromValue) : null;
  const to = toValue ? new Date(toValue) : null;
  const filtered = HISTORY_ROWS.filter(trade=>{
    if(symbol && trade.symbol !== symbol) return false;
    if(type && trade.type !== type) return false;
    const tradeDate = parseHistoryDate(trade.close_time || trade.open_time);
    if(from && (!tradeDate || tradeDate < from)) return false;
    if(to && (!tradeDate || tradeDate > to)) return false;
    return true;
  });
  renderHistoryRows(filtered);
}

async function loadHistory(symbol){
  const tbodyH = document.getElementById('history-body');
  if(!tbodyH) return;
  tbodyH.innerHTML = `<tr><td colspan="9" class="empty-state">Loading…</td></tr>`;
  let path = `/api/accounts/${API.accountId}/history`;
  if(symbol) path += `?symbol=${encodeURIComponent(symbol)}`;
  let rows;
  try{ rows = await apiGet(path); }
  catch(err){ tbodyH.innerHTML = `<tr><td colspan="9" class="empty-state">Could not load history</td></tr>`; return; }

  HISTORY_ROWS = rows;

  const filters = document.getElementById('history-filters');
  const symbols = [...new Set(rows.map(t=>t.symbol))];
  filters.innerHTML = `<div class="chip-filter active" data-symbol="">All symbols</div>` +
    symbols.map(s=>`<div class="chip-filter" data-symbol="${s}">${s}</div>`).join('');
  filters.querySelectorAll('.chip-filter').forEach(chip=>{
    chip.addEventListener('click', ()=>{
      filters.querySelectorAll('.chip-filter').forEach(c=>c.classList.remove('active'));
      chip.classList.add('active');
      applyHistoryFilters();
    });
  });
  applyHistoryFilters();
}

['history-from','history-to','history-type'].forEach(id=>{
  document.getElementById(id)?.addEventListener('change', applyHistoryFilters);
});
document.getElementById('history-reset')?.addEventListener('click', ()=>{
  document.getElementById('history-from').value = '';
  document.getElementById('history-to').value = '';
  document.getElementById('history-type').value = '';
  document.querySelectorAll('#history-filters .chip-filter').forEach(chip=>chip.classList.remove('active'));
  document.querySelector('#history-filters .chip-filter[data-symbol=""]')?.classList.add('active');
  applyHistoryFilters();
});