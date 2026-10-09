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
      this.status('Perubahan tersimpan di perangkat; menunggu sinkron.');
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
        if (this.remote) this.status('Dua versi agenda ditemukan. Pilih versi di Login & sinkron.');
        else this.status(this.meta.pending ? 'Agenda siap dikirim ke cloud.' : 'Agenda sudah sinkron.');
      } catch (error) { this.ready = true; this.status('Cloud belum bisa dibaca: ' + error.message); throw error; }
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
          if (!row) { this.remote = await this.store.get(); this.conflict(true); this.status('Perangkat lain berubah. Pilih versi sebelum melanjutkan.'); return; }
          this.meta.revision = row.revision;
          this.meta.pending = signature(this.read()) !== sent;
          this.last = signature(this.read()); this.persist(this.meta);
        } else {
          const before = signature(this.read());
          const row = await this.store.get();
          if (this.closed) return;
          if (row && row.revision !== this.meta.revision) {
            this.changed();
            if (this.meta.pending || before !== signature(this.read())) { this.remote = row; this.conflict(true); this.status('Perubahan bersamaan ditemukan. Pilih versi agenda.'); return; }
            this.accept(row);
          }
        }
        this.status(this.meta.pending ? 'Ada perubahan baru yang menunggu sinkron.' : 'Agenda sudah sinkron · ' + new Date().toLocaleTimeString('id-ID'));
      } catch (error) { if (!this.closed) this.status('Belum sinkron: ' + error.message + '. Data perangkat tetap tersedia.'); }
      finally { this.busy = false; }
    }
    async resolve(useLocal) {
      if (!this.remote || this.busy || this.closed) return;
      const row = this.remote;
      if (useLocal) { this.meta.revision = row.revision; this.meta.pending = true; this.persist(this.meta); this.remote = null; this.conflict(false); await this.sync(); }
      else { this.accept(row); this.status('Versi cloud dipakai.'); }
    }
    close() { this.closed = true; this.ready = false; }
  }
  globalThis.WorkdaySync = WorkdaySync;
  if (typeof module !== 'undefined') module.exports = { WorkdaySync };
})();
