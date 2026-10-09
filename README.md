# Little Workday 🐈 🦆

[Buka aplikasi](https://terangstefanus.github.io/little-workday/)

Pengingat harian untuk kegiatan apa saja: belajar, belanja, olahraga, tagihan, atau tugas yang perlu diselesaikan. Atur jadwal, prioritas, batas waktu, dan pengulangan. Ada checklist dan timer fokus, ditemani kucing serta bebek.

Website bisa dibuka dari HP walaupun PC mati. Repository publik hanya berisi kode dan dua contoh rutinitas umum. Agenda pribadi tidak menjadi bagian dari website atau repository.

## Mode tamu dan akun pribadi

- **Mode tamu:** langsung coba aplikasi tanpa masuk. Data hanya disimpan di tab yang sedang dipakai dan tidak dikirim ke layanan akun. Menutup tab dapat menghapusnya, jadi unduh cadangan jika diperlukan. Mode ini tidak memuat agenda tamu dari versi lama.
- **Akun pribadi:** setelah layanan akun disiapkan, masuk dengan kode dari email. Gunakan email yang sama di PC dan HP untuk membuka agenda yang sama.
- **Akun berbeda:** setiap email mempunyai agenda sendiri. Orang lain dapat menggunakan website dengan emailnya sendiri; agenda kedua akun tidak digabungkan.
- **Sesi masuk:** disimpan di tab ini, tidak diaktifkan otomatis untuk semua tab browser. Reload memverifikasi sesi ke server sebelum membuka agenda akun. Tab baru dimulai sebagai tamu; tab yang diduplikasi atau dipulihkan browser dapat membawa sesi tab sebelumnya.
- **Keluar:** segera menutup agenda, formulir, pesan pengingat, dan timer akun, lalu membuka mode tamu baru. Keluar juga menutup sesi akun yang sama pada tab lain yang sedang terbuka.

Pada perangkat bersama, **keluar sebelum memberikan tab yang sama kepada orang lain**. Salinan agenda akun masih disimpan di browser untuk pemulihan dan perubahan yang belum terkirim. Salinan ini tidak dienkripsi oleh aplikasi; hapus data situs lewat pengaturan browser jika perangkat akan dipakai bersama. File cadangan yang sudah diunduh juga perlu disimpan secara privat.

Login dan sinkronisasi **belum aktif** sebelum project Supabase dihubungkan. Mode tamu tetap bisa digunakan.

## Menyiapkan layanan akun

Lakukan langkah berikut pada project Supabase baru milikmu.

1. Buka [Supabase Dashboard](https://supabase.com/dashboard) dan buat project. Simpan password database secara privat; aplikasi tidak membutuhkan password itu.
2. Buka **SQL Editor**, salin [supabase-setup.sql](supabase-setup.sql), lalu jalankan. Script membuat penyimpanan agenda dan aturan akses per akun. Jalankan pada project baru khusus aplikasi ini.
3. Di **Authentication → Providers / Sign In**, aktifkan **Email**. Pada **Email Templates → Magic Link** dan **Confirm signup**, masukkan `<p>Kode masuk Little Workday: {{ .Token }}</p>` ke isi email. Aplikasi menerima kode 6–10 digit, bukan link masuk.
4. Di **Project Settings → API / API Keys**, salin **Project URL** dan **publishable key** yang diawali `sb_publishable_`. Kunci `anon` lama juga didukung. Jangan gunakan **secret key**, **service_role**, atau password database.
5. Buka website. Klik **Buka akun → Pengaturan koneksi untuk pemilik situs**, tempel URL dan publishable key, lalu pilih **Simpan koneksi**.
6. Masukkan email, klik **Kirim kode masuk**, lalu masukkan kode yang diterima dan klik **Masuk**.
7. Di HP, gunakan project dan email yang sama untuk membuka agendamu. Untuk agenda orang lain, gunakan email yang berbeda.

Agar pengunjung tidak perlu mengatur koneksi sendiri, isi `config.js` dengan Project URL dan **publishable key saja**, lalu unggah ke GitHub. Kedua nilai itu memang boleh digunakan di browser. Pastikan SQL dan aturan akses sudah disiapkan terlebih dahulu.

Pengiriman email bawaan Supabase dibatasi untuk anggota organisasi/project. Untuk alamat lain dan penggunaan rutin, atur **custom SMTP** di Authentication. Jika kode tidak datang, periksa spam, log Auth, dan pengaturan SMTP. Lihat [panduan SMTP Supabase](https://supabase.com/docs/guides/auth/auth-smtp).

Panduan terkait: [kode masuk melalui email](https://supabase.com/docs/guides/auth/auth-email-passwordless), [API keys](https://supabase.com/docs/guides/getting-started/api-keys), dan [aturan akses per akun atau RLS](https://supabase.com/docs/guides/database/postgres/row-level-security). Pemakaian, biaya, dan kemungkinan project dijeda mengikuti paket Supabase.

## Memulihkan agenda lama

1. Di aplikasi yang menyimpan agenda lama, pilih **Pengingat & data → Unduh cadangan (JSON)**. Simpan file secara privat.
2. Di website ini, **masuk ke akunmu sendiri terlebih dahulu**.
3. Pilih **Pengingat & data → Pulihkan dari file**, pilih cadangannya, lalu konfirmasikan setelah memeriksa jumlah tugas.
4. Tunggu sinkronisasi selesai sebelum membuka agenda di perangkat lain.

Cadangan lama tetap didukung. Tugas, jadwal, catatan, dan checklist akan muncul dalam tampilan umum. Metadata tambahan dari format lama disimpan untuk menjaga isi cadangan, tetapi tidak mempunyai menu khusus di website ini.

Agenda tamu dan salinan akun dari versi lama tidak dipindahkan otomatis, agar pengunjung berikutnya tidak membuka data lama tanpa masuk. Data lama tidak dihapus oleh pembaruan ini. Pulihkan melalui cadangan; agenda yang sudah berhasil disinkronkan akan dimuat setelah masuk.

## Sinkronisasi dan pemeriksaan privasi

Perubahan dikirim sekitar 1,5 detik setelah edit. Halaman yang sedang terbuka memeriksa pembaruan setiap sekitar 15 detik. Klik **Sinkronkan sekarang** untuk segera memeriksa. Jika dua perangkat mengedit bersamaan, pilih versi yang ingin dipakai; perubahan belum digabungkan otomatis.

Aturan database menggunakan ID akun terverifikasi, bukan nama yang ditulis di tampilan. Pengunjung tanpa login tidak diberi akses ke tabel agenda. Setelah setup, lakukan pemeriksaan berikut sebelum memasukkan agenda pribadi:

1. Masuk dengan akun A di PC dan HP. Tambahkan satu tugas percobaan, lalu pastikan perubahan muncul di keduanya.
2. Masuk dengan akun B pada browser atau perangkat terpisah. Pastikan tugas A tidak muncul; buat tugas B dan pastikan tugas itu tidak muncul di A.
3. Keluar dari A saat formulir edit atau pengingat terbuka. Pastikan mode tamu tidak menampilkan isinya.
4. Uji aturan database melalui API dengan token A: permintaan untuk `user_id` milik B harus menghasilkan daftar kosong. Percobaan menulis baris B harus ditolak. Permintaan tanpa token pengguna harus ditolak. Fungsi simpan menentukan pemilik dari sesi server.

Pemeriksaan otomatis memakai simulasi penyimpanan dan autentikasi. Login email, aturan database, serta sinkronisasi nyata belum diuji karena project Supabase belum tersedia.

## Pengingat dan menjalankan kode

Biarkan halaman terbuka pada perangkat yang aktif agar pengingat berjalan. GitHub Pages tidak menjalankan pengingat saat browser ditutup. Notifikasi atau email terjadwal saat halaman tertutup belum tersedia.

Aplikasi memakai HTML, CSS, dan JavaScript. Gunakan server statis lokal untuk mencoba kode. Jalankan tes dengan `node --test tests/*.test.cjs`.

Untuk GitHub Pages, pilih **Settings → Pages → Deploy from a branch → main → /(root)**. Unggah hanya isi folder online. Jangan sertakan folder pribadi, cadangan agenda, screenshot data pribadi, atau kredensial.
