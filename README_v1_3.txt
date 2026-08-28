TORQUE GITHUB DASHBOARD v1.3

PERBAIKAN UTAMA
1. RIWAYAT -> LIHAT DETAIL
   - Tombol sekarang memakai Firebase session node KEY sebagai identitas kanonis.
   - Detail summary muncul segera sebelum telemetry/grafik dimuat.
   - Error grafik tidak lagi membuat Detail terlihat seperti tidak terjadi apa-apa.
   - Klik dibungkus error handler.
   - Setelah buka detail, viewport diarahkan ke panel detail.

2. PETA
   - Leaflet + raster OpenStreetMap DIHAPUS.
   - Diganti MapLibre GL JS + OpenFreeMap Liberty.
   - Gratis, tanpa API key, tanpa billing.
   - Vector map.
   - Route GPS tetap dari telemetry Torque.
   - Klik peta -> TRACE terdekat.
   - TRACE -> marker merah.
   - Buka di Maps tetap tersedia.

UPLOAD GANTI SEMUA FILE UTAMA
- index.html
- app.js
- style.css
- firebase-config.js

Firebase Bridge / Apps Script lama TIDAK diubah.
