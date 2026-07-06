# 📧 Email Ticketing System Dashboard

Aplikasi *dashboard* berbasis lokal (Localhost) yang dirancang untuk membaca, mengekstrak, dan mengklasifikasikan email secara otomatis langsung dari file penyimpanan lokal **Mozilla Thunderbird (MBOX)**. 

Sistem ini mem- *bypass* kebutuhan koneksi POP3/IMAP eksternal, sehingga kebal terhadap pemblokiran *firewall* server perusahaan. Sangat cocok digunakan untuk monitoring tugas harian seperti laporan *Speedtest* cabang dan dokumen *Approval*.

---

## ✨ Fitur Utama

*   📥 **Direct MBOX Parsing**: Membaca *history* email langsung dari penyimpanan lokal Thunderbird dengan sangat cepat tanpa memerlukan internet.
*   🏷️ **Smart Auto-Tagging**: 
    *   Otomatis mendeteksi email laporan **Speedtest** dan mengekstrak nama cabang (misal: "Purwokerto", "Senen").
    *   Otomatis mendeteksi email **Approval** dan mengklasifikasikannya berdasarkan tipe dokumen (UAT, FSD, SIT).
*   🗄️ **Local SQLite Database**: Menyimpan hasil *parsing* email ke dalam *database* lokal untuk mencegah duplikasi (menggunakan *Message-ID*) dan mempercepat proses *loading* data.
*   🖥️ **Modern 3-Pane UI**: Tata letak *dashboard* 3-kolom ala sistem *Helpdesk* profesional (Navigasi Kategori, Daftar Email, dan Drill-down Detail Email).
*   🔍 **Advanced Search & Filter**: Pencarian spesifik berdasarkan Pengirim, Penerima, Subjek, Kata Kunci, dan Rentang Tanggal.

---

## 🛠️ Teknologi yang Digunakan

**Frontend:**
*   React.js
*   Vite (Build Tool)
*   CSS / UI Components

**Backend:**
*   Node.js
*   Express.js
*   SQLite3 (Database)
*   `node-mbox` & `mailparser` (Ekstraksi MBOX file)

---

## 🚀 Panduan Instalasi (Localhost)

Ikuti langkah-langkah berikut untuk menjalankan aplikasi ini di komputer lokal Anda:

### 1. Prasyarat Sistem
*   Pastikan **Node.js** (versi LTS) sudah terinstal di komputer Anda.
*   Memiliki aplikasi **Mozilla Thunderbird** yang sudah terkonfigurasi dan mengunduh *history* email.

### 2. Clone Repositori
```bash
git clone [https://github.com/username-anda/email-ticketing-system.git](https://github.com/username-anda/email-ticketing-system.git)
cd email-ticketing-system

3. Instalasi Dependensi
Buka terminal di dalam folder proyek, lalu jalankan:

Bash
npm install
4. Konfigurasi Path Thunderbird
Buka file konfigurasi di backend (misal: server.js atau .env) dan pastikan path direktori mengarah ke file Inbox Thunderbird Anda.

Contoh path di Windows:

Plaintext
C:\Users\<Nama_User>\AppData\Roaming\Thunderbird\Profiles\<ID_Profile>.default-release\Mail\mail.advantagescm.com\Inbox
Catatan: Ganti <Nama_User> dan <ID_Profile> sesuai dengan direktori di komputer Anda.

5. Jalankan Aplikasi
Jalankan script berikut untuk menyalakan Frontend (Vite) dan Backend (Express) secara bersamaan:

Bash
npm run dev
6. Akses Dashboard
Buka browser pilihan Anda dan navigasikan ke:
http://localhost:5173

Di sidebar sebelah kiri, klik tombol "Sync Thunderbird" untuk mulai menarik dan mengklasifikasikan history email Anda ke dalam dashboard.

📂 Struktur Direktori Utama
Plaintext
📁 email-ticketing-system
├── 📁 backend          # Source code server Node.js & SQLite
│   ├── server.js       # Express server & API routes
│   └── mboxParser.js   # Logika ekstraksi node-mbox
├── 📁 src              # Source code frontend React/Vite
│   ├── components      # UI Komponen (Sidebar, List, Detail)
│   ├── App.jsx         # Main application file
│   └── index.css       # Styling
├── package.json        # Project dependencies & scripts
└── README.md           # Dokumentasi proyek
