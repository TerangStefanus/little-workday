# Little Workday 🐈 🦆

Agenda harian HTML/CSS/JavaScript dengan kucing, bebek, prioritas, checklist berulang, timer fokus, dan backup. Hosting GitHub Pages tetap dapat diakses dari HP saat PC mati.

**Website:** https://terangstefanus.github.io/little-workday/

Kode publik ini memulai agenda dengan dua rutinitas umum. Data pekerjaan, katalog SoW, spreadsheet, dan chat pribadi tidak disertakan dalam repository. Semua aset memakai path relatif agar bekerja di subfolder GitHub Pages.

## Mengaktifkan login dan sinkron PC/HP

Integrasi tersedia, tetapi belum ada backend yang dihubungkan. Buat project Supabase milikmu dahulu; pengaturan berikut dilakukan sekali.

1. Buka [Supabase Dashboard](https://supabase.com/dashboard), buat project baru, dan simpan password database secara privat. Jangan menaruhnya dalam repository atau konfigurasi browser.
2. Di **SQL Editor**, jalankan isi [supabase-setup.sql](supabase-setup.sql) pada project baru. Script membuat tabel `workday_agendas`, Row Level Security per akun, dan fungsi simpan dengan pemeriksaan revisi. Script bukan untuk SQL Server kantor.
3. Di **Authentication → Providers / Sign In**, aktifkan Email. Pada **Email Templates → Magic Link**, gunakan kode di isi email: `<p>Kode login Little Workday: {{ .Token }}</p>`. Aplikasi memakai kode email, sehingga tidak memerlukan callback magic-link. Atur panjang OTP 6–10 digit jika opsi tersedia.
4. Di **Project Settings → API / API Keys**, salin **Project URL** dan **publishable key** (`sb_publishable_...`). Legacy `anon` key juga didukung. **Jangan gunakan secret key atau service_role.** API key publik aman hanya jika aturan RLS sudah diterapkan; jangan melewati langkah SQL.
5. Di website, klik **Login & sinkron → Hubungkan project Supabase**, masukkan URL dan publishable key, lalu simpan. Masukkan email, kirim kode, dan masuk menggunakan kode dari email.
6. Lakukan langkah koneksi dan login yang sama di HP dengan project dan email yang sama. Konfigurasi koneksi disimpan per browser. Jika ingin otomatis untuk semua perangkat, isi `config.js` dengan URL dan **publishable key saja**, lalu commit perubahan.
7. Perubahan otomatis dikirim sekitar 1,5 detik setelah edit. Perangkat lain mengambil perubahan sekitar 15 detik saat halaman terbuka, atau lewat **Sinkron sekarang**. Saat dua perangkat mengedit bersamaan, aplikasi menahan penimpaan dan meminta pilihan versi. Ekspor backup sebelum memilih versi karena aplikasi belum menggabungkan konflik per kolom.

Supabase dapat membatasi pengiriman email bawaan, membatasi penerima, memerlukan SMTP untuk penggunaan biasa, atau menjeda project yang tidak aktif sesuai paket. Ikuti keterangan Dashboard; jika kode tidak datang, cek log Auth, spam, serta konfigurasi SMTP. Penggunaan dan biaya mengikuti paket layanan yang kamu pilih. Panduan resmi: [email OTP](https://supabase.com/docs/guides/auth/auth-email-passwordless), [API keys](https://supabase.com/docs/guides/getting-started/api-keys), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Memindahkan data dari aplikasi lokal

1. Buka aplikasi lokal versi terbaru dengan browser yang biasa digunakan.
2. **Pengingat & backup → Ekspor backup JSON**. Backup mencakup tugas, deadline, checklist, serta katalog SoW dan snapshot spreadsheet. Simpan file ini secara privat; jangan commit atau unggah ke repository publik.
3. Di website online, **login terlebih dahulu**, kemudian **Impor backup** dan konfirmasi penggantian agenda. Setelah sinkron, buka HP dan login dengan akun yang sama.
4. Spreadsheet dan katalog adalah snapshot yang diimpor. Perubahan Google Sheets/Codex tidak otomatis dibaca, dan aplikasi tidak mengubah sumber tersebut. Link chat Codex memerlukan aplikasi/akun yang sesuai; path lokal SoW tidak menjadi dokumen web.

Setiap akun punya cache browser terpisah. Keluar menyembunyikan agenda akun tetapi tidak menghapus cache atau backup lokal. Pada perangkat bersama, keluar lalu hapus data situs melalui pengaturan browser. Data disimpan di Supabase project yang kamu hubungkan; akses ditentukan oleh RLS, bukan password halaman HTML.

## Pengingat

Hosting tidak menjalankan scheduler atau push otomatis. Pengingat yang ada hanya bekerja saat halaman terbuka di perangkat yang aktif. Push/email terjadwal saat browser ditutup memerlukan backend scheduler dan layanan notifikasi terpisah; fitur tersebut belum diterapkan.

## Menjalankan dan memeriksa kode

Tidak perlu bundler. Buka `index.html`, atau jalankan server statis lokal untuk pengujian. Tests: `node tests/sync.test.cjs`. Pengujian ini memakai fake store; login, email delivery, dan RLS harus diverifikasi pada project Supabase yang sudah diaktifkan sebelum mengandalkan sinkronisasi.

GitHub Pages: **Settings → Pages → Deploy from a branch → main → /(root)**. `.nojekyll` membuat aset disajikan langsung. Upload hanya isi folder online ini; jangan upload folder kerja kantor, backup JSON, screenshot berisi pekerjaan, atau kredensial.
