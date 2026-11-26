import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { INITIAL_VLI_DATA, INITIAL_VLI_DQ } from './src/data/initialLogisticsData.ts';
import type { SourceKey, SourceState } from './src/types/logistics.ts';

const DEFAULT_SOURCES: Record<SourceKey, SourceState> = {
  TRP: {
    key: 'TRP',
    label: 'Master Data - TRP',
    data: null,
    dq: null,
    meta: null,
    isDefault: true,
  },
  VLI: {
    key: 'VLI',
    label: 'Master Data - VLI',
    data: INITIAL_VLI_DATA,
    dq: INITIAL_VLI_DQ,
    meta: {
      file: 'Data awal (bawaan dashboard)',
      at: '',
      prod: 'VLI',
    },
    isDefault: true,
  },
};

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_FILE = path.join(DATA_DIR, 'sources_store.json');

let sourcesState: Record<SourceKey, SourceState> = { ...DEFAULT_SOURCES };
let lastUpdatedAt = Date.now();

function initStore(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(STORE_FILE)) {
      const raw = fs.readFileSync(STORE_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && parsed.sources) {
        sourcesState = {
          TRP: parsed.sources.TRP || DEFAULT_SOURCES.TRP,
          VLI: parsed.sources.VLI || DEFAULT_SOURCES.VLI,
        };
        lastUpdatedAt = parsed.updatedAt || Date.now();
        console.log('[Server] Loaded persisted sources from disk');
      }
    }
  } catch (err) {
    console.error('[Server] Failed to load persisted sources:', err);
  }
}

function saveStore(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const payload = JSON.stringify({
      sources: sourcesState,
      updatedAt: lastUpdatedAt,
    });
    fs.writeFileSync(STORE_FILE, payload, 'utf-8');
  } catch (err) {
    console.error('[Server] Failed to save sources to disk:', err);
  }
}

async function startServer(): Promise<void> {
  initStore();
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Accept up to 50MB JSON payloads for Excel parsed records
  app.use(express.json({ limit: '50mb' }));

  // API Routes
  app.get('/api/sources', (_req, res) => {
    res.json({
      sources: sourcesState,
      updatedAt: lastUpdatedAt,
    });
  });

  app.post('/api/sources', (req, res) => {
    const { key, sourceState } = req.body;
    if (!key || (key !== 'TRP' && key !== 'VLI')) {
      res.status(400).json({ error: 'Invalid source key' });
      return;
    }
    sourcesState[key as SourceKey] = {
      ...sourcesState[key as SourceKey],
      ...sourceState,
    };
    lastUpdatedAt = Date.now();
    saveStore();
    res.json({
      success: true,
      sources: sourcesState,
      updatedAt: lastUpdatedAt,
    });
  });

  app.post('/api/sources/reset', (req, res) => {
    const { key } = req.body;
    if (!key || (key !== 'TRP' && key !== 'VLI')) {
      res.status(400).json({ error: 'Invalid source key' });
      return;
    }
    sourcesState[key as SourceKey] = { ...DEFAULT_SOURCES[key as SourceKey] };
    lastUpdatedAt = Date.now();
    saveStore();
    res.json({
      success: true,
      sources: sourcesState,
      updatedAt: lastUpdatedAt,
    });
  });

  app.get('/api/maps-config', (_req, res) => {
    const apiKey =
      process.env.VITE_GOOGLE_MAPS_API_KEY ||
      process.env.GOOGLE_MAPS_API_KEY ||
      '';
    res.setHeader('Cache-Control', 'no-store');
    res.json({ apiKey: apiKey.trim() });
  });

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', updatedAt: lastUpdatedAt });
  });

  let sharedAiClient: GoogleGenAI | null = null;
  const getAiClient = (apiKey: string) => {
    if (!sharedAiClient) {
      sharedAiClient = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
    }
    return sharedAiClient;
  };

  app.post('/api/ai/chat', async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        res.status(500).json({
          error:
            'GEMINI_API_KEY belum terkonfigurasi di server. Silakan periksa Settings > Secrets.',
        });
        return;
      }

      const { message, history = [], contextSummary } = req.body ?? {};
      if (!message || typeof message !== 'string') {
        res.status(400).json({ error: 'Pesan tidak boleh kosong.' });
        return;
      }

      const ai = getAiClient(apiKey);

      const nowJakarta = new Intl.DateTimeFormat('id-ID', {
        timeZone: 'Asia/Jakarta',
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date());

      const systemInstruction = `Kamu adalah Asisten AI LogiFlow Revenue (Logistics Jakarta) yang ramah, hangat, sopan, dan profesional.
Waktu saat ini (WIB / Jakarta): ${nowJakarta}.

CARA MENJAWAB:
1. **Obrolan Santai / Sapaan** (misal: "halo", "apa kabar", "terima kasih", "hari ini hari apa?", "siapa kamu?"):
   - Jawab dengan ramah, natural, dan hangat dalam 1–2 kalimat singkat (tidak perlu pakai heading atau daftar).
   - Jika ditanya hari/tanggal/jam hari ini, jawab akurat sesuai waktu WIB di atas.
2. **Pertanyaan Data & Bisnis Dashboard**:
   - Jawab langsung, akurat, dan profesional berdasarkan KONTEKS DATA. Format Rupiah mudah dibaca (misal Rp1,25 M / Rp450,2 jt). Jangan mengarang angka.
   - Awali dengan 1 kalimat ringkas pembuka.
   - Pisahkan bagian dengan heading Markdown (contoh: "### Ringkasan Performa", "### Customer Naik (Top Gainers)", "### Customer Turun (Top Decliners)").
   - WAJIB letakkan setiap poin atau item daftar di baris baru (gunakan "\\n"), JANGAN PERNAH menggabungkan daftar bernomor dalam satu paragraf.
   - Gunakan **tebal** untuk nama customer, metrik utama, dan angka penting.
   - Jika ada catatan/konteks tambahan, tulis di baris baru diawali "> Catatan: ...".
3. **Permintaan Ekspor Excel (.xlsx)**:
   - Jika pengguna meminta data/ekspor/file Excel (.xlsx), isi "excelExport":
     - shouldExport: true
     - title: judul singkat
     - filename: nama-file.xlsx
     - customerQueries: array nama customer yang cocok dari konteks ([] jika semua)
     - months: array "YYYY-MM" dari availableMonths ([] jika semua; "3 bulan terakhir" = 3 bulan terbaru di availableMonths)
     - source: "all" | "VLI" | "TRP"
     - groupBy: "so" | "monthly" | "customer"
   - Jika tidak meminta ekspor, set shouldExport: false.

KONTEKS DATA:
${JSON.stringify(contextSummary ?? {})}`;

      const conversationContents = [
        ...((Array.isArray(history) ? history : []).slice(-4).map((h: { role?: string; text?: string }) => ({
          role: h.role === 'model' ? 'model' : 'user',
          parts: [{ text: String(h.text ?? '') }],
        }))),
        {
          role: 'user',
          parts: [{ text: message }],
        },
      ];

      const generateWithModel = async (modelName: string) =>
        ai.models.generateContent({
          model: modelName,
          contents: conversationContents,
          config: {
            systemInstruction,
            thinkingConfig: {
              thinkingLevel:
                modelName === 'gemini-3.1-flash-lite'
                  ? ThinkingLevel.MINIMAL
                  : ThinkingLevel.LOW,
            },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                answer: {
                  type: Type.STRING,
                  description: 'Jawaban langsung, singkat, dan akurat dalam Bahasa Indonesia.',
                },
                excelExport: {
                  type: Type.OBJECT,
                  properties: {
                    shouldExport: { type: Type.BOOLEAN },
                    title: { type: Type.STRING },
                    filename: { type: Type.STRING },
                    customerQueries: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                    months: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                    source: { type: Type.STRING },
                    groupBy: { type: Type.STRING },
                  },
                  required: ['shouldExport'],
                },
              },
              required: ['answer', 'excelExport'],
            },
          },
        });

      const isTransientError = (err: unknown): boolean => {
        const msg = err instanceof Error ? err.message : String(err ?? '');
        return /503|UNAVAILABLE|high demand|overloaded|429|RESOURCE_EXHAUSTED/i.test(msg);
      };

      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

      let response;
      const attempts: Array<{ model: string; delayMs: number }> = [
        { model: 'gemini-4-hydrogen', delayMs: 0 },
        { model: 'gemini-4-hydrogen', delayMs: 800 },
        { model: 'gemini-3.1-flash-lite', delayMs: 400 },
      ];

      let lastErr: unknown = null;
      for (const attempt of attempts) {
        if (attempt.delayMs > 0) await sleep(attempt.delayMs);
        try {
          response = await generateWithModel(attempt.model);
          lastErr = null;
          break;
        } catch (err: unknown) {
          lastErr = err;
          console.warn(`[Server] /api/ai/chat attempt (${attempt.model}) failed:`, err);
          if (!isTransientError(err)) break;
        }
      }

      if (!response) {
        throw lastErr ?? new Error('Layanan AI tidak merespons.');
      }

      const rawText = (response.text ?? '').trim();
      let parsed: { answer: string; excelExport?: Record<string, unknown> };
      try {
        parsed = JSON.parse(rawText);
      } catch {
        parsed = { answer: rawText || 'Maaf, saya tidak dapat memproses jawaban saat ini.' };
      }

      res.json(parsed);
    } catch (err: unknown) {
      console.error('[Server] /api/ai/chat error:', err);
      const rawMsg = err instanceof Error ? err.message : String(err ?? '');
      let friendlyMsg = 'Terjadi kesalahan saat menghubungi layanan AI. Silakan coba lagi.';
      if (/503|UNAVAILABLE|high demand|overloaded/i.test(rawMsg)) {
        friendlyMsg =
          'Server AI sedang mengalami lonjakan trafik sementara (503). Silakan kirim ulang pertanyaan Anda beberapa detik lagi.';
      } else if (/429|RESOURCE_EXHAUSTED/i.test(rawMsg)) {
        friendlyMsg =
          'Kuota permintaan AI sedang padat sementara. Silakan tunggu sebentar lalu coba lagi.';
      } else if (/API_KEY_INVALID|PERMISSION_DENIED|403|401/i.test(rawMsg)) {
        friendlyMsg =
          'Kunci API AI tidak valid atau belum memiliki akses. Silakan periksa di Settings > Secrets.';
      }
      res.status(503).json({ error: friendlyMsg });
    }
  });

  // Mount Vite middleware in development or static files in production
  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(
      express.static(distDir, {
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('index.html')) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
          }
        },
      })
    );
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`LogiFlow Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
