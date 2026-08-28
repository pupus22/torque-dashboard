TORQUE DASHBOARD v1.5.1 — FRIENDLY PID FIX

Ini memperbaiki v1.5 yang pada sebagian data masih bisa menampilkan kode PID mentah.

PERBAIKAN:
- PID keys dinormalisasi lowercase.
- Untuk PID yang sudah dikenal, FRIENDLY_PID selalu menjadi nama tampilan utama.
- Sensor Tersedia tidak lagi menampilkan kode k221942/k221145 sebagai subtitle.
- Sensor list memakai nama + short name/unit yang manusiawi.
- index.html memakai cache-busting app.js?v=1.5.1.
- Ada label v1.5.1 di subtitle agar deploy bisa diverifikasi langsung.

UNTUK GITHUB:
WAJIB ganti DUA file:
1. index.html
2. app.js

style.css dan firebase-config.js tidak berubah.
Bridge v1.1 tidak perlu diganti ulang jika sudah terpasang.

Setelah commit:
- tunggu GitHub Pages deployment selesai
- buka dashboard
- pastikan tulisan kecil "v1.5.1" muncul di bawah judul
Kalau v1.5.1 belum terlihat, berarti GitHub Pages masih melayani versi lama.
