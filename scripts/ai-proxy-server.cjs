/**
 * Server Proxy Backend Tepercaya untuk Gemini AI (Khusus Demo Laptop)
 *
 * Penggunaan:
 * node scripts/ai-proxy-server.cjs
 *
 * Keamanan:
 * - Berjalan khusus di 127.0.0.1:3001 (tidak mengekspos GEMINI_API_KEY ke bundle klien).
 * - Verifikasi Firebase ID token dan hak akses dokumen izin sebelum memanggil Gemini.
 * - Hanya mengirim alasan izin (tanpa nama, NIM, email, atau UID) ke Gemini REST API.
 * - Membatasi CORS, ukuran body (4KB), timeout (10s), dan rate limit (20 req/menit).
 * - Menyimpan hasil klasifikasi tervalidasi ke Firestore melalui akun backend tepercaya.
 * - Tidak pernah menerima atau menolak pengajuan izin secara otomatis.
 */

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');

function loadEnvFile(filePath, { override = false } = {}) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (override || process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

// Muat env backend lokal terlebih dahulu, lalu .env untuk konfigurasi publik Firebase
loadEnvFile(path.join(ROOT_DIR, '.env.backend.local'), { override: true });
loadEnvFile(path.join(ROOT_DIR, '.env.local'), { override: false });
loadEnvFile(path.join(ROOT_DIR, '.env'), { override: false });

const HOST = '127.0.0.1';
const PORT = Number(process.env.AI_PROXY_PORT || process.env.PORT || 3001);
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || '').trim();
const PREFERRED_GEMINI_MODEL = (process.env.GEMINI_MODEL || '').trim();
const FIREBASE_PROJECT_ID = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || '';

const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS || 'http://localhost:8081,http://127.0.0.1:8081')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
);

const MAX_BODY_BYTES = 4096;
const UPSTREAM_TIMEOUT_MS = 10000;
const RATE_LIMIT_WINDOW_MS = 60000;
const RATE_LIMIT_MAX_REQUESTS = 20;

const ALLOWED_CATEGORIES = [
  'Sakit',
  'Kegiatan Akademik',
  'Urusan Keluarga',
  'Kondisi Darurat',
  'Lain-lain',
];

const PREFERRED_MODELS = [
  ...(PREFERRED_GEMINI_MODEL ? [PREFERRED_GEMINI_MODEL] : []),
  'gemini-3.5-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash',
  'gemini-flash-latest',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash',
];

const rateBuckets = new Map();
let geminiState = {
  checkedAt: 0,
  geminiConnected: false,
  model: null,
  lastError: GEMINI_API_KEY ? 'Belum diverifikasi' : 'GEMINI_API_KEY belum diisi di .env.backend.local',
};
let adminApp;
function adminServices() {
  const { initializeApp, applicationDefault } = require('../functions/node_modules/firebase-admin/app');
  const { getFirestore } = require('../functions/node_modules/firebase-admin/firestore');
  const { getAuth } = require('../functions/node_modules/firebase-admin/auth');
  if (!FIREBASE_PROJECT_ID) throw new Error('Isi EXPO_PUBLIC_FIREBASE_PROJECT_ID pada .env.local.');
  if (!adminApp) adminApp = initializeApp({ projectId: FIREBASE_PROJECT_ID, ...(process.env.FIRESTORE_EMULATOR_HOST ? {} : { credential: applicationDefault() }) }, 'gemini-proxy');
  return { db: getFirestore(adminApp), auth: getAuth(adminApp) };
}

function isRateLimited(key) {
  const now = Date.now();
  const recent = (rateBuckets.get(key) || []).filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX_REQUESTS) {
    rateBuckets.set(key, recent);
    return true;
  }
  recent.push(now);
  rateBuckets.set(key, recent);
  return false;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = UPSTREAM_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function sendJson(res, statusCode, payload, allowedOrigin = null) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  };
  if (allowedOrigin) {
    headers['Access-Control-Allow-Origin'] = allowedOrigin;
    headers['Vary'] = 'Origin';
  }
  res.writeHead(statusCode, headers);
  res.end(JSON.stringify(payload));
}

function readRequestBody(req, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let oversized = false;
    req.on('data', (chunk) => {
      if (oversized) return;
      total += chunk.length;
      if (total > maxBytes) {
        oversized = true;
        const err = new Error('Payload melebihi batas ukuran maksimum (4KB).');
        err.statusCode = 413;
        reject(err);
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!oversized) resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', reject);
  });
}

async function verifyGeminiFreeTierModel(forceRefresh = false) {
  const apiKey = (process.env.GEMINI_API_KEY || GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    geminiState = {
      checkedAt: Date.now(),
      geminiConnected: false,
      model: null,
      lastError: 'GEMINI_API_KEY belum diisi di .env.backend.local',
    };
    return geminiState;
  }

  const now = Date.now();
  if (!forceRefresh && geminiState.checkedAt && now - geminiState.checkedAt < 600000 && geminiState.geminiConnected) {
    return geminiState;
  }

  try {
    const resp = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
      { method: 'GET' },
      8000
    );
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(data?.error?.message || `HTTP ${resp.status}`);
    }

    const models = Array.isArray(data.models) ? data.models : [];
    const flashCandidates = models
      .filter(
        (m) =>
          Array.isArray(m.supportedGenerationMethods) &&
          m.supportedGenerationMethods.includes('generateContent') &&
          typeof m.name === 'string' &&
          m.name.toLowerCase().includes('flash') &&
          !/-(tts|image)|omni/i.test(m.name)
      )
      .map((m) => m.name.replace(/^models\//, ''));

    const orderedCandidates = [
      ...PREFERRED_MODELS.filter((pref) => flashCandidates.includes(pref)),
      ...flashCandidates.filter((c) => !PREFERRED_MODELS.includes(c)),
    ];

    let chosen = null;
    let lastProbeErr = '';
    for (const candidate of orderedCandidates.slice(0, 5)) {
      const probeResp = await fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(candidate)}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: 'OK' }] }],
            generationConfig: { maxOutputTokens: 5 },
          }),
        },
        8000
      );
      if (probeResp.ok) {
        chosen = candidate;
        break;
      }
      const errJson = await probeResp.json().catch(() => ({}));
      lastProbeErr = errJson?.error?.message || `HTTP ${probeResp.status}`;
    }

    if (!chosen) {
      throw new Error(lastProbeErr || 'Tidak ditemukan model Gemini Flash / Flash-Lite aktif pada akun Free Tier ini.');
    }

    geminiState = {
      checkedAt: now,
      geminiConnected: true,
      model: chosen,
      lastError: null,
    };
  } catch (err) {
    geminiState = {
      checkedAt: now,
      geminiConnected: false,
      model: null,
      lastError: err.message || 'Gagal memverifikasi Gemini API',
    };
  }
  return geminiState;
}

async function verifyFirebaseIdToken(idToken) {
  try { return await adminServices().auth.verifyIdToken(idToken); }
  catch { const error = new Error('Token Firebase tidak valid atau sudah kedaluwarsa.'); error.statusCode = 401; throw error; }
}

async function readFirestoreDoc(docPath) {
  const snapshot = await adminServices().db.doc(docPath).get();
  if (!snapshot.exists) return null;
  return Object.fromEntries(Object.entries(snapshot.data()).map(([key, value]) => [key, { stringValue: value }]));
}

async function writeAiResultToFirestore(leaveId, aiResult) {
  const { db } = adminServices();
  const ref = db.doc(`permissions/${leaveId}`);
  await db.runTransaction(async tx => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) throw new Error('Pengajuan tidak ditemukan.');
    tx.update(ref, { aiCategory: aiResult.category, aiConfidence: aiResult.confidence, aiExplanation: aiResult.explanation, aiStatus: 'completed', aiModelVersion: aiResult.model });
  });
}

async function classifyWithGemini(reasonOnly, modelName) {
  const apiKey = (process.env.GEMINI_API_KEY || GEMINI_API_KEY || '').trim();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const systemPrompt =
    'Anda asisten klasifikasi alasan izin praktikum mahasiswa. ' +
    'Tugas Anda HANYA mengklasifikasikan alasan ke tepat satu kategori berikut: ' +
    '"Sakit", "Kegiatan Akademik", "Urusan Keluarga", "Kondisi Darurat", atau "Lain-lain". ' +
    'Berikan confidence (0.0 sampai 1.0) dan explanation singkat 1 kalimat dalam bahasa Indonesia. ' +
    'JANGAN pernah menyetujui atau menolak pengajuan izin.';

  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: `Alasan izin praktikan: "${reasonOnly}"` }] }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 200,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          category: { type: 'STRING', enum: ALLOWED_CATEGORIES },
          confidence: { type: 'NUMBER' },
          explanation: { type: 'STRING' },
        },
        required: ['category', 'confidence', 'explanation'],
      },
    },
  };

  const resp = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    UPSTREAM_TIMEOUT_MS
  );

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data?.error?.message || `Gemini API HTTP ${resp.status}`);
  }

  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    throw new Error('Respons Gemini kosong.');
  }

  const parsed = JSON.parse(rawText);
  const category = ALLOWED_CATEGORIES.includes(parsed.category) ? parsed.category : 'Lain-lain';
  const rawConf = typeof parsed.confidence === 'number' ? parsed.confidence : 0.85;
  const confidence = Math.max(0, Math.min(1, Number(rawConf.toFixed(2))));
  const cleanExpl = String(parsed.explanation || 'Memerlukan peninjauan manual asisten.')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);

  return {
    category,
    confidence,
    explanation: `[Gemini AI • ${modelName}] ${cleanExpl}`,
    status: 'success',
    model: modelName,
  };
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  const isOriginAllowed = !origin || ALLOWED_ORIGINS.has(origin);
  const corsOrigin = origin && isOriginAllowed ? origin : null;

  if (origin && !isOriginAllowed) {
    sendJson(res, 403, { error: 'Origin tidak diizinkan oleh kebijakan CORS proxy lokal.' });
    return;
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      ...(corsOrigin ? { 'Access-Control-Allow-Origin': corsOrigin, Vary: 'Origin' } : {}),
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    const state = await verifyGeminiFreeTierModel(false);
    sendJson(
      res,
      200,
      {
        status: 'ok',
        service: 'praktiKu-ai-proxy',
        geminiConnected: state.geminiConnected,
        model: state.model,
        mode: state.geminiConnected ? 'gemini_live' : 'unavailable',
        error: state.lastError,
        uptime: process.uptime(),
      },
      corsOrigin
    );
    return;
  }

  if (req.method === 'POST' && req.url === '/api/classify') {
    try {
      const authHeader = req.headers.authorization || '';
      const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
      if (!idToken) {
        sendJson(res, 401, { error: 'Authorization Bearer Firebase ID token wajib disertakan.' }, corsOrigin);
        return;
      }

      const rawBody = await readRequestBody(req);
      let parsedBody;
      try {
        parsedBody = JSON.parse(rawBody || '{}');
      } catch {
        sendJson(res, 400, { error: 'Body JSON tidak valid.' }, corsOrigin);
        return;
      }

      const rawReason = typeof parsedBody.reason === 'string' ? parsedBody.reason.replace(/\s+/g, ' ').trim() : '';
      const leaveId = typeof parsedBody.leaveId === 'string' ? parsedBody.leaveId.trim() : '';

      if (!rawReason || rawReason.length > 2000) {
        sendJson(res, 400, { error: 'Field "reason" wajib diisi (maksimal 2000 karakter).' }, corsOrigin);
        return;
      }
      if (!leaveId || !/^[a-zA-Z0-9_-]{3,300}$/.test(leaveId)) {
        sendJson(res, 400, { error: 'Field "leaveId" wajib diisi dengan format valid.' }, corsOrigin);
        return;
      }

      const { uid: callerUid } = await verifyFirebaseIdToken(idToken);
      const clientIp = req.socket?.remoteAddress || '127.0.0.1';
      if (isRateLimited(`${clientIp}:${callerUid}`)) {
        sendJson(res, 429, { error: 'Terlalu banyak permintaan klasifikasi. Coba lagi sebentar.' }, corsOrigin);
        return;
      }

      // Verifikasi hak akses dokumen izin di Firestore
      const leaveFields = await readFirestoreDoc(`permissions/${encodeURIComponent(leaveId)}`, idToken);
      if (!leaveFields) {
        sendJson(res, 404, { error: 'Dokumen pengajuan izin tidak ditemukan.' }, corsOrigin);
        return;
      }
      const docStudentUid = leaveFields.studentId?.stringValue || '';
      if (docStudentUid !== callerUid) {
        const userFields = await readFirestoreDoc(`users/${encodeURIComponent(callerUid)}`, idToken);
        const callerRole = userFields?.role?.stringValue || '';
        if (callerRole !== 'Asisten' || leaveFields.assistantId?.stringValue !== callerUid) {
          sendJson(res, 403, { error: 'Anda tidak memiliki izin menganalisis pengajuan ini.' }, corsOrigin);
          return;
        }
      }

      // Verifikasi ketersediaan Gemini Free Tier
      const state = await verifyGeminiFreeTierModel(false);
      if (!state.geminiConnected || !state.model) {
        sendJson(
          res,
          503,
          {
            error: state.lastError || 'Gemini API belum terhubung.',
            status: 'unavailable',
            geminiConnected: false,
          },
          corsOrigin
        );
        return;
      }

      // Kirim HANYA alasan izin (tanpa identitas pribadi apa pun) ke Gemini
      const aiResult = await classifyWithGemini(leaveFields.reason.stringValue, state.model);

      // Simpan hasil terstruktur ke Firestore melalui akun backend tepercaya
      let persistedByBackend = false;
      try {
        await writeAiResultToFirestore(leaveId, aiResult);
        persistedByBackend = true;
      } catch (persistErr) {
        console.warn('[AI Proxy] Gagal menyimpan hasil AI ke Firestore:', persistErr.message);
      }

      sendJson(
        res,
        200,
        {
          ...aiResult,
          geminiConnected: true,
          persistedByBackend,
        },
        corsOrigin
      );
    } catch (err) {
      const code = err.statusCode || 502;
      sendJson(
        res,
        code,
        { error: err.message || 'Gagal memproses klasifikasi Gemini.', status: 'failed' },
        corsOrigin
      );
    }
    return;
  }

  sendJson(res, 404, { error: 'Endpoint tidak ditemukan.' }, corsOrigin);
});

if (require.main === module) {
  server.listen(PORT, HOST, async () => {
    const state = await verifyGeminiFreeTierModel(true);
    console.log(`[AI Proxy Backend] Berjalan khusus laptop di http://${HOST}:${PORT}`);
    console.log(
      `[AI Proxy Backend] Status Gemini: ${state.geminiConnected ? `TERHUBUNG (${state.model})` : `BELUM TERHUBUNG (${state.lastError})`}`
    );
  });
}

module.exports = server;
