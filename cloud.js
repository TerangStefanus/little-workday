/* Supabase Auth + PostgREST. No third-party scripts or privileged keys in the browser. */
(() => {
  'use strict';
  const $ = s => document.querySelector(s), app = window.WorkdayApp;
  const CONFIG = 'little-workday.cloud.config', SESSION = 'little-workday.cloud.session';
  const readJson = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
  let config = window.WORKDAY_CLOUD?.url ? window.WORKDAY_CLOUD : readJson(CONFIG) || { url: '', publishableKey: '' };
  let session = readJson(SESSION), engine = null, debounce, refreshing = null, generation = 0;
  const status = text => { $('#cloud-status').textContent = text; };
  function validateConfig(value) {
    const u = new URL(value.url);
    if (u.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(u.hostname) || u.username || u.password || u.pathname !== '/' || u.search || u.hash) throw new Error('Project URL harus memakai alamat https://…supabase.co dari pengaturan Supabase.');
    const key = value.publishableKey.trim();
    if (key.startsWith('sb_secret_')) throw new Error('Ini secret key. Ganti dengan publishable key agar kunci rahasiamu tidak digunakan di browser.');
    if (!key.startsWith('sb_publishable_')) {
      try { const claims = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); if (claims.role !== 'anon') throw new Error(); }
      catch { throw new Error('Kunci ini belum sesuai. Gunakan publishable key atau anon key lama; jangan gunakan service_role.'); }
    }
    return { url: u.origin, publishableKey: key };
  }
  async function request(path, { method = 'GET', body, token = '', project = config } = {}) {
    const response = await fetch(project.url + path, { method, headers: { apikey: project.publishableKey, 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.msg || data?.message || data?.error_description || data?.error || `HTTP ${response.status}`);
    return data;
  }
  function displayAccount() {
    const logged = !!session;
    $('#cloud-login').hidden = logged; $('#cloud-account').hidden = !logged;
    $('#cloud-verify').hidden = true;
    $('#cloud-user').textContent = logged ? 'Masuk sebagai ' + session.user.email : '';
    $('#cloud-url').value = config.url; $('#cloud-key').value = config.publishableKey;
  }
  async function token() {
    if (!session) throw new Error('Kamu belum masuk. Masuk ke akun untuk menyinkronkan agenda.');
    if (session.expires_at > Date.now() / 1000 + 60) return session.access_token;
    if (!refreshing) {
      const current = session, project = config;
      refreshing = request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: current.refresh_token }, project }).then(data => {
        if (session !== current) throw new Error('Akun yang sedang dipakai sudah berubah. Muat ulang halaman.');
        session = { ...data, expires_at: Date.now() / 1000 + data.expires_in }; localStorage.setItem(SESSION, JSON.stringify(session)); return session.access_token;
      }).finally(() => { refreshing = null; });
    }
    return refreshing;
  }
  async function connect() {
    engine?.close(); engine = null; const run = ++generation;
    config = validateConfig(config);
    const user = await request('/auth/v1/user', { token: await token() });
    if (run !== generation) return;
    session.user = user;
    const hasCache = app.bindAccount(user.id);
    const metaKey = 'little-workday.cloud.meta:' + config.url + ':' + user.id;
    const store = {
      get: async () => { const rows = await request('/rest/v1/workday_agendas?select=revision,payload&user_id=eq.' + user.id, { token: await token() }); return rows[0] || null; },
      put: async (payload, revision) => { const rows = await request('/rest/v1/rpc/save_workday_agenda', { method: 'POST', token: await token(), body: { expected_revision: revision, new_payload: payload } }); return rows[0] || null; }
    };
    engine = new WorkdaySync({ store, read: app.snapshot, apply: app.replace, metadata: readJson(metaKey), persist: meta => localStorage.setItem(metaKey, JSON.stringify(meta)), status, conflict: visible => { $('#cloud-conflict').hidden = !visible; if (visible) $('#cloud-controls').hidden = false; } });
    displayAccount(); $('#cloud-controls').hidden = false;
    await engine.initialize(hasCache); if (run === generation) await engine.sync();
  }
  function clearAccount() {
    ++generation; engine?.close(); engine = null; session = null; localStorage.removeItem(SESSION); app.bindAccount('');
    $('#cloud-conflict').hidden = true; displayAccount(); status('Kamu sudah keluar. Agenda akun disembunyikan, tetapi salinannya masih tersimpan di browser ini.');
  }
  async function action(button, fn) { button.disabled = true; try { await fn(); } catch (error) { status(error.message); } finally { button.disabled = false; } }
  $('#cloud-open').addEventListener('click', () => { $('#cloud-controls').hidden = !$('#cloud-controls').hidden; if (!config.url) $('#cloud-setup').open = true; });
  $('#cloud-config-form').addEventListener('submit', e => { e.preventDefault(); action(e.submitter, async () => {
    const next = validateConfig({ url: $('#cloud-url').value.trim(), publishableKey: $('#cloud-key').value.trim() });
    if (session) throw new Error('Keluar dulu sebelum mengganti project Supabase.');
    config = next; localStorage.setItem(CONFIG, JSON.stringify(config)); $('#cloud-setup').open = false; status('Koneksi disimpan. Masukkan email untuk menerima kode masuk.');
  }); });
  $('#cloud-login').addEventListener('submit', e => { e.preventDefault(); action(e.submitter, async () => {
    config = validateConfig(config);
    await request('/auth/v1/otp', { method: 'POST', body: { email: $('#cloud-email').value.trim(), create_user: true } });
    $('#cloud-verify').hidden = false; status('Kode masuk sudah dikirim. Periksa email, lalu masukkan kodenya di bawah.'); $('#cloud-otp').focus();
  }); });
  $('#cloud-verify').addEventListener('submit', e => { e.preventDefault(); action(e.submitter, async () => {
    const data = await request('/auth/v1/verify', { method: 'POST', body: { email: $('#cloud-email').value.trim(), token: $('#cloud-otp').value.trim(), type: 'email' } });
    session = { ...data, expires_at: Date.now() / 1000 + data.expires_in }; localStorage.setItem(SESSION, JSON.stringify(session)); $('#cloud-otp').value = ''; await connect();
  }); });
  $('#cloud-sync').addEventListener('click', e => action(e.currentTarget, async () => { if (engine?.ready) await engine.sync(); else await connect(); }));
  $('#cloud-logout').addEventListener('click', e => action(e.currentTarget, async () => {
    try { if (session) await request('/auth/v1/logout?scope=local', { method: 'POST', token: await token() }); } finally { clearAccount(); }
  }));
  $('#cloud-use-remote').addEventListener('click', e => action(e.currentTarget, () => engine?.resolve(false)));
  $('#cloud-use-local').addEventListener('click', e => action(e.currentTarget, () => engine?.resolve(true)));
  window.addEventListener('workday-change', () => { engine?.changed(); clearTimeout(debounce); debounce = setTimeout(() => engine?.sync(), 1500); });
  window.addEventListener('online', () => engine?.sync());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) engine?.sync(); });
  // Prevent another tab from continuing under an account that has logged out or changed.
  window.addEventListener('storage', e => { if (e.key === SESSION || e.key === CONFIG) { ++generation; engine?.close(); engine = null; session = null; app.bindAccount(''); displayAccount(); status('Akun atau koneksi diubah lewat tab lain. Muat ulang halaman sebelum melanjutkan.'); } });
  setInterval(() => { if (!document.hidden) engine?.sync(); }, 15000);
  displayAccount();
  if (session && config.url) connect().catch(error => status('Belum bisa terhubung ke akun: ' + error.message + '. Klik Sinkronkan sekarang, atau keluar lalu masuk lagi.'));
})();
