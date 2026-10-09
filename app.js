/* Little Workday: plain JavaScript, local data, no external dependencies. */
(() => {
  'use strict';
  let KEY = 'little-workday.online.v1:guest';
  const priorities = { urgent: 0, high: 1, normal: 2, low: 3 };
  const priorityLabels = { urgent: 'Mendesak', high: 'Tinggi', normal: 'Normal', low: 'Rendah' };
  const dateKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const parseDate = value => new Date(`${value}T12:00:00`);
  const addDays = (value, days) => { const d = parseDate(value); d.setDate(d.getDate() + days); return dateKey(d); };
  const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(+parseDate(value)) && dateKey(parseDate(value)) === value;
  const validTime = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  const safeUrl = value => { try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) || (u.protocol === 'codex:' && u.hostname === 'threads' && /^\/[a-zA-Z0-9-]+$/.test(u.pathname)) ? u.href : ''; } catch { return ''; } };
  const uid = () => globalThis.crypto?.randomUUID?.() || `task-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  function isDone(task, date) { return task.status === 'done' || (task.repeat !== 'none' && task.doneDates.includes(date)); }
  function isDue(task, date) {
    if (task.status === 'done') return (task.completedOn || task.date) === date;
    if (!task.date || task.date > date) return false;
    if (task.repeat === 'none' || task.repeat === 'daily') return true;
    const day = parseDate(date).getDay();
    return task.repeat === 'weekdays' ? day > 0 && day < 6 : day === parseDate(task.date).getDay();
  }
  function rank(task, date) {
    return (task.status === 'waiting' ? 100 : 0) + (isDone(task, date) ? 200 : 0) + (task.deadline && task.deadline < date ? -20 : 0) + priorities[task.priority];
  }
  function normalizeTask(raw) {
    if (!raw || typeof raw !== 'object' || typeof raw.title !== 'string' || !raw.title.trim()) throw new Error('Ada tugas tanpa judul yang valid.');
    const str = (key, max) => { if (raw[key] != null && typeof raw[key] !== 'string') throw new Error(`Kolom ${key} tidak valid.`); return (raw[key] || '').slice(0, max); };
    const date = str('date', 10), deadline = str('deadline', 10), time = str('time', 5), completedOn = str('completedOn', 10);
    if ((date && !validDate(date)) || (deadline && !validDate(deadline)) || (completedOn && !validDate(completedOn)) || (time && !validTime(time))) throw new Error('Tanggal atau jam tugas tidak valid.');
    const repeat = raw.repeat || 'none';
    if (!['none', 'daily', 'weekdays', 'weekly'].includes(repeat) || (repeat !== 'none' && !date)) throw new Error('Tugas berulang memerlukan tanggal mulai.');
    if (!Object.hasOwn(priorities, raw.priority || 'normal') || !['todo', 'waiting', 'done'].includes(raw.status || 'todo')) throw new Error('Prioritas atau status tidak valid.');
    const duration = Number(raw.duration ?? 30);
    if (!Number.isFinite(duration) || duration < 5 || duration > 480 || duration % 5 !== 0) throw new Error('Durasi harus kelipatan 5, antara 5–480 menit.');
    if (raw.doneDates != null && (!Array.isArray(raw.doneDates) || raw.doneDates.length > 10000 || !raw.doneDates.every(validDate))) throw new Error('Checklist berulang tidak valid.');
    const chatUrl = str('chatUrl', 600);
    if (chatUrl && !safeUrl(chatUrl)) throw new Error('Link chat harus berupa http(s) atau codex://threads/ID.');
    return { id: str('id', 100) || uid(), title: raw.title.trim().slice(0, 180), project: str('project', 100), priority: raw.priority || 'normal', status: raw.status || 'todo', date, deadline, time, duration, repeat, chatTitle: str('chatTitle', 180), chatUrl, notes: str('notes', 3000), doneDates: [...new Set(raw.doneDates || [])], completedOn, sourceKey: str('sourceKey', 100) };
  }
  function normalizeReferences(raw) {
    if (!raw) return null;
    const text = (v, n = 3000) => typeof v === 'string' ? v.slice(0, n) : '';
    const id = v => { if (typeof v !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(v)) throw new Error('ID referensi tidak valid.'); return v; };
    const list = (v, max) => { if (!Array.isArray(v) || v.length > max) throw new Error('Daftar referensi tidak valid.'); return v; };
    const c = raw.catalog || { projects: [], chats: [] }, s = raw.sheet || { rows: [] };
    const projects = list(c.projects, 500).map(p => ({ id: id(p.id), name: text(p.name, 180), code: text(p.code, 100), folder: text(p.folder, 600), document: text(p.document, 600), note: text(p.note), chatTitle: text(p.chatTitle, 180), chatUrl: safeUrl(p.chatUrl) }));
    if (new Set(projects.map(p => p.id)).size !== projects.length) throw new Error('ID proyek duplikat.');
    return { catalog: { root: text(c.root, 600), snapshot: text(c.snapshot, 40), projects, chats: list(c.chats, 500).map(c => ({ title: text(c.title, 180), url: safeUrl(c.url) })) }, sheet: { title: text(s.title, 180), owner: text(s.owner, 180), displayOwner: text(s.displayOwner, 100), snapshot: text(s.snapshot, 40), defaultTab: ['Sheet1', 'Back End Developer'].includes(s.defaultTab) ? s.defaultTab : 'Back End Developer', url: safeUrl(s.url), rows: list(s.rows, 5000).map(r => ({ key: id(r.key), tab: text(r.tab, 100), row: Number(r.row) || 0, title: text(r.title, 180), status: text(r.status, 180), project: text(r.project, 100), start: validDate(r.start) ? r.start : '', end: validDate(r.end) ? r.end : '', startLabel: text(r.startLabel, 100), endLabel: text(r.endLabel, 100), support: text(r.support, 180) })) } };
  }
  function normalizeState(raw) {
    if (!raw || raw.version !== 1 || !Array.isArray(raw.tasks) || raw.tasks.length > 5000) throw new Error('Backup Little Workday versi 1 tidak valid (maksimal 5.000 tugas).');
    const tasks = raw.tasks.map(normalizeTask);
    if (new Set(tasks.map(t => t.id)).size !== tasks.length) throw new Error('Backup mengandung ID tugas duplikat.');
    const settings = raw.settings || {};
    if (settings.dailyTime && !validTime(settings.dailyTime)) throw new Error('Jam pengingat tidak valid.');
    return { version: 1, tasks, references: normalizeReferences(raw.references), settings: { reminders: settings.reminders !== false, dailyTime: settings.dailyTime || '08:30', welcomeDismissed: !!settings.welcomeDismissed, sheetTab: ['Sheet1', 'Back End Developer'].includes(settings.sheetTab) ? settings.sheetTab : 'Back End Developer', sheetSnapshot: typeof settings.sheetSnapshot === 'string' ? settings.sheetSnapshot.slice(0, 40) : '' }, reminded: {}, timer: null };
  }
  // Model is exposed for focused checks without needing a browser.
  const sourceStatus = status => /^live$/i.test(status.trim()) ? 'done' : /waiting|\bhold\b/i.test(status) ? 'waiting' : 'todo';
  globalThis.WorkdayModel = { dateKey, addDays, validDate, safeUrl, isDone, isDue, rank, normalizeTask, normalizeState, normalizeReferences, sourceStatus };
  if (typeof document === 'undefined') return;

  const $ = selector => document.querySelector(selector);
  let catalog = window.WORK_CATALOG;
  let sheet = window.WORK_SHEET;
  const projectFor = id => catalog.projects.find(p => p.id === id);
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const formatDate = (value, options = { day: 'numeric', month: 'short' }) => new Intl.DateTimeFormat('id-ID', options).format(parseDate(value));
  const today = () => dateKey();
  const makeTask = fields => normalizeTask({ id: uid(), title: '', priority: 'normal', status: 'todo', repeat: 'none', duration: 30, ...fields });
  function taskFromSheet(row) {
    const p = projectFor(row.project);
    const near = row.end && row.end >= today() && row.end <= addDays(today(), 7) && /on dev/i.test(row.status);
    return makeTask({ title: row.title, project: row.project, status: sourceStatus(row.status), priority: near ? 'high' : 'normal', sourceKey: row.key, chatTitle: p?.chatTitle || '', chatUrl: p?.chatUrl || '', notes: `Status sumber: ${row.status}\nRencana sumber: ${row.startLabel || '—'} → ${row.endLabel || '—'}${near ? '\nEND DATE dekat; konfirmasi apakah target ini masih berlaku.' : ''}${row.support ? '\nSupport: ' + row.support : ''}\nSnapshot sumber · ${row.tab}, baris ${row.row}. Atur jadwal/deadline aktual sebelum dikerjakan.` });
  }
  function findSourceTask(row) {
    const signature = value => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('id');
    const equivalentKeys = sheet.rows.filter(r => signature(r.title) === signature(row.title)).map(r => r.key);
    return state.tasks.find(t => equivalentKeys.includes(t.sourceKey));
  }
  function addSheetRow(row, replacePlaceholder = false) {
    if (findSourceTask(row)) return false;
    const imported = taskFromSheet(row), p = projectFor(row.project);
    const placeholder = replacePlaceholder && p && state.tasks.find(t => t.title === `Tinjau pekerjaan ${p.name}` && t.notes === 'Saran dari referensi folder/chat. Konfirmasi status, prioritas, dan deadline sebelum dijadwalkan.' && t.status === 'todo' && !t.date && !t.deadline && !t.sourceKey);
    if (placeholder) state.tasks = state.tasks.map(t => t.id === placeholder.id ? { ...imported, id: t.id } : t);
    else state.tasks.push(imported);
    return true;
  }
  function seedState() {
    return { version: 1, tasks: [
      makeTask({ title: 'Pilih tiga prioritas hari ini', date: today(), time: '08:30', duration: 15, repeat: 'weekdays' }),
      makeTask({ title: 'Catat progres & siapkan langkah besok', date: today(), time: '16:45', duration: 15, repeat: 'weekdays' })
    ], references: null, settings: { reminders: true, dailyTime: '08:30', welcomeDismissed: false }, reminded: {}, timer: null };
  }
  let loadWarning = '', recoveryRaw = '', state;
  try {
    const stored = localStorage.getItem(KEY);
    if (stored) { const raw = JSON.parse(stored); state = normalizeState(raw); state.reminded = raw.reminded && typeof raw.reminded === 'object' && !Array.isArray(raw.reminded) ? raw.reminded : {}; state.timer = raw.timer && Number.isFinite(raw.timer.remaining) && raw.timer.remaining >= 0 && raw.timer.remaining <= 3000 && [25, 50].includes(raw.timer.minutes) && (raw.timer.end == null || Number.isFinite(raw.timer.end)) ? raw.timer : null; }
    else state = seedState();
  } catch { try { recoveryRaw = localStorage.getItem(KEY) || ''; } catch { /* storage may be unavailable */ } state = seedState(); loadWarning = 'Data browser tidak bisa dibaca. Data lama tidak ditimpa otomatis; Ekspor menyimpan salinan data lama untuk pemulihan. Gunakan Impor backup yang valid untuk melanjutkan.'; }
  function refreshReferences() {
    catalog = state.references?.catalog || window.WORK_CATALOG;
    sheet = state.references?.sheet || window.WORK_SHEET;
    $('#form-project').innerHTML = '<option value="">Rutinitas / pribadi</option>' + catalog.projects.map(p => '<option value="' + p.id + '">' + escapeHtml(p.name) + '</option>').join('');
    $('#chat-names').innerHTML = catalog.chats.map(c => '<option value="' + escapeHtml(c.title) + '"></option>').join('');
    $('#sheet-source-link').hidden = !sheet.url;
    $('#sheet-source-link').href = sheet.url;
    $('#source-title').textContent = sheet.title || 'Referensi pekerjaanmu';
    $('#source-description').textContent = sheet.owner ? 'Snapshot pribadi: ' + sheet.owner + '. Status sumber tetap perlu diperiksa kembali.' : 'Impor backup dari aplikasi lokal untuk memuat spreadsheet dan katalog SoW.';
  }
  refreshReferences();
  let selectedDate = today(), view = 'today', agendaFilter = 'open', savingAllowed = !loadWarning, toastTimeout, confirmCallback;
  let timer = state.timer || { minutes: 25, remaining: 1500, end: null, taskId: '' };
  let observedDay = today();
  // One-time additive migration for the user's selected source; custom tasks remain intact.
  if (savingAllowed && state.settings.sheetSnapshot !== sheet.snapshot) {
    sheet.rows.filter(r => r.tab === sheet.defaultTab && sourceStatus(r.status) !== 'done').forEach(r => addSheetRow(r, true));
    state.settings.sheetSnapshot = sheet.snapshot; state.settings.sheetTab ||= sheet.defaultTab;
  }
  function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimeout); toastTimeout = setTimeout(() => { $('#toast').hidden = true; }, 4500); }
  function save(force = false) {
    state.timer = timer;
    if (!savingAllowed && !force) { toast('Data awal bermasalah. Ekspor atau impor backup sebelum melanjutkan.'); return false; }
    try { localStorage.setItem(KEY, JSON.stringify(state)); $('#save-status').textContent = 'Tersimpan di browser ini'; window.dispatchEvent(new Event('workday-change')); return true; }
    catch { $('#storage-warning').hidden = false; $('#storage-warning').textContent = 'Penyimpanan browser gagal. Perubahan masih ada di halaman ini; ekspor backup sebelum menutupnya.'; $('#save-status').textContent = 'Belum tersimpan · ekspor backup'; return false; }
  }
  function askConfirm(title, message, callback) { $('#confirm-title').textContent = title; $('#confirm-message').textContent = message; confirmCallback = callback; $('#confirm-dialog').showModal(); }
  function taskCard(t, date = selectedDate) {
    const done = isDone(t, date), p = projectFor(t.project), late = !done && t.deadline && t.deadline < today();
    const overdue = !done && t.repeat === 'none' && t.date && t.date < date;
    const chat = t.chatUrl && safeUrl(t.chatUrl);
    return `<article class="task-card ${done ? 'done' : ''} ${late || overdue ? 'overdue' : ''}" data-id="${escapeHtml(t.id)}" data-occurrence="${date}">
      <button class="check-button" data-action="toggle" aria-label="${done ? 'Batalkan selesai' : 'Tandai selesai'}: ${escapeHtml(t.title)}" aria-pressed="${done}">${done ? '✓' : ''}</button>
      <div class="task-main"><div class="task-topline"><h3 class="task-title"><img class="task-pet" src="${[...t.title].reduce((sum, c) => sum + c.charCodeAt(0), 0) % 2 ? 'cat.svg' : 'duck.svg'}" alt="" aria-hidden="true">${escapeHtml(t.title)}</h3><span class="badge ${t.priority}">${priorityLabels[t.priority]}</span></div>
      <div class="task-meta">${p ? `<span class="project-tag">${escapeHtml(p.name)}</span>` : `<span class="project-tag">${t.sourceKey ? 'PRPK · Spreadsheet' : 'Rutinitas / pribadi'}</span>`}${t.sourceKey ? '<span>▤ Sumber spreadsheet</span>' : ''}${t.time ? `<span>◷ ${t.time} · ${t.duration} menit</span>` : `<span>${t.duration} menit</span>`}${t.date ? `<span>${formatDate(t.date)}${overdue ? ' · dibawa ke hari ini' : ''}</span>` : '<span>Belum dijadwalkan</span>'}${t.deadline ? `<span class="${late ? 'late' : ''}">⚑ Deadline ${formatDate(t.deadline)}${late ? ' · lewat' : ''}</span>` : ''}${t.repeat !== 'none' ? `<span>↻ ${({ daily: 'Harian', weekdays: 'Senin–Jumat', weekly: 'Mingguan' })[t.repeat]}</span>` : ''}${t.status === 'waiting' ? '<span class="badge waiting">Menunggu</span>' : ''}</div>
      ${t.notes ? `<p class="task-notes">${escapeHtml(t.notes)}</p>` : ''}
      <div class="task-footer">${t.chatTitle ? (chat ? `<a class="chat-link" href="${escapeHtml(chat)}" ${chat.startsWith('http') ? 'target="_blank" rel="noopener noreferrer"' : ''}>↗ ${escapeHtml(t.chatTitle)}</a>` : `<span class="chat-link">Chat: ${escapeHtml(t.chatTitle)}</span>`) : '<span class="chat-link">Belum ada chat terkait</span>'}${t.chatTitle ? '<button class="small-action" data-action="copy-chat">Salin nama chat</button>' : ''}${!t.date && !done ? '<button class="small-action" data-action="schedule">Jadwalkan</button>' : ''}<button class="small-action" data-action="edit">Edit</button></div></div></article>`;
  }
  const empty = (message, symbol = '✿') => `<div class="empty-state"><span>${symbol}</span>${message}</div>`;
  function sorted(tasks, date, byTime = false) { return [...tasks].sort((a, b) => byTime ? Number(isDone(a, date)) - Number(isDone(b, date)) || (a.time || '99:99').localeCompare(b.time || '99:99') || rank(a, date) - rank(b, date) : rank(a, date) - rank(b, date) || (a.deadline || '9999').localeCompare(b.deadline || '9999') || (a.time || '99').localeCompare(b.time || '99')); }
  function renderToday() {
    $('#welcome-note').hidden = state.settings.welcomeDismissed;
    $('#agenda-date').value = selectedDate;
    const dow = parseDate(selectedDate).getDay(), monday = addDays(selectedDate, -(dow === 0 ? 6 : dow - 1));
    $('#week-label').textContent = `${formatDate(monday)} — ${formatDate(addDays(monday, 6), { day: 'numeric', month: 'short', year: 'numeric' })}`;
    $('#week-strip').innerHTML = Array.from({ length: 7 }, (_, i) => { const d = addDays(monday, i); return `<button class="day-button ${d === selectedDate ? 'selected' : ''} ${d === today() ? 'is-today' : ''} ${state.tasks.some(t => isDue(t, d) && !isDone(t, d)) ? 'has-tasks' : ''}" data-date="${d}" aria-pressed="${d === selectedDate}" aria-label="${formatDate(d, { weekday: 'long', day: 'numeric', month: 'long' })}"><span>${['SEN', 'SEL', 'RAB', 'KAM', 'JUM', 'SAB', 'MIN'][i]}</span><b>${parseDate(d).getDate()}</b><i></i></button>`; }).join('');
    const tasks = state.tasks.filter(t => isDue(t, selectedDate)), done = tasks.filter(t => isDone(t, selectedDate)).length;
    const openToday = state.tasks.filter(t => isDue(t, today()) && !isDone(t, today()));
    $('#nav-count').textContent = openToday.length;
    $('#stat-total').textContent = tasks.length; $('#stat-done').textContent = done;
    $('#stat-urgent').textContent = tasks.filter(t => !isDone(t, selectedDate) && (['high', 'urgent'].includes(t.priority) || (t.deadline && t.deadline <= selectedDate))).length;
    $('#progress-text').textContent = `${done} / ${tasks.length}`; $('#day-progress').style.width = `${tasks.length ? done / tasks.length * 100 : 0}%`;
    $('#agenda-subtitle').textContent = `${formatDate(selectedDate, { weekday: 'long', day: 'numeric', month: 'long' })} · ${tasks.length - done} tugas belum selesai`;
    const visible = sorted(tasks.filter(t => agendaFilter === 'all' || (agendaFilter === 'done' ? isDone(t, selectedDate) : !isDone(t, selectedDate))), selectedDate, $('#agenda-sort').value === 'time');
    $('#agenda-list').innerHTML = visible.map(t => taskCard(t)).join('') || empty(agendaFilter === 'done' ? 'Belum ada checklist selesai untuk tanggal ini.' : tasks.length && done === tasks.length ? 'Semua langkah hari ini selesai. Beri dirimu waktu istirahat ♡' : 'Ada ruang kosong hari ini. Jadwalkan satu tugas kecil.');
    const backlog = sorted(state.tasks.filter(t => !t.date && t.status !== 'done'), selectedDate);
    $('#backlog-count').textContent = backlog.length; $('#backlog-list').innerHTML = backlog.map(t => taskCard(t)).join('') || empty('Semua tugas sudah punya tempat di agenda.');
    const focusTasks = sorted(state.tasks.filter(t => !isDone(t, selectedDate) && t.status !== 'waiting'), selectedDate);
    $('#focus-task').innerHTML = '<option value="">Fokus bebas</option>' + focusTasks.map(t => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.title)}</option>`).join('');
    $('#focus-task').value = focusTasks.some(t => t.id === timer.taskId) ? timer.taskId : '';
    const next = sorted(tasks.filter(t => !isDone(t, selectedDate) && t.status !== 'waiting'), selectedDate)[0] || backlog.find(t => t.status !== 'waiting');
    $('#next-task').innerHTML = next ? `<h3>${escapeHtml(next.title)}</h3><p>${next.deadline ? `Deadline ${formatDate(next.deadline)}. ` : ''}${next.date ? 'Mulai dari satu langkah yang paling kecil.' : 'Tentukan waktu untuk pekerjaan ini.'}</p><button class="button subtle" data-next="${escapeHtml(next.id)}">${next.date ? 'Lihat & atur tugas' : 'Masukkan ke jadwal'} ↗</button>` : '<h3>Hari ini sudah lebih ringan ♡</h3><p>Ambil napas. Nikmati progres kecilmu.</p>';
  }
  function renderTasks() {
    const query = $('#task-search').value.toLocaleLowerCase('id'), status = $('#task-status').value, priority = $('#task-priority').value;
    const tasks = sorted(state.tasks.filter(t => {
      const text = `${t.title} ${projectFor(t.project)?.name || ''} ${t.chatTitle} ${t.notes}`.toLocaleLowerCase('id');
      return text.includes(query) && (priority === 'all' || t.priority === priority) && (status === 'all' || (status === 'waiting' ? t.status === 'waiting' : status === 'done' ? isDone(t, today()) : !isDone(t, today())));
    }), today());
    $('#all-task-list').innerHTML = tasks.map(t => taskCard(t, t.date && t.date > today() ? t.date : today())).join('') || empty('Tidak ada tugas yang cocok dengan filter.');
  }
  function renderProjects() {
    const query = $('#project-search').value.toLocaleLowerCase('id');
    $('#project-list').innerHTML = catalog.projects.filter(p => `${p.name} ${p.code} ${p.chatTitle}`.toLocaleLowerCase('id').includes(query)).map(p => {
      const count = state.tasks.filter(t => t.project === p.id && t.status !== 'done').length;
      return `<article class="project-card"><div class="project-top"><span class="project-symbol">▧</span><span>${escapeHtml(p.code)}</span><span style="margin-left:auto">${count} tugas aktif</span></div><h2>${escapeHtml(p.name)}</h2>${p.folder ? `<div class="project-path">${escapeHtml(p.folder)}${p.document ? `<br>↳ ${escapeHtml(p.document)}` : ''}</div>` : ''}<p>${escapeHtml(p.note)}</p>${p.chatTitle ? `<p>Chat: <strong>${escapeHtml(p.chatTitle)}</strong></p>` : '<p>Chat belum dipetakan — bisa diisi pada tugas.</p>'}<div class="project-links"><button class="button subtle" data-project-add="${p.id}">＋ Tugas terkait</button>${p.chatUrl ? `<a class="button subtle" href="${escapeHtml(safeUrl(p.chatUrl))}">Buka chat ↗</a>` : ''}${p.folder ? `<button class="button subtle" data-copy-path="${p.id}">Salin path ${p.document ? 'SoW' : 'folder'}</button>` : ''}</div></article>`;
    }).join('') || empty('SoW atau chat belum ditemukan.');
  }
  function renderSettings() {
    $('#reminders-enabled').checked = state.settings.reminders; $('#daily-reminder-time').value = state.settings.dailyTime;
    const supported = 'Notification' in window;
    $('#notification-status').textContent = !supported ? 'Browser ini tidak mendukung notifikasi desktop. Pengingat di dalam halaman tetap tersedia.' : Notification.permission === 'granted' ? 'Notifikasi browser diizinkan. Biarkan halaman terbuka agar pengingat berjalan.' : Notification.permission === 'denied' ? 'Notifikasi diblokir. Ubah izin notifikasi lewat pengaturan situs di browser.' : 'Belum diaktifkan. Browser akan meminta izin ketika tombol di atas ditekan.';
    $('#enable-notifications').disabled = !supported || Notification.permission === 'granted' || Notification.permission === 'denied';
    $('#timezone-label').textContent = Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
  function renderSheet() {
    $('#sheet-tab').value = state.settings.sheetTab || sheet.defaultTab;
    const tab = $('#sheet-tab').value, filter = $('#sheet-status').value, query = $('#sheet-search').value.toLocaleLowerCase('id');
    const rows = sheet.rows.filter(r => r.tab === tab);
    const visible = rows.filter(r => (filter === 'all' || (filter === 'live' ? sourceStatus(r.status) === 'done' : sourceStatus(r.status) !== 'done')) && `${r.title} ${r.status}`.toLocaleLowerCase('id').includes(query));
    $('#sheet-summary').textContent = `${rows.length} pekerjaan Terang · ${rows.filter(r => sourceStatus(r.status) !== 'done').length} belum Live · ${rows.filter(r => sourceStatus(r.status) === 'done').length} Live`;
    $('#sheet-list').innerHTML = visible.map((row, i) => {
      const imported = findSourceTask(row), p = projectFor(row.project), category = sourceStatus(row.status), near = row.end && row.end >= today() && row.end <= addDays(today(), 7);
      return `<article class="source-card ${near && category === 'todo' ? 'near-date' : ''}"><div class="source-card-top"><img class="source-pet" src="${i % 2 ? 'cat.svg' : 'duck.svg'}" alt="" aria-hidden="true"><div><h3>${escapeHtml(row.title)}</h3><span class="badge ${category === 'done' ? 'normal' : category === 'waiting' ? 'waiting' : 'high'}">${escapeHtml(row.status)}</span></div></div><div class="source-dates"><span><small>START DATE SUMBER</small>${escapeHtml(row.startLabel || '—')}</span><span><small>END DATE SUMBER</small>${escapeHtml(row.endLabel || '—')}${near && category !== 'done' ? '<b>Target dekat · cek kembali</b>' : ''}</span></div><div class="source-card-footer"><span>${p ? escapeHtml(p.name) : 'Folder/chat belum dipetakan'}${row.support ? ' · Support: ' + escapeHtml(row.support) : ''}</span>${imported ? `<button class="button subtle" data-sheet-edit="${escapeHtml(imported.id)}">Atur tugas ↗</button>` : category === 'done' ? '<span class="source-live">✓ Sudah Live</span>' : `<button class="button primary" data-sheet-add="${row.key}">＋ Ke antrean</button>`}</div></article>`;
    }).join('') || empty('Tidak ada pekerjaan yang cocok. Meow & quack tetap menemani.', '🐈 🦆');
  }
  function render() { renderToday(); renderTasks(); renderProjects(); renderSettings(); renderSheet(); updateTimer(); }
  function setView(next) {
    view = ['today', 'tasks', 'projects', 'settings', 'sheet'].includes(next) ? next : 'today';
    for (const el of document.querySelectorAll('.view')) el.hidden = el.id !== `${view}-view`;
    for (const el of document.querySelectorAll('[data-view]')) { el.classList.toggle('active', el.dataset.view === view); if (el.dataset.view === view) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current'); }
    const headings = { today: ['LET\'S MAKE ROOM FOR WHAT MATTERS', 'Hari yang baik dimulai<br>dari satu langkah kecil<span>.</span>', 'Rapikan pikiran, pilih prioritas, lalu kerjakan satu per satu.'], tasks: ['YOUR LITTLE TO-DO UNIVERSE', 'Semua pekerjaan,<br>satu tempat yang tenang<span>.</span>', 'Cari konteks, atur prioritas, dan simpan langkah berikutnya.'], projects: ['CONTEXT, WITHOUT THE CLUTTER', 'SoW dan percakapan,<br>nggak lagi tercecer<span>.</span>', 'Referensi pekerjaan dan nama chat Codex yang membahasnya.'], settings: ['A GENTLE REMINDER', 'Biar Mochi bantu<br>mengingatkanmu<span>.</span>', 'Atur pengingat dan jaga rencana kecilmu tetap aman.'] };
    headings.sheet = ['TERANG\'S WORK, FROM THE SHEET', 'Pekerjaan Terang,<br>dibantu geng kecil<span>.</span>', 'Status sumber dan konteks pekerjaan, sebelum masuk jadwal harian.'];
    $('#page-eyebrow').textContent = headings[view][0]; $('#page-title').innerHTML = headings[view][1]; $('#page-description').textContent = headings[view][2];
    history.replaceState(null, '', `#${view}`);
  }
  function openTask(id = '', project = '', schedule = false) {
    const form = $('#task-form'); form.reset(); const task = state.tasks.find(t => t.id === id);
    $('#dialog-title').textContent = task ? 'Rapikan tugas' : 'Tambah tugas'; $('#delete-task').hidden = !task;
    if (task) { for (const [key, value] of Object.entries(task)) if (form.elements.namedItem(key)) form.elements.namedItem(key).value = value; }
    if (!task) { form.elements.namedItem('id').value = ''; form.elements.namedItem('date').value = selectedDate; form.elements.namedItem('project').value = project; form.elements.namedItem('duration').value = 30; fillChat(project); }
    if (schedule) form.elements.namedItem('date').value = selectedDate;
    $('#task-dialog').showModal();
  }
  function fillChat(project) { const p = projectFor(project); $('#task-form').elements.namedItem('chatTitle').value = p?.chatTitle || ''; $('#task-form').elements.namedItem('chatUrl').value = p?.chatUrl || ''; }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast('Tersalin.'); }
    catch { const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.top = '-1000px'; document.body.append(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); if (ok) toast('Tersalin.'); else askConfirm('Salin teks ini', text, () => {}); }
  }
  function notify(title, message, key = '') {
    $('#reminder-banner').replaceChildren(); const strong = document.createElement('strong'); strong.textContent = `${title} · `; const span = document.createElement('span'); span.textContent = message; const dismiss = document.createElement('button'); dismiss.textContent = 'Tutup'; dismiss.addEventListener('click', () => { $('#reminder-banner').hidden = true; }); $('#reminder-banner').append(dismiss, strong, span); $('#reminder-banner').hidden = false;
    if ('Notification' in window && Notification.permission === 'granted') { try { new Notification(title, { body: message, tag: key || 'little-workday' }); } catch { /* in-page reminder remains available */ } }
  }
  function checkReminders() {
    if (!state.settings.reminders) return;
    const now = new Date(), day = dateKey(now), minute = now.getHours() * 60 + now.getMinutes(), toMinute = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
    // Keep only recent deduplication keys, including across reloads.
    const oldKeys = Object.keys(state.reminded).filter(k => !k.startsWith(day)); oldKeys.forEach(k => delete state.reminded[k]);
    const messages = [], dailyKey = `${day}:daily`, dailyMinute = toMinute(state.settings.dailyTime);
    if (minute >= dailyMinute && minute - dailyMinute <= 120 && !state.reminded[dailyKey]) { state.reminded[dailyKey] = true; messages.push(`${state.tasks.filter(t => isDue(t, day) && !isDone(t, day)).length} tugas di agenda. Pilih satu prioritas untuk mulai.`); }
    for (const t of state.tasks) {
      const key = `${day}:${t.id}`, due = t.time ? toMinute(t.time) : null;
      if (isDue(t, day) && !isDone(t, day) && t.status !== 'waiting' && due !== null && minute >= due && minute - due <= 120 && !state.reminded[key]) { state.reminded[key] = true; messages.push(`${t.time} — ${t.title}`); }
    }
    if (messages.length) { notify('Mochi mengingatkan 🌱', messages.slice(0, 3).join(' · ') + (messages.length > 3 ? ` · +${messages.length - 3} tugas lain` : ''), `${day}:schedule`); save(); }
  }
  function remainingSeconds() { return timer.end ? Math.max(0, Math.ceil((timer.end - Date.now()) / 1000)) : timer.remaining; }
  function updateTimer() {
    const remaining = remainingSeconds(); $('#timer-display').textContent = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
    $('#timer-toggle').textContent = timer.end ? 'Jeda sebentar' : remaining === 0 ? 'Mulai lagi' : remaining < timer.minutes * 60 ? 'Lanjut fokus' : 'Mulai fokus';
    $('#timer-caption').textContent = timer.end ? 'Pelan-pelan. Kamu sedang membuat progres.' : 'Satu sesi kecil untuk satu pekerjaan.';
    document.querySelectorAll('[data-minutes]').forEach(b => { b.classList.toggle('selected', Number(b.dataset.minutes) === timer.minutes); b.disabled = !!timer.end; });
    $('#focus-task').disabled = !!timer.end;
    if (timer.end && remaining === 0) { const t = state.tasks.find(t => t.id === timer.taskId); timer.end = null; timer.remaining = 0; save(); notify('Sesi fokus selesai ✿', `${t ? `${t.title}. ` : ''}Ambil jeda kecil, kamu sudah melangkah.`); updateTimer(); }
  }
  function exportData() { const blob = new Blob([recoveryRaw || JSON.stringify({ ...state, references: { catalog, sheet }, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' }); const link = document.createElement('a'), url = URL.createObjectURL(blob); link.href = url; link.download = `little-workday-${recoveryRaw ? 'recovery-' : ''}${today()}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1500); toast(recoveryRaw ? 'Salinan data lama diekspor untuk pemulihan.' : 'Backup diekspor. Simpan file JSON ini secara privat.'); }
  $('#form-project').innerHTML = '<option value="">Rutinitas / pribadi</option>' + catalog.projects.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  $('#chat-names').innerHTML = catalog.chats.map(c => `<option value="${escapeHtml(c.title)}"></option>`).join('');
  document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
  $('.brand').addEventListener('click', e => { e.preventDefault(); setView('today'); });
  window.addEventListener('hashchange', () => setView(location.hash.slice(1)));
  $('#add-task').addEventListener('click', () => openTask());
  $('#close-dialog').addEventListener('click', () => $('#task-dialog').close()); $('#cancel-dialog').addEventListener('click', () => $('#task-dialog').close());
  $('#confirm-cancel').addEventListener('click', () => { confirmCallback = null; $('#confirm-dialog').close(); });
  $('#confirm-accept').addEventListener('click', () => { const cb = confirmCallback; confirmCallback = null; $('#confirm-dialog').close(); cb?.(); });
  $('#task-form').elements.namedItem('project').addEventListener('change', e => fillChat(e.target.value));
  $('#task-form').elements.namedItem('chatTitle').addEventListener('change', e => { const c = catalog.chats.find(c => c.title === e.target.value); if (c) $('#task-form').elements.namedItem('chatUrl').value = c.url; });
  $('#task-form').addEventListener('submit', e => {
    e.preventDefault(); const data = Object.fromEntries(new FormData(e.target)); const previous = state.tasks.find(t => t.id === data.id); let task;
    try { task = normalizeTask({ ...previous, ...data, doneDates: previous?.doneDates || [], completedOn: data.status === 'done' ? previous?.completedOn || today() : '' }); }
    catch (error) { toast(error.message); return; }
    if (!savingAllowed) { toast('Impor backup dulu untuk memulihkan data browser.'); return; }
    if (previous) state.tasks = state.tasks.map(t => t.id === task.id ? task : t); else state.tasks.push(task);
    if (previous?.time !== task.time || previous?.date !== task.date || previous?.repeat !== task.repeat) delete state.reminded[`${today()}:${task.id}`];
    save(); $('#task-dialog').close(); render(); toast(previous ? 'Tugas diperbarui. Ruang di pikiran sedikit lebih lega ♡' : 'Satu langkah kecil sudah masuk daftar.');
  });
  $('#delete-task').addEventListener('click', () => { const id = $('#task-form').elements.namedItem('id').value; askConfirm('Hapus tugas ini?', 'Tugas dan checklist terkait akan dihapus dari agenda.', () => { state.tasks = state.tasks.filter(t => t.id !== id); save(); $('#task-dialog').close(); render(); toast('Tugas dihapus.'); }); });
  document.addEventListener('click', e => {
    const action = e.target.closest('[data-action]');
    if (action) {
      const card = action.closest('[data-id]'), t = state.tasks.find(t => t.id === card.dataset.id), date = card.dataset.occurrence; if (!t) return;
      if (action.dataset.action === 'edit') openTask(t.id);
      if (action.dataset.action === 'schedule') openTask(t.id, '', true);
      if (action.dataset.action === 'copy-chat') copy(t.chatTitle);
      if (action.dataset.action === 'toggle') {
        if (!savingAllowed) return toast('Impor backup dulu untuk memulihkan data browser.');
        const done = isDone(t, date);
        if (t.repeat !== 'none' && t.status !== 'done') t.doneDates = done ? t.doneDates.filter(d => d !== date) : [...new Set([...t.doneDates, date])];
        else { t.status = done ? 'todo' : 'done'; t.completedOn = done ? '' : date; }
        save(); render(); toast(done ? 'Tugas dibuka kembali.' : 'Satu langkah selesai. Good job, kamu! ✿');
      }
    }
    const projectAdd = e.target.closest('[data-project-add]'); if (projectAdd) openTask('', projectAdd.dataset.projectAdd);
    const sheetEdit = e.target.closest('[data-sheet-edit]'); if (sheetEdit) openTask(sheetEdit.dataset.sheetEdit);
    const sheetAdd = e.target.closest('[data-sheet-add]'); if (sheetAdd) { if (!savingAllowed) return toast('Muat ulang atau pulihkan backup sebelum mengubah agenda.'); const row = sheet.rows.find(r => r.key === sheetAdd.dataset.sheetAdd); if (row && addSheetRow(row)) { save(); render(); toast('Pekerjaan masuk antrean. Atur jadwal dan deadline aktual lewat Edit.'); } }
    const pathButton = e.target.closest('[data-copy-path]'); if (pathButton) { const p = projectFor(pathButton.dataset.copyPath); copy(`${catalog.root}\\${p.folder.replaceAll('/', '\\')}${p.document ? '\\' + p.document.replaceAll('/', '\\') : ''}`); }
    const next = e.target.closest('[data-next]'); if (next) { const t = state.tasks.find(t => t.id === next.dataset.next); if (t) openTask(t.id, '', !t.date); }
  });
  $('#week-strip').addEventListener('click', e => { const b = e.target.closest('[data-date]'); if (b) { selectedDate = b.dataset.date; render(); } });
  $('#prev-week').addEventListener('click', () => { selectedDate = addDays(selectedDate, -7); render(); }); $('#next-week').addEventListener('click', () => { selectedDate = addDays(selectedDate, 7); render(); });
  $('#go-today').addEventListener('click', () => { selectedDate = today(); render(); });
  $('#agenda-date').addEventListener('change', e => { if (validDate(e.target.value)) { selectedDate = e.target.value; render(); } });
  $('#agenda-sort').addEventListener('change', renderToday);
  $('#agenda-tabs').addEventListener('click', e => { const b = e.target.closest('[data-filter]'); if (b) { agendaFilter = b.dataset.filter; document.querySelectorAll('[data-filter]').forEach(el => el.classList.toggle('selected', el === b)); renderToday(); } });
  ['task-search', 'task-status', 'task-priority'].forEach(id => $(`#${id}`).addEventListener(id === 'task-search' ? 'input' : 'change', renderTasks));
  $('#project-search').addEventListener('input', renderProjects);
  $('#sheet-source-link').href = sheet.url;
  $('#sheet-shortcut').addEventListener('click', e => { e.preventDefault(); setView('sheet'); });
  $('#sheet-tab').addEventListener('change', e => { state.settings.sheetTab = e.target.value; save(); renderSheet(); });
  $('#sheet-status').addEventListener('change', renderSheet);
  $('#sheet-search').addEventListener('input', renderSheet);
  $('#dismiss-welcome').addEventListener('click', () => { state.settings.welcomeDismissed = true; save(); renderToday(); });
  $('#reminders-enabled').addEventListener('change', e => { state.settings.reminders = e.target.checked; save(); if (!e.target.checked) $('#reminder-banner').hidden = true; });
  $('#daily-reminder-time').addEventListener('change', e => { if (validTime(e.target.value)) { state.settings.dailyTime = e.target.value; delete state.reminded[`${today()}:daily`]; save(); toast('Jam pengingat disimpan.'); } });
  $('#enable-notifications').addEventListener('click', async () => { if (!('Notification' in window)) return; try { await Notification.requestPermission(); renderSettings(); } catch { toast('Izin notifikasi tidak tersedia. Buka lewat localhost atau gunakan pengingat di halaman.'); } });
  $('#test-reminder').addEventListener('click', () => notify('Halo dari Mochi 🌱', 'Pengingatmu siap. Satu tugas kecil dulu, ya.'));
  $('#focus-task').addEventListener('change', e => { timer.taskId = e.target.value; save(); });
  $('#timer-toggle').addEventListener('click', () => { if (timer.end) { timer.remaining = remainingSeconds(); timer.end = null; } else { if (timer.remaining === 0) timer.remaining = timer.minutes * 60; timer.end = Date.now() + timer.remaining * 1000; } save(); updateTimer(); });
  $('#timer-reset').addEventListener('click', () => { timer.end = null; timer.remaining = timer.minutes * 60; save(); updateTimer(); });
  document.querySelectorAll('[data-minutes]').forEach(b => b.addEventListener('click', () => { if (timer.end) return; timer.minutes = Number(b.dataset.minutes); timer.remaining = timer.minutes * 60; save(); updateTimer(); }));
  $('#export-data').addEventListener('click', exportData);
  $('#import-button').addEventListener('click', () => $('#import-data').click());
  $('#import-data').addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    try { if (file.size > 10 * 1024 * 1024) throw new Error('Backup terlalu besar (maksimal 10 MB).'); const imported = normalizeState(JSON.parse(await file.text())); askConfirm('Ganti agenda dengan backup?', `Backup berisi ${imported.tasks.length} tugas. Data sekarang akan diganti. Ekspor dulu jika ingin menyimpannya.`, () => { state = imported; refreshReferences(); recoveryRaw = ''; timer = { minutes: 25, remaining: 1500, end: null, taskId: '' }; savingAllowed = true; $('#storage-warning').hidden = true; save(true); render(); toast('Backup berhasil dipulihkan.'); }); }
    catch (error) { toast(error instanceof SyntaxError ? 'File bukan JSON yang valid.' : error.message); }
    finally { e.target.value = ''; }
  });
  // A second tab must not silently overwrite data already changed in this tab.
  window.addEventListener('storage', e => { if (e.key === KEY) { savingAllowed = false; $('#storage-warning').hidden = false; $('#storage-warning').textContent = 'Agenda berubah di tab lain. Muat ulang halaman ini sebelum mengedit agar data tidak saling menimpa. Ekspor dulu jika ada perubahan yang belum tersimpan.'; } });
  function tick() {
    $('#live-clock').textContent = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()).replace('.', ':');
    const day = today(); if (day !== observedDay) { if (selectedDate === observedDay) selectedDate = day; observedDay = day; render(); }
    updateTimer(); checkReminders();
  }
  if (loadWarning) { $('#storage-warning').textContent = loadWarning; $('#storage-warning').hidden = false; }
  window.WorkdayApp = {
    snapshot: () => JSON.parse(JSON.stringify({ version: 1, tasks: state.tasks, settings: state.settings, references: state.references || null })),
    replace: raw => { state = normalizeState(raw); timer = { minutes: 25, remaining: 1500, end: null, taskId: '' }; refreshReferences(); savingAllowed = true; recoveryRaw = ''; $('#storage-warning').hidden = true; save(true); render(); },
    bindAccount: id => { KEY = id ? 'little-workday.online.v1:' + id : 'little-workday.online.v1:guest'; const stored = localStorage.getItem(KEY); state = stored ? normalizeState(JSON.parse(stored)) : seedState(); timer = { minutes: 25, remaining: 1500, end: null, taskId: '' }; refreshReferences(); savingAllowed = true; render(); return !!stored; }
  };
  setView(location.hash.slice(1)); render(); if (!loadWarning) save(); tick(); setInterval(tick, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
})();
