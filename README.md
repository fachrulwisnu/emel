# 🤖 AI Operational Assistant Copilot (CIT & ATM Ticketing System)

[![React Version](https://img.shields.io/badge/Frontend-React%2018%20%2B%20Vite-blue?style=for-the-badge&logo=react)](https://react.dev/)
[![Node.js Version](https://img.shields.io/badge/Backend-Node.js%20Express-green?style=for-the-badge&logo=node.js)](https://nodejs.org/)
[![Database Cloud](https://img.shields.io/badge/Database-Supabase%20%2B%20SQLite-darkgreen?style=for-the-badge&logo=supabase)](https://supabase.com/)
[![LLM Models](https://img.shields.io/badge/AI%20Core-NVIDIA%20NIM%20%2B%20Moonshot-orange?style=for-the-badge&logo=nvidia)](https://www.nvidia.com/)

Sistem automasi ticketing berbasis email tingkat lanjut yang dirancang khusus untuk memproses pesanan **Cash In Transit (CIT)** dan pengisian uang tunai **ATM** secara cerdas, asinkron, dan real-time.

---

## 📌 1. Project Overview (Ikhtisar Proyek)

**AI Operational Assistant Copilot** mengautomasi alur kerja manual pengolahan email operasional bernilai tinggi. Sistem secara otomatis menguping, membaca, dan menganalisis email masuk yang berisi instruksi rumit, mengekstraksi parameter operasional penting seperti **Bank Tujuan**, **Mata Uang**, **Total Nominal**, serta **Pecahan/Denominasi**, lalu mempresentasikannya ke dalam antarmuka dashboard operasional yang interaktif dan dinamis.

Dengan integrasi cerdas ini, tim operasional dapat memangkas waktu entri data manual dari beberapa menit menjadi dalam hitungan detik secara aman dan presisi tinggi.

---

## 🤖 2. Arsitektur AI: Split-Task & Mekanisme Rotasi Model (High Availability)

Sistem ini didesain tangguh (*resilient*) menggunakan **Split-Task AI Architecture** dan didukung dengan **Multi-Model AI Rotator** guna mengantisipasi kegagalan API, pemadaman jaringan, maupun kuota rate limit (HTTP 429) pada level produksi.

```
                      +-----------------------------+
                      |     Email Masuk Terdeteksi  |
                      +-----------------------------+
                                     |
                                     v
                      +-----------------------------+
                      |   Event-Driven Trigger      |
                      |   (Real-time Worker Node)   |
                      +-----------------------------+
                                     |
               +---------------------+---------------------+
               |                                           |
         [Data Harian]                              [Historical Backfill]
               |                                           |
               | (Parallel Multi-Model Extraction)         v
               +---------------------+            +--------------------------+
               |                     |            | HEAVY-DUTY MODEL         |
               v                     v            | moonshotai/kimi-k2.6     |
      +------------------+  +------------------+  +--------------------------+
      | DATA EXTRACTOR   |  | CONTEXTUAL TAG   |               |
      | Inkling (NVIDIA)  |  | Minimax-M3        |               v
      +------------------+  +------------------+  +--------------------------+
               |                     |            |   SSE Live Log Stream    |
               +----------+----------+            |   & Progress Bar Client  |
                          | (Merge JSON Output)   +--------------------------+
                          v                                    |
               +---------------------+                         v
               | Simpan ke Supabase  |            +--------------------------+
               |   & SQLite Ganda    |            |  Simpan Hasil ke Cloud   |
               +---------------------+            |     & SQLite Ganda       |
                          |                       +--------------------------+
                          | (Jika Qwen/Kimi Gagal)
                          v
               +---------------------+
               |   FAILOVER POOL     |
               | - z-ai/glm-5.2      |
               | - nemotron-340b     |
               | - gemma-2-27b-it    |
               +---------------------+
                          | (Jika Semua Gagal)
                          v
               +---------------------+
               |     Rule-Based      |
               |   Regex Fallback    |
               +---------------------+
```

### ⚙️ Detail Alur Kerja AI & Split-Task Processing
1. **Event-Driven Processing:** Sistem meninggalkan metode polling Cron Job konvensional yang lambat. Ketika ada email baru yang masuk, sistem secara instan memicu Worker Node.js untuk memproses analisis AI secara asinkron.
2. **Split-Task AI Processing (Parallel Multi-Model Extraction):**
   * **Inkling (NVIDIA) - Data Extractor:** Dipercaya sebagai mesin ekstraktor data utama berkat kapasitas parameternya yang sangat masif. Model ini ditugaskan secara **KHUSUS** untuk mengekstrak data operasional presisi tinggi: `summary`, `currency`, `total_amount`, dan `denomination_suggestion` serta informasi detail nominal lainnya.
   * **Minimax-M3 - Contextual Tagger:** Memiliki pemahaman bahasa kontekstual yang mendalam serta window context yang panjang. Model ini ditugaskan secara **KHUSUS** untuk menganalisis konteks percakapan lama (*reply thread*) serta menentukan klasifikasi `suggested_tag` (CIT/ATM/Lainnya), `urgency_level`, dan status `action_required`.
   * **Concurrent Execution (`Promise.all`):** Kedua model AI tersebut dieksekusi secara bersamaan (paralel) dari backend untuk mencegah hambatan latency (overhead waktu) sehingga pemrosesan berlangsung sangat responsif, lalu keluarannya digabungkan (*merge*) secara rapi.
   * **Optimasi Payload & Timeout:** Untuk mempercepat respons AI, payload `messages` dibersihkan dan hanya menyertakan teks pesan murni (`body_text`) tanpa menyertakan Base64 attachments berukuran besar. Konfigurasi `timeout: 60000` (60 detik) diterapkan di level Axios untuk menjamin kestabilan pemrosesan model raksasa Inkling saat mengekstrak struktur data denominasi yang rumit.
3. **Mekanisme Failover Otomatis (High Availability):**
   * **Rotator Pool Backup:** Jika salah satu model Inkling/Minimax mengalami gangguan, sistem secara dinamis mengalihkan seluruh tugas ke rotator pool utama yang berisi **z-ai/glm-5.2**, **nvidia/nemotron-340b-instruct**, atau **google/gemma-2-27b-it**.
   * **Rule-Based Fallback:** Sebagai pertahanan terakhir, sistem didukung algoritma parsing reguler (*Regex*) untuk mengekstrak data dasar sehingga data tetap berhasil ter-input dengan aman.
4. **Heavy-Duty Backfill Model (`moonshotai/kimi-k2.6`):** Digunakan khusus untuk memproses pengolahan ulang ribuan data historis yang kosong di latar belakang secara real-time via Server-Sent Events (SSE).
5. **AI Connection Health Diagnostics:** Sistem menyediakan fitur halaman **AI Settings & Status** untuk mendiagnosis koneksi ke masing-masing model (Inkling, Minimax, GLM-5.2) secara real-time dengan melacak Latency (respon ms) menggunakan API endpoint `/api/settings/ai-health`.

---

## ✨ 3. Fitur Utama (Key Features)

| Fitur | Deskripsi | Teknologi Pendukung |
| :--- | :--- | :--- |
| **🤖 Smart JSON Extraction** | Secara otomatis mem-parsing body email (bahkan thread percakapan yang panjang) dan mengubahnya menjadi form terstruktur yang berisi mata uang, total nominal, pecahan denominasi, urgensi, dan tag operasional. | NVIDIA NIM, AI Model Rotator |
| **🟢 AI Settings & Status** | Menu diagnosis kesehatan (Health Check) koneksi real-time untuk memverifikasi fungsionalitas, status aktif, dan latency model-model AI (Inkling, Minimax-M3, GLM-5.2). | Promise.allSettled, Diagnostics API |
| **📧 Gmail-Style UI** | Tampilan surat masuk yang bersih dan minimalis menyerupai inbox Gmail. Menggunakan teknik DOM manipulation untuk mendeteksi riwayat percakapan lama (`> quote`) dan menyembunyikannya ke dalam tombol collapsible `...` agar UI tetap rapi. | React, Tailwinds CSS |
| **📎 Serverless Base64 Attachments** | Berkas lampiran gambar atau PDF tidak disimpan dalam bucket cloud eksternal. Sistem mengonversi lampiran langsung menjadi Base64 string terkompresi (maks 3MB) ke dalam PostgreSQL. Client me-render thumbnail interaktif yang siap diunduh. | SQLite, Supabase Engine |
| **🔄 Real-time Historical Backfill** | Fitur singkronisasi email historis asinkron menggunakan Server-Sent Events (SSE). UI menampilkan Log Terminal & Progress Bar yang ter-update secara real-time dari data stream backend dengan delay otomatis pencegah rate limit. | EventSource API, Express SSE |
| **🗺️ Regional Branch Routing** | Mengklasifikasikan email ke struktur folder wilayah regional (Region 1-10) dan kantor cabang secara otomatis berdasarkan domain pengirim atau subjek email. | Routing Engine |
| **💳 ActiveATM CIT API Integration** | Dilengkapi antarmuka proxy server yang aman untuk terhubung dengan API eksternal guna memproses status penugasan pengiriman uang dan ketersediaan unit armada pengawal. | Axios Proxy, Express Backend |

---

## 🛠️ 4. Tech Stack (Spesifikasi Teknologi)

* **Frontend Framework:** React 18, Vite, Tailwind CSS, Lucide Icons, Framer Motion (Animasi Micro-interaction).
* **Backend Runtime:** Node.js Express Server, tsx (TypeScript Execution), esbuild (Ultra-fast bundler).
* **Databases:** Supabase PostgreSQL (Cloud State Sync) & SQLite 3 (Durable Local Storage Engine).
* **AI & Integration:** SDK `openai` resmi terintegrasi dengan NVIDIA NIM API endpoints & Moonshot AI.

---

## 🚀 5. Memulai (Getting Started)

### Prasyarat System
* Node.js v18 atau versi yang lebih baru.
* Akun Supabase (opsional, sistem otomatis menggunakan SQLite lokal jika tidak dikonfigurasi).

### Langkah Instalasi

1. **Clone repositori dan masuk ke direktori proyek:**
   ```bash
   git clone <repository-url>
   cd ai-operational-copilot
   ```

2. **Instal seluruh dependensi yang diperlukan:**
   ```bash
   npm install
   ```

3. **Konfigurasi Environment Variables (`.env`):**
   Salin berkas `.env.example` menjadi `.env` di root direktori Anda:
   ```bash
   cp .env.example .env
   ```
   Isi parameter rahasia berikut di dalam file `.env`:
   ```env
   # API Key NVIDIA NIM (Wajib untuk Analisis Cerdas AI)
   NVIDIA_API_KEY=nvapi-22LB****************************************
   
   # Sinkronisasi Cloud Supabase (Opsional)
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_KEY=your-anon-key
   ```

4. **Jalankan Aplikasi dalam Mode Pengembangan (Dev Mode):**
   ```bash
   npm run dev
   ```
   Aplikasi dan backend server akan berjalan secara paralel di alamat [http://localhost:3000](http://localhost:3000).

5. **Kompilasi Produksi (Production Build):**
   Untuk mengompilasi aplikasi frontend dan membundel backend TypeScript menjadi satu berkas CJS produksi yang sangat optimal:
   ```bash
   npm run build
   npm run start
   ```

---

## 🛡️ 6. Penanganan Kesalahan (Error Handling & Robustness)

* **API Timeout Protection:** Permintaan AI eksternal dilengkapi dengan batasan timeout aman sebesar 25 detik untuk menghindari deadlock pada server.
* **Stream Disconnect Recovery:** Client-side EventSource secara otomatis akan melakukan upaya penyambungan ulang (*auto-reconnect*) jika koneksi internet terputus di tengah proses backfilling.
* **Double-Write Fallback:** Jika jaringan ke cloud database Supabase tidak stabil, server akan tetap menyimpan seluruh log operasional dan perubahan di SQLite lokal secara utuh, lalu memperbaruinya ke cloud saat koneksi pulih kembali.
