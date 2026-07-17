# 📖 Panduan Penggunaan Sistem (User Guide) - Workflow Email Ticketing System
*Untuk PIC Operasional & Administrator Sistem*

Selamat datang di **Workflow Email Ticketing System**! Dokumen ini dirancang secara komprehensif untuk membantu Anda (PIC) dalam mengoperasikan, mengelola, serta memaksimalkan efisiensi penanganan email masuk menggunakan kecerdasan buatan (**AI Operational Copilot**) bertenaga NVIDIA API.

---

## 📌 1. Pendahuluan & Konsep Utama

Aplikasi ini mengotomatiskan proses penanganan email masuk dari klien maupun server perbankan dengan alur kerja pintar:
1. **Syncing & Fetching**: Menarik pesan email dari server POP3 secara berkala (otomatis setiap 3 menit atau manual melalui tombol).
2. **AI Analysis (NVIDIA AI)**: Setiap email dianalisis isinya untuk mendeteksi ringkasan (Summary), urgensi, kebutuhan tindakan, dan rekomendasi penempatan folder operasional secara instan.
3. **Smart Actions**: Memungkinkan Anda untuk mengonfirmasi penempatan folder operasional, mengubah rekomendasi, dan membuat aturan filter otomatis (*Automation Filter Routing*) secara langsung hanya dalam beberapa klik.

---

## 🚀 2. Panduan Fitur Utama & Cara Penggunaan

### 📥 2.1. Panel Inbox & Monitoring Real-time
Saat pertama kali membuka aplikasi, Anda akan disuguhkan oleh **Inbox Utama**:
* **Daftar Email**: Menampilkan daftar email masuk lengkap dengan subjek, pengirim, tanggal, status pembacaan, kategori, serta level urgensi (**High** / **Medium** / **Low** / **Routine**).
* **Indikator Urgensi Warna**:
  * 🔴 **High** / **Peringatan**: Memerlukan tindakan mendesak (misal: order droping tunai, limit saldo, geofence bermasalah).
  * 🟡 **Medium**: Memerlukan pemantauan berkala.
  * 🟢 **Low** / 🔵 **Routine**: Bersifat informasional/notifikasi sistem rutin.
* **Sync Button**: Klik tombol **"Sync Inbox"** di pojok kanan atas untuk menarik email terbaru seketika dari server POP3.

---

### 💡 2.2. Detail Analisis AI & "Smart Apply"
Ketika Anda mengklik salah satu email di daftar inbox, panel kanan akan menampilkan detail email lengkap beserta **AI Operational Copilot Pane**:

#### **A. Tampilan Analisis AI**
* **Summary (Ringkasan)**: Ringkasan singkat isi email dalam 1-2 kalimat bahasa Indonesia yang langsung menjelaskan inti permintaan.
* **Action Required (Tindakan Diperlukan)**: Indikator cepat apakah Anda harus membalas/memproses email ini atau sekadar membaca.
* **Suggested Folder**: Folder induk (Parent) dan folder anak (Child) tujuan yang disarankan secara pintar oleh AI (Contoh: `Bank Maybank / Collection`).

#### **B. Tombol "Smart Apply" (Satu-Klik Terapkan)**
* Jika rekomendasi AI sudah sesuai, klik tombol **"Smart Apply"**.
* **Efek Otomatis**:
  1. Sistem akan langsung memindahkan email ke folder dan subfolder tersebut secara permanen.
  2. Status penting (*is_important*) otomatis aktif apabila level urgensi dinilai **High**.
  3. Data tersinkronisasi instan ke database SQLite lokal dan Cloud Supabase.

#### **C. Tombol "Edit Suggestion" (Penyesuaian Fleksibel)**
Jika Anda ingin menyesuaikan hasil analisis AI sebelum menerapkannya:
1. Klik tombol **"Edit Suggestion"**.
2. Sebuah jendela pop-up (**Modal**) akan muncul yang menampilkan form isian:
   * Mengubah nama folder induk (Parent) & anak (Child) tujuan.
   * Menyesuaikan tag/kategori atau level urgensi.
   * Mengedit isi teks ringkasan (*Summary*) agar lebih presisi.
3. **Automasi Filter Routing (Opsional)**:
   * Centang opsi **"Create automated Filter Rule from this suggestion"**.
   * Anda dapat memasukkan kriteria filter (misal: pengirim berisi domain `@bankmaybank.co.id`).
   * Jika aktif, di masa mendatang semua email masuk dari pengirim tersebut akan **otomatis** masuk ke folder bersangkutan tanpa perlu persetujuan manual lagi!
4. Klik **"Apply Suggestion"** untuk menyimpan perubahan.

---

## ⚙️ 3. Menu Pengaturan (Settings Panel)

Klik menu **"Settings"** di bilah navigasi kiri untuk masuk ke halaman konfigurasi sistem:

### 🔍 3.1. Custom Filter Rules
Halaman untuk mengelola aturan filter otomatis yang telah Anda buat:
* Anda dapat melihat, membuat baru, atau menghapus aturan filter.
* Aturan mencakup kriteria pengirim, kata kunci subjek, atau kata kunci isi pesan, serta menetapkan ke folder tujuan mana email tersebut harus diarahkan.

### 🔌 3.2. API Integrations
Mengatur parameter integrasi API:
* **CIT API Workflow**: Mengatur endpoint alur kerja otomatisasi Cash In Transit (CIT) untuk perbankan.

### 📧 3.3. Mail & DB Config
Mengonfigurasi parameter koneksi server POP3 (Host, Port, Username, Password, SSL) serta detail integrasi cloud database Supabase.

### 🕒 3.4. Historical Data Backfill (PENTING UNTUK TRANSISI)
Fitur khusus bagi PIC saat pertama kali melakukan migrasi atau jika terdapat data email lama yang belum teranalisis AI:
1. Klik tab **"Data Backfill"**.
2. Klik tombol **"Fetch & Process Historical Data"**.
3. **Logika Otomatisasi Sistem**:
   * Sistem akan memindai database dan mencari semua email lama yang belum memiliki ringkasan/analisis AI.
   * Setiap data diproses secara mendalam menggunakan model AI NVIDIA.
   * Jika isi email kosong atau terlalu pendek (kurang dari 10 karakter), sistem secara cerdas akan langsung memberikan status aman **"Data historis tidak terbaca jelas"** dan status tindakan sebagai `false` (Routine) untuk menghemat kuota API Anda.
4. Setelah selesai, sistem akan memunculkan laporan visual berisi jumlah data yang **Sukses**, **Gagal/Fallback**, dan **Skipped** (Dilewati).

---

## ⚠️ 4. Penanganan Masalah (Troubleshooting) & Tips Operasional

* **Apa yang harus dilakukan jika tombol "Sync Inbox" gagal koneksi?**
  * Periksa konfigurasi POP3 Anda pada menu **Settings > Mail & DB Config**. Pastikan port dan host server email Anda sudah benar dan aktif.
* **Mengapa hasil AI bertuliskan "AI sedang tidak tersedia" atau "Routine"?**
  * Ini menandakan koneksi internet atau kuota NVIDIA API Key sedang mengalami kendala/limitasi (*rate limiting*). 
  * **Tenang saja!** Sistem dilengkapi proteksi tingkat tinggi (*graceful fallback*) sehingga email tetap tersimpan dengan aman di database Anda dan tidak akan hilang. Anda dapat melakukan pemindaian ulang kapan saja menggunakan fitur **Historical Data Backfill** di atas setelah koneksi pulih.
* **Kapan saya harus mencentang opsi Filter Otomatis saat mengedit saran?**
  * Gunakan untuk pengirim email rutin (seperti notifikasi otomatis perbankan harian). Ini akan sangat memotong waktu kerja harian Anda karena sistem akan merutekannya secara instan tanpa intervensi manual lagi di masa mendatang.

---

*Terima kasih atas dedikasi Anda dalam menjaga kelancaran operasional ticketing! Jika ada kendala sistem lebih lanjut, silakan hubungi tim administrator IT.*
