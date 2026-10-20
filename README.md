<div align="center">

<img src="icons/icon-512.png" alt="Logo E-LKPD STEAM" width="110">

# 🔬 E-LKPD Interaktif IPA STEAM

**Platform Lembar Kerja Peserta Didik (LKPD) elektronik berbasis STEAM untuk pembelajaran IPA.**

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES_Modules-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![PWA](https://img.shields.io/badge/PWA-Offline_Ready-5A0FC8?style=for-the-badge&logo=pwa&logoColor=white)

</div>

---

## 📖 Tentang Proyek

**E-LKPD Interaktif IPA STEAM** adalah aplikasi web (PWA) yang mengubah LKPD kertas menjadi pengalaman belajar digital yang interaktif. Siswa membaca materi, mengisi LKPD langsung di atas dokumen PDF, memainkan game edukatif, menggambar proyek di Ruang STEAM Lab, lalu mengerjakan evaluasi. Guru mengelola seluruh konten, mengoreksi jawaban, dan melihat rekap nilai dalam satu tempat.

Aplikasi berjalan sepenuhnya di browser dengan **JavaScript ES Module tanpa proses build**. Data disimpan dan dilayani oleh backend **Google Apps Script**, dengan cache lokal sehingga tetap nyaman dipakai saat koneksi tidak stabil.

## ✨ Fitur Utama

### Untuk Siswa
- **Materi per pertemuan**: bahan ajar PDF dengan dukungan rumus matematika dan sains lewat **MathJax**.
- **LKPD PDF interaktif**: siswa mengisi kolom jawaban langsung di atas halaman PDF. Jawaban tersimpan otomatis sebagai draf dan dapat dipulihkan jika halaman tertutup.
- **7 jenis game edukatif**:
  | Game | Deskripsi |
  |---|---|
  | Drag and Drop | Seret item ke tempat yang benar |
  | Matching | Pasangkan pernyataan dengan jawabannya |
  | Quiz Speed | Kuis cepat berwaktu |
  | Simulator | Simulasi konsep IPA |
  | Sequencer | Urutkan langkah atau proses |
  | Word Search | Cari kata kunci di dalam kisi huruf |
  | Hotspot | Tandai bagian pada gambar |
- **Ruang STEAM Lab**: kanvas gambar dengan pilihan warna, ketebalan garis, dan *undo*. Hasil karya dapat diunduh atau dikirim ke guru.
- **Evaluasi berwaktu**: hitung mundur otomatis, jawaban terkirim sendiri saat waktu habis, skor pilihan ganda dihitung otomatis dan nilai esai diberikan guru.
- **Mode tamu**: pengunjung bisa menjelajah tanpa login, tetapi jawaban hanya tersimpan bila login sebagai siswa.
- **Efek suara** yang dapat dimatikan.

### Untuk Guru
- **Kelola konten**: pertemuan modul, bahan ajar, LKPD, game interaktif, serta evaluasi dan bank soal.
- **Pemetaan kolom isian PDF**: tandai area jawaban di atas dokumen PDF untuk membuat LKPD interaktif.
- **OCR PDF**: ekstrak teks dari PDF, dengan cadangan OCR di server bila teks tidak terbaca.
- **Koreksi LKPD dan nilai**: nilai jawaban siswa dan beri ulasan.
- **Buku nilai dan rekapitulasi**, dapat diekspor ke **CSV**.

### Untuk Admin
- **Kelola pengguna** (tambah dan hapus akun).
- **Kelola data kelas**.

### Teknis
- **PWA**: dapat dipasang ke layar utama dan dibuka dalam mode mandiri.
- **Offline-first**: data dimuat dari cache **IndexedDB** lebih dulu, lalu disegarkan dari server di latar belakang.
- **Antrean kirim (outbox)**: jawaban LKPD, game, dan ulasan disimpan lokal seketika dan dikirim ulang otomatis lewat **Background Sync** saat koneksi kembali.
- **Auto-logout** setelah 15 menit tidak aktif.
- **Responsif** untuk ponsel, tablet, dan desktop.

## 👥 Peran Pengguna

| Peran | Akses |
|---|---|
| **Tamu** | Menjelajah materi, LKPD, game, dan Ruang STEAM Lab tanpa menyimpan jawaban |
| **Siswa** | Seluruh fitur belajar dengan penyimpanan jawaban dan nilai |
| **Guru** | Kelola konten, koreksi, dan buku nilai |
| **Admin** | Kelola pengguna dan kelas |

## 🗂️ Struktur Proyek

```
.
├── index.html                 # Halaman utama dan seluruh kerangka tampilan
├── index-head-snippet.html    # Cuplikan tag <head> untuk PWA
├── manifest.json              # Konfigurasi PWA
├── sw.js                      # Service worker (cache dan Background Sync)
├── css/
│   └── style.css              # Gaya kustom
├── icons/                     # Ikon PWA (biasa dan maskable)
└── js/
    ├── main.js                # Titik masuk aplikasi dan manajemen sesi
    ├── config.js              # URL backend dan konfigurasi dasar
    ├── state.js               # State global dan penyimpanan sesi
    ├── components/
    │   ├── drawer.js          # Navigasi samping dan perpindahan tampilan
    │   ├── modal.js           # Modal, toast, login, dan logout
    │   ├── canvas-steam.js    # Kanvas gambar
    │   ├── pdf-overlay.js     # Lapisan isian di atas PDF
    │   └── sound.js           # Efek suara
    ├── games/                 # drag-drop, matching, quiz-speed, simulator,
    │                          # sequencer, word-search, hotspot
    ├── services/
    │   ├── api.js             # Komunikasi dengan backend
    │   ├── idb.js             # Cache dan outbox IndexedDB
    │   ├── ocr.js             # Ekstraksi teks PDF
    │   ├── sw-register.js     # Registrasi service worker dan sinkronisasi
    │   └── pwa-install.js     # Ajakan pasang aplikasi
    └── views/                 # home, steam-lab, materi, lkpd, game,
                               # evaluasi, guru, admin
```

## 🚀 Menjalankan Secara Lokal

Aplikasi memakai **ES Module**, jadi tidak bisa dibuka langsung lewat `file://`. Gunakan server statis apa saja.

```bash
git clone https://github.com/gemorca/<nama-repo>.git
cd <nama-repo>

# pilih salah satu
python -m http.server 8000
npx serve .
```

Lalu buka `http://localhost:8000`. Service worker dan fitur PWA berjalan di `localhost` maupun HTTPS.

## 🔌 Backend (Google Apps Script)

Frontend berkomunikasi dengan **satu endpoint Web App Google Apps Script**. Backend perlu disiapkan terpisah dan URL-nya diatur di dua tempat:

| Berkas | Konstanta |
|---|---|
| `js/config.js` | `GAS_API_URL` |
| `sw.js` | `GAS_API_URL` |

> ⚠️ Kedua nilai **harus sama**. Service worker memakai URL ini untuk mengirim ulang antrean jawaban saat Background Sync.

### Pengambilan data (`GET`)

| Permintaan | Fungsi |
|---|---|
| `?action=get_all_data` | Memuat seluruh data awal |
| `?action=get_submissions` | Menyegarkan data jawaban siswa |

Respons `get_all_data` diharapkan berbentuk:

```json
{
  "success": true,
  "data": {
    "users": [], "kelas": [], "pertemuan": [], "materi": [],
    "lkpd": [], "games": [], "evaluasi": [], "soal_evaluasi": [],
    "submissions": [], "reviews": []
  }
}
```

### Pengiriman data (`POST`)

Isi permintaan berupa JSON dengan bidang `action`. Respons berupa `{ "success": true|false, "message": "..." }`.

| Kelompok | Aksi |
|---|---|
| Sesi | `login` |
| Pengguna dan kelas | `add_user`, `delete_user`, `save_kelas`, `delete_kelas` |
| Konten | `save_pertemuan`, `delete_pertemuan`, `save_materi`, `delete_materi`, `save_lkpd`, `delete_lkpd`, `save_game`, `delete_game`, `save_field_map_lkpd`, `upload_pdf` |
| Evaluasi | `save_evaluasi`, `save_soal_evaluasi`, `delete_soal_evaluasi`, `submit_evaluasi` |
| Jawaban siswa | `submit_lkpd`, `submit_lkpd_isian`, `submit_game`, `get_jawaban_lkpd_isian` |
| Penilaian | `grade_submisi`, `save_review` |
| OCR | `ocr_pdf_drive` |

Aksi `submit_lkpd`, `submit_lkpd_isian`, `submit_game`, dan `save_review` melewati **antrean outbox**: disimpan dulu di IndexedDB, lalu dikirim ke server oleh service worker.

> Bentuk data setiap aksi dapat dilihat dari pemanggilan `apiPost` di `js/views/` dan `js/components/`.

## ⚙️ Kustomisasi

| Yang ingin diubah | Lokasi |
|---|---|
| Alamat backend | `GAS_API_URL` di `js/config.js` **dan** `sw.js` |
| Nama basis data lokal dan kunci cache | `DB_NAME`, `DB_VERSION`, `CACHE_KEY` di `js/config.js` |
| Batas minimal karakter sebelum OCR cadangan dipakai | `OCR_FALLBACK_MIN_CHARS` di `js/config.js` |
| Batas waktu tidak aktif sebelum logout otomatis | `IDLE_TIMEOUT_MS` di `js/state.js` |
| Warna tema (`brand-*`) | blok `tailwind.config` di `index.html` |
| Nama aplikasi dan ikon | `manifest.json`, `index.html`, dan folder `icons/` |
| Versi cache PWA | `CACHE_VERSION` di `sw.js` (naikkan setiap rilis baru) |

## 🔒 Catatan Keamanan dan Privasi

- Pemeriksaan peran dan hak akses **harus dilakukan di backend**, bukan hanya di frontend.
- Simpan kata sandi pengguna dalam bentuk *hash*.
- Data siswa (nama, jawaban, dan nilai) bersifat pribadi. Batasi akses ke Google Sheets atau database Anda.

## 🛠️ Teknologi

- **HTML5**, **JavaScript** (Vanilla, ES Module), dan [Tailwind CSS](https://tailwindcss.com/)
- **Progressive Web App**: Web App Manifest, Service Worker, dan Background Sync
- **IndexedDB** untuk cache data dan antrean kirim
- [PDF.js](https://mozilla.github.io/pdf.js/) untuk menampilkan dan memetakan dokumen PDF
- [MathJax](https://www.mathjax.org/) untuk rumus
- [SweetAlert2](https://sweetalert2.github.io/) untuk dialog dan notifikasi
- [Google Fonts](https://fonts.google.com/) (Nunito dan Poppins)
- **Google Apps Script** sebagai backend

## 👤 Kredit

Seluruh antarmuka, kode, dan desain proyek ini dibuat sepenuhnya oleh:

**Moh. Agil S. Abdul**
[GitHub](https://github.com/gemorca) · [Instagram](https://instagram.com/mohammadagill)

> Pustaka pihak ketiga yang disebutkan di bagian Teknologi tetap menjadi milik masing-masing pembuatnya dan digunakan sesuai lisensi mereka.

## 📄 Lisensi

Hak Cipta © 2026 **Moh. Agil S. Abdul**. Seluruh hak dilindungi (*All Rights Reserved*).

Kode sumber, desain, dan aset dalam repositori ini dibuat dan dimiliki sepenuhnya oleh pemilik hak cipta. Dilarang menyalin, memodifikasi, mendistribusikan, atau menggunakan ulang sebagian maupun seluruh isi proyek ini untuk tujuan apa pun tanpa izin tertulis dari pemilik.

---

<div align="center">

**E-LKPD Interaktif IPA STEAM** · Dibuat sendiri oleh Moh. Agil S. Abdul.

</div>
