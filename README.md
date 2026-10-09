# Little Workday 🐈 🦆

[Buka aplikasi](https://terangstefanus.github.io/little-workday/)

Little Workday membantu Terang mengatur tugas, prioritas, jadwal, dan deadline. Ada checklist untuk tugas berulang, timer fokus, serta pengingat saat halaman terbuka. Kucing dan bebek tetap menemani di setiap halaman.

Website di GitHub Pages bisa dibuka dari HP saat PC mati. Kamu bisa langsung menambahkan tugas; untuk sementara, data tersimpan di browser yang dipakai. Agar agenda di PC dan HP sama, hubungkan Supabase lalu masuk dengan akun yang sama.

Repository ini hanya berisi kode aplikasi dan dua contoh rutinitas. Data pekerjaan kantor, dokumen SoW, isi spreadsheet, dan link chat pribadi tidak disertakan.

## Menyiapkan Supabase

Fitur masuk dan sinkronisasi sudah disiapkan, tetapi belum aktif sebelum project Supabase dihubungkan. Ikuti langkah berikut pada project baru milikmu.

1. Buka [Supabase Dashboard](https://supabase.com/dashboard) dan buat project. Simpan password database secara privat; aplikasi tidak memerlukan password itu.
2. Buka **SQL Editor**, salin isi [supabase-setup.sql](supabase-setup.sql), lalu jalankan. Script membuat tabel agenda dan aturan akses agar setiap akun hanya bisa membaca serta mengubah datanya sendiri. Jalankan pada project Supabase baru, bukan database SQL Server kantor.
3. Di **Authentication → Providers / Sign In**, aktifkan **Email**. Pada **Email Templates → Magic Link** dan **Confirm signup**, masukkan kode ini ke isi email: `<p>Kode masuk Little Workday: {{ .Token }}</p>`. Template signup digunakan saat akun belum ada. Aplikasi menerima kode 6–10 digit dari email, bukan link masuk.
4. Di **Project Settings → API / API Keys**, salin **Project URL** dan **publishable key** yang diawali `sb_publishable_`. Kunci `anon` lama juga didukung. Jangan gunakan **secret key**, **service_role**, atau password database. Pastikan langkah SQL sudah selesai; kunci publik tetap memerlukan aturan akses data yang benar.
5. Buka Little Workday. Klik **Masuk & sinkronisasi → Hubungkan Supabase**, tempel Project URL dan publishable key, lalu pilih **Simpan koneksi**.
6. Masukkan email dan klik **Kirim kode masuk**. Periksa email, masukkan kodenya, lalu klik **Masuk**.
7. Ulangi langkah koneksi dan masuk di HP. Gunakan project serta email yang sama dengan PC.

Pengaturan koneksi disimpan per browser. Jika ingin koneksi langsung tersedia di semua perangkat, isi `config.js` dengan Project URL dan **publishable key saja**, lalu unggah perubahan ke GitHub. Jangan memasukkan kunci rahasia.

Untuk mencoba pengiriman email bawaan Supabase, pakai email anggota organisasi/project Supabase kamu. Pengiriman bawaan dibatasi untuk anggota tim dan jumlah emailnya terbatas. Untuk alamat lain atau penggunaan rutin, atur **custom SMTP** di Authentication. Jika kode tidak datang, periksa folder spam, log Auth, dan pengaturan SMTP. Lihat [panduan SMTP Supabase](https://supabase.com/docs/guides/auth/auth-smtp).

Pemakaian, biaya, serta kemungkinan project dijeda mengikuti paket Supabase yang dipilih. Panduan terkait: [kode masuk lewat email](https://supabase.com/docs/guides/auth/auth-email-passwordless), [API keys](https://supabase.com/docs/guides/getting-started/api-keys), dan [aturan akses data atau RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Membawa agenda dari aplikasi lokal

1. Buka aplikasi lokal terbaru melalui browser yang biasa digunakan.
2. Pilih **Pengingat & data → Unduh cadangan (JSON)**. File menyimpan tugas, jadwal, deadline, checklist, pengaturan, serta referensi SoW dan spreadsheet. File ini berisi data pekerjaanmu, jadi simpan secara privat dan jangan unggah ke repository publik.
3. Di website online, **masuk ke akun terlebih dahulu**. Pilih **Pengingat & data → Pulihkan dari file**, lalu pilih file tadi. Konfirmasikan penggantian agenda setelah memeriksa jumlah tugasnya.
4. Tunggu sampai status menunjukkan sinkronisasi selesai. Buka website di HP dan masuk dengan akun yang sama untuk melihat agendanya.

Referensi spreadsheet dan SoW adalah salinan dari file cadangan. Aplikasi tidak membaca perubahan Google Sheets atau Codex secara otomatis dan tidak mengubah sumber aslinya. Link chat Codex memerlukan aplikasi serta akun yang sesuai. Lokasi file SoW di PC juga tidak otomatis menjadi dokumen yang bisa dibuka dari HP.

## Cara sinkronisasi bekerja

Saat terhubung ke internet, perubahan dikirim ke akunmu sekitar 1,5 detik setelah edit. PC atau HP yang membuka halaman akan memeriksa pembaruan sekitar setiap 15 detik. Klik **Sinkronkan sekarang** jika ingin segera memeriksa.

Jika dua perangkat mengedit bersamaan, aplikasi meminta kamu memilih agenda yang akan dipakai. Perubahan belum digabungkan otomatis. Unduh cadangan sebelum memilih jika kedua versi masih diperlukan.

Setiap akun memiliki salinan data tersendiri di browser. Keluar menyembunyikan agenda akun, tetapi tidak menghapus salinan atau file cadangan yang sudah diunduh. Pada perangkat bersama, keluar lalu hapus data situs melalui pengaturan browser. Agenda online disimpan di project Supabase yang kamu hubungkan, dengan akses per akun melalui RLS.

## Pengingat

Biarkan halaman terbuka di perangkat yang aktif agar pengingat berjalan. GitHub Pages tidak menjalankan pengingat saat browser ditutup. Notifikasi atau email terjadwal yang tetap dikirim saat halaman ditutup belum tersedia.

## Menjalankan dan memeriksa kode

Aplikasi memakai HTML, CSS, dan JavaScript tanpa bundler. Buka `index.html` atau gunakan server statis lokal. Jalankan pengujian dengan `node --test tests/sync.test.cjs`.

Pengujian memakai penyimpanan simulasi. Setelah Supabase disiapkan, uji masuk lewat email, aturan akses antar-akun, dan sinkronisasi pada dua perangkat sebelum mengandalkannya untuk pekerjaan sehari-hari.

Untuk GitHub Pages, pilih **Settings → Pages → Deploy from a branch → main → /(root)**. File `.nojekyll` membuat aset disajikan langsung. Unggah hanya isi folder online; jangan sertakan folder kerja kantor, file cadangan, screenshot pekerjaan, atau kredensial.
