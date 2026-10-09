/* Revision-checked synchronization. A stale device never overwrites silently. */
(() => {
  'use strict';
  const signature = value => JSON.stringify(value);
  class WorkdaySync {
    constructor({ store, read, apply, metadata, persist, status, conflict }) {
      Object.assign(this, { store, read, apply, persist, status, conflict });
      this.meta = metadata || { revision: 0, pending: false };
      this.last = signature(read()); this.busy = false; this.ready = false; this.remote = null; this.closed = false;
    }
    changed() {
      if (!this.ready || this.closed) return;
      const next = signature(this.read());
      if (next === this.last) return;
      this.last = next; this.meta.pending = true; this.persist(this.meta);
      this.status('Perubahan tersimpan di perangkat ini dan belum terkirim ke akunmu.');
    }
    accept(row) {
      this.ready = false;
      this.apply(row.payload);
      this.last = signature(this.read());
      this.meta = { revision: row.revision, pending: false };
      this.persist(this.meta); this.remote = null; this.conflict(false); this.ready = true;
    }
    async initialize(hasCache) {
      if (this.closed) return;
      this.busy = true;
      const before = signature(this.read());
      try {
        const row = await this.store.get();
        if (this.closed) return;
        // Preserve edits made while the initial network request was in progress.
        const edited = before !== signature(this.read());
        if (row && !hasCache && !edited) this.accept(row);
        else if (row && signature(row.payload) === signature(this.read())) { this.meta = { revision: row.revision, pending: false }; this.persist(this.meta); }
        else if (row && (row.revision !== this.meta.revision || edited)) { this.remote = row; this.conflict(true); }
        else if (!row || edited) { this.meta.pending = true; this.persist(this.meta); }
        this.last = signature(this.read()); this.ready = true;
        if (this.remote) this.status('Agenda di perangkat dan akunmu berbeda. Pilih agenda yang ingin dipakai lewat Masuk & sinkronisasi.');
        else this.status(this.meta.pending ? 'Agenda siap disimpan ke akunmu.' : 'Agenda sudah sama dengan yang tersimpan di akunmu.');
      } catch (error) { this.ready = true; this.status('Agenda dari akun belum bisa dimuat: ' + error.message); throw error; }
      finally { this.busy = false; }
    }
    async sync() {
      if (!this.ready || this.busy || this.remote || this.closed) return;
      this.changed(); this.busy = true;
      try {
        if (this.meta.pending) {
          const payload = this.read(), sent = signature(payload);
          const row = await this.store.put(payload, this.meta.revision);
          if (this.closed) return;
          if (!row) { this.remote = await this.store.get(); this.conflict(true); this.status('Agenda diubah dari perangkat lain. Pilih agenda yang ingin dipakai sebelum melanjutkan.'); return; }
          this.meta.revision = row.revision;
          this.meta.pending = signature(this.read()) !== sent;
          this.last = signature(this.read()); this.persist(this.meta);
        } else {
          const before = signature(this.read());
          const row = await this.store.get();
          if (this.closed) return;
          if (row && row.revision !== this.meta.revision) {
            this.changed();
            if (this.meta.pending || before !== signature(this.read())) { this.remote = row; this.conflict(true); this.status('Agenda diubah di dua perangkat. Pilih agenda yang ingin dipakai.'); return; }
            this.accept(row);
          }
        }
        this.status(this.meta.pending ? 'Ada perubahan baru yang belum terkirim ke akunmu.' : 'Terakhir disinkronkan · ' + new Date().toLocaleTimeString('id-ID'));
      } catch (error) { if (!this.closed) this.status('Sinkronisasi belum berhasil: ' + error.message + '. Agenda di perangkat ini tetap tersimpan.'); }
      finally { this.busy = false; }
    }
    async resolve(useLocal) {
      if (!this.remote || this.busy || this.closed) return;
      const row = this.remote;
      if (useLocal) { this.meta.revision = row.revision; this.meta.pending = true; this.persist(this.meta); this.remote = null; this.conflict(false); await this.sync(); }
      else { this.accept(row); this.status('Agenda dari akun sudah dimuat di perangkat ini.'); }
    }
    close() { this.closed = true; this.ready = false; }
  }
  globalThis.WorkdaySync = WorkdaySync;
  if (typeof module !== 'undefined') module.exports = { WorkdaySync };
})();
