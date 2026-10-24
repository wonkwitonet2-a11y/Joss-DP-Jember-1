# Prompt untuk AI Studio — hapus file foto presentasi di Storage otomatis

Tolong terapkan 3 perubahan KECIL berikut persis seperti tertulis. Jangan ubah hal lain. Setelah selesai pastikan build sukses.

## 1) server.ts

(a) Di konstanta `DB_LOCK_EXEMPT`, tambahkan dua entri di akhir daftar: `"/deleteMediaFolder", "/mediaStatus"`.

(b) Tempel blok di bawah ini TEPAT SEBELUM baris komentar `// Trigger migrasi manual foto, seragam, & motivasi ke Supabase Media baru` (yaitu setelah endpoint `app.post("/api/uploadMedia"...)`). PENTING: blok ini harus berada SEBELUM handler `app.all("/api/*", ...)` yang membalas 404 di dekat akhir file, kalau tidak endpoint-nya tidak akan pernah terjangkau.

```ts
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
```

## 2) src/lib/supabaseClient.ts

(a) Tempel helper ini tepat sebelum `async function uploadInlineImage(`:

```ts
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
```

(b) Di `deleteFromSupabase`, setelah baris `readCache.set(key, { at: Date.now(), ttl: READ_TTL_MISSING_MS, value: null });` dan sebelum `return { success: true };`, tambahkan:

```ts
await deleteMediaFolderForKey(key);
```

(c) Di `saveToSupabase`, setelah baris `readCache.set(key, { at: Date.now(), ttl: readTtlFor(key), value: cloneValue(data) });` dan sebelum `return { success: true, data };`, tambahkan:

```ts
if (/^presentasi/.test(key) && !hasInlineImage(data) && !hasStorageImageUrl(data)) {
  await deleteMediaFolderForKey(key);
}
```

## 3) src/components/PresentasiView.tsx

Di fungsi `resizePhotoToBase64`: ubah `const MAX_SIZE = 500;` menjadi `const MAX_SIZE = 900;` dan `canvas.toDataURL("image/jpeg", 0.7)` menjadi `canvas.toDataURL("image/jpeg", 0.8)` (hanya di fungsi itu).

## Cek setelah selesai
Buka `/api/mediaStatus` di app. Harus muncul JSON berisi `"version":"media-delete-v2"`.
