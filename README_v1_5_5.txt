TORQUE DASHBOARD v1.5.5 — DETAIL SENSOR

PERUBAHAN UTAMA
Detail Perjalanan -> Atur Tampilan sekarang memiliki 2 kelompok:

1. RINGKASAN PERJALANAN
   - Mulai
   - Selesai
   - Durasi
   - Jarak
   - Rata-rata BBM Trip
   - Kecepatan Maks
   - RPM Maks
   - Suhu Maks
   - Tegangan ECU Min/Max
   - Packet / GPS Valid / Gap Terpanjang (tetap tersedia, default OFF)

2. SENSOR PERJALANAN
   - Daftar mengikuti PID/sensor yang benar-benar tersedia pada session.
   - Sama sumbernya dengan daftar Sensor Grafik.
   - Nama PID mentah tidak ditampilkan; memakai nama sensor ramah.

STATISTIK OTOMATIS
- Tegangan -> Min
- RPM -> Maks
- Suhu -> Maks
- Kecepatan -> Maks
- Tekanan AC -> Maks
- Output Transmisi -> Maks
- Boost/Vakum -> Maks
- Jarak Trip / Trip KPL / Estimasi Jarak / persen City-Highway-Idle -> nilai akhir
- Sensor kontinu lain (Beban, MAP, MAF, Bukaan Gas, O2, AFR, Lambda, Fuel Flow, dll) -> Rata-rata

CONTOH
Beban Mesin
Rata-rata 42,6 %

Tegangan ECU
Min 12,8 V

Tekanan AC Sisi Tinggi
Maks 215 psi

CATATAN
- Statistik sensor dihitung dari seluruh telemetry session, bukan range grafik.
- Setelah telemetry selesai dimuat, kartu detail otomatis diperbarui.
- Pilihan disimpan di Firebase prefs per user/device.
- Sensor yang tidak ada pada session tertentu otomatis tidak ditampilkan.
- Grafik tetap default kosong dan tooltip mobile v1.5.4 tetap dipertahankan.
- Route fix Bridge v1.2 tetap dipertahankan.

DEPLOY
GitHub cukup ganti:
- index.html
- app.js
- style.css

firebase-config.js tidak berubah.
Bridge v1.2 tidak perlu diganti.
