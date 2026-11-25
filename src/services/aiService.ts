type AIStatus = 'success' | 'failed' | 'unavailable';

export type AIClassificationResult = {
  category: string;
  confidence: number;
  explanation: string;
  status: AIStatus;
  persistedByBackend?: boolean;
  model?: string;
};

export type GeminiBackendHealth = {
  connected: boolean;
  model: string | null;
  error?: string | null;
};

// Deteksi endpoint proxy lokal khusus Web laptop (tidak memaksa APK Android memakai localhost)
export function getBackendBaseUrl(): string | null {
  const configured = process.env.EXPO_PUBLIC_AI_API_URL;
  if (configured && configured.trim()) {
    return configured.trim().replace(/\/+$/, '').replace(/\/api\/classify$/, '');
  }

  return null;
}

// Periksa kesehatan backend AI dan status koneksi nyata Gemini API
export async function checkGeminiBackendHealth(): Promise<GeminiBackendHealth> {
  const baseUrl = getBackendBaseUrl();
  if (!baseUrl) {
    return { connected: false, model: null, error: 'Mode non-lokal' };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(`${baseUrl}/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) {
      return { connected: false, model: null, error: `HTTP ${response.status}` };
    }
    const data = await response.json();
    return {
      connected: Boolean(data?.geminiConnected && data?.model),
      model: data?.model || null,
      error: data?.error || null,
    };
  } catch {
    return { connected: false, model: null, error: 'Backend proxy lokal belum aktif' };
  }
}

// Heuristik lokal hanya digunakan sebagai fallback berlabel eksplisit [SIMULASI LOKAL]
function classifyReasonLocally(reason: string): { category: string; confidence: number; explanation: string } {
  const lower = reason.toLowerCase();
  let baseCategory = 'Lain-lain';
  let confidence = 0.7;
  let detail = 'Alasan memerlukan peninjauan manual langsung oleh asisten praktikum.';

  if (lower.match(/sakit|demam|flu|batuk|puskesmas|rumah sakit|dokter|opname|tenggorokan|mual|muntah/)) {
    baseCategory = 'Sakit';
    confidence = 0.9;
    detail = 'Terdeteksi indikasi masalah kesehatan atau kondisi medis.';
  } else if (lower.match(/lomba|seminar|konferensi|workshop|kuliah|tugas|ujian|magang|studi|akademik|sidang/)) {
    baseCategory = 'Kegiatan Akademik';
    confidence = 0.85;
    detail = 'Terdeteksi indikasi penugasan akademik atau kompetisi kemahasiswaan.';
  } else if (lower.match(/keluarga|dika|duka|meninggal|orang tua|saudara|pernikahan|hajatan/)) {
    baseCategory = 'Urusan Keluarga';
    confidence = 0.85;
    detail = 'Terdeteksi indikasi keperluan keluarga mendesak.';
  } else if (lower.match(/banjir|bencana|kecelakaan|macet parah|kendaraan mogok|ban bocor/)) {
    baseCategory = 'Kondisi Darurat';
    confidence = 0.8;
    detail = 'Terdeteksi indikasi keadaan darurat insidental di luar kendali.';
  }

  return {
    category: `[SIMULASI LOKAL] ${baseCategory}`,
    confidence,
    explanation: `${detail} (Simulasi lokal; Gemini AI alternatif tidak aktif pada mode ini).`,
  };
}

/**
 * Klasifikasi alasan izin praktikan melalui backend proxy lokal tepercaya (Gemini API alternatif).
 *
 * Keamanan:
 * - Tidak menyimpan GEMINI_API_KEY di sisi klien (hanya di backend 127.0.0.1:3001).
 * - Mengirim hanya teks alasan izin dan leaveId beserta Firebase ID token terverifikasi.
 * - Kegagalan AI tidak pernah membatalkan pengajuan izin; keputusan mutlak ada pada Asisten.
 */
export async function classifyLeaveReason(
  reason: string,
  options?: { leaveId?: string; idToken?: string }
): Promise<AIClassificationResult> {
  const cleanReason = reason.trim();
  if (!cleanReason) {
    return {
      category: 'Lain-lain',
      confidence: 0,
      explanation: 'Alasan kosong.',
      status: 'failed',
    };
  }

  const baseUrl = getBackendBaseUrl();
  if (!baseUrl) {
    const localResult = classifyReasonLocally(cleanReason);
    return {
      ...localResult,
      status: 'unavailable',
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    const response = await fetch(`${baseUrl}/api/classify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(options?.idToken ? { Authorization: `Bearer ${options.idToken}` } : {}),
      },
      body: JSON.stringify({
        reason: cleanReason,
        ...(options?.leaveId ? { leaveId: options.leaveId } : {}),
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 503 && data?.status === 'unavailable') {
        const localResult = classifyReasonLocally(cleanReason);
        return {
          ...localResult,
          status: 'unavailable',
        };
      }
      throw new Error(data?.error || `Backend AI proxy merespons HTTP ${response.status}`);
    }

    return {
      category: data.category || 'Lain-lain',
      confidence: typeof data.confidence === 'number' ? data.confidence : 0.85,
      explanation: data.explanation || 'Dianalisis oleh Gemini AI (API alternatif).',
      status: 'success',
      persistedByBackend: Boolean(data.persistedByBackend),
      model: data.model,
    };
  } catch (err: unknown) {
    console.warn('Komunikasi AI gagal, mengaktifkan fail-safe lokal:', err instanceof Error ? err.message : 'Layanan tidak tersedia');
    const localFallback = classifyReasonLocally(cleanReason);
    return {
      ...localFallback,
      status: 'failed',
      explanation: `${localFallback.explanation} (Layanan Gemini AI gagal dijangkau; silakan verifikasi manual).`,
    };
  }
}
