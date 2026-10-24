import express from "express";
import path from "path";
import fs from "fs";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import compression from "compression";
import sharp from "sharp";
import { normArea, areaPrefix, areaFromName, sameArea, pickByArea, getTargetYL } from "./areaUtils.ts";
import { buildAiDataContext, buildPeriodContext, monthKeysForPeriod, resolveActiveMonth } from "./aiDataContext.ts";
import { findFaqAnswer, isWorkRelatedQuery } from "./src/lib/yakultFaq.ts";

dotenv.config();

const app = express();

// Determine whether we are running as the development dev-server inside AI Studio sandbox
// or as the production deployment in Cloud Run.
const portArgIdx = process.argv.indexOf("--port");
const argPort = portArgIdx !== -1 && process.argv[portArgIdx + 1] ? parseInt(process.argv[portArgIdx + 1], 10) : null;

const isDev =
  process.env.npm_lifecycle_event === "dev" ||
  argPort !== null ||
  (process.env.NODE_ENV !== "production" &&
   process.env.npm_lifecycle_event !== "start" &&
   Boolean(process.env.NGINX_PORT) &&
   fs.existsSync("/etc/nginx/nginx.conf"));

// In dev sandbox: Nginx listens on port 8080 and proxies to port 3000 (DEFAULT_APP_PORT).
// In production Cloud Run: Cloud Run routes ingress traffic directly to process.env.PORT (typically 8080).
const PORT = argPort
  ? argPort
  : process.env.PORT
  ? parseInt(process.env.PORT, 10)
  : isDev
  ? parseInt(process.env.DEFAULT_APP_PORT || "3000", 10)
  : parseInt(process.env.DEFAULT_APP_PORT || "8080", 10);

const isProduction = !isDev;
const DATA_FILE = path.join(process.cwd(), "data.json");

// Helper kompresi gambar server-side agar aset di Supabase Media selalu ringan (<30KB per foto)
async function compressBase64Image(base64Str: string, maxSize = 300, quality = 75): Promise<string> {
  if (!base64Str || typeof base64Str !== "string") return base64Str;
  const match = base64Str.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
  if (!match) return base64Str;
  try {
    const buffer = Buffer.from(match[2], "base64");
    const compressedBuffer = await sharp(buffer)
      .resize({ width: maxSize, height: maxSize, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality, progressive: true })
      .toBuffer();
    return `data:image/jpeg;base64,${compressedBuffer.toString("base64")}`;
  } catch (err) {
    console.warn("Gagal kompresi foto server-side:", err);
    return base64Str;
  }
}

app.use(compression() as any);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
// Replit routes /api to its shared API service. This prefix maps JOSS browser
// requests back to the existing /api handlers without changing their contracts.
app.use((req, _res, next) => {
  if (req.url === "/joss-api" || req.url.startsWith("/joss-api/")) {
    req.url = req.url.replace(/^\/joss-api(?=\/|$)/, "/api");
  }
  next();
});

// PENGAMAN: Express 4 tidak menangkap error dari handler async. Tanpa ini, kalau
// penyimpanan ke Supabase gagal (dan sekarang memang dilempar sebagai error), request
// akan menggantung. Semua handler dibungkus supaya error diteruskan ke error handler
// global (balasan 500 berisi pesan error), sehingga UI tahu simpan GAGAL.
for (const m of ["get", "post", "put", "delete", "patch", "all"] as const) {
  const orig = (app as any)[m].bind(app);
  (app as any)[m] = (path: any, ...handlers: any[]) => {
    if (m === "get" && handlers.length === 0) return orig(path); // app.get("setting")
    return orig(
      path,
      ...handlers.map((h: any) =>
        typeof h === "function"
          ? (req: any, res: any, next: any) => {
              try {
                const r = h(req, res, next);
                if (r && typeof r.catch === "function") r.catch(next);
              } catch (e) {
                next(e);
              }
            }
          : h
      )
    );
  };
}

// Cloud Run and container health check endpoints
app.get(["/health", "/healthz"], (_req, res) => {
  res.status(200).json({ status: "ok" });
});

// ---------------------------------------------------------------------------
// GERBANG DATA untuk semua /api
// 1) Tunggu data Supabase selesai dimuat SEBELUM melayani request. Dulu server
//    langsung melayani request memakai data lokal/seed saat Supabase masih dimuat,
//    sehingga simpan di jendela itu bisa menimpa Supabase dengan data seed.
// 2) Kalau Supabase gagal dibaca, TOLAK penulisan (503) daripada menimpa data asli.
// 3) Penulisan diserialkan per-instance dan didahului penyegaran dari Supabase,
//    supaya instance yang cache-nya basi tidak menimpa data instance lain.
// ---------------------------------------------------------------------------
const DB_LOCK_EXEMPT = new Set([
  "/ai/chat", "/ai/evaluate-presentasi", "/gemini/evaluate", "/gemini/evaluate-yl",
  "/exportRealisasi", "/saveSupabaseConfig", "/saveSupabaseMediaConfig", "/migrateMediaToStorage", "/uploadMedia", "/deleteMediaFolder", "/mediaStatus",
]);
let dbLockTail: Promise<void> = Promise.resolve();
function acquireDbLock(): Promise<() => void> {
  let release!: () => void;
  const prev = dbLockTail;
  dbLockTail = new Promise<void>((r) => { release = r; });
  return prev.then(() => release);
}

app.use("/api", async (req, res, next) => {
  let release: (() => void) | null = null;
  let released = false;
  const safeRelease = () => { if (!released && release) { released = true; release(); } };
  try {
    await ensureDbReady();
    const isWrite = req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS";
    const exempt = DB_LOCK_EXEMPT.has(req.path);

    if (supabase && !remoteLoadOk && isWrite && !exempt) {
      return res.status(503).json({
        ok: false,
        error: "Server belum berhasil membaca data dari Supabase, jadi penyimpanan ditahan agar data tidak tertimpa. Coba lagi beberapa detik lagi.",
      });
    }

    if (isWrite && !exempt) {
      release = await acquireDbLock();
      res.on("close", safeRelease);
      const t = setTimeout(safeRelease, 60000);
      (t as any).unref?.();
      await refreshFromSupabaseIfStale(0);
    } else if (req.method === "GET" && supabase && remoteLoadOk && Date.now() - lastRemoteCheck >= 10000) {
      const r = await acquireDbLock();
      try { await refreshFromSupabaseIfStale(10000); } finally { r(); }
    }
    next();
  } catch (e) {
    safeRelease();
    next(e);
  }
});

// --- Supabase (database persisten) -----------------------------------------
// Server ini yang menjadi satu-satunya jalur baca/tulis data aplikasi
// (dashboard, ringkasan YL, evaluasi, transaksi, target, dst). Memakai tabel
// app_store yang sama dengan panel "Test Koneksi Supabase" di menu Setting
// Admin (key/data/updated_at) — seluruh data aplikasi disimpan sebagai SATU
// baris JSON di bawah key SUPABASE_DB_KEY. Ini memakai SUPABASE_SERVICE_ROLE_KEY
// (bukan anon key) supaya aman dipakai di sisi server dan tidak tergantung
// pada policy RLS. Kalau env belum diisi, server tetap jalan pakai data.json
// lokal seperti sebelumnya (dev/Termux) — tapi TIDAK persisten di Netlify.
function formatSupabaseUrlServer(rawUrl: string): string {
  let url = (rawUrl || "").trim();
  if (!url) return "";
  if (!/^https?:\/\//i.test(url)) {
    url = "https://" + url;
  }
  return url;
}

function isValidHttpUrlServer(urlString: string): boolean {
  if (!urlString) return false;
  try {
    const parsed = new URL(urlString);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

const SUPABASE_URL = formatSupabaseUrlServer(process.env.SUPABASE_URL || "");
const SUPABASE_SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "").trim();
const SUPABASE_DB_KEY = "main_db";

// PENTING: fetch bawaan tidak punya timeout sama sekali. Kalau project
// Supabase yang ditunjuk tidak bisa dihubungi (project lama/salah region,
// dihapus, dsb), request bisa menggantung lama tanpa pernah gagal —
// akibatnya tombol Simpan di frontend cuma muter-muter tanpa henti karena
// response dari server juga tidak pernah datang. Fetch custom ini memaksa
// setiap panggilan ke Supabase gagal (throw) dalam waktu maksimal 15 detik,
// supaya error-nya cepat kelihatan (dan bisa ditangkap oleh try/catch yang
// sudah ada di persistToSupabase/loadDataFromSupabase).
function supabaseFetchWithTimeout(timeoutMs: number = 15000) {
  return (input: RequestInfo | URL, init?: RequestInit) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
  };
}

function createSupabaseClient(url: string, key: string, timeoutMs: number = 30000) {
  return createClient(url, key, {
    auth: { persistSession: false },
    global: { fetch: supabaseFetchWithTimeout(timeoutMs) as any }
  });
}

let supabase: any = null;
if (isValidHttpUrlServer(SUPABASE_URL) && SUPABASE_SERVICE_KEY) {
  try {
    supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, 30000);
  } catch (e: any) {
    console.warn("[Supabase] Gagal inisialisasi Supabase client di server:", e?.message || e);
    supabase = null;
  }
}

if (!supabase) {
  console.warn(
    "[Supabase] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum diset atau URL tidak valid — " +
    "server memakai data.json lokal."
  );
}

// ==========================================
// 2. KLIEN SUPABASE MEDIA (AKUN KEDUA)
// Khusus menyimpan foto YL, data seragam, motivasi, & aset berat
// untuk menghemat kuota penyimpanan & egress pada akun utama.
// ==========================================
const SUPABASE_MEDIA_URL_DEFAULT = "https://wkwjmwxxdfxyfqaseuha.supabase.co";
const SUPABASE_MEDIA_KEY_DEFAULT = "sb_publishable_ZPTUqIJyJzSTb0Jazx_7ZQ_J3ciuWIH";

const SUPABASE_MEDIA_URL = formatSupabaseUrlServer(process.env.SUPABASE_MEDIA_URL || SUPABASE_MEDIA_URL_DEFAULT);
const SUPABASE_MEDIA_KEY = (process.env.SUPABASE_MEDIA_SERVICE_ROLE_KEY || process.env.SUPABASE_MEDIA_KEY || process.env.SUPABASE_MEDIA_ANON_KEY || SUPABASE_MEDIA_KEY_DEFAULT).trim();

let supabaseMedia: any = null;
if (isValidHttpUrlServer(SUPABASE_MEDIA_URL) && SUPABASE_MEDIA_KEY) {
  try {
    supabaseMedia = createSupabaseClient(SUPABASE_MEDIA_URL, SUPABASE_MEDIA_KEY, 60000);
    console.log("[Supabase Media] Secondary client diinisialisasi untuk:", SUPABASE_MEDIA_URL);
  } catch (e: any) {
    console.warn("[Supabase Media] Gagal inisialisasi client:", e?.message || e);
    supabaseMedia = null;
  }
}

// ==========================================
// SUPABASE STORAGE UNTUK FOTO YL & GAMBAR SERAGAM (hemat egress)
// Dulu foto/seragam disimpan sebagai teks base64 di dalam SATU baris app_store
// (main_db_ylPhotos / main_db_seragam). Akibatnya setiap server menyala dari nol
// dan setiap simpan 1 foto, seluruh isi baris (semua foto) ikut diunduh/ditulis ulang.
// Sekarang file gambar disimpan di Storage; baris app_store hanya memuat LINK
// pendek ke gambar. Browser mengunduh gambar langsung dari CDN Supabase dan
// menyimpannya di cache (link berversi, jadi gambar yang sama tidak diunduh ulang).
// Kalau Storage belum siap / gagal, kode otomatis kembali ke cara lama (base64)
// sehingga tidak ada foto yang hilang.
// ==========================================
const MEDIA_BUCKET = (process.env.SUPABASE_MEDIA_BUCKET || "yl-media").trim();
let mediaBucketChecked = false;
let storageFailStreak = 0;
let storageRetryAt = 0;

function storageUsable(): boolean {
  return !!supabaseMedia && Date.now() >= storageRetryAt;
}

function isInlineImage(v: any): boolean {
  return typeof v === "string" && v.startsWith("data:image/");
}

function mediaObjectPath(kind: "foto" | "seragam", key: string): string {
  const slug = String(key || "x").normalize("NFKD").replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "x";
  let h = 5381;
  const raw = String(key || "");
  for (let i = 0; i < raw.length; i++) h = ((h << 5) + h + raw.charCodeAt(i)) >>> 0;
  return `${kind}/${slug}-${h.toString(36)}.jpg`;
}

async function ensureMediaBucket() {
  if (mediaBucketChecked || !supabaseMedia) return;
  mediaBucketChecked = true;
  try {
    // Hanya berhasil dengan service role key; kalau bucket sudah ada / key publik, errornya diabaikan.
    await supabaseMedia.storage.createBucket(MEDIA_BUCKET, { public: true });
  } catch {}
}

/** Upload 1 gambar (data URL) ke Storage. Mengembalikan link publik berversi, atau null kalau gagal. */
async function uploadImageToStorage(objectPath: string, dataUrl: string): Promise<string | null> {
  if (!storageUsable()) return null;
  const m = String(dataUrl).match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
  if (!m) return null;
  try {
    await ensureMediaBucket();
    const buf = Buffer.from(m[2], "base64");
    const { error } = await supabaseMedia.storage.from(MEDIA_BUCKET).upload(objectPath, buf, {
      contentType: m[1],
      upsert: true,
      cacheControl: "31536000",
    });
    if (error) throw new Error(error.message || "upload ditolak");
    storageFailStreak = 0;
    const { data } = supabaseMedia.storage.from(MEDIA_BUCKET).getPublicUrl(objectPath);
    if (!data?.publicUrl) return null;
    return `${data.publicUrl}?v=${Date.now()}`;
  } catch (e: any) {
    storageFailStreak++;
    console.warn(`[Supabase Storage] Upload ${objectPath} gagal:`, e?.message || e);
    if (storageFailStreak >= 3) {
      storageRetryAt = Date.now() + 10 * 60 * 1000; // jeda 10 menit, lalu coba lagi
      storageFailStreak = 0;
      console.warn("[Supabase Storage] Gagal 3x berturut-turut, sementara pakai penyimpanan lama (base64). Cek bucket/policy Storage.");
    }
    return null;
  }
}

/** Simpan gambar ke Storage kalau bisa. Kalau bukan data URL (sudah link/kosong) atau gagal, kembalikan apa adanya. */
async function storeImage(kind: "foto" | "seragam", key: string, value: string): Promise<string> {
  if (!isInlineImage(value)) return value;
  const url = await uploadImageToStorage(mediaObjectPath(kind, key), value);
  return url || value;
}

let storageMigrationRunning = false;

/**
 * Pindahkan gambar base64 yang masih tersisa di baris app_store (foto YL & seragam) ke Storage.
 * Aman dijalankan berulang: hanya menyentuh data yang masih base64, dan hanya mengganti
 * entri yang belum berubah sejak diunggah (tidak menimpa foto yang baru disimpan).
 */
async function migrateMediaToStorage(): Promise<{ ok: boolean; migrated: number; remaining: number; message: string }> {
  if (!supabaseMedia) return { ok: false, migrated: 0, remaining: 0, message: "Supabase Media belum aktif." };
  if (storageMigrationRunning) return { ok: true, migrated: 0, remaining: -1, message: "Migrasi sedang berjalan." };
  if (!storageUsable()) return { ok: false, migrated: 0, remaining: -1, message: "Storage sedang dijeda karena gagal berulang. Cek bucket/policy lalu coba lagi nanti." };

  const photos: Record<string, any> = cachedDb?.ylPhotos || {};
  const images: Record<string, any> = cachedDb?.seragam?.images || {};
  const photoJobs = Object.keys(photos).filter((k) => isInlineImage(photos[k]));
  const seragamJobs = Object.keys(images).filter((k) => isInlineImage(images[k]));
  if (photoJobs.length === 0 && seragamJobs.length === 0) {
    return { ok: true, migrated: 0, remaining: 0, message: "Tidak ada gambar base64 yang perlu dipindahkan." };
  }

  storageMigrationRunning = true;
  let migrated = 0;
  let remaining = 0;
  try {
    // Tahap 1 (di luar kunci): unggah gambar ke Storage
    const uploadedPhotos: Record<string, { orig: string; url: string }> = {};
    const uploadedSeragam: Record<string, { orig: string; url: string }> = {};
    for (const k of photoJobs) {
      const orig = photos[k] as string;
      const url = await uploadImageToStorage(mediaObjectPath("foto", k), orig);
      if (url) uploadedPhotos[k] = { orig, url };
      else if (!storageUsable()) break;
    }
    for (const k of seragamJobs) {
      if (!storageUsable()) break;
      const orig = images[k] as string;
      const url = await uploadImageToStorage(mediaObjectPath("seragam", k), orig);
      if (url) uploadedSeragam[k] = { orig, url };
    }

    // Tahap 2 (dalam kunci): tulis ulang baris dengan link, hanya untuk entri yang belum berubah
    const release = await acquireDbLock();
    try {
      if (Object.keys(uploadedPhotos).length > 0) {
        const { data: row } = await (supabaseMedia.from("app_store") as any).select("data").eq("key", "main_db_ylPhotos").maybeSingle();
        if (row?.data && typeof row.data === "object") {
          const data = { ...row.data };
          let n = 0;
          for (const k of Object.keys(uploadedPhotos)) {
            if (data[k] === uploadedPhotos[k].orig) { data[k] = uploadedPhotos[k].url; n++; }
          }
          if (n > 0) {
            const { error } = await (supabaseMedia.from("app_store") as any).upsert(
              [{ key: "main_db_ylPhotos", data, updated_at: new Date().toISOString() }], { onConflict: "key" });
            if (!error) {
              migrated += n;
              if (!cachedDb.ylPhotos) cachedDb.ylPhotos = {};
              for (const k of Object.keys(uploadedPhotos)) {
                if (cachedDb.ylPhotos[k] === uploadedPhotos[k].orig) cachedDb.ylPhotos[k] = uploadedPhotos[k].url;
              }
            } else {
              console.warn("[Supabase Media] Gagal menulis ulang ylPhotos:", error.message);
            }
          }
        }
      }
      if (Object.keys(uploadedSeragam).length > 0) {
        const { data: row } = await (supabaseMedia.from("app_store") as any).select("data").eq("key", "main_db_seragam").maybeSingle();
        if (row?.data && typeof row.data === "object") {
          const data = { ...row.data, images: { ...(row.data.images || {}) } };
          let n = 0;
          for (const k of Object.keys(uploadedSeragam)) {
            if (data.images[k] === uploadedSeragam[k].orig) { data.images[k] = uploadedSeragam[k].url; n++; }
          }
          if (n > 0) {
            const { error } = await (supabaseMedia.from("app_store") as any).upsert(
              [{ key: "main_db_seragam", data, updated_at: new Date().toISOString() }], { onConflict: "key" });
            if (!error) {
              migrated += n;
              if (cachedDb.seragam?.images) {
                for (const k of Object.keys(uploadedSeragam)) {
                  if (cachedDb.seragam.images[k] === uploadedSeragam[k].orig) cachedDb.seragam.images[k] = uploadedSeragam[k].url;
                }
              }
            } else {
              console.warn("[Supabase Media] Gagal menulis ulang seragam:", error.message);
            }
          }
        }
      }
      if (migrated > 0) safeWriteFile(DATA_FILE, JSON.stringify(cachedDb));
    } finally {
      release();
    }
    remaining =
      Object.values(cachedDb?.ylPhotos || {}).filter(isInlineImage).length +
      Object.values(cachedDb?.seragam?.images || {}).filter(isInlineImage).length;
    console.log(`[Supabase Storage] Migrasi gambar: ${migrated} dipindahkan, ${remaining} tersisa.`);
    return {
      ok: true, migrated, remaining,
      message: remaining === 0
        ? `Selesai: ${migrated} gambar dipindahkan ke Storage.`
        : `${migrated} gambar dipindahkan, ${remaining} masih base64 (cek bucket/policy Storage lalu jalankan lagi).`,
    };
  } catch (e: any) {
    console.warn("[Supabase Storage] Migrasi gagal:", e?.message || e);
    return { ok: false, migrated, remaining: -1, message: e?.message || "Migrasi gagal." };
  } finally {
    storageMigrationRunning = false;
  }
}

// Initialize Gemini lazily
const _aiInstances: Record<string, GoogleGenAI> = {};
function getAI(apiKey?: string): GoogleGenAI {
  const keyToUse = apiKey || process.env.GEMINI_API_KEY || "dummy";
  if (!_aiInstances[keyToUse]) {
    if (!process.env.GEMINI_API_KEY && keyToUse === "dummy") {
      console.warn("GEMINI_API_KEY is not set.");
    }
    _aiInstances[keyToUse] = new GoogleGenAI({
      apiKey: keyToUse,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return _aiInstances[keyToUse];
}

// DEFAULT KALIMAT MOTIVASI
const DEFAULT_MOTIVASI = [
  "Yakult Lady hebat bukan yang paling cepat, tapi yang paling konsisten.",
  "Capaian kecil tiap hari, jadi kemenangan besar tiap bulan.",
  "Semangat pagi ini menentukan hasil sore nanti!",
  "Pelanggan setia lahir dari pelayanan yang tulus.",
  "Jangan bandingkan hari ini dengan kemarin, kalahkan diri sendiri.",
  "Rute boleh sama, tapi semangat harus selalu baru.",
  "Kerja keras hari ini, bonus manis akhir bulan.",
  "Satu sapaan ramah bisa membuka satu pelanggan baru.",
  "Semangat menjalani hari ini dengan tulus dan penuh senyuman! 🌸",
  "Fokus pada pelayanan terbaik, senyum tulus adalah kunci keakraban dengan pelanggan! 😊",
  "Setiap botol Yakult membawa kesehatan dan kebahagiaan bagi keluarga Indonesia. 🍾",
  "Usaha dan ketekunan hari ini adalah pijakan sukses esok hari. Terus melangkah! 💪",
  "Jaga kesehatan dan selalu utamakan keselamatan dalam setiap rute aktivitas! 🛵✨",
  "Ibu adalah kebanggaan keluarga, jangan pernah lupakan itu. 💐",
  "Konsisten hari ini, panen hasil di kemudian hari. 🌾",
  "Ibu pantas dapat yang terbaik atas semua kerja kerasnya. 🎁",
  "Jangan takut lelah, karena itu tanda Ibu sedang berusaha. 💦",
  "Setiap rumah yang Ibu datangi, ada cerita perjuangan yang indah. 🏠",
  "Doa dan usaha Ibu hari ini, jawaban rezeki esok hari. 🤲",
  "Ibu tak sendiri, Yakult Lady lain juga berjuang bersama. 🤝",
  "Sukses kecil hari ini, awal dari sukses besar esok hari. 🌱",
  "Yang penting bukan seberapa berat beban, tapi seberapa kuat Ibu memikulnya. 🎒",
  "Ibu Yakult Lady, wajah senyum pembawa berkah tiap pagi. 😊",
  "Panas terik bukan alasan untuk berhenti berjuang. 🔆",
  "Rejeki sudah diatur, tugas Ibu hanya menjemputnya dengan semangat. 🙌",
  "Ibu adalah tulang punggung yang tak pernah terlihat lelah di depan keluarga. 🌾",
  "Setiap penolakan hari ini, latihan menuju keberhasilan besok. 💫",
  "Bukan soal seberapa cepat, tapi seberapa konsisten Ibu melangkah. 🐢",
  "Ibu layak bangga dengan setiap usaha yang dilakukan. 🌟",
  "Ibu adalah contoh nyata kerja keras untuk anak-anak di rumah. 👨👩👧",
  "Yakinlah, usaha Ibu tak pernah sia-sia. ✨",
  "Setiap \"tidak\" hari ini, mendekatkan pada \"iya\" berikutnya. 🔄",
  "Perjuangan Ibu hari ini, tabungan bahagia di masa depan. 💰",
  "Ibu bukan pekerja biasa, tapi penjaga kesehatan keluarga orang lain. 🌷",
  "Rezeki tak akan tertukar, teruslah berjalan dengan yakin. 🚶♀️",
  "Hari ini berat, tapi Ibu lebih kuat dari itu. 🔥",
  "Ibu inspirasi keluarga, jangan pernah ragukan diri sendiri. 💖",
  "Rezeki Ibu ada di setiap langkah dan senyuman. 😊",
  "Semangat pagi ini menentukan berkah hari ini, Bu! ☀️",
  "Ibu adalah pahlawan kecil di setiap pintu rumah pelanggan. 🏡",
  "Satu botol, sejuta manfaat. Terima kasih sudah berjuang, Bu! 🙏",
  "Ibu bukan sekadar jualan, tapi membawa kesehatan untuk banyak keluarga. ✨",
  "Lelah boleh, menyerah jangan. Semangat, Bu! 🌸",
  "Setiap langkah Ibu hari ini adalah rezeki untuk keluarga tercinta. 💪",
  "Terus percaya, rezeki Ibu sudah menunggu di depan sana. 🎯",
  "Ibu hebat, karena tak pernah berhenti mencoba. 💛",
  "Rasa lelah akan hilang, tapi hasil kerja keras akan selalu ada. 🌟",
  "Ibu kuat menghadapi terik dan hujan demi senyum anak di rumah. ☔",
  "Sekecil apapun langkah hari ini, tetap langkah maju. 👣",
  "Ibu layak dihargai atas semua perjuangan yang tak terlihat. 🌸",
  "Hari ini mungkin sulit, tapi Ibu sudah melalui yang lebih sulit dari ini. 💪",
  "Ibu Yakult Lady, penjaga kesehatan sekaligus penjaga rezeki keluarga. 🌼",
  "Ibu adalah bukti bahwa perempuan bisa jadi apa saja. 👩🌾",
  "Semangat Ibu hari ini adalah bekal untuk hari-hari berikutnya. 🎒",
  "Ibu berjalan bukan hanya dengan kaki, tapi dengan hati yang tulus. ❤️"
];

const INITIAL_YL_LIST = [
  { area: "201", nama: "Gusrina", pin: "201", status: "Aktif", tanggalDaftar: "2026-01-01" },
  { area: "202", nama: "Dewi Ati Ani", pin: "202", status: "Aktif", tanggalDaftar: "2026-01-01" },
  { area: "203", nama: "Gusrini", pin: "203", status: "Aktif", tanggalDaftar: "2026-01-01" },
  { area: "204", nama: "Umi Maisaroh", pin: "204", status: "Aktif", tanggalDaftar: "2026-01-01" },
  { area: "205", nama: "Suyik Rahmawati", pin: "205", status: "Aktif", tanggalDaftar: "2026-01-01" },
  { area: "206", nama: "Ria Resti W", pin: "206", status: "Aktif", tanggalDaftar: "2026-01-01" },
  { area: "207", nama: "Endang Setiowati", pin: "207", status: "Aktif", tanggalDaftar: "2026-01-01" },
  { area: "208", nama: "Wakiah", pin: "208", status: "Aktif", tanggalDaftar: "2026-01-01" },
  { area: "209", nama: "Titis", pin: "209", status: "Aktif", tanggalDaftar: "2026-01-01" },
  { area: "210", nama: "Eni", pin: "210", status: "Aktif", tanggalDaftar: "2026-01-01" }
];

const DEFAULT_COMP_CONFIG = {
  tiers: [
    { threshold: 0, rate: 338 },
    { threshold: 200, rate: 374 },
    { threshold: 250, rate: 409 },
    { threshold: 280, rate: 417 },
    { threshold: 300, rate: 424 },
    { threshold: 330, rate: 428 },
    { threshold: 350, rate: 432 }
  ],
  pphRate: 2.5,
  jkkJkm: 18800,
  jht: 24000
};

const cleanYlName = (fullName: string): string => {
  if (!fullName) return "";
  let s = fullName.trim();
  s = s.replace(/^Area\s+\d+\s*[-_:]?\s*/i, "").trim();
  s = s.replace(/^\d+\s*[-_:]?\s*/, "").trim();
  s = s.replace(/^Area\s+[-_:]?\s*/i, "").trim();
  return s || fullName;
};

const cleanEmptyTransactions = (db: any) => {
  if (!db.transactions || !Array.isArray(db.transactions)) return;
  db.transactions = db.transactions.filter((tx: any) => {
    const fieldsToCheck = [
      'tot_yo', 'tot_om', 'tot_os', 'tot_yt',
      'rmh_yo', 'rmh_om', 'rmh_os', 'rmh_yt',
      'psr_yo', 'psr_om', 'psr_os', 'psr_yt',
      'skh_yo', 'skh_om', 'skh_os', 'skh_yt',
      'ktr_yo', 'ktr_om', 'ktr_os', 'ktr_yt',
      'tk_yo', 'tk_om', 'tk_os', 'tk_yt',
      'ib_yo', 'ib_om', 'ib_os', 'ib_yt',
      'bb_yo', 'bb_om', 'bb_os', 'bb_yt',
      'pb_p', 'pb_s', 'f_plg', 'f_rk', 'f_ra', 'f_rb',
      'apk_plg', 'apk_botol',
      'plan_yo', 'plan_om', 'plan_os', 'plan_yt'
    ];
    return fieldsToCheck.some(field => (Number(tx[field]) || 0) !== 0);
  });
};

// Kalau tanggal itu sudah punya data LHPP, BB mengikuti LHPP (jangan ditimpa form YL)
const hasLhppBb = (db: any, tanggal: string, area: string | null, cleanName: string) => {
  const day = db.lhppPdm?.[tanggal];
  if (!day) return false;
  return !!((area && day[area]) || (cleanName && day[cleanName]));
};

// INITIAL SEED DATA FOR SIMULATOR
const INITIAL_DATA = {
  scriptUrl: "",
  managerPin: "1111",
  ylList: INITIAL_YL_LIST,
  ylPins: INITIAL_YL_LIST.reduce((acc: any, curr) => {
    acc[curr.pin] = curr.nama;
    return acc;
  }, {}),
  compensationConfig: DEFAULT_COMP_CONFIG,
  motivasi: {
    list: [...DEFAULT_MOTIVASI],
    terpilih: [...DEFAULT_MOTIVASI],
    intervalDetik: 5,
    enabled: true,
    chatbotName: "Zuzu",
    tkuName: "DP Jember 1"
  },
  seragam: { images: {}, schedules: {} }, kontes: {
    enabled: false,
    rows: []
  },
  ca25: 0,
  bl38: 0,
  targetTKU: {
    target: 0, target_yo: 0, target_om: 0, target_os: 0, target_yt: 0,
    bln_lalu: 0, bln_lalu_yo: 0, bln_lalu_om: 0, bln_lalu_os: 0, bln_lalu_yt: 0,
    thn_lalu: 0, thn_lalu_yo: 0, thn_lalu_om: 0, thn_lalu_os: 0, thn_lalu_yt: 0
  },
  targetYL: INITIAL_YL_LIST.reduce((acc: any, curr) => {
    acc[`${curr.area}_2026-07`] = { target: 0, bln_lalu: 0, thn_lalu: 0, plg: 0, rk: 0, ra: 0, rb: 0, totalPb: 0, totalBb: 0, totalSampahBotol: 0 };
    return acc;
  }, {}),
  transactions: [] as any[]
};

// In-memory cache of data.json so repeated requests (dashboard polling etc.)
// don't re-read + re-parse the whole file from disk every single time.
// Writes are debounced instead of hitting the disk synchronously on every
// save, which was blocking the Node event loop and slowing every other
// request down. dashboardCacheDirty tracks whether the cached dashboard
// calculation below is stale.
let cachedDb: any = null;
let writeTimeout: ReturnType<typeof setTimeout> | null = null;
let dashboardDP1Cache: any = null;
let dashboardCacheDirty = true;
// Versi data in-memory: naik setiap data berubah (simpan lokal / disegarkan dari Supabase).
// Dipakai klien manajer untuk polling murah (/api/getDataVersion) tanpa unduh ulang dashboard
// 230 KB setiap 20 detik. bootId acak supaya pindah instance server = versi berbeda.
const DATA_BOOT_ID = Math.random().toString(36).slice(2, 8);
let dataVersion = 0;

function safeWriteFile(filePath: string, content: string) {
  try {
    fs.writeFileSync(filePath, content, "utf8");
  } catch (err: any) {
    console.warn("Disk write skipped (serverless/read-only filesystem):", err?.message || err);
  }
}

function flushPendingWrite() {
  if (writeTimeout) {
    clearTimeout(writeTimeout);
    writeTimeout = null;
  }
  if (cachedDb) {
    safeWriteFile(DATA_FILE, JSON.stringify(cachedDb));
  }
}

// Make sure we don't lose the last unsaved change if the process exits.
process.on("exit", flushPendingWrite);
process.on("SIGINT", () => { flushPendingWrite(); process.exit(0); });
process.on("SIGTERM", () => { flushPendingWrite(); process.exit(0); });
process.on("unhandledRejection", (reason) => {
  console.warn("[Process] Unhandled Rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[Process] Uncaught Exception:", err);
});

// Pastikan field wajib selalu ada, baik data berasal dari Supabase maupun
// dari data.json lokal (dev tanpa Supabase). Data contoh bulan 2026-07 hanya
function deduplicateTransactions(txList: any[]) {
  if (!Array.isArray(txList) || txList.length === 0) return txList || [];
  
  const map: Record<string, any> = {};
  const orderedKeys: string[] = [];

  txList.forEach(t => {
    if (!t || !t.tanggal) return;
    let area = normArea(t.area) || (t.nama ? areaFromName(t.nama) : "");
    const cleanName = cleanYlName(t.nama || "");
    const key = `${t.tanggal}_${area || cleanName || t.nama}`;
    
    if (!map[key]) {
      map[key] = { ...t, area: area || t.area || "" };
      orderedKeys.push(key);
    } else {
      const existing = map[key];
      Object.keys(t).forEach(prop => {
        const val = t[prop];
        if (val !== undefined && val !== null && val !== 0 && val !== "") {
          existing[prop] = val;
        } else if (existing[prop] === undefined || existing[prop] === null) {
          existing[prop] = val;
        }
      });
      const secYo = (existing.rmh_yo||0) + (existing.psr_yo||0) + (existing.skh_yo||0) + (existing.ktr_yo||0) + (existing.tk_yo||0) + (existing.ib_yo||0);
      const secOm = (existing.rmh_om||0) + (existing.psr_om||0) + (existing.skh_om||0) + (existing.ktr_om||0) + (existing.tk_om||0) + (existing.ib_om||0);
      const secOs = (existing.rmh_os||0) + (existing.psr_os||0) + (existing.skh_os||0) + (existing.ktr_os||0) + (existing.tk_os||0) + (existing.ib_os||0);
      const secYt = (existing.rmh_yt||0) + (existing.psr_yt||0) + (existing.skh_yt||0) + (existing.ktr_yt||0) + (existing.tk_yt||0) + (existing.ib_yt||0);
      
      if (secYo > 0) existing.tot_yo = secYo;
      if (secOm > 0) existing.tot_om = secOm;
      if (secOs > 0) existing.tot_os = secOs;
      if (secYt > 0) existing.tot_yt = secYt;
    }
  });

  return orderedKeys.map(k => map[k]);
}

function syncBreakdownRealisasiToTransactions(db: any, targetMonth?: string) {
  if (!db || !db.breakdownRealisasi || typeof db.breakdownRealisasi !== "object") return;
  if (!db.transactions) db.transactions = [];

  const ylList = db.ylList || INITIAL_YL_LIST;
  const months = targetMonth ? [targetMonth] : Object.keys(db.breakdownRealisasi);

  months.forEach(month => {
    const monthData = db.breakdownRealisasi[month];
    if (!monthData || typeof monthData !== "object") return;

    Object.keys(monthData).forEach(areaKey => {
      const areaItem = monthData[areaKey];
      if (!areaItem || !areaItem.days || typeof areaItem.days !== "object") return;

      const yl = ylList.find((y: any) => y.area === areaKey || sameArea(y.area, areaKey));
      const cleanName = yl ? cleanYlName(yl.nama) : "";
      const fullName = yl ? `${areaKey} - ${cleanName}` : areaKey;

      Object.keys(areaItem.days).forEach(dayKey => {
        const dNum = parseInt(dayKey, 10);
        if (isNaN(dNum) || dNum < 1 || dNum > 31) return;

        const dayObj = areaItem.days[dayKey];
        const yo = Number(dayObj?.yo) || 0;
        const om = Number(dayObj?.om) || 0;
        const os = Number(dayObj?.os) || 0;
        const yt = Number(dayObj?.yt) || 0;
        const total = yo + om + os + yt;

        const dayPadded = String(dNum).padStart(2, "0");
        const targetDate = `${month}-${dayPadded}`;

        const existingIdx = db.transactions.findIndex((t: any) => {
          const matchDate = t.tanggal === targetDate;
          const matchArea = (t.area && sameArea(t.area, areaKey)) ||
                            (t.nama && (String(t.nama).startsWith(areaKey) || sameArea(areaFromName(t.nama), areaKey) || (cleanName && cleanYlName(t.nama) === cleanName)));
          return matchDate && matchArea;
        });

        if (existingIdx !== -1) {
          const tx = db.transactions[existingIdx];
          const hasExistingSector = (Number(tx.rmh_yo)||0) + (Number(tx.psr_yo)||0) + (Number(tx.skh_yo)||0) + 
                                    (Number(tx.ktr_yo)||0) + (Number(tx.tk_yo)||0) + (Number(tx.ib_yo)||0) > 0 || 
                                    (Number(tx.f_plg)||0) > 0 || (Number(tx.bb_yo)||0) > 0;
          
          if (total <= 0) {
            // HANYA nolkan jika transaksi ini TIDAK memiliki rincian sektor dari input YL
            if (!hasExistingSector) {
              tx.tot_yo = 0;
              tx.tot_om = 0;
              tx.tot_os = 0;
              tx.tot_yt = 0;
            }
            return;
          }

          if (!hasExistingSector) {
            tx.tot_yo = yo;
            tx.tot_om = om;
            tx.tot_os = os;
            tx.tot_yt = yt;
          } else {
            if (tx.tot_yo === 0 && yo > 0) tx.tot_yo = yo;
            if (tx.tot_om === 0 && om > 0) tx.tot_om = om;
            if (tx.tot_os === 0 && os > 0) tx.tot_os = os;
            if (tx.tot_yt === 0 && yt > 0) tx.tot_yt = yt;
          }
          if (!tx.area) tx.area = areaKey;
          if (!tx.nama || !tx.nama.startsWith(areaKey)) tx.nama = fullName;
        } else if (total > 0) {
          db.transactions.push({
            tanggal: targetDate,
            nama: fullName,
            area: areaKey,
            tot_yo: yo,
            tot_om: om,
            tot_os: os,
            tot_yt: yt,
            rmh_yo: 0, rmh_om: 0, rmh_os: 0, rmh_yt: 0,
            psr_yo: 0, psr_om: 0, psr_os: 0, psr_yt: 0,
            skh_yo: 0, skh_om: 0, skh_os: 0, skh_yt: 0,
            ktr_yo: 0, ktr_om: 0, ktr_os: 0, ktr_yt: 0,
            tk_yo: 0, tk_om: 0, tk_os: 0, tk_yt: 0,
            ib_yo: 0, ib_om: 0, ib_os: 0, ib_yt: 0,
            bb_yo: 0, bb_om: 0, bb_os: 0, bb_yt: 0,
            pb_p: 0, pb_s: 0,
            f_plg: 0, f_rk: 0, f_ra: 0, f_rb: 0,
            apk_plg: 0, apk_botol: 0
          });
        }
      });
    });
  });

  db.transactions = deduplicateTransactions(db.transactions);
}

// dipakai sebagai isian awal kalau memang belum ada data BD/Realisasi sama
// sekali (pemakaian pertama kali).
function normalizeDb(db: any) {
  if (!db.ylList || !Array.isArray(db.ylList)) {
    db.ylList = INITIAL_YL_LIST;
    db.ylPins = INITIAL_YL_LIST.reduce((acc: any, curr) => {
      acc[curr.pin] = curr.nama;
      return acc;
    }, {});
  }
  if (!db.compensationConfig) {
    db.compensationConfig = DEFAULT_COMP_CONFIG;
  } else if (typeof db.compensationConfig.pphRate !== "number" || isNaN(db.compensationConfig.pphRate)) {
    db.compensationConfig.pphRate = 2.5;
  }
  if (!db.transactions || !Array.isArray(db.transactions)) {
    db.transactions = [];
  } else {
    db.transactions = deduplicateTransactions(db.transactions);
    db.transactions.forEach((t: any) => {
      const secYo = (t.rmh_yo||0) + (t.psr_yo||0) + (t.skh_yo||0) + (t.ktr_yo||0) + (t.tk_yo||0) + (t.ib_yo||0);
      const secOm = (t.rmh_om||0) + (t.psr_om||0) + (t.skh_om||0) + (t.ktr_om||0) + (t.tk_om||0) + (t.ib_om||0);
      const secOs = (t.rmh_os||0) + (t.psr_os||0) + (t.skh_os||0) + (t.ktr_os||0) + (t.tk_os||0) + (t.ib_os||0);
      const secYt = (t.rmh_yt||0) + (t.psr_yt||0) + (t.skh_yt||0) + (t.ktr_yt||0) + (t.tk_yt||0) + (t.ib_yt||0);

      if (secYo > 0 && (!t.tot_yo || t.tot_yo === 0)) t.tot_yo = secYo;
      if (secOm > 0 && (!t.tot_om || t.tot_om === 0)) t.tot_om = secOm;
      if (secOs > 0 && (!t.tot_os || t.tot_os === 0)) t.tot_os = secOs;
      if (secYt > 0 && (!t.tot_yt || t.tot_yt === 0)) t.tot_yt = secYt;
    });
  }
  if (!db.kontes || db.kontes.enabled !== false) {
    db.kontes = { enabled: false, rows: [] };
  }
  if (!db.targetYL || typeof db.targetYL !== "object") {
    db.targetYL = {};
  }
  if (!db.breakdownPlan || typeof db.breakdownPlan !== "object") {
    db.breakdownPlan = {};
  }
  if (!db.breakdownRealisasi || typeof db.breakdownRealisasi !== "object") {
    db.breakdownRealisasi = {};
  }
  if (!db.potensiTembus || typeof db.potensiTembus !== "object") {
    db.potensiTembus = {};
  }

  // FIX: sebelumnya blok ini selalu menyuntik ulang "sample data" 2026-07 setiap kali
  // breakdownRealisasi/breakdownPlan bulan itu kosong. Karena normalizeDb() dipanggil lagi
  // setiap server cold-start (Cloud Run scale-to-zero), data yang sudah di-reset oleh user
  // muncul kembali seolah reset tidak berhasil. Sekarang seeding hanya dijalankan SEKALI
  // (saat db benar-benar baru pertama kali dibuat), ditandai dengan flag db._sampleJulySeeded.
  // Data contoh (dummy) Juli 2026 SUDAH DIHAPUS: sebelumnya disuntikkan ke database asli
  // sekali saja. Flag tetap diset agar tidak ada yang menyuntikkannya lagi.
  if (db._sampleJulySeeded === undefined) db._sampleJulySeeded = true;

  syncBreakdownRealisasiToTransactions(db);

  return db;
}

// Baca data.json lokal (fallback kalau Supabase belum dikonfigurasi, atau
// untuk dev lokal/Termux tanpa Supabase sama sekali).
function buildDbFromLocal() {
  let db;
  if (!fs.existsSync(DATA_FILE)) {
    db = INITIAL_DATA;
    safeWriteFile(DATA_FILE, JSON.stringify(db));
  } else {
    try {
      const raw = fs.readFileSync(DATA_FILE, "utf-8");
      db = JSON.parse(raw);
    } catch (e) {
      db = INITIAL_DATA;
    }
  }
  return normalizeDb(db);
}

// Baca data dari Supabase (tabel app_store, satu baris JSON di bawah key
// SUPABASE_DB_KEY — tabel yang sama dipakai panel "Test Koneksi" di Setting
// Admin). Return null kalau Supabase belum dikonfigurasi, tabelnya kosong,
let lastSavedDb: any = {};
// Status sinkronisasi dengan Supabase Utama
let remoteLoadOk = false;            // true = data remote sukses dibaca (atau memang kosong / tanpa Supabase)
let lastRemoteCheck = 0;             // kapan terakhir cek perubahan remote
let lastLoadFailAt = 0;              // kapan terakhir gagal memuat (untuk jeda retry)
let dbLoading = false;
let missingCriticalKeys: string[] = [];
const remoteStamp: Record<string, number> = {}; // updated_at (ms) terakhir yang kita ketahui per key
function stampOf(v: any): number {
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : 0;
}

// Kunci data yang dikecualikan dari penyimpanan Supabase Utama (penjualan)
// karena dipindahkan ke Supabase Media (Akun Kedua)
const HEAVY_KEYS = new Set(["ylPhotos", "seragam", "motivasi", "motivationalQuote"]);
let ylPhotosRemoteLoaded = false;
let seragamRemoteLoaded = false;

// atau terjadi error (supaya bisa fallback ke data lokal).
// Versi STRICT: melempar error kalau Supabase gagal dibaca. Return null HANYA kalau
// Supabase tidak dikonfigurasi atau tabelnya memang kosong. Pembedaan ini penting:
// dulu error baca dianggap "kosong" lalu data seed ditulis menimpa data asli.
async function loadDataFromSupabaseStrict(): Promise<any | null> {
  if (!supabase) return null;
  // 1. Cek apakah sudah ada data pecahan (kecualikan foto, seragam, & motivasi agar tidak boros egress saat startup)
  const { data: splitData, error: splitError } = await (supabase.from("app_store") as any)
    .select("key, data, updated_at")
    .like("key", "main_db_%")
    .neq("key", "main_db_ylPhotos")
    .neq("key", "main_db_seragam")
    .neq("key", "main_db_motivasi");

  if (splitError) {
    throw new Error("Gagal membaca data pecahan: " + splitError.message);
  }

  if (splitData && splitData.length > 0) {
    const db: any = {};
    for (const k of Object.keys(remoteStamp)) delete remoteStamp[k];
    for (const row of splitData) {
      const prop = row.key.replace("main_db_", "");
      db[prop] = row.data;
      remoteStamp[prop] = stampOf(row.updated_at);
    }

    // Pastikan ylList tidak mengandung base64 foto (pindahkan ke ylPhotos jika ada)
    if (Array.isArray(db.ylList)) {
      let hasPhotoInYlList = false;
      db.ylList.forEach((y: any) => {
        if (y.foto) {
          hasPhotoInYlList = true;
          if (!db.ylPhotos) db.ylPhotos = {};
          if (!db.ylPhotos[y.nama]) db.ylPhotos[y.nama] = y.foto;
          delete y.foto;
        }
      });
      if (hasPhotoInYlList) {
        (supabase.from("app_store") as any).upsert([
          { key: "main_db_ylList", data: db.ylList, updated_at: new Date().toISOString() }
        ], { onConflict: "key" }).then(() => {
          console.log("[Supabase] Sukses membersihkan foto dari main_db_ylList");
        }).catch(() => {});
      }
    }

    // Catat key penting yang TIDAK ada di remote (mis. gagal import saat migrasi).
    // normalizeDb() akan mengisinya dengan data seed; lihat ensureDbReady() agar seed
    // itu tidak ditulis diam-diam menimpa Supabase.
    missingCriticalKeys = ["ylList", "transactions", "compensationConfig", "breakdownRealisasi"].filter((k) => !(k in db));

    lastSavedDb = JSON.parse(JSON.stringify(db)); // Simpan baseline untuk perbandingan
    return db;
  }

  // 2. Fallback: ambil data utuh lama jika belum dipecah
  const { data: legacyData, error: legacyError } = await (supabase.from("app_store") as any)
    .select("data")
    .eq("key", SUPABASE_DB_KEY)
    .maybeSingle();

  if (legacyError) {
    throw new Error("Gagal membaca data awal: " + legacyError.message);
  }
  if (!legacyData || !legacyData.data) return null; // belum pernah ada data tersimpan di Supabase

  // Kosongkan baseline agar penyimpanan pertama berikutnya akan meng-upsert semua key sebagai pecahan
  lastSavedDb = {};
  for (const k of Object.keys(remoteStamp)) delete remoteStamp[k];
  return legacyData.data;
}

// Versi lama (tidak melempar error) — dipakai jalur yang memang butuh fallback null.
async function loadDataFromSupabase(): Promise<any | null> {
  try {
    return await loadDataFromSupabaseStrict();
  } catch (e: any) {
    console.error("[Supabase] Exception membaca data awal:", e?.message || e);
    return null;
  }
}

// Menyegarkan cache in-memory dari Supabase kalau instance lain sudah mengubah data.
// Cukup murah: hanya membaca (key, updated_at); isi baris hanya diambil untuk key yang berubah.
async function refreshFromSupabaseIfStale(minIntervalMs: number): Promise<void> {
  if (!supabase || !remoteLoadOk || !cachedDb) return;
  if (minIntervalMs > 0 && Date.now() - lastRemoteCheck < minIntervalMs) return;
  try {
    const { data: metas, error } = await (supabase.from("app_store") as any)
      .select("key, updated_at")
      .like("key", "main_db_%")
      .neq("key", "main_db_ylPhotos")
      .neq("key", "main_db_seragam")
      .neq("key", "main_db_motivasi");
    if (error || !Array.isArray(metas)) {
      if (error) console.warn("[Supabase] Gagal cek perubahan remote:", error.message);
      return;
    }
    lastRemoteCheck = Date.now();

    const staleKeys: string[] = [];
    for (const m of metas) {
      const prop = String(m.key).replace("main_db_", "");
      if (HEAVY_KEYS.has(prop)) continue;
      if (remoteStamp[prop] !== stampOf(m.updated_at)) staleKeys.push(m.key);
    }
    if (staleKeys.length === 0) return;

    const { data: rows, error: rowErr } = await (supabase.from("app_store") as any)
      .select("key, data, updated_at")
      .in("key", staleKeys);
    if (rowErr || !Array.isArray(rows)) {
      if (rowErr) console.warn("[Supabase] Gagal menyegarkan data remote:", rowErr.message);
      return;
    }
    for (const row of rows) {
      const prop = String(row.key).replace("main_db_", "");
      cachedDb[prop] = row.data;
      lastSavedDb[prop] = JSON.parse(JSON.stringify(row.data));
      remoteStamp[prop] = stampOf(row.updated_at);
    }
    dashboardCacheDirty = true;
    dataVersion++;
    console.log("[Supabase] Cache disegarkan dari remote untuk key:", staleKeys.join(", "));
  } catch (e: any) {
    console.warn("[Supabase] Exception saat menyegarkan data remote:", e?.message || e);
  }
}

// Menyimpan hanya sebagian (partial) objek db yang berubah ke Supabase
// dengan memecah property root (seperti db.transactions) ke row yang berbeda.
// Semua pemanggil diantre (satu per satu) dan MENUNGGU sampai data benar-benar
// tertulis. Kalau gagal (setelah 1x ulang) fungsi MELEMPAR error — sebelumnya error
// hanya dicatat di log sehingga UI tetap menampilkan "berhasil" padahal tidak tersimpan.
let persistChain: Promise<void> = Promise.resolve();

async function doPersist(db: any): Promise<void> {
  if (!supabase) return;
  const updates: any[] = [];
  for (const key of Object.keys(db)) {
    // Foto & seragam disimpan melalui endpoint khusus (/api/saveYlFoto, /api/saveSeragam)
    // untuk menghemat egress dan mencegah overhead komparasi string MB
    if (HEAVY_KEYS.has(key)) continue;
    // Bandingkan secara deep untuk melihat apakah ada perubahan
    if (JSON.stringify(db[key]) !== JSON.stringify(lastSavedDb[key])) {
      updates.push({ key: `main_db_${key}`, data: db[key], updated_at: new Date().toISOString() });
    }
  }
  if (updates.length === 0) return;

  let lastErr: any = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { error } = await (supabase.from("app_store") as any).upsert(updates, { onConflict: "key" });
      if (!error) {
        // Perbarui baseline in-memory agar tau bahwa data ini sudah tersimpan
        for (const u of updates) {
          const prop = u.key.replace("main_db_", "");
          lastSavedDb[prop] = JSON.parse(JSON.stringify(u.data));
          remoteStamp[prop] = stampOf(u.updated_at);
        }
        return;
      }
      lastErr = error;
      console.error("[Supabase] Gagal menyimpan data (percobaan " + (attempt + 1) + "):", error.message);
    } catch (e: any) {
      lastErr = e;
      console.error("[Supabase] Exception menyimpan data (percobaan " + (attempt + 1) + "):", e?.message || e);
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  // Gagal: buang perubahan yang belum tersimpan pada penyegaran berikutnya supaya memori
  // konsisten dengan Supabase dan tidak ada data "hantu" yang hanya ada di memori.
  for (const u of updates) delete remoteStamp[u.key.replace("main_db_", "")];
  lastRemoteCheck = 0;
  throw new Error("Gagal menyimpan ke Supabase: " + (lastErr?.message || "unknown"));
}

async function persistToSupabase(db: any): Promise<void> {
  if (!supabase) return;
  const run = persistChain.then(() => doPersist(db));
  persistChain = run.then(() => {}, () => {});
  return run;
}

// ==========================================
// PENGELOLA DATA SUPABASE MEDIA (AKUN KEDUA)
// ==========================================

// Memuat data foto, seragam, & motivasi dari Supabase Media
async function loadMediaFromSupabaseMedia() {
  if (!supabaseMedia) return;
  try {
    // 1. Muat ylPhotos
    const { data: photoRow, error: photoErr } = await (supabaseMedia.from("app_store") as any)
      .select("data")
      .eq("key", "main_db_ylPhotos")
      .maybeSingle();
    if (!photoErr && photoRow && photoRow.data) {
      if (!cachedDb.ylPhotos) cachedDb.ylPhotos = {};
      cachedDb.ylPhotos = { ...cachedDb.ylPhotos, ...photoRow.data };
      ylPhotosRemoteLoaded = true;
      console.log("[Supabase Media] ylPhotos sukses dimuat dari Supabase Media.");
    }

    // 2. Muat seragam
    const { data: seragamRow, error: seragamErr } = await (supabaseMedia.from("app_store") as any)
      .select("data")
      .eq("key", "main_db_seragam")
      .maybeSingle();
    if (!seragamErr && seragamRow && seragamRow.data) {
      cachedDb.seragam = {
        images: { ...(cachedDb.seragam?.images || {}), ...(seragamRow.data.images || {}) },
        schedules: seragamRow.data.schedules || cachedDb.seragam?.schedules || {},
        schedulesKaryawan: seragamRow.data.schedulesKaryawan || cachedDb.seragam?.schedulesKaryawan || {}
      };
      seragamRemoteLoaded = true;
      console.log("[Supabase Media] seragam sukses dimuat dari Supabase Media.");
    }

    // 3. Muat motivasi
    const { data: motRow, error: motErr } = await (supabaseMedia.from("app_store") as any)
      .select("data")
      .eq("key", "motivasi_config")
      .maybeSingle();
    if (!motErr && motRow && motRow.data) {
      cachedDb.motivasi = { ...cachedDb.motivasi, ...motRow.data };
      console.log("[Supabase Media] motivasi sukses dimuat dari Supabase Media.");
    }
  } catch (err: any) {
    console.warn("[Supabase Media] Info status load media:", err?.message || err);
  }
}

// Memindahkan aset media (foto, seragam, motivasi) dari Supabase Utama ke Supabase Media
async function syncAndMigrateMediaToSecondary() {
  if (!supabaseMedia) {
    return { ok: false, message: "Client Supabase Media belum aktif." };
  }

  try {
    // 1. Cek apakah tabel app_store sudah dibuat di Supabase Media
    const { error: testErr } = await (supabaseMedia.from("app_store") as any).select("key").limit(1);
    if (testErr) {
      const isMissing = testErr.code === "42P01" || testErr.code === "PGRST205" || testErr.message?.includes("schema cache") || testErr.message?.includes("does not exist");
      return {
        ok: false,
        tableMissing: isMissing,
        message: isMissing
          ? "Tabel 'public.app_store' belum dibuat di akun Supabase Media baru. Silakan buat tabel di SQL Editor Supabase baru."
          : `Gagal mengakses Supabase Media: ${testErr.message}`
      };
    }

    console.log("[Supabase Media] Tabel app_store terverifikasi! Memulai migrasi data media...");

    // 2. Kumpulkan foto YL
    let photos = cachedDb?.ylPhotos;
    if ((!photos || Object.keys(photos).length === 0) && supabase) {
      try {
        const { data: rowP } = await (supabase.from("app_store") as any).select("data").eq("key", "main_db_ylPhotos").maybeSingle();
        if (rowP?.data) photos = rowP.data;
      } catch (e) {}
    }
    if (!photos || Object.keys(photos).length === 0) {
      const local = buildDbFromLocal();
      if (local?.ylPhotos) photos = local.ylPhotos;
    }

    // 3. Kumpulkan data seragam
    let seragam = cachedDb?.seragam;
    if ((!seragam || !seragam.images || Object.keys(seragam.images).length === 0) && supabase) {
      try {
        const { data: rowS } = await (supabase.from("app_store") as any).select("data").eq("key", "main_db_seragam").maybeSingle();
        if (rowS?.data) seragam = rowS.data;
      } catch (e) {}
    }
    if (!seragam || !seragam.images || Object.keys(seragam.images).length === 0) {
      const local = buildDbFromLocal();
      if (local?.seragam) seragam = local.seragam;
    }

    // 4. Kumpulkan motivasi
    let motivasi = cachedDb?.motivasi;
    if (!motivasi && supabase) {
      try {
        const { data: rowM } = await (supabase.from("app_store") as any).select("data").eq("key", "motivasi_config").maybeSingle();
        if (rowM?.data) motivasi = rowM.data;
      } catch (e) {}
    }
    if (!motivasi) {
      const local = buildDbFromLocal();
      if (local?.motivasi) motivasi = local.motivasi;
    }

    const migratedKeys: string[] = [];

    if (photos && Object.keys(photos).length > 0) {
      const { error: pErr } = await (supabaseMedia.from("app_store") as any).upsert(
        [{ key: "main_db_ylPhotos", data: photos, updated_at: new Date().toISOString() }],
        { onConflict: "key" }
      );
      if (!pErr) migratedKeys.push("main_db_ylPhotos");
    }

    if (seragam && (seragam.images || seragam.schedules)) {
      const { error: sErr } = await (supabaseMedia.from("app_store") as any).upsert(
        [{ key: "main_db_seragam", data: seragam, updated_at: new Date().toISOString() }],
        { onConflict: "key" }
      );
      if (!sErr) migratedKeys.push("main_db_seragam");
    }

    if (motivasi) {
      const { error: mErr } = await (supabaseMedia.from("app_store") as any).upsert(
        [{ key: "motivasi_config", data: motivasi, updated_at: new Date().toISOString() }],
        { onConflict: "key" }
      );
      if (!mErr) migratedKeys.push("motivasi_config");
    }

    // 5. Bersihkan Supabase Lama dari foto, seragam, motivasi agar akun lama 100% bebas dari media
    if (supabase) {
      const keysToDelete = ["main_db_ylPhotos", "main_db_seragam", "motivasi_config", "main_db_motivasi"];
      await (supabase.from("app_store") as any).delete().in("key", keysToDelete).then(() => {
        console.log("[Supabase Utama] Kunci media sukses dibersihkan dari akun Supabase lama:", keysToDelete);
      }).catch((e: any) => {
        console.warn("[Supabase Utama] Gagal membersihkan kunci media dari akun lama:", e?.message || e);
      });
    }

    return { 
      ok: true, 
      migratedItems: migratedKeys, 
      message: "Sukses! Seluruh data media (foto profil YL, jadwal seragam, motivasi) kini tersimpan di akun Supabase baru, dan akun lama 100% bersih dari media." 
    };
  } catch (err: any) {
    console.error("[Supabase Media] Exception migrasi media:", err);
    return { ok: false, message: err?.message || String(err) };
  }
}

let dbReadyPromise: Promise<void> | null = null;

// Dipanggil sekali sebelum server mulai melayani request.
// Mengisi cachedDb dari Supabase kalau sudah dikonfigurasi,
// dan melengkapi foto/seragam dari file data.json lokal agar langsung siap di memori.
function ensureDbReady(): Promise<void> {
  // Kalau pemuatan sebelumnya gagal, coba lagi (maksimal sekali tiap 10 detik)
  if (dbReadyPromise && supabase && !remoteLoadOk && !dbLoading && Date.now() - lastLoadFailAt > 10000) {
    dbReadyPromise = null;
  }
  if (!dbReadyPromise) {
    dbReadyPromise = (async () => {
      dbLoading = true;
      try {
        const remote = await loadDataFromSupabaseStrict();
        if (remote) {
          // Lengkapi foto & seragam dari disk lokal (jika ada) tanpa membebani egress Supabase
          const local = buildDbFromLocal();
          if (!remote.ylPhotos && local.ylPhotos) remote.ylPhotos = local.ylPhotos;
          if (!remote.seragam && local.seragam) remote.seragam = local.seragam;
          const nonFresh = Object.keys(remote).length > 2;
          const missing = missingCriticalKeys.slice();
          missingCriticalKeys = [];
          cachedDb = normalizeDb(remote);
          // PENGAMAN: key penting yang hilang di Supabase dari instalasi yang sudah berjalan
          // (mis. gagal import) diisi seed HANYA di memori. Seed itu dianggap "sudah tersimpan"
          // sehingga tidak ditulis diam-diam menimpa Supabase; baru ditulis kalau memang diubah.
          if (nonFresh && missing.length > 0) {
            console.warn("[Supabase] PERINGATAN: baris data tidak ditemukan di Supabase:", missing.join(", "),
              "- memakai nilai awal di memori, TIDAK ditulis ke Supabase sampai ada perubahan sungguhan.");
            for (const k of missing) {
              if (cachedDb[k] !== undefined) lastSavedDb[k] = JSON.parse(JSON.stringify(cachedDb[k]));
            }
          }
        } else {
          cachedDb = buildDbFromLocal();
          if (supabase) {
            // Supabase sudah dikonfigurasi tapi tabelnya benar-benar kosong (baru
            // pertama kali pakai) — simpan data awal ini supaya jadi acuan.
            await persistToSupabase(cachedDb);
          }
        }
        remoteLoadOk = true;
        lastRemoteCheck = Date.now();

        // Sinkronisasi data media dari Supabase Media (Akun Kedua)
        if (supabaseMedia) {
          await loadMediaFromSupabaseMedia();
          // Pindahkan sisa gambar base64 ke Storage di latar belakang (sekali, tidak menahan request)
          setTimeout(() => { migrateMediaToStorage().catch(() => {}); }, 3000);
        }
      } catch (err: any) {
        console.error("[ensureDbReady] Error initializing database:", err?.message || err);
        if (!cachedDb) {
          cachedDb = buildDbFromLocal();
        }
        // Supabase terkonfigurasi tapi gagal dibaca: JANGAN izinkan penulisan.
        remoteLoadOk = !supabase;
        lastLoadFailAt = Date.now();
      } finally {
        dbLoading = false;
      }
    })();
  }
  return dbReadyPromise;
}

function loadData() {
  if (!cachedDb) {
    // Jalur cadangan: seharusnya ensureDbReady() sudah dipanggil sebelum
    // request pertama masuk (lihat startServer() & netlify/functions/api.ts).
    // Kalau sampai ke sini, pakai data lokal supaya server tidak crash.
    cachedDb = buildDbFromLocal();
  }
  return cachedDb;
}

let supabaseWriteTimeout: ReturnType<typeof setTimeout> | null = null;

async function saveData(data: any) {
  // Update salinan in-memory dulu supaya request berikutnya (bahkan di tick
  // yang sama) langsung melihat data terbaru.
  cachedDb = data;
  dashboardCacheDirty = true;
  dataVersion++;

  // Tulis ke disk lokal (berguna untuk dev/Termux; di Netlify filesystem
  // read-only jadi safeWriteFile akan diam-diam skip, tidak masalah).
  safeWriteFile(DATA_FILE, JSON.stringify(cachedDb));

  // PENTING: harus di-await, BUKAN dijadwalkan lewat setTimeout.
  // Sebelumnya penyimpanan ke Supabase ditunda 1000ms lewat setTimeout agar
  // "tidak memblokir HTTP response" — tapi di Netlify Functions (dan platform
  // serverless lain), begitu res.json() terkirim, container/Lambda langsung
  // dibekukan. setTimeout yang belum sempat jalan itu TIDAK PERNAH tereksekusi,
  // jadi perubahan (mis. Simpan Target) kelihatan sukses di UI tapi sebenarnya
  // tidak pernah benar-benar tersimpan ke Supabase — hilang lagi begitu ada
  // cold start / dibuka dari device lain. Meng-await di sini memastikan data
  // benar-benar tersimpan sebelum function selesai, dengan konsekuensi request
  // sedikit lebih lama (menunggu round-trip ke Supabase).
  if (writeTimeout) clearTimeout(writeTimeout);
  if (supabaseWriteTimeout) clearTimeout(supabaseWriteTimeout);
  // Error SENGAJA tidak ditelan: kalau gagal, handler memberi balasan error ke UI
  // (lihat pembungkus handler async di atas) sehingga user tahu simpan tidak berhasil.
  await persistToSupabase(cachedDb);
}

// PROXY FUNCTION DISABLED TO PREVENT SPREADSHEET CONFLICTS AND DATA LOSS
async function callProxy(action: string, payload: any = null, method: "GET" | "POST" = "GET") {
  return null;
}

// Akumulasi total penjualan tim dari data REALISASI di menu "BD & Realisasi"
// (db.breakdownRealisasi[month][area].days[tgl].{yo,om,os,yt}), bukan lagi dari BL38 sheet.
function getRealisasiAccumulation(db: any, month: string) {
  const realisasiMonth = (db.breakdownRealisasi && db.breakdownRealisasi[month]) || {};
  let totalYo = 0, totalOm = 0, totalOs = 0, totalYt = 0;
  const perArea: Record<string, { yo: number; om: number; os: number; yt: number; total: number; pembagiTanggal: number }> = {};

  Object.keys(realisasiMonth).forEach(area => {
    const areaData = realisasiMonth[area];
    let ayo = 0, aom = 0, aos = 0, ayt = 0;
    const days = areaData && areaData.days ? areaData.days : areaData;
    const pembagiTanggal = (areaData && areaData.pembagiTanggal > 0) ? Number(areaData.pembagiTanggal) : 15;
    
    if (days && typeof days === "object") {
      Object.values(days).forEach((d: any) => {
        if (!d) return;
        ayo += Number(d.yo) || 0;
        aom += Number(d.om) || 0;
        aos += Number(d.os) || 0;
        ayt += Number(d.yt) || 0;
      });
    }
    perArea[area] = { yo: ayo, om: aom, os: aos, yt: ayt, total: ayo + aom + aos + ayt, pembagiTanggal };
    totalYo += ayo; totalOm += aom; totalOs += aos; totalYt += ayt;
  });

  return { totalYo, totalOm, totalOs, totalYt, total: totalYo + totalOm + totalOs + totalYt, perArea, realisasiMonth };
}

// DYNAMIC SUMMARY CALCULATION (FOR SIMULATOR FALLBACK)
// calculateDashboardDP1 loops over every transaction for every YL — fairly
// heavy. Since it only needs to change when the underlying data actually
// changes (saveData() flips dashboardCacheDirty), we memoize the result
// instead of recomputing it from scratch on every poll (every 20s per
// connected device).
function getCachedDashboardDP1(db: any, requestedMonth?: string) {
  if (requestedMonth) {
    return calculateDashboardDP1(db, requestedMonth);
  }
  if (dashboardCacheDirty || !dashboardDP1Cache) {
    dashboardDP1Cache = calculateDashboardDP1(db);
    dashboardCacheDirty = false;
  }
  return dashboardDP1Cache;
}

function calculateDashboardDP1(db: any, requestedMonth?: string) {
  const txs = db.transactions || [];
  const targetYL = db.targetYL || {};

  // Dynamically determine current active month from latest transactions or current date
  const latestTxDate = txs.length > 0 ? txs[txs.length - 1].tanggal : new Date().toISOString().split("T")[0];
  const currentMonth = requestedMonth || latestTxDate.substring(0, 7);
  let currentMonthTxs = txs.filter((t: any) => t.tanggal && t.tanggal.startsWith(currentMonth));
  if (currentMonthTxs.length === 0 && txs.length > 0 && !requestedMonth) {
    currentMonthTxs = txs;
  }

  // Akumulasi BB & Potensi Sektor (dari plg pjl / txs)
  let sRmh = 0, sPsr = 0, sSkh = 0, sKtr = 0, sTk = 0, sIb = 0;
  let totalPb = 0, totalBb = 0, totalSampahBotol = 0;

  currentMonthTxs.forEach((t: any) => {
    sRmh += (t.rmh_yo||0) + (t.rmh_om||0) + (t.rmh_os||0) + (t.rmh_yt||0);
    sPsr += (t.psr_yo||0) + (t.psr_om||0) + (t.psr_os||0) + (t.psr_yt||0);
    sSkh += (t.skh_yo||0) + (t.skh_om||0) + (t.skh_os||0) + (t.skh_yt||0);
    sKtr += (t.ktr_yo||0) + (t.ktr_om||0) + (t.ktr_os||0) + (t.ktr_yt||0);
    sTk += (t.tk_yo||0) + (t.tk_om||0) + (t.tk_os||0) + (t.tk_yt||0);
    sIb += (t.ib_yo||0) + (t.ib_om||0) + (t.ib_os||0) + (t.ib_yt||0);

    totalPb += (t.pb_p||0) + (t.pb_s||0);
    totalBb += (t.bb_yo||0) + (t.bb_om||0) + (t.bb_os||0) + (t.bb_yt||0);
    totalSampahBotol += (t.apk_botol||0);
  });

  // Total penjualan tim, komposisi, dan rata-rata produk diambil dari akumulasi total REALISASI di menu "BD & Realisasi"
  const totalSektor = sRmh + sPsr + sSkh + sKtr + sTk + sIb;
  let persenRmh = totalSektor > 0 ? Number(((sRmh / totalSektor) * 100).toFixed(1)) : 0;
  let persenTk = totalSektor > 0 ? Number(((sTk / totalSektor) * 100).toFixed(1)) : 0;

  // Jika transaksi sektor pada bulan ini belum terisi, gunakan fallback dari transaksi yang ada
  if (totalSektor === 0 && txs.length > 0) {
    let fRmh = 0, fPsr = 0, fSkh = 0, fKtr = 0, fTk = 0, fIb = 0;
    txs.forEach((t: any) => {
      fRmh += (t.rmh_yo||0) + (t.rmh_om||0) + (t.rmh_os||0) + (t.rmh_yt||0);
      fPsr += (t.psr_yo||0) + (t.psr_om||0) + (t.psr_os||0) + (t.psr_yt||0);
      fSkh += (t.skh_yo||0) + (t.skh_om||0) + (t.skh_os||0) + (t.skh_yt||0);
      fKtr += (t.ktr_yo||0) + (t.ktr_om||0) + (t.ktr_os||0) + (t.ktr_yt||0);
      fTk += (t.tk_yo||0) + (t.tk_om||0) + (t.tk_os||0) + (t.tk_yt||0);
      fIb += (t.ib_yo||0) + (t.ib_om||0) + (t.ib_os||0) + (t.ib_yt||0);
    });
    const fallbackTotal = fRmh + fPsr + fSkh + fKtr + fTk + fIb;
    if (fallbackTotal > 0) {
      persenRmh = Number(((fRmh / fallbackTotal) * 100).toFixed(1));
      persenTk = Number(((fTk / fallbackTotal) * 100).toFixed(1));
    }
  }

  const realisasiAcc = getRealisasiAccumulation(db, currentMonth);
  const totalPenjualan = realisasiAcc.total;
        
  const ylList = db.ylList || INITIAL_YL_LIST;
  const names = ylList.map((y: any) => y.nama);
  const perYL: any = {};
  
  let teamTotalRata2 = 0;
  let teamTotalYoRata2 = 0;
  let teamTotalOmRata2 = 0;
  let teamTotalOsRata2 = 0;
  let teamTotalYtRata2 = 0;
  let teamTotalPembagi = 0;

  names.forEach(name => {
    let ylItem = ylList.find((y: any) => y.nama === name);
    let area = ylItem ? ylItem.area : "";
    if (!area) {
      area = areaPrefix(name);
    }
    if (!ylItem && area) ylItem = ylList.find((y: any) => sameArea(y.area, area) || sameArea(areaFromName(y.nama), area));
    const ylTxs = currentMonthTxs.filter((t: any) => t.nama === name || (area && t.nama && sameArea(areaFromName(t.nama), area)));
    
    let ylBb = 0;
    ylTxs.forEach((t: any) => {
      ylBb += (t.bb_yo||0) + (t.bb_om||0) + (t.bb_os||0) + (t.bb_yt||0);
    });

    // Akumulasi per YL ikut data Realisasi (menu BD & Realisasi) area ybs.
    const areaRealisasi = pickByArea(realisasiAcc.perArea, area);
    const ylTotal = (areaRealisasi && areaRealisasi.total > 0) ? areaRealisasi.total : 0;

    const tgtObj = (db.targetYLByMonth?.[currentMonth]?.[area]) ||
                   (targetYL && (targetYL[`${area}_${currentMonth}`] || targetYL[area])) || {
      target: ylItem?.target ?? 0,
      bln_lalu: ylItem?.bln_lalu ?? 0,
      thn_lalu: ylItem?.thn_lalu ?? 0
    };
    
    const divisor = areaRealisasi ? areaRealisasi.pembagiTanggal : 15;
    const ylRata2 = divisor > 0 ? ylTotal / divisor : 0;
    teamTotalRata2 += ylRata2;
    teamTotalYoRata2 += divisor > 0 && areaRealisasi ? areaRealisasi.yo / divisor : 0;
    teamTotalOmRata2 += divisor > 0 && areaRealisasi ? areaRealisasi.om / divisor : 0;
    teamTotalOsRata2 += divisor > 0 && areaRealisasi ? areaRealisasi.os / divisor : 0;
    teamTotalYtRata2 += divisor > 0 && areaRealisasi ? areaRealisasi.yt / divisor : 0;
    teamTotalPembagi += divisor;

    perYL[area] = {
      nama: name,
      akumulasi: ylTotal,
      yo: areaRealisasi ? areaRealisasi.yo : 0,
      om: areaRealisasi ? areaRealisasi.om : 0,
      os: areaRealisasi ? areaRealisasi.os : 0,
      yt: areaRealisasi ? areaRealisasi.yt : 0,
      rata2: ylRata2,
      hariAktif: divisor,
      pembagi: divisor,
      targetYL: Number(tgtObj.target ?? 0),
      bulanLaluYL: Number(tgtObj.bln_lalu ?? 0),
      tahunLaluYL: Number(tgtObj.thn_lalu ?? 0),
      bbYL: ylBb
    };
  });

  // Calculate dynamic target totals across all YLs
  let targetTotalSum = 0, blnLaluTotalSum = 0, thnLaluTotalSum = 0;
  Object.keys(perYL).forEach(area => {
    targetTotalSum += perYL[area].targetYL;
    blnLaluTotalSum += perYL[area].bulanLaluYL;
    thnLaluTotalSum += perYL[area].tahunLaluYL;
  });

  const tkuForMonth = (currentMonth && db.targetTKUByMonth && db.targetTKUByMonth[currentMonth]) || db.targetTKU;
  if (tkuForMonth) {
    if (tkuForMonth.target !== undefined && Number(tkuForMonth.target) >= 0 && (Number(tkuForMonth.target) > 0 || targetTotalSum === 0)) targetTotalSum = Number(tkuForMonth.target);
    if (tkuForMonth.bln_lalu !== undefined && Number(tkuForMonth.bln_lalu) >= 0 && (Number(tkuForMonth.bln_lalu) > 0 || blnLaluTotalSum === 0)) blnLaluTotalSum = Number(tkuForMonth.bln_lalu);
    if (tkuForMonth.thn_lalu !== undefined && Number(tkuForMonth.thn_lalu) >= 0 && (Number(tkuForMonth.thn_lalu) > 0 || thnLaluTotalSum === 0)) thnLaluTotalSum = Number(tkuForMonth.thn_lalu);
  }

  const rataHarian = teamTotalRata2;
  const ylCount = names.length > 0 ? names.length : 10;

  // Tren penjualan vs BB: Tren penjualan dari realisasi, BB dari transaksi PLG PJL
  let graphDates: string[] = [];
  let graphPenjualan: number[] = [];
  let graphBalikBotol: number[] = [];

  const realisasiMonth = realisasiAcc.realisasiMonth;
  
  for (let d = 1; d <= 31; d++) {
    let daySales = 0;
    let dayBbFromRealisasi = 0;
    Object.keys(realisasiMonth).forEach(area => {
      const rData = realisasiMonth[area];
      const days = rData && rData.days ? rData.days : rData;
      if (days && days[String(d)]) {
        const dObj = days[String(d)];
        daySales += (Number(dObj.yo) || 0) + (Number(dObj.om) || 0) + (Number(dObj.os) || 0) + (Number(dObj.yt) || 0);
        dayBbFromRealisasi += (Number(dObj.bb_yo) || 0) + (Number(dObj.bb_om) || 0) + (Number(dObj.bb_os) || 0) + (Number(dObj.bb_yt) || 0) + (Number(dObj.bb) || 0);
      }
    });

    const dayStrPadded = String(d).padStart(2, '0');
    const matchDatePadded = `${currentMonth}-${dayStrPadded}`;
    const matchDateUnpadded = `${currentMonth}-${d}`;
    const txBbVal = currentMonthTxs.filter((t: any) => 
      t.tanggal === matchDatePadded || 
      t.tanggal === matchDateUnpadded || 
      t.tanggal === String(d) || 
      t.tanggal === dayStrPadded ||
      (t.tanggal && t.tanggal.endsWith(`-${dayStrPadded}`))
    ).reduce((sum: number, t: any) => sum + (t.bb_yo||0) + (t.bb_om||0) + (t.bb_os||0) + (t.bb_yt||0), 0);

    const bbVal = Math.max(dayBbFromRealisasi, txBbVal);

    if (daySales > 0 || bbVal > 0) {
      graphDates.push(String(d));
      graphPenjualan.push(daySales);
      graphBalikBotol.push(bbVal);
    }
  }

  let frekuensiAbsen = 0;
  let ylAbsenSet = new Set();
  const activeNames = ylList.filter((y: any) => y.status !== "nonaktif").map((y: any) => ({ name: y.nama, area: y.area || areaPrefix(y.nama) }));

  let hariKunjunganTim = [];
  for (let d = 1; d <= 31; d++) {
    let daySales = 0;
    Object.keys(realisasiMonth).forEach(area => {
      const rData = realisasiMonth[area];
      const days = rData && rData.days ? rData.days : rData;
      if (days && days[String(d)]) {
        const dObj = days[String(d)];
        daySales += (Number(dObj.yo) || 0) + (Number(dObj.om) || 0) + (Number(dObj.os) || 0) + (Number(dObj.yt) || 0);
      }
    });
    if (daySales > 0) {
      hariKunjunganTim.push(String(d));
    }
  }

  hariKunjunganTim.forEach(dayStr => {
    activeNames.forEach((yl: any) => {
      const area = yl.area;
      const rData = realisasiMonth[area];
      const days = rData && rData.days ? rData.days : rData;
      let ylDaySales = 0;
      if (days && days[dayStr]) {
        const dObj = days[dayStr];
        ylDaySales = (Number(dObj.yo) || 0) + (Number(dObj.om) || 0) + (Number(dObj.os) || 0) + (Number(dObj.yt) || 0);
      }
      if (ylDaySales === 0) {
        frekuensiAbsen++;
        ylAbsenSet.add(area);
      }
    });
  });

  const ylAbsen = ylAbsenSet.size;

  // (Simulator fallback logic removed to prevent mock data)

  return {
    ylAbsen,
    frekuensiAbsen,
    totalPenjualan,
    rataHarian,
    salesPerYl: teamTotalPembagi > 0 ? totalPenjualan / teamTotalPembagi : 0,
    jwp: teamTotalPembagi,
    rataItem: {
      YO: teamTotalYoRata2,
      OM: teamTotalOmRata2,
      OS: teamTotalOsRata2,
      YT: teamTotalYtRata2
    },
    vsTarget: targetTotalSum > 0 ? (rataHarian / targetTotalSum) * 100 : 100,
    vsBulanLalu: blnLaluTotalSum > 0 ? (rataHarian / blnLaluTotalSum) * 100 : 100,
    vsTahunLalu: thnLaluTotalSum > 0 ? (rataHarian / thnLaluTotalSum) * 100 : 100,
    targetTim: {
      target: targetTotalSum,
      bulanLalu: blnLaluTotalSum,
      tahunLalu: thnLaluTotalSum,
      rata2: rataHarian
    },
    bbTimRaw: totalBb,
    hariAktif: teamTotalPembagi > 0 ? teamTotalPembagi / ylCount : 0,
    perYL,
    sektorTim: {
      rumah: sRmh,
      pasar: sPsr,
      sekolah: sSkh,
      kantor: sKtr,
      toko: sTk,
      ib: sIb
    },
    persenSektor: {
      rmh: persenRmh,
      tk: persenTk,
      psr: totalSektor > 0 ? Number(((sPsr / totalSektor) * 100).toFixed(1)) : 0,
      skh: totalSektor > 0 ? Number(((sSkh / totalSektor) * 100).toFixed(1)) : 0,
      ktr: totalSektor > 0 ? Number(((sKtr / totalSektor) * 100).toFixed(1)) : 0,
      ib: totalSektor > 0 ? Number(((sIb / totalSektor) * 100).toFixed(1)) : 0,
    },
    persenRmh,
    persenTk,
    grafikHarian: {
      tanggal: graphDates,
      penjualan: graphPenjualan,
      balikBotol: graphBalikBotol
    },
    plgPjlManual: db.plgPjlManual || {},
    potensiTembus: db.potensiTembus || {}
  };
}

// API ENDPOINTS

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// 1. Script URL Configuration
app.get("/api/getScriptUrl", (req, res) => {
  const db = loadData();
  res.json({ scriptUrl: db.scriptUrl || "" });
});

app.post("/api/saveScriptUrl", async (req, res) => {
  const { scriptUrl } = req.body;
  const db = loadData();
  db.scriptUrl = scriptUrl;
  await saveData(db);
  res.json({ ok: true });
});

// 1b. Supabase Configuration
app.get("/api/getSupabaseConfig", (req, res) => {
  const db = loadData();
  const url = db.supabaseConfig?.url || process.env.SUPABASE_URL || "";
  // Keamanan: HANYA kirim anon key jika ada. JANGAN PERNAH membocorkan SERVICE_ROLE_KEY ke browser.
  const key = db.supabaseConfig?.key || process.env.SUPABASE_ANON_KEY || "";
  res.json({ url, key, isConfigured: !!supabase });
});

app.post("/api/saveSupabaseConfig", async (req, res) => {
  const { url, key } = req.body;
  const db = loadData();
  const cleanUrl = formatSupabaseUrlServer(url || "");
  const cleanKey = (key || "").trim();
  db.supabaseConfig = { url: cleanUrl, key: cleanKey };

  // PENTING: client Supabase harus dibuat ULANG setiap kali config berubah
  if (cleanUrl && cleanKey) {
    try {
      supabase = createSupabaseClient(cleanUrl, cleanKey);
      lastSavedDb = {};
      for (const k of Object.keys(remoteStamp)) delete remoteStamp[k];
      remoteLoadOk = true;
      ylPhotosRemoteLoaded = false;
      seragamRemoteLoaded = false;
    } catch (e) {
      console.warn("[Supabase] Gagal inisialisasi dari config:", e);
      supabase = null;
    }
  } else {
    supabase = null;
  }

  await saveData(db);

  res.json({ ok: true, url: cleanUrl, key: cleanKey });
});

// 1c. Supabase Media Configuration (Secondary Supabase untuk Foto & Konten Non-Penjualan)
app.get("/api/getSupabaseMediaConfig", (req, res) => {
  const db = loadData();
  const url = db.supabaseMediaConfig?.url || SUPABASE_MEDIA_URL;
  const key = db.supabaseMediaConfig?.key || SUPABASE_MEDIA_KEY;
  res.json({ url, key });
});

app.post("/api/saveSupabaseMediaConfig", async (req, res) => {
  const { url, key } = req.body;
  const db = loadData();
  const cleanUrl = formatSupabaseUrlServer(url || "");
  const cleanKey = (key || "").trim();
  db.supabaseMediaConfig = { url: cleanUrl, key: cleanKey };

  if (cleanUrl && cleanKey) {
    try {
      supabaseMedia = createSupabaseClient(cleanUrl, cleanKey);
      ylPhotosRemoteLoaded = false;
      seragamRemoteLoaded = false;
    } catch (e) {
      console.warn("[Supabase Media] Gagal inisialisasi dari config:", e);
      supabaseMedia = null;
    }
  } else {
    supabaseMedia = null;
  }

  await saveData(db);
  res.json({ ok: true, url: cleanUrl, key: cleanKey });
});

app.post("/api/saveMonthlyArchive", async (req, res) => {
  const { month, snapshot } = req.body;
  if (!month || !snapshot) return res.status(400).json({ ok: false, error: "Month and snapshot required" });

  const archiveKey = `monthly_archive_${month}`;

  // 1. Save to Supabase server client
  if (supabase) {
    const { error } = await (supabase.from("app_store") as any)
      .upsert({ key: archiveKey, data: snapshot, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) {
      console.error(`[Supabase] Error saving ${archiveKey}:`, error.message);
      return res.status(500).json({ ok: false, error: "Gagal menyimpan arsip ke database: " + error.message });
    }
  }

  // 2. Save to local data.json
  const db = loadData();
  if (!db.monthlyArchives) db.monthlyArchives = {};
  db.monthlyArchives[month] = snapshot;
  await saveData(db);

  res.json({ ok: true });
});

app.get("/api/getSupabaseStatus", async (req, res) => {
  const db = loadData();
  const currentMediaUrl = db.supabaseMediaConfig?.url || SUPABASE_MEDIA_URL;

  const primaryConfig = {
    configured: !!supabase,
    url: (process.env.SUPABASE_URL || "").substring(0, 30) + "..."
  };

  let mediaStatus = {
    configured: !!supabaseMedia,
    url: currentMediaUrl,
    tableReady: false,
    message: ""
  };

  if (supabaseMedia) {
    try {
      const { error } = await (supabaseMedia.from("app_store") as any).select("key").limit(1);
      if (!error) {
        mediaStatus.tableReady = true;
        mediaStatus.message = "Tabel 'app_store' aktif dan siap dipakai!";
      } else {
        mediaStatus.tableReady = false;
        mediaStatus.message = "Tabel 'app_store' belum ditemukan. Buat tabel di SQL Editor Supabase baru.";
      }
    } catch (e: any) {
      mediaStatus.tableReady = false;
      mediaStatus.message = e?.message || "Gagal menguji tabel app_store";
    }
  } else {
    mediaStatus.message = "Supabase Media client belum aktif";
  }

  res.json({ primary: primaryConfig, media: mediaStatus });
});

// Pindahkan gambar base64 (foto YL & seragam) yang masih tersisa ke Supabase Storage
const migrateMediaToStorageHandler = async (_req: any, res: any) => {
  const result = await migrateMediaToStorage();
  res.json(result);
};
app.post("/api/migrateMediaToStorage", migrateMediaToStorageHandler);
// Versi GET supaya bisa dijalankan langsung dari browser HP (aman diulang; hanya memindahkan yang masih base64)
app.get("/api/migrateMediaToStorage", migrateMediaToStorageHandler);

// Upload 1 gambar (data URL) dari browser ke Storage media (akun kedua).
// Dipakai saveToSupabase di browser agar foto Presentasi tidak lagi menjadi base64 di tabel app_store.
app.post("/api/uploadMedia", async (req, res) => {
  try {
    const { path: objPath, dataUrl } = req.body || {};
    if (typeof objPath !== "string" || !/^(presentasi|lainnya)\/[A-Za-z0-9_-]{1,80}\/[A-Za-z0-9_-]{1,80}\.jpg$/.test(objPath)) {
      return res.status(400).json({ ok: false, message: "Path tidak valid" });
    }
    if (!isInlineImage(dataUrl)) {
      return res.status(400).json({ ok: false, message: "Data gambar tidak valid" });
    }
    if (!supabaseMedia) {
      return res.json({ ok: false, message: "Supabase Media belum aktif" });
    }
    const url = await uploadImageToStorage(objPath, dataUrl);
    if (!url) return res.json({ ok: false, message: "Upload ke Storage gagal" });
    res.json({ ok: true, url });
  } catch (e: any) {
    res.status(500).json({ ok: false, message: e?.message || "Gagal upload media" });
  }
});

// Cek cepat dari browser HP: https://<alamat-app>/api/mediaStatus
// Kalau muncul JSON ini = server versi baru sudah aktif. mediaActive/storageUsable harus true.
app.get("/api/mediaStatus", (_req, res) => {
  res.json({
    ok: true,
    version: "media-delete-v2",
    mediaActive: !!supabaseMedia,
    storageUsable: !!supabaseMedia && storageUsable(),
    bucket: MEDIA_BUCKET,
  });
});

// Hapus semua file foto di 1 folder Storage milik 1 key presentasi (dipanggil saat foto/slide dihapus dari app).
// Dibatasi KETAT: hanya folder presentasi/<key>, tidak bisa menyentuh seragam/foto profil/folder lain.
app.post("/api/deleteMediaFolder", async (req, res) => {
  try {
    const { folder } = req.body || {};
    if (typeof folder !== "string" || !/^presentasi\/[A-Za-z0-9_-]{1,80}$/.test(folder)) {
      return res.status(400).json({ ok: false, message: "Folder tidak valid" });
    }
    if (!supabaseMedia || !storageUsable()) {
      return res.json({ ok: false, message: "Supabase Media belum aktif" });
    }
    const { data: files, error: listErr } = await supabaseMedia.storage.from(MEDIA_BUCKET).list(folder, { limit: 100 });
    if (listErr) throw new Error(listErr.message || "gagal membaca folder");
    const paths = (files || []).filter((f: any) => f && f.name).map((f: any) => `${folder}/${f.name}`);
    if (paths.length === 0) return res.json({ ok: true, deleted: 0 });
    const { error: delErr } = await supabaseMedia.storage.from(MEDIA_BUCKET).remove(paths);
    if (delErr) throw new Error(delErr.message || "gagal menghapus file");
    res.json({ ok: true, deleted: paths.length });
  } catch (e: any) {
    res.status(500).json({ ok: false, message: e?.message || "Gagal menghapus media" });
  }
});

// Trigger migrasi manual foto, seragam, & motivasi ke Supabase Media baru
app.post("/api/migrateMediaToSecondary", async (req, res) => {
  const result = await syncAndMigrateMediaToSecondary();
  res.json(result);
});

app.get("/api/verifyIntegrity", (req, res) => {
  const db = loadData();
  const txs = db.transactions || [];
  
  let totalYo = 0, totalOm = 0, totalOs = 0, totalYt = 0, totalPb = 0, totalSampah = 0;
  const channelDiscrepancies: any[] = [];

  txs.forEach((t: any, idx: number) => {
    const yo = Number(t.tot_yo || 0);
    const om = Number(t.tot_om || 0);
    const os = Number(t.tot_os || 0);
    const yt = Number(t.tot_yt || 0);

    totalYo += yo;
    totalOm += om;
    totalOs += os;
    totalYt += yt;
    totalPb += Number(t.pb_p || 0) + Number(t.pb_s || 0);
    totalSampah += Number(t.apk_botol || 0);

    // Verify channel breakdown equality
    const rmhYo = Number(t.rmh_yo || 0), psrYo = Number(t.psr_yo || 0), skhYo = Number(t.skh_yo || 0), ktrYo = Number(t.ktr_yo || 0), tkYo = Number(t.tk_yo || 0), ibYo = Number(t.ib_yo || 0);
    const channelSumYo = rmhYo + psrYo + skhYo + ktrYo + tkYo + ibYo;
    if (yo > 0 && channelSumYo > 0 && yo !== channelSumYo) {
      channelDiscrepancies.push({
        row: idx + 2,
        nama: t.nama,
        tanggal: t.tanggal,
        field: "YO Channel Sum",
        expected: yo,
        actual: channelSumYo
      });
    }
  });

  const totalBottles = totalYo + totalOm + totalOs + totalYt;

  res.json({
    ok: true,
    txCount: txs.length,
    totalBottles,
    totals: { yo: totalYo, om: totalOm, os: totalOs, yt: totalYt, pb: totalPb, sampah: totalSampah },
    channelDiscrepancies,
    isHealthy: channelDiscrepancies.length === 0,
    timestamp: new Date().toISOString()
  });
});

// 2. PIN Management
// 2. PIN Management & Server-Side Authentication
app.post("/api/login", async (req, res) => {
  const { pin } = req.body || {};
  const db = loadData();
  const cleanPin = String(pin || "").trim();
  if (!cleanPin) {
    return res.status(400).json({ ok: false, error: "PIN diperlukan." });
  }

  // 1. Cek Manager PIN
  const mgrPin = String(db.managerPin || "1111").trim();
  if (cleanPin === mgrPin) {
    return res.json({
      ok: true,
      role: "manager",
      name: "Manager DP Jember 1",
      area: "ALL"
    });
  }

  // 2. Cek YL PIN
  const ylPins = db.ylPins || {};
  for (const [p, name] of Object.entries(ylPins)) {
    if (String(p).trim() === cleanPin) {
      const ylList = db.ylList || INITIAL_YL_LIST;
      const match = ylList.find((y: any) => y.nama === name || cleanYlName(y.nama) === cleanYlName(String(name)));
      const area = match ? match.area : areaPrefix(name);
      return res.json({
        ok: true,
        role: "yl",
        name: String(name),
        area: area
      });
    }
  }

  const ylList = db.ylList || INITIAL_YL_LIST;
  const ylMatch = ylList.find((y: any) => String(y.pin || "").trim() === cleanPin);
  if (ylMatch) {
    return res.json({
      ok: true,
      role: "yl",
      name: ylMatch.nama,
      area: ylMatch.area
    });
  }

  return res.status(401).json({ ok: false, error: "PIN salah. Silakan coba kembali!" });
});

app.get("/api/getPins", async (req, res) => {
  const db = loadData();
  res.json({
    managerPin: db.managerPin || "1111",
    ylPins: db.ylPins || {}
  });
});

app.post("/api/savePins", async (req, res) => {
  const { managerPin, ylPins } = req.body;
  const db = loadData();
  if (managerPin) db.managerPin = String(managerPin).trim();
  if (ylPins && typeof ylPins === "object") db.ylPins = ylPins;
  await saveData(db);
  res.json({ ok: true });
});

// Helper to call Gemini AI with retries & model fallback (gemini-3.6-flash -> gemini-3.1-flash-lite -> gemini-flash-latest)
async function generateGeminiWithRetry(params: {
  contents: any;
  systemInstruction?: string;
  temperature?: number;
  thinkingBudget?: number;
  maxOutputTokens?: number;
}) {
  const freeKey = process.env.GEMINI_API_KEY_FREE;
  const paidKey = process.env.GEMINI_API_KEY;

  if (!freeKey && !paidKey) {
    throw new Error("GEMINI_API_KEY atau GEMINI_API_KEY_FREE belum terpasang di server.");
  }

  const modelsToTry = ["gemini-3.1-flash-lite", "gemini-flash-latest", "gemini-3.8-flash"];

  // Fungsi internal untuk mencoba model-model di satu API Key tertentu secara cepat
  async function tryWithKey(apiKey: string, label: string): Promise<string> {
    let lastError: any = null;
    for (const modelName of modelsToTry) {
      try {
        const config: any = {
          temperature: params.temperature ?? 0.4,
          thinkingConfig: { thinkingBudget: params.thinkingBudget ?? 0 },
        };
        if (params.systemInstruction) {
          config.systemInstruction = params.systemInstruction;
        }
        if (params.maxOutputTokens) {
          config.maxOutputTokens = params.maxOutputTokens;
        }

        const response = await getAI(apiKey).models.generateContent({
          model: modelName,
          contents: params.contents,
          config,
        });
        if (response && response.text) {
          return response.text;
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`[Gemini] ${modelName} on ${label} error:`, err?.status || err?.message || err);
      }
    }
    throw lastError;
  }

  let finalError: any = null;

  // Lapis 1: Coba pakai key gratis jika di-set di env
  if (freeKey) {
    try {
      console.log("[Gemini] Using FREE key");
      return await tryWithKey(freeKey, "FREE key");
    } catch (err: any) {
      finalError = err;
      const status = err.status || (err.error && err.error.status) || "";
      const msg = err.message || "";
      const isQuotaExceeded = status === "RESOURCE_EXHAUSTED" || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("429") || msg.includes("quota") || msg.includes("rate-limits") || msg.includes("limit");

      // Kalau error limit & ada key berbayar -> switch!
      if (isQuotaExceeded && paidKey) {
        console.log("[Gemini] Switched to PAID key");
      } else {
        // Jika gagal bukan karena limit, atau memang tidak punya paid key, stop disini
        const errMsg = finalError?.message || "";
        if (errMsg.includes("quota") || errMsg.includes("RESOURCE_EXHAUSTED") || errMsg.includes("429") || errMsg.includes("rate-limits")) {
           throw new Error("Kuota API Key Gemini telah melampaui batas penggunaan harian/menit (Quota Exceeded / Rate Limit). Silakan coba lagi beberapa saat lagi.");
        }
        throw finalError || new Error("Model Gemini sedang mengalami lonjakan beban sementara. Silakan coba kembali beberapa saat lagi.");
      }
    }
  }

  // Lapis 2: Fallback ke key berbayar (atau eksekusi langsung jika freeKey tidak diset)
  if (paidKey) {
    try {
      if (!freeKey) console.log("[Gemini] Using PAID key"); // Biar log jelas kalau dari awal tak ada freeKey
      return await tryWithKey(paidKey, "PAID key");
    } catch (err: any) {
      finalError = err;
    }
  }

  // Catch error terakhir (kalau Paid key juga kena limit atau fail)
  const errMsg = finalError?.message || "";
  if (errMsg.includes("quota") || errMsg.includes("RESOURCE_EXHAUSTED") || errMsg.includes("429") || errMsg.includes("rate-limits")) {
    throw new Error("Kuota API Key Gemini telah melampaui batas penggunaan harian/menit (Quota Exceeded / Rate Limit). Silakan coba lagi beberapa saat lagi.");
  }

  throw finalError || new Error("Model Gemini sedang mengalami lonjakan beban sementara. Silakan coba kembali beberapa saat lagi.");
}

interface MonthlyArchiveItemSummary {
  monthKey: string;
  targetTKU?: any;
  hariKerja?: number;
  totalPenjualan?: number;
  rataHarian?: number;
  topSampah?: { area: string; nama: string; jumlah: number };
  perYL: Record<string, {
    area: string;
    nama: string;
    rata2: number;
    targetYL: number;
    akumulasi: number;
    sampahBotol: number;
    bb: number;
    persenRumah: number;
    persenRbVsPlg: number;
    propaganda: number;
    vsBln?: number;
    vsThn?: number;
  }>;
}

let cachedArchivesSummary: { data: MonthlyArchiveItemSummary[]; timestamp: number } | null = null;

async function getAllMonthlyArchivesSummary(): Promise<MonthlyArchiveItemSummary[]> {
  const now = Date.now();
  if (cachedArchivesSummary && (now - cachedArchivesSummary.timestamp < 300000)) {
    return cachedArchivesSummary.data;
  }

  const result: MonthlyArchiveItemSummary[] = [];
  const rawArchivesMap = new Map<string, any>();

  // 1. Ambil dari database lokal
  const db = loadData();
  if (db.monthlyArchives && typeof db.monthlyArchives === "object") {
    for (const [mKey, snap] of Object.entries(db.monthlyArchives)) {
      rawArchivesMap.set(mKey, snap);
    }
  }

  // 2. Ambil dari Supabase
  if (supabase) {
    try {
      const { data, error } = await (supabase.from("app_store") as any)
        .select("key, data")
        .like("key", "monthly_archive_%");
      if (!error && Array.isArray(data)) {
        for (const row of data) {
          if (row.key === "monthly_archive_list") continue;
          const mKey = row.key.replace("monthly_archive_", "");
          if (row.data) {
            rawArchivesMap.set(mKey, row.data);
          }
        }
      }
    } catch (e: any) {
      console.warn("[ArchivesSummary] Error fetching from Supabase:", e?.message || e);
    }
  }

  // Parse each archive
  const parseIndoNumber = (val: any): number => {
    if (typeof val === "number") return isNaN(val) ? 0 : val;
    if (!val) return 0;
    const s = String(val).trim().replace(/\./g, "").replace(/,/g, ".");
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  };

  for (const [mKey, raw] of rawArchivesMap.entries()) {
    const snap = raw.data || raw;
    const itemSummary: MonthlyArchiveItemSummary = {
      monthKey: mKey,
      targetTKU: snap.targetTKU || snap.dashboardData?.targetTim || null,
      hariKerja: snap.hariKerja || snap.pembagiManager || 25,
      totalPenjualan: snap.summaryData?.totalPenjualan || 0,
      rataHarian: snap.summaryData?.rataHarian || snap.dashboardData?.rataHarian || 0,
      perYL: {}
    };

    const evalAnalisis = snap.evaluasiData?.analisis || [];
    const evalRows = snap.evaluasiData?.dataRows || [];
    const evalPerYl = snap.evaluasiData?.perYL || snap.dashboardData?.perYL || snap.perYL || {};
    const targetYLMap = snap.targetYLMap || snap.targetYL || {};

    const areas = ["201", "202", "203", "204", "205", "206", "207", "208", "209", "210"];
    for (const area of areas) {
      const aObj = evalAnalisis.find((x: any) => String(x.area) === area) || {};
      const rRow = evalRows.find((r: any) => String(r[0]) === area);
      const yObj = evalPerYl[area] || {};
      const tgtObj = targetYLMap[`${area}_${mKey}`] || targetYLMap[area] || {};

      const nama = aObj.nama || (rRow ? String(rRow[1]) : "") || yObj.nama || cleanYlName(area);
      const rata2 = parseIndoNumber(aObj.rata2BulanBerjalan ?? (rRow ? rRow[13] : yObj.rata2));
      const targetYL = parseIndoNumber(tgtObj.target ?? yObj.targetYL);
      const akumulasi = parseIndoNumber(yObj.akumulasi ?? (rata2 * itemSummary.hariKerja!));
      const sampahBotol = parseIndoNumber(aObj.sampahBotol ?? (rRow ? rRow[26] : 0));
      const bb = parseIndoNumber(aObj.bb ?? (rRow ? rRow[28] : yObj.bb));
      const persenRumah = parseIndoNumber(aObj.persenRumah ?? (rRow ? rRow[18] : 0));
      const persenRbVsPlg = parseIndoNumber(aObj.persenRbVsPlg ?? (rRow ? rRow[21] : 0));
      const propaganda = parseIndoNumber(aObj.propagandaHariIni ?? (rRow ? (parseIndoNumber(rRow[22]) + parseIndoNumber(rRow[23])) : 0));

      itemSummary.perYL[area] = {
        area,
        nama,
        rata2,
        targetYL,
        akumulasi,
        sampahBotol,
        bb,
        persenRumah,
        persenRbVsPlg,
        propaganda,
        vsBln: yObj.vsBln,
        vsThn: yObj.vsThn
      };
    }

    // Tentukan pengumpul sampah botol terbanyak
    let maxSampah = 0;
    let topSampahArea = "";
    let topSampahNama = "";
    for (const yl of Object.values(itemSummary.perYL)) {
      if (yl.sampahBotol > maxSampah) {
        maxSampah = yl.sampahBotol;
        topSampahArea = yl.area;
        topSampahNama = yl.nama;
      }
    }
    if (topSampahArea && maxSampah > 0) {
      itemSummary.topSampah = {
        area: topSampahArea,
        nama: topSampahNama,
        jumlah: maxSampah
      };
    }

    result.push(itemSummary);
  }

  result.sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  cachedArchivesSummary = { data: result, timestamp: now };
  return result;
}

// 2b. AI Chatbot Analysis and General Q&A
app.post("/api/ai/chat", async (req, res) => {
  let roleVal = "manager";
  let userNameVal = "";
  let db: any = {};
  try {
    const { message, history, role, user_name, bot_name } = req.body;
    roleVal = role || "manager";
    userNameVal = user_name || "";

    if (!message) {
      return res.status(400).json({ error: "Pesan tidak boleh kosong" });
    }

    db = loadData();
    // Gunakan nama bot yang diatur di Pengaturan (db.motivasi.chatbotName) atau kiriman client
    const configuredBotName = bot_name || db?.motivasi?.chatbotName || "Zuzu";

    // 1. Cek FAQ Lokal terlebih dahulu (0 Token, respons instan < 1ms)
    const faqAnswer = findFaqAnswer(String(message));
    if (faqAnswer) {
      return res.json({ reply: faqAnswer });
    }

    // 2. Intent Classifier / Router: Deteksi Pekerjaan vs Luar Pekerjaan
    const isWork = roleVal === "manager" || isWorkRelatedQuery(String(message));

    // SKENARIO A: Topik Luar Pekerjaan (Resep, Hiburan, Tips Harian, Obrolan Santai)
    // -> Kirim TANPA konteks data pekerjaan sama sekali (Hemat >90% token!)
    if (!isWork) {
      const generalInstruction = `Kamu adalah "${configuredBotName}", asisten pintar dan ramah untuk Yakult Lady DP Jember 1.
Pengguna yang sedang menyapamu adalah Ibu ${userNameVal || "Yakult Lady"}.

TUGAS UTAMA:
Jawab pertanyaan santai, resep masakan, tips kesehatan umum, atau obrolan sehari-hari di luar pekerjaan secara ramah, hangat, dan bermanfaat.

ATURAN JAWABAN:
- Singkat, Jelas, & Padat: Maksimal 2–4 kalimat atau poin-poin ringkas.
- Nada Bicara: Ramah, penuh semangat, sopan, dan hangat layaknya sahabat dekat.
- JANGAN PERNAH menyebut pengguna dengan sebutan "Manager" atau "Pak Wito". Panggil beliau dengan "Ibu ${userNameVal || "Ibu"}".`;

      const chatHistory = (history || []).slice(-4).map((h: any) => ({
        role: h.role === "user" ? "user" : "model",
        parts: [{ text: h.content }]
      }));

      const contents = [
        ...chatHistory,
        { role: "user", parts: [{ text: message }] }
      ];

      const reply = await generateGeminiWithRetry({
        contents,
        systemInstruction: generalInstruction,
        temperature: 0.4,
        maxOutputTokens: 300,
        thinkingBudget: 0
      });

      return res.json({ reply });
    }

    // SKENARIO B: Pertanyaan Pekerjaan / Operasional Yakult
    // -> Ambil data spesifik akun (RAG) dan kirimkan sebagai [DATA RUJUKAN]
    const month = resolveActiveMonth(db);
    const archives = await getAllMonthlyArchivesSummary();
    const ctx = await buildAiDataContext(
      {
        db,
        dashboard: calculateDashboardDP1(db, month),
        archives,
        getMonthMap: (k: string) => getMonthBreakdownRealisasiMap(db, k),
        cleanYlName
      },
      { role: roleVal === "manager" ? "manager" : "yl", userName: userNameVal, message: String(message) }
    );

    const systemInstruction = `
Kamu adalah "${configuredBotName}", asisten virtual pintar dan terpercaya untuk aplikasi Yakult Lady Management System DP Jember 1.
Pengguna yang sedang login adalah: ${roleVal === "manager" ? "Admin (Manager/DP)" : "Yakult Lady (Ibu " + userNameVal + ")"}.

${roleVal === "manager" ? `
=== MODE ADMIN (DP / MANAGER) ===
- Profesional, ringkas, dan to the point.
- Mampu membaca dan menganalisis data tim penjualan, evaluasi retur BB, dan target harian.
- Standar: YL Mandiri >= 250 btl/hari, Toko <= 30%, BB <= 10%, Rumah >= 55%.
` : `
=== MODE YAKULT LADY (YL) ===
- Pengguna yang sedang berbicara denganmu: Ibu ${userNameVal} (Yakult Lady).
- KAMU BUKAN SEDANG BERBICARA DENGAN MANAGER ATAU BAPAK WITO!
- DILARANG KERAS memanggil pengguna dengan sebutan "Manager", "Pak Wito", atau "Bapak Wito".
- Selalu panggil dengan hangat dan sopan: "Ibu ${userNameVal}".
- Pengetahuan Produk & Perusahaan: Kamu memahami dengan sangat baik pengetahuan resmi Yakult (seperti lokasi pabrik di Sukabumi & Mojokerto, sejarah Dr. Minoru Shirota, bakteri L. casei Shirota strain, aturan minum, masa simpan, dan manfaat probiotik). Jawablah pertanyaan seputar pengetahuan produk/perusahaan secara cerdas, ramah, dan informatif.
- Angka Laporan Operasional: Blok [DATA RUJUKAN] digunakan khusus untuk angka operasional (penjualan, target harian, kompensasi, retur BB, rute). HANYA jika Ibu menanyakan angka rekapan pribadi yang memang belum terdata, barulah sampaikan santun bahwa datanya belum tercatat di sistem atau bisa konfirmasi ke kantor.
`}

ATURAN JAWABAN:
- Singkat, Jelas, & Padat: Maksimal 2–4 kalimat atau poin-poin ringkas.
- Akurasi Data: HANYA gunakan angka yang benar-benar ada di [DATA RUJUKAN]. Dilarang keras mengarang angka laporan.

=== RUMUS PERHITUNGAN KOMPENSASI & ESTIMASI BONUS (RESMI DP JEMBER 1) ===
- Rata-rata Harian = Akumulasi Penjualan / Hari Pembagi
- Tier Tarif per Botol:
  * < 200 btl/hari -> Rp 338/botol
  * 200 - 249 btl/hari -> Rp 374/botol
  * 250 - 279 btl/hari -> Rp 409/botol
  * 280 - 299 btl/hari -> Rp 417/botol
  * 300 - 329 btl/hari -> Rp 424/botol
  * 330 - 349 btl/hari -> Rp 428/botol
  * >= 350 btl/hari -> Rp 432/botol
- Kompensasi Kotor = Akumulasi Penjualan x Tarif per Botol
- Potongan PPh (2.5%) = 2.5% x Kompensasi Kotor
- Iuran JKK/JKM = Rp 18.800
- Iuran JHT = Rp 24.000 (jika ikut JHT)
- Kompensasi Bersih = Kompensasi Kotor - PPh (2.5%) - JKK/JKM - JHT

[DATA RUJUKAN]
${ctx.text}
`;

    const chatHistory = (history || []).slice(-4).map((h: any) => ({
      role: h.role === "user" ? "user" : "model",
      parts: [{ text: h.content }]
    }));

    const contents = [
      ...chatHistory,
      { role: "user", parts: [{ text: message }] }
    ];

    const reply = await generateGeminiWithRetry({
      contents,
      systemInstruction,
      temperature: 0.3,
      maxOutputTokens: 350,
      thinkingBudget: 0
    });

    res.json({ reply });
  } catch (error: any) {
    console.warn("AI Chat Error (Using Smart Fallback):", error?.message || error);
    let fallbackReply = "";
    if (roleVal === "manager") {
      fallbackReply = `📊 **[Sistem Analisis Tim DP Jember 1]**\n\n` +
        `Layanan AI Gemini sedang dalam penyesuaian kuota jaringan sementara. Berikut ringkasan tim Anda:\n` +
        `- **Total Transaksi Laporan:** ${db.transactions ? db.transactions.length : 0} laporan tersimpan\n` +
        `- **Status Database:** Seluruh data operasional tersimpan aman di server.\n\n` +
        `💡 Silakan kirimkan kembali pertanyaan Anda dalam beberapa saat lagi.`;
    } else {
      fallbackReply = `Assalamu'alaikum Ibu ${userNameVal || ""} sayang! ❤️\n\n` +
        `Sistem AI sedang menyesuaikan trafik jaringan sebentar. Tetap semangat nggih Bu di rute harian hari ini! Jaga selalu kesehatan dan senyuman ramah untuk para pelanggan harian Ibu. ✨🌸`;
    }
    res.json({ reply: fallbackReply });
  }
});

// 2c. Dedicated AI Analysis for Presentation Menu (Slide 10 & Executive Summary)
app.post("/api/ai/evaluate-presentasi", async (req, res) => {
  try {
    const { periode, selectedYear, monthIndex, monthLabel, bulanan, perYL, currentArchive } = req.body;
    const archivesSummary = await getAllMonthlyArchivesSummary();

    // Konteks data dibangun di SERVER (rumus sama dengan layar), bukan dipercaya dari kiriman client.
    // PresentasiView hanya dirender di ManagerView, jadi role = manager (seluruh tim, 10 area).
    // Bila nanti dipakai YL: kirim `role` dan `userName` di body fetch lalu teruskan ke opts di bawah.
    const periodeVal: string = ["bulanan", "s1", "s2", "tahunan"].includes(String(periode)) ? String(periode) : "bulanan";
    const yearNum = parseInt(String(selectedYear), 10) || new Date().getFullYear();
    const monthIdxNum = Number.isFinite(Number(monthIndex)) ? Number(monthIndex) : 0;
    const db = loadData();
    const activeMonth = resolveActiveMonth(db);
    const periodKeys = monthKeysForPeriod(periodeVal, yearNum, monthIdxNum);
    const periodText = await buildPeriodContext(
      {
        db,
        dashboard: calculateDashboardDP1(db, activeMonth),
        archives: archivesSummary,
        getMonthMap: (k: string) => getMonthBreakdownRealisasiMap(db, k),
        cleanYlName
      },
      { role: "manager", periode: periodeVal, year: yearNum, monthIndex: monthIdxNum }
    );

    const prompt = `
Anda adalah konsultan senior dan analis performa operasional untuk unit penjualan Yakult Lady (YL) DP Jember 1.
Tugas Anda adalah membuat analisis mendalam, tajam, dan memotivasi untuk ditampilkan pada Slide Presentasi Evaluasi Tim.

PERIODE: ${periodeVal === "bulanan" ? `Bulan ${monthLabel} ${yearNum}` : periodeVal === "s1" ? `Semester 1 ${yearNum}` : periodeVal === "s2" ? `Semester 2 ${yearNum}` : `Tahunan ${yearNum}`}
BULAN AKTIF SISTEM: ${activeMonth} | BULAN YANG TERCAKUP PERIODE INI: ${periodKeys.join(", ")}

=== SUMBER DATA UTAMA (dihitung server, rumus sama dengan layar Dashboard & Evaluasi) ===
${periodText}

=== DATA PEMBANDING DARI LAYAR PRESENTASI (kiriman client, hanya pembanding) ===
DATA CAPAIAN TIM (BULANAN/PERIODE):
${JSON.stringify(bulanan || {})}

DATA EVALUASI 10 AREA YL:
${JSON.stringify(perYL || [])}

DATA ARSIP KHUSUS PERIODE INI:
${JSON.stringify(currentArchive || {})}

ARSIP HISTORIS LAINNYA UNTUK REFERENSI PERBANDINGAN:
${JSON.stringify(archivesSummary.map(a => ({ month: a.monthKey, totalPenjualan: a.totalPenjualan, rataHarian: a.rataHarian, topSampah: a.topSampah })))}

ATURAN SUMBER DATA:
- Jadikan "SUMBER DATA UTAMA" sebagai acuan angka. Kutip apa adanya, jangan dihitung ulang dengan cara lain.
- "DATA PEMBANDING" hanya untuk cross-check. Jika angkanya berbeda dari SUMBER DATA UTAMA, pakai angka SUMBER DATA UTAMA dan sebutkan singkat bahwa ada selisih dengan tampilan layar presentasi (sertakan kedua angka).
- Jika di SUMBER DATA UTAMA tertulis sebuah bulan "belum ada arsip tersimpan", sebutkan dengan jujur bahwa bulan tersebut belum ada arsip. DILARANG mengarang angkanya dan jangan memakai data pembanding untuk mengisi bulan itu tanpa menyebut bahwa angkanya hanya dari layar presentasi dan belum terverifikasi arsip.
- Untuk periode semester/tahunan, analisis hanya bulan yang datanya ada, dan sebutkan bulan mana yang belum ada datanya.

ATURAN DAN TOLOK UKUR PENILAIAN:
1. AKURASI ANGKA MUTLAK: Wajib menyebutkan angka riil, persentase, dan nama Ibu YL / area sesuai data di atas. Jangan mengarang angka atau nama!
2. BALIK BOTOL (BB): Balik botol adalah botol retur yang tidak laku terjual. Nilai BB kecil/nol = SANGAT BAGUS (berikan pujian). Nilai BB tinggi = MASALAH/KERUGIAN (berikan solusi rute/pengurangan retur).
3. SAMPAH BOTOL (APK BOTOL): Semakin banyak sampah botol yang dikumpulkan pelanggan = SANGAT BAIK untuk kepedulian lingkungan & retensi pelanggan.
4. TARGET MANDIRI: Rata-rata harian minimal 250 botol/hari adalah kategori Mandiri. Di bawah 250 botol/hari adalah kategori Binaan yang perlu pendampingan.
5. FORMAT KELUARAN HARUS MURNI JSON VALID (tanpa markdown backticks \`\`\`json) dengan struktur persis:
{
  "top3Baik": [
    "Poin apresiasi 1 lengkap dengan angka riil dan nama Ibu YL",
    "Poin apresiasi 2 lengkap dengan capaian target / S/YL / BB aman",
    "Poin apresiasi 3 tentang kedisiplinan rute / sampah botol / IB"
  ],
  "top2Perbaikan": [
    "Poin perbaikan 1 dengan angka kekurangan dan solusi konkret rute",
    "Poin perbaikan 2 dengan fokus penataan kulkas pelanggan / dampingi binaan"
  ],
  "kesimpulan": "2-3 kalimat kesimpulan lugas dan terarah untuk arah melangkah bulan depan.",
  "speakerNotes": "Panduan narasi pembicara yang hangat, penuh kasih, dan membangkitkan rasa bangga."
}
`;

    const text = await generateGeminiWithRetry({
      contents: prompt,
      temperature: 0.6
    });

    let cleanJson = (text || "").trim();
    if (cleanJson.startsWith("```")) {
      cleanJson = cleanJson.replace(/^```json?\s*/i, "").replace(/```$/g, "").trim();
    }
    const parsed = JSON.parse(cleanJson);
    res.json({ ok: true, ...parsed });
  } catch (err: any) {
    console.warn("Evaluate Presentasi AI error:", err?.message || err);
    res.status(500).json({ ok: false, error: err?.message || "Gagal menghasilkan analisis AI presentasi" });
  }
});

// Bulan Aktif Global (disinkronkan ke SEMUA device — Manager & semua YL), supaya
// bulan yang ditampilkan tidak lagi tergantung localStorage/tanggal kalender tiap HP
// masing-masing (bug lama: HP Manager & HP YL bisa menampilkan bulan berbeda).
app.get("/api/getGlobalMonth", (req, res) => {
  const db = loadData();
  res.json({ globalMonth: db.globalMonth || null });
});

app.post("/api/saveGlobalMonth", async (req, res) => {
  const { globalMonth } = req.body || {};
  if (!globalMonth || !/^\d{4}-\d{2}$/.test(globalMonth)) {
    return res.status(400).json({ ok: false, error: "Format bulan tidak valid (harus YYYY-MM)" });
  }
  const db = loadData();
  db.globalMonth = globalMonth;
  await saveData(db);
  res.json({ ok: true, globalMonth: db.globalMonth });
});

// Helper simpan konfigurasi motivasi ke Supabase Media (Akun Kedua)
async function persistMotivasiToMedia(motivasiData: any) {
  if (supabaseMedia) {
    try {
      const { error } = await (supabaseMedia.from("app_store") as any).upsert([
        {
          key: "motivasi_config",
          data: motivasiData,
          updated_at: new Date().toISOString()
        }
      ], { onConflict: "key" });
      if (!error && supabase) {
        try {
          await (supabase.from("app_store") as any).delete().in("key", ["motivasi_config", "main_db_motivasi"]);
        } catch {}
        return;
      }
    } catch (e) {}
  }
}

// 3. Floating Banner Motivasi
app.get("/api/getMotivasi", async (req, res) => {
  const db = loadData();
  if (!db.motivasi) {
    db.motivasi = { list: [...DEFAULT_MOTIVASI], terpilih: [...DEFAULT_MOTIVASI], intervalDetik: 5, enabled: true, chatbotName: "Zuzu", tkuName: "DP Jember 1" };
  }
  if (!db.motivasi.chatbotName) db.motivasi.chatbotName = "Zuzu";
  if (!db.motivasi.tkuName) db.motivasi.tkuName = "DP Jember 1";

  res.json(db.motivasi);
});

app.post("/api/saveMotivasi", async (req, res) => {
  try {
    const { list, terpilih, chatbotName, tkuName, intervalDetik, enabled } = req.body || {};
    const db = loadData();
    if (!db.motivasi) {
      db.motivasi = { list: [...DEFAULT_MOTIVASI], terpilih: [...DEFAULT_MOTIVASI], intervalDetik: 5, enabled: true, chatbotName: "Zuzu", tkuName: "DP Jember 1" };
    }
    if (list !== undefined && Array.isArray(list)) db.motivasi.list = list;
    if (terpilih !== undefined && Array.isArray(terpilih)) db.motivasi.terpilih = terpilih;
    if (chatbotName !== undefined) db.motivasi.chatbotName = chatbotName;
    if (tkuName !== undefined) db.motivasi.tkuName = tkuName;
    if (intervalDetik !== undefined) db.motivasi.intervalDetik = intervalDetik;
    if (enabled !== undefined) db.motivasi.enabled = enabled;
    await saveData(db);
    persistMotivasiToMedia(db.motivasi).catch(() => {});

    res.json({ ok: true, motivasi: db.motivasi });
  } catch (err: any) {
    console.error("Error in saveMotivasi:", err);
    res.json({ ok: true });
  }
});

app.post("/api/saveChatbotName", async (req, res) => {
  try {
    const { name } = req.body || {};
    const db = loadData();
    if (!db.motivasi) {
      db.motivasi = { list: [...DEFAULT_MOTIVASI], terpilih: [...DEFAULT_MOTIVASI], intervalDetik: 5, enabled: true, chatbotName: "Zuzu", tkuName: "DP Jember 1" };
    }
    const cleanName = name ? String(name).trim() : "Zuzu";
    db.motivasi.chatbotName = cleanName;
    await saveData(db);
    persistMotivasiToMedia(db.motivasi).catch(() => {});

    res.json({ ok: true, chatbotName: db.motivasi.chatbotName });
  } catch (err: any) {
    console.error("Error in saveChatbotName:", err);
    res.json({ ok: true });
  }
});

app.post("/api/saveTkuName", async (req, res) => {
  try {
    const { name } = req.body || {};
    const db = loadData();
    if (!db.motivasi) {
      db.motivasi = { list: [...DEFAULT_MOTIVASI], terpilih: [...DEFAULT_MOTIVASI], intervalDetik: 5, enabled: true, chatbotName: "Zuzu", tkuName: "DP Jember 1" };
    }
    const cleanName = name ? String(name).trim() : "DP Jember 1";
    db.motivasi.tkuName = cleanName;
    await saveData(db);
    persistMotivasiToMedia(db.motivasi).catch(() => {});

    res.json({ ok: true, tkuName: db.motivasi.tkuName });
  } catch (err: any) {
    console.error("Error in saveTkuName:", err);
    res.json({ ok: true });
  }
});

app.post("/api/saveMotivasiInterval", async (req, res) => {
  const { detik } = req.body;
  const db = loadData();
  if (!db.motivasi) {
    db.motivasi = { list: [...DEFAULT_MOTIVASI], terpilih: [...DEFAULT_MOTIVASI], intervalDetik: 5, enabled: true, chatbotName: "Zuzu", tkuName: "DP Jember 1" };
  }
  db.motivasi.intervalDetik = detik;
  await saveData(db);
  persistMotivasiToMedia(db.motivasi).catch(() => {});

  res.json({ ok: true });
});

app.post("/api/saveMotivasiEnabled", async (req, res) => {
  const { enabled } = req.body;
  const db = loadData();
  if (!db.motivasi) {
    db.motivasi = { list: [...DEFAULT_MOTIVASI], terpilih: [...DEFAULT_MOTIVASI], intervalDetik: 5, enabled: true, chatbotName: "Zuzu", tkuName: "DP Jember 1" };
  }
  db.motivasi.enabled = enabled;
  await saveData(db);
  persistMotivasiToMedia(db.motivasi).catch(() => {});

  res.json({ ok: true });
});

app.post("/api/resetMotivasiDefault", async (req, res) => {
  const db = loadData();
  const existingChatbotName = db.motivasi?.chatbotName || "Zuzu";
  const existingTkuName = db.motivasi?.tkuName || "DP Jember 1";

  db.motivasi = {
    list: [...DEFAULT_MOTIVASI],
    terpilih: [...DEFAULT_MOTIVASI],
    intervalDetik: 5,
    enabled: true,
    chatbotName: existingChatbotName,
    tkuName: existingTkuName
  };
  await saveData(db);
  persistMotivasiToMedia(db.motivasi).catch(() => {});

  res.json({ ok: true });
});

app.post("/api/clearMotivasiCache", (req, res) => {
  res.json({ ok: true });
});

app.post("/api/bersihkanSampah", (req, res) => {
  res.json({ ok: true, deletedCount: 0 });
});

// 4. Papan Kontes

app.get("/api/getSeragam", async (req, res) => {
  const db = loadData();
  if (!db.seragam) db.seragam = { images: {}, schedules: {}, schedulesKaryawan: {} };

  const hasImages = db.seragam.images && Object.keys(db.seragam.images).length > 0;
  
  // 1. Lazy-load dari Supabase Media jika gambar belum ada di memori dan belum pernah dimuat
  if (!hasImages && supabaseMedia && !seragamRemoteLoaded) {
    try {
      const { data: row, error } = await (supabaseMedia.from("app_store") as any)
        .select("data")
        .eq("key", "main_db_seragam")
        .maybeSingle();
      if (!error && row && row.data) {
        db.seragam = {
          images: { ...(db.seragam.images || {}), ...(row.data.images || {}) },
          schedules: row.data.schedules || db.seragam.schedules || {},
          schedulesKaryawan: row.data.schedulesKaryawan || db.seragam.schedulesKaryawan || {}
        };
        seragamRemoteLoaded = true;
      }
    } catch (err) {
      console.warn("[Supabase Media] Gagal lazy-load seragam:", err);
    }
  }

  // 2. Fallback ke Supabase Lama jika di Supabase Media belum ada
  if (!hasImages && !seragamRemoteLoaded && supabase) {
    try {
      const { data: row } = await (supabase.from("app_store") as any)
        .select("data")
        .eq("key", "main_db_seragam")
        .maybeSingle();
      if (row && row.data) {
        db.seragam = {
          images: { ...(db.seragam.images || {}), ...(row.data.images || {}) },
          schedules: row.data.schedules || db.seragam.schedules || {},
          schedulesKaryawan: row.data.schedulesKaryawan || db.seragam.schedulesKaryawan || {}
        };
        seragamRemoteLoaded = true;
      }
    } catch (err) {
      console.warn("[Supabase] Gagal lazy-load seragam:", err);
    }
  }

  // Tandai sudah dicoba supaya request berikutnya tidak menembak dua Supabase lagi
  // kalau memang belum ada data seragam di mana pun (hemat egress).
  seragamRemoteLoaded = true;
  res.setHeader("Cache-Control", "private, max-age=30");
  res.json(db.seragam);
});

app.post("/api/saveSeragam", async (req, res) => {
  if (!cachedDb.seragam) cachedDb.seragam = { images: {}, schedules: {}, schedulesKaryawan: {} };
  
  if (req.body.images && typeof req.body.images === "object") {
    const compressedImages: Record<string, string> = {};
    for (const k of Object.keys(req.body.images)) {
      compressedImages[k] = await storeImage("seragam", k, await compressBase64Image(req.body.images[k], 500, 75));
    }
    cachedDb.seragam.images = { ...cachedDb.seragam.images, ...compressedImages };
  }
  
  if (req.body.schedules) {
    cachedDb.seragam.schedules = req.body.schedules;
  }

  if (req.body.schedulesKaryawan) {
    cachedDb.seragam.schedulesKaryawan = req.body.schedulesKaryawan;
  }
  
  safeWriteFile(DATA_FILE, JSON.stringify(cachedDb));

  // Simpan ke Supabase Media (Akun Baru)
  let savedToMedia = false;
  if (supabaseMedia) {
    try {
      const { error } = await (supabaseMedia.from("app_store") as any).upsert([
        {
          key: "main_db_seragam",
          data: cachedDb.seragam,
          updated_at: new Date().toISOString()
        }
      ], { onConflict: "key" });
      if (!error) {
        savedToMedia = true;
        // Bersihkan dari Supabase Lama agar akun lama bebas dari seragam
        if (supabase) {
          try {
            await (supabase.from("app_store") as any).delete().eq("key", "main_db_seragam");
          } catch {}
        }
      } else {
        console.warn("[Supabase Media] Gagal simpan seragam ke media Supabase:", error.message);
      }
    } catch (err) {
      console.error("[Supabase Media] Exception save seragam:", err);
    }
  }

  // Fallback cadangan ke Supabase Lama HANYA jika Supabase Media belum aktif / gagal
  if (!savedToMedia && supabase) {
    try {
      await (supabase.from("app_store") as any).upsert([
        {
          key: "main_db_seragam",
          data: cachedDb.seragam,
          updated_at: new Date().toISOString()
        }
      ], { onConflict: "key" });
    } catch (err) {
      console.error("[Supabase] Gagal menyimpan seragam ke Supabase lama:", err);
    }
  }

  res.json({ success: true, seragam: cachedDb.seragam });
});

app.get("/api/getKontes", async (req, res) => {
  const db = loadData();
  res.json(db.kontes);
});

// 5. General Data Loading & Transactions
app.get("/api/getAll", async (req, res) => {
  const db = loadData();
  res.json({ transactions: db.transactions });
});

app.get("/api/getMine", async (req, res) => {
  const { nama, month: monthQuery } = req.query;
  const db = loadData();
  // Kode area dibandingkan lewat 2 angka terakhir (1 / 01 / 201 dianggap sama)
  let area: string | null = areaPrefix(String(nama || "")) || null;
  const cleanName = cleanYlName(String(nama || ""));
  if (!area && cleanName && Array.isArray(db.ylList)) {
    // Nama tanpa awalan kode area (mis. "Gusrina") -> cari area dari daftar YL
    const found = db.ylList.find((y: any) => y.nama === nama || cleanYlName(String(y.nama || "")) === cleanName);
    if (found && found.area) area = String(found.area);
  }
  let myTxs = (db.transactions || []).filter((t: any) => 
    t.nama === nama || 
    (area && t.nama && (String(t.nama).startsWith(area) || sameArea(areaFromName(t.nama), area))) ||
    (area && t.area && (t.area === area || sameArea(t.area, area) || String(nama).startsWith(t.area) || t.area === nama)) ||
    (cleanName && cleanYlName(t.nama || "") === cleanName)
  );
  myTxs = deduplicateTransactions(myTxs);

  if (monthQuery && typeof monthQuery === "string") {
    myTxs = myTxs.filter((t: any) => t.tanggal && t.tanggal.startsWith(monthQuery));
  }

  // Return targets for YL
  const targetYLList = Object.keys(db.targetYL || {})
    .filter(k => !!area && sameArea(k.split("_")[0], area))
    .map(k => ({
      nama: nama,
      bulan: k.split("_").slice(1).join("_"),
      target: db.targetYL[k].target,
      bln_lalu: db.targetYL[k].bln_lalu,
      thn_lalu: db.targetYL[k].thn_lalu,
      e6: db.targetYL[k].e6
    }));

  const myBreakdown = myTxs.map((t: any) => ({
    tanggal: t.tanggal,
    breakdown: { yo: t.plan_yo || 0, om: t.plan_om || 0, os: t.plan_os || 0, yt: t.plan_yt || 0 },
    realisasi: { yo: t.tot_yo || 0, om: t.tot_om || 0, os: t.tot_os || 0, yt: t.tot_yt || 0 }
  }));

  const month = (req.query.month as string) || new Date().toISOString().substring(0, 7);
  const currentMonthPlan = db.breakdownPlan && db.breakdownPlan[month] && area ? pickByArea(db.breakdownPlan[month], area) || null : null;
  const currentMonthAdminRealisasi = db.breakdownRealisasi && db.breakdownRealisasi[month] && area ? pickByArea(db.breakdownRealisasi[month], area) || null : null;

  res.json({
    transactions: myTxs,
    targetYL: targetYLList,
    breakdownRealisasi: myBreakdown,
    breakdownPlan: currentMonthPlan,
    adminBreakdownRealisasi: currentMonthAdminRealisasi,
    attention: db.attention || {}
  });
});

// GET /api/getBreakdownPlan
app.get("/api/getBreakdownPlan", (req, res) => {
  const month = (req.query.month as string) || new Date().toISOString().substring(0, 7);
  const db = loadData();
  let planData = (db.breakdownPlan && db.breakdownPlan[month]) ? db.breakdownPlan[month] : {};
  const realisasiData = (db.breakdownRealisasi && db.breakdownRealisasi[month]) ? db.breakdownRealisasi[month] : {};
  
  if (Object.keys(planData).length === 0 && Object.keys(realisasiData).length > 0) {
    planData = JSON.parse(JSON.stringify(realisasiData));
    if (!db.breakdownPlan) db.breakdownPlan = {};
    db.breakdownPlan[month] = planData;
    saveData(db);
  } else if (Object.keys(planData).length > 0 && Object.keys(realisasiData).length > 0) {
    // Otomatis masukkan data tanggal yang sudah terealisasi ke dalam Breakdown Plan
    let hasChanges = false;
    const realizedDays: number[] = [];
    for (let d = 1; d <= 31; d++) {
      let teamTotal = 0;
      Object.values(realisasiData).forEach((ylReal: any) => {
        const dObj = ylReal?.days?.[String(d)] || ylReal?.days?.[d];
        if (dObj) {
          teamTotal += (Number(dObj.yo) || 0) + (Number(dObj.om) || 0) + (Number(dObj.os) || 0) + (Number(dObj.yt) || 0);
        }
      });
      if (teamTotal > 0) realizedDays.push(d);
    }

    if (realizedDays.length > 0) {
      Object.keys(realisasiData).forEach(area => {
        if (!planData[area]) {
          planData[area] = { pembagiTanggal: realisasiData[area]?.pembagiTanggal || 25, days: {} };
          hasChanges = true;
        }
        if (!planData[area].days) planData[area].days = {};

        realizedDays.forEach(d => {
          const dStr = String(d);
          const rObj = realisasiData[area]?.days?.[dStr] || realisasiData[area]?.days?.[d];
          if (rObj) {
            const pObj = planData[area].days[dStr] || { yo: 0, om: 0, os: 0, yt: 0 };
            const rYo = Number(rObj.yo) || 0;
            const rOm = Number(rObj.om) || 0;
            const rOs = Number(rObj.os) || 0;
            const rYt = Number(rObj.yt) || 0;

            if (pObj.yo !== rYo || pObj.om !== rOm || pObj.os !== rOs || pObj.yt !== rYt) {
              planData[area].days[dStr] = { yo: rYo, om: rOm, os: rOs, yt: rYt };
              hasChanges = true;
            }
          }
        });
      });
    }

    if (hasChanges) {
      if (!db.breakdownPlan) db.breakdownPlan = {};
      db.breakdownPlan[month] = planData;
      saveData(db);
    }
  }

  res.json({ ok: true, month, breakdownPlan: planData, breakdownRealisasi: realisasiData });
});

// GET /api/getPotensiNotifications
app.get("/api/getPotensiNotifications", (req, res) => {
  try {
    const month = (req.query.month as string) || new Date().toISOString().substring(0, 7);
    const ylFilter = (req.query.nama as string) || "";
    const db = loadData();
    const realisasiMap = (db.breakdownRealisasi && db.breakdownRealisasi[month]) ? db.breakdownRealisasi[month] : {};
    const ylList = (db.ylList && Array.isArray(db.ylList)) ? db.ylList : INITIAL_YL_LIST;
    const txs = (db.transactions || []).filter((t: any) => t.tanggal && t.tanggal.startsWith(month));

    const results: any[] = [];

    ylList.forEach((yl: any) => {
      if (yl.status === "Resign" || yl.status === "nonaktif") return;
      if (ylFilter) {
        const filterArea = areaPrefix(ylFilter);
        const cleanFilter = cleanYlName(ylFilter);
        const match = (yl.area && sameArea(yl.area, filterArea)) ||
                      (yl.nama && cleanYlName(yl.nama) === cleanFilter) ||
                      (yl.area && ylFilter.includes(yl.area));
        if (!match) return;
      }

      // Find realisasi breakdown for this YL in realisasiMap
      let ylReal = pickByArea(realisasiMap, yl.area);
      if (!ylReal) {
        const entry = Object.entries(realisasiMap).find(([k]) => k.startsWith(yl.area) || (yl.nama && k.includes(yl.nama)));
        if (entry) ylReal = entry[1];
      }

      if (!ylReal || !ylReal.days) return;

      const unfilledDates: number[] = [];
      const mismatchDates: number[] = [];
      const details: any[] = [];

      for (let d = 1; d <= 31; d++) {
        const dayAcuan = ylReal.days[String(d)] || ylReal.days[d];
        if (!dayAcuan) continue;
        const acuanYo = Number(dayAcuan.yo) || 0;
        const acuanOm = Number(dayAcuan.om) || 0;
        const acuanOs = Number(dayAcuan.os) || 0;
        const acuanYt = Number(dayAcuan.yt) || 0;
        const totAcuan = acuanYo + acuanOm + acuanOs + acuanYt;
        if (totAcuan <= 0) continue;

        const dateStr = `${month}-${String(d).padStart(2, '0')}`;
        const tx = txs.find((t: any) => {
          if (t.tanggal !== dateStr) return false;
          if (t.area && t.area === yl.area) return true;
          if (t.nama && String(t.nama).startsWith(yl.area)) return true;
          if (cleanYlName(t.nama || "") === cleanYlName(yl.nama)) return true;
          return false;
        });

        const secYo = (Number(tx?.rmh_yo) || 0) + (Number(tx?.psr_yo) || 0) + (Number(tx?.skh_yo) || 0) + (Number(tx?.ktr_yo) || 0) + (Number(tx?.tk_yo) || 0) + (Number(tx?.ib_yo) || 0);
        const secOm = (Number(tx?.rmh_om) || 0) + (Number(tx?.psr_om) || 0) + (Number(tx?.skh_om) || 0) + (Number(tx?.ktr_om) || 0) + (Number(tx?.tk_om) || 0) + (Number(tx?.ib_om) || 0);
        const secOs = (Number(tx?.rmh_os) || 0) + (Number(tx?.psr_os) || 0) + (Number(tx?.skh_os) || 0) + (Number(tx?.ktr_os) || 0) + (Number(tx?.tk_os) || 0) + (Number(tx?.ib_os) || 0);
        const secYt = (Number(tx?.rmh_yt) || 0) + (Number(tx?.psr_yt) || 0) + (Number(tx?.skh_yt) || 0) + (Number(tx?.ktr_yt) || 0) + (Number(tx?.tk_yt) || 0) + (Number(tx?.ib_yt) || 0);
        const totSektor = secYo + secOm + secOs + secYt;

        if (totSektor === 0) {
          unfilledDates.push(d);
          details.push({
            date: d,
            dateStr,
            type: "empty",
            acuan: totAcuan,
            aktual: 0,
            acuanDetail: { yo: acuanYo, om: acuanOm, os: acuanOs, yt: acuanYt }
          });
        } else if (secYo !== acuanYo || secOm !== acuanOm || secOs !== acuanOs || secYt !== acuanYt) {
          mismatchDates.push(d);
          details.push({
            date: d,
            dateStr,
            type: "mismatch",
            acuan: totAcuan,
            aktual: totSektor,
            selisih: totSektor - totAcuan,
            acuanDetail: { yo: acuanYo, om: acuanOm, os: acuanOs, yt: acuanYt },
            aktualDetail: { yo: secYo, om: secOm, os: secOs, yt: secYt }
          });
        }
      }

      if (unfilledDates.length > 0 || mismatchDates.length > 0) {
        results.push({
          area: yl.area,
          nama: yl.nama,
          unfilledDates,
          mismatchDates,
          details
        });
      }
    });

    res.json({ ok: true, month, count: results.length, data: results });
  } catch (err: any) {
    console.error("Error in getPotensiNotifications:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/saveBreakdownPlan
// Gabungan 3 arah (base = salinan yang dimuat klien dari server, incoming = isi klien sekarang,
// server = isi server sekarang). Hanya sel yang BENAR-BENAR diubah klien yang menimpa server;
// sel yang tidak disentuh klien mengikuti server. Ini mencegah layar Admin yang sudah basi
// menimpa data yang baru dimasukkan YL (mis. entry penjualan YL 208 tgl 5).
function mergeThreeWay(base: any, incoming: any, server: any): any {
  const isObj = (v: any) => v !== null && typeof v === "object" && !Array.isArray(v);
  if (!isObj(incoming)) {
    return JSON.stringify(incoming) === JSON.stringify(base) ? server : incoming;
  }
  const b = isObj(base) ? base : {};
  const sv = isObj(server) ? server : {};
  const out: any = {};
  const keys = new Set<string>([...Object.keys(incoming), ...Object.keys(b), ...Object.keys(sv)]);
  for (const k of keys) {
    if (k in incoming) {
      const m = mergeThreeWay(b[k], incoming[k], sv[k]);
      if (m !== undefined) out[k] = m;
    } else if (k in b) {
      // Klien menghapus key ini; hormati penghapusan kecuali server sudah mengubahnya sejak base.
      if (k in sv && JSON.stringify(sv[k]) !== JSON.stringify(b[k])) out[k] = sv[k];
    } else if (k in sv) {
      out[k] = sv[k]; // key baru dari server yang belum diketahui klien
    }
  }
  return out;
}

app.post("/api/saveBreakdownPlan", async (req, res) => {
  try {
    const defaultMonth = new Date().toISOString().substring(0, 7);
    const { month = defaultMonth, breakdownPlan, breakdownRealisasi, baseBreakdownPlan, baseBreakdownRealisasi } = req.body;
    let mergedMode = false;

    const db = loadData();
    if (breakdownPlan && typeof breakdownPlan === "object") {
      if (!db.breakdownPlan) db.breakdownPlan = {};
      // ONLY overwrite if the incoming plan has keys, or if the current plan is already empty
      if (Object.keys(breakdownPlan).length > 0 || !db.breakdownPlan[month] || Object.keys(db.breakdownPlan[month]).length === 0) {
        if (baseBreakdownPlan && typeof baseBreakdownPlan === "object") {
          db.breakdownPlan[month] = mergeThreeWay(baseBreakdownPlan, breakdownPlan, db.breakdownPlan[month] || {});
          mergedMode = true;
        } else {
          db.breakdownPlan[month] = breakdownPlan;
        }
      }
    }
    if (breakdownRealisasi && typeof breakdownRealisasi === "object") {
      if (!db.breakdownRealisasi) db.breakdownRealisasi = {};
      if (baseBreakdownRealisasi && typeof baseBreakdownRealisasi === "object") {
        db.breakdownRealisasi[month] = mergeThreeWay(baseBreakdownRealisasi, breakdownRealisasi, db.breakdownRealisasi[month] || {});
        mergedMode = true;
      } else {
        db.breakdownRealisasi[month] = breakdownRealisasi;
      }
      const finalRealisasi = db.breakdownRealisasi[month];
      syncBreakdownRealisasiToTransactions(db, month);



      // Sinkronkan juga data tanggal yang terealisasi ke db.breakdownPlan[month]
      if (db.breakdownPlan && db.breakdownPlan[month]) {
        const curPlan = db.breakdownPlan[month];
        for (let d = 1; d <= 31; d++) {
          const dStr = String(d);
          let dayTotal = 0;
          Object.keys(finalRealisasi).forEach(areaKey => {
            const dObj = finalRealisasi[areaKey]?.days?.[dStr];
            dayTotal += (Number(dObj?.yo) || 0) + (Number(dObj?.om) || 0) + (Number(dObj?.os) || 0) + (Number(dObj?.yt) || 0);
          });
          if (dayTotal > 0) {
            Object.keys(finalRealisasi).forEach(areaKey => {
              if (!curPlan[areaKey]) curPlan[areaKey] = { pembagiTanggal: finalRealisasi[areaKey]?.pembagiTanggal || 25, days: {} };
              if (!curPlan[areaKey].days) curPlan[areaKey].days = {};
              const rObj = finalRealisasi[areaKey]?.days?.[dStr] || { yo: 0, om: 0, os: 0, yt: 0 };
              curPlan[areaKey].days[dStr] = {
                yo: Number(rObj.yo) || 0,
                om: Number(rObj.om) || 0,
                os: Number(rObj.os) || 0,
                yt: Number(rObj.yt) || 0
              };
            });
          }
        }
      }
    }

    cleanEmptyTransactions(db);

    await saveData(db);
    const resp: any = { ok: true, message: "Data Breakdown Rencana & Realisasi berhasil disimpan." };
    if (mergedMode) {
      // Kembalikan hasil gabungan agar layar Admin ikut memperbarui salinannya (dan acuan base-nya).
      resp.breakdownRealisasi = (db.breakdownRealisasi || {})[month] || {};
      resp.breakdownPlan = (db.breakdownPlan || {})[month] || {};
    }
    res.json(resp);
  } catch (err) {
    console.error("Save Breakdown error:", err);
    res.status(500).json({ ok: false, message: err.message });
  }
});

// GET /api/getLhppRealisasi
app.get("/api/getLhppRealisasi", (req, res) => {
  const defaultDate = new Date().toISOString().substring(0, 10);
  const date = (req.query.date as string) || defaultDate;
  const db = loadData();
  const lhppData = (db.lhppRealisasi && db.lhppRealisasi[date]) ? db.lhppRealisasi[date] : null;
  res.json({ ok: true, date, rows: lhppData?.rows || null, summary: lhppData?.summary || null });
});

// POST /api/saveLhppRealisasi
app.post("/api/saveLhppRealisasi", async (req, res) => {
  const defaultDate = new Date().toISOString().substring(0, 10);
  const { date = defaultDate, rows, summary } = req.body;
  const db = loadData();
  if (!db.lhppRealisasi) db.lhppRealisasi = {};
  db.lhppRealisasi[date] = { rows, summary };
  await saveData(db);
  res.json({ ok: true, message: "Data LHPP & LPPBJ Realisasi berhasil disimpan." });
});

app.get("/api/getDataYL", async (req, res) => {
  const { area } = req.query;
  const db = loadData();
  const txs = db.transactions || [];
  const latestTxDate = txs.length > 0 ? txs[txs.length - 1].tanggal : new Date().toISOString().split("T")[0];
  const currentMonth = (req.query.month as string) || latestTxDate.substring(0, 7);
  const tgtObj = db.targetYL[`${area}_${currentMonth}`] || (req.query.month ? { target: 0, bln_lalu: 0, thn_lalu: 0, e6: 0 } : (db.targetYL[area as string] || { target: 0, bln_lalu: 0, thn_lalu: 0, e6: 0 }));

  const target = {
    YO: Math.floor(tgtObj.target * 0.9),
    OM: Math.floor(tgtObj.target * 0.05),
    OS: Math.floor(tgtObj.target * 0.03),
    YT: Math.floor(tgtObj.target * 0.02),
    ALL: tgtObj.target,
    e6: tgtObj.e6 || 0
  };

  const bulanLalu = {
    YO: Math.floor(tgtObj.bln_lalu * 0.9),
    OM: Math.floor(tgtObj.bln_lalu * 0.05),
    OS: Math.floor(tgtObj.bln_lalu * 0.03),
    YT: Math.floor(tgtObj.bln_lalu * 0.02),
    ALL: tgtObj.bln_lalu
  };

  const tahunLalu = {
    YO: Math.floor(tgtObj.thn_lalu * 0.9),
    OM: Math.floor(tgtObj.thn_lalu * 0.05),
    OS: Math.floor(tgtObj.thn_lalu * 0.03),
    YT: Math.floor(tgtObj.thn_lalu * 0.02),
    ALL: tgtObj.thn_lalu
  };

  // Calculate dynamic actual sales for the selected YL area to match the dashboard perfectly
  const names = Object.values(db.ylPins || INITIAL_DATA.ylPins) as string[];
  const name = names.find(n => n.startsWith(String(area)) || sameArea(areaFromName(n), area));
  const currentMonthTxs = (db.transactions || []).filter((t: any) => t.tanggal && t.tanggal.startsWith(currentMonth));
  const ylTxs = currentMonthTxs.filter((t: any) => t.nama === name || (t.nama && (t.nama.startsWith(String(area)) || sameArea(areaFromName(t.nama), area))));
  let ylYo = 0, ylOm = 0, ylOs = 0, ylYt = 0;
  ylTxs.forEach((t: any) => {
    ylYo += t.tot_yo || 0;
    ylOm += t.tot_om || 0;
    ylOs += t.tot_os || 0;
    ylYt += t.tot_yt || 0;
  });
  const areaStr = String(area);
  const realAcc = getRealisasiAccumulation(db, currentMonth);
  const areaData = pickByArea(realAcc.perArea, area);
  const actualFromBreakdown = areaData ? areaData.total : 0;
  const ylTotalActual = actualFromBreakdown > 0 ? actualFromBreakdown : (ylYo + ylOm + ylOs + ylYt);

  let pembagi = tgtObj.e6 || 15;
  const brArea: any = db.breakdownRealisasi ? pickByArea(db.breakdownRealisasi[currentMonth], areaStr) : undefined;
  if (brArea) {
    pembagi = brArea.pembagiTanggal || pembagi;
  }
  if (!pembagi || pembagi <= 0) pembagi = 15;

  const effectiveTotalSales = ylTotalActual > 0 ? ylTotalActual : (tgtObj.target * pembagi);
  const avgSales = pembagi > 0 ? effectiveTotalSales / pembagi : 0;

  const compCfg = db.compensationConfig || DEFAULT_COMP_CONFIG;
  let factor = compCfg.tiers[0].rate;
  const sortedTiers = [...compCfg.tiers].sort((a, b) => b.threshold - a.threshold);
  for (const t of sortedTiers) {
    if (avgSales >= t.threshold) {
      factor = t.rate;
      break;
    }
  }

  const isZero = effectiveTotalSales <= 0;
  const kompensasi = isZero ? 0 : Math.floor(effectiveTotalSales * factor);
  const pph = isZero ? 0 : Math.floor(kompensasi * (compCfg.pphRate / 100));
  const jkk = isZero ? 0 : (compCfg.jkkJkm || 18800);
  const ylItem = (db.ylList || []).find((y: any) => sameArea(y.area, areaStr));
  const ikutJht = ylItem ? (ylItem.ikutJht !== false) : true;
  const jhtNominal = ylItem && typeof ylItem.iuranJht === "number" ? ylItem.iuranJht : (compCfg.jht || 24000);
  const jht = (isZero || !ikutJht) ? 0 : jhtNominal;
  const kresekDll = 0;
  const kompenBersih = Math.max(0, kompensasi - pph - jkk - jht - kresekDll);

  res.json({
    target: {
      target,
      bulanLalu,
      tahunLalu
    },
    kompensasi: {
      kompensasi,
      pph,
      jkk,
      jht,
      kresekDll,
      kompenBersih
    }
  });
});

// Attention / Catatan Manager per YL
app.get("/api/getAttention", (req, res) => {
  const db = loadData();
  res.json({ attention: db.attention || {} });
});

app.post("/api/saveAttention", async (req, res) => {
  const { area, text } = req.body;
  const db = loadData();
  if (!db.attention) db.attention = {};
  if (area === "all") {
    const list = db.ylList || INITIAL_YL_LIST;
    list.forEach((yl: any) => {
      db.attention[yl.area] = text || "";
    });
  } else if (area) {
    db.attention[area] = text || "";
  }
  await saveData(db);
  res.json({ ok: true, attention: db.attention });
});

// YL List & PIN Management (20 YL)
app.get("/api/getYlList", (req, res) => {
  const db = loadData();
  const listWithoutFotos = (db.ylList || INITIAL_YL_LIST).map((y: any) => {
    const { foto, ...rest } = y;
    return rest;
  });
  res.json({ ylList: listWithoutFotos, managerPin: db.managerPin || "1111" });
});

app.post("/api/saveYlList", async (req, res) => {
  const { ylList, managerPin } = req.body;
  const db = loadData();
  const oldList = db.ylList || INITIAL_YL_LIST;

  if (Array.isArray(ylList)) {
    // Detect renamed YLs by matching area
    const nameChanges: Array<{ area: string; oldNama: string; newNama: string }> = [];
    ylList.forEach((newY: any) => {
      const oldY = oldList.find((o: any) => sameArea(o.area, newY.area));
      if (oldY && oldY.nama && newY.nama && oldY.nama.trim() !== newY.nama.trim()) {
        nameChanges.push({
          area: String(newY.area),
          oldNama: oldY.nama.trim(),
          newNama: newY.nama.trim()
        });
      }
    });

    // Merge per-area instead of blind replace: kalau client mengirim field kosong/undefined
    // (mis. nik/tglLahir/kodeYl/tanggalMasuk) padahal data lama di server sudah punya nilainya,
    // pertahankan nilai lama supaya profil YL yang sudah tersimpan tidak hilang gara-gara
    // client memakai versi state yang "basi"/tidak lengkap (fallback INITIAL_YL_LIST dsb).
    const PRESERVE_IF_EMPTY_FIELDS = ["nik", "tglLahir", "kodeYl", "tanggalMasuk", "tanggalDaftar", "tanggalResign", "foto"];
    const mergedYlList = ylList.map((newY: any) => {
      const oldY = oldList.find((o: any) => String(o.area) === String(newY.area));
      if (!oldY) return newY;
      const merged = { ...newY };
      PRESERVE_IF_EMPTY_FIELDS.forEach(field => {
        const newVal = newY[field];
        const isEmpty = newVal === undefined || newVal === null || newVal === "";
        if (isEmpty && oldY[field] !== undefined && oldY[field] !== null && oldY[field] !== "") {
          merged[field] = oldY[field];
        }
      });
      if (newY.ikutJht === undefined && oldY.ikutJht !== undefined) {
        merged.ikutJht = oldY.ikutJht;
      }
      if (newY.iuranJht === undefined && oldY.iuranJht !== undefined) {
        merged.iuranJht = oldY.iuranJht;
      }
      return merged;
    });

    db.ylList = mergedYlList;

    // Apply name changes across all database objects
    nameChanges.forEach(({ area, oldNama, newNama }) => {
      const oldShort = oldNama.startsWith(area) ? oldNama.substring(area.length).trim() : oldNama;
      const newShort = newNama.startsWith(area) ? newNama.substring(area.length).trim() : newNama;

      // 1. Transactions
      if (Array.isArray(db.transactions)) {
        db.transactions.forEach((t: any) => {
          if (
            t.nama === oldNama ||
            (t.area && sameArea(t.area, area)) ||
            (t.nama && (t.nama === oldNama || (oldShort && t.nama.includes(oldShort))))
          ) {
            t.nama = newNama;
          }
        });
      }

      // 2. targetYL (keyed by e.g. "201_2026-07" or "201 Gusrina_2026-07")
      if (db.targetYL && typeof db.targetYL === "object") {
        Object.keys(db.targetYL).forEach(k => {
          if (k.startsWith(oldNama) || k.startsWith(area + "_") || (oldShort && k.includes(oldShort))) {
            const newK = k.replace(oldNama, newNama).replace(oldShort, newShort);
            if (newK !== k) {
              db.targetYL[newK] = db.targetYL[k];
              delete db.targetYL[k];
            }
          }
        });
      }

      // 3. breakdownPlan / breakdownRealisasi / managerRealisasi / plgPjlManual
      ["breakdownPlan", "breakdownRealisasi", "managerRealisasi", "plgPjlManual"].forEach(storeKey => {
        if (db[storeKey] && typeof db[storeKey] === "object") {
          Object.keys(db[storeKey]).forEach(month => {
            const mObj = db[storeKey][month];
            if (mObj && typeof mObj === "object") {
              if (mObj[area] && mObj[area].nama) {
                mObj[area].nama = newNama;
              }
              if (mObj[oldNama]) {
                mObj[newNama] = mObj[oldNama];
                mObj[newNama].nama = newNama;
                delete mObj[oldNama];
              }
            }
          });
        }
      });

      // 4. Attention
      if (db.attention && typeof db.attention === "object") {
        if (db.attention[oldNama]) {
          db.attention[newNama] = db.attention[oldNama];
          delete db.attention[oldNama];
        }
      }
    });

    // Rebuild ylPins strictly from active non-resign YLs in ylList
    db.ylPins = {};
    ylList.forEach((y: any) => {
      if (y.pin && y.nama && y.status !== "Resign") {
        db.ylPins[y.pin] = y.nama;
      }
    });

    // Remove targetYL entries for areas that no longer exist
    const activeAreas = new Set(ylList.map((y: any) => normArea(y.area)));
    if (db.targetYL && typeof db.targetYL === "object") {
      Object.keys(db.targetYL).forEach(key => {
        const areaKey = key.split("_")[0];
        if (!activeAreas.has(normArea(areaKey))) {
          delete db.targetYL[key];
        }
      });
    }
  }

  if (managerPin) db.managerPin = managerPin;
  await saveData(db);
  const listWithoutFotos = (db.ylList || []).map((y: any) => {
    const { foto, ...rest } = y;
    return rest;
  });
  res.json({ ok: true, ylList: listWithoutFotos, managerPin: db.managerPin, ylPins: db.ylPins });
});

// Setting Targets
app.get("/api/getSettingTargets", (req, res) => {
  const { bulan } = req.query;
  const db = loadData();
  let targetTKU = { target: 0, bln_lalu: 0, thn_lalu: 0 };
  if (bulan && typeof bulan === "string" && db.targetTKUByMonth && db.targetTKUByMonth[bulan]) {
    targetTKU = db.targetTKUByMonth[bulan];
  } else if (!bulan && db.targetTKU) {
    targetTKU = db.targetTKU;
  }

  const targetYL: Record<string, any> = {};
  if (bulan && typeof bulan === "string" && db.targetYLByMonth && db.targetYLByMonth[bulan]) {
    Object.keys(db.targetYLByMonth[bulan]).forEach(k => {
      const cleanArea = k.replace(/_202\d-\d{2}/g, "").trim();
      targetYL[cleanArea] = db.targetYLByMonth[bulan][k];
    });
  } else if (bulan && typeof bulan === "string" && db.targetYL) {
    const hasSpecificKeys = Object.keys(db.targetYL).some(k => k.includes(`_${bulan}`));
    if (hasSpecificKeys) {
      Object.keys(db.targetYL).forEach(k => {
        if (k.includes(`_${bulan}`)) {
          const cleanArea = k.replace(/_202\d-\d{2}/g, "").trim();
          targetYL[cleanArea] = db.targetYL[k];
        }
      });
    }
  } else if (!bulan && db.targetYL) {
    Object.keys(db.targetYL).forEach(k => {
      if (!k.includes("_202")) {
        const cleanArea = k.replace(/_202\d-\d{2}/g, "").trim();
        targetYL[cleanArea] = db.targetYL[k];
      }
    });
  }

  res.json({ targetTKU, targetYL });
});

app.post("/api/saveSettingTargets", async (req, res) => {
  try {
    const { targetTKU, targetYL, bulan } = req.body || {};
    const db = loadData();
    if (targetTKU && typeof targetTKU === "object") {
      db.targetTKU = { ...(db.targetTKU || {}), ...targetTKU };
      if (bulan && typeof bulan === "string") {
        if (!db.targetTKUByMonth) db.targetTKUByMonth = {};
        db.targetTKUByMonth[bulan] = { ...targetTKU };
      }
    }
    if (targetYL && typeof targetYL === "object") {
      if (!db.targetYL) db.targetYL = {};
      if (!db.targetYLByMonth) db.targetYLByMonth = {};
      
      const cleanMonthMap: Record<string, any> = {};
      Object.keys(targetYL).forEach(rawArea => {
        const cleanArea = rawArea.replace(/_202\d-\d{2}/g, "").trim();
        cleanMonthMap[cleanArea] = targetYL[rawArea];
        db.targetYL[cleanArea] = targetYL[rawArea];
        if (bulan && typeof bulan === "string") {
          db.targetYL[`${cleanArea}_${bulan}`] = targetYL[rawArea];
        }
      });

      if (bulan && typeof bulan === "string") {
        db.targetYLByMonth[bulan] = cleanMonthMap;
      }
    }
    await saveData(db);

    res.json({ ok: true, targetTKU: db.targetTKU, targetYL: db.targetYL });
  } catch (err: any) {
    console.error("Error in saveSettingTargets:", err);
    res.status(500).json({ ok: false, error: err?.message || "Internal server error" });
  }
});

app.post("/api/saveTargetYL", async (req, res) => {
  try {
    const { targetTKU, targetYL, bulan, nama, target, bln_lalu, thn_lalu, e6 } = req.body || {};
    const db = loadData();

    // Format 1: Manager Save Target (Batch / TargetTKU + TargetYL)
    if (targetTKU && typeof targetTKU === "object") {
      db.targetTKU = { ...(db.targetTKU || {}), ...targetTKU };
      if (bulan && typeof bulan === "string") {
        if (!db.targetTKUByMonth) db.targetTKUByMonth = {};
        db.targetTKUByMonth[bulan] = { ...targetTKU };
      }
    }
    if (targetYL && typeof targetYL === "object") {
      if (!db.targetYL) db.targetYL = {};
      Object.keys(targetYL).forEach(k => {
        db.targetYL[k] = targetYL[k];
      });
    }

    // Format 2: Individual YL Target save
    if (nama) {
      const cleanNama = cleanYlName(String(nama || ""));
      const ylItem = (db.ylList || INITIAL_YL_LIST).find((y: any) => cleanYlName(y.nama) === cleanNama || y.nama === nama);
      let area = ylItem ? ylItem.area : "";
      if (!area) {
        area = areaPrefix(nama);
      }
      if (area) {
        area = String(area).replace(/\D/g, "");
      }
      if (!db.targetYL) db.targetYL = {};
      const targetObj = { target: Number(target) || 0, bln_lalu: Number(bln_lalu) || 0, thn_lalu: Number(thn_lalu) || 0, e6: Number(e6) || 0 };
      if (area) {
        // Hapus kunci lama yang areanya setara (mis. 201 vs 01) supaya tidak ada dua target untuk YL yang sama
        const cleanMonthKey = bulan ? String(bulan).replace(/^.*(\d{4}-\d{2}).*$/, "$1") : "";
        Object.keys(db.targetYL).forEach((k) => {
          const i = k.indexOf("_");
          const kArea = i > 0 ? k.slice(0, i) : k;
          const kMonth = i > 0 ? k.slice(i + 1) : "";
          if (k !== area && k !== `${area}_${cleanMonthKey}` && sameArea(kArea, area) && (i < 0 || kMonth === cleanMonthKey)) {
            delete db.targetYL[k];
          }
        });
        db.targetYL[area] = targetObj;
        if (bulan) {
          const cleanMonth = String(bulan).replace(/^.*(\d{4}-\d{2}).*$/, "$1");
          db.targetYL[`${area}_${cleanMonth}`] = targetObj;
        }
      }
    }

    await saveData(db);
    res.json({ ok: true, targetTKU: db.targetTKU, targetYL: db.targetYL });
  } catch (err: any) {
    console.error("Error in saveTargetYL:", err);
    res.status(500).json({ ok: false, error: err?.message || "Internal server error" });
  }
});

// Full Data Backup & Restore
app.get("/api/getData", (req, res) => {
  const db = loadData();
  res.json(db);
});

app.post("/api/importBackup", async (req, res) => {
  try {
    const backup = req.body;
    if (!backup || typeof backup !== "object") {
      return res.status(400).json({ ok: false, error: "Format backup tidak valid" });
    }
    const db = loadData();
    const serverDb = backup.serverDatabase || backup;
    
    if (serverDb.transactions) db.transactions = serverDb.transactions;
    if (serverDb.ylList) db.ylList = serverDb.ylList;
    if (serverDb.breakdownPlan) db.breakdownPlan = serverDb.breakdownPlan;
    if (serverDb.breakdownRealisasi) db.breakdownRealisasi = serverDb.breakdownRealisasi;
    if (serverDb.targetTKU) db.targetTKU = serverDb.targetTKU;
    if (serverDb.targetTKUByMonth) db.targetTKUByMonth = serverDb.targetTKUByMonth;
    if (serverDb.targetYL) db.targetYL = serverDb.targetYL;
    if (serverDb.targetYLByMonth) db.targetYLByMonth = serverDb.targetYLByMonth;
    if (serverDb.motivasiConfig) db.motivasiConfig = serverDb.motivasiConfig;
    if (serverDb.kontesConfig) db.kontesConfig = serverDb.kontesConfig;
    if (serverDb.plgPjlManual) db.plgPjlManual = serverDb.plgPjlManual;
    if (serverDb.potensiTembus) db.potensiTembus = serverDb.potensiTembus;
    if (serverDb.managerPin) db.managerPin = serverDb.managerPin;
    if (serverDb.ylPins) db.ylPins = serverDb.ylPins;
    if (serverDb.compensationConfig) db.compensationConfig = serverDb.compensationConfig;
    if (serverDb.lhppRealisasi) db.lhppRealisasi = serverDb.lhppRealisasi;
    if (serverDb.lhppPdm) db.lhppPdm = serverDb.lhppPdm;
    if (serverDb.lhppPdmYlm) db.lhppPdmYlm = serverDb.lhppPdmYlm;
    if (serverDb.settingTargets) db.settingTargets = serverDb.settingTargets;

    await saveData(db);
    res.json({ ok: true, message: "Backup berhasil direstore ke database" });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Compensation Config
app.get("/api/getCompensationConfig", (req, res) => {
  const db = loadData();
  res.json({ config: db.compensationConfig || DEFAULT_COMP_CONFIG });
});

app.post("/api/saveCompensationConfig", async (req, res) => {
  const { config } = req.body;
  const db = loadData();
  if (config && typeof config === "object") {
    db.compensationConfig = { ...(db.compensationConfig || DEFAULT_COMP_CONFIG), ...config };
    await saveData(db);
  }
  res.json({ ok: true, config: db.compensationConfig });
});

// Manager Input Realisasi Penjualan & Breakdown Tim
app.post("/api/saveManagerRealisasi", async (req, res) => {
  const { tanggal, nama, tot_yo, tot_om, tot_os, tot_yt, plan_yo, plan_om, plan_os, plan_yt } = req.body;
  if (!tanggal || !nama) return res.status(400).json({ error: "Tanggal dan nama YL wajib diisi." });
  const db = loadData();
  if (!db.transactions) db.transactions = [];

  let tx = db.transactions.find((t: any) => t.tanggal === tanggal && t.nama === nama);
  if (!tx) {
    tx = {
      tanggal,
      nama,
      tot_yo: Number(tot_yo) || 0,
      tot_om: Number(tot_om) || 0,
      tot_os: Number(tot_os) || 0,
      tot_yt: Number(tot_yt) || 0,
      plan_yo: Number(plan_yo) || 0,
      plan_om: Number(plan_om) || 0,
      plan_os: Number(plan_os) || 0,
      plan_yt: Number(plan_yt) || 0,
      rmh_yo: 0, rmh_om: 0, rmh_os: 0, rmh_yt: 0,
      psr_yo: 0, psr_om: 0, psr_os: 0, psr_yt: 0,
      skh_yo: 0, skh_om: 0, skh_os: 0, skh_yt: 0,
      ktr_yo: 0, ktr_om: 0, ktr_os: 0, ktr_yt: 0,
      tk_yo: 0, tk_om: 0, tk_os: 0, tk_yt: 0,
      ib_yo: 0, ib_om: 0, ib_os: 0, ib_yt: 0,
      bb_yo: 0, bb_om: 0, bb_os: 0, bb_yt: 0,
      pb_p: 0, pb_s: 0, f_plg: 0, f_rk: 0, f_ra: 0, f_rb: 0, apk_plg: 0, apk_botol: 0
    };
    db.transactions.push(tx);
  } else {
    if (tot_yo !== undefined) tx.tot_yo = Number(tot_yo);
    if (tot_om !== undefined) tx.tot_om = Number(tot_om);
    if (tot_os !== undefined) tx.tot_os = Number(tot_os);
    if (tot_yt !== undefined) tx.tot_yt = Number(tot_yt);
    if (plan_yo !== undefined) tx.plan_yo = Number(plan_yo);
    if (plan_om !== undefined) tx.plan_om = Number(plan_om);
    if (plan_os !== undefined) tx.plan_os = Number(plan_os);
    if (plan_yt !== undefined) tx.plan_yt = Number(plan_yt);
  }

  await saveData(db);
  res.json({ ok: true, transaction: tx });
});


// Kirim Rekap Bulanan ke DP1
app.post("/api/sendToDP1", async (req, res) => {
  const db = loadData();
  const ylList = db.ylList || INITIAL_YL_LIST;
  const summary: any[] = [];

  ylList.forEach((yl: any) => {
    const area = yl.area;
    const name = yl.nama;
    const ylTxs = (db.transactions || []).filter((t: any) => t.nama === name || (t.nama && String(t.nama).startsWith(area)));

    let yo = 0, om = 0, os = 0, yt = 0;
    ylTxs.forEach((t: any) => {
      yo += t.tot_yo || 0;
      om += t.tot_om || 0;
      os += t.tot_os || 0;
      yt += t.tot_yt || 0;
    });

    summary.push({
      area,
      nama: name,
      yo,
      om,
      os,
      yt,
      total: yo + om + os + yt
    });
  });

  if (db.scriptUrl) {
    await callProxy("sendToDP1", { summary }, "POST").catch(e => console.error("Error sending to DP1 proxy:", e));
  }

  res.json({
    ok: true,
    timestamp: new Date().toLocaleString("id-ID"),
    message: "Rekap bulanan per YL per item berhasil dikirim ke DP1!",
    exportedCount: summary.length,
    summary
  });
});

app.post("/api/saveTransaction", async (req, res) => {
  const data = req.body;
  const db = loadData();

  if (!db.transactions) db.transactions = [];
  
  // Check if data already exists for this date and YL in local database
  const existingTx = db.transactions.find((t: any) => t.tanggal === data.tanggal && t.nama === data.nama);
  if (existingTx && !data.allowOverwrite) {
    return res.status(400).json({
      ok: false,
      alreadyExists: true,
      error: `Data penjualan untuk tanggal ${data.tanggal} sudah ada di sheet! Tidak dapat disimpan ulang.`
    });
  }

  const idx = db.transactions.findIndex((t: any) => t.tanggal === data.tanggal && t.nama === data.nama);
  if (idx !== -1) {
    db.transactions[idx] = data;
  } else {
    db.transactions.push(data);
  }

  await saveData(db);
  res.json({ ok: true });
});

// GET /api/getLhppPdm - Get saved LHPP PDM data for specified month & day, plus previous day's PDM Hari Ini
app.get("/api/getLhppPdm", async (req, res) => {
  await refreshFromSupabaseIfStale(1000);
  const db = loadData();
  const month = req.query.month ? String(req.query.month) : new Date().toISOString().slice(0, 7);
  const day = req.query.day ? parseInt(String(req.query.day), 10) : new Date().getDate();
  const dayPadded = String(day).padStart(2, "0");
  const dateKey = req.query.tanggal ? String(req.query.tanggal) : `${month}-${dayPadded}`;

  if (!db.lhppPdm) db.lhppPdm = {};
  if (!db.lhppPdmYlm) db.lhppPdmYlm = {};

  // Find previous saved day's pdmHariIni to populate PDM Sebelum (termasuk saat berganti bulan)
  let prevPdmMap: Record<string, { yo: number; om: number; os: number; yt: number }> = {};
  let prevSourceDate: string | null = null;

  // Dapatkan seluruh tanggal yang pernah tersimpan di lhppPdm sebelum tanggal saat ini (< dateKey)
  // Diurutkan secara descending (terbaru ke terlama)
  const allSavedDates = Object.keys(db.lhppPdm)
    .filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k) && k < dateKey && Object.keys(db.lhppPdm[k] || {}).length > 0)
    .sort()
    .reverse();

  if (allSavedDates.length > 0) {
    // Tanggal transaksi terdekat sebelum tanggal aktif adalah sumber tunggal acuan PDM Sebelumnya
    prevSourceDate = allSavedDates[0];
    const prevDayData = db.lhppPdm[prevSourceDate] || {};

    // Masukkan pdmHariIni dari tanggal kemarin untuk semua YL yang tercatat kemarin
    Object.keys(prevDayData).forEach((k) => {
      const entry = prevDayData[k];
      if (entry && entry.pdmHariIni) {
        const pdm = {
          yo: Number(entry.pdmHariIni.yo || 0),
          om: Number(entry.pdmHariIni.om || 0),
          os: Number(entry.pdmHariIni.os || 0),
          yt: Number(entry.pdmHariIni.yt || 0)
        };
        prevPdmMap[k] = pdm;
        const cleanK = cleanYlName(k);
        if (cleanK) prevPdmMap[cleanK] = pdm;
      }
    });

    // Fallback HANYA untuk YL yang sama sekali belum terdaftar di hari kemarin (misal baru aktif),
    // telusuri mundur ke hari-hari lebih awal
    for (let i = 1; i < allSavedDates.length; i++) {
      const olderDate = allSavedDates[i];
      const olderData = db.lhppPdm[olderDate] || {};
      Object.keys(olderData).forEach((k) => {
        const cleanK = cleanYlName(k);
        const hasKey = prevPdmMap[k] || (cleanK && prevPdmMap[cleanK]);
        if (!hasKey && olderData[k]?.pdmHariIni) {
          const pdm = {
            yo: Number(olderData[k].pdmHariIni.yo || 0),
            om: Number(olderData[k].pdmHariIni.om || 0),
            os: Number(olderData[k].pdmHariIni.os || 0),
            yt: Number(olderData[k].pdmHariIni.yt || 0)
          };
          prevPdmMap[k] = pdm;
          if (cleanK) prevPdmMap[cleanK] = pdm;
        }
      });
    }
  }

  const currentPdm = db.lhppPdm[dateKey] || null;
  const currentPdmYlm = db.lhppPdmYlm[dateKey] || { yo: 0, om: 0, os: 0, yt: 0 };

  res.json({
    ok: true,
    tanggal: dateKey,
    month,
    day,
    pdmYlm: currentPdmYlm,
    rowsData: currentPdm,
    prevPdmMap,
    prevSourceDate,
    // Draf bersama lintas perangkat (ikut di respons yg sama -> tidak ada request tambahan)
    draft: (db.lhppDraft && db.lhppDraft[dateKey]) || null
  });
});

// POST /api/saveLhppDraft - Simpan draf LHPP (belum resmi) supaya bisa dibuka di HP/tab lain.
// Hemat egress: dilewati kalau isi sama persis, hanya 1 draf per tanggal, maks 5 tanggal terbaru.
app.post("/api/saveLhppDraft", async (req, res) => {
  try {
    const { tanggal, month, day, rows, summary, savedAt, deviceId } = req.body || {};
    const dateKey = tanggal || `${month}-${String(day || 1).padStart(2, "0")}`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !Array.isArray(rows)) {
      return res.status(400).json({ ok: false, error: "Data draf tidak valid" });
    }
    const db = loadData();
    if (!db.lhppDraft) db.lhppDraft = {};
    const next = {
      rows,
      summary: summary || null,
      savedAt: savedAt || new Date().toISOString(),
      deviceId: String(deviceId || "")
    };
    const prev = db.lhppDraft[dateKey];
    if (prev && JSON.stringify(prev.rows) === JSON.stringify(next.rows) &&
        JSON.stringify(prev.summary) === JSON.stringify(next.summary)) {
      return res.json({ ok: true, unchanged: true });
    }
    db.lhppDraft[dateKey] = next;
    const keys = Object.keys(db.lhppDraft).sort((a, b) =>
      String(db.lhppDraft[a]?.savedAt || "").localeCompare(String(db.lhppDraft[b]?.savedAt || "")));
    while (keys.length > 5) delete db.lhppDraft[keys.shift() as string];
    await saveData(db);
    res.json({ ok: true });
  } catch (err: any) {
    console.error("Error in saveLhppDraft:", err);
    res.status(500).json({ ok: false, error: err?.message || "Gagal menyimpan draf" });
  }
});

// POST /api/deleteLhppDraft - Buang draf satu tanggal
app.post("/api/deleteLhppDraft", async (req, res) => {
  try {
    const { tanggal, month, day } = req.body || {};
    const dateKey = tanggal || `${month}-${String(day || 1).padStart(2, "0")}`;
    const db = loadData();
    if (!db.lhppDraft) db.lhppDraft = {};
    db.lhppDraft[dateKey] = { rows: null, summary: null, clearedAt: new Date().toISOString() };
    await saveData(db);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || "Gagal membuang draf" });
  }
});

// POST /api/saveLhppPdm - Save LHPP PDM data and patch transactions (tot_* and bb_*)
app.post("/api/saveLhppPdm", async (req, res) => {
  try {
    const { month, day, tanggal, summary, rows } = req.body;
    const db = loadData();

    if (!db.lhppPdm) db.lhppPdm = {};
    if (!db.lhppPdmYlm) db.lhppPdmYlm = {};
    if (!db.transactions) db.transactions = [];

    const dayPadded = String(day || 1).padStart(2, "0");
    const dateKey = tanggal || `${month}-${dayPadded}`;

    // 1. Save summary (PDM YLM)
    if (summary && summary.pdmYlm) {
      db.lhppPdmYlm[dateKey] = {
        yo: Number(summary.pdmYlm.yo || 0),
        om: Number(summary.pdmYlm.om || 0),
        os: Number(summary.pdmYlm.os || 0),
        yt: Number(summary.pdmYlm.yt || 0),
      };
    }

    // 2. Save PDM per YL & patch db.transactions
    if (!db.lhppPdm[dateKey]) db.lhppPdm[dateKey] = {};

    if (Array.isArray(rows)) {
      rows.forEach((r: any) => {
        const areaKey = r.area || "";
        const cleanName = cleanYlName(r.nama || "");
        const ylKey = areaKey || cleanName;

        if (!ylKey) return;

        const pdmSebelum = {
          yo: Number(r.pdmSebelum?.yo || 0),
          om: Number(r.pdmSebelum?.om || 0),
          os: Number(r.pdmSebelum?.os || 0),
          yt: Number(r.pdmSebelum?.yt || 0),
        };
        const bb = {
          yo: Number(r.bb?.yo || 0),
          om: Number(r.bb?.om || 0),
          os: Number(r.bb?.os || 0),
          yt: Number(r.bb?.yt || 0),
        };
        const pdmHariIni = {
          yo: Number(r.pdmHariIni?.yo || 0),
          om: Number(r.pdmHariIni?.om || 0),
          os: Number(r.pdmHariIni?.os || 0),
          yt: Number(r.pdmHariIni?.yt || 0),
        };

        // Store in db.lhppPdm
        const entryData = { pdmSebelum, bb, pdmHariIni, isManualPdmSebelum: !!r.isManualPdmSebelum };
        db.lhppPdm[dateKey][ylKey] = entryData;
        if (areaKey && cleanName) {
          db.lhppPdm[dateKey][cleanName] = entryData;
        }

        // Terjual = PDM Sebelum - BB (dibatasi minimal 0)
        const tot_yo = Math.max(0, pdmSebelum.yo - bb.yo);
        const tot_om = Math.max(0, pdmSebelum.om - bb.om);
        const tot_os = Math.max(0, pdmSebelum.os - bb.os);
        const tot_yt = Math.max(0, pdmSebelum.yt - bb.yt);

        // Find transaction matching dateKey and YL (exact month-day match to avoid cross-month collision)
        const exactDate = `${month}-${dayPadded}`;
        const txIdx = db.transactions.findIndex((t: any) => {
          const matchDate = t.tanggal === dateKey || t.tanggal === exactDate;
          const matchYl = (areaKey && (t.area === areaKey || t.nama?.startsWith(areaKey))) ||
                          (cleanName && cleanYlName(t.nama || "") === cleanName) ||
                          (r.nama && t.nama === r.nama);
          return matchDate && matchYl;
        });

        if (txIdx !== -1) {
          // Merge / Patch ONLY tot_* and bb_* fields without modifying other fields
          db.transactions[txIdx].tot_yo = tot_yo;
          db.transactions[txIdx].tot_om = tot_om;
          db.transactions[txIdx].tot_os = tot_os;
          db.transactions[txIdx].tot_yt = tot_yt;

          db.transactions[txIdx].bb_yo = bb.yo;
          db.transactions[txIdx].bb_om = bb.om;
          db.transactions[txIdx].bb_os = bb.os;
          db.transactions[txIdx].bb_yt = bb.yt;
          if (areaKey && !db.transactions[txIdx].area) {
            db.transactions[txIdx].area = areaKey;
          }
        } else {
          // Create new record with tot_* and bb_* filled, others default 0
          const fullYlName = (areaKey && r.nama && !r.nama.startsWith(areaKey)) ? `${areaKey} - ${cleanName}` : (r.nama || "");
          db.transactions.push({
            tanggal: dateKey,
            nama: fullYlName,
            area: areaKey || "",
            tot_yo,
            tot_om,
            tot_os,
            tot_yt,
            bb_yo: bb.yo,
            bb_om: bb.om,
            bb_os: bb.os,
            bb_yt: bb.yt,
            rmh_yo: 0, rmh_om: 0, rmh_os: 0, rmh_yt: 0,
            psr_yo: 0, psr_om: 0, psr_os: 0, psr_yt: 0,
            skh_yo: 0, skh_om: 0, skh_os: 0, skh_yt: 0,
            ktr_yo: 0, ktr_om: 0, ktr_os: 0, ktr_yt: 0,
            tk_yo: 0, tk_om: 0, tk_os: 0, tk_yt: 0,
            ib_yo: 0, ib_om: 0, ib_os: 0, ib_yt: 0,
            pb_p: 0, pb_s: 0, f_plg: 0, f_rk: 0, f_ra: 0, f_rb: 0,
            apk_plg: 0, apk_botol: 0
          });
        }

        // --- NEW: Patch db.breakdownRealisasi so it appears in BD & Realisasi grid ---
        if (areaKey) {
          if (!db.breakdownRealisasi) db.breakdownRealisasi = {};
          if (!db.breakdownRealisasi[month]) db.breakdownRealisasi[month] = {};
          if (!db.breakdownRealisasi[month][areaKey]) {
            db.breakdownRealisasi[month][areaKey] = { days: {}, pembagiTanggal: 25 };
          }
          if (!db.breakdownRealisasi[month][areaKey].days) {
            db.breakdownRealisasi[month][areaKey].days = {};
          }
          db.breakdownRealisasi[month][areaKey].days[String(day)] = {
            yo: tot_yo,
            om: tot_om,
            os: tot_os,
            yt: tot_yt
          };

          // Patch juga db.breakdownPlan untuk tanggal terealisasi ini
          if (db.breakdownPlan && db.breakdownPlan[month]) {
            if (!db.breakdownPlan[month][areaKey]) {
              db.breakdownPlan[month][areaKey] = { days: {}, pembagiTanggal: 25 };
            }
            if (!db.breakdownPlan[month][areaKey].days) {
              db.breakdownPlan[month][areaKey].days = {};
            }
            db.breakdownPlan[month][areaKey].days[String(day)] = {
              yo: tot_yo,
              om: tot_om,
              os: tot_os,
              yt: tot_yt
            };
          }
        }
      });
    }

    // 3. Cascade update PDM Sebelumnya ke tanggal transaksi berikutnya yang sudah tercatat
    const allFutureDates = Object.keys(db.lhppPdm)
      .filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k) && k > dateKey && Object.keys(db.lhppPdm[k] || {}).length > 0)
      .sort();

    if (allFutureDates.length > 0) {
      const nextDateKey = allFutureDates[0];
      const nextDayData = db.lhppPdm[nextDateKey];
      if (nextDayData && Array.isArray(rows)) {
        rows.forEach((r: any) => {
          const areaKey = r.area || "";
          const cleanName = cleanYlName(r.nama || "");
          const ylKey = areaKey || cleanName;
          if (!ylKey) return;

          const existingNext = nextDayData[ylKey] || (areaKey && nextDayData[areaKey]) || (cleanName && nextDayData[cleanName]);
          if (existingNext && !existingNext.isManualPdmSebelum) {
            const newPdmSebelum = {
              yo: Number(r.pdmHariIni?.yo || 0),
              om: Number(r.pdmHariIni?.om || 0),
              os: Number(r.pdmHariIni?.os || 0),
              yt: Number(r.pdmHariIni?.yt || 0),
            };
            existingNext.pdmSebelum = { ...newPdmSebelum };
            if (areaKey && nextDayData[areaKey]) nextDayData[areaKey].pdmSebelum = { ...newPdmSebelum };
            if (cleanName && nextDayData[cleanName]) nextDayData[cleanName].pdmSebelum = { ...newPdmSebelum };

            // Recalculate transaksi untuk tanggal berikutnya
            const nextTotYo = Math.max(0, newPdmSebelum.yo - Number(existingNext.bb?.yo || 0));
            const nextTotOm = Math.max(0, newPdmSebelum.om - Number(existingNext.bb?.om || 0));
            const nextTotOs = Math.max(0, newPdmSebelum.os - Number(existingNext.bb?.os || 0));
            const nextTotYt = Math.max(0, newPdmSebelum.yt - Number(existingNext.bb?.yt || 0));

            const nextTxIdx = db.transactions.findIndex((t: any) => {
              const matchDate = t.tanggal === nextDateKey;
              const matchYl = (areaKey && (t.area === areaKey || t.nama?.startsWith(areaKey))) ||
                              (cleanName && cleanYlName(t.nama || "") === cleanName);
              return matchDate && matchYl;
            });
            if (nextTxIdx !== -1) {
              db.transactions[nextTxIdx].tot_yo = nextTotYo;
              db.transactions[nextTxIdx].tot_om = nextTotOm;
              db.transactions[nextTxIdx].tot_os = nextTotOs;
              db.transactions[nextTxIdx].tot_yt = nextTotYt;
            }
          }
        });
      }
    }

    cleanEmptyTransactions(db);

    // Simpan penuh (ada summary) = draf tanggal ini sudah resmi -> buang draf bersama
    // (diganti penanda kecil "clearedAt" agar draf lama di perangkat lain tidak hidup lagi)
    if (summary) {
      if (!db.lhppDraft) db.lhppDraft = {};
      db.lhppDraft[dateKey] = { rows: null, summary: null, clearedAt: new Date().toISOString() };
    }

    await saveData(db);

    res.json({ ok: true, message: "✅ Data LHPP tersimpan & tersambung ke Realisasi" });
  } catch (err: any) {
    console.error("Error in saveLhppPdm:", err);
    res.status(500).json({ ok: false, error: err?.message || "Gagal menyimpan data LHPP" });
  }
});

// POST /api/deleteLhppPdm - Delete LHPP PDM data and clean associated transactions & Realisasi
app.post("/api/deleteLhppPdm", async (req, res) => {
  try {
    const { month, day, tanggal } = req.body;
    const db = loadData();

    const dayNum = Number(day || 1);
    const dayPadded = String(dayNum).padStart(2, "0");
    const dateKey = tanggal || `${month}-${dayPadded}`;
    const dayStr = String(dayNum);

    // 1. Delete from db.lhppPdm & db.lhppPdmYlm & db.lhppRealisasi
    if (db.lhppPdm) {
      delete db.lhppPdm[dateKey];
      delete db.lhppPdm[`${month}-${dayStr}`];
    }
    if (db.lhppPdmYlm) {
      delete db.lhppPdmYlm[dateKey];
      delete db.lhppPdmYlm[`${month}-${dayStr}`];
    }
    if (!db.lhppDraft) db.lhppDraft = {};
    db.lhppDraft[dateKey] = { rows: null, summary: null, clearedAt: new Date().toISOString() };
    if (db.lhppRealisasi) {
      delete db.lhppRealisasi[dateKey];
      delete db.lhppRealisasi[`${month}-${dayStr}`];
    }

    // 2. Clear tot_* and bb_* from db.transactions for this date, then cleanEmptyTransactions
    if (db.transactions && Array.isArray(db.transactions)) {
      db.transactions.forEach((t: any) => {
        const isMatch = t.tanggal === dateKey ||
                        t.tanggal === `${month}-${dayPadded}` ||
                        t.tanggal === `${month}-${dayStr}` ||
                        (t.tanggal && t.tanggal.startsWith(`${month}-`) && t.tanggal.endsWith(`-${dayPadded}`));
        if (isMatch) {
          t.tot_yo = 0;
          t.tot_om = 0;
          t.tot_os = 0;
          t.tot_yt = 0;
          t.bb_yo = 0;
          t.bb_om = 0;
          t.bb_os = 0;
          t.bb_yt = 0;
        }
      });
    }

    // 3. Clear db.breakdownRealisasi for this month and day
    if (db.breakdownRealisasi && db.breakdownRealisasi[month]) {
      Object.keys(db.breakdownRealisasi[month]).forEach((areaKey) => {
        const areaData = db.breakdownRealisasi[month][areaKey];
        if (areaData && areaData.days) {
          if (areaData.days[dayStr]) {
            delete areaData.days[dayStr];
          }
          if (areaData.days[dayPadded]) {
            delete areaData.days[dayPadded];
          }
        }
      });
    }

    cleanEmptyTransactions(db);

    await saveData(db);

    res.json({ ok: true, message: `✅ Data LHPP dan transaksi tanggal ${dateKey} berhasil dihapus.` });
  } catch (err: any) {
    console.error("Error in deleteLhppPdm:", err);
    res.status(500).json({ ok: false, error: err?.message || "Gagal menghapus data LHPP" });
  }
});

// Cache memory untuk breakdownRealisasi dari arsip Supabase (menghemat egress dan mempercepat respon)
const archiveBreakdownCache = new Map<string, any>();

async function getMonthBreakdownRealisasiMap(db: any, monthKey: string): Promise<any> {
  // 1. Cek di memori db.breakdownRealisasi
  if (db.breakdownRealisasi && db.breakdownRealisasi[monthKey] && Object.keys(db.breakdownRealisasi[monthKey]).length > 0) {
    return db.breakdownRealisasi[monthKey];
  }
  // 2. Cek di archiveBreakdownCache
  if (archiveBreakdownCache.has(monthKey)) {
    return archiveBreakdownCache.get(monthKey);
  }
  // 3. Cek di Supabase app_store
  if (supabase) {
    try {
      const { data: arcRow } = await (supabase.from("app_store") as any)
        .select("data")
        .eq("key", `monthly_archive_${monthKey}`)
        .maybeSingle();
      if (arcRow && arcRow.data && arcRow.data.breakdownRealisasiMap) {
        archiveBreakdownCache.set(monthKey, arcRow.data.breakdownRealisasiMap);
        if (!db.breakdownRealisasi) db.breakdownRealisasi = {};
        if (!db.breakdownRealisasi[monthKey]) db.breakdownRealisasi[monthKey] = arcRow.data.breakdownRealisasiMap;
        return arcRow.data.breakdownRealisasiMap;
      }
      const { data: bdRow } = await (supabase.from("app_store") as any)
        .select("data")
        .eq("key", `bd_realisasi_${monthKey}`)
        .maybeSingle();
      if (bdRow && bdRow.data) {
        archiveBreakdownCache.set(monthKey, bdRow.data);
        if (!db.breakdownRealisasi) db.breakdownRealisasi = {};
        if (!db.breakdownRealisasi[monthKey]) db.breakdownRealisasi[monthKey] = bdRow.data;
        return bdRow.data;
      }
    } catch (err) {
      console.warn(`[Supabase] Gagal mengambil arsip breakdown untuk ${monthKey}:`, err);
    }
  }
  return {};
}

function getSalesForDate(
  monthMaps: Record<string, any>,
  monthKey: string,
  day: number,
  area: string,
  ylName: string,
  dateStr: string,
  transactions: any[]
): number {
  const mMap = monthMaps[monthKey];
  if (mMap && mMap[area] && mMap[area].days && mMap[area].days[String(day)]) {
    const dx = mMap[area].days[String(day)];
    const val = (dx.yo || 0) + (dx.om || 0) + (dx.os || 0) + (dx.yt || 0);
    if (val > 0) return val;
  }
  if (Array.isArray(transactions)) {
    const tx = transactions.find((t: any) =>
      t.tanggal === dateStr && (
        t.nama === ylName ||
        (area && t.area && String(t.area) === String(area)) ||
        (area && t.nama && t.nama.startsWith(area))
      )
    );
    if (tx) {
      const val = (tx.tot_yo || 0) + (tx.tot_om || 0) + (tx.tot_os || 0) + (tx.tot_yt || 0);
      if (val > 0) return val;
    }
  }
  return 0;
}

function getCumulativeDailyAverage(
  monthMaps: Record<string, any>,
  monthKey: string,
  targetDay: number,
  area: string,
  ylName: string,
  transactions: any[]
): number {
  if (targetDay <= 0) return 0;
  let cumSales = 0;
  for (let d = 1; d <= targetDay; d++) {
    const dayStr = `${monthKey}-${String(d).padStart(2, "0")}`;
    const sales = getSalesForDate(monthMaps, monthKey, d, area, ylName, dayStr, transactions);
    cumSales += sales;
  }
  if (cumSales === 0) return 0;
  return Math.round(cumSales / targetDay);
}

// 6. Evaluasi Harian
app.get("/api/getEvaluasi", async (req, res) => {
  const { month } = req.query;
  const db = loadData();
  const currentMonth = (month as string) || new Date().toISOString().substring(0, 7);
  const dashboard = getCachedDashboardDP1(db, currentMonth);
  const ylList = db.ylList || INITIAL_YL_LIST;
  const names = ylList.map((y: any) => y.nama);
  
  // Hitung bulan sebelumnya jika rentang minggu berjalan melintasi batas bulan
  const [yStr, mStr] = currentMonth.split("-");
  const yNum = parseInt(yStr, 10);
  const mNum = parseInt(mStr, 10);
  const prevMonthKey = mNum === 1 
    ? `${yNum - 1}-12` 
    : `${yNum}-${String(mNum - 1).padStart(2, "0")}`;
  const prevMonthDaysCount = new Date(yNum, mNum - 1, 0).getDate() || 31;

  const [currentMonthMap, prevMonthMap] = await Promise.all([
    getMonthBreakdownRealisasiMap(db, currentMonth),
    getMonthBreakdownRealisasiMap(db, prevMonthKey)
  ]);

  const breakdownRealisasiMonth = (db.breakdownRealisasi && db.breakdownRealisasi[currentMonth]) || currentMonthMap || {};
  const monthMaps: Record<string, any> = {
    [currentMonth]: breakdownRealisasiMonth,
    [prevMonthKey]: prevMonthMap || {}
  };
  const plgPjlManual = db.plgPjlManual || {};

  const tableData = names.map(name => {
    const ylItem = ylList.find((y: any) => y.nama === name);
    const area = ylItem ? ylItem.area : areaPrefix(name);
    const yl = pickByArea(dashboard.perYL, area) || { yo:0, om:0, os:0, yt:0, akumulasi:0, bbYL:0, rata2:0 };
    const ylTxs = db.transactions.filter((t: any) => (t.nama === name || (area && t.area && sameArea(t.area, area)) || (area && t.nama && sameArea(areaFromName(t.nama), area))) && t.tanggal && t.tanggal.startsWith(currentMonth));
    
    const areaData = breakdownRealisasiMonth[area];
    const pembagi = areaData && areaData.pembagiTanggal > 0 ? Number(areaData.pembagiTanggal) : 15;
    
    // Hari ini is date = pembagi
    const hariIniDateStr = currentMonth + "-" + String(pembagi).padStart(2, '0');
    let latestTx = ylTxs.find((t: any) => t.tanggal === hariIniDateStr) || {};
    
    // Rata2 Minggu Ini = Kumulatif rata-rata pada posisi tanggal pembagi saat ini
    const rataMingguIni = Math.trunc(yl.rata2) || getCumulativeDailyAverage(monthMaps, currentMonth, pembagi, area, name, db.transactions);

    // Rata2 Minggu Lalu = Kumulatif rata-rata pada posisi 7 hari kalender sebelumnya
    let rataMingguLalu = 0;
    if (pembagi > 7) {
      rataMingguLalu = getCumulativeDailyAverage(monthMaps, currentMonth, pembagi - 7, area, name, db.transactions);
    } else {
      const prevTargetDay = prevMonthDaysCount - (7 - pembagi);
      rataMingguLalu = getCumulativeDailyAverage(monthMaps, prevMonthKey, prevTargetDay, area, name, db.transactions);
    }

    // Baseline fallback dinamis dari target/rata2 bulan lalu milik YL ini jika data arsip belum ada
    if (rataMingguLalu === 0) {
      const tgtObj = db.targetYL?.[`${area}_${prevMonthKey}`] || db.targetYL?.[`${area}_${currentMonth}`] || db.targetYL?.[area];
      rataMingguLalu = Math.trunc(tgtObj?.bln_lalu || tgtObj?.target || yl.rata2 || 0);
    }

    const dayData = (areaData && areaData.days && areaData.days[String(pembagi)]) || {};
    const mainYo = (dayData.yo !== undefined && dayData.yo !== null && dayData.yo > 0) ? dayData.yo : (latestTx.tot_yo || 0);
    const mainOm = (dayData.om !== undefined && dayData.om !== null && dayData.om > 0) ? dayData.om : (latestTx.tot_om || 0);
    const mainOs = (dayData.os !== undefined && dayData.os !== null && dayData.os > 0) ? dayData.os : (latestTx.tot_os || 0);
    const mainYt = (dayData.yt !== undefined && dayData.yt !== null && dayData.yt > 0) ? dayData.yt : (latestTx.tot_yt || 0);
    const todayAll = mainYo + mainOm + mainOs + mainYt;

    const vsMingguLaluPct = rataMingguLalu > 0 ? Math.trunc((rataMingguIni / rataMingguLalu) * 100) : 0;

    const rumahHariIni = (latestTx.rmh_yo||0) + (latestTx.rmh_om||0) + (latestTx.rmh_os||0) + (latestTx.rmh_yt||0);
    const rumahAkm = ylTxs.reduce((sum: number, t: any) => sum + (t.rmh_yo||0) + (t.rmh_om||0) + (t.rmh_os||0) + (t.rmh_yt||0), 0);
    const allAkmSektor = ylTxs.reduce((sum: number, t: any) => sum +
      ((t.rmh_yo||0) + (t.rmh_om||0) + (t.rmh_os||0) + (t.rmh_yt||0)) +
      ((t.psr_yo||0) + (t.psr_om||0) + (t.psr_os||0) + (t.psr_yt||0)) +
      ((t.skh_yo||0) + (t.skh_om||0) + (t.skh_os||0) + (t.skh_yt||0)) +
      ((t.ktr_yo||0) + (t.ktr_om||0) + (t.ktr_os||0) + (t.ktr_yt||0)) +
      ((t.tk_yo||0)  + (t.tk_om||0)  + (t.tk_os||0)  + (t.tk_yt||0)) +
      ((t.ib_yo||0)  + (t.ib_om||0)  + (t.ib_os||0)  + (t.ib_yt||0)), 0);
    const persenRumah = allAkmSektor > 0 ? Math.trunc((rumahAkm / allAkmSektor) * 100) : 0;
    
    // Plg pjl manual logic for rb vs plg HARI INI
    const plg = Number(latestTx.f_plg) || 0;
    const rb = Number(latestTx.f_rb) || 0;
    const persenRbPlg = plg > 0 ? Math.trunc((rb / plg) * 100) : 0;
    
    const pbPagi = latestTx.pb_p || 0;
    const pbSore = latestTx.pb_s || 0;
    const pbAkm = ylTxs.reduce((sum: number, t: any) => sum + (t.pb_p||0) + (t.pb_s||0), 0);
    
    const sampahHariIni = latestTx.apk_botol || 0;
    const sampahAkm = ylTxs.reduce((sum: number, t: any) => sum + (t.apk_botol||0), 0);
    const vs900 = sampahAkm - 900;
    
    const bbHariIni = (latestTx.bb_yo||0) + (latestTx.bb_om||0) + (latestTx.bb_os||0) + (latestTx.bb_yt||0);
    const bbPersenHariIni = (todayAll + bbHariIni) > 0 ? Math.trunc((bbHariIni / (todayAll + bbHariIni)) * 100) : 0;
    const bbAkm = yl.bbYL || 0;
    const bbPersenAkm = (yl.akumulasi + bbAkm) > 0 ? Math.trunc((bbAkm / (yl.akumulasi + bbAkm)) * 100) : 0;

    return [
      area,
      name,
      rataMingguLalu,
      mainYo,
      mainOm,
      mainOs,
      mainYt,
      todayAll,
      yl.akumulasi,
      yl.yo,
      yl.om,
      yl.os,
      yl.yt,
      Math.trunc(yl.rata2),
      rataMingguIni,
      vsMingguLaluPct,
      rumahHariIni,
      rumahAkm,
      persenRumah,
      plg,
      rb,
      persenRbPlg,
      pbPagi,
      pbSore,
      pbAkm,
      sampahHariIni,
      sampahAkm,
      vs900,
      bbHariIni,
      bbPersenHariIni,
      bbAkm,
      bbPersenAkm
    ];
  });

  const sumRataMingguLalu = tableData.reduce((s: number, r: any) => s + (r[2]||0), 0);
  const sumRataMingguIni = tableData.reduce((s: number, r: any) => s + (r[14]||0), 0);
  const sumVsMingguLalu = sumRataMingguLalu > 0 ? Math.trunc((sumRataMingguIni / sumRataMingguLalu) * 100) : 0;
  
  const totalYo = tableData.reduce((s: number, r: any) => s + (r[9]||0), 0);
  const totalOm = tableData.reduce((s: number, r: any) => s + (r[10]||0), 0);
  const totalOs = tableData.reduce((s: number, r: any) => s + (r[11]||0), 0);
  const totalYt = tableData.reduce((s: number, r: any) => s + (r[12]||0), 0);
  const totalAllAkmSektor = totalYo + totalOm + totalOs + totalYt;
  const sumRumahAkm = tableData.reduce((s: number, r: any) => s + (r[17]||0), 0);
  const sumPersenRumah = totalAllAkmSektor > 0 ? Math.trunc((sumRumahAkm / totalAllAkmSektor) * 100) : 0;
  
  const sumPlg = tableData.reduce((s: number, r: any) => s + (r[19]||0), 0);
  const sumRb = tableData.reduce((s: number, r: any) => s + (r[20]||0), 0);
  const sumPersenRbPlg = sumPlg > 0 ? Math.trunc((sumRb / sumPlg) * 100) : 0;
  
  const sumSampahAkm = tableData.reduce((s: number, r: any) => s + (r[26]||0), 0);
  const sumVs900 = sumSampahAkm - (900 * tableData.length);
  
  const sumTodayAll = tableData.reduce((s: number, r: any) => s + (r[7]||0), 0);
  const sumBbHariIni = tableData.reduce((s: number, r: any) => s + (r[28]||0), 0);
  const sumBbPersenHariIni = (sumTodayAll + sumBbHariIni) > 0 ? Math.trunc((sumBbHariIni / (sumTodayAll + sumBbHariIni)) * 100) : 0;
  
  const sumAkm = tableData.reduce((s: number, r: any) => s + (r[8]||0), 0);
  const sumBbAkm = tableData.reduce((s: number, r: any) => s + (r[30]||0), 0);
  const sumBbPersenAkm = (sumAkm + sumBbAkm) > 0 ? Math.trunc((sumBbAkm / (sumAkm + sumBbAkm)) * 100) : 0;

  const totalRow = [
    "TOTAL", "",
    sumRataMingguLalu,
    tableData.reduce((s: number, r: any) => s + (r[3]||0), 0),
    tableData.reduce((s: number, r: any) => s + (r[4]||0), 0),
    tableData.reduce((s: number, r: any) => s + (r[5]||0), 0),
    tableData.reduce((s: number, r: any) => s + (r[6]||0), 0),
    sumTodayAll,
    sumAkm,
    totalYo,
    totalOm,
    totalOs,
    totalYt,
    tableData.reduce((s: number, r: any) => s + (r[13]||0), 0),
    sumRataMingguIni,
    sumVsMingguLalu,
    tableData.reduce((s: number, r: any) => s + (r[16]||0), 0),
    sumRumahAkm,
    sumPersenRumah,
    sumPlg,
    sumRb,
    sumPersenRbPlg,
    tableData.reduce((s: number, r: any) => s + (r[22]||0), 0),
    tableData.reduce((s: number, r: any) => s + (r[23]||0), 0),
    tableData.reduce((s: number, r: any) => s + (r[24]||0), 0),
    tableData.reduce((s: number, r: any) => s + (r[25]||0), 0),
    sumSampahAkm,
    sumVs900,
    sumBbHariIni,
    sumBbPersenHariIni,
    sumBbAkm,
    sumBbPersenAkm
  ];

  const analisis = tableData.map(r => ({
    area: r[0],
    nama: r[1],
    jualHariIni: r[7],
    rata2BulanBerjalan: r[13],
    vsMingguLaluPct: r[15],
    persenRumah: r[18],
    persenRbVsPlg: r[21],
    propagandaHariIni: r[22] + r[23],
    sampahBotol: r[26],
    bb: r[28],
    akmBb: r[30],
    persenBbAkm: r[31]
  }));

  res.json({
    ok: true,
    evaluasiData: {
      dataRows: tableData,
      totalRow,
      analisis
    }
  });
});

// Cache arsip bulanan di memori server. Isi arsip (satu bulan penuh) besar, sedangkan
// ngecek "berubah atau tidak" cukup baca kolom updated_at (~100 byte). Jadi egress
// Supabase turun drastis: isi arsip hanya diunduh ulang kalau updated_at-nya berubah.
const monthlyArchiveCache = new Map<string, { stamp: string; data: any }>();

app.get("/api/getMonthlyArchive", async (req, res) => {
  try {
    const monthKey = String(req.query.month || "");
    if (!monthKey) return res.status(400).json({ ok: false, error: "Month required" });
    const db = loadData();

    // 1. Cek dari Supabase jika terhubung
    if (supabase) {
      try {
        const arcKey = `monthly_archive_${monthKey}`;
        const { data: metaRow } = await (supabase.from("app_store") as any)
          .select("updated_at")
          .eq("key", arcKey)
          .maybeSingle();
        if (metaRow) {
          const stamp = String(metaRow.updated_at || "");
          const hit = monthlyArchiveCache.get(arcKey);
          if (hit && stamp && hit.stamp === stamp) {
            return res.json({ ok: true, archive: hit.data });
          }
          const { data: arcRow } = await (supabase.from("app_store") as any)
            .select("data")
            .eq("key", arcKey)
            .maybeSingle();
          if (arcRow && arcRow.data) {
            if (monthlyArchiveCache.size > 24) monthlyArchiveCache.clear();
            monthlyArchiveCache.set(arcKey, { stamp, data: arcRow.data });
            return res.json({ ok: true, archive: arcRow.data });
          }
        }
      } catch (err) {
        console.warn(`[Supabase] Gagal getMonthlyArchive ${monthKey}:`, err);
      }
    }

    // 2. Fallback: Bangun dari data lokal server untuk bulan terkait
    const bdMap = (db.breakdownRealisasi && db.breakdownRealisasi[monthKey]) || {};
    const filteredTxs = (db.transactions || []).filter((t: any) => typeof t.tanggal === "string" && t.tanggal.startsWith(monthKey));
    const targetMap = (db.targetYLByMonth && db.targetYLByMonth[monthKey]) || {};

    if (Object.keys(bdMap).length > 0 || filteredTxs.length > 0) {
      return res.json({
        ok: true,
        archive: {
          monthKey,
          breakdownRealisasiMap: bdMap,
          transactions: filteredTxs,
          targetYLMap: targetMap
        }
      });
    }

    res.json({ ok: false, message: "Archive not found" });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});


app.get("/api/getPlgPjlData", async (req, res) => {
  const db = loadData();
  const ylList = db.ylList || INITIAL_YL_LIST;
  // FIX: dulu selalu pakai bulan berjalan (new Date()) dan mengembalikan SEMUA transaksi
  // tanpa filter bulan sama sekali. Sekarang terima query ?month=YYYY-MM (dipakai saat
  // membuka data arsip, misal bulan Juli) untuk memfilter data sesuai bulan yang diminta.
  const requestedMonth = (typeof req.query.month === "string" && req.query.month) || new Date().toISOString().substring(0, 7);
  const breakdownRealisasiMonth = (db.breakdownRealisasi && db.breakdownRealisasi[requestedMonth]) || {};
  
  let realisasiPembagi = 15;
  const brKeys = Object.keys(breakdownRealisasiMonth);
  if (brKeys.length > 0) {
    const p = breakdownRealisasiMonth[brKeys[0]]?.pembagiTanggal;
    if (p && Number(p) > 0) realisasiPembagi = Number(p);
  }

  const pembagiManager = realisasiPembagi;

  const allTransactions = db.transactions || [];
  // Kalau ?month= diberikan secara eksplisit (dipakai fitur arsip), filter transaksi
  // supaya hanya menampilkan data bulan itu. Kalau tidak ada query month, perilaku lama
  // (tanpa filter) dipertahankan supaya tampilan live yang sudah ada tidak berubah.
  const filteredTransactions = (typeof req.query.month === "string" && req.query.month)
    ? allTransactions.filter((t: any) => typeof t.tanggal === "string" && t.tanggal.startsWith(requestedMonth))
    : allTransactions;

  res.json({
    ok: true,
    ylList,
    pembagiManager,
    month: requestedMonth,
    transactions: filteredTransactions,
    potensiTembus: db.potensiTembus || {},
    breakdownRealisasiMap: breakdownRealisasiMonth
  });
});

function findYlPhoto(photos: Record<string, string> | undefined, queryName: string, db: any): string {
  if (!photos || typeof photos !== "object" || !queryName) return "";
  const qClean = cleanYlName(queryName).toLowerCase().trim();
  const qArea = areaPrefix(queryName);

  // 1. Exact key match
  if (photos[queryName]) return photos[queryName];

  // 2. Clean name match (case-insensitive)
  for (const [key, val] of Object.entries(photos)) {
    if (!val) continue;
    const kClean = cleanYlName(key).toLowerCase().trim();
    if (kClean && kClean === qClean) return val;
  }

  // 3. Area match
  if (qArea) {
    if (photos[qArea]) return photos[qArea];
    for (const [key, val] of Object.entries(photos)) {
      if (!val) continue;
      if (sameArea(areaPrefix(key), qArea)) return val;
    }
    if (Array.isArray(db.ylList)) {
      const yl = db.ylList.find((y: any) => sameArea(y.area, qArea));
      if (yl) {
        const ylClean = cleanYlName(yl.nama).toLowerCase().trim();
        for (const [key, val] of Object.entries(photos)) {
          if (!val) continue;
          const kClean = cleanYlName(key).toLowerCase().trim();
          if (kClean === ylClean || key === yl.nama) return val;
        }
      }
    }
  }

  return "";
}

app.post("/api/saveYlFoto", async (req, res) => {
  const db = loadData();
  const { nama, foto: rawFoto } = req.body;
  if (!nama) return res.status(400).json({ ok: false, message: "Nama required" });
  if (!db.ylPhotos) db.ylPhotos = {};

  const clean = cleanYlName(nama) || nama;
  const foto = await storeImage("foto", clean, await compressBase64Image(rawFoto, 300, 75));

  // Simpan HANYA 1 salinan kanonikal (findYlPhoto sudah mendukung pencarian fleksibel nama/area/clean)
  db.ylPhotos[clean] = foto;
  // Hapus kunci duplikat lama jika ada agar database tetap bersih dan ramping
  if (clean !== nama && db.ylPhotos[nama]) delete db.ylPhotos[nama];
  const namaPrefix = areaPrefix(nama);
  if (namaPrefix && namaPrefix !== clean && db.ylPhotos[namaPrefix]) delete db.ylPhotos[namaPrefix];
  
  // Jangan menempelkan string base64 foto ke db.ylList agar main_db_ylList tetap ringan (menghemat egress Supabase)
  if (Array.isArray(db.ylList)) {
    const yl = db.ylList.find((y: any) => y.nama === nama || cleanYlName(y.nama) === clean);
    if (yl && yl.foto) {
      delete yl.foto;
    }
  }
  
  safeWriteFile(DATA_FILE, JSON.stringify(db));

  // Simpan ke Supabase Media (Akun Baru)
  let savedToMedia = false;
  if (supabaseMedia) {
    try {
      const { error } = await (supabaseMedia.from("app_store") as any).upsert([
        {
          key: "main_db_ylPhotos",
          data: db.ylPhotos,
          updated_at: new Date().toISOString()
        }
      ], { onConflict: "key" });
      if (!error) {
        savedToMedia = true;
        if (supabase) {
          try {
            await (supabase.from("app_store") as any).delete().eq("key", "main_db_ylPhotos");
          } catch {}
        }
      } else {
        console.warn("[Supabase Media] Gagal simpan ylPhotos ke media Supabase:", error.message);
      }
    } catch (err) {
      console.error("[Supabase Media] Exception save ylPhotos:", err);
    }
  }

  // Fallback cadangan ke Supabase Lama HANYA jika Supabase Media belum aktif / gagal
  if (!savedToMedia && supabase) {
    try {
      await (supabase.from("app_store") as any).upsert([
        {
          key: "main_db_ylPhotos",
          data: db.ylPhotos,
          updated_at: new Date().toISOString()
        }
      ], { onConflict: "key" });
    } catch (err) {
      console.error("[Supabase] Gagal menyimpan ylPhotos ke Supabase lama:", err);
    }
  }

  res.json({ ok: true, foto });
});

app.get("/api/getYlFoto", async (req, res) => {
  const db = loadData();
  const nama = String(req.query.nama || "");
  if (!db.ylPhotos) db.ylPhotos = {};
  
  let foto = findYlPhoto(db.ylPhotos, nama, db);
  if (!foto && Array.isArray(db.ylList)) {
    const yl = db.ylList.find((y: any) => y.nama === nama || cleanYlName(y.nama) === cleanYlName(nama));
    if (yl && yl.foto) foto = yl.foto;
  }

  // 1. Lazy-load dari Supabase Media jika foto belum ada di memori dan belum pernah dimuat
  if (!foto && supabaseMedia && !ylPhotosRemoteLoaded) {
    try {
      const { data: row, error } = await (supabaseMedia.from("app_store") as any)
        .select("data")
        .eq("key", "main_db_ylPhotos")
        .maybeSingle();
      if (!error && row && row.data) {
        db.ylPhotos = { ...db.ylPhotos, ...row.data };
        foto = findYlPhoto(db.ylPhotos, nama, db);
        ylPhotosRemoteLoaded = true;
      }
    } catch (err) {
      console.warn("[Supabase Media] Gagal lazy-load ylPhotos:", err);
    }
  }

  // 2. Fallback ke Supabase Lama jika di Supabase Media belum ada
  if (!foto && supabase && !ylPhotosRemoteLoaded) {
    try {
      const { data: row } = await (supabase.from("app_store") as any)
        .select("data")
        .eq("key", "main_db_ylPhotos")
        .maybeSingle();
      if (row && row.data) {
        db.ylPhotos = { ...db.ylPhotos, ...row.data };
        foto = findYlPhoto(db.ylPhotos, nama, db);
      }
      ylPhotosRemoteLoaded = true;
    } catch (err) {
      console.warn("[Supabase] Gagal lazy-load ylPhotos dari akun lama:", err);
    }
  }

  res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
  res.json({ ok: true, foto });
});

app.get("/api/getAllYlPhotos", async (_req, res) => {
  const db = loadData();
  if (!db.ylPhotos) db.ylPhotos = {};

  if (supabaseMedia && !ylPhotosRemoteLoaded) {
    try {
      const { data: row } = await (supabaseMedia.from("app_store") as any)
        .select("data")
        .eq("key", "main_db_ylPhotos")
        .maybeSingle();
      if (row && row.data) {
        db.ylPhotos = { ...db.ylPhotos, ...row.data };
        ylPhotosRemoteLoaded = true;
      }
    } catch {}
  }
  if (supabase && !ylPhotosRemoteLoaded) {
    try {
      const { data: row } = await (supabase.from("app_store") as any)
        .select("data")
        .eq("key", "main_db_ylPhotos")
        .maybeSingle();
      if (row && row.data) {
        db.ylPhotos = { ...db.ylPhotos, ...row.data };
        ylPhotosRemoteLoaded = true;
      }
    } catch {}
  }

  res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
  res.json({ ok: true, photos: db.ylPhotos || {} });
});

app.post("/api/saveRealisasiPotensiYL", async (req, res) => {
  const data = req.body;
  const db = loadData();
  
  if (!db.transactions) db.transactions = [];
  
  const ylList = db.ylList || INITIAL_YL_LIST;
  const rawName = String(data.nama || "").trim();
  const cleanName = cleanYlName(rawName);
  let area: string | null = areaPrefix(rawName) || null;

  const ylMatch = ylList.find((y: any) => 
    (cleanName && cleanYlName(y.nama || "").toLowerCase() === cleanName.toLowerCase()) ||
    (y.area === rawName) ||
    (y.nama === rawName) ||
    (area && (sameArea(y.area, area) || sameArea(areaFromName(y.nama), area)))
  );

  if (ylMatch && !area) {
    area = ylMatch.area;
  }
  const cleanYl = ylMatch ? cleanYlName(ylMatch.nama) : cleanName;
  const standardFullName = area ? `${area} - ${cleanYl || rawName}` : rawName;

  let idx = db.transactions.findIndex((t: any) => {
    const matchDate = t.tanggal === data.tanggal;
    const matchYl = (t.nama === data.nama) ||
                    (area && (sameArea(t.area, area) || (t.nama && sameArea(areaFromName(t.nama), area)))) ||
                    (cleanName && cleanYlName(t.nama || "") === cleanName);
    return matchDate && matchYl;
  });
  
  const rmh_yo = Number(data.sektor?.rmh?.yo) || 0;
  const rmh_om = Number(data.sektor?.rmh?.om) || 0;
  const rmh_os = Number(data.sektor?.rmh?.os) || 0;
  const rmh_yt = Number(data.sektor?.rmh?.yt) || 0;

  const psr_yo = Number(data.sektor?.psr?.yo) || 0;
  const psr_om = Number(data.sektor?.psr?.om) || 0;
  const psr_os = Number(data.sektor?.psr?.os) || 0;
  const psr_yt = Number(data.sektor?.psr?.yt) || 0;

  const skh_yo = Number(data.sektor?.skh?.yo) || 0;
  const skh_om = Number(data.sektor?.skh?.om) || 0;
  const skh_os = Number(data.sektor?.skh?.os) || 0;
  const skh_yt = Number(data.sektor?.skh?.yt) || 0;

  const ktr_yo = Number(data.sektor?.ktr?.yo) || 0;
  const ktr_om = Number(data.sektor?.ktr?.om) || 0;
  const ktr_os = Number(data.sektor?.ktr?.os) || 0;
  const ktr_yt = Number(data.sektor?.ktr?.yt) || 0;

  const tk_yo = Number(data.sektor?.tk?.yo) || 0;
  const tk_om = Number(data.sektor?.tk?.om) || 0;
  const tk_os = Number(data.sektor?.tk?.os) || 0;
  const tk_yt = Number(data.sektor?.tk?.yt) || 0;

  const ib_yo = Number(data.sektor?.ib?.yo) || 0;
  const ib_om = Number(data.sektor?.ib?.om) || 0;
  const ib_os = Number(data.sektor?.ib?.os) || 0;
  const ib_yt = Number(data.sektor?.ib?.yt) || 0;

  const tot_yo = rmh_yo + psr_yo + skh_yo + ktr_yo + tk_yo + ib_yo;
  const tot_om = rmh_om + psr_om + skh_om + ktr_om + tk_om + ib_om;
  const tot_os = rmh_os + psr_os + skh_os + ktr_os + tk_os + ib_os;
  const tot_yt = rmh_yt + psr_yt + skh_yt + ktr_yt + tk_yt + ib_yt;

  const updates = {
    rmh_yo, rmh_om, rmh_os, rmh_yt,
    psr_yo, psr_om, psr_os, psr_yt,
    skh_yo, skh_om, skh_os, skh_yt,
    ktr_yo, ktr_om, ktr_os, ktr_yt,
    tk_yo, tk_om, tk_os, tk_yt,
    ib_yo, ib_om, ib_os, ib_yt,
    tot_yo, tot_om, tot_os, tot_yt,
    pb_p: Number(data.pb_p) || 0, pb_s: Number(data.pb_s) || 0,
    apk_plg: Number(data.apk_plg) || 0, apk_botol: Number(data.apk_botol) || 0,
    f_plg: Number(data.f_plg) || 0, f_rk: Number(data.f_rk) || 0, f_ra: Number(data.f_ra) || 0, f_rb: Number(data.f_rb) || 0
  };

  const lockBb = idx !== -1 && hasLhppBb(db, data.tanggal, area, cleanName);
  const bbUpdates = lockBb ? {} : {
    bb_yo: Number(data.bb_yo) || 0, bb_om: Number(data.bb_om) || 0,
    bb_os: Number(data.bb_os) || 0, bb_yt: Number(data.bb_yt) || 0
  };

  if (idx !== -1) {
    db.transactions[idx] = {
      ...db.transactions[idx],
      area: area || db.transactions[idx].area,
      nama: standardFullName,
      ...updates,
      ...bbUpdates
    };
  } else {
    db.transactions.push({
      tanggal: data.tanggal,
      nama: standardFullName,
      area: area || "",
      ...updates,
      ...bbUpdates
    });
  }

  // Sinkronkan otomatis ke db.breakdownRealisasi agar Admin langsung melihat angka total dan tidak tertimpa
  if (data.tanggal && area) {
    const month = data.tanggal.substring(0, 7);
    const day = String(parseInt(data.tanggal.substring(8, 10), 10));
    if (!db.breakdownRealisasi) db.breakdownRealisasi = {};
    if (!db.breakdownRealisasi[month]) db.breakdownRealisasi[month] = {};
    if (!db.breakdownRealisasi[month][area]) db.breakdownRealisasi[month][area] = { days: {}, pembagiTanggal: 0 };
    if (!db.breakdownRealisasi[month][area].days) db.breakdownRealisasi[month][area].days = {};
    
    db.breakdownRealisasi[month][area].days[day] = {
      yo: tot_yo,
      om: tot_om,
      os: tot_os,
      yt: tot_yt
    };
  }

  db.transactions = deduplicateTransactions(db.transactions);
  
  await saveData(db);
  res.json({ ok: true });
});

app.post("/api/saveBatchRealisasiPotensiYL", async (req, res) => {
  try {
    const { updates, nama } = req.body;
    if (!Array.isArray(updates) || updates.length === 0) {
      return res.json({ ok: true, count: 0 });
    }

    const db = loadData();
    if (!db.transactions) db.transactions = [];

    const ylList = db.ylList || INITIAL_YL_LIST;

    updates.forEach((data: any) => {
      if (!data || !data.tanggal) return;

      const rawItemName = String(data.nama || nama || updates[0]?.nama || "").trim();
      const cleanName = cleanYlName(rawItemName);
      let itemArea: string | null = areaPrefix(rawItemName) || null;

      const ylMatch = ylList.find((y: any) => 
        (cleanName && cleanYlName(y.nama || "").toLowerCase() === cleanName.toLowerCase()) ||
        (y.area === rawItemName) ||
        (y.nama === rawItemName) ||
        (itemArea && (y.area === itemArea || String(y.nama).startsWith(itemArea)))
      );
      if (ylMatch && !itemArea) {
        itemArea = ylMatch.area;
      }
      const cleanYl = ylMatch ? cleanYlName(ylMatch.nama) : cleanName;
      const standardFullName = itemArea ? `${itemArea} - ${cleanYl || rawItemName}` : rawItemName;

      const rmh_yo = Number(data.sektor?.rmh?.yo) || 0;
      const rmh_om = Number(data.sektor?.rmh?.om) || 0;
      const rmh_os = Number(data.sektor?.rmh?.os) || 0;
      const rmh_yt = Number(data.sektor?.rmh?.yt) || 0;

      const psr_yo = Number(data.sektor?.psr?.yo) || 0;
      const psr_om = Number(data.sektor?.psr?.om) || 0;
      const psr_os = Number(data.sektor?.psr?.os) || 0;
      const psr_yt = Number(data.sektor?.psr?.yt) || 0;

      const skh_yo = Number(data.sektor?.skh?.yo) || 0;
      const skh_om = Number(data.sektor?.skh?.om) || 0;
      const skh_os = Number(data.sektor?.skh?.os) || 0;
      const skh_yt = Number(data.sektor?.skh?.yt) || 0;

      const ktr_yo = Number(data.sektor?.ktr?.yo) || 0;
      const ktr_om = Number(data.sektor?.ktr?.om) || 0;
      const ktr_os = Number(data.sektor?.ktr?.os) || 0;
      const ktr_yt = Number(data.sektor?.ktr?.yt) || 0;

      const tk_yo = Number(data.sektor?.tk?.yo) || 0;
      const tk_om = Number(data.sektor?.tk?.om) || 0;
      const tk_os = Number(data.sektor?.tk?.os) || 0;
      const tk_yt = Number(data.sektor?.tk?.yt) || 0;

      const ib_yo = Number(data.sektor?.ib?.yo) || 0;
      const ib_om = Number(data.sektor?.ib?.om) || 0;
      const ib_os = Number(data.sektor?.ib?.os) || 0;
      const ib_yt = Number(data.sektor?.ib?.yt) || 0;

      const tot_yo = rmh_yo + psr_yo + skh_yo + ktr_yo + tk_yo + ib_yo;
      const tot_om = rmh_om + psr_om + skh_om + ktr_om + tk_om + ib_om;
      const tot_os = rmh_os + psr_os + skh_os + ktr_os + tk_os + ib_os;
      const tot_yt = rmh_yt + psr_yt + skh_yt + ktr_yt + tk_yt + ib_yt;

      const hasAnyValue = tot_yo > 0 || tot_om > 0 || tot_os > 0 || tot_yt > 0 ||
        Number(data.bb_yo) > 0 || Number(data.bb_om) > 0 || Number(data.bb_os) > 0 || Number(data.bb_yt) > 0 ||
        Number(data.pb_p) > 0 || Number(data.pb_s) > 0 ||
        Number(data.apk_plg) > 0 || Number(data.apk_botol) > 0 ||
        Number(data.f_plg) > 0 || Number(data.f_rk) > 0 || Number(data.f_ra) > 0 || Number(data.f_rb) > 0;

      let idx = db.transactions.findIndex((t: any) => {
        const matchDate = t.tanggal === data.tanggal;
        const matchYl = (t.nama === rawItemName) ||
                        (itemArea && (t.area === itemArea || (t.nama && String(t.nama).startsWith(itemArea)))) ||
                        (cleanName && cleanYlName(t.nama || "") === cleanName);
        return matchDate && matchYl;
      });

      const itemUpdates = {
        rmh_yo, rmh_om, rmh_os, rmh_yt,
        psr_yo, psr_om, psr_os, psr_yt,
        skh_yo, skh_om, skh_os, skh_yt,
        ktr_yo, ktr_om, ktr_os, ktr_yt,
        tk_yo, tk_om, tk_os, tk_yt,
        ib_yo, ib_om, ib_os, ib_yt,
        tot_yo, tot_om, tot_os, tot_yt,
        pb_p: Number(data.pb_p) || 0, pb_s: Number(data.pb_s) || 0,
        apk_plg: Number(data.apk_plg) || 0, apk_botol: Number(data.apk_botol) || 0,
        f_plg: Number(data.f_plg) || 0, f_rk: Number(data.f_rk) || 0, f_ra: Number(data.f_ra) || 0, f_rb: Number(data.f_rb) || 0
      };

      const lockBb = idx !== -1 && hasLhppBb(db, data.tanggal, itemArea, cleanName);
      const bbUpdates = lockBb ? {} : {
        bb_yo: Number(data.bb_yo) || 0, bb_om: Number(data.bb_om) || 0,
        bb_os: Number(data.bb_os) || 0, bb_yt: Number(data.bb_yt) || 0
      };

      if (idx !== -1) {
        db.transactions[idx] = {
          ...db.transactions[idx],
          area: itemArea || db.transactions[idx].area,
          nama: standardFullName,
          ...itemUpdates,
          ...bbUpdates
        };
      } else if (hasAnyValue) {
        db.transactions.push({
          tanggal: data.tanggal,
          nama: standardFullName,
          area: itemArea || "",
          ...itemUpdates,
          ...bbUpdates
        });
      }

      // Sinkronkan ke breakdownRealisasi
      if (data.tanggal && itemArea) {
        const month = data.tanggal.substring(0, 7);
        const day = String(parseInt(data.tanggal.substring(8, 10), 10));
        if (!db.breakdownRealisasi) db.breakdownRealisasi = {};
        if (!db.breakdownRealisasi[month]) db.breakdownRealisasi[month] = {};
        if (!db.breakdownRealisasi[month][itemArea]) db.breakdownRealisasi[month][itemArea] = { days: {}, pembagiTanggal: 0 };
        if (!db.breakdownRealisasi[month][itemArea].days) db.breakdownRealisasi[month][itemArea].days = {};
        
        db.breakdownRealisasi[month][itemArea].days[day] = {
          yo: tot_yo,
          om: tot_om,
          os: tot_os,
          yt: tot_yt
        };
      }
    });

    db.transactions = deduplicateTransactions(db.transactions);
    cleanEmptyTransactions(db);
    await saveData(db);

    res.json({ ok: true, count: updates.length });
  } catch (err: any) {
    console.error("Error in saveBatchRealisasiPotensiYL:", err);
    res.status(500).json({ ok: false, error: err?.message || "Gagal menyimpan batch" });
  }
});

app.post("/api/savePotensiTembus", async (req, res) => {
  const data = req.body;
  const db = loadData();
  
  if (!db.potensiTembus) db.potensiTembus = {};
  if (!db.potensiTembus[data.bulan]) db.potensiTembus[data.bulan] = {};
  
  const val = {
    skhTotal: Number(data.skhTotal) || 0, skhTembus: Number(data.skhTembus) || 0,
    kntrTotal: Number(data.kntrTotal) || 0, kntrTembus: Number(data.kntrTembus) || 0,
    tkoTotal: Number(data.tkoTotal) || 0, tkoTembus: Number(data.tkoTembus) || 0
  };

  const rawName = String(data.nama || "").trim();
  const cleanName = cleanYlName(rawName);
  let areaCode: string | null = areaPrefix(rawName) || null;

  // Cari di ylList jika areaCode belum didapat
  const ylList = db.ylList || INITIAL_YL_LIST;
  const ylMatch = ylList.find((y: any) => 
    (cleanName && cleanYlName(y.nama || "").toLowerCase() === cleanName.toLowerCase()) ||
    (y.area === rawName) ||
    (y.nama === rawName)
  );
  if (ylMatch && !areaCode) {
    areaCode = ylMatch.area;
  }
  const ylClean = ylMatch ? cleanYlName(ylMatch.nama || "") : cleanName;

  db.potensiTembus[data.bulan][rawName] = val;
  if (cleanName) db.potensiTembus[data.bulan][cleanName] = val;
  if (ylClean) db.potensiTembus[data.bulan][ylClean] = val;
  if (areaCode) {
    db.potensiTembus[data.bulan][areaCode] = val;
    db.potensiTembus[data.bulan][`${areaCode} - ${ylClean || cleanName}`] = val;
  }
  
  await saveData(db);
  res.json({ ok: true });
});

app.get("/api/getPotensiTembus", async (req, res) => {
  const { bulan, nama } = req.query;
  const db = loadData();
  
  if (db.potensiTembus) {
    const reqMonth = (bulan as string) || "";
    const reqName = String(nama || "").trim();
    const cleanReq = cleanYlName(reqName).toLowerCase();
    let areaReq: string | null = areaPrefix(reqName) || null;

    const ylList = db.ylList || INITIAL_YL_LIST;
    const ylMatch = ylList.find((y: any) => 
      (cleanReq && cleanYlName(y.nama || "").toLowerCase() === cleanReq) ||
      (y.area === reqName) ||
      (y.nama === reqName) ||
      (areaReq && sameArea(y.area, areaReq))
    );
    if (ylMatch && !areaReq) {
      areaReq = ylMatch.area;
    }
    const matchedClean = ylMatch ? cleanYlName(ylMatch.nama || "").toLowerCase() : "";

    const findInMonth = (monthData: any) => {
      if (!monthData || typeof monthData !== "object") return null;
      if (monthData[reqName]) return monthData[reqName];
      if (cleanReq && monthData[cleanReq]) return monthData[cleanReq];
      if (areaReq && monthData[areaReq]) return monthData[areaReq];
      if (matchedClean && monthData[matchedClean]) return monthData[matchedClean];
      if (ylMatch?.nama && monthData[ylMatch.nama]) return monthData[ylMatch.nama];
      if (areaReq && ylMatch && monthData[`${areaReq} - ${ylMatch.nama}`]) return monthData[`${areaReq} - ${ylMatch.nama}`];

      const matchKey = Object.keys(monthData).find(k => {
        const ck = cleanYlName(k).toLowerCase();
        return (ck && (ck === cleanReq || ck === matchedClean)) || 
               (areaReq && (k === areaReq || k.startsWith(areaReq) || sameArea(areaPrefix(k), areaReq)));
      });
      return matchKey ? monthData[matchKey] : null;
    };

    let found = findInMonth(db.potensiTembus[reqMonth]);

    if (!found) {
      const sortedMonths = Object.keys(db.potensiTembus).sort().reverse();
      for (const m of sortedMonths) {
        found = findInMonth(db.potensiTembus[m]);
        if (found) break;
      }
    }

    if (found) {
      return res.json({ data: found });
    }
  }
  res.json({ data: null });
});


const handleExportRealisasi = async (req: any, res: any) => {
  try {
    const XLSX = await import("xlsx");
    const db = loadData();
    const wb = XLSX.utils.book_new();

    const monthParam = req.method === "POST" ? (req.body?.month || req.query?.month) : req.query?.month;
    const selectedMonth = (monthParam && typeof monthParam === "string" && /^\d{4}-\d{2}$/.test(monthParam))
      ? monthParam
      : (new Date().toISOString().slice(0, 7));

    let txs: any[] = [];
    let breakdownRealisasi: Record<string, any> = {};
    let potensiTembusData: any = {};
    let customYlList: any[] = db.ylList || [];

    // 1. Jika dikirim via POST dengan payload dari client (misal dari ArchiveEditor snapshot)
    if (req.method === "POST" && req.body) {
      if (Array.isArray(req.body.transactions) && req.body.transactions.length > 0) {
        txs = req.body.transactions;
      }
      if (req.body.breakdownRealisasiMap && typeof req.body.breakdownRealisasiMap === "object") {
        breakdownRealisasi = req.body.breakdownRealisasiMap;
      }
      if (req.body.potensiTembus) {
        potensiTembusData = req.body.potensiTembus;
      }
      if (Array.isArray(req.body.ylList) && req.body.ylList.length > 0) {
        customYlList = req.body.ylList;
      }
    }

    // 2. Jika transaksi belum didapat, cari di data berjalan
    if (txs.length === 0) {
      const allTxs = db.transactions || [];
      txs = allTxs.filter((t: any) => (t.tanggal || "").startsWith(selectedMonth));
      if (db.breakdownRealisasi && db.breakdownRealisasi[selectedMonth]) {
        breakdownRealisasi = db.breakdownRealisasi[selectedMonth];
      }
      potensiTembusData = db.potensiTembus || {};
    }

    // 3. Jika masih kosong (bulan arsip), ambil dari monthlyArchives lokal atau Supabase
    if (txs.length === 0) {
      let arcData = db.monthlyArchives?.[selectedMonth];
      if (!arcData && supabase) {
        try {
          const { data: row } = await (supabase.from("app_store") as any)
            .select("data")
            .eq("key", `monthly_archive_${selectedMonth}`)
            .maybeSingle();
          if (row && row.data) {
            arcData = row.data.data || row.data;
          }
        } catch (e: any) {
          console.warn("[exportRealisasi] Error fetching archive:", e?.message || e);
        }
      }
      if (arcData) {
        if (Array.isArray(arcData.transactions)) {
          txs = arcData.transactions;
        }
        if (arcData.breakdownRealisasiMap) {
          breakdownRealisasi = arcData.breakdownRealisasiMap;
        }
        if (arcData.potensiTembus) {
          potensiTembusData = arcData.potensiTembus;
        }
        if (Array.isArray(arcData.ylList)) {
          customYlList = arcData.ylList;
        }
      }
    }
    
    let realisasiPembagi = "";
    const brKeys = Object.keys(breakdownRealisasi);
    if (brKeys.length > 0) {
      realisasiPembagi = breakdownRealisasi[brKeys[0]]?.pembagiTanggal || "";
    }

    const aoa: any[][] = [];
    aoa.push(["Pembagi", realisasiPembagi]);
    aoa.push([]);
    aoa.push([]);
    aoa.push([]);

    const cleanYlNameLocal = (fullName: string): string => {
      if (!fullName) return "";
      return fullName.replace(/^(\d+[\s\-_]+)/, "").trim();
    };

    // 1. Buat daftar canonical YL berdasarkan Area (201..210) agar tidak ada duplikasi nama
    const ylMap = new Map<string, { area: string; nama: string }>();
    if (customYlList && Array.isArray(customYlList)) {
      customYlList.forEach((y: any) => {
        if (y.status !== "Resign" && y.area) {
          const areaKey = String(y.area).trim();
          const cleanName = cleanYlNameLocal(y.nama || "");
          ylMap.set(areaKey, { area: areaKey, nama: cleanName });
        }
      });
    }

    // Periksa apakah ada area di transaksi yang belum terdaftar di ylList
    txs.forEach((t: any) => {
      const areaKey = String(t.area || "").trim() || (t.nama ? areaPrefix(t.nama) : "");
      if (areaKey && !Array.from(ylMap.keys()).some((k: any) => sameArea(k, areaKey))) {
        const cleanName = cleanYlNameLocal(t.nama || "");
        ylMap.set(areaKey, { area: areaKey, nama: cleanName });
      }
    });

    const yls = Array.from(ylMap.values()).sort((a, b) => a.area.localeCompare(b.area, undefined, { numeric: true }));

    const ylData = yls.map(yl => {
      const cleanTargetName = cleanYlNameLocal(yl.nama).toLowerCase();
      // Filter SEMUA transaksi milik area ini (baik yang memakai nama murni maupun prefix "201 - ...")
      const myTxs = txs.filter((t: any) => {
        const tArea = String(t.area || "").trim();
        const tNama = String(t.nama || "").trim();
        const cleanTNama = cleanYlNameLocal(tNama).toLowerCase();

        if (tArea && tArea === yl.area) return true;
        if (tNama.startsWith(yl.area)) return true;
        if (cleanTargetName && cleanTNama === cleanTargetName) return true;
        return false;
      });

      const data = {
        rmh_yo: 0, rmh_om: 0, rmh_os: 0, rmh_yt: 0,
        psr_yo: 0, psr_om: 0, psr_os: 0, psr_yt: 0,
        skh_yo: 0, skh_om: 0, skh_os: 0, skh_yt: 0,
        ktr_yo: 0, ktr_om: 0, ktr_os: 0, ktr_yt: 0,
        tk_yo: 0, tk_om: 0, tk_os: 0, tk_yt: 0,
        ib_yo: 0, ib_om: 0, ib_os: 0, ib_yt: 0,
        f_plg: 0, f_rb: 0, pb: 0
      };

      myTxs.forEach((t: any) => {
        data.rmh_yo += Number(t.rmh_yo) || 0; data.rmh_om += Number(t.rmh_om) || 0; data.rmh_os += Number(t.rmh_os) || 0; data.rmh_yt += Number(t.rmh_yt) || 0;
        data.psr_yo += Number(t.psr_yo) || 0; data.psr_om += Number(t.psr_om) || 0; data.psr_os += Number(t.psr_os) || 0; data.psr_yt += Number(t.psr_yt) || 0;
        data.skh_yo += Number(t.skh_yo) || 0; data.skh_om += Number(t.skh_om) || 0; data.skh_os += Number(t.skh_os) || 0; data.skh_yt += Number(t.skh_yt) || 0;
        data.ktr_yo += Number(t.ktr_yo) || 0; data.ktr_om += Number(t.ktr_om) || 0; data.ktr_os += Number(t.ktr_os) || 0; data.ktr_yt += Number(t.ktr_yt) || 0;
        data.tk_yo += Number(t.tk_yo) || 0; data.tk_om += Number(t.tk_om) || 0; data.tk_os += Number(t.tk_os) || 0; data.tk_yt += Number(t.tk_yt) || 0;
        data.ib_yo += Number(t.ib_yo) || 0; data.ib_om += Number(t.ib_om) || 0; data.ib_os += Number(t.ib_os) || 0; data.ib_yt += Number(t.ib_yt) || 0;
        data.f_rb += Number(t.f_rb) || 0;
        data.pb += (Number(t.pb_p) || 0) + (Number(t.pb_s) || 0);
      });

      const myTxsSorted = [...myTxs].sort((a: any, b: any) => (a.tanggal || "").localeCompare(b.tanggal || ""));
      const last3Txs = myTxsSorted.slice(-3);
      data.f_plg = last3Txs.reduce((sum: number, t: any) => sum + (Number(t.f_plg) || 0), 0);

      let skhT = 0, skhTm = 0, ktrT = 0, ktrTm = 0, tkoT = 0, tkoTm = 0;
      if (potensiTembusData) {
        const monthData = potensiTembusData[selectedMonth] || potensiTembusData[Object.keys(potensiTembusData).sort().pop() || ""] || {};
        const cleanReq = cleanYlNameLocal(yl.nama).toLowerCase();
        const areaCode = yl.area;
        const matchKey = Object.keys(monthData).find(k => {
          const ck = cleanYlNameLocal(k).toLowerCase();
          return ck === cleanReq || k.startsWith(areaCode);
        });
        const p = monthData[yl.nama] || monthData[yl.area] || (matchKey ? monthData[matchKey] : null);
        if (p) {
          skhT = Number(p.skhTotal) || 0; skhTm = Number(p.skhTembus) || 0;
          ktrT = Number(p.kntrTotal) || 0; ktrTm = Number(p.kntrTembus) || 0;
          tkoT = Number(p.tkoTotal) || 0; tkoTm = Number(p.tkoTembus) || 0;
        } else if (db.plgPjlManual?.[yl.nama] || db.plgPjlManual?.[yl.area]) {
          const plg = db.plgPjlManual[yl.nama] || db.plgPjlManual[yl.area];
          skhT = Number(plg.skhTgt || plg.sklh_total) || 0;
          skhTm = Number(plg.skhTmbs || plg.sklh_tembus) || 0;
          ktrT = Number(plg.kntrTgt || plg.kntr_total) || 0;
          ktrTm = Number(plg.kntrTmbs || plg.kntr_tembus) || 0;
          tkoT = Number(plg.tkTgt || plg.tko_total) || 0;
          tkoTm = Number(plg.tkTmbs || plg.tko_tembus) || 0;
        }
      } else if (db.plgPjlManual?.[yl.nama] || db.plgPjlManual?.[yl.area]) {
        const plg = db.plgPjlManual[yl.nama] || db.plgPjlManual[yl.area];
        skhT = Number(plg.skhTgt || plg.sklh_total) || 0;
        skhTm = Number(plg.skhTmbs || plg.sklh_tembus) || 0;
        ktrT = Number(plg.kntrTgt || plg.kntr_total) || 0;
        ktrTm = Number(plg.kntrTmbs || plg.kntr_tembus) || 0;
        tkoT = Number(plg.tkTgt || plg.tko_total) || 0;
        tkoTm = Number(plg.tkTmbs || plg.tko_tembus) || 0;
      }
      
      const pembagiArea = pickByArea<any>(breakdownRealisasi, yl.area)?.pembagiTanggal || realisasiPembagi || 1;

      return { yl, data, potensi: { skhT, skhTm, ktrT, ktrTm, tkoT, tkoTm }, pembagi: Number(pembagiArea) || 1 };
    });

    // 2. Tambahkan Block TKU DP 1 (TOTAL TIM KESELURUHAN)
    const tkuData = {
      rmh_yo: 0, rmh_om: 0, rmh_os: 0, rmh_yt: 0,
      psr_yo: 0, psr_om: 0, psr_os: 0, psr_yt: 0,
      skh_yo: 0, skh_om: 0, skh_os: 0, skh_yt: 0,
      ktr_yo: 0, ktr_om: 0, ktr_os: 0, ktr_yt: 0,
      tk_yo: 0, tk_om: 0, tk_os: 0, tk_yt: 0,
      ib_yo: 0, ib_om: 0, ib_os: 0, ib_yt: 0,
      f_plg: 0, f_rb: 0, pb: 0
    };
    const tkuPotensi = { skhT: 0, skhTm: 0, ktrT: 0, ktrTm: 0, tkoT: 0, tkoTm: 0 };
    let sumPembagi = 0;

    ylData.forEach(yd => {
      Object.keys(tkuData).forEach(k => {
        (tkuData as any)[k] += (yd.data as any)[k] || 0;
      });
      tkuPotensi.skhT += yd.potensi.skhT;
      tkuPotensi.skhTm += yd.potensi.skhTm;
      tkuPotensi.ktrT += yd.potensi.ktrT;
      tkuPotensi.ktrTm += yd.potensi.ktrTm;
      tkuPotensi.tkoT += yd.potensi.tkoT;
      tkuPotensi.tkoTm += yd.potensi.tkoTm;
      sumPembagi += yd.pembagi;
    });

    const avgPembagi = ylData.length > 0 ? (sumPembagi / ylData.length) : (Number(realisasiPembagi) || 1);
    const tkuItem = {
      yl: { area: "TKU DP 1", nama: "TOTAL TIM" },
      data: tkuData,
      potensi: tkuPotensi,
      pembagi: avgPembagi
    };

    const allBlocksToExport = [ ...ylData, tkuItem ];

    const buildBlock = (ylItem: any) => {
      const b: any[][] = [];
      b.push([ `${ylItem.yl.area}   ${ylItem.yl.nama}`, "AKM", "", "RATA RATA", "", "PERSEN", "" ]);
      const d = ylItem.data;
      const sectors = [
        { label: "RUMAH", keys: ["rmh_yo", "rmh_om", "rmh_os", "rmh_yt"] as const },
        { label: "PASAR", keys: ["psr_yo", "psr_om", "psr_os", "psr_yt"] as const },
        { label: "SEKOLAH", keys: ["skh_yo", "skh_om", "skh_os", "skh_yt"] as const },
        { label: "KANTOR", keys: ["ktr_yo", "ktr_om", "ktr_os", "ktr_yt"] as const },
        { label: "TOKO", keys: ["tk_yo", "tk_om", "tk_os", "tk_yt"] as const },
        { label: "IB", keys: ["ib_yo", "ib_om", "ib_os", "ib_yt"] as const }
      ];

      const totProd = {
        yo: sectors.reduce((sum, s) => sum + (d[s.keys[0]] || 0), 0),
        om: sectors.reduce((sum, s) => sum + (d[s.keys[1]] || 0), 0),
        os: sectors.reduce((sum, s) => sum + (d[s.keys[2]] || 0), 0),
        yt: sectors.reduce((sum, s) => sum + (d[s.keys[3]] || 0), 0),
      };
      const grandTotal = totProd.yo + totProd.om + totProd.os + totProd.yt;
      const fmtP = (num: number, den: number) => den ? `${((num/den)*100).toFixed(2).replace('.',',')}%` : "0,00%";
      const fmtN = (num: number) => num ? Number(num.toFixed(2)) : 0;
      const pembagi = ylItem.pembagi > 0 ? ylItem.pembagi : 1;

      sectors.forEach(sec => {
        const sYo = d[sec.keys[0]] || 0, sOm = d[sec.keys[1]] || 0, sOs = d[sec.keys[2]] || 0, sYt = d[sec.keys[3]] || 0;
        const subTotal = sYo + sOm + sOs + sYt;
        
        b.push([ `${sec.label} YO`, sYo || 0, "", fmtN(sYo/pembagi), "", fmtP(sYo, totProd.yo), "" ]);
        b.push([ `${sec.label} OM`, sOm || 0, "", fmtN(sOm/pembagi), "", fmtP(sOm, totProd.om), "" ]);
        b.push([ `${sec.label} OS`, sOs || 0, "", fmtN(sOs/pembagi), "", fmtP(sOs, totProd.os), "" ]);
        b.push([ `${sec.label} YT`, sYt || 0, subTotal || 0, fmtN(sYt/pembagi), fmtN(subTotal/pembagi), fmtP(sYt, totProd.yt), fmtP(subTotal, grandTotal) ]);
      });

      b.push([ "", totProd.yo || 0, "", fmtN(totProd.yo/pembagi), "", fmtP(totProd.yo, totProd.yo), "" ]);
      b.push([ "", totProd.om || 0, "", fmtN(totProd.om/pembagi), "", fmtP(totProd.om, totProd.om), "" ]);
      b.push([ "", totProd.os || 0, "", fmtN(totProd.os/pembagi), "", fmtP(totProd.os, totProd.os), "" ]);
      b.push([ "total", totProd.yt || 0, grandTotal || 0, fmtN(totProd.yt/pembagi), fmtN(grandTotal/pembagi), fmtP(totProd.yt, totProd.yt), fmtP(grandTotal, grandTotal) ]);

      b.push([ "JLM PLG", d.f_plg || 0, "", "", "", "", "" ]);
      b.push([ "PLG RUTIN", "", "0,00%", "", "", "", "" ]);
      b.push([ "RB", d.f_rb || 0, "", "", "", "", "" ]);
      b.push([ "PB", d.pb || 0, "", "", "", "", "" ]);
      b.push([ "TTL SKLH/TMBS", `${ylItem.potensi.skhT}/${ylItem.potensi.skhTm}`, "", "", "", "", "" ]);
      b.push([ "TTL KNTR/TMBS", `${ylItem.potensi.ktrT}/${ylItem.potensi.ktrTm}`, "", "", "", "", "" ]);
      b.push([ "TTL TKO/TMBS", `${ylItem.potensi.tkoT}/${ylItem.potensi.tkoTm}`, "", "", "", "", "" ]);

      return b;
    };

    for (let i = 0; i < allBlocksToExport.length; i += 2) {
      const block1 = buildBlock(allBlocksToExport[i]);
      const block2 = (i + 1 < allBlocksToExport.length) ? buildBlock(allBlocksToExport[i+1]) : null;

      for (let r = 0; r < 35; r++) {
        const row = [""]; // Col A
        if (block1 && block1[r]) {
          row.push(...block1[r]);
        } else {
          row.push("", "", "", "", "", "", "");
        }
        row.push(""); // Col I (Separator)

        if (block2 && block2[r]) {
          row.push(...block2[r]);
        } else {
          row.push("", "", "", "", "", "", "");
        }
        aoa.push(row);
      }
      aoa.push([]);
      aoa.push([]);
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    // Sheet name strictly requested by user: plg pjl(laporan Dp 1)
    XLSX.utils.book_append_sheet(wb, ws, "plg pjl(laporan Dp 1)");

    // Send file
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const downloadFilename = `Laporan_PLG_PJL_DP1_${selectedMonth}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${downloadFilename}"`);
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
    res.send(buffer);
  } catch (error: any) {
    console.error("Export error:", error);
    res.status(500).json({ error: "Failed to export data" });
  }
};

// ---- Unduhan sementara untuk Android WebView ----
// WebView tidak bisa mengunduh blob:/data: URL. Klien menitipkan file ke sini,
// lalu mengunduhnya lewat URL http biasa (Content-Disposition: attachment)
// yang bisa ditangani DownloadListener aplikasi Android.
const tempDownloads = new Map<string, { buf: Buffer; filename: string; mime: string; exp: number }>();
const TEMP_DL_TTL_MS = 5 * 60 * 1000;
const sweepTempDownloads = () => {
  const now = Date.now();
  for (const [k, v] of tempDownloads) if (v.exp < now) tempDownloads.delete(k);
};

app.post("/api/tempDownload", (req, res) => {
  try {
    sweepTempDownloads();
    const { filename, mimeType, base64 } = req.body || {};
    if (!filename || !base64) return res.status(400).json({ ok: false, error: "filename & base64 wajib" });
    if (tempDownloads.size >= 50) return res.status(429).json({ ok: false, error: "Terlalu banyak unduhan tertunda" });
    const buf = Buffer.from(String(base64), "base64");
    const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
    tempDownloads.set(token, {
      buf,
      filename: String(filename).replace(/[\\/:*?"<>|\r\n]+/g, "_"),
      mime: String(mimeType || "application/octet-stream"),
      exp: Date.now() + TEMP_DL_TTL_MS
    });
    res.json({ ok: true, url: `/api/tempDownload/${token}` });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || "Gagal menyiapkan unduhan" });
  }
});

app.get("/api/tempDownload/:token", (req, res) => {
  sweepTempDownloads();
  const item = tempDownloads.get(req.params.token);
  if (!item) return res.status(404).send("Tautan unduhan sudah kedaluwarsa. Silakan ulangi dari aplikasi.");
  res.setHeader("Content-Type", item.mime);
  res.setHeader("Content-Length", String(item.buf.length));
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${item.filename.replace(/[^\x20-\x7E]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(item.filename)}`
  );
  res.setHeader("Cache-Control", "no-store");
  res.send(item.buf);
});

app.get("/api/exportRealisasi", handleExportRealisasi);
app.post("/api/exportRealisasi", handleExportRealisasi);

app.post("/api/savePlgPjlManual", async (req, res) => {
  const { area, sklh_total, sklh_tembus, kntr_total, kntr_tembus, tko_total, tko_tembus } = req.body;
  if (!area) return res.status(400).json({ ok: false, error: "Area wajib diisi" });

  const db = loadData();
  if (!db.plgPjlManual) db.plgPjlManual = {};

  db.plgPjlManual[area] = {
    sklh_total: Number(sklh_total || 0),
    sklh_tembus: Number(sklh_tembus || 0),
    kntr_total: Number(kntr_total || 0),
    kntr_tembus: Number(kntr_tembus || 0),
    tko_total: Number(tko_total || 0),
    tko_tembus: Number(tko_tembus || 0)
  };

  await saveData(db);
  res.json({ ok: true, plgPjlManual: db.plgPjlManual });
});

app.post("/api/kirimPlgPjlKeSpreadsheet", async (req, res) => {
  try {
    const { bulan, data } = req.body;
    const db = loadData();
    if (!db.plgPjlSpreadsheetData) db.plgPjlSpreadsheetData = {};
    if (bulan) {
      db.plgPjlSpreadsheetData[bulan] = data;
    }
    await saveData(db);
    res.json({ ok: true, message: "Data Pelanggan & Penjualan berhasil dikirim dan disimpan." });
  } catch (err: any) {
    console.error("Error in kirimPlgPjlKeSpreadsheet:", err);
    res.status(500).json({ ok: false, error: err?.message || "Gagal menyimpan data ke spreadsheet." });
  }
});

// 7. General DP1 Target loading
app.get("/api/getTarget", async (req, res) => {
  const db = loadData();
  const currentMonth = (req.query.month as string) || new Date().toISOString().substring(0, 7);
  const perArea: any = {};
  const total = {
    target: { YO: 0, OM: 0, OS: 0, YT: 0, ALL: 0 },
    bulanLalu: { YO: 0, OM: 0, OS: 0, YT: 0, ALL: 0 },
    tahunLalu: { YO: 0, OM: 0, OS: 0, YT: 0, ALL: 0 }
  };

  const ylList = db.ylList || INITIAL_YL_LIST;
  const names = Object.values(db.ylPins || INITIAL_DATA.ylPins) as string[];
  names.forEach(name => {
    const ylItem = ylList.find((y: any) => y.nama === name);
    let area = ylItem ? ylItem.area : "";
    if (!area) {
      area = areaPrefix(name);
    }
    const tgtObj = getTargetYL(db.targetYL, area, currentMonth) || { target: 0, bln_lalu: 0, thn_lalu: 0, e6: 0 };
    perArea[area] = {
      target: { YO: Math.floor(tgtObj.target * 0.9), OM: Math.floor(tgtObj.target * 0.05), OS: Math.floor(tgtObj.target * 0.03), YT: Math.floor(tgtObj.target * 0.02), ALL: tgtObj.target },
      bulanLalu: { YO: Math.floor(tgtObj.bln_lalu * 0.9), OM: Math.floor(tgtObj.bln_lalu * 0.05), OS: Math.floor(tgtObj.bln_lalu * 0.03), YT: Math.floor(tgtObj.bln_lalu * 0.02), ALL: tgtObj.bln_lalu },
      tahunLalu: { YO: Math.floor(tgtObj.thn_lalu * 0.9), OM: Math.floor(tgtObj.thn_lalu * 0.05), OS: Math.floor(tgtObj.thn_lalu * 0.03), YT: Math.floor(tgtObj.thn_lalu * 0.02), ALL: tgtObj.thn_lalu }
    };
  });

  Object.values(perArea).forEach((a: any) => {
    ['target', 'bulanLalu', 'tahunLalu'].forEach(k => {
      ['YO', 'OM', 'OS', 'YT', 'ALL'].forEach(p => {
        (total as any)[k][p] += a[k][p];
      });
    });
  });

  res.json({ perArea, total });
});

// 8. General Dashboard DP1 (Main statistics card source)
app.get("/api/getDataVersion", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ v: `${DATA_BOOT_ID}-${dataVersion}` });
});

app.get("/api/getDashboardDP1", async (req, res) => {
  const { month } = req.query;
  const db = loadData();
  res.json(getCachedDashboardDP1(db, month as string | undefined));
});

// 9. Gemini AI Evaluation - Deeper, structured and highly Jember 1 specific
app.post("/api/gemini/evaluate", async (req, res) => {
  const { data } = req.body;
  if (!process.env.GEMINI_API_KEY) {
    return res.json({
      insight: "<b>Mode Demo:</b> Kunci API Gemini tidak terkonfigurasi di server. Silakan hubungi admin untuk menyetel GEMINI_API_KEY di panel Secrets agar mendapatkan analisis berbasis AI yang mendalam."
    });
  }

  const prompt = `
Anda adalah konsultan bisnis senior khusus manajemen sales Yakult Lady (YL) Unit DP Jember 1.

PENTING UNTUK DIPAHAMI TERKAIT METRIK:
- "BB" atau "Balik Botol" adalah sisa botol/produk yang tidak terjual di lapangan dan harus dikembalikan (retur).
- Semakin TINGGI nilai BB, artinya semakin BURUK/NEGATIF kinerjanya (karena botol tidak laku).
- Nilai BB yang KECIL atau 0 adalah indikator KINERJA SANGAT BAGUS/POSITIF.
- Tolong pastikan analisis Anda menyoroti BB yang tinggi sebagai masalah (kerugian) dan BB yang rendah sebagai prestasi.

Berikut adalah data kinerja harian tim YL saat ini:
${JSON.stringify(data)}

Berdasarkan data di atas, tolong berikan analisis performa yang SANGAT mendalam, komprehensif, dan taktis dalam Bahasa Indonesia. Format dalam HTML bersih (gunakan tag seperti <p>, <b>, <ul>, <li>, <strong>, dll) dengan struktur sebagai berikut:

1. <b>🚨 HIGHLIGHT OPERASIONAL UTAMA:</b> Ringkasan singkat performa tim hari ini, termasuk pencapaian target kumulatif dan metrik penting lainnya.
2. <b>🏆 ANALISIS PERFORMA TERBAIK (SQUAD JUARA):</b> YL dengan kinerja terbaik dari segi penjualan, pertumbuhan, propaganda, atau rasio kunjungan. Berikan apresiasi spesifik.
3. <b>⚠️ AREA PERBAIKAN & NEGATIF HIGHLIGHTS:</b> Identifikasi YL yang memerlukan perhatian khusus (misalnya tingkat Balik Botol / BB yang tinggi, atau rasio kunjungan yang rendah). Berikan saran taktis perbaikan rute.
4. <b>💡 REKOMENDASI STRATEGIS & RENCANA AKSI:</b> Rekomendasi konkret untuk Manager DP Jember 1 guna meningkatkan efisiensi operasional tim di lapangan esok hari.
`;

  try {
    const text = await generateGeminiWithRetry({
      contents: prompt,
      temperature: 0.7
    });
    res.json({ insight: text || "Tidak ada analisis yang dihasilkan." });
  } catch (e: any) {
    console.warn("Gemini Evaluate Error, returning structured rule-based evaluation:", e?.message || e);
    const dataRows = data?.dataRows || [];
    let topPerformers: string[] = [];
    let highBb: string[] = [];

    dataRows.forEach((r: any) => {
      const area = String(r[0] || "");
      const nama = String(r[1] || "");
      const sales = Number(r[7]) || 0;
      const bb = Number(r[10]) || 0;
      if (sales >= 250) topPerformers.push(`Area ${area} (${nama}): ${sales} botol/hari`);
      if (bb > 10) highBb.push(`Area ${area} (${nama}): BB ${bb} botol`);
    });

    const fallbackHtml = `
    <div class="space-y-3">
      <p><b>🚨 HIGHLIGHT OPERASIONAL UTAMA:</b> Hasil evaluasi tim DP Jember 1 berdasarkan kalkulasi data transaksi realisasi terkini.</p>
      <p><b>🏆 ANALISIS PERFORMA TERBAIK (SQUAD JUARA):</b></p>
      <ul>
        ${topPerformers.length > 0 ? topPerformers.map(t => `<li><b>${t}</b> - Memenuhi standar penjualan minimal (>=250 botol/hari).</li>`).join('') : '<li>Belum ada YL yang menembus 250 botol/hari hari ini. Perlu dorongan pendampingan rute ekstra.</li>'}
      </ul>
      <p><b>⚠️ AREA PERBAIKAN & BALIK BOTOL (BB):</b></p>
      <ul>
        ${highBb.length > 0 ? highBb.map(h => `<li><b>${h}</b> - Perlu evaluasi alokasi PDM dan penataan rute toko agar tidak retur.</li>`).join('') : '<li>Tingkat Balik Botol (BB) seluruh tim terpantau dalam kondisi aman (<10 botol). Performa baik!</li>'}
      </ul>
      <p><b>💡 REKOMENDASI STRATEGIS MANAGER:</b> Evaluasi rute harian untuk area dengan penjualan di bawah 250 dan pastikan pendataan propaganda berjalan aktif esok hari.</p>
      <p class="text-xs text-slate-500 italic mt-2">*Catatan: Analisis ini dihasilkan secara otomatis dari sistem rule-based saat kuota jaringan AI Gemini sedang menyesuaikan.</p>
    </div>
    `;
    res.json({ insight: fallbackHtml });
  }
});

// 9b. Gemini AI Evaluation for specific Yakult Lady (Ibu-ibu Style)
app.post("/api/gemini/evaluate-yl", async (req, res) => {
  const { area, data } = req.body;
  const ylNama = data.nama || area;
  const avgSales = Math.trunc(data.rata2 || 0);
  const targetVal = data.targetYL || 0;
  const bbVal = data.bbYL || 0;

  if (!process.env.GEMINI_API_KEY) {
    return res.json({
      insight: `<p class="mb-3"><b>Assalamu'alaikum Ibu ${ylNama} sayang! ❤️</b></p>
<p class="mb-3">Alhamdulillah, capaian rata-rata harian Ibu bulan ini tercatat <b>${avgSales} botol/hari</b> dari target harian <b>${targetVal} botol</b>, dengan Balik Botol <b>${bbVal} botol</b>.</p>
<p class="mb-3">Ibu tahu betapa kerasnya perjuangan Ibu di rute harian. Jaga selalu kesehatan dan senyuman ramah untuk para pelanggan nggih Bu! 🌸</p>
<p><b>Pesan Hari Ini:</b> Fokus sapa pelanggan setia dan rapikan stok harian agar makin lancar. Semangat selalu Ibu sayang! ✨</p>`
    });
  }

  const prompt = `Anda adalah "Ibu AI", pendamping & supervisor senior yang sangat ramah, hangat, penuh perhatian, dan keibuan untuk Yakult Lady DP Jember 1.
Berikan analisis dan motivasi SINGKAT, PADAT, dan SIMPEL untuk Ibu ${ylNama} (Area ${area}) berdasarkan data bulan ini:

Data Kinerja:
- Nama: ${ylNama}
- Akumulasi Penjualan: ${data.akumulasi || 0} botol
- Rata-Rata Harian: ${avgSales} botol/hari (Target harian: ${targetVal} botol)
- Capaian vs Target: ${Math.trunc(((data.rata2 || 0) / (data.targetYL || 1)) * 100)}%
- Total Balik Botol (BB): ${bbVal} botol
- Total Propaganda Baru (PB): ${data.totalPb || 0} PB (${data.pbPersen || 0}%)

ATURAN PENTING:
1. Buat kalimat yang SANGAT SIMPEL, SINGKAT, dan LANGSUNG KE INTI (Maksimal 3-4 paragraf pendek/poin).
2. Gunakan gaya bahasa keibuan yang sangat hangat, manis, dan menyemangati (seperti: "Ibu ${ylNama} sayang", "Ibu tahu betapa hebatnya Ibu", "Tetap semangat nggih Bu").
3. Jangan pakai istilah teknis yang rumit. Gunakan bahasa sehari-hari yang sangat mudah dipahami ibu-ibu Yakult Lady yang sudah sepuh/tua.
4. Format dalam HTML bersih (<p>, <b>, <ul>, <li>) dengan emoji yang hangat.
5. PENGERTIAN BB (Balik Botol): BB adalah botol sisa yang tidak laku terjual. Nilai BB yang BESAR itu SANGAT JELEK/MERUGIKAN (berikan saran lembut untuk menghabiskan stok), sedangkan BB yang KECIL atau NOL itu SANGAT BAGUS (berikan pujian). JANGAN PERNAH memuji jika BB-nya tinggi!`;

  try {
    const text = await generateGeminiWithRetry({
      contents: prompt,
      temperature: 0.7
    });
    res.json({ insight: text || "Tidak ada analisis yang dihasilkan." });
  } catch (e: any) {
    console.error("Gemini YL Error:", e);
    res.json({
      insight: `<p class="mb-2"><b>Assalamu'alaikum Ibu ${ylNama} sayang! ❤️</b></p>
<p class="mb-2">Capaian rata-rata harian Ibu saat ini <b>${avgSales} botol/hari</b> (Target: <b>${targetVal} botol</b>) dan Balik Botol <b>${bbVal} botol</b>.</p>
<p>Tetap semangat nggih Bu! Jaga kesehatan di rute jalan harian Ibu. Ibu pasti bisa! 🌸✨</p>`
    });
  }
});

// 10. Reset Data to defaults
app.post("/api/resetData", async (req, res) => {
  res.status(403).json({ error: "Fitur reset global dinonaktifkan demi keamanan data." });
});

// Reset Data Khusus (4 Kategori)
app.post("/api/resetDataTargeted", async (req, res) => {
  try {
    const { scope, currentMonth } = req.body;
    // FIX: sebelumnya pakai loadData() yang mengembalikan cachedDb di MEMORI
    // instance ini saja. Kalau Cloud Run sedang menjalankan lebih dari satu
    // instance (jamak terjadi karena banyak YL + manager akses bersamaan),
    // instance lain yang melayani permintaan berikutnya masih punya cachedDb
    // versi LAMA di memorinya sendiri dan akan terus menampilkan/menimpa data
    // lama itu — sehingga reset terlihat "tidak berhasil". Di sini kita paksa
    // ambil data PALING BARU langsung dari Supabase (bukan cache lokal
    // instance ini) sebagai dasar sebelum menghapus, supaya hasil hapusnya
    // benar-benar berdasar kondisi terkini, bukan salinan basi.
    const existingPhotos = cachedDb?.ylPhotos || {};
    const existingSeragam = cachedDb?.seragam || { images: {}, schedules: {} };
    const existingMotivasi = cachedDb?.motivasi;

    let db = await loadDataFromSupabase();
    if (!db) db = loadData(); // fallback kalau Supabase belum aktif / gagal dibaca
    db = normalizeDb(db);

    // Pastikan aset media (foto, seragam, motivasi) TIDAK terhapus saat reset penjualan
    if (Object.keys(existingPhotos).length > 0) db.ylPhotos = existingPhotos;
    if (existingSeragam) db.seragam = existingSeragam;
    if (existingMotivasi) db.motivasi = existingMotivasi;

    const activeMonth = currentMonth || new Date().toISOString().substring(0, 7);

    if (scope === "all") {
      db.plgPjlManual = {};
      db.potensiTembus = {};
      db.transactions = [];
      db.breakdownRealisasi = {};
      db.breakdownPlan = {};
      db.lhppRealisasi = {};
      db.targetTKU = { target: 0, bln_lalu: 0, thn_lalu: 0, target_yo: 0, target_om: 0, target_os: 0, target_yt: 0, bln_lalu_yo: 0, bln_lalu_om: 0, bln_lalu_os: 0, bln_lalu_yt: 0, thn_lalu_yo: 0, thn_lalu_om: 0, thn_lalu_os: 0, thn_lalu_yt: 0 };
      db.targetYL = {};
      if (db.settingTargets) db.settingTargets = {};
    } else if (scope === "current_month" && activeMonth) {
      if (db.plgPjlManual) delete db.plgPjlManual[activeMonth];
      if (db.potensiTembus) delete db.potensiTembus[activeMonth];
      if (db.transactions) {
        db.transactions = db.transactions.filter((t: any) => !(t.tanggal && t.tanggal.startsWith(activeMonth)));
      }
      if (db.breakdownRealisasi) delete db.breakdownRealisasi[activeMonth];
      if (db.breakdownPlan) delete db.breakdownPlan[activeMonth];
      if (db.lhppRealisasi) {
        Object.keys(db.lhppRealisasi).forEach(date => {
          if (date.startsWith(activeMonth)) delete db.lhppRealisasi[date];
        });
      }
      db.targetTKU = { target: 0, bln_lalu: 0, thn_lalu: 0, target_yo: 0, target_om: 0, target_os: 0, target_yt: 0, bln_lalu_yo: 0, bln_lalu_om: 0, bln_lalu_os: 0, bln_lalu_yt: 0, thn_lalu_yo: 0, thn_lalu_om: 0, thn_lalu_os: 0, thn_lalu_yt: 0 };
      if (db.targetYL) {
        Object.keys(db.targetYL).forEach(key => {
          if (key.endsWith(activeMonth) || key.includes(activeMonth)) delete db.targetYL[key];
        });
      }
      if (db.targetTKUByMonth) delete db.targetTKUByMonth[activeMonth];
      if (db.targetYLByMonth) delete db.targetYLByMonth[activeMonth];
      if (db.settingTargets) delete db.settingTargets[activeMonth];
    } else {
      return res.status(400).json({ error: "Parameter tidak valid." });
    }

    await saveData(db);
    return res.json({ ok: true, message: `Data PLG & PJL, Input PJL, BD & Realisasi, dan Target (${scope === "all" ? "SEMUA RIWAYAT" : "BULAN " + activeMonth}) berhasil dihapus.` });
  } catch (err: any) {
    console.error("Error in resetDataTargeted:", err);
    return res.status(500).json({ error: "Gagal menghapus data: " + err.message });
  }
});


// Official Links API
app.get("/api/getOfficialLinks", async (req, res) => {
  const db = loadData();
  res.json({ links: db.officialLinks || [] });
});

app.post("/api/saveOfficialLinks", async (req, res) => {
  try {
    const { links } = req.body;
    const db = loadData();
    db.officialLinks = links;
    await saveData(db);
    res.json({ ok: true, message: "Tautan berhasil disimpan." });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// API 404 Fallback - Ensure non-existent /api routes return JSON, not HTML
app.all("/api/*", (req, res) => {
  res.status(404).json({ error: `API endpoint ${req.originalUrl} not found` });
});

// Express Global Error Handler for /api routes
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Global Server Error:", err);
  if (req.path.startsWith("/api")) {
    return res.status(500).json({ error: err?.message || "Internal server error" });
  }
  next(err);
});

// VITE MIDDLEWARE FOR DEVELOPMENT / STATIC SERVING FOR PRODUCTION
async function startServer() {
  const distPath = path.join(process.cwd(), "dist");
  const distIndexHtml = path.join(distPath, "index.html");

  const hasDist = fs.existsSync(distIndexHtml);
  // Ensure data store is initialized immediately in memory so server and API routes respond instantly
  if (!cachedDb) {
    cachedDb = buildDbFromLocal();
  }

  app.use(express.static(path.join(process.cwd(), "public"), { maxAge: "1h" }));

  if (isProduction) {
    if (hasDist) {
      app.use(
        express.static(distPath, {
          maxAge: "1d",
          setHeaders(res, filePath) {
            if (filePath.includes("/assets/")) {
              // File ber-hash: aman di-cache lama, karena nama berubah tiap build.
              res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
            } else if (filePath.endsWith(".html")) {
              // index.html JANGAN di-cache: ia yang menunjuk ke file JS/CSS versi terbaru.
              // Tanpa ini WebView/HP memakai index.html lama sampai cache dihapus manual.
              res.setHeader("Cache-Control", "no-cache, must-revalidate");
            }
          },
        })
      );
    }
    app.get("*", (_req, res) => {
      if (hasDist && fs.existsSync(distIndexHtml)) {
        res.setHeader("Cache-Control", "no-cache");
        res.sendFile(distIndexHtml);
      } else {
        res.status(200).send("App is running");
      }
    });
  } else {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running in ${isProduction ? "production" : "development"} mode on http://0.0.0.0:${PORT}`);
  });

  // Load remote data from Supabase in background without blocking server listen or Cloud Run health checks
  ensureDbReady().catch((err) => {
    console.warn("[startServer] Non-blocking ensureDbReady sync error:", err);
  });
}

export { app, loadData, ensureDbReady };

startServer();
