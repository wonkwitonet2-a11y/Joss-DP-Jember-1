// src/lib/annualTargetArchive.ts
//
// FILE BARU (revisi ke-2) — logika untuk fitur "Arsip Target Tahunan".
// Disederhanakan sesuai instruksi: hanya 2 baris per tabel.
//
// Tabel 1 "Vs Target" (tahun berjalan):
//   - AKM Target    = Σ target rata-rata harian semua area (targetYLMap[area].target di
//                      monthly_archive_{tahun}-{bulan}) x jumlah hari kalender bulan itu.
//   - AKM Realisasi = total produk terjual (akumulasi YO+OM+OS+YT) dari data PLG PJL
//                      (transactions) di monthly_archive_{tahun}-{bulan} YANG SAMA.
//
// Tabel 2 "Vs Tahun Lalu":
//   - AKM Tahun Lalu = sama persis seperti AKM Target, tapi diambil dari
//                       monthly_archive_{tahun-1}-{bulan}.
//   - AKM Realisasi  = sama persis seperti AKM Realisasi, tapi diambil dari
//                       monthly_archive_{tahun-1}-{bulan}.
//
// Kalau arsip bulan yang dimaksud (tahun ini ATAU tahun lalu) tidak ditemukan,
// nilai auto = 0 dan sel tetap bisa diisi MANUAL oleh manajer (disimpan terpisah,
// TIDAK menimpa arsip asli) di key Supabase baru: annual_target_manual_{year}.

import { loadFromSupabase, saveToSupabase } from "./supabaseClient";

export const INDO_MONTH_LABELS = [
  "Jan", "Feb", "Maret", "April", "Mei", "Juni",
  "Juli", "Agt", "Sep", "Okt", "Nov", "Des",
];

/** Jumlah hari kalender penuh pada suatu bulan (1-12), termasuk tahun kabisat. */
export function daysInMonth(year: number, month1to12: number): number {
  return new Date(year, month1to12, 0).getDate();
}

/** Format key bulan sesuai konvensi monthly_archive_YYYY-MM yang sudah dipakai app. */
export function toMonthKey(year: number, month1to12: number): string {
  return `${year}-${String(month1to12).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// 1. Ambil snapshot arsip bulanan (read-only)
// ---------------------------------------------------------------------------

export interface MonthlyArchiveSnapshotLite {
  monthKey: string;
  targetYLMap?: Record<string, { target: number; bln_lalu: number; thn_lalu: number }>;
  transactions?: any[];
  ylList?: { area: string; nama: string }[];
}

const snapshotCache = new Map<string, MonthlyArchiveSnapshotLite | null>();

/** Ambil snapshot monthly_archive_{mKey} dari Supabase. null kalau bulan itu belum diarsipkan. */
export async function fetchMonthlyArchiveSnapshot(
  mKey: string
): Promise<MonthlyArchiveSnapshotLite | null> {
  if (snapshotCache.has(mKey)) return snapshotCache.get(mKey) ?? null;
  const snap = await loadFromSupabase<MonthlyArchiveSnapshotLite>(`monthly_archive_${mKey}`);
  snapshotCache.set(mKey, snap ?? null);
  return snap ?? null;
}

/** Bersihkan cache in-memory (dipanggil setelah tombol "Refresh / Sync Ulang"). */
export function clearAnnualArchiveCache() {
  snapshotCache.clear();
}

// ---------------------------------------------------------------------------
// 2. Kalkulasi dari satu snapshot
// ---------------------------------------------------------------------------

/** Total rata-rata target harian seluruh area (kolom "target" di targetYLMap), dijumlah semua YL aktif. */
function sumTargetRate(snapshot: MonthlyArchiveSnapshotLite | null): number {
  if (!snapshot?.targetYLMap) return 0;
  const ylList = snapshot.ylList || [];
  const entries = Object.entries(snapshot.targetYLMap);
  // Kalau snapshot punya daftar YL aktif (ylList), hanya jumlahkan area yang memang aktif
  // di bulan itu — supaya key basi/duplikat dari YL yang sudah tidak aktif tidak ikut membengkakkan total.
  const filtered = ylList.length
    ? entries.filter(([area]) => ylList.some((y) => y.area === area))
    : entries;
  return filtered.reduce((sum, [, t]) => sum + (Number(t?.target) || 0), 0);
}

/**
 * Total produk terjual (akumulasi, bukan rata-rata) dari data PLG PJL (transactions) di dalam
 * satu snapshot arsip bulanan. Replikasi persis dari formula grandTotal di PlgPjlView.tsx
 * (sumTxKey rmh+psr+skh+ktr+tk+ib, untuk seluruh tim / TKU_DP1).
 */
function sumPlgPjlGrandTotal(snapshot: MonthlyArchiveSnapshotLite | null): number {
  if (!snapshot?.transactions || !snapshot.transactions.length) return 0;
  const ylList = snapshot.ylList || [];

  const teamTxs = ylList.length
    ? snapshot.transactions.filter(
        (t) => t?.nama && ylList.some((y) => t.nama.startsWith(y.area) || t.nama === y.nama)
      )
    : snapshot.transactions;

  const sectorPrefixes = ["rmh", "psr", "skh", "ktr", "tk", "ib"];
  const prodSuffixes = ["yo", "om", "os", "yt"];

  let grandTotal = 0;
  for (const t of teamTxs) {
    for (const sector of sectorPrefixes) {
      for (const prod of prodSuffixes) {
        grandTotal += Number(t[`${sector}_${prod}`]) || 0;
      }
    }
  }
  return grandTotal;
}

/**
 * Ambil AKM Target OTOMATIS untuk satu bulan di satu tahun (dipakai untuk Tabel 1 dengan
 * `year` = tahun berjalan, dan untuk Tabel 2 dengan `year` = tahun lalu).
 * = target rata-rata harian (dari arsip) x jumlah hari kalender bulan itu.
 * Return 0 kalau arsip bulan itu tidak ada (berarti harus diisi manual oleh manajer).
 */
export async function fetchAkmTargetAuto(year: number, month: number): Promise<number> {
  const snap = await fetchMonthlyArchiveSnapshot(toMonthKey(year, month));
  if (!snap) return 0;
  return sumTargetRate(snap) * daysInMonth(year, month);
}

/**
 * Ambil AKM Realisasi OTOMATIS untuk satu bulan di satu tahun (dipakai untuk Tabel 1 dengan
 * `year` = tahun berjalan, dan untuk Tabel 2 dengan `year` = tahun lalu, DIAMBIL DARI ARSIP
 * PLG PJL TAHUN LALU ITU SENDIRI — bukan angka realisasi tahun ini).
 * Return 0 kalau arsip PLG PJL bulan itu tidak ada (berarti harus diisi manual).
 */
export async function fetchAkmRealisasiAuto(year: number, month: number): Promise<number> {
  const snap = await fetchMonthlyArchiveSnapshot(toMonthKey(year, month));
  if (!snap) return 0;
  return sumPlgPjlGrandTotal(snap);
}

// ---------------------------------------------------------------------------
// 3. Penyimpanan manual override (Supabase utama, key BARU — terpisah dari arsip asli)
// ---------------------------------------------------------------------------

export interface AnnualTargetManualOverride {
  year: number;
  // Tabel 1 "Vs Target" (tahun berjalan) — key "01".."12"
  akmTargetManual: Record<string, number>;
  akmRealisasiManual: Record<string, number>;
  // Tabel 2 "Vs Tahun Lalu" — key "01".."12"
  akmTahunLaluManual: Record<string, number>;
  akmRealisasiTahunLaluManual: Record<string, number>;
  updatedAt: string;
}

export function emptyAnnualManualOverride(year: number): AnnualTargetManualOverride {
  return {
    year,
    akmTargetManual: {},
    akmRealisasiManual: {},
    akmTahunLaluManual: {},
    akmRealisasiTahunLaluManual: {},
    updatedAt: new Date().toISOString(),
  };
}

function annualManualKey(year: number): string {
  return `annual_target_manual_${year}`;
}

export async function loadAnnualManualOverride(year: number): Promise<AnnualTargetManualOverride> {
  const data = await loadFromSupabase<AnnualTargetManualOverride>(annualManualKey(year));
  if (!data) return emptyAnnualManualOverride(year);
  return {
    ...emptyAnnualManualOverride(year),
    ...data,
    akmTargetManual: data.akmTargetManual || {},
    akmRealisasiManual: data.akmRealisasiManual || {},
    akmTahunLaluManual: data.akmTahunLaluManual || {},
    akmRealisasiTahunLaluManual: data.akmRealisasiTahunLaluManual || {},
  };
}

export async function saveAnnualManualOverride(
  override: AnnualTargetManualOverride
): Promise<{ success: boolean; error?: string }> {
  const payload: AnnualTargetManualOverride = { ...override, updatedAt: new Date().toISOString() };
  return saveToSupabase(annualManualKey(override.year), payload);
}

// ---------------------------------------------------------------------------
// 4. Total kolom "AKM" (paling kanan) — jumlah semua bulan yang punya nilai > 0
// ---------------------------------------------------------------------------

export function sumFilledMonths(values: number[]): number {
  return values.reduce((sum, v) => sum + (Number(v) || 0), 0);
}

export function countFilledMonths(values: number[]): number {
  return values.filter((v) => Number(v) > 0).length;
}
