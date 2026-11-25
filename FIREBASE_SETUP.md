# Menjalankan Sprint 2 PraktiKu

## Hasil penggabungan Sprint 2 (25 November 2026)

Sumber: [PPK2-D1-Kel10/Pertemuan-7, branch sprint-2](https://github.com/PPK2-D1-Kel10/Pertemuan-7/tree/sprint-2), commit `8373e156613acb654f7f7c8de32cae2a34e6642c`. Branch `main` sumber masih berada di versi lama `ff73359`.

Penggabungan dilakukan dengan mengadaptasi fitur ke `AppContext` dan backend yang sudah ada, bukan mengganti seluruh aplikasi dengan model data sumber. Tidak ada commit merge atau push otomatis. Remote `origin` lokal tetap menunjuk repo Pertemuan-8. Cadangan kode sebelum penggabungan ada di `../backup-sebelum-merge-sprint2.zip` (tidak mencakup `.env` dan dependensi); salinan lengkap sumber teman ada di `../upstream-sprint2-source.zip`.

| Bagian sumber | Hasil integrasi |
| --- | --- |
| Kelola kelas: tambah, edit, hapus, realtime | Diadaptasi ke `ClassesScreen`, `classService`, dan callable `managePracticalClass`. Kelas hanya dapat dikelola pemilik; kelas yang memiliki sesi/riwayat tidak dapat dihapus. Kelas dapat dipilih ketika membuat sesi. |
| Registrasi / profil / izin | Konfirmasi password ditambahkan; route `/register`, `/profile`, `/leave` memakai autentikasi tunggal. NIM dan password minimal 8 karakter tetap dipertahankan. |
| Izin dan rekap | Catatan Asprak tersimpan; izin yang disetujui dan kehadiran tidak boleh bersamaan. Kategori, confidence, penjelasan, dan nama model AI ditampilkan bila tersedia. |
| Gemini REST proxy dan pemilihan model aktif | Proxy diadaptasi ke koleksi `permissions`, verifikasi akun dan pemilik sesi, serta Admin SDK. Dipanggil hanya bila endpoint dikonfigurasi dan pengguna memilih tombol analisis Gemini. Baseline cloud tetap tersedia. |
| Perbaikan Android | Persistensi Auth AsyncStorage lokal dipertahankan; deteksi long polling Firestore dan ErrorBoundary router diintegrasikan. Listener tetap dibatasi akun yang login. |
| UID Asprak, QR, lokasi, jadwal | Seluruh perbaikan lokal dipertahankan: gabung melalui UID Asprak; QR pemilik sesi saja; token maksimal 15 menit dan tidak melewati akhir sesi; FSM radius 1 km; jadwal lampau ditolak. |
| Konfigurasi project, namespace, versi paket | `.env.local`, project/EAS lokal, dependensi QR/kamera/date picker, versi Firebase dan lockfile lokal dipertahankan. Tidak mengaktifkan project `zerovaapp`, namespace `sprint2Data/app`, atau akun demo teman secara otomatis. |
| Skrip seed/deploy dan dokumen handoff sumber | Tidak dijadikan perintah aktif karena menyasar project/schema/akun demo berbeda. Referensi lengkap tetap tersedia di arsip sumber. Panduan aktif adalah dokumen ini. |

Data `sprint2Data/app` dari project teman belum dimigrasikan ke koleksi lokal. Mengganti Firebase project bukan sekadar merge kode: pemetaan profil (termasuk NIM/peran), kelas, sesi, dan riwayat perlu dipersiapkan sebelum migrasi data. Jangan menjalankan skrip seed sumber pada project cloud yang sudah memiliki data.

### Mengaktifkan hasil merge

1. Jalankan `npm ci` dan `npm --prefix functions ci` pada folder `Pertemuan-7` bila menggunakan checkout lain.
2. Deploy rules dan Functions terbaru ke project yang memang dipilih menggunakan perintah di bawah. Callable tambahan `managePracticalClass` wajib untuk menu Kelola kelas. Tidak ada deployment cloud yang dilakukan saat penggabungan.
3. Restart Expo menggunakan `npx expo start --clear`.
4. Uji dua akun: Asprak membuat kelas/sesi, Praktikan bergabung memakai UID Asprak, lalu scan QR dan validasi GPS.

### Gemini opsional untuk web laptop

Baseline cloud tidak memerlukan Gemini. Untuk mengaktifkan integrasi dari teman:

1. Salin `.env.backend.example` menjadi `.env.backend.local` dan isi `GEMINI_API_KEY` di backend saja.
2. Isi `GOOGLE_APPLICATION_CREDENTIALS` dengan path kredensial Admin SDK untuk project yang sama atau siapkan Application Default Credentials. Jangan masukkan private key ke variabel `EXPO_PUBLIC_*`, aplikasi, atau Git. Proxy tidak memakai password akun Asprak sebagai kredensial backend.
3. Tambahkan `EXPO_PUBLIC_AI_API_URL=http://127.0.0.1:3001` di `.env.local`. Ini hanya untuk browser di laptop yang menjalankan proxy, bukan APK di ponsel.
4. Jalankan `npm run ai:proxy` pada terminal terpisah, lalu restart Expo. Endpoint `/health` menunjukkan ketersediaan model; ketersediaan model tidak menjamin layanan gratis.
5. Pada halaman izin, pilih **Analisis dengan Gemini**. Proxy mengambil alasan asli yang sudah tersimpan, memverifikasi pemilik pengajuan/Asprak pemilik sesi, dan hanya memperbarui field AI. Jika Gemini gagal, izin dan hasil klasifikasi sebelumnya tetap tersimpan.

Pengujian proxy memakai API tiruan; Gemini sungguhan belum diuji tanpa konfigurasi kredensial. Konfigurasi endpoint dikosongkan secara default.

Kode aplikasi sudah memakai Firebase Authentication dan Firestore, bukan login dummy. Pilih **cloud** untuk pemakaian antarperangkat, atau **emulator lokal** untuk mencoba tanpa akun/billing Firebase.

## 1. Buat project dan layanan Firebase

1. Buka https://console.firebase.google.com/ dan login dengan akun Google milikmu.
2. Pilih **Create a project / Add project**, beri nama **PraktiKu**. Analytics tidak diperlukan untuk aplikasi ini. Catat **Project ID** (bukan sekadar nama tampilan).
3. Buka **Build → Authentication → Get started → Sign-in method**, aktifkan **Email/Password**, lalu Save.
4. Buka **Build → Firestore Database → Create database**. Gunakan database **Standard**, ID `(default)`, dan **production mode**. Pilih lokasi yang sesuai; backend di repo menggunakan `asia-southeast2` (Jakarta).
5. Buka **Project settings → General → Your apps**, pilih ikon **Web `</>`**, beri nama `PraktiKu`, lalu register. Hosting tidak diperlukan untuk memperoleh konfigurasi.
6. Salin nilai dari objek `firebaseConfig` ke `.env.local` di root repo. Jika file belum ada, salin `.env.example` terlebih dahulu. Jangan mengganti kode inisialisasi aplikasi dengan contoh dari Console.

```dotenv
EXPO_PUBLIC_FIREBASE_API_KEY=nilai_apiKey
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=nilai_authDomain
EXPO_PUBLIC_FIREBASE_PROJECT_ID=nilai_projectId
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=nilai_storageBucket
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=nilai_messagingSenderId
EXPO_PUBLIC_FIREBASE_APP_ID=nilai_appId
EXPO_PUBLIC_USE_FIREBASE_EMULATORS=false
```

Konfigurasi web bukan service-account credential. Jangan memasukkan private key, file service account, atau kunci API rahasia ke variabel `EXPO_PUBLIC_*`. `.env.local` diabaikan Git.

## 2. Pasang aturan akses sebelum registrasi

Jalankan dari root repo. Ganti `PROJECT_ID_KAMU` dengan ID project yang baru dibuat:

```powershell
npx firebase login
npx firebase deploy --only firestore,functions --project PROJECT_ID_KAMU
```

Login membuka browser untuk akun Google kamu. Tidak perlu menjalankan `firebase init`: konfigurasi dan rules sudah tersedia. Jika deployment CLI belum bisa dilakukan, salin seluruh isi `firestore.rules` ke **Firestore → Rules → Publish**. Jangan memakai rules `allow read, write: if true`.

Cloud Functions membatasi presensi ke radius **1.000 m** dari pin FSM UNDIP `-7.0483968, 110.4412672`, sesuai [pin yang dipilih](https://maps.app.goo.gl/xg2BMCXimQXHHm6J6?g_st=ic). Titik/radius disimpan di `functions/session-policy.cjs` dan `src/utils/attendanceValidation.ts`; keduanya harus sama. Radius ini berbentuk lingkaran, bukan batas gedung/fakultas. GPS harus memiliki akurasi maksimal 100 m. Koordinat tetap berasal dari perangkat, sehingga ini bukan jaminan anti-pemalsuan lokasi mutlak.

**Functions sekarang wajib untuk membuat/mengubah sesi, bergabung kelas, generate QR, dan presensi.** Deploy Functions beserta rules terbaru sebelum menjalankan versi aplikasi ini; rules menolak penulisan langsung untuk operasi tersebut.

## 3. Jalankan dan buat akun

```powershell
npm ci
npm --prefix functions ci
npx expo start --clear
```

Tekan `w` untuk web. Untuk Android/iOS, gunakan Expo Go atau development build yang kompatibel dengan SDK 57. Setelah perubahan `.env.local`, hentikan dan mulai ulang Expo.

1. Klik **Belum punya akun? Daftar**. Isi nama, NIM, email dan kata sandi minimal 8 karakter.
2. Semua akun baru menjadi **Praktikan**. Buat satu akun untuk Asisten dan setidaknya satu akun Praktikan dengan email berbeda.
3. Untuk menetapkan Asisten, buka **Firebase Console → Firestore → users → dokumen UID akun Asisten**. Ubah field `role` dari `Praktikan` menjadi **`Asisten`**, persis kapitalisasinya. Ini tindakan pengelola project; aplikasi tidak memberikan hak mengubah peran sendiri.
4. Perubahan peran dibaca otomatis. Jika koneksi terputus, masuk kembali setelah internet tersedia.
5. Asisten membuka **Akun saya**, menyalin UID, lalu membagikannya sebagai kode gabung kelas. Praktikan menempelkannya di **Jadwal & presensi → Gabung kelas Asprak**. Bergabung sekali berlaku untuk seluruh sesi Asprak, termasuk sesi yang dibuat nanti.
6. Asisten membuka **Kelola sesi → Tambah sesi**, mengisi tanggal, waktu WIB, dan UID miliknya sendiri (terisi otomatis dan dapat ditempel). Tidak perlu daftar UID peserta. Jam mulai harus setelah waktu sekarang. Jadwal hanya dapat diubah sebelum sesi dibuka.

Jika akun Auth berhasil dibuat tetapi profil gagal tersimpan, login kembali: halaman **Lengkapi profil** memungkinkan menyelesaikan profil tanpa membuat akun kedua.

## 4. Aktifkan backend sesi, presensi, dan klasifikasi AI

Tidak ada API pengajar atau ZIP guide yang tersedia saat implementasi. Repo ini menyediakan **baseline TF-IDF + Multinomial Naive Bayes** sendiri. Model bukan LLM dan tidak memakai kunci layanan AI eksternal. Dataset sintetis dan keterbatasannya dijelaskan di `functions/README.md`. Konfirmasikan dengan pengajar jika nantinya ada ketentuan model tertentu.

Untuk menjalankan backend di cloud, Firebase meminta project menggunakan paket **Blaze** dan billing aktif. Aktivasi billing dilakukan sendiri di Console setelah kamu memahami biaya project. Emulator lokal di bagian berikut dapat digunakan untuk latihan tanpa mengaktifkan billing.

```powershell
npm --prefix functions ci
npx firebase deploy --only functions --project PROJECT_ID_KAMU
```

Backend yang dibuat:

- `savePracticalSession`: membuat/mengubah sesi milik Asprak, memeriksa UID dan jadwal mendatang dengan waktu server.
- `joinAssistantClass`: Praktikan bergabung melalui UID Asprak; keanggotaan disimpan per peserta, tanpa batas array 100 UID.
- `changePracticalSession`: membuka sesi hanya dalam rentang jamnya, menutup, atau menghapus sesi.
- `generateAttendanceQr`: hanya Asprak pemilik sesi; token acak berlaku 15 menit atau sampai jam selesai, mana yang lebih awal. Generate ulang membatalkan token sebelumnya.
- `submitQrAttendance`: memeriksa peran, keanggotaan, QR, waktu sesi, GPS, dan duplikasi dalam transaksi.

- `classifyPermission`: callable API, hanya dapat dipanggil pemilik pengajuan atau Asisten yang menangani sesi itu.
- `analyzeNewPermission`: trigger Firestore sebagai pemroses latar belakang ketika izin dibuat.

Aplikasi menyimpan pengajuan dahulu, kemudian memanggil API. Trigger dan API aman dijalankan berulang: hasil selesai tidak ditulis ulang. Jika API/trigger belum aktif atau gagal, pengajuan tetap ada dengan status **Menunggu Pemeriksaan**. Asisten tetap bisa menerima/menolak tanpa hasil AI. Tombol **Coba klasifikasi AI** tersedia untuk mencoba kembali.

## 5. Alternatif: emulator lokal tanpa project/billing

CLI seri 14 di repo kompatibel dengan Java 17 yang tersedia pada komputer ini. Untuk pindah ke CLI 15+, gunakan Java 21+. Gunakan Node 22 untuk menyamakan runtime Cloud Functions, atau versi Node yang didukung dependensi aplikasi.

Di `.env.local`, cukup aktifkan:

```dotenv
EXPO_PUBLIC_USE_FIREBASE_EMULATORS=true
EXPO_PUBLIC_FIREBASE_EMULATOR_HOST=127.0.0.1
```

Di terminal pertama:

```powershell
npm --prefix functions ci
npm run emulators
```

Di terminal kedua:

```powershell
npx expo start --clear
```

Buka web di komputer yang sama. UI emulator berada di http://127.0.0.1:4000. Registrasi melalui aplikasi, lalu ubah `users/{uid}.role` di UI emulator Firestore untuk akun Asisten. Semua data ini lokal dan terpisah dari cloud. Secara default data emulator tidak dipertahankan saat proses dihentikan; untuk menyimpan demo lokal gunakan opsi CLI `--export-on-exit` dan `--import` pada folder khusus emulator.

Alamat `127.0.0.1` hanya untuk browser di komputer itu. Untuk mencoba ponsel, paling sederhana gunakan konfigurasi Firebase cloud. Jangan lupa mengubah `EXPO_PUBLIC_USE_FIREBASE_EMULATORS=false` sebelum memakai cloud.

## 6. Checklist dua akun

Gunakan browser biasa untuk Asisten dan browser incognito/perangkat lain untuk Praktikan (dua tab biasa berbagi sesi Auth).

1. Daftar dua akun dan tetapkan Asisten melalui Console. Pastikan Praktikan tidak memiliki menu ganti peran.
2. Buat sesi mendatang dengan UID Asprak. Praktikan menempel UID Asprak untuk bergabung. Akun yang belum bergabung tidak boleh melihat sesi.
3. Saat jam sesi tiba, Asisten membuka sesi dan menekan **Generate QR presensi → Tampilkan besar untuk TV**. Bagikan layar perangkat Asprak ke TV. Status pada Praktikan berubah tanpa refresh.
4. Praktikan membuka sesi → presensi → **Scan QR Asprak**, mengizinkan kamera dan lokasi, lalu konfirmasi. Presensi di luar 1 km ditolak. QR lama setelah generate ulang, QR lewat 15 menit, dan QR setelah jam selesai ditolak. Rekap berubah langsung; dua perangkat tidak menghasilkan duplikasi.
5. Asisten menutup sesi. Presensi baru ditolak.
6. Praktikan mengajukan izin pada sesi lain. Periksa nama, NIM, alasan, waktu, dan status menunggu. Pengajuan kedua untuk sesi sama ditolak.
7. Periksa kategori AI; gunakan alasan yang tidak dikenal untuk melihat kategori pemeriksaan manual. AI tidak mengubah status izin.
8. Asisten memfilter dan menerima/menolak izin. Praktikan melihat keputusan tanpa refresh; dokumen menyimpan UID pemeriksa dan timestamp server.
9. Matikan internet: banner koneksi muncul dan penyimpanan baru diblokir. Sambungkan lagi untuk sinkronisasi otomatis. Jika listener gagal, tekan **Muat ulang data**.
10. Logout, tutup aplikasi, dan login kembali: data cloud tetap tersedia. Login native memakai AsyncStorage untuk persistensi sesi, sedangkan data Firestore dimuat lagi dari server. Aplikasi tidak menyediakan antrean tulis offline.
11. Hapus sesi yang belum dibuka/selesai. Sesi hilang dari jadwal, tetapi riwayat tetap ada (soft delete untuk audit).

## Pemeriksaan otomatis

```powershell
npx expo lint
npx tsc --noEmit
npm run test:ai
npm run test:rules
npm run test:integration
```

Tes rules dan integrasi memakai project `demo-*`, bukan data Firebase sungguhan. Tutup emulator yang berjalan sebelum menjalankan perintah tes agar port tidak bertabrakan.

## Struktur data

| Koleksi | ID | Isi utama |
| --- | --- | --- |
| `users` | Firebase UID | Nama, NIM, email, peran |
| `sessions` | ID otomatis | Asisten pemilik, jadwal WIB, startsAt/endsAt, status, deleted |
| `enrollments` | `assistantId_studentId` | Keanggotaan kelas, nama dan NIM peserta |
| `attendanceChallenges` | `sessionId` | Hash QR terbaru dan waktu kedaluwarsa; tidak dapat dibaca client |
| `attendance` | `sessionId_UID` | Identitas peserta, sesi, timestamp server |
| `permissions` | `sessionId_UID` | Alasan, kategori/model AI, status, timestamp pengajuan/pemeriksaan, UID pemeriksa |

NIM adalah identitas tampilan yang diisi pengguna, bukan kunci autentikasi atau verifikasi status mahasiswa. UID Auth menjadi identitas database. Registrasi NIM tidak memverifikasi ke sistem akademik dan tidak menjamin NIM unik; pengelola perlu memverifikasi data peserta sebelum memasukkannya ke sesi.

## Jika ada masalah

- **Firebase belum dikonfigurasi**: periksa `.env.local`, bukan `.env.example`, lalu restart Expo.
- **Akses ditolak**: periksa rules sudah dipublish, profil `users/{uid}` ada, peran sesuai, dan Praktikan sudah bergabung memakai UID Asprak.
- **Email/Password belum aktif**: aktifkan provider di Authentication.
- **Izin tersimpan tetapi AI menunggu/gagal**: pastikan Functions sudah dideploy pada project dan region yang benar. Pengajuan tetap bisa diperiksa manual.
- **Port 8080/9099/5001 dipakai**: hentikan emulator lama sebelum menjalankan tes.
- **Java tidak tersedia**: pasang JDK yang sesuai dan pastikan `java -version` bisa dijalankan.

Referensi resmi: [Expo + Firebase](https://docs.expo.dev/guides/using-firebase/), [Auth email/password](https://firebase.google.com/docs/auth/web/password-auth), [Cloud Functions setup dan deployment](https://firebase.google.com/docs/functions/get-started), [Firebase Emulator](https://firebase.google.com/docs/emulator-suite/install_and_configure).

## Pembaruan dari alur lama

Data sesi dan riwayat lama tidak dihapus. Praktikan perlu bergabung sekali dengan UID Asprak agar jadwalnya terlihat melalui keanggotaan baru. Field lama `participantIds` tidak lagi dipakai untuk menentukan akses. Rekap memakai peserta yang bergabung sebelum waktu akhir sesi serta presensi yang sudah tersimpan.

Web harus memakai HTTPS (atau localhost) agar kamera/lokasi tersedia. Android/iOS perlu development build baru bila build sebelumnya belum menyertakan `expo-camera`; setelah memasang dependensi, gunakan build yang sesuai SDK 57. Uji kamera fisik dan akurasi GPS di lokasi sebelum pemakaian kelas.
