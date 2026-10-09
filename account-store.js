/* Guest data stays in this tab; account caches are scoped to a project and user. */
(() => {
  'use strict';
  class WorkdayAccounts {
    constructor(local, tab) { this.local = local; this.tab = tab; }
    guest(reset = false) {
      const key = 'little-workday.guest.v2';
      if (reset) this.tab.removeItem(key);
      return { key, storage: this.tab };
    }
    account(id, project) {
      if (!/^[a-zA-Z0-9-]{1,100}$/.test(id)) throw new Error('Identitas akun tidak valid.');
      const origin = new URL(project).origin;
      return { key: 'little-workday.account.v2:' + origin + ':' + id, storage: this.local };
    }
  }
  globalThis.WorkdayAccounts = WorkdayAccounts;
  if (typeof module !== 'undefined') module.exports = { WorkdayAccounts };
})();
