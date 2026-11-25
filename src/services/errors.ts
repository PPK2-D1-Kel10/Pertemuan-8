export function errorMessage(error: unknown): string {
  const code = (error as { code?: string })?.code;
  const messages: Record<string, string> = {
    'auth/invalid-credential': 'Email atau kata sandi salah.',
    'auth/invalid-email': 'Format email tidak valid.',
    'auth/email-already-in-use': 'Email sudah terdaftar. Silakan masuk.',
    'auth/weak-password': 'Gunakan kata sandi minimal 8 karakter.',
    'auth/too-many-requests': 'Terlalu banyak percobaan. Tunggu beberapa saat.',
    'auth/network-request-failed': 'Tidak dapat terhubung. Periksa koneksi internet.',
    'auth/operation-not-allowed': 'Login Email/Password belum diaktifkan di Firebase Authentication.',
    'permission-denied': 'Akses ditolak. Periksa hak akses akun dan Firestore Security Rules.',
    'unavailable': 'Server belum dapat dihubungi. Periksa koneksi lalu coba lagi.',
    'failed-precondition': 'Operasi belum dapat dijalankan. Periksa konfigurasi Firestore.',
    'functions/not-found': 'Layanan tidak ditemukan. Periksa data yang dimasukkan dan pastikan Cloud Functions terbaru sudah dideploy.',
    'functions/internal': 'Server belum dapat memproses permintaan. Coba lagi.',
    'functions/unavailable': 'Server tidak dapat dihubungi. Coba lagi nanti.',
    'functions/deadline-exceeded': 'Server terlalu lama merespons. Coba lagi nanti.',
  };
  return (code && messages[code]) || (error instanceof Error ? error.message : 'Terjadi kesalahan. Silakan coba lagi.');
}
