export interface Transaction {
  tanggal: string;
  nama: string;
  // Breakdown / PDM Plan (YL's plan per date)
  plan_yo?: number;
  plan_om?: number;
  plan_os?: number;
  plan_yt?: number;
  // Official Realisasi set by Manager
  tot_yo: number;
  tot_om: number;
  tot_os: number;
  tot_yt: number;
  // Category Breakdown set by YL
  rmh_yo: number;
  rmh_om: number;
  rmh_os: number;
  rmh_yt: number;
  psr_yo: number;
  psr_om: number;
  psr_os: number;
  psr_yt: number;
  skh_yo: number;
  skh_om: number;
  skh_os: number;
  skh_yt: number;
  ktr_yo: number;
  ktr_om: number;
  ktr_os: number;
  ktr_yt: number;
  tk_yo: number;
  tk_om: number;
  tk_os: number;
  tk_yt: number;
  ib_yo: number;
  ib_om: number;
  ib_os: number;
  ib_yt: number;
  // Daily stock & focus
  bb_yo: number;
  bb_om: number;
  bb_os: number;
  bb_yt: number;
  pb_p: number;
  pb_s: number;
  f_plg: number;
  f_rk: number;
  f_ra: number;
  f_rb: number;
  apk_plg: number;
  apk_botol: number;
  skh_total?: number;
  skh_tembus?: number;
  kntr_total?: number;
  kntr_tembus?: number;
  tko_total?: number;
  tko_tembus?: number;
}

export interface YLLady {
  area: string; // e.g. "201"
  nama: string; // e.g. "201 Gusrina"
  pin: string;  // e.g. "201"
  status?: "Aktif" | "Resign";
  kodeYl?: string; // e.g. "YL-201"
  tanggalMasuk?: string; // e.g. "2024-01-15"
  tanggalDaftar?: string;
  tanggalResign?: string;
  foto?: string;
  nik?: string; // e.g. "350..."
  tglLahir?: string; // e.g. "1980-01-01"
  ikutJht?: boolean;
  iuranJht?: number;
}

export interface CompensationTier {
  threshold: number; // e.g. 200, 250, 280, 300, 330, 350
  rate: number;      // e.g. 338, 374, 409, 417, 424, 428, 432
}

export interface CompensationConfig {
  tiers: CompensationTier[];
  pphRate: number;  // Default 2.5 (%)
  jkkJkm: number;   // Default 18800 (flat)
  jht: number;      // Default 24000 (flat)
}

export interface YLTarget {
  target: number;
  bln_lalu: number;
  thn_lalu: number;
}

export interface MotivasiConfig {
  list: string[];
  terpilih: string[];
  intervalDetik: number;
  enabled: boolean;
  chatbotName?: string;
  tkuName?: string;
}

export interface KontesRow {
  nama: string;
  area: string;
  hasil: string;
  vsTarget: number;
  totalPb: number;
  totalSampah: number;
  poinHarian: number;
  poinKenaikan: number;
  poinSampah: number;
  poinYt: number;
  totalPoin: number;
}

export interface DashboardData {
  ylAbsen?: number;
  frekuensiAbsen?: number;
  totalPenjualan: number;
  rataHarian: number;
  salesPerYl: number;
  jwp: number;
  rataItem: {
    YO: number;
    OM: number;
    OS: number;
    YT: number;
  };
  vsTarget: number;
  vsBulanLalu: number;
  vsTahunLalu: number;
  targetTim: {
    target: number;
    bulanLalu: number;
    tahunLalu: number;
    rata2: number;
  };
  bbTimRaw: number;
  hariAktif: number;
  perYL: {
    [area: string]: {
      nama: string;
      akumulasi: number;
      rata2: number;
      hariAktif: number;
      targetYL: number;
      bulanLaluYL: number;
      tahunLaluYL: number;
      bbYL: number;
    };
  };
  grafikHarian: {
    tanggal: string[];
    penjualan: number[];
    balikBotol: number[];
  };
  sektorTim?: {
    rumah: number;
    pasar: number;
    sekolah: number;
    kantor: number;
    toko: number;
    ib: number;
  };
  plgPjlManual?: Record<string, any>;
}

export interface EvaluasiData {
  headerRows: string[][];
  dataRows: any[][];
  totalRow: any[];
  analisis: {
    area: string;
    nama: string;
    jualHariIni: number;
    rata2BulanBerjalan: number;
    vsMingguLaluPct: number;
    persenRumah: number;
    persenRbVsPlg: number;
    propagandaHariIni: number;
    sampahBotol: number;
    bb: number;
    akmBb?: number;
    propagandaVs900: number | null;
  }[];
}

export const cleanYlName = (fullName: string): string => {
  if (!fullName) return "";
  let s = fullName.trim();
  s = s.replace(/^Area\s+\d+\s*[-_:]?\s*/i, "").trim();
  s = s.replace(/^\d+\s*[-_:]?\s*/, "").trim();
  s = s.replace(/^Area\s+[-_:]?\s*/i, "").trim();
  return s || fullName;
};

