const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { WorkdayAccounts } = require('../account-store.js');
function storage() {
  const values = new Map();
  return { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)), removeItem: k => values.delete(k) };
}
test('guest does not inherit an old browser agenda or another tab', () => {
  const local = storage(), first = storage(), second = storage();
  local.setItem('little-workday.online.v1:guest', 'old private agenda');
  const a = new WorkdayAccounts(local, first).guest(), b = new WorkdayAccounts(local, second).guest();
  a.storage.setItem(a.key, 'guest A');
  assert.equal(b.storage.getItem(b.key), null);
  assert.equal(local.getItem('little-workday.online.v1:guest'), 'old private agenda');
});
test('account A and B have separate caches, including across projects', () => {
  const local = storage(), accounts = new WorkdayAccounts(local, storage());
  const a = accounts.account('user-a', 'https://one.supabase.co');
  a.storage.setItem(a.key, 'private agenda A');
  const b = accounts.account('user-b', 'https://one.supabase.co');
  const otherProject = accounts.account('user-a', 'https://two.supabase.co');
  assert.equal(b.storage.getItem(b.key), null);
  assert.equal(otherProject.storage.getItem(otherProject.key), null);
  assert.equal(accounts.account('user-a', 'https://one.supabase.co').storage.getItem(a.key), 'private agenda A');
});
test('leaving an account resets guest data without deleting private backups', () => {
  const local = storage(), accounts = new WorkdayAccounts(local, storage());
  const guest = accounts.guest(), privateScope = accounts.account('user-a', 'https://one.supabase.co');
  guest.storage.setItem(guest.key, 'old guest'); privateScope.storage.setItem(privateScope.key, 'private');
  const next = accounts.guest(true);
  assert.equal(next.storage.getItem(next.key), null);
  assert.equal(privateScope.storage.getItem(privateScope.key), 'private');
});
const SESSION = 'little-workday.cloud.session.v2';
const config = { url: 'https://example.supabase.co', publishableKey: 'sb_publishable_test' };
const session = { user: { id: 'user-a', email: 'a@example.invalid' }, access_token: 'test', refresh_token: 'test', expires_at: Date.now() / 1000 + 3600 };
const flush = () => new Promise(resolve => setImmediate(resolve));
function cloudHarness({ saved, oldSaved, request } = {}) {
  const local = storage(), tab = storage(), nodes = new Map(), windowEvents = {}, bindings = [];
  if (saved) tab.setItem(SESSION, JSON.stringify(saved));
  if (oldSaved) local.setItem('little-workday.cloud.session', JSON.stringify(oldSaved));
  function node(selector) {
    if (!nodes.has(selector)) nodes.set(selector, { value: '', hidden: true, disabled: false, textContent: '', events: {}, addEventListener(name, fn) { this.events[name] = fn; }, scrollIntoView() {}, focus() {} });
    return nodes.get(selector);
  }
  const context = {
    window: { WORKDAY_CLOUD: config, WorkdayApp: { bindAccount: (...args) => { bindings.push(args); return false; }, snapshot: () => ({}), replace() {} }, addEventListener: (name, fn) => { windowEvents[name] = fn; } },
    document: { querySelector: node, addEventListener() {} },
    localStorage: local, sessionStorage: tab, URL, AbortSignal, Date, Math, JSON,
    setInterval() {}, setTimeout() {}, clearTimeout() {},
    fetch: async (url, options) => ({ ok: true, json: async () => request ? request(url, options) : session.user }),
    WorkdaySync: class { async initialize() {} async sync() {} close() {} }
  };
  vm.createContext(context); vm.runInContext(fs.readFileSync(path.join(__dirname, '../cloud.js'), 'utf8'), context);
  return { local, tab, node, bindings, windowEvents };
}
test('old persistent login cannot open a private agenda for the next visitor', async () => {
  const h = cloudHarness({ oldSaved: session }); await flush();
  assert.equal(h.bindings.length, 0);
  assert.equal(h.local.getItem('little-workday.cloud.session'), null);
  assert.equal(h.node('#cloud-account').hidden, true);
});
test('restored session cannot open cached account data before server verification', async () => {
  let release;
  const h = cloudHarness({ saved: session, request: () => new Promise(resolve => { release = resolve; }) });
  await flush(); assert.equal(h.bindings.length, 0); assert.equal(h.node('#cloud-account').hidden, true);
  release(session.user); await flush();
  assert.deepEqual(h.bindings[0], ['user-a', config.url]);
  assert.equal(h.node('#cloud-account').hidden, false);
});
test('logout hides agenda immediately while the server request is pending', async () => {
  let release;
  const h = cloudHarness({ saved: session, request: url => url.includes('/logout') ? new Promise(resolve => { release = resolve; }) : session.user });
  await flush();
  h.node('#cloud-logout').events.click({ currentTarget: h.node('#cloud-logout') });
  assert.deepEqual(h.bindings.at(-1), ['']);
  assert.equal(h.tab.getItem(SESSION), null);
  assert.equal(h.node('#cloud-account').hidden, true);
  await flush(); release(null); await flush();
});
test('late authentication reply after signout cannot reopen private agenda', async () => {
  let release;
  const h = cloudHarness({ saved: session, request: url => url.includes('/user') ? new Promise(resolve => { release = resolve; }) : null });
  await flush();
  h.node('#cloud-logout').events.click({ currentTarget: h.node('#cloud-logout') });
  release(session.user); await flush();
  assert.equal(h.bindings.some(args => args[0] === 'user-a'), false);
  assert.equal(h.node('#cloud-account').hidden, true);
});
test('another account signing out does not close this account; own signout does', async () => {
  const h = cloudHarness({ saved: session }); await flush();
  h.windowEvents.storage({ key: 'little-workday.cloud.signout', newValue: JSON.stringify({ user: 'user-b', project: config.url }) });
  assert.equal(h.node('#cloud-account').hidden, false);
  h.windowEvents.storage({ key: 'little-workday.cloud.signout', newValue: JSON.stringify({ user: 'user-a', project: config.url }) });
  assert.equal(h.node('#cloud-account').hidden, true);
  assert.deepEqual(h.bindings.at(-1), ['']);
});
