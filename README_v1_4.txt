TORQUE GITHUB DASHBOARD v1.4 — FOLLOW VEHICLE

Perubahan:
- LIVE map default: Ikuti Kendaraan = ON.
- Marker kendaraan biru memakai GPS terbaru dari LIVE_STATE.
- Saat data LIVE berubah, marker bergerak dan kamera mengikuti marker.
- Route range tetap tergambar di belakang marker.
- Drag / zoom / rotate manual pada peta -> Follow otomatis PAUSE.
- Tombol "Ikuti Kendaraan" mengaktifkan follow kembali.
- Masuk TRACE -> follow pause.
- "Kembali ke LIVE" -> follow ON lagi dan kamera kembali ke kendaraan.
- Pindah kembali ke tab LIVE -> jika follow ON, kamera kembali mengikuti.
- Riwayat tetap memakai fit route / TRACE dan tidak memakai follow realtime.

PENTING:
Firebase saat ini adalah mirror Google Sheet via trigger Apps Script ±1 menit.
Jadi marker akan mengikuti GPS TERBARU DI FIREBASE, bukan 5 detik langsung dari Torque.
Untuk follow 5 detik nanti perlu jalur realtime/relay tambahan, dashboard ini tidak perlu dibongkar.

Upload menggantikan file utama:
- index.html
- app.js
- style.css
- firebase-config.js
