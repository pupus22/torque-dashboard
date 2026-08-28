# Torque Vehicle Monitor — GitHub + Firebase

Dashboard baru, terpisah dari dashboard Apps Script lama.

## Arsitektur

Torque → Receiver Apps Script lama → Google Sheet existing (MASTER)
→ Apps Script Bridge → Firebase Realtime Database (mirror/cache)
→ GitHub Pages Dashboard

Sistem lama tidak diubah.

## File

- `index.html`
- `style.css`
- `app.js`
- `firebase-config.js`

## Firebase

Project yang sudah dibuat:
- Project ID: `torque-b9c0e`
- Realtime Database: `https://torque-b9c0e-default-rtdb.asia-southeast1.firebasedatabase.app`

Dashboard TIDAK menyimpan password Firebase di source.
Login dilakukan lewat form dan Firebase Authentication REST API.

### User Dashboard

Boleh gunakan user Firebase Authentication yang sudah ada untuk tes.
Lebih baik buat user OWNER khusus dashboard:
Firebase → Authentication → Users → Add user.

Rules yang dipakai pada Phase 1 sudah mengizinkan user terautentikasi membaca `/mirror`
dan menulis hanya ke `/dashboard/prefs` + `/dashboard/notes`.

## Deploy GRATIS ke GitHub Pages

1. Login GitHub.
2. Buat repository PUBLIC baru, contoh `torque-dashboard`.
3. Upload 4 file di atas ke root repository.
4. Commit ke branch `main`.
5. Repository → Settings → Pages.
6. Source: `Deploy from a branch`.
7. Branch: `main`, folder `/ (root)`.
8. Save.
9. Tunggu sebentar sampai URL Pages muncul:
   `https://USERNAME.github.io/torque-dashboard/`

GitHub Pages public, tetapi data Firebase tetap membutuhkan login Firebase.

## Fitur v1

- SPA: tidak reload saat ganti LIVE / Riwayat.
- Multi HP / Device ID.
- Auto-select hanya jika total kendaraan = 1.
- LIVE dari `mirror/live`.
- Kartu sensor custom + save prefs.
- Sensor Tersedia default tertutup.
- Riwayat dari `mirror/sessions`.
- Telemetry dari `mirror/telemetry/YYYY-MM-DD/device/session`.
- Grafik sampai 4 PID.
- LIVE range 1m / 5m / 10m / 30m / 1j / Custom.
- History range Seluruh Trip / 5m / 15m / 30m / Custom.
- Min / Avg / Max mengikuti range.
- Normalized 0–100%.
- Tap grafik → TRACE.
- GPS route + TRACE marker.
- Klik peta → pilih telemetry terdekat.
- Notes disimpan ke `/dashboard/notes`, bukan ke RAW_LOG.
- Preferences disimpan ke `/dashboard/prefs`.
- Diagnostik.

## Penting tentang LIVE

Firebase sekarang adalah MIRROR dari Google Sheet.
Bridge Apps Script berjalan setiap ±1 menit, jadi nilai LIVE di dashboard GitHub
dapat tertinggal sampai sekitar 1 menit dari Google Sheet.

UI dashboard sendiri cepat/SPA. Jika nanti ingin telemetry hampir realtime 5 detik,
kita bisa menambah relay realtime ke Firebase tanpa mengubah dashboard GitHub.

## Retensi

Bridge Phase 1 menghapus `mirror/telemetry` lebih tua dari 14 hari.
`mirror/sessions` tetap disimpan sebagai summary.

## Keamanan

`firebase-config.js` berisi Web API Key Firebase. Web API Key bukan password.
Jangan pernah menaruh password user Firebase atau akun Google di repository.
