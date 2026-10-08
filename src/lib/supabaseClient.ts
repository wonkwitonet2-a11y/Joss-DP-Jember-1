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

// Reset instance if user updates settings in UI
export function resetSupabaseClient() {
  supabaseInstance = null;
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

export async function saveToSupabase(key: string, data: any): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client) return { success: false, error: "Supabase client not initialized" };

  try {
    const { error } = await client
      .from('app_store')
      .upsert({ key, data, updated_at: new Date().toISOString() }, { onConflict: 'key' });

    if (error) {
      console.error(`[Supabase] Error saving ${key}:`, error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (e: any) {
    console.error(`[Supabase] Exception saving ${key}:`, e);
    return { success: false, error: e.message };
  }
}

export async function loadFromSupabase<T>(key: string): Promise<T | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from('app_store')
      .select('data')
      .eq('key', key)
      .maybeSingle();

    if (error || !data) {
      return null;
    }
    return data.data as T;
  } catch (e) {
    console.error(`[Supabase] Exception loading ${key}:`, e);
    return null;
  }
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
    return { success: true };
  } catch (e: any) {
    console.error(`[Supabase] Exception deleting ${key}:`, e);
    return { success: false, error: e.message };
  }
}
