/* ================= FILL GRID ================= */
let GRID_ROWS = 30;
const ROWS_PER_EXTEND = 10;

let gridData = [];
let pushState = [];
let pushTime = [];
let rowIds = [];
let eaStatusText = [];

function addEmptyRows(count){
  for(let i=0; i<count; i++){
    gridData.push(['','','','']);
    pushState.push('idle');
    pushTime.push('');
    rowIds.push(null);
    eaStatusText.push(null);
  }
}
addEmptyRows(GRID_ROWS);

function extendGrid(n){
  addEmptyRows(n);
  GRID_ROWS += n;
  renderGrid();
}

const tbody = document.getElementById('fillgrid-body');

function fmt(v){
  if(v===''||v===null||v===undefined||isNaN(v)) return '';
  return (Math.round(v*100)/100).toString();
}

// Renders the whole grid. If an input inside the grid currently has focus,
// its row/col + cursor position (selectionStart/End) are remembered before
// the rebuild and restored after, so a background poll (see startPolling
// below) never yanks focus or the cursor away from a cell the user is
// mid-keystroke in.
function renderGrid(){
  if(!tbody) return;

  const focusedEl = document.activeElement;
  const wasInGrid = focusedEl && focusedEl.dataset && tbody.contains(focusedEl);
  const focusedRow = wasInGrid ? parseInt(focusedEl.dataset.row) : null;
  const focusedCol = wasInGrid ? parseInt(focusedEl.dataset.col) : null;
  const selStart = wasInGrid ? focusedEl.selectionStart : null;
  const selEnd = wasInGrid ? focusedEl.selectionEnd : null;

  tbody.innerHTML = '';
  for(let r=0;r<GRID_ROWS;r++){
    const tr = document.createElement('tr');
    const rh = document.createElement('td');
    rh.className = 'rowhead';
    rh.textContent = r+1;
    tr.appendChild(rh);

    const locked = pushState[r] !== 'idle';

    for(let c=0;c<4;c++){
      const td = document.createElement('td');
      td.className = 'gcell' + (locked ? ' locked' : '');
      td.dataset.row = r; td.dataset.col = c;
      const input = document.createElement('input');
      input.type = 'text';
      input.value = fmt(gridData[r][c]);
      input.dataset.row = r; input.dataset.col = c;
      if(locked) input.readOnly = true;
      input.addEventListener('input', e=>{
        const val = parseFloat(e.target.value);
        gridData[r][c] = e.target.value === '' || isNaN(val) ? '' : val;
      });
      td.appendChild(input);
      tr.appendChild(td);
    }

    const tdStatus = document.createElement('td');
    tdStatus.className = 'gcell readonly';
    const hasPrice = gridData[r][0] !== '' && gridData[r][2] !== '';
    let pillHtml;
    if(pushState[r]==='placed'){
      const label = eaStatusText[r] || 'EA active';
      pillHtml = `<span class="status-pill-mini placed-buy"><span class="status-dot"></span>${escapeHtml(label)}</span>`;
    } else if(pushState[r]==='pending'){
      pillHtml = `<span class="status-pill-mini pending"><span class="status-dot"></span>Saved — awaiting EA</span>`;
    } else if(hasPrice){
      pillHtml = `<span class="status-pill-mini ready"><span class="status-dot"></span>Ready — not pushed</span>`;
    } else {
      pillHtml = `<span class="status-pill-mini"><span class="status-dot"></span>Empty</span>`;
    }
    const showRemove = pushState[r]==='placed' || pushState[r]==='pending';
    tdStatus.innerHTML = `<div class="status-cell-inner">${pillHtml}${showRemove ? `<button class="status-recall" data-row="${r}">Remove</button>` : ''}</div>`;
    tr.appendChild(tdStatus);

    const tdUpdate = document.createElement('td');
    tdUpdate.className = 'gcell readonly';
    tdUpdate.innerHTML = `<span class="last-update-cell">${pushTime[r] || (hasPrice ? '—' : '')}</span>`;
    tr.appendChild(tdUpdate);

    tbody.appendChild(tr);
  }

  // Footer row — "+ Add N rows" button spanning the full table width
  const trAdd = document.createElement('tr');
  trAdd.className = 'add-rows-row';
  const tdAdd = document.createElement('td');
  tdAdd.colSpan = 7;
  tdAdd.innerHTML = `<button class="btn-add-rows-inline" id="btn-add-rows">+ Add ${ROWS_PER_EXTEND} rows</button>`;
  trAdd.appendChild(tdAdd);
  tbody.appendChild(trAdd);

  applySelectionClasses();

  if(focusedRow !== null){
    const toRefocus = tbody.querySelector(`input[data-row="${focusedRow}"][data-col="${focusedCol}"]`);
    if(toRefocus){
      toRefocus.focus();
      if(selStart != null){
        try{ toRefocus.setSelectionRange(selStart, selEnd); }catch(e){ /* input type/state may reject this — harmless */ }
      }
    }
  }
}

/* ---- selection / fill-handle (same UX as the prototype) ---- */
const sel = { col:null, start:null, end:null, active:false };
const fillState = { active:false, previewEnd:null };

function applySelectionClasses(){
  tbody.querySelectorAll('td.gcell').forEach(td=>{
    td.classList.remove('cell-selected','cell-anchor','cell-preview');
    const handle = td.querySelector('.fill-handle');
    if(handle) handle.remove();
  });
  if(sel.col===null) return;
  const lo = Math.min(sel.start, sel.end), hi = Math.max(sel.start, sel.end);
  for(let r=lo;r<=hi;r++){
    const td = tbody.querySelector(`td.gcell[data-row="${r}"][data-col="${sel.col}"]`);
    if(td) td.classList.add('cell-selected');
  }
  if(fillState.active && fillState.previewEnd!==null && fillState.previewEnd>hi){
    for(let r=hi+1;r<=fillState.previewEnd;r++){
      const td = tbody.querySelector(`td.gcell[data-row="${r}"][data-col="${sel.col}"]`);
      if(td) td.classList.add('cell-preview');
    }
  }
  const handleRow = (fillState.active && fillState.previewEnd!==null) ? fillState.previewEnd : hi;
  const handleTd = tbody.querySelector(`td.gcell[data-row="${handleRow}"][data-col="${sel.col}"]`);
  if(handleTd && !fillState.active){
    const h = document.createElement('div');
    h.className = 'fill-handle';
    h.addEventListener('mousedown', onFillHandleDown);
    handleTd.appendChild(h);
  }
}

function rowFromPoint(x,y){
  const els = document.elementsFromPoint(x,y);
  const td = els.find(el=>el.classList && el.classList.contains('gcell'));
  if(!td) return null;
  return { row: parseInt(td.dataset.row), col: parseInt(td.dataset.col) };
}

if(tbody){
  tbody.addEventListener('mousedown', (e)=>{
    const td = e.target.closest('td.gcell');
    if(!td || e.target.classList.contains('fill-handle')) return;
    if(td.classList.contains('locked')) return;
    sel.col = parseInt(td.dataset.col); sel.start = parseInt(td.dataset.row); sel.end = sel.start; sel.active = true;
    applySelectionClasses();
  });
}
document.addEventListener('mousemove', (e)=>{
  if(sel.active){
    const hit = rowFromPoint(e.clientX, e.clientY);
    if(hit && hit.col===sel.col){ sel.end = hit.row; applySelectionClasses(); }
  }
  if(fillState.active){
    const hit = rowFromPoint(e.clientX, e.clientY);
    if(hit && hit.col===sel.col){
      fillState.previewEnd = Math.max(hit.row, Math.max(sel.start, sel.end));
      applySelectionClasses();
    }
  }
});
document.addEventListener('mouseup', ()=>{
  if(sel.active){ sel.active = false; applySelectionClasses(); }
  if(fillState.active){ commitFill(); fillState.active = false; fillState.previewEnd = null; applySelectionClasses(); }
});
function onFillHandleDown(e){
  e.stopPropagation(); e.preventDefault();
  fillState.active = true;
  fillState.previewEnd = Math.max(sel.start, sel.end);
}
function commitFill(){
  const lo = Math.min(sel.start, sel.end), hi = Math.max(sel.start, sel.end), col = sel.col;
  if(fillState.previewEnd===null || fillState.previewEnd<=hi) return;
  const vals = [];
  for(let r=lo;r<=hi;r++){ const v = gridData[r][col]; if(v!=='' && !isNaN(v)) vals.push(v); }
  let step = 0;
  if(vals.length>=2) step = vals[1]-vals[0];
  else if(vals.length===0) return;
  const base = vals[vals.length-1];
  let n = 1;
  for(let r=hi+1;r<=fillState.previewEnd;r++){
    if(pushState[r] !== 'idle') continue;
    gridData[r][col] = Math.round((base + step*n)*100)/100;
    n++;
  }
  sel.start = lo; sel.end = fillState.previewEnd;
  renderGrid();
}

renderGrid();

/* ================= SYNC WITH BACKEND ================= */
async function syncFromServer(){
  if(!API.accountId || !API.symbol) return;
  let rows;
  try{
    rows = await apiGet(`/api/accounts/${API.accountId}/limits?symbol=${encodeURIComponent(API.symbol)}`);
  }catch(err){ console.error('sync failed', err); return; }

  const localUnsavedRows = gridData.map((values, r)=>({
    values: [...values],
    row: r,
  })).filter(item=>pushState[item.row] === 'idle' && item.values.some(value=>value !== ''));

  for(let r=0;r<GRID_ROWS;r++){
    pushState[r] = 'idle'; pushTime[r] = ''; rowIds[r] = null; eaStatusText[r] = null;
    gridData[r] = ['','','',''];
  }
  localUnsavedRows.forEach(item=>{
    gridData[item.row] = item.values;
  });
  rows.forEach(row=>{
    const r = row.row_index - 1;
    if(r < 0 || r >= GRID_ROWS) return;
    rowIds[r] = row.id;
    pushState[r] = row.status;
    pushTime[r] = row.updated_at ? new Date(row.updated_at).toTimeString().slice(0,8) : '';
    eaStatusText[r] = row.ea_status_text ?? null;
    gridData[r][0] = row.buy_price ?? '';
    gridData[r][1] = row.sell_qty ?? '';
    gridData[r][2] = row.sell_price ?? '';
    gridData[r][3] = row.buy_qty ?? '';
  });
  renderGrid();
}

/* ---- live polling, started/stopped by account.js as the user enters/leaves
        the account page. renderGrid()'s focus-preserving logic (above) is
        what makes it safe to poll while the user is typing. ---- */
let pollTimer = null;
const POLL_INTERVAL_MS = 3000;

function startPolling(){
  stopPolling();
  pollTimer = setInterval(syncFromServer, POLL_INTERVAL_MS);
}
function stopPolling(){
  if(pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}
// Don't keep polling in the background once the tab isn't visible, and
// resume (with an immediate refresh) when the user comes back to it.
document.addEventListener('visibilitychange', ()=>{
  if(!API.accountId) return; // not on the account page
  if(document.hidden){
    stopPolling();
  } else {
    syncFromServer();
    startPolling();
  }
});

const pushBtn = document.getElementById('push-btn');
if(pushBtn){
  pushBtn.addEventListener('click', async ()=>{
    const rowsToPush = [];
    for(let r=0;r<GRID_ROWS;r++){
      const hasBoth = gridData[r][0] !== '' && gridData[r][2] !== '';
      if(hasBoth && pushState[r]==='idle'){
        rowsToPush.push({
          row_index: r+1,
          buy_price: gridData[r][0],
          sell_qty: gridData[r][1]===''? null : gridData[r][1],
          sell_price: gridData[r][2],
          buy_qty: gridData[r][3]===''? null : gridData[r][3],
        });
      }
    }
    if(rowsToPush.length===0){ showToast('No new rows to push — fill both price columns first'); return; }
    try{
      const created = await apiPost(`/api/accounts/${API.accountId}/limits/push`, { symbol: API.symbol, rows: rowsToPush });
      showToast(`Saved ${created.length} row${created.length>1?'s':''} — waiting for EA`);
      await syncFromServer();
    }catch(err){
      console.error(err);
      showToast('Push failed — check the backend is running');
    }
  });
}

if(tbody){
  tbody.addEventListener('click', (e)=>{
    const btn = e.target.closest('.status-recall');
    if(!btn) return;
    requestRemove(parseInt(btn.dataset.row));
  });
}
async function requestRemove(r){
  const id = rowIds[r];
  if(!id) return;
  try{
    await apiPost(`/api/accounts/${API.accountId}/limits/remove`, { symbol: API.symbol, row_ids: [id] });
    showToast('Removed — EA will cancel any live order on its next sync');
    await syncFromServer();
  }catch(err){
    console.error(err);
    showToast('Remove failed');
  }
}
const removeAllBtn = document.getElementById('remove-all-btn');
if(removeAllBtn){
  removeAllBtn.addEventListener('click', async ()=>{
    if(!pushState.some(s => s !== 'idle')){ showToast('Nothing pushed yet — nothing to remove'); return; }
    try{
      await apiPost(`/api/accounts/${API.accountId}/limits/remove`, { symbol: API.symbol, all: true });
      showToast('Removing all active rows for this symbol');
      await syncFromServer();
    }catch(err){
      console.error(err);
      showToast('Remove failed');
    }
  });
}