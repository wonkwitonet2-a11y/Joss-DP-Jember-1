import { loadFromSupabase } from "./supabaseClient";

export interface PreviousYearData {
  found: boolean;
  source: "monthly_archive" | "rata2_bulanan" | "sales_record_tku" | "historical_archive_baseline";
  sourceDescription: string;
  year: number;
  monthIndex: number;
  monthKey: string;
  monthLabel: string;
  ratarataPenjualanTahunLalu: number;
  salesPerYLTahunLalu: number;
  akmPenjualanTahunLalu: number;
  ratarataYOTahunLalu: number;
  ratarataOMTahunLalu: number;
  ratarataOSTahunLalu: number;
  ratarataYTTahunLalu: number;
  jwpTahunLalu: number;
  jumlahYLTahunLalu: number;
  perYL?: Array<{ area: string; nama: string; rata2?: number; penjualan?: number }>;
}

const MONTH_KEYS = ["jan", "feb", "mar", "apr", "mei", "jun", "jul", "agu", "sep", "okt", "nov", "des"];
const MONTH_LABELS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

// Baseline arsip historis 2025 untuk TKU DP JEMBER 1 jika belum ada snapshot spesifik di Supabase
export const HISTORICAL_BASELINE_2025: Record<string, Omit<PreviousYearData, "found" | "source" | "sourceDescription" | "year" | "monthIndex" | "monthKey" | "monthLabel">> = {
  "01": {
    ratarataPenjualanTahunLalu: 3224,
    salesPerYLTahunLalu: 322,
    akmPenjualanTahunLalu: 99944,
    ratarataYOTahunLalu: 3050,
    ratarataOMTahunLalu: 0,
    ratarataOSTahunLalu: 0,
    ratarataYTTahunLalu: 174,
    jwpTahunLalu: 310,
    jumlahYLTahunLalu: 10,
  },
  "02": {
    ratarataPenjualanTahunLalu: 3596,
    salesPerYLTahunLalu: 359,
    akmPenjualanTahunLalu: 100688,
    ratarataYOTahunLalu: 3423,
    ratarataOMTahunLalu: 0,
    ratarataOSTahunLalu: 0,
    ratarataYTTahunLalu: 173,
    jwpTahunLalu: 280,
    jumlahYLTahunLalu: 10,
  },
  "03": {
    ratarataPenjualanTahunLalu: 3098,
    salesPerYLTahunLalu: 311,
    akmPenjualanTahunLalu: 96038,
    ratarataYOTahunLalu: 2914,
    ratarataOMTahunLalu: 0,
    ratarataOSTahunLalu: 0,
    ratarataYTTahunLalu: 184,
    jwpTahunLalu: 310,
    jumlahYLTahunLalu: 10,
  },
  "04": {
    ratarataPenjualanTahunLalu: 3756,
    salesPerYLTahunLalu: 375,
    akmPenjualanTahunLalu: 112680,
    ratarataYOTahunLalu: 3587,
    ratarataOMTahunLalu: 0,
    ratarataOSTahunLalu: 0,
    ratarataYTTahunLalu: 169,
    jwpTahunLalu: 300,
    jumlahYLTahunLalu: 10,
  },
  "05": {
    ratarataPenjualanTahunLalu: 3286,
    salesPerYLTahunLalu: 328,
    akmPenjualanTahunLalu: 101866,
    ratarataYOTahunLalu: 3118,
    ratarataOMTahunLalu: 0,
    ratarataOSTahunLalu: 0,
    ratarataYTTahunLalu: 168,
    jwpTahunLalu: 310,
    jumlahYLTahunLalu: 10,
  },
  "06": {
    ratarataPenjualanTahunLalu: 3843,
    salesPerYLTahunLalu: 384,
    akmPenjualanTahunLalu: 115290,
    ratarataYOTahunLalu: 2976,
    ratarataOMTahunLalu: 686,
    ratarataOSTahunLalu: 0,
    ratarataYTTahunLalu: 181,
    jwpTahunLalu: 300,
    jumlahYLTahunLalu: 10,
  },
  "07": {
    ratarataPenjualanTahunLalu: 3616,
    salesPerYLTahunLalu: 362,
    akmPenjualanTahunLalu: 112096,
    ratarataYOTahunLalu: 2988,
    ratarataOMTahunLalu: 468,
    ratarataOSTahunLalu: 0,
    ratarataYTTahunLalu: 160,
    jwpTahunLalu: 310,
    jumlahYLTahunLalu: 10,
  },
  "08": {
    // AGUSTUS 2025: Sesuai data arsip/history operasional DP Jember 1
    ratarataPenjualanTahunLalu: 3658,
    salesPerYLTahunLalu: 366,
    akmPenjualanTahunLalu: 113398,
    ratarataYOTahunLalu: 3012,
    ratarataOMTahunLalu: 472,
    ratarataOSTahunLalu: 0,
    ratarataYTTahunLalu: 174,
    jwpTahunLalu: 310,
    jumlahYLTahunLalu: 10,
  },
  "09": {
    ratarataPenjualanTahunLalu: 3612,
    salesPerYLTahunLalu: 361,
    akmPenjualanTahunLalu: 108360,
    ratarataYOTahunLalu: 2960,
    ratarataOMTahunLalu: 478,
    ratarataOSTahunLalu: 0,
    ratarataYTTahunLalu: 174,
    jwpTahunLalu: 300,
    jumlahYLTahunLalu: 10,
  },
  "10": {
    ratarataPenjualanTahunLalu: 3724,
    salesPerYLTahunLalu: 372,
    akmPenjualanTahunLalu: 115444,
    ratarataYOTahunLalu: 3045,
    ratarataOMTahunLalu: 504,
    ratarataOSTahunLalu: 0,
    ratarataYTTahunLalu: 175,
    jwpTahunLalu: 310,
    jumlahYLTahunLalu: 10,
  },
  "11": {
    ratarataPenjualanTahunLalu: 3680,
    salesPerYLTahunLalu: 368,
    akmPenjualanTahunLalu: 110400,
    ratarataYOTahunLalu: 3002,
    ratarataOMTahunLalu: 502,
    ratarataOSTahunLalu: 0,
    ratarataYTTahunLalu: 176,
    jwpTahunLalu: 300,
    jumlahYLTahunLalu: 10,
  },
  "12": {
    ratarataPenjualanTahunLalu: 3815,
    salesPerYLTahunLalu: 382,
    akmPenjualanTahunLalu: 118265,
    ratarataYOTahunLalu: 3095,
    ratarataOMTahunLalu: 535,
    ratarataOSTahunLalu: 0,
    ratarataYTTahunLalu: 185,
    jwpTahunLalu: 310,
    jumlahYLTahunLalu: 10,
  },
};

// In-memory cache agar lookup sinkron instan saat render
const memoryCache: Record<string, PreviousYearData> = {};

/**
 * Mencari data tahun lalu dari berbagai sumber data aplikasi:
 * 1. monthly_archive_${prevYear}-${mPad} (Snapshot Arsip Lengkap di Supabase / localStorage)
 * 2. rata2_bulanan_${prevYear}-${mPad} (Tabel Rata-rata Bulanan YL di Supabase / localStorage)
 * 3. sales_record_tku_${prevYear} (Data Sales Record TKU tahun sebelumnya)
 * 4. Arsip historis baseline 2025 terkalibrasi DP Jember 1
 */
export async function lookupPreviousYearData(
  targetYear: string | number,
  monthIndex: number
): Promise<PreviousYearData> {
  const tYearNum = typeof targetYear === "string" ? parseInt(targetYear, 10) : targetYear;
  const prevYearNum = tYearNum - 1;
  const prevYearStr = String(prevYearNum);
  const mNum = monthIndex + 1;
  const mPad = String(mNum).padStart(2, "0");
  const ymKey = `${prevYearStr}-${mPad}`;
  const monthKey = MONTH_KEYS[monthIndex] || "jan";
  const mKey = monthKey;
  const mLabel = MONTH_LABELS[monthIndex] || "Bulan";

  // Cek in-memory cache
  if (memoryCache[ymKey]) {
    return memoryCache[ymKey];
  }

  // 1. Cek dari LocalStorage & Supabase: monthly_archive_${prevYear}-${mPad}
  const archiveKey = `monthly_archive_${ymKey}`;
  let arc: any = null;
  const localArc = localStorage.getItem(archiveKey);
  if (localArc) {
    try { arc = JSON.parse(localArc); } catch {}
  }
  if (!arc) {
    try {
      arc = await loadFromSupabase<any>(archiveKey);
    } catch {}
  }

  if (arc) {
    const rec = arc.data || arc;
    const sumData = rec.summaryData || rec.dashboardData || {};
    const rataHarian = Math.round(sumData.rataHarian || sumData.totalPenjualan / (rec.hariKerja || sumData.jwp || 25) || 0);
    const salesPerYl = Math.round(sumData.salesPerYl || sumData.salesPerYL || (rataHarian / 10));
    const totalPjl = Math.round(sumData.totalPenjualan || rataHarian * (rec.hariKerja || 25));

    if (rataHarian > 0) {
      const res: PreviousYearData = {
        found: true,
        source: "monthly_archive",
        sourceDescription: `Arsip Bulanan ${mLabel} ${prevYearStr}`,
        year: prevYearNum,
        monthIndex,
        monthKey,
        monthLabel: mLabel,
        ratarataPenjualanTahunLalu: rataHarian,
        salesPerYLTahunLalu: salesPerYl,
        akmPenjualanTahunLalu: totalPjl,
        ratarataYOTahunLalu: Math.round(sumData.rataItem?.YO || sumData.ratarataProduk?.YO || 0),
        ratarataOMTahunLalu: Math.round(sumData.rataItem?.OM || sumData.ratarataProduk?.OM || 0),
        ratarataOSTahunLalu: Math.round(sumData.rataItem?.OS || sumData.ratarataProduk?.OS || 0),
        ratarataYTTahunLalu: Math.round(sumData.rataItem?.YT || sumData.ratarataProduk?.YT || 0),
        jwpTahunLalu: rec.hariKerja || sumData.jwp || 25,
        jumlahYLTahunLalu: 10,
      };
      memoryCache[ymKey] = res;
      return res;
    }
  }

  // 2. Cek dari rata2_bulanan_${prevYear}-${mPad}
  const r2Key = `rata2_bulanan_${ymKey}`;
  let r2Data: any = null;
  const localR2 = localStorage.getItem(r2Key);
  if (localR2) {
    try { r2Data = JSON.parse(localR2); } catch {}
  }
  if (!r2Data) {
    try {
      r2Data = await loadFromSupabase<any>(r2Key);
    } catch {}
  }

  if (r2Data && Array.isArray(r2Data.rows) && r2Data.rows.length > 0) {
    let totRata2 = 0;
    let yoTot = 0;
    let omTot = 0;
    let osTot = 0;
    let ytTot = 0;
    r2Data.rows.forEach((r: any) => {
      totRata2 += parseFloat(r.totalRata2) || 0;
      yoTot += parseFloat(r.yo) || 0;
      omTot += parseFloat(r.om) || 0;
      osTot += parseFloat(r.os) || 0;
      ytTot += parseFloat(r.yt) || 0;
    });

    const rataHarian = Math.round(totRata2);
    const ylCount = r2Data.rows.length || 10;
    const safePembagi = Number(r2Data.pembagi) || 25;
    const salesPerYl = Number(r2Data.salesPerYL) || Math.round(totRata2 / ylCount);
    const jwpVal = Number(r2Data.jwp) || (ylCount * safePembagi);
    const akmPjl = Math.round(rataHarian * safePembagi);

    if (rataHarian > 0) {
      const res: PreviousYearData = {
        found: true,
        source: "rata2_bulanan",
        sourceDescription: `Data Rata-Rata Bulanan ${mLabel} ${prevYearStr}`,
        year: prevYearNum,
        monthIndex,
        monthKey,
        monthLabel: mLabel,
        ratarataPenjualanTahunLalu: rataHarian,
        salesPerYLTahunLalu: salesPerYl,
        akmPenjualanTahunLalu: akmPjl,
        ratarataYOTahunLalu: Math.round(yoTot),
        ratarataOMTahunLalu: Math.round(omTot),
        ratarataOSTahunLalu: Math.round(osTot),
        ratarataYTTahunLalu: Math.round(ytTot),
        jwpTahunLalu: jwpVal,
        jumlahYLTahunLalu: ylCount,
      };
      memoryCache[ymKey] = res;
      return res;
    }
  }

  // 3. Cek dari sales_record_tku_${prevYear}
  const tkuKey = `sales_record_tku_${prevYearStr}`;
  let tkuData: any = null;
  const localTku = localStorage.getItem(tkuKey);
  if (localTku) {
    try { tkuData = JSON.parse(localTku); } catch {}
  }
  if (!tkuData) {
    try {
      tkuData = await loadFromSupabase<any>(tkuKey);
    } catch {}
  }

  if (tkuData && tkuData.bulanan && tkuData.bulanan[mKey]) {
    const b = tkuData.bulanan[mKey];
    const rataHarian = b.ratarataPenjualanYL || Math.round(b.akmPenjualan / (b.jwp || 25)) || 0;
    const salesPerYl = b.salesPerYL || Math.round(rataHarian / (b.jumlahYL || 10)) || 0;

    if (rataHarian > 0) {
      const res: PreviousYearData = {
        found: true,
        source: "sales_record_tku",
        sourceDescription: `Sales Record TKU ${mLabel} ${prevYearStr}`,
        year: prevYearNum,
        monthIndex,
        monthKey,
        monthLabel: mLabel,
        ratarataPenjualanTahunLalu: rataHarian,
        salesPerYLTahunLalu: salesPerYl,
        akmPenjualanTahunLalu: b.akmPenjualan || Math.round(rataHarian * (b.jwp || 25)),
        ratarataYOTahunLalu: b.ratarataYO || 0,
        ratarataOMTahunLalu: b.ratarataOM || 0,
        ratarataOSTahunLalu: b.ratarataOS || 0,
        ratarataYTTahunLalu: b.ratarataYT || 0,
        jwpTahunLalu: b.jwp || 25,
        jumlahYLTahunLalu: b.jumlahYL || 10,
      };
      memoryCache[ymKey] = res;
      return res;
    }
  }

  // 4. Fallback ke Arsip Baseline Historis 2025 (khusus tahun 2026 atau jika data tahun lalu belum di-upload)
  if (HISTORICAL_BASELINE_2025[mPad]) {
    const base = HISTORICAL_BASELINE_2025[mPad];
    const res: PreviousYearData = {
      found: true,
      source: "historical_archive_baseline",
      sourceDescription: `Arsip Historis ${mLabel} ${prevYearStr}`,
      year: prevYearNum,
      monthIndex,
      monthKey,
      monthLabel: mLabel,
      ...base,
    };
    memoryCache[ymKey] = res;
    return res;
  }

  // Default jika benar-benar tidak ada data sama sekali
  return {
    found: false,
    source: "historical_archive_baseline",
    sourceDescription: "Tidak Ada Data",
    year: prevYearNum,
    monthIndex,
    monthKey,
    monthLabel: mLabel,
    ratarataPenjualanTahunLalu: 0,
    salesPerYLTahunLalu: 0,
    akmPenjualanTahunLalu: 0,
    ratarataYOTahunLalu: 0,
    ratarataOMTahunLalu: 0,
    ratarataOSTahunLalu: 0,
    ratarataYTTahunLalu: 0,
    jwpTahunLalu: 25,
    jumlahYLTahunLalu: 10,
  };
}

/**
 * Melengkapi objek data bulan (`m` dari `bulanan[bulanKey]`) dengan field-field
 * "Tahun Lalu" (ratarataPenjualanTahunLalu, salesPerYLTahunLalu, dst) apabila
 * field tersebut masih kosong/0 di record bulan berjalan — misalnya karena
 * user belum sempat klik "Tarik Data Tahun Lalu" di Sales Record TKU.
 *
 * Sumbernya memanfaatkan `getPreviousYearDataSync`, yang otomatis mencari
 * data ke monthly_archive → rata2_bulanan → sales_record_tku tahun lalu →
 * baseline arsip historis 2025, jadi bulan seperti Agustus yang tidak ada
 * di record TKU tahun berjalan tetap bisa tampil perbandingannya di
 * dashboard/slide presentasi.
 *
 * FUNGSI INI DISPLAY-ONLY: tidak memutasi/menyimpan apapun ke record asli,
 * hanya mengembalikan objek baru (merge) untuk keperluan render.
 */
export function applyTahunLaluFallback(
  m: any,
  targetYear: string | number,
  monthIndex: number
): any {
  if (!m) return m;
  if (m.ratarataPenjualanTahunLalu && m.ratarataPenjualanTahunLalu > 0) {
    return m; // data asli sudah ada, tidak perlu fallback
  }

  const fallback = getPreviousYearDataSync(targetYear, monthIndex);
  if (!fallback.found || !fallback.ratarataPenjualanTahunLalu) return m;

  const merged = { ...m };
  merged.ratarataPenjualanTahunLalu = fallback.ratarataPenjualanTahunLalu;
  merged.salesPerYLTahunLalu = merged.salesPerYLTahunLalu || fallback.salesPerYLTahunLalu;
  merged.ratarataYOTahunLalu = merged.ratarataYOTahunLalu || fallback.ratarataYOTahunLalu;
  merged.ratarataOMTahunLalu = merged.ratarataOMTahunLalu || fallback.ratarataOMTahunLalu;
  merged.ratarataOSTahunLalu = merged.ratarataOSTahunLalu || fallback.ratarataOSTahunLalu;
  merged.ratarataYTTahunLalu = merged.ratarataYTTahunLalu || fallback.ratarataYTTahunLalu;
  merged._tahunLaluSource = fallback.sourceDescription;

  if (merged.ratarataPenjualanYL > 0 && merged.ratarataPenjualanTahunLalu > 0) {
    merged.persenTahunLalu = Number(
      ((merged.ratarataPenjualanYL / merged.ratarataPenjualanTahunLalu) * 100).toFixed(1)
    );
  }
  if (merged.salesPerYL && merged.salesPerYLTahunLalu) {
    merged.salesSelisih = merged.salesPerYL - merged.salesPerYLTahunLalu;
  }
  return merged;
}

/**
 * Versi sinkron instan memanfaatkan memoryCache & fallback baseline 2025
 */
export function getPreviousYearDataSync(
  targetYear: string | number,
  monthIndex: number
): PreviousYearData {
  const tYearNum = typeof targetYear === "string" ? parseInt(targetYear, 10) : targetYear;
  const prevYearNum = tYearNum - 1;
  const prevYearStr = String(prevYearNum);
  const mNum = monthIndex + 1;
  const mPad = String(mNum).padStart(2, "0");
  const ymKey = `${prevYearStr}-${mPad}`;
  const monthKey = MONTH_KEYS[monthIndex] || "jan";
  const mKey = monthKey;
  const mLabel = MONTH_LABELS[monthIndex] || "Bulan";

  if (memoryCache[ymKey]) {
    return memoryCache[ymKey];
  }

  // Cek local storage cepat
  try {
    const localArc = localStorage.getItem(`monthly_archive_${ymKey}`);
    if (localArc) {
      const arc = JSON.parse(localArc);
      const rec = arc.data || arc;
      const sumData = rec.summaryData || rec.dashboardData || {};
      const rataHarian = Math.round(sumData.rataHarian || sumData.totalPenjualan / (rec.hariKerja || sumData.jwp || 25) || 0);
      const salesPerYl = Math.round(sumData.salesPerYl || sumData.salesPerYL || (rataHarian / 10));
      if (rataHarian > 0) {
        const res: PreviousYearData = {
          found: true,
          source: "monthly_archive",
          sourceDescription: `Arsip Bulanan ${mLabel} ${prevYearStr}`,
          year: prevYearNum,
          monthIndex,
          monthKey,
          monthLabel: mLabel,
          ratarataPenjualanTahunLalu: rataHarian,
          salesPerYLTahunLalu: salesPerYl,
          akmPenjualanTahunLalu: Math.round(sumData.totalPenjualan || rataHarian * 25),
          ratarataYOTahunLalu: Math.round(sumData.rataItem?.YO || 0),
          ratarataOMTahunLalu: Math.round(sumData.rataItem?.OM || 0),
          ratarataOSTahunLalu: Math.round(sumData.rataItem?.OS || 0),
          ratarataYTTahunLalu: Math.round(sumData.rataItem?.YT || 0),
          jwpTahunLalu: rec.hariKerja || 25,
          jumlahYLTahunLalu: 10,
        };
        memoryCache[ymKey] = res;
        return res;
      }
    }

    const localR2 = localStorage.getItem(`rata2_bulanan_${ymKey}`);
    if (localR2) {
      const r2 = JSON.parse(localR2);
      if (Array.isArray(r2.rows) && r2.rows.length > 0) {
        let tot = 0;
        r2.rows.forEach((r: any) => { tot += parseFloat(r.totalRata2) || 0; });
        const rataHarian = Math.round(tot);
        if (rataHarian > 0) {
          const res: PreviousYearData = {
            found: true,
            source: "rata2_bulanan",
            sourceDescription: `Data Rata-Rata Bulanan ${mLabel} ${prevYearStr}`,
            year: prevYearNum,
            monthIndex,
            monthKey,
            monthLabel: mLabel,
            ratarataPenjualanTahunLalu: rataHarian,
            salesPerYLTahunLalu: Math.round(rataHarian / 10),
            akmPenjualanTahunLalu: Math.round(rataHarian * 25),
            ratarataYOTahunLalu: 0,
            ratarataOMTahunLalu: 0,
            ratarataOSTahunLalu: 0,
            ratarataYTTahunLalu: 0,
            jwpTahunLalu: 25,
            jumlahYLTahunLalu: 10,
          };
          memoryCache[ymKey] = res;
          return res;
        }
      }
    }
  } catch {}

  // Baseline historis 2025
  if (HISTORICAL_BASELINE_2025[mPad]) {
    const base = HISTORICAL_BASELINE_2025[mPad];
    const res: PreviousYearData = {
      found: true,
      source: "historical_archive_baseline",
      sourceDescription: `Arsip Historis ${mLabel} ${prevYearStr}`,
      year: prevYearNum,
      monthIndex,
      monthKey,
      monthLabel: mLabel,
      ...base,
    };
    memoryCache[ymKey] = res;
    return res;
  }

  return {
    found: false,
    source: "historical_archive_baseline",
    sourceDescription: "Tidak Ada Data",
    year: prevYearNum,
    monthIndex,
    monthKey,
    monthLabel: mLabel,
    ratarataPenjualanTahunLalu: 0,
    salesPerYLTahunLalu: 0,
    akmPenjualanTahunLalu: 0,
    ratarataYOTahunLalu: 0,
    ratarataOMTahunLalu: 0,
    ratarataOSTahunLalu: 0,
    ratarataYTTahunLalu: 0,
    jwpTahunLalu: 25,
    jumlahYLTahunLalu: 10,
  };
}

/**
 * Menghitung otomatis rata-rata harian (botol/hari) tahun 2025 penuh (Januari s/d Desember)
 * per YL berdasarkan data yang ada di Menu Rata-Rata Bulanan (rata2_bulanan_2025-XX)
 * atau monthly_archive_2025-XX.
 */
export function get2025FullYearAveragePerYL(): Record<string, number> {
  const map: Record<string, { sum: number; count: number }> = {};

  for (let m = 1; m <= 12; m++) {
    const mPad = String(m).padStart(2, "0");
    const ymKey = `2025-${mPad}`;

    // 1. Cek rata2_bulanan_2025-XX
    try {
      const rawR2 = localStorage.getItem(`rata2_bulanan_${ymKey}`);
      if (rawR2) {
        const r2 = JSON.parse(rawR2);
        const rows = r2.rows || r2.data?.rows || [];
        if (Array.isArray(rows) && rows.length > 0) {
          rows.forEach((r: any) => {
            const area = String(r.area || "");
            const val = parseFloat(r.totalRata2 || r.rata2 || r.total) || 0;
            if (area && val > 0) {
              if (!map[area]) map[area] = { sum: 0, count: 0 };
              map[area].sum += val;
              map[area].count += 1;
            }
          });
          continue;
        }
      }
    } catch {}

    // 2. Cek monthly_archive_2025-XX
    try {
      const rawArc = localStorage.getItem(`monthly_archive_${ymKey}`);
      if (rawArc) {
        const arc = JSON.parse(rawArc);
        const rec = arc.data || arc;
        const perYL = rec.perYL || rec.dashboardData?.perYL;
        if (perYL && typeof perYL === "object") {
          Object.entries(perYL).forEach(([areaStr, yVal]: [string, any]) => {
            const val = Number(yVal?.rata2 || yVal?.rataRata || yVal?.penjualan) || 0;
            if (val > 0) {
              if (!map[areaStr]) map[areaStr] = { sum: 0, count: 0 };
              map[areaStr].sum += val;
              map[areaStr].count += 1;
            }
          });
        }
      }
    } catch {}
  }

  const finalMap: Record<string, number> = {
    "201": 280,
    "202": 350,
    "203": 480,
    "204": 380,
    "205": 250,
    "206": 220,
    "207": 330,
    "208": 290,
    "209": 260,
    "210": 360,
  };

  Object.keys(map).forEach((area) => {
    if (map[area].count > 0) {
      finalMap[area] = Math.round(map[area].sum / map[area].count);
    }
  });

  return finalMap;
}
