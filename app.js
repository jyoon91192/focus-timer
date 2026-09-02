// ── Notion 프록시 설정 ──────────────────────────────────
const NOTION_PROXY_URL = 'https://silent-credit-6338.jyoon54-lee.workers.dev';

async function proxiedFetch(targetUrl, options = {}) {
  const headers = options.headers || {};

  const payload = {
    targetUrl,
    method: options.method || 'GET',
    headers,
    body: options.body || null
  };

  const res = await fetch(NOTION_PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  return res;
}

const CX = 110, CY = 110, R = 100;
let NOTION_TOKEN = '', NOTION_DB_ID = '';
let setHours = 0, setMinutes = 10;
let totalPlanned = 600, remaining = 600;
let elapsed = 0, overtime = 0;
let running = false, isOvertime = false;
let interval = null, sessionCount = 0, startTime = null;
let tasks = [];
let editMode = false, selected = new Set();

const canvas = document.getElementById('timerCanvas');
const ctx = canvas.getContext('2d');

// ── Settings ──────────────────────────────────────────
function loadSettings() {
  NOTION_TOKEN = localStorage.getItem('ft_token') || '';
  NOTION_DB_ID = localStorage.getItem('ft_dbid') || '';

  if (!NOTION_TOKEN || !NOTION_DB_ID) {
    document.getElementById('modalBackdrop').classList.remove('hidden');
  } else {
    document.getElementById('modalBackdrop').classList.add('hidden');
    updateNotionBadge(true);
  }

  sessionCount = parseInt(localStorage.getItem('ft_sessions') || '0');
  document.getElementById('sessionBadge').textContent = `세션 ${sessionCount}회 완료`;
}

function saveSettings() {
  const token = document.getElementById('inputToken').value.trim();
  const dbid = document.getElementById('inputDbId').value.trim().replace(/-/g, '');

  if (!token || !dbid) {
    document.getElementById('modalError').style.display = 'block';
    return;
  }

  localStorage.setItem('ft_token', token);
  localStorage.setItem('ft_dbid', dbid);

  NOTION_TOKEN = token;
  NOTION_DB_ID = dbid;

  document.getElementById('modalBackdrop').classList.add('hidden');
  updateNotionBadge(true);
}

function openSettings() {
  document.getElementById('inputToken').value = NOTION_TOKEN;
  document.getElementById('inputDbId').value = NOTION_DB_ID;
  document.getElementById('modalBackdrop').classList.remove('hidden');
}

function updateNotionBadge(ok) {
  const b = document.getElementById('notionBadge');
  b.textContent = ok ? '● Notion' : '○ 미연결';
  b.className = ok ? 'notion-badge' : 'notion-badge disconnected';
}

// ── Task persistence ───────────────────────────────────
function saveTasks() {
  localStorage.setItem(
    'ft_tasks',
    JSON.stringify(
      tasks.map(t => ({
        ...t,
        date: t.date instanceof Date ? t.date.toISOString() : t.date
      }))
    )
  );
}

function loadTasks() {
  try {
    const raw = localStorage.getItem('ft_tasks');
    if (!raw) return;

    tasks = JSON.parse(raw).map(t => ({
      ...t,
      date: new Date(t.date)
    }));
  } catch (e) {
    tasks = [];
  }
}

// ── Canvas ─────────────────────────────────────────────
function drawClock() {
  ctx.clearRect(0, 0, 220, 220);

  ctx.beginPath();
  ctx.arc(CX, CY, R, 0, Math.PI * 2);
  ctx.fillStyle = '#f5f2ee';
  ctx.fill();

  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
    const maj = i % 5 === 0;

    ctx.beginPath();
    ctx.moveTo(
      CX + (maj ? R - 10 : R - 6) * Math.cos(a),
      CY + (maj ? R - 10 : R - 6) * Math.sin(a)
    );
    ctx.lineTo(
      CX + (R - 2) * Math.cos(a),
      CY + (R - 2) * Math.sin(a)
    );

    ctx.strokeStyle = maj ? '#c8c0b8' : '#ddd8d2';
    ctx.lineWidth = maj ? 2 : 1;
    ctx.stroke();
  }

  const sa = -Math.PI / 2;

  if (!isOvertime && remaining > 0) {
    ctx.beginPath();
    ctx.moveTo(CX, CY);
    ctx.arc(
      CX,
      CY,
      R - 12,
      sa,
      sa + (remaining / totalPlanned) * Math.PI * 2
    );
    ctx.closePath();
    ctx.fillStyle = '#e8533a';
    ctx.globalAlpha = 0.88;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  if (isOvertime && overtime > 0) {
    ctx.beginPath();
    ctx.moveTo(CX, CY);
    ctx.arc(
      CX,
      CY,
      R - 12,
      sa,
      sa + ((overtime % totalPlanned) / totalPlanned) * Math.PI * 2
    );
    ctx.closePath();
    ctx.fillStyle = '#f0b429';
    ctx.globalAlpha = 0.82;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.beginPath();
  ctx.arc(CX, CY, 52, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(CX, CY, R, 0, Math.PI * 2);
  ctx.strokeStyle = '#e0dbd4';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(CX, CY, 4, 0, Math.PI * 2);
  ctx.fillStyle = isOvertime ? '#f0b429' : '#e8533a';
  ctx.fill();
}

function fmt(sec) {
  const h = Math.floor(Math.abs(sec) / 3600);
  const m = Math.floor((Math.abs(sec) % 3600) / 60);
  const s = Math.abs(sec) % 60;

  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function nowKST() {
  return new Date(
    new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' })
  );
}

function formatDatetime(d) {
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function beep() {
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();

    [0, 0.18, 0.36].forEach(t => {
      const o = ac.createOscillator();
      const g = ac.createGain();

      o.connect(g);
      g.connect(ac.destination);

      o.frequency.value = t === 0.36 ? 880 : 660;

      g.gain.setValueAtTime(0.25, ac.currentTime + t);
      g.gain.exponentialRampToValueAtTime(
        0.001,
        ac.currentTime + t + 0.28
      );

      o.start(ac.currentTime + t);
      o.stop(ac.currentTime + t + 0.28);
    });
  } catch (e) {}
}

function showToast(msg, type = 'loading') {
  const t = document.getElementById('syncToast');

  t.className = `sync-toast ${type} show`;
  t.innerHTML = msg;

  if (type !== 'loading') {
    setTimeout(() => t.classList.remove('show'), 3500);
  }
}

function updateTimeDisplay() {
  document.getElementById('timeDisplay').textContent =
    isOvertime ? `+${fmt(overtime)}` : fmt(remaining);
}

function render() {
  drawClock();
  updateTimeDisplay();
  updateMiniMode();
}

// ── Setter ─────────────────────────────────────────────
function getPlanned() {
  return setHours * 3600 + setMinutes * 60;
}

function adjustTime(type, delta) {
  if (running) return;

  if (type === 'h') {
    setHours = Math.max(0, Math.min(23, setHours + delta));
    document.getElementById('setHour').value = setHours;
  } else {
    setMinutes = Math.max(0, Math.min(59, setMinutes + delta));

    if (!setHours && !setMinutes) {
      setMinutes = 1;
    }

    document.getElementById('setMin').value = setMinutes;
  }

  applyTimeChange();
}

function onInputChange(type) {
  if (running) return;

  if (type === 'h') {
    setHours = parseInt(document.getElementById('setHour').value) || 0;
  } else {
    setMinutes = parseInt(document.getElementById('setMin').value) || 0;
  }

  applyTimeChange();
}

function onInputBlur(type) {
  if (type === 'h') {
    setHours = Math.max(
      0,
      Math.min(
        23,
        parseInt(document.getElementById('setHour').value) || 0
      )
    );

    document.getElementById('setHour').value = setHours;
  } else {
    setMinutes = Math.max(
      0,
      Math.min(
        59,
        parseInt(document.getElementById('setMin').value) || 0
      )
    );

    if (!setHours && !setMinutes) {
      setMinutes = 1;
    }

    document.getElementById('setMin').value = setMinutes;
  }

  applyTimeChange();
}

function applyTimeChange() {
  totalPlanned = getPlanned();
  remaining = totalPlanned;
  elapsed = 0;
  overtime = 0;

  render();
}

function lockSetter(lock) {
  const s = document.getElementById('timeSetter');

  s.style.opacity = lock ? '.4' : '1';
  s.style.pointerEvents = lock ? 'none' : 'auto';
}

// ── Timer ──────────────────────────────────────────────
function toggleTimer() {
  const btn = document.getElementById('startBtn');

  if (running) {
    clearInterval(interval);
    running = false;
    btn.textContent = '▶ 재개';
  } else {
    if (!totalPlanned) return;

    if (!startTime) {
      startTime = nowKST();
    }

    running = true;
    btn.textContent = '⏸ 일시정지';

    lockSetter(true);

    document.getElementById('doneBtn').style.display = 'flex';
    document.getElementById('statusLabel').textContent = '집중 중';

    interval = setInterval(tick, 1000);
  }

  updateMiniMode();
}

function tick() {
  elapsed++;

  if (!isOvertime) {
    remaining--;
    render();

    if (remaining <= 0) {
      isOvertime = true;

      beep();

      document.getElementById('timesupBanner').classList.add('show');
      document.getElementById('statusLabel').textContent = '타임업!';
      document.getElementById('statusLabel').style.color = '#e8533a';
      document.getElementById('overtimeLabel').style.display = 'block';
    }
  } else {
    overtime++;
    document.getElementById('overtimeLabel').textContent =
      `+${fmt(overtime)}`;

    render();
  }
}

function resetTimer() {
  clearInterval(interval);

  running = false;
  isOvertime = false;

  totalPlanned = getPlanned();
  remaining = totalPlanned;

  elapsed = 0;
  overtime = 0;
  startTime = null;

  document.getElementById('startBtn').textContent = '▶ 시작';
  document.getElementById('statusLabel').textContent = '대기 중';
  document.getElementById('statusLabel').style.color = '';

  const doneBtn = document.getElementById('doneBtn');

  doneBtn.style.display = 'none';
  doneBtn.disabled = false;

  document.getElementById('timesupBanner').classList.remove('show');
  document.getElementById('overtimeLabel').style.display = 'none';

  lockSetter(false);
  render();
}

async function completeTask() {
  if (elapsed === 0) return;

  clearInterval(interval);
  running = false;

  const doneBtn = document.getElementById('doneBtn');
  doneBtn.disabled = true;

  const name =
    document.getElementById('taskInput').value.trim() ||
    '이름 없는 태스크';

  const actual = elapsed;
  const diff = actual - totalPlanned;
  const taskDate = startTime || nowKST();

  sessionCount++;

  localStorage.setItem('ft_sessions', sessionCount);

  document.getElementById('sessionBadge').textContent =
    `세션 ${sessionCount}회 완료`;

  const taskObj = {
    id: Date.now(),
    name,
    planned: totalPlanned,
    actual,
    diff,
    date: taskDate,
    notionStatus: 'pending'
  };

  tasks.unshift(taskObj);

  saveTasks();
  renderTasks();

  resetTimer();

  document.getElementById('taskInput').value = '';

  if (miniWindow && !miniWindow.closed) {
    const miniTaskInput =
      miniWindow.document.getElementById('miniTaskInput');

    if (miniTaskInput) {
      miniTaskInput.value = '';
    }
  }

  if (NOTION_TOKEN && NOTION_DB_ID) {
    showToast('⏳ 노션에 저장 중…', 'loading');

    const ok = await saveToNotion(taskObj);

    taskObj.notionStatus = ok ? 'done' : 'fail';

    saveTasks();
    renderTasks();

    showToast(
      ok ? '✅ 노션에 저장되었어요!' : '❌ 노션 저장 실패',
      ok ? 'success' : 'error'
    );
  } else {
    taskObj.notionStatus = 'fail';

    saveTasks();
    renderTasks();

    showToast(
      '⚙️ 노션 연동이 필요해요 (우측 상단 ⚙️)',
      'error'
    );
  }

  updateMiniMode();
}

async function saveToNotion(task) {
  const diffStr =
    task.diff === 0
      ? '±0:00'
      : task.diff > 0
        ? `+${fmt(task.diff)}`
        : `−${fmt(task.diff)}`;

  try {
    const res = await proxiedFetch(
      'https://api.notion.com/v1/pages',
      {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${NOTION_TOKEN}`,
          'Notion-Version': '2022-06-28'
        },

        body: JSON.stringify({
          parent: {
            database_id: NOTION_DB_ID
          },

          properties: {
            '태스크명': {
              title: [
                {
                  text: {
                    content: task.name
                  }
                }
              ]
            },

            '작업일시': {
              date: {
                start: task.date.toISOString()
              }
            },

            '계획시간': {
              rich_text: [
                {
                  text: {
                    content: fmt(task.planned)
                  }
                }
              ]
            },

            '실제시간': {
              rich_text: [
                {
                  text: {
                    content: fmt(task.actual)
                  }
                }
              ]
            },

            '차이': {
              rich_text: [
                {
                  text: {
                    content: diffStr
                  }
                }
              ]
            }
          }
        })
      }
    );

    if (!res.ok) {
      try {
        const errText = await res.text();
        console.error(
          'Notion 저장 실패:',
          res.status,
          errText
        );
      } catch (e) {
        console.error(
          'Notion 저장 실패:',
          res.status
        );
      }
    }

    return res.ok;
  } catch (e) {
    console.error(
      'Notion 프록시 호출 실패:',
      e
    );

    return false;
  }
}

// ── Edit / Delete ──────────────────────────────────────
function toggleEditMode() {
  editMode = !editMode;

  selected.clear();

  const btn = document.getElementById('editModeBtn');

  btn.textContent = editMode ? '취소' : '선택 삭제';
  btn.classList.toggle('active', editMode);

  document.getElementById('deleteBar').classList.remove('show');

  const cols = document.getElementById('listCols');

  if (editMode) {
    cols.classList.add('edit-cols');

    cols.innerHTML = `
      <div class="col-label"></div>
      <div class="col-label">태스크</div>
      <div class="col-label">작업일시</div>
      <div class="col-label right">계획</div>
      <div class="col-label right">실제</div>
      <div class="col-label right">차이</div>
    `;
  } else {
    cols.classList.remove('edit-cols');

    cols.innerHTML = `
      <div class="col-label">태스크</div>
      <div class="col-label">작업일시</div>
      <div class="col-label right">계획</div>
      <div class="col-label right">실제</div>
      <div class="col-label right">차이</div>
    `;
  }

  renderTasks();
}

function toggleSelect(id) {
  if (selected.has(id)) {
    selected.delete(id);
  } else {
    selected.add(id);
  }

  const count = selected.size;

  document
    .getElementById('deleteBar')
    .classList.toggle('show', count > 0);

  document.getElementById('deleteBarText').textContent =
    `${count}개 선택됨`;

  renderTasks();
}

function deleteSelected() {
  tasks = tasks.filter(t => !selected.has(t.id));

  selected.clear();

  saveTasks();

  document.getElementById('deleteBar').classList.remove('show');

  editMode = false;

  document.getElementById('editModeBtn').textContent =
    '선택 삭제';

  document
    .getElementById('editModeBtn')
    .classList.remove('active');

  const cols = document.getElementById('listCols');

  cols.classList.remove('edit-cols');

  cols.innerHTML = `
    <div class="col-label">태스크</div>
    <div class="col-label">작업일시</div>
    <div class="col-label right">계획</div>
    <div class="col-label right">실제</div>
    <div class="col-label right">차이</div>
  `;

  renderTasks();
}

function deleteAllTasks() {
  if (!tasks.length) {
    showToast('삭제할 태스크가 없어요', 'error');
    return;
  }

  const ok = confirm(
    `완료된 태스크 ${tasks.length}개를 모두 삭제할까요?\n이 작업은 되돌릴 수 없습니다.`
  );

  if (!ok) return;

  tasks = [];
  selected.clear();
  editMode = false;

  saveTasks();

  document.getElementById('deleteBar').classList.remove('show');

  const editBtn = document.getElementById('editModeBtn');

  editBtn.textContent = '선택 삭제';
  editBtn.classList.remove('active');

  const cols = document.getElementById('listCols');

  cols.classList.remove('edit-cols');

  cols.innerHTML = `
    <div class="col-label">태스크</div>
    <div class="col-label">작업일시</div>
    <div class="col-label right">계획</div>
    <div class="col-label right">실제</div>
    <div class="col-label right">차이</div>
  `;

  renderTasks();

  showToast(
    '🗑 완료된 태스크를 모두 삭제했어요',
    'success'
  );
}

// ── Render ─────────────────────────────────────────────
function renderTasks() {
  const list = document.getElementById('taskList');

  document.getElementById('taskCount').textContent =
    `${tasks.length}개`;

  if (!tasks.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🍅</div>
        완료된 태스크가 없어요<br>
        첫 번째 집중 세션을 시작해보세요!
      </div>
    `;

    return;
  }

  list.innerHTML = tasks.map(t => {
    const diffStr =
      t.diff === 0
        ? '±0:00'
        : t.diff > 0
          ? `+${fmt(t.diff)}`
          : `−${fmt(t.diff)}`;

    const diffCls =
      t.diff > 0
        ? 'diff-pos'
        : t.diff < 0
          ? 'diff-neg'
          : 'diff-zero';

    const nDot =
      t.notionStatus === 'done'
        ? 'notion-dot'
        : t.notionStatus === 'fail'
          ? 'notion-dot fail'
          : 'notion-dot pending';

    const isSel = selected.has(t.id);

    const rowCls =
      `task-item${editMode ? ' edit-row' : ''}${isSel ? ' selected' : ''}`;

    const checkbox = editMode
      ? `
        <div
          class="task-checkbox${isSel ? ' checked' : ''}"
          onclick="event.stopPropagation();toggleSelect(${t.id})"
        >
          ${isSel ? '✓' : ''}
        </div>
      `
      : '';

    return `
      <div
        class="${rowCls}"
        onclick="${editMode ? `toggleSelect(${t.id})` : ''}"
        style="${editMode ? 'cursor:pointer' : ''}"
      >

        ${checkbox}

        <div class="task-name-cell">
          <div class="task-status-dot ${t.diff > 0 ? 'dot-over' : 'dot-done'}"></div>

          <span class="task-name-text">
            ${esc(t.name)}
          </span>

          <div class="${nDot}"></div>
        </div>

        <div class="cell-datetime">
          ${formatDatetime(new Date(t.date))}
        </div>

        <div class="cell-mono cell-planned">
          ${fmt(t.planned)}
        </div>

        <div class="cell-mono cell-actual">
          ${fmt(t.actual)}
        </div>

        <div class="cell-mono cell-diff ${diffCls}">
          ${diffStr}
        </div>
      </div>
    `;
  }).join('');
}

function esc(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;');
}

// ── Always-on-top mini mode ────────────────────────────
let miniWindow = null;

function miniStyles() {
  return `
    :root{
      --bg:#f5f2ee;
      --surface:#fff;
      --surface2:#f0ece7;
      --border:#e0dbd4;
      --tomato:#e8533a;
      --tomato-light:#fde8e4;
      --green:#3db87a;
      --yellow:#f0b429;
      --text:#2a2520;
      --text-dim:#a09890;
      --text-mid:#6b6360;
      --shadow:0 4px 18px rgba(0,0,0,.10);
    }

    *{
      box-sizing:border-box
    }

    html,
    body{
      margin:0;
      width:100%;
      height:100%;
      overflow:hidden
    }

    body{
      background:var(--bg);
      color:var(--text);
      font-family:'Nunito',Arial,sans-serif;
      padding:8px;
      display:flex;
      align-items:stretch;
    }

    .mini{
      width:100%;
      min-width:0;
      background:var(--surface);
      border:1px solid var(--border);
      border-radius:18px;
      padding:11px;
      display:flex;
      flex-direction:column;
      gap:9px;
      box-shadow:var(--shadow);
    }

    .mini-head{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:8px;
    }

    .mini-brand{
      color:var(--tomato);
      font-size:11px;
      font-weight:900;
      white-space:nowrap;
    }

    .mini-status-pill{
      font-size:9px;
      color:var(--text-dim);
      background:var(--surface2);
      border:1px solid var(--border);
      padding:3px 7px;
      border-radius:999px;
      font-weight:800;
      white-space:nowrap;
    }

    .mini-task-row{
      display:flex;
      align-items:center;
      gap:8px;
      background:var(--surface2);
      border:1.5px solid transparent;
      border-radius:12px;
      padding:8px 10px;
      transition:border-color .15s;
    }

    .mini-task-row:focus-within{
      border-color:var(--tomato);
      background:var(--tomato-light);
    }

    .mini-dot{
      width:7px;
      height:7px;
      border-radius:50%;
      background:var(--tomato);
      flex-shrink:0;
    }

    .mini-task-input{
      width:100%;
      min-width:0;
      border:0;
      outline:0;
      background:transparent;
      color:var(--text);
      font-size:12px;
      font-weight:700;
      font-family:inherit;
    }

    .mini-task-input::placeholder{
      color:var(--text-dim);
      font-weight:600;
    }

    .mini-timer-wrap{
      display:flex;
      align-items:center;
      justify-content:center;
    }

    .mini-time-circle{
  width:92px;
  height:92px;
  border-radius:50%;
  background:#f0ece7;
  border:2px solid var(--border);

  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;

  position:relative;
}

.mini-time-circle::before{
  content:'';
  position:absolute;
  inset:7px;
  border-radius:50%;
  background:var(--surface);
}

    .mini-time{
      position:relative;
      z-index:1;

      font-family:
        'DM Mono',
        ui-monospace,
        SFMono-Regular,
        Menlo,
        monospace;

      font-size:20px;
      line-height:1;

      font-weight:400;

      letter-spacing:-.6px;
    }

    .mini-substatus{
      position:relative;
      z-index:1;

      margin-top:4px;

      font-size:8px;
      color:var(--text-dim);
      font-weight:800;
      letter-spacing:.05em;
    }

    .mini-setter{
      display:flex;
      align-items:center;
      justify-content:center;
      gap:6px;
    }

    .mini-set-unit{
      display:flex;
      align-items:center;
      gap:4px;
    }

    .mini-set-btn{
      width:24px;
      height:24px;
      padding:0;

      border:1px solid var(--border);
      border-radius:7px;

      background:var(--surface2);
      color:var(--text-mid);

      font-size:13px;
      font-weight:800;
    }

    .mini-set-input{
      width:42px;
      padding:4px 2px;

      border:1px solid var(--border);
      border-radius:7px;

      background:var(--surface2);
      color:var(--text);

      text-align:center;

      font-family:
        'DM Mono',
        ui-monospace,
        SFMono-Regular,
        Menlo,
        monospace;

      font-size:14px;

      font-weight:400;

      outline:none;
    }

    .mini-set-input:focus{
      border-color:var(--tomato);
      background:var(--tomato-light);
    }

    .mini-set-sep{
      color:var(--text-dim);

      font-family:
        'DM Mono',
        ui-monospace,
        SFMono-Regular,
        Menlo,
        monospace;

      font-size:14px;
      font-weight:600;
    }

    .mini-controls{
      display:grid;
      grid-template-columns:1fr 1fr;
      gap:7px;
    }

    button{
      appearance:none;

      border-radius:11px;

      padding:9px 8px;

      font:inherit;
      font-size:11px;
      font-weight:800;

      cursor:pointer;

      transition:all .15s;
    }

    #miniToggle{
      background:var(--tomato);
      color:#fff;
      border:0;
    }

    #miniReset{
      background:var(--surface2);
      color:var(--text-mid);
      border:1px solid var(--border);
    }

    #miniDone{
      grid-column:1 / -1;

      background:#e8f8f0;
      color:var(--green);

      border:1px solid #b8e8d0;
    }

    #miniDone:disabled{
      opacity:.45;
      cursor:not-allowed;
    }

    @media(max-width:230px){
      body{
        padding:5px
      }

      .mini{
        padding:8px;
        border-radius:14px;
        gap:7px;
      }

      .mini-brand{
        font-size:10px
      }

      .mini-status-pill{
        font-size:8px
      }

      .mini-task-row{
        padding:7px 8px
      }

      .mini-task-input{
        font-size:11px
      }

      .mini-time-circle{
        width:76px;
        height:76px
      }

      .mini-time{
        font-size:17px
      }

      button{
        padding:7px 6px;
        font-size:10px
      }
    }
  `;
}

async function openMiniMode() {
  if (!('documentPictureInPicture' in window)) {
    alert(
      '이 브라우저는 항상 위 미니모드를 지원하지 않습니다. 최신 Chrome 또는 Edge에서 이용해주세요.'
    );

    return;
  }

  if (miniWindow && !miniWindow.closed) {
    miniWindow.focus();
    return;
  }

  try {
    miniWindow =
      await window.documentPictureInPicture.requestWindow({
        width: 290,
        height: 260
      });

    miniWindow.document.head.innerHTML = `
      <meta charset="UTF-8">

      <meta
        name="viewport"
        content="width=device-width,initial-scale=1.0"
      >

      <title>Focus Timer Mini</title>

      <link
        rel="preconnect"
        href="https://fonts.googleapis.com"
      >

      <link
        rel="preconnect"
        href="https://fonts.gstatic.com"
        crossorigin
      >

      <link
        href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Nunito:wght@400;600;700;800;900&display=swap"
        rel="stylesheet"
      >

      <style>
        ${miniStyles()}
      </style>
    `;

    miniWindow.document.body.innerHTML = `
      <div class="mini">

        <div class="mini-head">

          <div class="mini-brand">
            🍅 Focus Timer
          </div>

          <div
            class="mini-status-pill"
            id="miniStatusPill"
          >
            대기 중
          </div>

        </div>

        <div class="mini-task-row">

          <div class="mini-dot"></div>

          <input
            class="mini-task-input"
            id="miniTaskInput"
            type="text"
            maxlength="40"
            placeholder="지금 집중할 태스크…"
          >

        </div>

        <div class="mini-timer-wrap">

          <div class="mini-time-circle">

            <div
              class="mini-time"
              id="miniTime"
            >
              10:00
            </div>

            <div
              class="mini-substatus"
              id="miniSubStatus"
            >
              대기 중
            </div>

          </div>

        </div>

        <div
          class="mini-setter"
          id="miniSetter"
        >

          <div class="mini-set-unit">

            <button
              class="mini-set-btn"
              id="miniHourMinus"
            >
              −
            </button>

            <input
              class="mini-set-input"
              id="miniHour"
              type="number"
              min="0"
              max="23"
              value="0"
            >

            <button
              class="mini-set-btn"
              id="miniHourPlus"
            >
              +
            </button>

          </div>

          <div class="mini-set-sep">
            :
          </div>

          <div class="mini-set-unit">

            <button
              class="mini-set-btn"
              id="miniMinMinus"
            >
              −
            </button>

            <input
              class="mini-set-input"
              id="miniMin"
              type="number"
              min="0"
              max="59"
              value="10"
            >

            <button
              class="mini-set-btn"
              id="miniMinPlus"
            >
              +
            </button>

          </div>

        </div>

        <div class="mini-controls">

          <button id="miniToggle">
            ▶ 시작
          </button>

          <button id="miniReset">
            ↺ 리셋
          </button>

          <button id="miniDone">
            ✓ 완료
          </button>

        </div>

      </div>
    `;

    const miniTaskInput =
      miniWindow.document.getElementById('miniTaskInput');

    const currentMainTask =
      document.getElementById('taskInput').value || '';

    miniTaskInput.value = currentMainTask;

    miniTaskInput.addEventListener('input', () => {
      const mainTaskInput =
        document.getElementById('taskInput');

      mainTaskInput.value =
        miniTaskInput.value;

      mainTaskInput.dispatchEvent(
        new Event('input', {
          bubbles: true
        })
      );
    });

    const miniHour =
      miniWindow.document.getElementById('miniHour');

    const miniMin =
      miniWindow.document.getElementById('miniMin');

    function syncMiniSetterFromMain() {
      miniHour.value = setHours;
      miniMin.value = setMinutes;

      const setter =
        miniWindow.document.getElementById('miniSetter');

      if (setter) {
        setter.style.opacity =
          running ? '.45' : '1';

        setter.style.pointerEvents =
          running ? 'none' : 'auto';
      }
    }

    function applyMiniSetter() {
      if (running) return;

      setHours = Math.max(
        0,
        Math.min(
          23,
          parseInt(miniHour.value) || 0
        )
      );

      setMinutes = Math.max(
        0,
        Math.min(
          59,
          parseInt(miniMin.value) || 0
        )
      );

      if (!setHours && !setMinutes) {
        setMinutes = 1;
      }

      document.getElementById('setHour').value =
        setHours;

      document.getElementById('setMin').value =
        setMinutes;

      applyTimeChange();

      syncMiniSetterFromMain();
    }

    miniHour.addEventListener(
      'change',
      applyMiniSetter
    );

    miniMin.addEventListener(
      'change',
      applyMiniSetter
    );

    miniWindow.document
      .getElementById('miniHourMinus')
      .addEventListener('click', () => {
        if (running) return;

        setHours =
          Math.max(0, setHours - 1);

        document.getElementById('setHour').value =
          setHours;

        applyTimeChange();

        syncMiniSetterFromMain();
      });

    miniWindow.document
      .getElementById('miniHourPlus')
      .addEventListener('click', () => {
        if (running) return;

        setHours =
          Math.min(23, setHours + 1);

        document.getElementById('setHour').value =
          setHours;

        applyTimeChange();

        syncMiniSetterFromMain();
      });

    miniWindow.document
      .getElementById('miniMinMinus')
      .addEventListener('click', () => {
        if (running) return;

        setMinutes =
          Math.max(0, setMinutes - 1);

        if (!setHours && !setMinutes) {
          setMinutes = 1;
        }

        document.getElementById('setMin').value =
          setMinutes;

        applyTimeChange();

        syncMiniSetterFromMain();
      });

    miniWindow.document
      .getElementById('miniMinPlus')
      .addEventListener('click', () => {
        if (running) return;

        setMinutes =
          Math.min(59, setMinutes + 1);

        document.getElementById('setMin').value =
          setMinutes;

        applyTimeChange();

        syncMiniSetterFromMain();
      });

    syncMiniSetterFromMain();

    miniWindow.document
      .getElementById('miniToggle')
      .addEventListener('click', () => {
        toggleTimer();
        updateMiniMode();
      });

    miniWindow.document
      .getElementById('miniReset')
      .addEventListener('click', () => {
        resetTimer();
        updateMiniMode();
      });

    miniWindow.document
      .getElementById('miniDone')
      .addEventListener(
        'click',
        async () => {
          await completeTask();
          updateMiniMode();
        }
      );

    miniWindow.addEventListener(
      'pagehide',
      () => {
        miniWindow = null;
      }
    );

    updateMiniMode();

    setTimeout(
      updateMiniMode,
      0
    );

  } catch (e) {
    console.error(
      '미니모드 열기 실패:',
      e
    );

    alert(
      '미니모드를 열 수 없습니다. 브라우저의 Picture-in-Picture 권한을 확인해주세요.'
    );
  }
}

function updateMiniMode() {
  if (!miniWindow || miniWindow.closed) {
    return;
  }

  const d = miniWindow.document;

  const taskInputEl =
    d.getElementById('miniTaskInput');

  const timeEl =
    d.getElementById('miniTime');

  const statusPillEl =
    d.getElementById('miniStatusPill');

  const subStatusEl =
    d.getElementById('miniSubStatus');

  const toggleEl =
    d.getElementById('miniToggle');

  const doneEl =
    d.getElementById('miniDone');

  const circleEl =
    d.querySelector('.mini-time-circle');

  if (
    !taskInputEl ||
    !timeEl ||
    !statusPillEl ||
    !subStatusEl ||
    !toggleEl ||
    !doneEl ||
    !circleEl
  ) {
    return;
  }

  // 메인 화면 태스크명 → 미니 플레이어 동기화
  const mainTaskInput =
    document.getElementById('taskInput');

  const mainTask =
    mainTaskInput
      ? mainTaskInput.value
      : '';

  if (
    d.activeElement !== taskInputEl &&
    taskInputEl.value !== mainTask
  ) {
    taskInputEl.value =
      mainTask;
  }

  timeEl.textContent =
    isOvertime
      ? `+${fmt(overtime)}`
      : fmt(remaining);

  // 원형 시간 게이지
  let progress = 100;
  let progressColor = '#e8533a';

  if (isOvertime) {
    progress =
      totalPlanned > 0
        ? Math.min(
            100,
            (
              (overtime % totalPlanned) /
              totalPlanned
            ) * 100
          )
        : 0;

    progressColor =
      '#f0b429';

  } else if (totalPlanned > 0) {
    progress =
      Math.max(
        0,
        Math.min(
          100,
          (remaining / totalPlanned) * 100
        )
      );
  }

  const angle = Math.max(
  0,
  Math.min(
    360,
    progress * 3.6
  )
);

circleEl.style.background = `
  conic-gradient(
    ${progressColor} 0deg,
    ${progressColor} ${angle}deg,
    #f0ece7 ${angle}deg,
    #f0ece7 360deg
  )
`;

  if (isOvertime) {
    statusPillEl.textContent =
      '타임업';

    statusPillEl.style.color =
      '#e8533a';

    statusPillEl.style.background =
      '#fde8e4';

    subStatusEl.textContent =
      `초과 +${fmt(overtime)}`;

    subStatusEl.style.color =
      '#f0b429';

  } else if (running) {
    statusPillEl.textContent =
      '집중 중';

    statusPillEl.style.color =
      '#e8533a';

    statusPillEl.style.background =
      '#fde8e4';

    subStatusEl.textContent =
      '집중 중';

    subStatusEl.style.color =
      '#a09890';

  } else if (elapsed > 0) {
    statusPillEl.textContent =
      '일시정지';

    statusPillEl.style.color =
      '#6b6360';

    statusPillEl.style.background =
      '#f0ece7';

    subStatusEl.textContent =
      '일시정지';

    subStatusEl.style.color =
      '#a09890';

  } else {
    statusPillEl.textContent =
      '대기 중';

    statusPillEl.style.color =
      '#a09890';

    statusPillEl.style.background =
      '#f0ece7';

    subStatusEl.textContent =
      '대기 중';

    subStatusEl.style.color =
      '#a09890';
  }

  toggleEl.textContent =
    running
      ? '⏸ 일시정지'
      : elapsed > 0
        ? '▶ 재개'
        : '▶ 시작';

  doneEl.disabled =
    elapsed === 0;

  const miniHour =
    d.getElementById('miniHour');

  const miniMin =
    d.getElementById('miniMin');

  const miniSetter =
    d.getElementById('miniSetter');

  if (
    miniHour &&
    miniMin &&
    miniSetter
  ) {
    if (d.activeElement !== miniHour) {
      miniHour.value =
        setHours;
    }

    if (d.activeElement !== miniMin) {
      miniMin.value =
        setMinutes;
    }

    miniSetter.style.opacity =
      running ? '.45' : '1';

    miniSetter.style.pointerEvents =
      running ? 'none' : 'auto';
  }
}

// ── Init ───────────────────────────────────────────────
document
  .getElementById('taskInput')
  .addEventListener(
    'input',
    updateMiniMode
  );

loadSettings();
loadTasks();

render();
renderTasks();
