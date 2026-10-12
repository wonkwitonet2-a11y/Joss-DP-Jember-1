import { normArea, areaPrefix, sameArea } from "./areaUtils.ts";
// aiDataContext.ts
// Modul murni (tanpa import dari server.ts) yang menyusun konteks data untuk Chatbot AI
// dan Analisa AI Presentasi. Semua angka dihitung dengan rumus yang SAMA dengan layar
// (calculateDashboardDP1 / getEvaluasi), jadi AI tidak perlu menghitung ulang sendiri.
//
// Cakupan data:
//   - role "manager" : SEMUA area (201-210) bulan berjalan + seluruh arsip
//   - role "yl"      : HANYA area milik akun yang login (mis. 201) bulan berjalan + arsip area itu
//
// Dependensi di-inject dari server.ts supaya tidak ada circular import.

export type AiRole = "manager" | "yl";

export interface AiContextDeps {
  db: any;
  /** hasil calculateDashboardDP1(db, month) untuk bulan yang diminta */
  dashboard: any;
  /** hasil getAllMonthlyArchivesSummary() */
  archives: any[];
  /** getMonthBreakdownRealisasiMap(db, monthKey) -> data harian per area (bulan berjalan / arsip) */
  getMonthMap: (monthKey: string) => Promise<any>;
  cleanYlName: (s: string) => string;
}

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const AREAS = ["201", "202", "203", "204", "205", "206", "207", "208", "209", "210"];

const num = (v: any): number => {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};
const r1 = (n: number): number => Math.round(n * 10) / 10;
const pct = (a: number, b: number): number | null => (b > 0 ? r1((a / b) * 100) : null);
const pctStr = (v: number | null): string => (v === null ? "-" : `${v}%`);

export function monthLabel(key: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(key || "");
  if (!m) return key || "-";
  return `${BULAN[parseInt(m[2], 10) - 1] || m[2]} ${m[1]}`;
}

/** Bulan aktif = bulan global yang diset Admin; fallback ke bulan transaksi terakhir; lalu bulan kalender. */
export function resolveActiveMonth(db: any): string {
  if (db?.globalMonth && /^\d{4}-\d{2}$/.test(db.globalMonth)) return db.globalMonth;
  const txs = db?.transactions || [];
  const last = txs.length > 0 ? txs[txs.length - 1].tanggal : "";
  if (last && /^\d{4}-\d{2}/.test(last)) return String(last).substring(0, 7);
  return new Date().toISOString().substring(0, 7);
}

/** Cari kode area (201..210) dari nama akun, mis. "201 - Gusrina" / "Gusrina". */
export function resolveArea(db: any, userName: string, cleanYlName: (s: string) => string): string | null {
  const s = String(userName || "").trim();
  if (!s) return null;
  const m = areaPrefix(s);
  if (m) return m;
  const clean = cleanYlName(s).toLowerCase();
  const list: any[] = db?.ylList || [];
  const hit = list.find((y) => cleanYlName(String(y.nama || "")).toLowerCase() === clean);
  if (hit?.area) return String(hit.area);
  return null;
}

function areaName(db: any, area: string, cleanYlName: (s: string) => string): string {
  const list: any[] = db?.ylList || [];
  const hit = list.find((y) => sameArea(y.area, area) || sameArea(areaPrefix(y.nama), area));
  return hit ? cleanYlName(String(hit.nama)) : area;
}

/** Deteksi area yang disebut di pertanyaan (kode 3 digit atau nama YL) — dipakai Admin agar detail harian area itu ikut dikirim. */
export function detectFocusAreas(message: string, db: any, cleanYlName: (s: string) => string): string[] {
  const found = new Set<string>();
  const msg = String(message || "").toLowerCase();
  (msg.match(/\b2\d{2}\b/g) || []).forEach((c) => {
    if (AREAS.includes(c)) found.add(c);
  });
  const list: any[] = db?.ylList || [];
  list.forEach((y) => {
    const nm = cleanYlName(String(y.nama || "")).toLowerCase();
    const area = String(y.area || "");
    const hitArea = AREAS.find((a) => sameArea(a, area));
    if (nm.length >= 4 && msg.includes(nm) && hitArea) found.add(hitArea);
  });
  return Array.from(found);
}

function txsOfArea(db: any, month: string, area: string, cleanYlName: (s: string) => string): any[] {
  const nm = cleanYlName(areaName(db, area, cleanYlName)).toLowerCase();
  return (db?.transactions || []).filter((t: any) => {
    if (!t?.tanggal || !String(t.tanggal).startsWith(month)) return false;
    return (
      (t.area && sameArea(t.area, area)) ||
      (t.nama && sameArea(areaPrefix(t.nama), area)) ||
      (nm && cleanYlName(String(t.nama || "")).toLowerCase() === nm)
    );
  });
}

const dayOf = (tgl: string): number => parseInt(String(tgl).slice(-2), 10) || 0;
const sum4 = (t: any, p: string) => num(t[`${p}_yo`]) + num(t[`${p}_om`]) + num(t[`${p}_os`]) + num(t[`${p}_yt`]);

export interface AreaMonthFigures {
  area: string;
  nama: string;
  month: string;
  pembagi: number;
  akumulasi: number;
  rata2: number;
  item: { yo: number; om: number; os: number; yt: number };
  target: number;
  bulanLalu: number;
  tahunLalu: number;
  pctTarget: number | null;
  pctBulanLalu: number | null;
  pctTahunLalu: number | null;
  bb: number;
  pctBB: number | null;
  pbPg: number;
  pbSr: number;
  rk: number;
  ra: number;
  rb: number;
  plg: number;
  plgApk: number;
  sampahBotol: number;
  sektor: { rumah: number; pasar: number; sekolah: number; kantor: number; toko: number; ib: number };
  pctRumah: number | null;
  pctToko: number | null;
  harian: { tgl: number; sales: number; yo: number; om: number; os: number; yt: number; bb: number; rk: number; ra: number; rb: number; plg: number; sampah: number }[];
  hariTanpaPenjualan: number[];
  status: string[];
  comp: { factor: number; kotor: number; pph: number; jkk: number; jht: number; bersih: number };
}

export function computeCompensation(db: any, area: string, totalSales: number, avgSales: number) {
  const compCfg = db?.compensationConfig || {
    tiers: [
      { threshold: 0, rate: 338 },
      { threshold: 200, rate: 374 },
      { threshold: 250, rate: 409 },
      { threshold: 280, rate: 417 },
      { threshold: 300, rate: 424 },
      { threshold: 330, rate: 428 },
      { threshold: 350, rate: 432 },
    ],
    pphRate: 2.5,
    jkkJkm: 18800,
    jht: 24000,
  };
  let factor = compCfg.tiers[0].rate;
  const sortedTiers = [...compCfg.tiers].sort((a: any, b: any) => b.threshold - a.threshold);
  for (const t of sortedTiers) {
    if (avgSales >= t.threshold) {
      factor = t.rate;
      break;
    }
  }
  const isZero = totalSales <= 0;
  const kotor = isZero ? 0 : Math.floor(totalSales * factor);
  const pph = isZero ? 0 : Math.floor(kotor * ((compCfg.pphRate || 2.5) / 100));
  const jkk = isZero ? 0 : (compCfg.jkkJkm || 18800);
  const ylItem = (db?.ylList || []).find((y: any) => sameArea(y.area, area));
  const ikutJht = ylItem ? ylItem.ikutJht !== false : true;
  const jhtNominal = ylItem && typeof ylItem.iuranJht === "number" ? ylItem.iuranJht : (compCfg.jht || 24000);
  const jht = (isZero || !ikutJht) ? 0 : jhtNominal;
  const bersih = Math.max(0, kotor - pph - jkk - jht);
  return { factor, kotor, pph, jkk, jht, bersih };
}

/** Angka bulan berjalan satu area. Akumulasi/target/BB diambil dari dashboard (rumus layar), bukan dihitung ulang. */
export function buildAreaMonth(deps: AiContextDeps, month: string, area: string): AreaMonthFigures {
  const { db, dashboard, cleanYlName } = deps;
  const dy = dashboard?.perYL?.[area] || {};
  const nama = areaName(db, area, cleanYlName);
  const txs = txsOfArea(db, month, area, cleanYlName);

  const rMonth = (db?.breakdownRealisasi && db.breakdownRealisasi[month]) || {};
  const rArea = rMonth[area] || {};
  const days = rArea.days && typeof rArea.days === "object" ? rArea.days : {};

  const akumulasi = num(dy.akumulasi);
  const pembagi = num(dy.pembagi) > 0 ? num(dy.pembagi) : num(rArea.pembagiTanggal) > 0 ? num(rArea.pembagiTanggal) : 0;
  const rata2 = pembagi > 0 ? akumulasi / pembagi : 0;

  const sektor = {
    rumah: txs.reduce((s, t) => s + sum4(t, "rmh"), 0),
    pasar: txs.reduce((s, t) => s + sum4(t, "psr"), 0),
    sekolah: txs.reduce((s, t) => s + sum4(t, "skh"), 0),
    kantor: txs.reduce((s, t) => s + sum4(t, "ktr"), 0),
    toko: txs.reduce((s, t) => s + sum4(t, "tk"), 0),
    ib: txs.reduce((s, t) => s + sum4(t, "ib"), 0),
  };
  const sektorTotal = Object.values(sektor).reduce((a, b) => a + b, 0);

  // BB: pakai bbYL dari dashboard (jumlah bb_yo+bb_om+bb_os+bb_yt) = sama dengan kolom BB akm di Evaluasi
  const bb = dy.bbYL !== undefined ? num(dy.bbYL) : txs.reduce((s, t) => s + sum4(t, "bb"), 0);

  // Harian: penjualan dari Realisasi (sumber akumulasi), sisanya dari transaksi tanggal tsb
  const byDay: Record<number, any> = {};
  Object.keys(days).forEach((k) => {
    const d = parseInt(k, 10);
    if (!d) return;
    const o = days[k] || {};
    const yo = num(o.yo), om = num(o.om), os = num(o.os), yt = num(o.yt);
    byDay[d] = { tgl: d, sales: yo + om + os + yt, yo, om, os, yt, bb: 0, rk: 0, ra: 0, rb: 0, plg: 0, sampah: 0 };
  });
  txs.forEach((t) => {
    const d = dayOf(t.tanggal);
    if (!d) return;
    if (!byDay[d]) byDay[d] = { tgl: d, sales: 0, yo: 0, om: 0, os: 0, yt: 0, bb: 0, rk: 0, ra: 0, rb: 0, plg: 0, sampah: 0 };
    byDay[d].bb += sum4(t, "bb");
    byDay[d].rk += num(t.f_rk);
    byDay[d].ra += num(t.f_ra);
    byDay[d].rb += num(t.f_rb);
    byDay[d].plg += num(t.f_plg);
    byDay[d].sampah += num(t.apk_botol);
  });
  const harian = Object.values(byDay).sort((a: any, b: any) => a.tgl - b.tgl) as AreaMonthFigures["harian"];
  const hariTanpaPenjualan: number[] = [];
  for (let d = 1; d <= pembagi; d++) {
    if (!byDay[d] || byDay[d].sales <= 0) hariTanpaPenjualan.push(d);
  }

  const target = num(dy.targetYL);
  const bulanLalu = num(dy.bulanLaluYL);
  const tahunLalu = num(dy.tahunLaluYL);
  const pRumah = pct(sektor.rumah, sektorTotal);
  const pToko = pct(sektor.toko, sektorTotal);
  const pBB = pct(bb, akumulasi + bb);

  // Status terhadap standar DP (dihitung di sini supaya AI tidak menebak)
  const status: string[] = [];
  if (pembagi > 0) status.push(rata2 >= 250 ? "Rata2 >= 250 (kategori Mandiri)" : "Rata2 < 250 (kategori Binaan/perlu dievaluasi)");
  if (pToko !== null) status.push(pToko <= 30 ? "Toko <= 30% (aman)" : "Toko > 30% (melebihi batas)");
  if (pBB !== null) status.push(pBB <= 10 ? "BB <= 10% (aman)" : "BB > 10% (melebihi batas)");
  if (pRumah !== null) status.push(pRumah >= 65 ? "Rumah >= 65% (bagus)" : pRumah >= 55 ? "Rumah 55-65% (memenuhi minimal)" : "Rumah < 55% (di bawah minimal)");

  return {
    area,
    nama,
    month,
    pembagi,
    akumulasi,
    rata2: r1(rata2),
    item: { yo: num(dy.yo), om: num(dy.om), os: num(dy.os), yt: num(dy.yt) },
    target,
    bulanLalu,
    tahunLalu,
    pctTarget: pct(rata2, target),
    pctBulanLalu: pct(rata2, bulanLalu),
    pctTahunLalu: pct(rata2, tahunLalu),
    bb,
    pctBB: pBB,
    pbPg: txs.reduce((s, t) => s + num(t.pb_p), 0),
    pbSr: txs.reduce((s, t) => s + num(t.pb_s), 0),
    rk: txs.reduce((s, t) => s + num(t.f_rk), 0),
    ra: txs.reduce((s, t) => s + num(t.f_ra), 0),
    rb: txs.reduce((s, t) => s + num(t.f_rb), 0),
    plg: txs.reduce((s, t) => s + num(t.f_plg), 0),
    plgApk: txs.reduce((s, t) => s + num(t.apk_plg), 0),
    sampahBotol: txs.reduce((s, t) => s + num(t.apk_botol), 0),
    sektor,
    pctRumah: pRumah,
    pctToko: pToko,
    harian,
    hariTanpaPenjualan,
    status,
    comp: computeCompensation(db, area, akumulasi, rata2),
  };
}

function areaBlock(f: AreaMonthFigures, withDaily: boolean): string {
  const L: string[] = [];
  L.push(`[Area ${f.area} - ${f.nama}] (${monthLabel(f.month)})`);
  L.push(`- Hari pembagi (tanggal berjalan): ${f.pembagi}`);
  L.push(`- Akumulasi penjualan: ${f.akumulasi} btl (YO ${f.item.yo}, OM ${f.item.om}, OS ${f.item.os}, YT ${f.item.yt})`);
  L.push(`- Rata-rata/hari: ${f.rata2} (= ${f.akumulasi} / ${f.pembagi})`);
  L.push(`- Target: ${f.target} -> capaian ${pctStr(f.pctTarget)} | Bulan lalu: ${f.bulanLalu} -> ${pctStr(f.pctBulanLalu)} | Tahun lalu: ${f.tahunLalu} -> ${pctStr(f.pctTahunLalu)}`);
  L.push(`- Estimasi Kompensasi: Rata-rata ${f.rata2} btl/hari (Tier Rp ${f.comp.factor}/btl) | Kotor: Rp ${f.comp.kotor.toLocaleString("id-ID")} | Potongan PPh 2.5%: Rp ${f.comp.pph.toLocaleString("id-ID")} | Iuran JKK/JKM: Rp ${f.comp.jkk.toLocaleString("id-ID")} | Iuran JHT: Rp ${f.comp.jht.toLocaleString("id-ID")} | Estimasi Kompensasi Bersih: Rp ${f.comp.bersih.toLocaleString("id-ID")}`);
  L.push(`- BB: ${f.bb} btl, %BB ${pctStr(f.pctBB)} (= BB / (akumulasi + BB))`);
  L.push(`- Sektor: Rumah ${f.sektor.rumah}, Pasar ${f.sektor.pasar}, Sekolah ${f.sektor.sekolah}, Kantor ${f.sektor.kantor}, Toko ${f.sektor.toko}, IB ${f.sektor.ib} | %Rumah ${pctStr(f.pctRumah)}, %Toko ${pctStr(f.pctToko)}`);
  L.push(`- Kunjungan: RK ${f.rk}, RA ${f.ra}, RB ${f.rb}, PLG ${f.plg} | %RB vs PLG ${pctStr(pct(f.rb, f.plg))} | PLG APK ${f.plgApk}`);
  L.push(`- Sampah botol: ${f.sampahBotol} | Propaganda (PB) Pg ${f.pbPg}, Sr ${f.pbSr}`);
  if (f.status.length) L.push(`- Status vs standar: ${f.status.join("; ")}`);
  if (f.hariTanpaPenjualan.length) L.push(`- Tanggal tanpa penjualan (s/d tanggal ${f.pembagi}): ${f.hariTanpaPenjualan.join(", ")}`);
  if (withDaily && f.harian.length) {
    L.push(`- Rincian harian (tgl: total [YO/OM/OS/YT] bb rk/ra/rb/plg sampah):`);
    f.harian.forEach((d) => L.push(`  ${d.tgl}: ${d.sales} [${d.yo}/${d.om}/${d.os}/${d.yt}] bb ${d.bb} ${d.rk}/${d.ra}/${d.rb}/${d.plg} s${d.sampah}`));
  }
  return L.join("\n");
}

/** Ringkasan satu area pada satu arsip bulan (dari getAllMonthlyArchivesSummary). */
function archiveAreaLine(arc: any, area: string, db?: any): string {
  const y = arc?.perYL?.[area];
  if (!y) return `  ${monthLabel(arc.monthKey)}: tidak ada data area ${area} di arsip`;
  const cap = y.targetYL > 0 ? `${r1((y.rata2 / y.targetYL) * 100)}%` : "-";
  const comp = computeCompensation(db, area, num(y.akumulasi), num(y.rata2));
  return `  ${monthLabel(arc.monthKey)}: rata2 ${y.rata2}, target ${y.targetYL} (capaian ${cap}), akumulasi ${y.akumulasi}, kompensasi bersih Rp ${comp.bersih.toLocaleString("id-ID")} (kotor Rp ${comp.kotor.toLocaleString("id-ID")}, tarif Rp ${comp.factor}/btl, PPh Rp ${comp.pph.toLocaleString("id-ID")}, JKK Rp ${comp.jkk.toLocaleString("id-ID")}, JHT Rp ${comp.jht.toLocaleString("id-ID")}), BB ${y.bb}, sampah botol ${y.sampahBotol}, %Rumah ${y.persenRumah}%, %RB vs PLG ${y.persenRbVsPlg}%, PB ${y.propaganda}, hari kerja ${arc.hariKerja}`;
}

/** Total harian satu area dari data harian arsip (breakdownRealisasiMap). */
function dailyFromMap(map: any, area: string): string {
  const a = map?.[area];
  const days = a?.days && typeof a.days === "object" ? a.days : null;
  if (!days) return "";
  const rows = Object.keys(days)
    .map((k) => ({ d: parseInt(k, 10), s: num(days[k]?.yo) + num(days[k]?.om) + num(days[k]?.os) + num(days[k]?.yt) }))
    .filter((x) => x.d > 0)
    .sort((x, y) => x.d - y.d);
  if (!rows.length) return "";
  return rows.map((x) => `${x.d}:${x.s}`).join(", ");
}

export interface AiContextResult {
  text: string;
  meta: { role: AiRole; month: string; area: string | null; nama: string | null; areasDetailed: string[]; archiveMonths: string[] };
}

/**
 * Konteks utama untuk Chatbot AI.
 * - manager: tabel semua area bulan berjalan + detail harian untuk area yang disebut di pertanyaan + semua arsip
 * - yl: detail lengkap area sendiri (termasuk harian) + seluruh arsip area sendiri
 */
export async function buildAiDataContext(
  deps: AiContextDeps,
  opts: { role: AiRole; userName?: string; message?: string; month?: string }
): Promise<AiContextResult> {
  const { db, archives, cleanYlName } = deps;
  const month = opts.month || resolveActiveMonth(db);
  const role: AiRole = opts.role === "manager" ? "manager" : "yl";
  const L: string[] = [];
  const archiveMonths = (archives || []).filter((a) => a.monthKey !== month).map((a) => a.monthKey);

  if (role === "yl") {
    const area = resolveArea(db, opts.userName || "", cleanYlName);
    if (!area) {
      return {
        text: `Area akun "${opts.userName || ""}" tidak dapat dikenali di daftar YL, jadi data tidak dapat dimuat. Sampaikan ini dengan jujur dan jangan mengarang angka.`,
        meta: { role, month, area: null, nama: null, areasDetailed: [], archiveMonths: [] },
      };
    }
    const f = buildAreaMonth(deps, month, area);
    L.push(`BULAN BERJALAN: ${monthLabel(month)}. Data di bawah HANYA milik area ${area} (${f.nama}). Kamu tidak punya data YL lain dan tidak boleh membahas YL lain.`);
    L.push("");
    L.push("=== DATA BULAN BERJALAN ===");
    L.push(areaBlock(f, true));
    L.push("");
    L.push("=== ARSIP BULAN-BULAN LALU (area ini saja) ===");
    const own = (archives || []).filter((a) => a.monthKey !== month);
    if (own.length === 0) L.push("Belum ada arsip tersimpan.");
    for (const arc of own) {
      L.push(archiveAreaLine(arc, area, db));
      try {
        const line = dailyFromMap(await deps.getMonthMap(arc.monthKey), area);
        if (line) L.push(`    harian (tgl:total): ${line}`);
      } catch {
        /* abaikan: arsip tanpa data harian */
      }
    }
    return { text: L.join("\n"), meta: { role, month, area, nama: f.nama, areasDetailed: [area], archiveMonths } };
  }

  // ===== MANAGER =====
  const focus = detectFocusAreas(opts.message || "", db, cleanYlName);
  const dt = deps.dashboard || {};
  L.push(`BULAN BERJALAN: ${monthLabel(month)}. Kamu punya akses penuh data seluruh tim dan 10 area YL.`);
  L.push("");
  L.push("=== RINGKASAN TIM BULAN BERJALAN ===");
  L.push(`- Total penjualan tim: ${num(dt.totalPenjualan)} btl | Rata2 harian tim: ${r1(num(dt.rataHarian))} | Sales/YL: ${r1(num(dt.salesPerYl))} | JWP: ${num(dt.jwp)}`);
  L.push(`- Target tim: ${num(dt.targetTim?.target)} (capaian ${r1(num(dt.vsTarget))}%) | Bulan lalu: ${num(dt.targetTim?.bulanLalu)} (${r1(num(dt.vsBulanLalu))}%) | Tahun lalu: ${num(dt.targetTim?.tahunLalu)} (${r1(num(dt.vsTahunLalu))}%)`);
  L.push(`- BB tim: ${num(dt.bbTimRaw)} | %Rumah ${num(dt.persenRmh)}% | %Toko ${num(dt.persenTk)}% | YL absen: ${num(dt.ylAbsen)} orang, frekuensi absen ${num(dt.frekuensiAbsen)}`);
  L.push("");
  L.push("=== PER AREA BULAN BERJALAN (ringkas) ===");
  const figs = AREAS.map((a) => buildAreaMonth(deps, month, a));
  figs.forEach((f) => L.push(areaBlock(f, focus.includes(f.area))));
  if (focus.length) {
    L.push("");
    L.push(`(Rincian harian disertakan untuk area yang disebut dalam pertanyaan: ${focus.join(", ")}.)`);
  }
  L.push("");
  L.push("=== ARSIP BULAN-BULAN LALU (seluruh tim) ===");
  const past = (archives || []).filter((a) => a.monthKey !== month);
  if (past.length === 0) L.push("Belum ada arsip tersimpan.");
  for (const arc of past) {
    L.push(`[${monthLabel(arc.monthKey)}] total penjualan tim ${num(arc.totalPenjualan)}, rata2 tim ${r1(num(arc.rataHarian))}, target tim ${num(arc.targetTKU?.target)}, hari kerja ${num(arc.hariKerja)}, sampah botol terbanyak: ${arc.topSampah ? `${arc.topSampah.nama} (${arc.topSampah.area}) ${arc.topSampah.jumlah}` : "belum tercatat"}`);
    AREAS.forEach((a) => L.push(archiveAreaLine(arc, a, db)));
    for (const a of focus) {
      try {
        const line = dailyFromMap(await deps.getMonthMap(arc.monthKey), a);
        if (line) L.push(`    harian area ${a} (tgl:total): ${line}`);
      } catch {
        /* abaikan */
      }
    }
  }
  return { text: L.join("\n"), meta: { role, month, area: null, nama: null, areasDetailed: focus, archiveMonths } };
}

/** Bulan-bulan yang tercakup satu periode presentasi. */
export function monthKeysForPeriod(periode: string, year: number, monthIndex?: number): string[] {
  const mm = (i: number) => `${year}-${String(i).padStart(2, "0")}`;
  if (periode === "s1") return [1, 2, 3, 4, 5, 6].map(mm);
  if (periode === "s2") return [7, 8, 9, 10, 11, 12].map(mm);
  if (periode === "tahunan") return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(mm);
  const idx = typeof monthIndex === "number" && monthIndex >= 0 ? monthIndex + 1 : parseInt(String(monthIndex), 10) + 1 || 1;
  return [mm(idx)];
}

/**
 * Konteks untuk Analisa AI di menu Presentasi (bulanan / semester / tahunan).
 * Bulan yang sedang berjalan memakai data hidup; bulan lain memakai arsip.
 * Disesuaikan role: manager = semua area; yl = area sendiri saja.
 */
export async function buildPeriodContext(
  deps: AiContextDeps,
  opts: { role: AiRole; userName?: string; periode: string; year: number; monthIndex?: number }
): Promise<string> {
  const { db, archives, cleanYlName } = deps;
  const active = resolveActiveMonth(db);
  const keys = monthKeysForPeriod(opts.periode, opts.year, opts.monthIndex);
  const area = opts.role === "yl" ? resolveArea(db, opts.userName || "", cleanYlName) : null;
  const L: string[] = [];
  L.push(`PERIODE ANALISA: ${opts.periode === "bulanan" ? monthLabel(keys[0]) : opts.periode === "s1" ? `Semester 1 ${opts.year}` : opts.periode === "s2" ? `Semester 2 ${opts.year}` : `Tahun ${opts.year}`}`);
  L.push(opts.role === "yl" ? `Cakupan: hanya area ${area || "(tidak dikenali)"}.` : "Cakupan: seluruh tim dan 10 area.");
  L.push("");
  for (const key of keys) {
    if (key === active) {
      // Bulan berjalan: wajib pakai data hidup. Dashboard bulan tsb dihitung ulang di server.ts lewat deps.dashboard
      const areas = area ? [area] : AREAS;
      L.push(`[${monthLabel(key)} - BULAN BERJALAN (data hidup)]`);
      areas.forEach((a) => L.push(areaBlock(buildAreaMonth(deps, key, a), false)));
      continue;
    }
    const arc = (archives || []).find((x) => x.monthKey === key);
    if (!arc) {
      L.push(`[${monthLabel(key)}] belum ada arsip tersimpan untuk bulan ini.`);
      continue;
    }
    L.push(`[${monthLabel(key)} - ARSIP] total tim ${num(arc.totalPenjualan)}, rata2 tim ${r1(num(arc.rataHarian))}, target tim ${num(arc.targetTKU?.target)}, hari kerja ${num(arc.hariKerja)}`);
    (area ? [area] : AREAS).forEach((a) => L.push(archiveAreaLine(arc, a)));
  }
  return L.join("\n");
}
