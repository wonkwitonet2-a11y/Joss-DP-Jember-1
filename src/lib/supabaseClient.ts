import { createClient, SupabaseClient } from '@supabase/supabase-js';

export function formatSupabaseUrl(rawUrl: string): string {
  let url = (rawUrl || "").trim();
  if (!url) return "";
  if (!/^https?:\/\//i.test(url)) {
    url = "https://" + url;
  }
  return url;
}

export function isValidHttpUrl(urlString: string): boolean {
  if (!urlString) return false;
  try {
    const parsed = new URL(urlString);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

// Retrieve credentials from environment or localStorage
export function getSupabaseCredentials(): { url: string; key: string } {
  const metaEnv = (import.meta as any).env || {};
  const procEnv = (typeof process !== "undefined" && process.env) || {};

  const envUrl = (metaEnv.VITE_SUPABASE_URL || procEnv.SUPABASE_URL || "").trim();
  const envKey = (metaEnv.VITE_SUPABASE_ANON_KEY || procEnv.SUPABASE_ANON_KEY || "").trim();

  const localUrl = (typeof localStorage !== "undefined" ? localStorage.getItem("supabase_url") || "" : "").trim();
  const localKey = (typeof localStorage !== "undefined" ? localStorage.getItem("supabase_key") || "" : "").trim();

  const rawUrl = localUrl || envUrl;
  const url = formatSupabaseUrl(rawUrl);
  const key = localKey || envKey;

  return { url, key };
}

// Info diagnostik ringkas: dari mana credential Supabase yang dipakai browser
// ini SEBENARNYA berasal, dan project mana yang dituju (host saja, bukan full
// key demi keamanan). Dipakai untuk membandingkan "device A vs device B"
// tanpa perlu buka DevTools — cukup baca badge kecil di layar.
export function getSupabaseDebugInfo(): { source: "localStorage" | "env" | "none"; host: string; hasKey: boolean } {
  const metaEnv = (import.meta as any).env || {};
  const procEnv = (typeof process !== "undefined" && process.env) || {};
  const localUrl = (typeof localStorage !== "undefined" ? localStorage.getItem("supabase_url") || "" : "").trim();
  const envUrl = (metaEnv.VITE_SUPABASE_URL || procEnv.SUPABASE_URL || "").trim();
  const { url, key } = getSupabaseCredentials();
  let host = "";
  try {
    host = url ? new URL(formatSupabaseUrl(url)).hostname : "(kosong)";
  } catch {
    host = "(url tidak valid)";
  }
  const source = localUrl ? "localStorage" : envUrl ? "env" : "none";
  return { source, host, hasKey: !!key };
}

let supabaseInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  const { url, key } = getSupabaseCredentials();
  if (!url || !key || !isValidHttpUrl(url)) return null;

  if (!supabaseInstance) {
    try {
      supabaseInstance = createClient(url, key);
    } catch (e) {
      console.error("Gagal inisialisasi Supabase client:", e);
      return null;
    }
  }
  return supabaseInstance;
}

// ---------------------------------------------------------------------------
// CACHE BACA (hemat egress Supabase utama)
// Browser membaca beberapa key langsung ke Supabase (arsip bulanan, rata-rata
// bulanan, Sales Record, target tahunan). Dulu setiap kali layar dibuka = unduh
// ulang isi baris yang sama. Sekarang hasil bacaan disimpan di memori tab:
//  - arsip bulan lalu (monthly_archive_*, rata2_bulanan_*, annual_target_*) = 1 jam
//  - key lain (mis. sales_record_tku_*)                                      = 2 menit
// Permintaan yang sama dan berbarengan digabung jadi satu. Setelah simpan/hapus
// dari aplikasi ini, cache key itu langsung diperbarui, jadi tidak basi.
// ---------------------------------------------------------------------------
const READ_TTL_ARCHIVE_MS = 60 * 60 * 1000;
const READ_TTL_DEFAULT_MS = 2 * 60 * 1000;
const READ_TTL_MISSING_MS = 30 * 1000;
const readCache = new Map<string, { at: number; ttl: number; value: any }>();
const readInflight = new Map<string, Promise<any>>();

function readTtlFor(key: string): number {
  return /^(monthly_archive_|rata2_bulanan_\d|annual_target_)/.test(key) ? READ_TTL_ARCHIVE_MS : READ_TTL_DEFAULT_MS;
}

function cloneValue<V>(v: V): V {
  if (v === null || v === undefined || typeof v !== "object") return v;
  try {
    return typeof structuredClone === "function" ? structuredClone(v) : JSON.parse(JSON.stringify(v));
  } catch {
    return v;
  }
}

/** Buang cache baca untuk 1 key (atau semua key kalau tanpa argumen). */
export function invalidateSupabaseCache(key?: string) {
  if (key) {
    readCache.delete(key);
    readInflight.delete(key);
  } else {
    readCache.clear();
    readInflight.clear();
  }
}

// Reset instance if user updates settings in UI
export function resetSupabaseClient() {
  supabaseInstance = null;
  invalidateSupabaseCache();
}

/**
 * SQL DDL Query needed in Supabase SQL Editor:
 * 
 * CREATE TABLE IF NOT EXISTS app_store (
 *   key TEXT PRIMARY KEY,
 *   data JSONB NOT NULL,
 *   updated_at TIMESTAMPTZ DEFAULT NOW()
 * );
 * 
 * ALTER TABLE app_store ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "Allow public access" ON app_store FOR ALL USING (true) WITH CHECK (true);
 */

export async function testSupabaseConnection(): Promise<{ success: boolean; message: string }> {
  const { url, key } = getSupabaseCredentials();
  if (!url || !key) {
    return { success: false, message: "⚠️ URL dan Key Supabase belum diisi." };
  }
  if (!isValidHttpUrl(url)) {
    return { success: false, message: "❌ Format URL Supabase tidak valid. Harus diawali http:// atau https:// (contoh: https://xxxx.supabase.co)" };
  }

  const client = getSupabaseClient();
  if (!client) {
    return { success: false, message: "❌ Gagal inisialisasi Supabase client. Periksa URL dan Key." };
  }

  try {
    const { error } = await client
      .from('app_store')
      .upsert({ key: '_connection_test', data: { ping: "ok", time: new Date().toISOString() }, updated_at: new Date().toISOString() }, { onConflict: 'key' });

    if (error) {
      console.error("[Supabase] Error saving _connection_test:", JSON.stringify(error, null, 2), error);
      if (error.code === '42P01' || error.message?.includes('relation "public.app_store" does not exist') || error.message?.includes('does not exist')) {
        return { success: false, message: "⚠️ Tabel 'app_store' BELUM DIBUAT di Supabase SQL Editor! Jalankan kueri SQL di bawah ini dulu." };
      }
      if (error.code === 'PGRST301' || error.message?.includes('JWT') || error.message?.includes('API key')) {
        return { success: false, message: "❌ API Key Supabase tidak valid atau salah format." };
      }
      
      const errMsg = error.message || (error as any).error_description || "Network/CORS error or blocked by client";
      return { success: false, message: `❌ Supabase Error: ${errMsg} (Code: ${error.code || '0'}) - Cek koneksi internet/CORS.` };
    }
    return { success: true, message: "✅ KONEKSI SUPABASE BERHASIL! Database cloud aktif dan tabel 'app_store' terdeteksi." };
  } catch (e: any) {
    console.error("[Supabase] Exception saving _connection_test:", e);
    return { success: false, message: `❌ Exception: ${e.message || "Gagal menghubungkan ke Supabase."}` };
  }
}


// ---------------------------------------------------------------------------
// GAMBAR -> STORAGE MEDIA (akun Supabase kedua), BUKAN di tabel app_store
// Foto Presentasi (slide kustom, cover, Yakult Lady of the Month, dll) dulu
// disimpan sebagai teks base64 di dalam baris app_store. Sekarang setiap
// string "data:image/..." otomatis diunggah ke bucket Storage lewat server
// (/api/uploadMedia) dan yang disimpan di baris tabel hanya LINK pendeknya.
// - Hemat egress: baris tabel jadi sangat kecil, gambar dimuat dari CDN + cache.
// - Aman: kalau upload gagal, data base64 tetap dipakai (tidak ada foto hilang).
// - Baris lama yang masih base64 dipindahkan otomatis sekali saja saat dibaca.
// ---------------------------------------------------------------------------
const inlineUrlCache = new Map<string, string>();
const migratedKeys = new Set<string>();

function hashStr(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function slugPart(s: string, max = 60): string {
  return (String(s || "x").normalize("NFKD").replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, max)) || "x";
}

function isInlineImage(v: any): v is string {
  return typeof v === "string" && v.startsWith("data:image/");
}

function hasInlineImage(v: any, depth = 0): boolean {
  if (depth > 8) return false;
  if (isInlineImage(v)) return true;
  if (Array.isArray(v)) return v.some((x) => hasInlineImage(x, depth + 1));
  if (v && typeof v === "object") return Object.keys(v).some((k) => hasInlineImage(v[k], depth + 1));
  return false;
}

function hasStorageImageUrl(v: any, depth = 0): boolean {
  if (depth > 8) return false;
  if (typeof v === "string") return v.includes("/storage/v1/object/public/");
  if (Array.isArray(v)) return v.some((x) => hasStorageImageUrl(x, depth + 1));
  if (v && typeof v === "object") return Object.keys(v).some((k) => hasStorageImageUrl(v[k], depth + 1));
  return false;
}

// Hapus file foto di folder Storage milik 1 key presentasi (hanya folder key itu saja). Gagal = diabaikan.
async function deleteMediaFolderForKey(key: string): Promise<void> {
  if (!/^presentasi/.test(key)) return;
  try {
    const r = await fetch("/api/deleteMediaFolder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder: `presentasi/${slugPart(key, 80)}` }),
    });
    if (!r.ok) console.warn(`[Media] Hapus file Storage ${key} ditolak server (HTTP ${r.status})`);
  } catch (e) {
    console.warn(`[Media] Gagal menghapus file Storage untuk ${key}:`, e);
  }
}

async function uploadInlineImage(objectPath: string, dataUrl: string): Promise<string | null> {
  const ck = objectPath + "|" + dataUrl.length + "|" + hashStr(dataUrl);
  const hit = inlineUrlCache.get(ck);
  if (hit) return hit;
  try {
    const resp = await fetch("/api/uploadMedia", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: objectPath, dataUrl }),
    });
    if (!resp.ok) return null;
    const j = await resp.json();
    if (j && j.ok && typeof j.url === "string") {
      inlineUrlCache.set(ck, j.url);
      return j.url;
    }
  } catch (e) {
    console.warn("[Media] Upload gambar ke Storage gagal, pakai penyimpanan lama:", e);
  }
  return null;
}

/** Ganti semua data:image/... di dalam `data` dengan link Storage. Gagal = dibiarkan base64. */
export async function offloadImagesToMedia<T>(key: string, data: T): Promise<{ data: T; changed: boolean; failed: boolean }> {
  if (!hasInlineImage(data)) return { data, changed: false, failed: false };
  const folder = /^presentasi/.test(key) ? "presentasi" : "lainnya";
  const base = `${folder}/${slugPart(key, 80)}`;
  let changed = false;
  let failed = false;
  const walk = async (node: any, trail: string, depth: number): Promise<any> => {
    if (depth > 8) return node;
    if (isInlineImage(node)) {
      const url = await uploadInlineImage(`${base}/${slugPart(trail || "foto")}.jpg`, node);
      if (url) { changed = true; return url; }
      failed = true;
      return node;
    }
    if (Array.isArray(node)) {
      const out: any[] = [];
      for (let i = 0; i < node.length; i++) out.push(await walk(node[i], `${trail}_${i}`, depth + 1));
      return out;
    }
    if (node && typeof node === "object") {
      const out: any = {};
      for (const k of Object.keys(node)) out[k] = await walk(node[k], trail ? `${trail}_${k}` : k, depth + 1);
      return out;
    }
    return node;
  };
  const converted = await walk(data, "", 0);
  return { data: converted as T, changed, failed };
}

// Pindahkan baris lama yang masih base64 ke Storage (sekali per key per sesi).
function migrateInlineRow(key: string, value: any) {
  if (migratedKeys.has(key) || !hasInlineImage(value)) return;
  migratedKeys.add(key);
  (async () => {
    try {
      const r = await offloadImagesToMedia(key, value);
      // Tulis ulang hanya kalau SEMUA gambar berhasil pindah; kalau tidak, biarkan data lama.
      if (r.changed && !r.failed) await saveToSupabase(key, r.data);
    } catch (e) {
      console.warn(`[Media] Migrasi gambar ${key} ke Storage gagal:`, e);
    }
  })();
}

export async function saveToSupabase(key: string, rawData: any): Promise<{ success: boolean; error?: string; data?: any }> {
  const client = getSupabaseClient();
  if (!client) return { success: false, error: "Supabase client not initialized" };

  try {
    // Gambar base64 dipindah ke Storage media; yang masuk tabel hanya link-nya.
    let data = rawData;
    try {
      data = (await offloadImagesToMedia(key, rawData)).data;
    } catch (e) {
      console.warn("[Media] Offload gambar dilewati:", e);
      data = rawData;
    }
    const { error } = await client
      .from('app_store')
      .upsert({ key, data, updated_at: new Date().toISOString() }, { onConflict: 'key' });

    if (error) {
      console.error(`[Supabase] Error saving ${key}:`, error);
      return { success: false, error: error.message };
    }
    readCache.set(key, { at: Date.now(), ttl: readTtlFor(key), value: cloneValue(data) });
    // Foto dikosongkan lewat form edit (data tetap disimpan, tapi tanpa foto): hapus file lamanya di Storage.
    if (/^presentasi/.test(key) && !hasInlineImage(data) && !hasStorageImageUrl(data)) {
      await deleteMediaFolderForKey(key);
    }
    return { success: true, data };
  } catch (e: any) {
    console.error(`[Supabase] Exception saving ${key}:`, e);
    return { success: false, error: e.message };
  }
}

export async function loadFromSupabase<T>(key: string): Promise<T | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  const hit = readCache.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) return cloneValue(hit.value) as T | null;

  const pending = readInflight.get(key);
  if (pending) return cloneValue(await pending) as T | null;

  const task = (async (): Promise<T | null> => {
    try {
      const { data, error } = await client
        .from('app_store')
        .select('data')
        .eq('key', key)
        .maybeSingle();

      if (error) return null; // gagal baca: jangan di-cache, coba lagi lain kali
      if (!data) {
        readCache.set(key, { at: Date.now(), ttl: READ_TTL_MISSING_MS, value: null });
        return null;
      }
      readCache.set(key, { at: Date.now(), ttl: readTtlFor(key), value: data.data });
      migrateInlineRow(key, data.data);
      return data.data as T;
    } catch (e) {
      console.error(`[Supabase] Exception loading ${key}:`, e);
      return null;
    } finally {
      readInflight.delete(key);
    }
  })();
  readInflight.set(key, task);
  return cloneValue(await task) as T | null;
}

export async function deleteFromSupabase(key: string): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client) return { success: false, error: "Supabase client not initialized" };

  try {
    const { error } = await client
      .from('app_store')
      .delete()
      .eq('key', key);

    if (error) {
      console.error(`[Supabase] Error deleting ${key}:`, error);
      return { success: false, error: error.message };
    }
    readCache.set(key, { at: Date.now(), ttl: READ_TTL_MISSING_MS, value: null });
    // Foto presentasi: ikut hapus file di Storage (folder khusus key ini saja).
    await deleteMediaFolderForKey(key);
    return { success: true };
  } catch (e: any) {
    console.error(`[Supabase] Exception deleting ${key}:`, e);
    return { success: false, error: e.message };
  }
}
