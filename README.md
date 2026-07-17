# Workflow Email Ticketing System

Sistem manajemen dan otomasi ticketing email berbasis web (Full-Stack React + Express) yang secara dinamis menarik pesan masuk dari server POP3, menganalisis isi email secara real-time dengan model bahasa tingkat lanjut (LLM), mengklasifikasikan kategori operasional, serta menyinkronkan data secara andal ke database lokal (SQLite) dan cloud (Supabase).

Aplikasi ini dilengkapi dengan asisten cerdas **AI Operational Copilot** bertenaga NVIDIA API (`thinkingmachines/inkling`) untuk menyaring informasi penting, menandai kebutuhan tindakan tindak lanjut, mengidentifikasi level urgensi secara otomatis, dan memfasilitasi integrasi alur kerja lanjutan.

---

## 🏗️ Alur Proses Sistem (System Process Flow)

Sistem ini berjalan secara berkesinambungan melalui interaksi komponen-komponen utama sebagai berikut:

```
+--------------------------------------------------------------------------+
|                       POP3 Mail Server / Client MBOX                     |
+--------------------------------------------------------------------------+
                                     |
                                     v [Fetch / Sync]
+--------------------------------------------------------------------------+
|                       Background Cron Worker / POP3 API                  |
+--------------------------------------------------------------------------+
                                     |
                         +-----------+-----------+
                         |                       |
                         v                       v
            [Email Body & Subject]        [API Workflow Trigger]
                         |                       |
                         v                       v
+----------------------------------+   +-----------------------------------+
|     NVIDIA AI API (Copilot)      |   |        CIT API Automation         |
|   (thinkingmachines/inkling)     |   |       (Workflow Eksternal)        |
+----------------------------------+   +-----------------------------------+
                         |                               |
        [Structured JSON Result]                 [Workflow Log]
                         |                               |
                         +-----------+-----------+
                                     |
                                     v [Merge Payload]
+--------------------------------------------------------------------------+
|                      SQLite & Supabase Database Sync                     |
|            (Double-Write Engine dengan Fallback Otomatis)                |
+--------------------------------------------------------------------------+
                                     |
                                     v [SSE / Real-time Broadcast]
+--------------------------------------------------------------------------+
|                         React Frontend Control UI                        |
|              - Real-time Inbox           - Custom Filter Engine          |
|              - AI Insight Copilot Pane   - Retroactive Scan Panel        |
+--------------------------------------------------------------------------+
```

### Penjelasan Tahapan Alur Kerja:

1. **Sinkronisasi Otomatis & Manual (POP3 Sync):**
   * Cron background scheduler (`src/cron.ts`) berjalan setiap 3 menit untuk menarik email terbaru dari server POP3 yang terkonfigurasi.
   * Pengguna juga dapat memicu sinkronisasi secara manual langsung dari panel control UI.

2. **Analisis Berbasis AI (NVIDIA API Integration):**
   * Setiap email baru yang masuk dikirim ke fungsi `syncAndAnalyzeEmail` dalam `database-service.ts`.
   * Sistem menghubungi NVIDIA API melalui model `thinkingmachines/inkling` dengan prompt sistem khusus untuk mengekstrak informasi terstruktur dalam format JSON.
   * Jika NVIDIA API gagal (misalnya karena batas limit/rate limit), sistem secara otomatis menangani error (graceful fallback) dengan mencatat log khusus di terminal dan tetap memasukkan email dengan status rutin agar operasional sistem tidak terganggu.

3. **Otomatisasi Alur Kerja (CIT API Service):**
   * Jika email yang masuk berkaitan dengan sistem order perbankan, sistem secara otomatis memicu `triggerCitApiWorkflow` untuk memproses data transaksi dan merekam riwayat eksekusi alur kerja.

4. **Penyimpanan Ganda Berkelanjutan (Dual-Database Sync):**
   * Data email yang telah digabungkan dengan output terstruktur AI (Summary, Action Required, Urgency Level, Suggested Tag) disimpan secara lokal di database **SQLite** (`emails.db`) serta disinkronkan langsung ke cloud database **Supabase**.

5. **Antarmuka Real-time (React Frontend):**
   * Setiap kali email baru berhasil diproses, server memancarkan event langsung ke klien melalui *Server-Sent Events (SSE)* untuk pembaruan tampilan instan tanpa perlu memuat ulang halaman.

---

## 🚀 Fitur Utama

* **AI Operational Assistant Copilot:** Menganalisis subjek dan isi email secara instan untuk mendeteksi tindakan yang diperlukan, menyusun ringkasan (summary) cerdas dalam Bahasa Indonesia, serta memberikan label urgensi tinggi/sedang/rendah secara real-time.
* **Integrasi NVIDIA AI Chat Completion:** Menghubungkan library `openai` resmi dengan endpoint NVIDIA (`https://integrate.api.nvidia.com/v1`) secara stabil dan aman menggunakan variabel lingkungan.
* **POP3 Client Integration:** Mendukung pengambilan email real-time menggunakan modul POP3 client yang dapat dikustomisasi parameternya di halaman pengaturan.
* **Filter Dinamis & Pemindaian Retroaktif:** Pengguna dapat membuat aturan filter berbasis kata kunci atau kondisi pengirim, serta menjalankannya secara retroaktif untuk mengelompokkan ribuan email yang sudah tersimpan sebelumnya.
* **Tampilan Monitoring Real-time:** Menampilkan status log sistem di bagian terminal secara presisi untuk setiap pemrosesan email masuk:
  `[AI Copilot] Email processed: [Subject Email] | Category: [Hasil AI]`

---

## 🛠️ Stack Teknologi

* **Frontend:** React 18, Vite, Tailwind CSS, Lucide Icons, Framer Motion (untuk animasi transisi antarmuka).
* **Backend:** Node.js Express Server, tsx, esbuild.
* **Database:** SQLite (penyimpanan lokal cepat) & Supabase Client (untuk singkronisasi cloud).
* **AI Integrasi:** SDK `openai` resmi dikonfigurasi menggunakan endpoint NVIDIA API dan model `thinkingmachines/inkling`.

---

## 📋 Variabel Lingkungan (.env)

Buat file `.env` di direktori utama proyek Anda dan isi nilai berikut untuk mengaktifkan koneksi database dan AI:

```env
# Koneksi Supabase Cloud (Opsional)
SUPABASE_URL=your_supabase_project_url
SUPABASE_KEY=your_supabase_anon_key

# Kunci API NVIDIA (Wajib untuk Analisis Cerdas AI)
NVIDIA_API_KEY=your_nvidia_api_key_here
```

---

## 📦 Panduan Instalasi dan Menjalankan Proyek

### 1. Instalasi Dependensi
Pastikan Anda memiliki Node.js terinstal pada sistem Anda, kemudian jalankan:
```bash
npm install
```

### 2. Menjalankan Server Pengembangan (Dev Mode)
Untuk memulai server pengembangan Express + Vite secara bersamaan di port `3000`:
```bash
npm run dev
```
Setelah server menyala, buka browser Anda dan navigasikan ke: `http://localhost:3000`

### 3. Membangun Proyek untuk Produksi (Build & Bundling)
Untuk memaketkan aplikasi frontend dan mengompilasi file backend TypeScript menjadi satu file produksi optimal:
```bash
npm run build
```

### 4. Menjalankan dalam Mode Produksi
Jalankan aplikasi hasil kompilasi produksi dengan perintah:
```bash
npm run start
```

---

## ⚙️ Logika Penanganan Kesalahan (Error Handling & Robustness)

Sistem dirancang dengan tingkat ketahanan tinggi terhadap gangguan jaringan atau layanan API eksternal:
* Jika API NVIDIA mengalami timeout atau pembatasan kuota (*rate limit*), sistem menangani error secara tertutup, menulis pesan peringatan `[AI Copilot] AI sedang tidak tersedia` ke log terminal, dan melanjutkan penyimpanan email ke database dengan nilai aman default (`action_required: false` dan `urgency_level: "Routine"`).
* Sinkronisasi data ke database lokal menggunakan skema SQLite yang kokoh dan tahan terhadap gangguan koneksi internet, sementara sinkronisasi Supabase akan dicoba secara asinkron dengan pesan peringatan di terminal apabila server eksternal offline.
