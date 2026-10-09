/* Little Workday: plain JavaScript, local data, no external dependencies. */
(() => {
  'use strict';
  let KEY, storage;
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
    if (!raw || typeof raw !== 'object' || typeof raw.title !== 'string' || !raw.title.trim()) throw new Error('Ada tugas tanpa judul. Isi judul sebelum menyimpan.');
    const str = (key, max) => { if (raw[key] != null && typeof raw[key] !== 'string') throw new Error(`Kolom ${key} tidak valid.`); return (raw[key] || '').slice(0, max); };
    const date = str('date', 10), deadline = str('deadline', 10), time = str('time', 5), completedOn = str('completedOn', 10);
    if ((date && !validDate(date)) || (deadline && !validDate(deadline)) || (completedOn && !validDate(completedOn)) || (time && !validTime(time))) throw new Error('Tanggal atau jam tugas tidak valid.');
    const repeat = raw.repeat || 'none';
    if (!['none', 'daily', 'weekdays', 'weekly'].includes(repeat) || (repeat !== 'none' && !date)) throw new Error('Pilih tanggal mulai untuk tugas berulang.');
    if (!Object.hasOwn(priorities, raw.priority || 'normal') || !['todo', 'waiting', 'done'].includes(raw.status || 'todo')) throw new Error('Prioritas atau status tidak valid.');
    const duration = Number(raw.duration ?? 30);
    if (!Number.isFinite(duration) || duration < 5 || duration > 480 || duration % 5 !== 0) throw new Error('Pilih durasi 5–480 menit dalam kelipatan 5.');
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
    if (!raw || raw.version !== 1 || !Array.isArray(raw.tasks) || raw.tasks.length > 5000) throw new Error('File cadangan tidak sesuai format Little Workday versi 1, atau berisi lebih dari 5.000 tugas.');
    const tasks = raw.tasks.map(normalizeTask);
    if (new Set(tasks.map(t => t.id)).size !== tasks.length) throw new Error('Ada tugas dengan ID yang sama dalam file cadangan. File belum bisa dipulihkan.');
    const settings = raw.settings || {};
    if (settings.dailyTime && !validTime(settings.dailyTime)) throw new Error('Jam pengingat tidak valid.');
    return { version: 1, tasks, references: normalizeReferences(raw.references), settings: { reminders: settings.reminders !== false, dailyTime: settings.dailyTime || '08:30', welcomeDismissed: !!settings.welcomeDismissed, sheetTab: ['Sheet1', 'Back End Developer'].includes(settings.sheetTab) ? settings.sheetTab : 'Back End Developer', sheetSnapshot: typeof settings.sheetSnapshot === 'string' ? settings.sheetSnapshot.slice(0, 40) : '' }, reminded: {}, timer: null };
  }
  // Model is exposed for focused checks without needing a browser.
  const sourceStatus = status => /^live$/i.test(status.trim()) ? 'done' : /waiting|\bhold\b/i.test(status) ? 'waiting' : 'todo';
  globalThis.WorkdayModel = { dateKey, addDays, validDate, safeUrl, isDone, isDue, rank, normalizeTask, normalizeState, normalizeReferences, sourceStatus };
  if (typeof document === 'undefined') return;

  const $ = selector => document.querySelector(selector);
  const accounts = new WorkdayAccounts(localStorage, sessionStorage);
  ({ key: KEY, storage } = accounts.guest());
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const formatDate = (value, options = { day: 'numeric', month: 'short' }) => new Intl.DateTimeFormat('id-ID', options).format(parseDate(value));
  const today = () => dateKey();
  const makeTask = fields => normalizeTask({ id: uid(), title: '', priority: 'normal', status: 'todo', repeat: 'none', duration: 30, ...fields });
  function seedState() {
    return { version: 1, tasks: [
      makeTask({ title: 'Lihat jadwal dan pilih kegiatan hari ini', date: today(), time: '08:30', duration: 15, repeat: 'weekdays' }),
      makeTask({ title: 'Cek agenda dan siapkan rencana besok', date: today(), time: '16:45', duration: 15, repeat: 'weekdays' })
    ], references: null, settings: { reminders: true, dailyTime: '08:30', welcomeDismissed: false }, reminded: {}, timer: null };
  }
  let loadWarning = '', recoveryRaw = '', state;
  try {
    const stored = storage.getItem(KEY);
    if (stored) { const raw = JSON.parse(stored); state = normalizeState(raw); state.reminded = raw.reminded && typeof raw.reminded === 'object' && !Array.isArray(raw.reminded) ? raw.reminded : {}; state.timer = raw.timer && Number.isFinite(raw.timer.remaining) && raw.timer.remaining >= 0 && raw.timer.remaining <= 3000 && [25, 50].includes(raw.timer.minutes) && (raw.timer.end == null || Number.isFinite(raw.timer.end)) ? raw.timer : null; }
    else state = seedState();
  } catch { try { recoveryRaw = storage.getItem(KEY) || ''; } catch { /* storage may be unavailable */ } state = seedState(); loadWarning = 'Agenda yang tersimpan di browser tidak bisa dibaca. Data lama belum diubah. Klik Unduh cadangan untuk menyimpan salinannya, lalu pulihkan dari file cadangan yang bisa dibaca.'; }
  let selectedDate = today(), view = 'today', agendaFilter = 'open', savingAllowed = !loadWarning, toastTimeout, confirmCallback;
  let timer = state.timer || { minutes: 25, remaining: 1500, end: null, taskId: '' };
  let observedDay = today();
  function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimeout); toastTimeout = setTimeout(() => { $('#toast').hidden = true; }, 4500); }
  function save(force = false) {
    state.timer = timer;
    if (!savingAllowed && !force) { toast('Data tersimpan tidak bisa dibaca. Unduh salinannya atau pulihkan cadangan sebelum melanjutkan.'); return false; }
    try { storage.setItem(KEY, JSON.stringify(state)); $('#save-status').textContent = storage === sessionStorage ? 'Mode tamu · tersimpan di tab ini' : 'Agenda akun · tersimpan di perangkat ini'; window.dispatchEvent(new Event('workday-change')); return true; }
    catch { $('#storage-warning').hidden = false; $('#storage-warning').textContent = 'Perubahan belum berhasil disimpan. Unduh cadangan sebelum menutup halaman agar perubahanmu tidak hilang.'; $('#save-status').textContent = 'Belum tersimpan · unduh cadangan'; return false; }
  }
  function askConfirm(title, message, callback) { $('#confirm-title').textContent = title; $('#confirm-message').textContent = message; confirmCallback = callback; $('#confirm-dialog').showModal(); }
  function taskCard(t, date = selectedDate) {
    const done = isDone(t, date), late = !done && t.deadline && t.deadline < today();
    const overdue = !done && t.repeat === 'none' && t.date && t.date < date;
    return `<article class="task-card ${done ? 'done' : ''} ${late || overdue ? 'overdue' : ''}" data-id="${escapeHtml(t.id)}" data-occurrence="${date}">
      <button class="check-button" data-action="toggle" aria-label="${done ? 'Batalkan selesai' : 'Tandai selesai'}: ${escapeHtml(t.title)}" aria-pressed="${done}">${done ? '✓' : ''}</button>
      <div class="task-main"><div class="task-topline"><h3 class="task-title"><img class="task-pet" src="${[...t.title].reduce((sum, c) => sum + c.charCodeAt(0), 0) % 2 ? 'cat.svg' : 'duck.svg'}" alt="" aria-hidden="true">${escapeHtml(t.title)}</h3><span class="badge ${t.priority}">${priorityLabels[t.priority]}</span></div>
      <div class="task-meta">${t.time ? `<span>◷ ${t.time} · ${t.duration} menit</span>` : `<span>${t.duration} menit</span>`}${t.date ? `<span>${formatDate(t.date)}${overdue ? ' · belum selesai sejak tanggal ini' : ''}</span>` : '<span>Belum dijadwalkan</span>'}${t.deadline ? `<span class="${late ? 'late' : ''}">⚑ Deadline ${formatDate(t.deadline)}${late ? ' · sudah lewat' : ''}</span>` : ''}${t.repeat !== 'none' ? `<span>↻ ${({ daily: 'Harian', weekdays: 'Senin–Jumat', weekly: 'Mingguan' })[t.repeat]}</span>` : ''}${t.status === 'waiting' ? '<span class="badge waiting">Menunggu</span>' : ''}</div>
      ${t.notes ? `<p class="task-notes">${escapeHtml(t.notes)}</p>` : ''}
      <div class="task-footer">${!t.date && !done ? '<button class="small-action" data-action="schedule">Jadwalkan</button>' : ''}<button class="small-action" data-action="edit">Edit</button></div></div></article>`;
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
    $('#agenda-list').innerHTML = visible.map(t => taskCard(t)).join('') || empty(agendaFilter === 'done' ? 'Belum ada tugas yang selesai pada tanggal ini.' : tasks.length && done === tasks.length ? 'Semua tugas hari ini sudah selesai. Waktunya istirahat ♡' : 'Belum ada tugas untuk tanggal ini. Tambahkan tugas atau jadwalkan yang sudah ada.');
    const backlog = sorted(state.tasks.filter(t => !t.date && t.status !== 'done'), selectedDate);
    $('#backlog-count').textContent = backlog.length; $('#backlog-list').innerHTML = backlog.map(t => taskCard(t)).join('') || empty('Tidak ada tugas yang menunggu dijadwalkan.');
    const focusTasks = sorted(state.tasks.filter(t => !isDone(t, selectedDate) && t.status !== 'waiting'), selectedDate);
    $('#focus-task').innerHTML = '<option value="">Fokus bebas</option>' + focusTasks.map(t => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.title)}</option>`).join('');
    $('#focus-task').value = focusTasks.some(t => t.id === timer.taskId) ? timer.taskId : '';
    const next = sorted(tasks.filter(t => !isDone(t, selectedDate) && t.status !== 'waiting'), selectedDate)[0] || backlog.find(t => t.status !== 'waiting');
    $('#next-task').innerHTML = next ? `<h3>${escapeHtml(next.title)}</h3><p>${next.deadline ? `Deadline ${formatDate(next.deadline)}. ` : ''}${next.date ? 'Tugas ini berada di urutan teratas berdasarkan prioritas dan deadline.' : 'Tugas ini belum punya jadwal. Pilih tanggal untuk mengerjakannya.'}</p><button class="button subtle" data-next="${escapeHtml(next.id)}">${next.date ? 'Lihat tugas' : 'Jadwalkan tugas'} ↗</button>` : '<h3>Tidak ada tugas siap dikerjakan.</h3><p>Tambahkan tugas baru atau periksa tugas yang masih menunggu.</p>';
  }
  function renderTasks() {
    const query = $('#task-search').value.toLocaleLowerCase('id'), status = $('#task-status').value, priority = $('#task-priority').value;
    const tasks = sorted(state.tasks.filter(t => {
      const text = `${t.title} ${t.notes}`.toLocaleLowerCase('id');
      return text.includes(query) && (priority === 'all' || t.priority === priority) && (status === 'all' || (status === 'waiting' ? t.status === 'waiting' : status === 'done' ? isDone(t, today()) : !isDone(t, today())));
    }), today());
    $('#all-task-list').innerHTML = tasks.map(t => taskCard(t, t.date && t.date > today() ? t.date : today())).join('') || empty('Tidak ada tugas yang cocok. Coba ubah pencarian atau filter.');
  }
  function renderSettings() {
    $('#reminders-enabled').checked = state.settings.reminders; $('#daily-reminder-time').value = state.settings.dailyTime;
    const supported = 'Notification' in window;
    $('#notification-status').textContent = !supported ? 'Browser ini tidak mendukung notifikasi desktop. Pengingat di dalam halaman tetap tersedia.' : Notification.permission === 'granted' ? 'Notifikasi browser diizinkan. Biarkan halaman terbuka agar pengingat berjalan.' : Notification.permission === 'denied' ? 'Notifikasi diblokir. Ubah izin notifikasi lewat pengaturan situs di browser.' : 'Belum diaktifkan. Browser akan meminta izin ketika tombol di atas ditekan.';
    $('#enable-notifications').disabled = !supported || Notification.permission === 'granted' || Notification.permission === 'denied';
    $('#timezone-label').textContent = Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
  function render() { renderToday(); renderTasks(); renderSettings(); updateTimer(); }
  function setView(next) {
    view = ['today', 'tasks', 'settings'].includes(next) ? next : 'today';
    for (const el of document.querySelectorAll('.view')) el.hidden = el.id !== `${view}-view`;
    for (const el of document.querySelectorAll('[data-view]')) { el.classList.toggle('active', el.dataset.view === view); if (el.dataset.view === view) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current'); }
    const headings = { today: ['AGENDA HARIAN', 'Apa yang perlu<br>dikerjakan hari ini<span>?</span>', 'Lihat jadwal, pilih tugas yang paling penting, lalu mulai kerjakan.'], tasks: ['DAFTAR TUGAS', 'Semua tugasmu,<br>di satu tempat<span>.</span>', 'Cari tugas, ubah prioritas, dan tentukan jadwalnya.'], settings: ['PENGATURAN', 'Pengingat dan<br>cadangan data<span>.</span>', 'Pilih jam pengingat dan simpan salinan agendamu.'] };
    $('#page-eyebrow').textContent = headings[view][0]; $('#page-title').innerHTML = headings[view][1]; $('#page-description').textContent = headings[view][2];
    history.replaceState(null, '', `#${view}`);
  }
  function openTask(id = '', project = '', schedule = false) {
    const form = $('#task-form'); form.reset(); const task = state.tasks.find(t => t.id === id);
    $('#dialog-title').textContent = task ? 'Edit tugas' : 'Tambah tugas'; $('#delete-task').hidden = !task;
    if (task) { for (const [key, value] of Object.entries(task)) if (form.elements.namedItem(key)) form.elements.namedItem(key).value = value; }
    if (!task) { form.elements.namedItem('id').value = ''; form.elements.namedItem('date').value = selectedDate; form.elements.namedItem('duration').value = 30;  }
    if (schedule) form.elements.namedItem('date').value = selectedDate;
    $('#task-dialog').showModal();
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
    if (minute >= dailyMinute && minute - dailyMinute <= 120 && !state.reminded[dailyKey]) { state.reminded[dailyKey] = true; messages.push(`${state.tasks.filter(t => isDue(t, day) && !isDone(t, day)).length} tugas belum selesai hari ini. Buka agenda untuk melihat jadwalnya.`); }
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
    $('#timer-caption').textContent = timer.end ? 'Timer berjalan. Fokus pada tugas yang dipilih.' : 'Pilih tugas dan durasi, lalu mulai timer.';
    document.querySelectorAll('[data-minutes]').forEach(b => { b.classList.toggle('selected', Number(b.dataset.minutes) === timer.minutes); b.disabled = !!timer.end; });
    $('#focus-task').disabled = !!timer.end;
    if (timer.end && remaining === 0) { const t = state.tasks.find(t => t.id === timer.taskId); timer.end = null; timer.remaining = 0; save(); notify('Sesi fokus selesai ✿', `${t ? `${t.title}. ` : ''}Waktunya istirahat sebentar.`); updateTimer(); }
  }
  function exportData() { const blob = new Blob([recoveryRaw || JSON.stringify({ ...state, references: state.references || null, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' }); const link = document.createElement('a'), url = URL.createObjectURL(blob); link.href = url; link.download = `little-workday-${recoveryRaw ? 'recovery-' : ''}${today()}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1500); toast(recoveryRaw ? 'Salinan data lama diunduh. Simpan file ini untuk pemulihan.' : 'Cadangan diunduh. Simpan file ini untuk memulihkan agenda nanti. File berisi agendamu. Simpan untuk keperluan pribadi.'); }
  document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
  $('.brand').addEventListener('click', e => { e.preventDefault(); setView('today'); });
  window.addEventListener('hashchange', () => setView(location.hash.slice(1)));
  $('#add-task').addEventListener('click', () => openTask());
  $('#close-dialog').addEventListener('click', () => $('#task-dialog').close()); $('#cancel-dialog').addEventListener('click', () => $('#task-dialog').close());
  $('#confirm-cancel').addEventListener('click', () => { confirmCallback = null; $('#confirm-dialog').close(); });
  $('#confirm-accept').addEventListener('click', () => { const cb = confirmCallback; confirmCallback = null; $('#confirm-dialog').close(); cb?.(); });
  $('#task-form').addEventListener('submit', e => {
    e.preventDefault(); const data = Object.fromEntries(new FormData(e.target)); const previous = state.tasks.find(t => t.id === data.id); let task;
    try { task = normalizeTask({ ...previous, ...data, doneDates: previous?.doneDates || [], completedOn: data.status === 'done' ? previous?.completedOn || today() : '' }); }
    catch (error) { toast(error.message); return; }
    if (!savingAllowed) { toast('Pulihkan cadangan data sebelum mengubah agenda.'); return; }
    if (previous) state.tasks = state.tasks.map(t => t.id === task.id ? task : t); else state.tasks.push(task);
    if (previous?.time !== task.time || previous?.date !== task.date || previous?.repeat !== task.repeat) delete state.reminded[`${today()}:${task.id}`];
    save(); $('#task-dialog').close(); render(); toast(previous ? 'Tugas diperbarui.' : 'Tugas ditambahkan.');
  });
  $('#delete-task').addEventListener('click', () => { const id = $('#task-form').elements.namedItem('id').value; askConfirm('Hapus tugas ini?', 'Tugas dan checklist terkait akan dihapus dari agenda.', () => { state.tasks = state.tasks.filter(t => t.id !== id); save(); $('#task-dialog').close(); render(); toast('Tugas dihapus.'); }); });
  document.addEventListener('click', e => {
    const action = e.target.closest('[data-action]');
    if (action) {
      const card = action.closest('[data-id]'), t = state.tasks.find(t => t.id === card.dataset.id), date = card.dataset.occurrence; if (!t) return;
      if (action.dataset.action === 'edit') openTask(t.id);
      if (action.dataset.action === 'schedule') openTask(t.id, '', true);
      if (action.dataset.action === 'toggle') {
        if (!savingAllowed) return toast('Pulihkan cadangan data sebelum mengubah agenda.');
        const done = isDone(t, date);
        if (t.repeat !== 'none' && t.status !== 'done') t.doneDates = done ? t.doneDates.filter(d => d !== date) : [...new Set([...t.doneDates, date])];
        else { t.status = done ? 'todo' : 'done'; t.completedOn = done ? '' : date; }
        save(); render(); toast(done ? 'Tugas ditandai belum selesai.' : 'Tugas ditandai selesai.');
      }
    }
    const next = e.target.closest('[data-next]'); if (next) { const t = state.tasks.find(t => t.id === next.dataset.next); if (t) openTask(t.id, '', !t.date); }
  });
  $('#week-strip').addEventListener('click', e => { const b = e.target.closest('[data-date]'); if (b) { selectedDate = b.dataset.date; render(); } });
  $('#prev-week').addEventListener('click', () => { selectedDate = addDays(selectedDate, -7); render(); }); $('#next-week').addEventListener('click', () => { selectedDate = addDays(selectedDate, 7); render(); });
  $('#go-today').addEventListener('click', () => { selectedDate = today(); render(); });
  $('#agenda-date').addEventListener('change', e => { if (validDate(e.target.value)) { selectedDate = e.target.value; render(); } });
  $('#agenda-sort').addEventListener('change', renderToday);
  $('#agenda-tabs').addEventListener('click', e => { const b = e.target.closest('[data-filter]'); if (b) { agendaFilter = b.dataset.filter; document.querySelectorAll('[data-filter]').forEach(el => el.classList.toggle('selected', el === b)); renderToday(); } });
  ['task-search', 'task-status', 'task-priority'].forEach(id => $(`#${id}`).addEventListener(id === 'task-search' ? 'input' : 'change', renderTasks));
  $('#dismiss-welcome').addEventListener('click', () => { state.settings.welcomeDismissed = true; save(); renderToday(); });
  $('#reminders-enabled').addEventListener('change', e => { state.settings.reminders = e.target.checked; save(); if (!e.target.checked) $('#reminder-banner').hidden = true; });
  $('#daily-reminder-time').addEventListener('change', e => { if (validTime(e.target.value)) { state.settings.dailyTime = e.target.value; delete state.reminded[`${today()}:daily`]; save(); toast('Jam pengingat disimpan.'); } });
  $('#enable-notifications').addEventListener('click', async () => { if (!('Notification' in window)) return; try { await Notification.requestPermission(); renderSettings(); } catch { toast('Notifikasi browser belum bisa diaktifkan. Pengingat di halaman tetap tersedia saat halaman terbuka.'); } });
  $('#test-reminder').addEventListener('click', () => notify('Tes pengingat 🐈', 'Ini contoh pengingat. Jadwal tugasmu tidak berubah.'));
  $('#focus-task').addEventListener('change', e => { timer.taskId = e.target.value; save(); });
  $('#timer-toggle').addEventListener('click', () => { if (timer.end) { timer.remaining = remainingSeconds(); timer.end = null; } else { if (timer.remaining === 0) timer.remaining = timer.minutes * 60; timer.end = Date.now() + timer.remaining * 1000; } save(); updateTimer(); });
  $('#timer-reset').addEventListener('click', () => { timer.end = null; timer.remaining = timer.minutes * 60; save(); updateTimer(); });
  document.querySelectorAll('[data-minutes]').forEach(b => b.addEventListener('click', () => { if (timer.end) return; timer.minutes = Number(b.dataset.minutes); timer.remaining = timer.minutes * 60; save(); updateTimer(); }));
  $('#export-data').addEventListener('click', exportData);
  $('#import-button').addEventListener('click', () => $('#import-data').click());
  $('#import-data').addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    try { if (file.size > 10 * 1024 * 1024) throw new Error('File cadangan terlalu besar. Batas ukurannya 10 MB.'); const scope = KEY; const imported = normalizeState(JSON.parse(await file.text())); if (scope !== KEY) return; askConfirm('Ganti agenda dengan data dari file?', `File berisi ${imported.tasks.length} tugas dan akan mengganti seluruh agenda saat ini. Unduh cadangan dulu jika ingin menyimpan agenda yang sekarang.`, () => { if (scope !== KEY) return; state = imported;  recoveryRaw = ''; timer = { minutes: 25, remaining: 1500, end: null, taskId: '' }; savingAllowed = true; $('#storage-warning').hidden = true; save(true); render(); toast('Agenda berhasil dipulihkan dari file.'); }); }
    catch (error) { toast(error instanceof SyntaxError ? 'File tidak bisa dibaca. Pilih file JSON hasil unduhan cadangan Little Workday.' : error.message); }
    finally { e.target.value = ''; }
  });
  // A second tab must not silently overwrite data already changed in this tab.
  window.addEventListener('storage', e => { if (e.key === KEY) { savingAllowed = false; $('#storage-warning').hidden = false; $('#storage-warning').textContent = 'Agenda diubah lewat tab lain. Unduh cadangan jika ada perubahan yang belum tersimpan, lalu muat ulang halaman sebelum mengedit lagi.'; } });
  function tick() {
    $('#live-clock').textContent = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()).replace('.', ':');
    const day = today(); if (day !== observedDay) { if (selectedDate === observedDay) selectedDate = day; observedDay = day; render(); }
    updateTimer(); checkReminders();
  }
  if (loadWarning) { $('#storage-warning').textContent = loadWarning; $('#storage-warning').hidden = false; }
  window.WorkdayApp = {
    snapshot: () => JSON.parse(JSON.stringify({ version: 1, tasks: state.tasks, settings: state.settings, references: state.references || null })),
    replace: raw => { state = normalizeState(raw); timer = { minutes: 25, remaining: 1500, end: null, taskId: '' };  savingAllowed = true; recoveryRaw = ''; $('#storage-warning').hidden = true; save(true); render(); },
    bindAccount: (id, project) => {
      // Close every surface that might still contain the previous account's data.
      for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
      confirmCallback = null;
      $('#task-form').reset(); $('#task-search').value = ''; $('#toast').hidden = true;
      $('#reminder-banner').hidden = true; $('#storage-warning').hidden = true;
      selectedDate = today();
      ({ key: KEY, storage } = id ? accounts.account(id, project) : accounts.guest(true)); const stored = storage.getItem(KEY); state = stored ? normalizeState(JSON.parse(stored)) : seedState(); timer = { minutes: 25, remaining: 1500, end: null, taskId: '' };  savingAllowed = true; render(); return !!stored; }
  };
  setView(location.hash.slice(1)); render(); if (!loadWarning) save(); tick(); setInterval(tick, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
})();
