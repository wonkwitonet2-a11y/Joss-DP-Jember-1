import { loadFromSupabase } from "./supabaseClient";
import { HISTORICAL_BASELINE_2025 } from "./historicalArchiveLookup";

const MONTH_KEYS = ["jan", "feb", "mar", "apr", "mei", "jun", "jul", "agu", "sep", "okt", "nov", "des"];

export interface MonthRealizationData {
  ymKey: string;
  year: number;
  month: number;
  monthLabel: string;
  found: boolean;
  source: string;
  perYL: Record<string, number>; // Area -> realisasi rata-rata (desimal 2 digit)
  totalTim: number; // Total Tim: diambil dari total 10 YL dibuang desimalnya tanpa pembulatan (Math.trunc)
  totalYLSpe: number; // Total murni 10 YL dengan 2 digit desimal (misal 3550.90)
  produk: {
    yo: number;
    om: number;
    os: number;
    yt: number;
  };
}

export interface TargetArchiveResult {
  currentMonthKey: string;
  bulanLalu: MonthRealizationData;
  tahunLalu: MonthRealizationData;
}

const INDO_MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

/**
 * Mengambil data realisasi rata-rata penjualan untuk 1 bulan tertentu dari arsip Supabase/LocalStorage
 */
export async function getMonthRealizationFromArchive(
  ymKey: string,
  activeYlList: { area: string; nama: string; status?: string }[]
): Promise<MonthRealizationData> {
  const [yearStr, monthStr] = ymKey.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const mPad = String(month).padStart(2, "0");
  const monthIdx = month - 1;
  const monthKey = MONTH_KEYS[monthIdx] || "jan";
  const monthLabel = `${INDO_MONTHS[monthIdx] || "Bulan"} ${year}`;

  const perYL: Record<string, number> = {};
  let found = false;
  let source = "Tidak Ditemukan";
  let produk = { yo: 0, om: 0, os: 0, yt: 0 };

  // 1. Cek dari monthly_archive_${ymKey} (Snapshot Arsip Lengkap)
  const arcKey = `monthly_archive_${ymKey}`;
  let snapshot: any = null;
  const localArc = localStorage.getItem(arcKey);
  if (localArc) {
    try { snapshot = JSON.parse(localArc); } catch {}
  }
  if (!snapshot) {
    try {
      snapshot = await loadFromSupabase<any>(arcKey);
    } catch {}
  }

  if (snapshot) {
    const rec = snapshot.data || snapshot;

    // 0. Cek dari snapshot.rata2Data (Data Rekapitulasi Rata-Rata Otomatis Tersimpan)
    if (rec.rata2Data && Array.isArray(rec.rata2Data.rows) && rec.rata2Data.rows.length > 0) {
      let yoSum = 0, omSum = 0, osSum = 0, ytSum = 0;
      rec.rata2Data.rows.forEach((r: any) => {
        if (r.area) {
          const val = parseFloat(String(r.totalRata2).replace(",", ".")) || 0;
          perYL[r.area] = Number(val.toFixed(2));
          yoSum += parseFloat(r.yo) || 0;
          omSum += parseFloat(r.om) || 0;
          osSum += parseFloat(r.os) || 0;
          ytSum += parseFloat(r.yt) || 0;
        }
      });
      found = true;
      source = `Rata-Rata Arsip Otomatis (${arcKey})`;
      produk = {
        yo: Math.trunc(yoSum),
        om: Math.trunc(omSum),
        os: Math.trunc(osSum),
        yt: Math.trunc(ytSum),
      };
    }

    const db = rec.dashboardData || {};
    const ev = rec.evaluasiData || {};

    // A. Cek dari dashboardData.perYL (realisasi rata-rata aktual harian per YL)
    if (!found && db.perYL && typeof db.perYL === "object" && Object.keys(db.perYL).length > 0) {
      Object.entries(db.perYL).forEach(([area, val]: [string, any]) => {
        if (!val) return;
        let r2 = 0;
        if (typeof val.rata2 === "number") {
          r2 = val.rata2;
        } else if (val.rata2 !== undefined && val.rata2 !== null) {
          r2 = parseFloat(String(val.rata2).replace(",", ".")) || 0;
        } else if (val.hariAktif > 0 && val.akumulasi > 0) {
          r2 = val.akumulasi / val.hariAktif;
        }
        if (r2 > 0) {
          perYL[area] = Number(r2.toFixed(2));
          found = true;
          source = `Arsip Bulanan (${arcKey})`;
        }
      });
    }

    // B. Cek dari evaluasiData.analisis jika perYL belum terisi lengkap
    if (Array.isArray(ev.analisis) && ev.analisis.length > 0) {
      ev.analisis.forEach((row: any) => {
        if (row && row.area && perYL[row.area] === undefined) {
          const r2 = parseFloat(String(row.rata2BulanBerjalan).replace(",", ".")) || 0;
          if (r2 > 0) {
            perYL[row.area] = Number(r2.toFixed(2));
            found = true;
            source = `Arsip Evaluasi (${arcKey})`;
          }
        }
      });
    }

    // C. Cek dari targetYLMap / targetYL di snapshot jika belum ada
    if (Object.keys(perYL).length === 0) {
      const tgtMap = rec.targetYLMap || rec.targetYL || {};
      Object.entries(tgtMap).forEach(([area, val]: [string, any]) => {
        if (!val) return;
        const r2 = parseFloat(String(val.target || val.bln_lalu).replace(",", ".")) || 0;
        if (r2 > 0) {
          perYL[area] = Number(r2.toFixed(2));
          found = true;
          source = `Target Arsip (${arcKey})`;
        }
      });
    }

    // Produk Tim
    if (db.rataItem) {
      produk = {
        yo: Math.trunc(db.rataItem.YO || 0),
        om: Math.trunc(db.rataItem.OM || 0),
        os: Math.trunc(db.rataItem.OS || 0),
        yt: Math.trunc(db.rataItem.YT || 0),
      };
    }
  }

  // 2. Cek dari rata2_bulanan_${ymKey} jika belum ditemukan
  if (!found) {
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
      let yoSum = 0, omSum = 0, osSum = 0, ytSum = 0;
      r2Data.rows.forEach((r: any) => {
        if (r.area) {
          const val = parseFloat(String(r.totalRata2).replace(",", ".")) || 0;
          perYL[r.area] = Number(val.toFixed(2));
          yoSum += parseFloat(r.yo) || 0;
          omSum += parseFloat(r.om) || 0;
          osSum += parseFloat(r.os) || 0;
          ytSum += parseFloat(r.yt) || 0;
        }
      });
      found = true;
      source = `Data Rata-Rata Bulanan (${r2Key})`;
      produk = {
        yo: Math.trunc(yoSum),
        om: Math.trunc(omSum),
        os: Math.trunc(osSum),
        yt: Math.trunc(ytSum),
      };
    }
  }

  // 3. Cek dari sales_record_tku_${year}
  if (!found) {
    const tkuKey = `sales_record_tku_${year}`;
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
    if (tkuData && tkuData.bulanan && tkuData.bulanan[monthKey]) {
      const b = tkuData.bulanan[monthKey];
      if (Array.isArray(b.perYL) && b.perYL.length > 0) {
        b.perYL.forEach((yl: any) => {
          if (yl.area) {
            const val = parseFloat(String(yl.rata2YL || yl.ratarataPenjualanYL).replace(",", ".")) || 0;
            perYL[yl.area] = Number(val.toFixed(2));
          }
        });
        found = true;
        source = `Sales Record TKU (${tkuKey})`;
      }
      produk = {
        yo: Math.trunc(b.ratarataYO || 0),
        om: Math.trunc(b.ratarataOM || 0),
        os: Math.trunc(b.ratarataOS || 0),
        yt: Math.trunc(b.ratarataYT || 0),
      };
    }
  }

  // 4. Baseline 2025 (khusus bulan-bulan di tahun 2025 jika belum ada upload arsip)
  if (!found && year === 2025 && HISTORICAL_BASELINE_2025[mPad]) {
    const base = HISTORICAL_BASELINE_2025[mPad];
    const avgPerYl = Number((base.ratarataPenjualanTahunLalu / (activeYlList.length || 10)).toFixed(2));
    activeYlList.forEach((yl) => {
      perYL[yl.area] = avgPerYl;
    });
    found = true;
    source = `Baseline Historis 2025 (${mPad})`;
    produk = {
      yo: Math.trunc(base.ratarataYOTahunLalu || 0),
      om: Math.trunc(base.ratarataOMTahunLalu || 0),
      os: Math.trunc(base.ratarataOSTahunLalu || 0),
      yt: Math.trunc(base.ratarataYTTahunLalu || 0),
    };
  }

  // Hitung total 10 YL murni dengan 2 angka desimal
  const totalYLSpe = Number(
    activeYlList
      .filter((y) => y.status !== "nonaktif")
      .reduce((sum, yl) => sum + (perYL[yl.area] || 0), 0)
      .toFixed(2)
  );

  // Sesuai instruksi khusus:
  // "Tapi khusus yang kolom tim itu gak usah ada angka desimal.
  // Tapi ambil dari total dan buang angka belakangnya dan gak usah di bulatkan.
  // Misal 3550,90 jadinya 3550. Tapi untuk total 10 yl tsb itu tetep pakai koma ya."
  const totalTim = Math.trunc(totalYLSpe);

  // Jika produk belum terisi tapi totalTim > 0, set default YO sesuai totalTim
  if (produk.yo === 0 && produk.om === 0 && produk.os === 0 && produk.yt === 0 && totalTim > 0) {
    produk.yo = totalTim;
  } else if (produk.yo + produk.om + produk.os + produk.yt !== totalTim && totalTim > 0) {
    // Sesuaikan produk YO agar jumlahnya sama dengan totalTim
    const otherSum = produk.om + produk.os + produk.yt;
    produk.yo = Math.max(0, totalTim - otherSum);
  }

  return {
    ymKey,
    year,
    month,
    monthLabel,
    found,
    source,
    perYL,
    totalTim,
    totalYLSpe,
    produk,
  };
}

/**
 * Menghitung dan mengambil data Bulan Lalu & Tahun Lalu untuk bulan target (misal: '2026-09')
 */
export async function lookupHistoricalTargetRealization(
  currentMonthKey: string,
  activeYlList: { area: string; nama: string; status?: string }[]
): Promise<TargetArchiveResult> {
  const [yearStr, monthStr] = currentMonthKey.split("-");
  const curYear = parseInt(yearStr, 10);
  const curMonth = parseInt(monthStr, 10);

  // 1. Bulan Lalu: mundur 1 bulan (e.g. 2026-09 -> 2026-08, 2026-01 -> 2025-12)
  let blnLaluYear = curYear;
  let blnLaluMonth = curMonth - 1;
  if (blnLaluMonth <= 0) {
    blnLaluMonth = 12;
    blnLaluYear -= 1;
  }
  const blnLaluKey = `${blnLaluYear}-${String(blnLaluMonth).padStart(2, "0")}`;

  // 2. Tahun Lalu: mundur 1 tahun, bulan yang sama (e.g. 2026-09 -> 2025-09)
  const thnLaluYear = curYear - 1;
  const thnLaluMonth = curMonth;
  const thnLaluKey = `${thnLaluYear}-${String(thnLaluMonth).padStart(2, "0")}`;

  const [bulanLalu, tahunLalu] = await Promise.all([
    getMonthRealizationFromArchive(blnLaluKey, activeYlList),
    getMonthRealizationFromArchive(thnLaluKey, activeYlList),
  ]);

  return {
    currentMonthKey,
    bulanLalu,
    tahunLalu,
  };
}

export interface CalculatedRata2Row {
  area: string;
  nama: string;
  total: number;
  yo: number;
  om: number;
  os: number;
  yt: number;
  totalRata2: number;
}

export interface CalculatedMonthlyRata2 {
  yearMonth: string;
  year: string;
  month: string;
  label: string;
  updatedAt: string;
  pembagi?: number;
  jwp?: number;
  salesPerYL?: number;
  absen?: {
    jumlahYL?: number;
    frekuensi?: number;
    ewpPersen?: number;
  };
  rows: CalculatedRata2Row[];
}

/**
 * Menghitung rekapitulasi rata-rata bulanan secara otomatis dari snapshot transaksi & breakdown
 */
export function computeMonthlyRata2DataFromSnapshot(
  snapshot: any,
  activeYlList: { area: string; nama: string; status?: string }[],
  targetYmKey?: string
): CalculatedMonthlyRata2 {
  const ymKey = targetYmKey || snapshot.monthKey || new Date().toISOString().substring(0, 7);
  const [yr, mo] = ymKey.split("-");
  const monthIdx = parseInt(mo, 10) - 1;
  const label = `${INDO_MONTHS[monthIdx] || "Bulan"} ${yr}`;

  const realisasiMap = snapshot.breakdownRealisasiMap || {};
  const txs = snapshot.transactions || [];
  const currentMonthTxs = txs.filter((t: any) => t.tanggal && t.tanggal.startsWith(ymKey));

  const [yStr, mStr] = ymKey.split("-");
  const numYear = parseInt(yStr, 10) || 2026;
  const numMonth = parseInt(mStr, 10) || 8;
  const calDays = new Date(numYear, numMonth, 0).getDate();

  // Ambil pembagi tanggal dari realisasi atau default jumlah hari kalender bulan tersebut (e.g. 31 hari untuk Agustus)
  let defaultPembagi = calDays;
  if (realisasiMap && typeof realisasiMap === "object") {
    const firstKey = Object.keys(realisasiMap)[0];
    if (firstKey && realisasiMap[firstKey]?.pembagiTanggal) {
      defaultPembagi = Number(realisasiMap[firstKey].pembagiTanggal) || calDays;
    }
  }

  const activeYLs = (activeYlList && activeYlList.length > 0 ? activeYlList : (snapshot.ylList || []))
    .filter((y: any) => y.status !== "nonaktif");

  const rows: CalculatedRata2Row[] = activeYLs.map((yl: any) => {
    const area = String(yl.area || "").substring(0, 3);
    const nama = yl.nama || "";

    let yo = 0, om = 0, os = 0, yt = 0, total = 0;
    let pembagi = defaultPembagi;

    // 1. Cek dari breakdownRealisasiMap
    const areaBD = realisasiMap[area];
    if (areaBD) {
      if (areaBD.pembagiTanggal && Number(areaBD.pembagiTanggal) > 0) {
        pembagi = Number(areaBD.pembagiTanggal);
      }
      const days = areaBD.days || areaBD;
      if (days && typeof days === "object") {
        Object.values(days).forEach((d: any) => {
          if (!d) return;
          yo += Number(d.yo) || 0;
          om += Number(d.om) || 0;
          os += Number(d.os) || 0;
          yt += Number(d.yt) || 0;
        });
      }
    }

    // 2. Jika di breakdown kosong, fallback hitung dari transaksi pelanggan & penjualan
    if (yo === 0 && om === 0 && os === 0 && yt === 0 && currentMonthTxs.length > 0) {
      const cleanYl = nama.replace(/^\d+\s*/, "").toUpperCase();
      const ylTxs = currentMonthTxs.filter((t: any) =>
        t.area === area || t.nama === nama || (t.nama && t.nama.toUpperCase().includes(cleanYl))
      );
      ylTxs.forEach((t: any) => {
        yo += (t.rmh_yo || 0) + (t.psr_yo || 0) + (t.skh_yo || 0) + (t.ktr_yo || 0) + (t.tk_yo || 0) + (t.ib_yo || 0);
        om += (t.rmh_om || 0) + (t.psr_om || 0) + (t.skh_om || 0) + (t.ktr_om || 0) + (t.tk_om || 0) + (t.ib_om || 0);
        os += (t.rmh_os || 0) + (t.psr_os || 0) + (t.skh_os || 0) + (t.ktr_os || 0) + (t.tk_os || 0) + (t.ib_os || 0);
        yt += (t.rmh_yt || 0) + (t.psr_yt || 0) + (t.skh_yt || 0) + (t.ktr_yt || 0) + (t.tk_yt || 0) + (t.ib_yt || 0);
      });
    }

    total = yo + om + os + yt;
    const safeDiv = pembagi > 0 ? pembagi : calDays;

    const rYo = Number((yo / safeDiv).toFixed(2));
    const rOm = Number((om / safeDiv).toFixed(2));
    const rOs = Number((os / safeDiv).toFixed(2));
    const rYt = Number((yt / safeDiv).toFixed(2));
    const totalRata2 = Number((rYo + rOm + rOs + rYt).toFixed(2));

    return {
      area,
      nama,
      total,
      yo: rYo,
      om: rOm,
      os: rOs,
      yt: rYt,
      totalRata2,
    };
  });

  const totalAkumulasiAll = rows.reduce((acc, r) => acc + (r.total || 0), 0);
  const totalRata2All = rows.reduce((acc, r) => acc + (r.totalRata2 || 0), 0);
  const rowCount = rows.length > 0 ? rows.length : 10;
  const safePembagi = defaultPembagi > 0 ? defaultPembagi : calDays;
  const jwpVal = rowCount * safePembagi;
  const salesPerYL = jwpVal > 0 ? Math.round(totalAkumulasiAll / jwpVal) : (rowCount > 0 ? Math.round(totalRata2All / rowCount) : 0);

  const ylAbsen = Number(snapshot.dashboardData?.ylAbsen || snapshot.evaluasiData?.ylAbsen || snapshot.ylAbsen || 0);
  const frekuensiAbsen = Number(snapshot.dashboardData?.frekuensiAbsen || snapshot.evaluasiData?.frekuensiAbsen || snapshot.frekuensiAbsen || 0);

  return {
    yearMonth: ymKey,
    year: yr,
    month: mo,
    label,
    updatedAt: new Date().toISOString(),
    pembagi: safePembagi,
    jwp: jwpVal,
    salesPerYL,
    absen: {
      jumlahYL: ylAbsen,
      frekuensi: frekuensiAbsen,
    },
    rows,
  };
}
