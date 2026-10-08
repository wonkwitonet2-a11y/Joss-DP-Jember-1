// src/components/archive/TargetArsipTahunanModal.tsx
//
// FILE BARU (revisi ke-3) — modal "Arsip Target Tahunan".
//
// Perbaikan revisi ini:
// 1. Semua input diberi warna teks tegas (text-slate-900 + bg-white) supaya kebaca.
// 2. AKM Target = Σ target rata-rata harian (hanya area yang aktif di ylList arsip
//    bulan itu, supaya key basi tidak ikut membengkakkan total) x hari kalender bulan itu.
// 3. Tabel 2 "Vs Tahun Lalu": baris "AKM Realisasi" SEKARANG SAMA PERSIS dengan baris
//    "AKM Realisasi" di Tabel 1 (realisasi tahun berjalan) — bukan realisasi tahun lalu.
//    Yang beda hanya baris "AKM Tahun Lalu" (target x hari, dari arsip tahun lalu).
//
// Semua sel auto-fill dari arsip bulanan (read-only source, tidak pernah ditulis balik),
// tapi tetap bisa diedit manual kalau datanya salah / arsipnya belum ada — nilai manual
// disimpan terpisah di key Supabase baru: annual_target_manual_{year}.

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { NumberInput } from "../NumberInput";
import { formatPercentTruncated } from "../../utils/numberFormat";
import {
  AnnualTargetManualOverride,
  clearAnnualArchiveCache,
  countFilledMonths,
  fetchAkmRealisasiAuto,
  fetchAkmTargetAuto,
  loadAnnualManualOverride,
  saveAnnualManualOverride,
  sumFilledMonths,
  INDO_MONTH_LABELS,
} from "../../lib/annualTargetArchive";

interface TargetArsipTahunanModalProps {
  onClose: () => void;
  defaultYear?: number;
}

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const INPUT_CLASS =
  "w-16 text-center text-[11px] p-1 rounded border border-amber-300 bg-white text-slate-900 font-bold";

function formatNum(v: number): string {
  if (!v && v !== 0) return "0";
  return Math.round(v).toLocaleString("id-ID");
}

function pctBadgeClass(pct: number): string {
  if (pct >= 100) return "bg-green-600 text-white";
  if (pct <= 0) return "bg-slate-300 text-slate-600";
  return "bg-red-600 text-white";
}

export function TargetArsipTahunanModal({ onClose, defaultYear }: TargetArsipTahunanModalProps) {
  const currentYear = defaultYear || new Date().getFullYear();
  const [year, setYear] = useState<number>(currentYear);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Nilai OTOMATIS hasil tarik arsip (referensi, tidak diubah user langsung)
  const [autoAkmTarget, setAutoAkmTarget] = useState<Record<number, number>>({});
  const [autoAkmRealisasi, setAutoAkmRealisasi] = useState<Record<number, number>>({});
  const [autoAkmTahunLalu, setAutoAkmTahunLalu] = useState<Record<number, number>>({});

  const [manual, setManual] = useState<AnnualTargetManualOverride | null>(null);

  const loadYearData = useCallback(async (y: number) => {
    setLoading(true);
    try {
      const [tgtEntries, realEntries, tgtLyEntries, manualOverride] = await Promise.all([
        Promise.all(MONTHS.map(async (m) => [m, await fetchAkmTargetAuto(y, m)] as const)),
        Promise.all(MONTHS.map(async (m) => [m, await fetchAkmRealisasiAuto(y, m)] as const)),
        Promise.all(MONTHS.map(async (m) => [m, await fetchAkmTargetAuto(y - 1, m)] as const)),
        loadAnnualManualOverride(y),
      ]);
      setAutoAkmTarget(Object.fromEntries(tgtEntries));
      setAutoAkmRealisasi(Object.fromEntries(realEntries));
      setAutoAkmTahunLalu(Object.fromEntries(tgtLyEntries));
      setManual(manualOverride);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadYearData(year);
  }, [year, loadYearData]);

  const handleRefresh = () => {
    clearAnnualArchiveCache();
    loadYearData(year);
  };

  // Nilai yang DITAMPILKAN = manual override kalau sudah pernah diedit, kalau belum pakai nilai auto.
  const getDisplayValue = (
    field: keyof Omit<AnnualTargetManualOverride, "year" | "updatedAt">,
    autoMap: Record<number, number>,
    month: number
  ): number => {
    const mm = String(month).padStart(2, "0");
    const manualVal = manual?.[field]?.[mm];
    return manualVal !== undefined ? manualVal : autoMap[month] || 0;
  };

  const updateManualField = (
    field: keyof Omit<AnnualTargetManualOverride, "year" | "updatedAt">,
    month: number,
    value: number
  ) => {
    setManual((prev) => {
      if (!prev) return prev;
      const mm = String(month).padStart(2, "0");
      return { ...prev, [field]: { ...prev[field], [mm]: value } };
    });
  };

  const akmTargetRow = useMemo(
    () => MONTHS.map((m) => getDisplayValue("akmTargetManual", autoAkmTarget, m)),
    [manual, autoAkmTarget]
  );
  const akmRealisasiRow = useMemo(
    () => MONTHS.map((m) => getDisplayValue("akmRealisasiManual", autoAkmRealisasi, m)),
    [manual, autoAkmRealisasi]
  );
  const akmTahunLaluRow = useMemo(
    () => MONTHS.map((m) => getDisplayValue("akmTahunLaluManual", autoAkmTahunLalu, m)),
    [manual, autoAkmTahunLalu]
  );
  // Baris "AKM Realisasi" di Tabel 2 SENGAJA sama persis dengan Tabel 1 — bukan data terpisah.
  const akmRealisasiTahunLaluRow = akmRealisasiRow;

  const totalAkmTarget = sumFilledMonths(akmTargetRow);
  const totalAkmRealisasi = sumFilledMonths(akmRealisasiRow);
  const totalPct = totalAkmTarget > 0 ? (totalAkmRealisasi / totalAkmTarget) * 100 : 0;
  const filledMonths = countFilledMonths(akmTargetRow);

  const totalAkmTahunLalu = sumFilledMonths(akmTahunLaluRow);
  const totalPctTahunLalu =
    totalAkmTahunLalu > 0 ? (totalAkmRealisasi / totalAkmTahunLalu) * 100 : 0;

  // Catatan: sumFilledMonths hanya menjumlah bulan yang nilainya > 0, jadi bulan yang
  // belum terisi (di depan ATAU di belakang bulan terakhir yang terisi) otomatis tidak
  // menambah apa-apa ke total — hasilnya sama saja dengan "akumulasi sampai bulan
  // terakhir yang terisi", tanpa perlu logika tambahan.
  const sem1 = (row: number[]) => sumFilledMonths(row.slice(0, 6));
  const sem2 = (row: number[]) => sumFilledMonths(row.slice(6, 12));
  const pctOf = (realisasi: number, target: number) => (target > 0 ? (realisasi / target) * 100 : 0);

  const sem1AkmTarget = sem1(akmTargetRow);
  const sem2AkmTarget = sem2(akmTargetRow);
  const sem1AkmRealisasi = sem1(akmRealisasiRow);
  const sem2AkmRealisasi = sem2(akmRealisasiRow);
  const sem1Pct = pctOf(sem1AkmRealisasi, sem1AkmTarget);
  const sem2Pct = pctOf(sem2AkmRealisasi, sem2AkmTarget);

  const sem1AkmTahunLalu = sem1(akmTahunLaluRow);
  const sem2AkmTahunLalu = sem2(akmTahunLaluRow);
  const sem1PctTahunLalu = pctOf(sem1AkmRealisasi, sem1AkmTahunLalu);
  const sem2PctTahunLalu = pctOf(sem2AkmRealisasi, sem2AkmTahunLalu);

  const handleSave = async () => {
    if (!manual) return;
    setSaving(true);
    try {
      const res = await saveAnnualManualOverride(manual);
      if (!res.success) throw new Error(res.error || "Gagal menyimpan");
      alert("✅ Data manual Arsip Target Tahunan berhasil disimpan ke Supabase.");
    } catch (e: any) {
      alert(`❌ Gagal menyimpan: ${e.message || "Periksa koneksi Supabase"}`);
    } finally {
      setSaving(false);
    }
  };

  const yearOptions = Array.from({ length: 8 }, (_, i) => currentYear - 5 + i);

  /** Sel ringkasan (Sem 1 / Sem 2 / Tahunan) — angka + badge % di bawahnya, warna teks selalu tegas. */
  const renderSummaryCell = (value: number, pct: number, bgClass: string, key: string) => (
    <td key={key} className={`p-1.5 text-center font-black text-slate-900 border-l-2 border-emerald-300 ${bgClass}`}>
      <div>{formatNum(value)}</div>
      <div className={`text-[9px] font-black mt-0.5 rounded px-1 inline-block ${pctBadgeClass(pct)}`}>
        {pct > 0 ? formatPercentTruncated(pct, 2) : "0,00%"}
      </div>
    </td>
  );

  const renderEditableRow = (
    label: string,
    field: keyof Omit<AnnualTargetManualOverride, "year" | "updatedAt">,
    autoMap: Record<number, number>,
    summary: { sem1: number; sem2: number; year: number; sem1Pct: number; sem2Pct: number; yearPct: number },
    pctRowValues?: number[],
    readOnlyValues?: number[] // kalau diisi, baris ini hanya MENAMPILKAN nilai ini (tidak editable) — dipakai untuk baris AKM Realisasi di Tabel 2 yang harus selalu sama dengan Tabel 1
  ) => {
    const renderMonthCell = (m: number) => {
      const val = readOnlyValues ? readOnlyValues[m - 1] : getDisplayValue(field, autoMap, m);
      return (
        <td key={m} className="p-1 text-center">
          {readOnlyValues ? (
            <div className="w-16 mx-auto text-center text-[11px] p-1 rounded border border-slate-200 bg-slate-50 text-slate-900 font-bold">
              {formatNum(val)}
            </div>
          ) : (
            <NumberInput value={val} onChange={(v) => updateManualField(field, m, v)} className={INPUT_CLASS} />
          )}
          {pctRowValues && (
            <div className={`text-[9px] font-black mt-0.5 rounded px-1 ${pctBadgeClass(pctRowValues[m - 1])}`}>
              {pctRowValues[m - 1] > 0 ? formatPercentTruncated(pctRowValues[m - 1], 2) : "0,00%"}
            </div>
          )}
        </td>
      );
    };

    return (
      <tr className="bg-amber-50/60">
        <td className="p-2 font-black text-slate-700 sticky left-0 bg-amber-50/90">{label}</td>
        {MONTHS.slice(0, 6).map(renderMonthCell)}
        {renderSummaryCell(summary.sem1, summary.sem1Pct, "bg-sky-100", `${label}-sem1`)}
        {MONTHS.slice(6, 12).map(renderMonthCell)}
        {renderSummaryCell(summary.sem2, summary.sem2Pct, "bg-sky-100", `${label}-sem2`)}
        {renderSummaryCell(summary.year, summary.yearPct, "bg-emerald-200", `${label}-year`)}
      </tr>
    );
  };

  const pctPerMonth = akmTargetRow.map((tgt, i) =>
    tgt > 0 ? (akmRealisasiRow[i] / tgt) * 100 : 0
  );
  const pctPerMonthTahunLalu = akmTahunLaluRow.map((tgt, i) =>
    tgt > 0 ? (akmRealisasiTahunLaluRow[i] / tgt) * 100 : 0
  );

  const renderHeaderRow = () => (
    <tr className="bg-green-100">
      <th className="p-2 text-left font-black text-slate-700 sticky left-0 bg-green-100">Baris</th>
      {MONTHS.slice(0, 6).map((m) => (
        <th key={m} className="p-2 font-black text-slate-700 min-w-[60px]">
          {INDO_MONTH_LABELS[m - 1]}
        </th>
      ))}
      <th className="p-2 font-black text-slate-900 min-w-[74px] bg-sky-200 border-l-2 border-emerald-300">
        Sem 1
      </th>
      {MONTHS.slice(6, 12).map((m) => (
        <th key={m} className="p-2 font-black text-slate-700 min-w-[60px]">
          {INDO_MONTH_LABELS[m - 1]}
        </th>
      ))}
      <th className="p-2 font-black text-slate-900 min-w-[74px] bg-sky-200 border-l-2 border-emerald-300">
        Sem 2
      </th>
      <th className="p-2 font-black text-slate-900 min-w-[80px] bg-emerald-300 border-l-2 border-emerald-400">
        Tahunan
      </th>
    </tr>
  );

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-[100] flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white rounded-2xl w-full max-w-6xl max-h-[95vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 flex items-center justify-between gap-3 bg-emerald-50">
          <div>
            <h2 className="text-sm font-black text-emerald-900">📊 Arsip Target Tahunan</h2>
            <p className="text-[10px] text-slate-500 font-medium">
              AKM Target vs AKM Realisasi per bulan &amp; total tahunan — auto dari arsip, tetap bisa diedit manual.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-800 font-black text-lg leading-none px-2"
          >
            ✕
          </button>
        </div>

        {/* Toolbar */}
        <div className="p-3 border-b border-slate-100 flex flex-wrap items-center gap-2 bg-white">
          <span className="text-xs font-bold text-slate-600">Tahun:</span>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="p-1.5 text-xs font-bold bg-slate-50 rounded-xl border border-slate-200 text-slate-800 outline-none"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>

          <button
            onClick={handleRefresh}
            disabled={loading}
            className="ml-1 text-[11px] font-bold px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-50"
          >
            🔄 Refresh / Sync Ulang
          </button>

          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="text-[11px] font-bold px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
          >
            {saving ? "Menyimpan..." : "💾 Simpan Isian Manual"}
          </button>

          <span className="text-[10px] text-slate-400 font-medium ml-auto">
            {filledMonths}/12 bulan terisi
          </span>
        </div>

        {/* Body */}
        <div className="overflow-auto p-3 space-y-6">
          {loading || !manual ? (
            <div className="text-center py-10 text-sm text-slate-400 font-bold">Memuat data...</div>
          ) : (
            <>
              {/* TABEL 1: Vs Target */}
              <div>
                <h3 className="text-xs font-black text-slate-800 mb-2 bg-green-100 inline-block px-2 py-1 rounded">
                  Vs Target — Tahun {year}
                </h3>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-[11px] border-collapse">
                    <thead>{renderHeaderRow()}</thead>
                    <tbody>
                      {renderEditableRow("AKM Target", "akmTargetManual", autoAkmTarget, {
                        sem1: sem1AkmTarget,
                        sem2: sem2AkmTarget,
                        year: totalAkmTarget,
                        sem1Pct,
                        sem2Pct,
                        yearPct: totalPct,
                      })}
                      {renderEditableRow(
                        "AKM Realisasi",
                        "akmRealisasiManual",
                        autoAkmRealisasi,
                        {
                          sem1: sem1AkmRealisasi,
                          sem2: sem2AkmRealisasi,
                          year: totalAkmRealisasi,
                          sem1Pct,
                          sem2Pct,
                          yearPct: totalPct,
                        },
                        pctPerMonth
                      )}
                    </tbody>
                  </table>
                </div>
                <p className="text-[9.5px] text-slate-400 font-medium mt-1.5">
                  Persentase kecil di bawah AKM Realisasi = AKM Realisasi ÷ AKM Target bulan itu. Total tahunan:{" "}
                  <span className={`font-black ${totalPct >= 100 ? "text-green-600" : "text-red-600"}`}>
                    {formatPercentTruncated(totalPct, 2)}
                  </span>
                </p>
              </div>

              {/* TABEL 2: Vs Tahun Lalu */}
              <div>
                <h3 className="text-xs font-black text-slate-800 mb-2 bg-green-100 inline-block px-2 py-1 rounded">
                  Vs Tahun Lalu — {year - 1}
                </h3>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-[11px] border-collapse">
                    <thead>{renderHeaderRow()}</thead>
                    <tbody>
                      {renderEditableRow("AKM Tahun Lalu", "akmTahunLaluManual", autoAkmTahunLalu, {
                        sem1: sem1AkmTahunLalu,
                        sem2: sem2AkmTahunLalu,
                        year: totalAkmTahunLalu,
                        sem1Pct: sem1PctTahunLalu,
                        sem2Pct: sem2PctTahunLalu,
                        yearPct: totalPctTahunLalu,
                      })}
                      {renderEditableRow(
                        "AKM Realisasi",
                        "akmRealisasiManual",
                        autoAkmRealisasi,
                        {
                          sem1: sem1AkmRealisasi,
                          sem2: sem2AkmRealisasi,
                          year: totalAkmRealisasi,
                          sem1Pct: sem1PctTahunLalu,
                          sem2Pct: sem2PctTahunLalu,
                          yearPct: totalPctTahunLalu,
                        },
                        pctPerMonthTahunLalu,
                        akmRealisasiTahunLaluRow
                      )}
                    </tbody>
                  </table>
                </div>
                <p className="text-[9.5px] text-slate-400 font-medium mt-1.5">
                  Baris "AKM Tahun Lalu" ditarik dari arsip <b>tahun {year - 1}</b> (target x hari kalender) —
                  bisa diedit manual kalau arsipnya belum ada. Baris "AKM Realisasi" di sini{" "}
                  <b>selalu sama persis</b> dengan AKM Realisasi di Tabel 1 (realisasi tahun {year}), edit di
                  Tabel 1 kalau mau ubah. Total tahunan:{" "}
                  <span className={`font-black ${totalPctTahunLalu >= 100 ? "text-green-600" : "text-red-600"}`}>
                    {formatPercentTruncated(totalPctTahunLalu, 2)}
                  </span>
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
