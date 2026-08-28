PID FRIENDLY FIX v1.5

Masalah:
Firebase mirror PID_CATALOG hanya disinkronkan saat initial import.
Jika receiver belajar/menambah PID setelah itu, dashboard bisa hanya melihat kode mentah
seperti k221942, k221145, k221564, dst.

Perbaikan:
1. Bridge v1.1:
   - PID_CATALOG disinkronkan pada setiap syncMinute.
   - fungsi forceSyncPidCatalog() untuk paksa refresh sekali.

2. Dashboard v1.5:
   - fallback nama ramah untuk PID penting/extended.
   - jika Firebase catalog masih menampilkan kode mentah, UI tetap memakai nama manusia.
   - kff1206 tetap dikenal sebagai Rata-rata Trip (KPL).

LANGKAH:
A. Apps Script Torque Firebase Bridge:
   - ganti Code.gs dengan Bridge_Code_v1_1.gs
   - Save
   - jalankan forceSyncPidCatalog() SEKALI
   - trigger existing tidak perlu dibuat ulang

B. GitHub:
   - ganti app.js dengan app.js v1.5
   - index/style/firebase-config tidak berubah, tapi paket lengkap disertakan
   - Commit, tunggu Pages deploy, Ctrl+F5

Nama friendly yang dipastikan:
k221942 = Putaran Output Transmisi
k221145 = Sensor Oksigen H2OS
k221564 = Tekanan AC Sisi Tinggi
k221141 = Tegangan Pengapian 1
k2212c3 = Durasi Injektor Bank 1
kff1202 = Boost / Vakum
kff124d = AFR Target
k44 = Target Lambda
kff126a = Estimasi Jarak Sisa BBM
