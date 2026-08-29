TORQUE DASHBOARD v1.5.4 — GRAPH CLEAN

PERUBAHAN:
1. "PID (maks. 4)" diganti menjadi "Sensor Grafik (maks. 4)".

2. PID mentah yang sebelumnya masih terlihat sudah diberi nama ramah,
   berdasarkan metadata yang benar-benar dikirim Torque:
   - kff1296 = Persentase Berkendara Kota (%)
   - kff1297 = Persentase Berkendara Highway (%)
   - kff1298 = Persentase Idle (%)
   - kff12b6 = Energi Kinetik Positif (PKE) (km/hr²)

3. Kartu statistik Min / Avg / Max di atas grafik DIHAPUS untuk:
   - LIVE
   - RIWAYAT LOG

4. Tooltip grafik:
   - Desktop: hover/cursor menampilkan timestamp + nilai sensor.
   - Ponsel: tap grafik memilih titik terdekat, menampilkan tooltip secara
     persisten, sekaligus menjalankan TRACE pada timestamp yang sama.
   - Hit radius diperbesar agar tap di layar sentuh lebih mudah.
   - Pinch zoom dan drag/pan tetap tersedia.

5. Grafik tetap default kosong sampai pengguna memilih sensor.

DEPLOY:
- Ganti index.html
- Ganti app.js
- style.css tidak berubah secara fungsi, tetapi disertakan di paket.
- firebase-config.js tidak berubah.
- Bridge v1.2 ROUTE FIX tidak perlu diganti.
