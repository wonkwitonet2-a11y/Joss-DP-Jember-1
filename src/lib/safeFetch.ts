// Timeout default untuk semua request lewat safeFetchJson. Sebelumnya fetch()
// di sini tidak punya batas waktu sama sekali — kalau server menggantung
// (mis. lagi menunggu koneksi ke Supabase yang tidak bisa dihubungi), tombol
// yang memanggil ini (misalnya Simpan Target) akan muter-muter TANPA PERNAH
// berhenti, karena promise fetch-nya sendiri tidak pernah selesai. Dengan
// AbortController di sini, request dipaksa gagal (dan fungsi return null,
// ditangani seperti error biasa oleh pemanggil) dalam waktu maksimal 20 detik.
const DEFAULT_TIMEOUT_MS = 20000;

export async function safeFetchJson<T = any>(url: string, options?: RequestInit): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    if (typeof window !== 'undefined' && (window as any).__ARCHIVE_MOCK_HANDLER__) {
      const mockHandler = (window as any).__ARCHIVE_MOCK_HANDLER__;
      const mockResult = await mockHandler(url, options);
      if (mockResult !== undefined) {
         return mockResult as T;
      }
    }
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) {
      console.warn(`Fetch ${url} returned HTTP status ${res.status}`);
      return null;
    }
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      const text = await res.text();
      console.warn(`Fetch ${url} returned non-JSON content:`, text.substring(0, 100));
      return null;
    }
    return (await res.json()) as T;
  } catch (err: any) {
    if (err?.name === "AbortError") {
      console.warn(`SafeFetch timeout for ${url} (>${DEFAULT_TIMEOUT_MS}ms)`);
    } else {
      console.warn(`SafeFetch error for ${url}:`, err);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function parseJsonResponse<T = any>(res: Response): Promise<T | null> {
  try {
    if (!res) return null;
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      const text = await res.text();
      console.warn(`Response returned non-JSON content:`, text.substring(0, 100));
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`Failed to parse JSON response:`, err);
    return null;
  }
}
