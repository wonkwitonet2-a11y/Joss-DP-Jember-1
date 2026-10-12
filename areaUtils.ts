// ---------------------------------------------------------------------------
// Satu-satunya aturan pencocokan KODE AREA YL di server.
//
// Aturan: kode area dibandingkan lewat 2 ANGKA TERAKHIR (maks. area 20-an).
//   1 -> "01", 01 -> "01", 201 -> "01", 11 -> "11", 211 -> "11"
// Jadi walau kode area di Profil YL Admin diganti 1 / 01 / 201, data lama
// maupun baru tetap ketemu. Data yang sudah tersimpan TIDAK diubah/dimigrasi;
// hanya cara mencarinya yang dibuat toleran.
// ---------------------------------------------------------------------------

/** Ambil angka saja, lalu 2 angka terakhir (diberi 0 di depan kalau cuma 1 angka). "" kalau tidak ada angka. */
export function normArea(v: any): string {
  const d = String(v ?? "").replace(/\D/g, "");
  if (!d) return "";
  return d.slice(-2).padStart(2, "0");
}

/** Awalan angka mentah (1-3 digit) di depan nama, mis. "201 - Gusrina" -> "201", "01 Gusrina" -> "01". "" kalau tidak ada. */
export function areaPrefix(name: any): string {
  const m = String(name ?? "").trim().match(/^(?:Area\s*)?(\d{1,3})(?!\d)/i);
  return m ? m[1] : "";
}

/** Sama seperti areaPrefix tapi sudah dinormalkan ke 2 angka terakhir. */
export function areaFromName(name: any): string {
  return normArea(areaPrefix(name));
}

/** Apakah dua kode area sama (setelah dinormalkan)? Kosong tidak pernah dianggap sama. */
export function sameArea(a: any, b: any): boolean {
  const x = normArea(a);
  return !!x && x === normArea(b);
}

/** Ambil nilai dari objek yang kuncinya kode area (mis. perArea, breakdownRealisasi[bulan]) secara toleran. */
export function pickByArea<T = any>(obj: any, area: any): T | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const raw = String(area ?? "");
  if (raw && Object.prototype.hasOwnProperty.call(obj, raw) && obj[raw] != null) return obj[raw];
  const n = normArea(area);
  if (!n) return undefined;
  for (const k of Object.keys(obj)) {
    if (normArea(k) === n && obj[k] != null) return obj[k];
  }
  return undefined;
}

/**
 * Ambil target YL. Kunci targetYL berbentuk "<area>_<YYYY-MM>" atau "<area>".
 * Urutan: bulan ini (kunci persis) -> bulan ini (area setara) -> tanpa bulan.
 */
export function getTargetYL(targetYL: any, area: any, month?: string): any | undefined {
  if (!targetYL || typeof targetYL !== "object") return undefined;
  const raw = String(area ?? "");
  const n = normArea(area);
  if (month && targetYL[`${raw}_${month}`]) return targetYL[`${raw}_${month}`];
  if (n && month) {
    for (const k of Object.keys(targetYL)) {
      const i = k.indexOf("_");
      if (i > 0 && k.slice(i + 1) === month && normArea(k.slice(0, i)) === n && targetYL[k]) return targetYL[k];
    }
  }
  if (raw && targetYL[raw]) return targetYL[raw];
  if (n) {
    for (const k of Object.keys(targetYL)) {
      if (k.indexOf("_") === -1 && normArea(k) === n && targetYL[k]) return targetYL[k];
    }
  }
  return undefined;
}
