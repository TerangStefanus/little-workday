/* Supabase Auth + PostgREST. No third-party scripts or privileged keys in the browser. */
(() => {
  'use strict';
  const $ = s => document.querySelector(s), app = window.WorkdayApp;
  const CONFIG = 'little-workday.cloud.config', SESSION = 'little-workday.cloud.session.v2', SIGNOUT = 'little-workday.cloud.signout';
  const readJson = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
  let config = window.WORKDAY_CLOUD?.url ? window.WORKDAY_CLOUD : readJson(CONFIG) || { url: '', publishableKey: '' };
  // Ignore the old shared-browser login. A new tab starts with a guest agenda.
  localStorage.removeItem('little-workday.cloud.session');
  let session;
  try { session = JSON.parse(sessionStorage.getItem(SESSION)); } catch { session = null; }
  let verified = false, engine = null, debounce, refreshing = null, generation = 0;
  const persistSession = () => sessionStorage.setItem(SESSION, JSON.stringify(session));
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
    const logged = !!session && verified;
    $('#cloud-login').hidden = logged; $('#cloud-account').hidden = !logged;
    $('#cloud-verify').hidden = true;
    $('#cloud-user').textContent = logged ? 'Masuk sebagai ' + session.user.email : '';
    $('#cloud-url').value = config.url; $('#cloud-key').value = config.publishableKey;
    $('#cloud-unavailable').hidden = !!config.url;
    $('#cloud-send').disabled = !config.url;
    document.querySelector('.workspace-label').textContent = logged ? 'AGENDA PRIBADI' : 'MODE TAMU';
    $('#save-status').textContent = logged ? 'Agenda akun · tersimpan di perangkat ini' : 'Mode tamu · tersimpan di tab ini';
  }
  async function token() {
    if (!session) throw new Error('Kamu belum masuk. Masuk ke akun untuk menyinkronkan agenda.');
    if (session.expires_at > Date.now() / 1000 + 60) return session.access_token;
    if (!refreshing) {
      const current = session, project = config;
      refreshing = request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: current.refresh_token }, project }).then(data => {
        if (session !== current) throw new Error('Akun yang sedang dipakai sudah berubah. Muat ulang halaman.');
        session = { ...data, expires_at: Date.now() / 1000 + data.expires_in }; persistSession(); return session.access_token;
      }).finally(() => { refreshing = null; });
    }
    return refreshing;
  }
  async function connect() {
    engine?.close(); engine = null; const run = ++generation;
    config = validateConfig(config);
    const user = await request('/auth/v1/user', { token: await token() });
    if (run !== generation) return;
    session.user = user; verified = true;
    const hasCache = app.bindAccount(user.id, config.url);
    const metaKey = 'little-workday.cloud.meta:' + config.url + ':' + user.id;
    const store = {
      get: async () => { const rows = await request('/rest/v1/workday_agendas?select=revision,payload&user_id=eq.' + user.id, { token: await token() }); return rows[0] || null; },
      put: async (payload, revision) => { const rows = await request('/rest/v1/rpc/save_workday_agenda', { method: 'POST', token: await token(), body: { expected_revision: revision, new_payload: payload } }); return rows[0] || null; }
    };
    engine = new WorkdaySync({ store, read: app.snapshot, apply: app.replace, metadata: readJson(metaKey), persist: meta => localStorage.setItem(metaKey, JSON.stringify(meta)), status, conflict: visible => { $('#cloud-conflict').hidden = !visible; if (visible) $('#cloud-controls').hidden = false; } });
    displayAccount(); $('#cloud-controls').hidden = false;
    await engine.initialize(hasCache); if (run === generation) await engine.sync();
  }
  function clearAccount(broadcast = false) {
    const previous = session;
    ++generation; clearTimeout(debounce); engine?.close(); engine = null; session = null; verified = false;
    sessionStorage.removeItem(SESSION); app.bindAccount('');
    $('#cloud-otp').value = ''; $('#cloud-email').value = '';
    if (broadcast && previous?.user?.id) localStorage.setItem(SIGNOUT, JSON.stringify({ user: previous.user.id, project: config.url, nonce: Date.now() + ':' + Math.random() }));
    $('#cloud-conflict').hidden = true; displayAccount(); status('Kamu sudah keluar. Agenda akun ditutup dan mode tamu dimulai lagi.');
  }
  async function action(button, fn) { button.disabled = true; try { await fn(); } catch (error) { status(error.message); } finally { button.disabled = false; } }
  $('#cloud-open').addEventListener('click', () => { $('#cloud-controls').hidden = !$('#cloud-controls').hidden; });
  $('#account-shortcut').addEventListener('click', () => { $('#cloud-controls').hidden = false; $('#cloud-open').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
  $('#cloud-config-form').addEventListener('submit', e => { e.preventDefault(); action(e.submitter, async () => {
    const next = validateConfig({ url: $('#cloud-url').value.trim(), publishableKey: $('#cloud-key').value.trim() });
    if (session) throw new Error('Keluar dulu sebelum mengganti project Supabase.');
    config = next; localStorage.setItem(CONFIG, JSON.stringify(config)); displayAccount(); $('#cloud-setup').open = false; status('Koneksi disimpan. Masukkan email untuk menerima kode masuk.');
  }); });
  $('#cloud-login').addEventListener('submit', e => { e.preventDefault(); action(e.submitter, async () => {
    config = validateConfig(config);
    const run = generation;
    await request('/auth/v1/otp', { method: 'POST', body: { email: $('#cloud-email').value.trim(), create_user: true } });
    if (run !== generation) return;
    $('#cloud-verify').hidden = false; status('Kode masuk sudah dikirim. Periksa email, lalu masukkan kodenya di bawah.'); $('#cloud-otp').focus();
  }); });
  $('#cloud-verify').addEventListener('submit', e => { e.preventDefault(); action(e.submitter, async () => {
    const run = generation;
    const data = await request('/auth/v1/verify', { method: 'POST', body: { email: $('#cloud-email').value.trim(), token: $('#cloud-otp').value.trim(), type: 'email' } });
    if (run !== generation) return;
    session = { ...data, expires_at: Date.now() / 1000 + data.expires_in }; persistSession(); $('#cloud-otp').value = ''; await connect();
  }); });
  $('#cloud-sync').addEventListener('click', e => action(e.currentTarget, async () => { if (engine?.ready) await engine.sync(); else await connect(); }));
  $('#cloud-logout').addEventListener('click', e => action(e.currentTarget, async () => {
    const previous = session, project = config;
    // Hide account data immediately, even if the sign-out request is slow or offline.
    clearAccount(true);
    if (previous) try { await request('/auth/v1/logout?scope=local', { method: 'POST', token: previous.access_token, project }); }
    catch { status('Kamu sudah keluar dari tab ini. Server belum menerima permintaan keluar; sesi yang tersimpan di tab ini sudah dihapus.'); }
  }));
  $('#cloud-use-remote').addEventListener('click', e => action(e.currentTarget, () => engine?.resolve(false)));
  $('#cloud-use-local').addEventListener('click', e => action(e.currentTarget, () => engine?.resolve(true)));
  window.addEventListener('workday-change', () => { engine?.changed(); clearTimeout(debounce); debounce = setTimeout(() => engine?.sync(), 1500); });
  window.addEventListener('online', () => engine?.sync());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) engine?.sync(); });
  // Prevent another tab from continuing under an account that has logged out or changed.
  window.addEventListener('storage', e => {
    if (e.key === SIGNOUT) {
      let event; try { event = JSON.parse(e.newValue); } catch { return; }
      if (event?.user === session?.user?.id && event?.project === config.url) clearAccount();
    } else if (e.key === CONFIG) {
      clearAccount(); config = window.WORKDAY_CLOUD?.url ? window.WORKDAY_CLOUD : readJson(CONFIG) || { url: '', publishableKey: '' };
      displayAccount(); status('Koneksi diubah lewat tab lain. Masuk lagi untuk melanjutkan.');
    }
  });
  setInterval(() => { if (!document.hidden) engine?.sync(); }, 15000);
  displayAccount();
  if (session && config.url) connect().catch(error => {
    if (!verified) clearAccount();
    status('Belum bisa terhubung ke akun: ' + error.message + (verified ? '. Coba sinkronkan lagi.' : '. Masuk lagi untuk membuka agenda pribadi.'));
  });
})();
