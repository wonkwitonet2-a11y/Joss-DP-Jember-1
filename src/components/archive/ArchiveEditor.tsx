import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Lock, Save, ArrowLeft, RefreshCw, AlertTriangle, FileBox, Calculator, PenTool, CheckCircle, Plus, Trash2 } from "lucide-react";
import { loadFromSupabase, saveToSupabase, deleteFromSupabase } from "../../lib/supabaseClient";
import { cleanYlName } from "../../types";

import { ManagerDashboardTab } from "../ManagerDashboardTab";
import { LhppRealisasiView } from "../LhppRealisasiView";
import { PlgPjlView } from "../PlgPjlView";
import { BreakdownGridRow } from "../BreakdownGridRow";
import { TargetManagerRow } from "../TargetManagerRow";
import { lookupHistoricalTargetRealization, computeMonthlyRata2DataFromSnapshot } from "../../lib/targetArchiveLookup";
import { Rata2BulananTab } from "../Rata2BulananTab";
import { EvaluasiView } from "../EvaluasiView";
const SalesRecordTKU = React.lazy(() => import("../SalesRecordTKU"));
import { GridSelectionToolbar } from "../GridSelectionToolbar";
import { SpreadsheetInputBar } from "../SpreadsheetInputBar";
import { ClipboardFallbackModal } from "../ClipboardFallbackModal";
import { useSimpleGrid } from "../useSimpleGrid";
import { formatTruncated, formatPercentTruncated, truncateDecimal } from "../../utils/numberFormat";


// Custom Mock Fetch Handler
function createMockHandler(snapshotRef, setSnapshot) {
  return async (url, options) => {
    const s = snapshotRef.current;
    if (!s) return undefined;

    const urlObj = new URL(url, "http://localhost");
    const path = urlObj.pathname;

    if (path === "/api/getBreakdownPlan") {
      return { ok: true, breakdownPlan: s.breakdownPlanMap || {}, breakdownRealisasi: s.breakdownRealisasiMap || {} };
    }
    if (path === "/api/saveBreakdownPlan") {
      try {
         const body = JSON.parse(options.body);
         setSnapshot(prev => ({ ...prev, breakdownRealisasiMap: body.breakdownRealisasi }));
         return { ok: true };
      } catch(e) { return { ok: false }; }
    }
    if (path === "/api/getLhppPdm") {
      const month = urlObj.searchParams.get("month") || new Date().toISOString().slice(0, 7);
      const day = parseInt(urlObj.searchParams.get("day") || String(new Date().getDate()), 10);
      const dayPadded = String(day).padStart(2, '0');
      const dateKey = urlObj.searchParams.get("tanggal") || `${month}-${dayPadded}`;
      
      let prevPdmMap: Record<string, any> = {};
      let prevSourceDate: string | null = null;
      
      const allSavedDates = Object.keys(s.lhppPdm || {})
        .filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k) && k < dateKey && Object.keys(s.lhppPdm[k] || {}).length > 0)
        .sort()
        .reverse();

      for (const prevKey of allSavedDates) {
        const dayData = s.lhppPdm[prevKey];
        if (!dayData || typeof dayData !== "object") continue;
        let hasAdded = false;
        Object.keys(dayData).forEach((ylKey) => {
          const hi = dayData[ylKey]?.pdmHariIni;
          if (!prevPdmMap[ylKey] && hi && (hi.yo > 0 || hi.om > 0 || hi.os > 0 || hi.yt > 0)) {
            prevPdmMap[ylKey] = {
              yo: Number(hi.yo || 0),
              om: Number(hi.om || 0),
              os: Number(hi.os || 0),
              yt: Number(hi.yt || 0)
            };
            hasAdded = true;
          }
        });
        if (hasAdded && !prevSourceDate) prevSourceDate = prevKey;
      }

      if (allSavedDates.length > 0) {
        const nearestDate = allSavedDates[0];
        const nearestData = s.lhppPdm[nearestDate] || {};
        Object.keys(nearestData).forEach((ylKey) => {
          if (!prevPdmMap[ylKey] && nearestData[ylKey]?.pdmHariIni) {
            const hi = nearestData[ylKey].pdmHariIni;
            prevPdmMap[ylKey] = {
              yo: Number(hi.yo || 0),
              om: Number(hi.om || 0),
              os: Number(hi.os || 0),
              yt: Number(hi.yt || 0)
            };
          }
        });
        if (!prevSourceDate) prevSourceDate = nearestDate;
      }
      
      const currentPdm = (s.lhppPdm && s.lhppPdm[dateKey]) ? s.lhppPdm[dateKey] : null;
      const currentPdmYlm = (s.lhppPdmYlm && s.lhppPdmYlm[dateKey]) ? s.lhppPdmYlm[dateKey] : { yo: 0, om: 0, os: 0, yt: 0 };
      
      return { ok: true, tanggal: dateKey, month, day, pdmYlm: currentPdmYlm, rowsData: currentPdm, prevPdmMap, prevSourceDate };
    }
    
    if (path === "/api/saveLhppPdm") {
      try {
         const body = JSON.parse(options.body);
         setSnapshot((prev) => {
            if (!prev) return prev;
            const next = { ...prev };
            if (!next.lhppPdm) next.lhppPdm = {};
            if (!next.lhppPdmYlm) next.lhppPdmYlm = {};
            if (!next.transactions) next.transactions = [];
            
            const dateKey = body.tanggal || `${body.month}-${String(body.day || 1).padStart(2, '0')}`;
            
            if (body.summary?.pdmYlm) {
               next.lhppPdmYlm[dateKey] = {
                 yo: Number(body.summary.pdmYlm.yo || 0),
                 om: Number(body.summary.pdmYlm.om || 0),
                 os: Number(body.summary.pdmYlm.os || 0),
                 yt: Number(body.summary.pdmYlm.yt || 0),
               };
            }
            if (Array.isArray(body.rows)) {
               if (!next.lhppPdm[dateKey]) next.lhppPdm[dateKey] = {};
               body.rows.forEach((r) => {
                 const areaKey = r.area || "";
                 const ylKey = areaKey || r.nama.replace(/^\d+\s*/, "").toUpperCase();
                 
                 const pdmSebelum = {
                    yo: Number(r.pdmSebelum?.yo || 0),
                    om: Number(r.pdmSebelum?.om || 0),
                    os: Number(r.pdmSebelum?.os || 0),
                    yt: Number(r.pdmSebelum?.yt || 0),
                 };
                 const bb = {
                    yo: Number(r.bb?.yo || 0),
                    om: Number(r.bb?.om || 0),
                    os: Number(r.bb?.os || 0),
                    yt: Number(r.bb?.yt || 0),
                 };
                 const pdmHariIni = {
                    yo: Number(r.pdmHariIni?.yo || 0),
                    om: Number(r.pdmHariIni?.om || 0),
                    os: Number(r.pdmHariIni?.os || 0),
                    yt: Number(r.pdmHariIni?.yt || 0),
                 };

                 next.lhppPdm[dateKey][ylKey] = { pdmSebelum, bb, pdmHariIni };
                 
                 // Patch transactions for bb and tot_*
                 const txIdx = next.transactions.findIndex(t => t.tanggal === dateKey && (t.nama === r.nama || (t.nama && t.nama.includes(ylKey)) || (areaKey && t.area === areaKey)));
                 if (txIdx >= 0) {
                     next.transactions[txIdx] = {
                         ...next.transactions[txIdx],
                         bb_yo: bb.yo, bb_om: bb.om, bb_os: bb.os, bb_yt: bb.yt,
                         tot_yo: Math.max(0, pdmSebelum.yo - bb.yo),
                         tot_om: Math.max(0, pdmSebelum.om - bb.om),
                         tot_os: Math.max(0, pdmSebelum.os - bb.os),
                         tot_yt: Math.max(0, pdmSebelum.yt - bb.yt),
                     };
                 } else {
                     next.transactions.push({
                         area: areaKey,
                         nama: r.nama,
                         tanggal: dateKey,
                         bb_yo: bb.yo, bb_om: bb.om, bb_os: bb.os, bb_yt: bb.yt,
                         tot_yo: Math.max(0, pdmSebelum.yo - bb.yo),
                         tot_om: Math.max(0, pdmSebelum.om - bb.om),
                         tot_os: Math.max(0, pdmSebelum.os - bb.os),
                         tot_yt: Math.max(0, pdmSebelum.yt - bb.yt),
                     });
                 }
               });
            }
            return next;
         });
         return { ok: true };
      } catch(e) { return { ok: false }; }
    }

    if (path === "/api/getPlgPjlDashboard") {
      return { ok: true, ylList: s.ylList || [], transactions: s.transactions || [], potensiTembus: s.potensiTembus || {} };
    }
    if (path === "/api/savePlgPjlManual") {
      try {
         const body = JSON.parse(options.body);
         setSnapshot(prev => {
            const next = { ...prev };
            if (!next.plgPjlManual) next.plgPjlManual = {};
            next.plgPjlManual[body.month] = body.data;
            return next;
         });
         return { ok: true };
      } catch(e) { return { ok: false }; }
    }
    if (path === "/api/saveTransaction") {
      try {
         const body = JSON.parse(options.body);
         setSnapshot(prev => {
            const next = { ...prev };
            if (!next.transactions) next.transactions = [];
            const idx = next.transactions.findIndex(t => t.area === body.area && t.tanggal === body.tanggal);
            if (idx >= 0) next.transactions[idx] = body;
            else next.transactions.push(body);
            return next;
         });
         return { ok: true };
      } catch(e) { return { ok: false }; }
    }

    return undefined;
  };
}


function computeArchiveDashboardData(s: any, ylList: any[]): any {
  const txs = s.transactions || [];
  const targetYL = s.targetTKU ? (s.targetYLMap || {}) : (s.targetYL || {});
  const realisasiMonth = s.breakdownRealisasiMap || {};
  const currentMonth = txs.length > 0 ? txs[txs.length - 1].tanggal.substring(0, 7) : new Date().toISOString().substring(0, 7);
  const currentMonthTxs = txs.filter((t: any) => t.tanggal.startsWith(currentMonth));
  
  let sRmh = 0, sPsr = 0, sSkh = 0, sKtr = 0, sTk = 0, sIb = 0;
  let totalBb = 0;

  currentMonthTxs.forEach((t: any) => {
    sRmh += (t.rmh_yo||0) + (t.rmh_om||0) + (t.rmh_os||0) + (t.rmh_yt||0);
    sPsr += (t.psr_yo||0) + (t.psr_om||0) + (t.psr_os||0) + (t.psr_yt||0);
    sSkh += (t.skh_yo||0) + (t.skh_om||0) + (t.skh_os||0) + (t.skh_yt||0);
    sKtr += (t.ktr_yo||0) + (t.ktr_om||0) + (t.ktr_os||0) + (t.ktr_yt||0);
    sTk += (t.tk_yo||0) + (t.tk_om||0) + (t.tk_os||0) + (t.tk_yt||0);
    sIb += (t.ib_yo||0) + (t.ib_om||0) + (t.ib_os||0) + (t.ib_yt||0);
    totalBb += (t.bb_yo||0) + (t.bb_om||0) + (t.bb_os||0) + (t.bb_yt||0);
  });

  let totalYo = 0, totalOm = 0, totalOs = 0, totalYt = 0;
  const perArea: any = {};
  
  Object.keys(realisasiMonth).forEach(area => {
    const areaData = realisasiMonth[area];
    let ayo = 0, aom = 0, aos = 0, ayt = 0;
    const days = areaData && areaData.days ? areaData.days : areaData;
    const pembagiTanggal = (areaData && areaData.pembagiTanggal > 0) ? Number(areaData.pembagiTanggal) : 15;
    
    if (days && typeof days === "object") {
      Object.values(days).forEach((d: any) => {
        if (!d) return;
        ayo += Number(d.yo) || 0;
        aom += Number(d.om) || 0;
        aos += Number(d.os) || 0;
        ayt += Number(d.yt) || 0;
      });
    }
    perArea[area] = { yo: ayo, om: aom, os: aos, yt: ayt, total: ayo + aom + aos + ayt, pembagiTanggal };
    totalYo += ayo; totalOm += aom; totalOs += aos; totalYt += ayt;
  });
  
  const totalPenjualan = totalYo + totalOm + totalOs + totalYt;
  
  const names = ylList.map((y: any) => y.nama);
  const perYL: any = {};
  let teamTotalRata2 = 0;
  let teamTotalYoRata2 = 0;
  let teamTotalOmRata2 = 0;
  let teamTotalOsRata2 = 0;
  let teamTotalYtRata2 = 0;
  let teamTotalPembagi = 0;

  names.forEach(name => {
    let ylItem = ylList.find((y: any) => y.nama === name);
    const area = ylItem ? ylItem.area : name.substring(0, 3);
    const ylTxs = currentMonthTxs.filter((t: any) => t.nama === name || (t.nama && String(t.nama).startsWith(area)));
    
    let ylBb = 0;
    ylTxs.forEach((t: any) => {
      ylBb += (t.bb_yo||0) + (t.bb_om||0) + (t.bb_os||0) + (t.bb_yt||0);
    });

    const areaRealisasi = perArea[area];
    const ylTotal = (areaRealisasi && areaRealisasi.total > 0) ? areaRealisasi.total : 0;
    
    const tgtObj = (targetYL && typeof targetYL === 'object' && (targetYL[`${area}_${currentMonth}`] || targetYL[area])) || {
      target: ylItem?.target ?? 0,
      bln_lalu: ylItem?.bln_lalu ?? 0,
      thn_lalu: ylItem?.thn_lalu ?? 0
    };
    
    const divisor = areaRealisasi ? areaRealisasi.pembagiTanggal : 15;
    const ylRata2 = divisor > 0 ? ylTotal / divisor : 0;
    teamTotalRata2 += ylRata2;
    teamTotalYoRata2 += divisor > 0 && areaRealisasi ? areaRealisasi.yo / divisor : 0;
    teamTotalOmRata2 += divisor > 0 && areaRealisasi ? areaRealisasi.om / divisor : 0;
    teamTotalOsRata2 += divisor > 0 && areaRealisasi ? areaRealisasi.os / divisor : 0;
    teamTotalYtRata2 += divisor > 0 && areaRealisasi ? areaRealisasi.yt / divisor : 0;
    teamTotalPembagi += divisor;

    perYL[area] = {
      nama: name,
      akumulasi: ylTotal,
      yo: areaRealisasi ? areaRealisasi.yo : 0,
      om: areaRealisasi ? areaRealisasi.om : 0,
      os: areaRealisasi ? areaRealisasi.os : 0,
      yt: areaRealisasi ? areaRealisasi.yt : 0,
      rata2: ylRata2,
      hariAktif: divisor,
      pembagi: divisor,
      targetYL: Number(tgtObj.target ?? 0),
      bulanLaluYL: Number(tgtObj.bln_lalu ?? 0),
      tahunLaluYL: Number(tgtObj.thn_lalu ?? 0),
      bbYL: ylBb
    };
  });

  let targetTotalSum = 0, blnLaluTotalSum = 0, thnLaluTotalSum = 0;
  Object.keys(perYL).forEach(area => {
    targetTotalSum += perYL[area].targetYL;
    blnLaluTotalSum += perYL[area].bulanLaluYL;
    thnLaluTotalSum += perYL[area].tahunLaluYL;
  });

  if (s.targetTKU) {
    if (s.targetTKU.target !== undefined && Number(s.targetTKU.target) >= 0 && (Number(s.targetTKU.target) > 0 || targetTotalSum === 0)) targetTotalSum = Number(s.targetTKU.target);
    if (s.targetTKU.bln_lalu !== undefined && Number(s.targetTKU.bln_lalu) >= 0 && (Number(s.targetTKU.bln_lalu) > 0 || blnLaluTotalSum === 0)) blnLaluTotalSum = Number(s.targetTKU.bln_lalu);
    if (s.targetTKU.thn_lalu !== undefined && Number(s.targetTKU.thn_lalu) >= 0 && (Number(s.targetTKU.thn_lalu) > 0 || thnLaluTotalSum === 0)) thnLaluTotalSum = Number(s.targetTKU.thn_lalu);
  }

  const rataHarian = teamTotalRata2;
  const ylCount = names.length > 0 ? names.length : 10;

  let graphDates = [];
  let graphPenjualan = [];
  let graphBalikBotol = [];

  for (let d = 1; d <= 31; d++) {
    let daySales = 0;
    Object.keys(realisasiMonth).forEach(area => {
      const rData = realisasiMonth[area];
      const days = rData && rData.days ? rData.days : rData;
      if (days && days[String(d)]) {
        const dObj = days[String(d)];
        daySales += (Number(dObj.yo) || 0) + (Number(dObj.om) || 0) + (Number(dObj.os) || 0) + (Number(dObj.yt) || 0);
      }
    });

    const dayStrPadded = String(d).padStart(2, '0');
    const matchDatePadded = `${currentMonth}-${dayStrPadded}`;
    
    // Hitung BB dari LHPP PDM
    let bbVal = 0;
    if (s.lhppPdm && s.lhppPdm[matchDatePadded]) {
      const dayLhpp = s.lhppPdm[matchDatePadded];
      Object.keys(dayLhpp).forEach(yl => {
         const bb = dayLhpp[yl]?.bb;
         if (bb) {
            bbVal += (Number(bb.yo)||0) + (Number(bb.om)||0) + (Number(bb.os)||0) + (Number(bb.yt)||0);
         }
      });
    }

    if (daySales > 0 || bbVal > 0) {
      graphDates.push(String(d));
      graphPenjualan.push(daySales);
      graphBalikBotol.push(bbVal);
    }
  }

  return {
    totalPenjualan,
    rataHarian,
    salesPerYl: teamTotalPembagi > 0 ? totalPenjualan / teamTotalPembagi : 0,
    jwp: teamTotalPembagi,
    rataItem: { YO: teamTotalYoRata2, OM: teamTotalOmRata2, OS: teamTotalOsRata2, YT: teamTotalYtRata2 },
    vsTarget: targetTotalSum > 0 ? (rataHarian / targetTotalSum) * 100 : 100,
    vsBulanLalu: blnLaluTotalSum > 0 ? (rataHarian / blnLaluTotalSum) * 100 : 100,
    vsTahunLalu: thnLaluTotalSum > 0 ? (rataHarian / thnLaluTotalSum) * 100 : 100,
    targetTim: { target: targetTotalSum, bulanLalu: blnLaluTotalSum, tahunLalu: thnLaluTotalSum, rata2: rataHarian },
    bbTimRaw: totalBb,
    hariAktif: teamTotalPembagi > 0 ? teamTotalPembagi / ylCount : 0,
    perYL,
    sektorTim: { rumah: sRmh, pasar: sPsr, sekolah: sSkh, kantor: sKtr, toko: sTk, ib: sIb },
    grafikHarian: { tanggal: graphDates, penjualan: graphPenjualan, balikBotol: graphBalikBotol },
    plgPjlManual: s.plgPjlManual || {},
    potensiTembus: s.potensiTembus || {}
  };
}

export function ArchiveEditor({ onClose, motivasiConfig, ylList }) {
  const [pin, setPin] = useState("");
  const [auth, setAuth] = useState(false);
  
  const [archiveList, setArchiveList] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [archiveEvalYl, setArchiveEvalYl] = useState<string>("ALL");
  const [saveMsg, setSaveMsg] = useState("");

  const computedDashboardData = useMemo(() => {
    if (!snapshot || !ylList) return snapshot?.dashboardData || {} as any;
    return computeArchiveDashboardData(snapshot, ylList);
  }, [snapshot, ylList]);

  const snapshotRef = useRef(snapshot);
  useEffect(() => { snapshotRef.current = snapshot; }, [snapshot]);

  useEffect(() => {
    (window as any).__ARCHIVE_MOCK_HANDLER__ = createMockHandler(snapshotRef, setSnapshot);
    return () => { delete (window as any).__ARCHIVE_MOCK_HANDLER__; };
  }, []);

  const handleLogin = () => {
    const storedPin = localStorage.getItem("yakult_manager_pin") || "260399";
    if (pin === storedPin || pin === "260399") {
       setAuth(true);
       loadArchiveList();
    } else {
       alert("PIN Salah!");
    }
  };

  const loadArchiveList = async () => {
     setLoading(true);
     const list = await loadFromSupabase("monthly_archive_list");
     if (Array.isArray(list)) {
        setArchiveList(list);
        if (list.length > 0) setSelectedMonth(list[list.length - 1]);
     }
     setLoading(false);
  };

  const fetchArchive = async () => {
     if (!selectedMonth) return;
     setLoading(true);
     const snapshot = await loadFromSupabase(`monthly_archive_${selectedMonth}`);
     if (snapshot) {
        setSnapshot(snapshot);
     } else {
        alert("Gagal memuat data arsip bulan " + selectedMonth);
        setSnapshot(null);
     }
     setLoading(false);
  };

  const handleSaveToSupabase = async () => {
     if (!snapshot || !selectedMonth) return;
     setSaveMsg("Menyimpan ke Supabase...");

     // BUGFIX: RATA MGG LALU di menu Evaluasi YL untuk 3 kunjungan pertama bulan
     // BERIKUTNYA dihitung dari breakdownRealisasiMap arsip bulan ini (data harian
     // YO/OM/OS/YT per tanggal). Kalau saat "Mode edit manual arsip bulanan" admin
     // cuma mengisi tabel ringkasan (tab Evaluasi/Dashboard) tanpa pernah mengisi
     // breakdown harian per tanggal (tab "BD & Realisasi"), area itu akan punya
     // breakdownRealisasiMap kosong walau tabel ringkasannya sudah lengkap — dan
     // bulan depan RATA MGG LALU-nya akan salah/statis. Peringatkan di sini supaya
     // ketahuan SEBELUM disimpan, bukan setelah YL komplain bulan depan.
     const activeAreas = (ylList || []).filter((y: any) => y.status !== "nonaktif").map((y: any) => String(y.area).substring(0, 3));
     const bdMapAtSave = snapshot.breakdownRealisasiMap || {};
     const areasMissingBreakdown = activeAreas.filter((area: string) => {
       const entry = bdMapAtSave[area];
       const daysObj = entry?.days || entry;
       return !daysObj || Object.keys(daysObj).length === 0;
     });
     if (areasMissingBreakdown.length > 0) {
       console.warn(
         `[ArchiveEditor] Arsip ${selectedMonth} akan disimpan TANPA data breakdown harian (BD & Realisasi) untuk area: ${areasMissingBreakdown.join(", ")}. ` +
         `Akibatnya RATA MGG LALU di awal bulan berikutnya untuk area-area ini tidak akan akurat. Isi tab "BD & Realisasi" untuk area tsb kalau datanya ada.`
       );
     }

     // Hitung / perbarui rata2Data otomatis di snapshot dan juga simpan ke rata2_bulanan_${selectedMonth}
     let snapToSave = { ...snapshot };
     try {
       const calculatedRata2 = computeMonthlyRata2DataFromSnapshot(snapshot, ylList || [], selectedMonth);
       snapToSave.rata2Data = calculatedRata2;
       await saveToSupabase(`rata2_bulanan_${selectedMonth}`, calculatedRata2);
       try {
         localStorage.setItem(`rata2_bulanan_${selectedMonth}`, JSON.stringify(calculatedRata2));
       } catch (e) {}
     } catch (rErr) {
       console.error("Gagal sinkronisasi data rata2 otomatis:", rErr);
     }

     const res = await saveToSupabase(`monthly_archive_${selectedMonth}`, snapToSave);
     if (res.success) {
        setSnapshot(snapToSave);
        setSaveMsg(
          areasMissingBreakdown.length > 0
            ? `✅ Tersimpan, tapi area ${areasMissingBreakdown.join(", ")} belum ada data harian (BD & Realisasi) — RATA MGG LALU bulan depan utk area itu bisa tidak akurat.`
            : "✅ Berhasil disimpan!"
        );
        setTimeout(() => setSaveMsg(""), areasMissingBreakdown.length > 0 ? 8000 : 3000);
     } else {
        setSaveMsg("❌ Gagal menyimpan!");
     }
  };

  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const executeDeleteFromSupabase = async () => {
     if (!selectedMonth) return;

     setShowDeleteModal(false);
     setSaveMsg(`⏳ Menghapus arsip ${selectedMonth} dari Supabase...`);
     setLoading(true);
     try {
       const res = await deleteFromSupabase(`monthly_archive_${selectedMonth}`);
       if (!res.success) throw new Error(res.error || "Gagal menghapus");

       const updatedList = archiveList.filter(m => m !== selectedMonth);
       await saveToSupabase("monthly_archive_list", updatedList);
       setArchiveList(updatedList);
       setSelectedMonth(updatedList[0] || "");
       setSnapshot(null);
       setSaveMsg("🗑️ Arsip berhasil dihapus permanen dari Supabase!");
       setTimeout(() => setSaveMsg(""), 4000);
     } catch (e: any) {
       setSaveMsg("❌ Gagal menghapus: " + (e?.message || e));
       setTimeout(() => setSaveMsg(""), 4000);
     } finally {
       setLoading(false);
     }
  };

  const handleDeleteFromSupabase = () => {
     if (!selectedMonth) return;
     setShowDeleteModal(true);
  };

  
  const [gridSelection, setGridSelection] = useState<any>(null);
  const [isGridDragging, setIsGridDragging] = useState(false);
  const [isFillDragging, setIsFillDragging] = useState(false);
  const [fillHoverCell, setFillHoverCell] = useState<any>(null);
  const [archiveGridMode, setArchiveGridMode] = useState<"BD" | "R">("R");
  const [isBreakdownMenuOpen, setIsBreakdownMenuOpen] = useState(false);
  const [breakdownMenuPos, setBreakdownMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [breakdownClipboardModal, setBreakdownClipboardModal] = useState<{ mode: "copy" | "paste"; text: string } | null>(null);
  const [copiedText, setCopiedText] = useState("");
  const touchStartRef = useRef<any>(null);

  const activeGridMap = archiveGridMode === "BD" ? (snapshot?.breakdownPlanMap || {}) : (snapshot?.breakdownRealisasiMap || {});
  const activeTargetYLMap = snapshot?.targetYLMap || {};

  const handleBreakdownCellChange = (area: any, day: any, item: any, val: any) => {
     setSnapshot(prev => {
        if (!prev) return prev;
        const next = { ...prev };
        const mapKey = archiveGridMode === "BD" ? "breakdownPlanMap" : "breakdownRealisasiMap";
        if (!next[mapKey]) next[mapKey] = {};
        const areaStr = String(area).substring(0, 3);
        if (!next[mapKey][areaStr]) next[mapKey][areaStr] = { pembagiTanggal: 25, days: {} };
        if (!next[mapKey][areaStr].days) next[mapKey][areaStr].days = {};
        if (!next[mapKey][areaStr].days[String(day)]) next[mapKey][areaStr].days[String(day)] = { yo: 0, om: 0, os: 0, yt: 0 };
        next[mapKey][areaStr].days[String(day)][item] = Number(val) || 0;
        return next;
     });
  };

  const handleUpdateTargetYLMap = (updater: any) => {
     setSnapshot(prev => {
        if (!prev) return prev;
        const next = { ...prev };
        if (!next.targetYLMap) next.targetYLMap = {};
        next.targetYLMap = typeof updater === "function" ? updater(next.targetYLMap) : updater;
        return next;
     });
  };

  const activeYLsList = useMemo(() => (ylList || []).filter((y: any) => y.status !== "nonaktif"), [ylList]);

  const getTargetCellValue = useCallback((r: number, c: number) => {
    const yl = activeYLsList[r];
    if (!yl) return 0;
    const data = activeTargetYLMap[yl.area] || { target: 0, bln_lalu: 0, thn_lalu: 0 };
    if (c === 0) return data.target ?? 0;
    if (c === 1) return data.bln_lalu ?? 0;
    if (c === 2) return data.thn_lalu ?? 0;
    return 0;
  }, [activeYLsList, activeTargetYLMap]);

  const setTargetBatchCellValues = useCallback((updates: { r: number; c: number; val: number | string }[]) => {
    handleUpdateTargetYLMap((prev: any) => {
      const next = { ...prev };
      const fields = ["target", "bln_lalu", "thn_lalu"] as const;
      updates.forEach(({ r, c, val }) => {
        const yl = activeYLsList[r];
        if (!yl) return;
        const numVal = typeof val === "number" ? val : parseFloat(String(val).replace(/\./g, "").replace(",", ".")) || 0;
        const existing = next[yl.area] ?? { target: 0, bln_lalu: 0, thn_lalu: 0 };
        next[yl.area] = { ...existing, [fields[c]]: numVal };
      });
      return next;
    });
  }, [activeYLsList]);

  const {
    selection: targetGridSelection,
    setSelection: setTargetGridSelection,
    isMenuOpen: targetIsMenuOpen,
    setIsMenuOpen: setTargetIsMenuOpen,
    menuPos: targetMenuPos,
    getCellProps: getTargetCellProps,
    renderSelectionHandle: renderTargetSelectionHandle,
    activeCell: targetActiveCell,
    setActiveCell: setTargetActiveCell,
    activeCellValue: targetActiveCellValue,
    isActiveCellEditable: isTargetActiveCellEditable,
    handleActiveCellValueChange: handleTargetActiveCellValueChange,
    goToNextCell: goToNextTargetCell,
    goToPrevCell: goToPrevTargetCell,
    selectRow: selectTargetRow,
    handleCopy: handleTargetGridCopy,
    handleCut: handleTargetGridCut,
    handlePaste: handleTargetGridPaste,
    handleClear: handleTargetGridClear,
    clipboardModal: targetClipboardModal,
    confirmManualPaste: targetConfirmManualPaste,
    closeClipboardModal: closeTargetClipboardModal,
  } = useSimpleGrid({
    totalRows: activeYLsList.length,
    totalCols: 3,
    getCellValue: getTargetCellValue,
    setBatchCellValues: setTargetBatchCellValues
  });

  const getArchiveTargetCellLabel = useCallback((r: number, c: number) => {
    const yl = activeYLsList[r];
    const colNames = ["Target Rata-Rata", "Realisasi Bln Lalu", "Realisasi Thn Lalu"];
    if (!yl) return colNames[c] ?? "";
    return `[${yl.area}] ${String(yl.nama || "").replace(/^\d+\s*/, "")} • ${colNames[c] ?? ""}`;
  }, [activeYLsList]);

  // === Grid BD & Realisasi Arsip — sistem spreadsheet baru (useSimpleGrid) ===
  // Menggantikan sistem sentuh LAMA (gridSelection/touchStartRef/handleTouchMoveGrid
  // di bawah) yang terpisah total dari useSimpleGrid dan sudah mati total (tidak ada
  // onTouchStart yang mengisi touchStartRef.current) — sama seperti versi Admin
  // sebelum diperbaiki, sel BD & Realisasi Arsip sebelumnya tidak bisa disentuh sama
  // sekali. State/fungsi lama TIDAK dihapus fisik (masih dipakai di undo/redo &
  // fallback lain), hanya berhenti dioper ke BreakdownGridRow untuk grid ini.
  const BREAKDOWN_ITEMS: Array<"yo" | "om" | "os" | "yt"> = ["yo", "om", "os", "yt"];
  const BREAKDOWN_ITEM_LABELS: Record<string, string> = { yo: "YO", om: "OM", os: "OS", yt: "YT" };

  const getBreakdownCellValue = useCallback((r: number, c: number) => {
    const yl = activeYLsList[r];
    if (!yl) return 0;
    const area = String(yl.area).substring(0, 3);
    const day = Math.floor(c / 4) + 1;
    const item = BREAKDOWN_ITEMS[c % 4];
    const dData = activeGridMap[area]?.days?.[String(day)] || { yo: 0, om: 0, os: 0, yt: 0 };
    return (dData as any)[item] || 0;
  }, [activeYLsList, activeGridMap]);

  const setBreakdownBatchCellValues = useCallback((updates: { r: number; c: number; val: number | string }[]) => {
    setSnapshot(prev => {
      if (!prev) return prev;
      const next = { ...prev };
      const mapKey = archiveGridMode === "BD" ? "breakdownPlanMap" : "breakdownRealisasiMap";
      const copy = { ...(next[mapKey] || {}) };
      updates.forEach(({ r, c, val }) => {
        const yl = activeYLsList[r];
        if (!yl) return;
        const area = String(yl.area).substring(0, 3);
        const day = Math.floor(c / 4) + 1;
        const item = BREAKDOWN_ITEMS[c % 4];
        const ylObj = copy[area] ? { ...copy[area] } : { pembagiTanggal: 25, days: {} };
        const daysObj = { ...ylObj.days };
        const dayObj = daysObj[String(day)] ? { ...daysObj[String(day)] } : { yo: 0, om: 0, os: 0, yt: 0 };
        (dayObj as any)[item] = Number(val) || 0;
        daysObj[String(day)] = dayObj;
        ylObj.days = daysObj;
        copy[area] = ylObj;
      });
      next[mapKey] = copy;
      return next;
    });
  }, [activeYLsList, archiveGridMode]);

  const {
    selection: breakdownGridSelectionNew,
    setSelection: setBreakdownGridSelectionNew,
    activeCell: breakdownActiveCell,
    setActiveCell: setBreakdownActiveCell,
    activeCellValue: breakdownActiveCellValue,
    isActiveCellEditable: isBreakdownActiveCellEditable,
    handleActiveCellValueChange: handleBreakdownActiveCellValueChange,
    goToNextCell: goToNextBreakdownCell,
    goToPrevCell: goToPrevBreakdownCell,
    isMenuOpen: isBreakdownMenuOpenNew,
    setIsMenuOpen: setIsBreakdownMenuOpenNew,
    menuPos: breakdownMenuPosNew,
    getCellProps: getBreakdownCellProps,
    renderSelectionHandle: renderBreakdownSelectionHandle,
    selectRow: selectBreakdownRow,
    handleCopy: handleBreakdownGridCopy,
    handleCut: handleBreakdownGridCut,
    handlePaste: handleBreakdownGridPaste,
    handleClear: handleBreakdownGridClear,
    handleSelectAll: handleBreakdownSelectAllNew,
    clipboardModal: breakdownClipboardModalNew,
    confirmManualPaste: breakdownConfirmManualPaste,
    closeClipboardModal: closeBreakdownClipboardModal,
  } = useSimpleGrid({
    totalRows: activeYLsList.length,
    totalCols: 124, // 31 hari x 4 item (YO/OM/OS/YT)
    getCellValue: getBreakdownCellValue,
    setBatchCellValues: setBreakdownBatchCellValues,
  });

  const getBreakdownCellLabel = useCallback((r: number, c: number) => {
    const yl = activeYLsList[r];
    const day = Math.floor(c / 4) + 1;
    const item = BREAKDOWN_ITEM_LABELS[BREAKDOWN_ITEMS[c % 4]];
    if (!yl) return `Hari ${day} • ${item}`;
    return `[${yl.area}] ${String(yl.nama || "").replace(/^\d+\s*/, "")} • Hari ${day} • ${item}`;
  }, [activeYLsList]);
  // === akhir grid BD & Realisasi Arsip baru ===

  const pembagiAktif = useMemo(() => {
    const pembagiStr = (activeGridMap && Object.keys(activeGridMap).length > 0)
      ? (activeGridMap[Object.keys(activeGridMap)[0]]?.pembagiTanggal ?? 25)
      : 25;
    return Number(pembagiStr) || 25;
  }, [activeGridMap]);

  const handleGlobalPembagiChange = (newVal: number | string) => {
    const num = newVal === "" ? 25 : Math.max(1, Math.min(31, Number(newVal) || 25));
    setSnapshot(prev => {
      if (!prev) return prev;
      const next = { ...prev };
      const mapKey = archiveGridMode === "BD" ? "breakdownPlanMap" : "breakdownRealisasiMap";
      if (!next[mapKey]) next[mapKey] = {};
      const updatedMap = { ...next[mapKey] };
      const activeYLs = (ylList || []).filter((y: any) => y.status !== "nonaktif");
      activeYLs.forEach((y: any) => {
        const area = String(y.area).substring(0, 3);
        if (!updatedMap[area]) updatedMap[area] = { pembagiTanggal: num, days: {} };
        else updatedMap[area] = { ...updatedMap[area], pembagiTanggal: num };
      });
      next[mapKey] = updatedMap;
      return next;
    });
  };

  const dailyGridTotals = useMemo(() => {
    const totals: Record<number, { yo: number; om: number; os: number; yt: number }> = {};
    const activeYLs = (ylList || []).filter((y: any) => y.status !== "nonaktif");
    for (let day = 1; day <= 31; day++) {
      let yo = 0, om = 0, os = 0, yt = 0;
      activeYLs.forEach(yl => {
        const area = String(yl.area).substring(0, 3);
        const dData = activeGridMap?.[area]?.days?.[String(day)];
        if (dData) {
          yo += Number((dData as any).yo) || 0;
          om += Number((dData as any).om) || 0;
          os += Number((dData as any).os) || 0;
          yt += Number((dData as any).yt) || 0;
        }
      });
      totals[day] = { yo, om, os, yt };
    }
    return totals;
  }, [ylList, activeGridMap]);

  const monthlyGridTotals = useMemo(() => {
    let yo = 0, om = 0, os = 0, yt = 0;
    Object.values(dailyGridTotals).forEach((t: any) => {
      yo += t.yo || 0;
      om += t.om || 0;
      os += t.os || 0;
      yt += t.yt || 0;
    });
    return { yo, om, os, yt, total: yo + om + os + yt };
  }, [dailyGridTotals]);

  const monthlyGridStats = useMemo(() => {
    const activeYLs = (ylList || []).filter((y: any) => y.status !== "nonaktif");
    const sumTarget = activeYLs.reduce((sum: number, yl: any) => sum + (Number(activeTargetYLMap?.[yl.area]?.target) || 0), 0);
    const sumBL = activeYLs.reduce((sum: number, yl: any) => sum + (Number(activeTargetYLMap?.[yl.area]?.bln_lalu) || 0), 0);
    const sumTL = activeYLs.reduce((sum: number, yl: any) => sum + (Number(activeTargetYLMap?.[yl.area]?.thn_lalu) || 0), 0);

    const totalTarget = Math.trunc(sumTarget) * pembagiAktif;
    const totalBL = Math.trunc(sumBL) * pembagiAktif;
    const totalTL = Math.trunc(sumTL) * pembagiAktif;

    const grandTotal = monthlyGridTotals.total;

    const pctTgt = totalTarget > 0 ? (grandTotal / totalTarget) * 100 : 100;
    const pctBL = totalBL > 0 ? (grandTotal / totalBL) * 100 : 100;
    const pctTL = totalTL > 0 ? (grandTotal / totalTL) * 100 : 100;

    return {
      sumTarget, sumBL, sumTL,
      totalTarget, totalBL, totalTL,
      pctTgt, pctBL, pctTL
    };
  }, [ylList, activeTargetYLMap, pembagiAktif, monthlyGridTotals]);

  const handleClearSelectedGridCells = () => {
    if (!gridSelection) return;
    const minR = Math.min(gridSelection.startR, gridSelection.endR);
    const maxR = Math.max(gridSelection.startR, gridSelection.endR);
    const minC = Math.min(gridSelection.startC, gridSelection.endC);
    const maxC = Math.max(gridSelection.startC, gridSelection.endC);

    const activeYLs = (ylList || []).filter((y: any) => y.status !== "nonaktif");
    const items: Array<"yo" | "om" | "os" | "yt"> = ["yo", "om", "os", "yt"];

    setSnapshot(prev => {
      if (!prev) return prev;
      const next = { ...prev };
      const mapKey = archiveGridMode === "BD" ? "breakdownPlanMap" : "breakdownRealisasiMap";
      if (!next[mapKey]) next[mapKey] = {};
      const updatedMap = { ...next[mapKey] };

      for (let r = minR; r <= maxR; r++) {
        if (!activeYLs[r]) continue;
        const area = String(activeYLs[r].area).substring(0, 3);
        const ylPlan = updatedMap[area] ? { ...updatedMap[area] } : { pembagiTanggal: 25, days: {} };
        const days = { ...ylPlan.days };

        for (let c = minC; c <= maxC; c++) {
          const day = Math.floor(c / 4) + 1;
          const item = items[c % 4];
          const dayData = days[String(day)] ? { ...days[String(day)] } : { yo: 0, om: 0, os: 0, yt: 0 };
          dayData[item] = 0;
          days[String(day)] = dayData;
        }
        ylPlan.days = days;
        updatedMap[area] = ylPlan;
      }

      next[mapKey] = updatedMap;
      return next;
    });
  };

  const handleSelectAllGridCells = () => {
    const activeYLs = (ylList || []).filter((y: any) => y.status !== "nonaktif");
    if (activeYLs.length === 0) return;
    setGridSelection({
      startR: 0,
      startC: 0,
      endR: activeYLs.length - 1,
      endC: 123
    });
  };

  const handleCopyGridCells = () => {
    const activeYLs = (ylList || []).filter((y: any) => y.status !== "nonaktif");
    let sel = gridSelection;
    if (!sel && activeYLs.length > 0) {
      sel = { startR: 0, startC: 0, endR: activeYLs.length - 1, endC: 123 };
      setGridSelection(sel);
    }
    if (!sel) return;

    const minR = Math.min(sel.startR, sel.endR);
    const maxR = Math.max(sel.startR, sel.endR);
    const minC = Math.min(sel.startC, sel.endC);
    const maxC = Math.max(sel.startC, sel.endC);

    const items: Array<"yo" | "om" | "os" | "yt"> = ["yo", "om", "os", "yt"];
    const rowsText: string[] = [];

    for (let r = minR; r <= maxR; r++) {
      if (!activeYLs[r]) continue;
      const area = String(activeYLs[r].area).substring(0, 3);
      const ylPlan = activeGridMap[area] || { days: {} };
      const colTexts: string[] = [];

      for (let c = minC; c <= maxC; c++) {
        const day = Math.floor(c / 4) + 1;
        const item = items[c % 4];
        const val = ylPlan.days?.[String(day)]?.[item] || 0;
        colTexts.push(String(val));
      }
      rowsText.push(colTexts.join("\t"));
    }

    const clipboardContent = rowsText.join("\n");
    setCopiedText(clipboardContent);

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(clipboardContent).catch(() => {
        setBreakdownClipboardModal({ mode: "copy", text: clipboardContent });
      });
    } else {
      setBreakdownClipboardModal({ mode: "copy", text: clipboardContent });
    }
  };

  const handleMobilePasteClick = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text && text.trim().length > 0) {
          handlePasteIntoGrid(text);
          return;
        }
      }
    } catch (err) {
      console.warn("Direct clipboard read unavailable:", err);
    }
    if (copiedText && copiedText.trim().length > 0) {
      handlePasteIntoGrid(copiedText);
      return;
    }
    setBreakdownClipboardModal({ mode: "paste", text: "" });
  };

  const handlePasteIntoGrid = (pastedText: string, targetStartCell?: { r: number; c: number }) => {
    if (!pastedText) return;
    const activeYLs = (ylList || []).filter((y: any) => y.status !== "nonaktif");
    if (activeYLs.length === 0) return;

    let startR = 0;
    let startC = 0;
    let selHeight = 1;
    let selWidth = 1;

    if (targetStartCell) {
      startR = targetStartCell.r;
      startC = targetStartCell.c;
      if (gridSelection) {
        selHeight = Math.abs(gridSelection.endR - gridSelection.startR) + 1;
        selWidth = Math.abs(gridSelection.endC - gridSelection.startC) + 1;
      }
    } else if (gridSelection) {
      startR = Math.min(gridSelection.startR, gridSelection.endR);
      startC = Math.min(gridSelection.startC, gridSelection.endC);
      selHeight = Math.abs(gridSelection.endR - gridSelection.startR) + 1;
      selWidth = Math.abs(gridSelection.endC - gridSelection.startC) + 1;
    }

    const rawLines = pastedText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    if (rawLines.length > 1 && rawLines[rawLines.length - 1] === "") {
      rawLines.pop();
    }
    if (rawLines.length === 0) return;

    const parsedMatrix: number[][] = rawLines.map(rowStr => {
      const cells = rowStr.split("\t");
      return cells.map(valStr => {
        let cleanStr = valStr.replace(/^[^\d-]+/, "");
        if (cleanStr.includes(",") && cleanStr.includes(".")) {
          cleanStr = cleanStr.split(",")[0].replace(/\./g, "");
        } else if (cleanStr.includes(".")) {
          const parts = cleanStr.split(".");
          if (parts.length > 1 && parts[parts.length - 1].length === 3) {
            cleanStr = parts.join("");
          } else {
            cleanStr = parts[0];
          }
        } else if (cleanStr.includes(",")) {
          cleanStr = cleanStr.split(",")[0];
        }
        const cleanNum = parseInt(cleanStr.replace(/[^0-9-]/g, ""), 10);
        return Math.max(0, cleanNum || 0);
      });
    });

    const pastedHeight = parsedMatrix.length;
    const pastedWidth = Math.max(...parsedMatrix.map(row => row.length));

    const targetHeight = Math.max(pastedHeight, selHeight);
    const targetWidth = Math.max(pastedWidth, selWidth);

    const items: Array<"yo" | "om" | "os" | "yt"> = ["yo", "om", "os", "yt"];

    let maxPastedR = startR;
    let maxPastedC = startC;

    setSnapshot(prev => {
      if (!prev) return prev;
      const next = { ...prev };
      const mapKey = archiveGridMode === "BD" ? "breakdownPlanMap" : "breakdownRealisasiMap";
      if (!next[mapKey]) next[mapKey] = {};
      const copy = { ...next[mapKey] };

      for (let r = 0; r < targetHeight; r++) {
        const targetR = startR + r;
        if (targetR >= activeYLs.length) break;
        maxPastedR = Math.max(maxPastedR, targetR);

        const area = String(activeYLs[targetR].area).substring(0, 3);
        const ylObj = copy[area] ? { ...copy[area] } : { pembagiTanggal: 25, days: {} };
        const daysObj = { ...ylObj.days };

        const pastedR = r % pastedHeight;
        const srcRow = parsedMatrix[pastedR] || [0];
        const rowLen = srcRow.length;

        for (let c = 0; c < targetWidth; c++) {
          const targetC = startC + c;
          if (targetC >= 124) break;
          maxPastedC = Math.max(maxPastedC, targetC);

          const pastedC = c % rowLen;
          const val = srcRow[pastedC] ?? 0;

          const day = Math.floor(targetC / 4) + 1;
          const item = items[targetC % 4];

          const dayObj = daysObj[String(day)] ? { ...daysObj[String(day)] } : { yo: 0, om: 0, os: 0, yt: 0 };
          dayObj[item] = val;
          daysObj[String(day)] = dayObj;
        }

        ylObj.days = daysObj;
        copy[area] = ylObj;
      }

      next[mapKey] = copy;
      return next;
    });

    setGridSelection({
      startR,
      startC,
      endR: maxPastedR,
      endC: maxPastedC
    });
  };

  const handleTouchMoveGrid = (e: any) => {
    if (!e.touches || e.touches.length === 0) return;
    const touch = e.touches[0];

    if (touchStartRef.current) {
      const dx = Math.abs(touch.clientX - touchStartRef.current.clientX);
      const dy = Math.abs(touch.clientY - touchStartRef.current.clientY);
      if (dx > 8 || dy > 8) {
        touchStartRef.current.hasMoved = true;
        if (!isGridDragging && !isFillDragging) {
          // Hanya aktifkan drag seleksi jika sentuhan berawal dari sel yang sudah terpilih (klik kolom lalu ditarik)
          if (touchStartRef.current.isInsideSelection) {
            setIsGridDragging(true);
          } else {
            // User sedang menggeser/scroll tabel - jangan ngeblok
            return;
          }
        }
      }
    }

    if (!isGridDragging && !isFillDragging) return;

    if (e.cancelable) {
      e.preventDefault();
    }
    const rawTarget = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!rawTarget) return;
    const targetEl = (rawTarget instanceof Element ? rawTarget : (rawTarget as any)?.parentElement) as HTMLElement | null;
    if (!targetEl || typeof targetEl.closest !== "function") return;
    const tdEl = targetEl.closest("td[data-r]");
    if (tdEl) {
      const r = parseInt(tdEl.getAttribute("data-r") || "-1", 10);
      const c = parseInt(tdEl.getAttribute("data-c") || "-1", 10);
      if (r >= 0 && c >= 0) {
        if (isFillDragging) {
          setFillHoverCell({ r, c });
        } else {
          setGridSelection(prev => prev ? { ...prev, endR: r, endC: c } : { startR: r, startC: c, endR: r, endC: c });
        }
      }
    }
  };

  // Helper for grids
  
  const currentMonthTotal = useCallback((perYL: any, key: any) => {
    return Object.values(perYL || {}).reduce((acc: any, curr: any) => acc + (Number(curr?.[key]) || 0), 0);
  }, []);

  const calculateSektorTotals = useCallback((dashboard: any) => {
    if (!dashboard) return [];

    let sRmh = Number(dashboard.sektorTim?.rumah) || 0;
    let sPsr = Number(dashboard.sektorTim?.pasar) || 0;
    let sSkh = Number(dashboard.sektorTim?.sekolah) || 0;
    let sKtr = Number(dashboard.sektorTim?.kantor) || 0;
    let sTk  = Number(dashboard.sektorTim?.toko) || 0;
    let sIb  = Number(dashboard.sektorTim?.ib) || 0;

    if (sRmh === 0 && sPsr === 0 && sSkh === 0 && sKtr === 0 && sTk === 0 && sIb === 0 && dashboard.perYL) {
      Object.values(dashboard.perYL).forEach((yl: any) => {
        if (yl.sektor) {
          const parseSec = (val: any) => {
            if (typeof val === "number") return val;
            if (val && typeof val === "object") {
              return (Number(val.yo)||0) + (Number(val.om)||0) + (Number(val.os)||0) + (Number(val.yt)||0);
            }
            return 0;
          };
          sRmh += parseSec(yl.sektor.rmh || yl.sektor.rumah);
          sPsr += parseSec(yl.sektor.psr || yl.sektor.pasar);
          sSkh += parseSec(yl.sektor.skh || yl.sektor.sekolah);
          sKtr += parseSec(yl.sektor.ktr || yl.sektor.kantor);
          sTk  += parseSec(yl.sektor.tk  || yl.sektor.toko);
          sIb  += parseSec(yl.sektor.ib);
        }
      });
    }

    return [
      { name: "RUMAH",   value: Math.round(sRmh), color: "#f59e0b" },
      { name: "PASAR",   value: Math.round(sPsr), color: "#eab308" },
      { name: "SEKOLAH", value: Math.round(sSkh), color: "#0284c7" },
      { name: "KANTOR",  value: Math.round(sKtr), color: "#0f766e" },
      { name: "TOKO",    value: Math.round(sTk),  color: "#c026d3" },
      { name: "IB",      value: Math.round(sIb),  color: "#be123c" }
    ];
  }, []);

  if (!auth) {
     return (
       <div className="fixed inset-0 z-[100] bg-slate-900 flex items-center justify-center p-4">
         <div className="bg-white rounded-3xl p-6 max-w-sm w-full text-center">
            <div className="bg-indigo-100 text-indigo-700 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <FileBox className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-black text-slate-800">Archive Editor</h2>
            <p className="text-xs text-slate-500 mb-6">Masukkan PIN Manager untuk mengakses editor arsip historis.</p>
            <input 
              type="password" 
              value={pin}
              onChange={e => setPin(e.target.value)}
              className="w-full text-center text-2xl font-black tracking-widest border-2 border-slate-200 rounded-xl p-3 outline-none focus:border-indigo-500 mb-4"
              placeholder="******"
            />
            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl text-xs">BATAL</button>
              <button onClick={handleLogin} className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl text-xs">MASUK</button>
            </div>
         </div>
       </div>
     );
  }

  return (
    <div className="fixed inset-0 z-[100] bg-slate-50 overflow-y-auto overflow-x-hidden">
      <header className="bg-gradient-to-r from-indigo-900 to-indigo-800 text-white p-3 sm:p-4 sticky top-0 z-50 shadow-md">
         <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-3 sm:gap-4">
            <div className="flex items-center justify-between gap-3 w-full md:w-auto">
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                <button onClick={onClose} className="p-1.5 sm:p-2 hover:bg-white/10 rounded-xl transition-colors shrink-0" title="Tutup Archive Editor">
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="min-w-0">
                  <h1 className="font-black text-sm sm:text-lg flex items-center gap-1.5 sm:gap-2 tracking-wide">
                    <FileBox className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-300 shrink-0" />
                    <span className="truncate">ARCHIVE EDITOR</span>
                  </h1>
                  <p className="text-[9px] sm:text-[10px] text-indigo-200 font-medium truncate">Mode edit manual arsip bulanan (Save to Supabase)</p>
                </div>
              </div>
            </div>

            <div className="flex items-center flex-wrap gap-2 sm:gap-3 w-full md:w-auto">
               <select 
                 value={selectedMonth} 
                 onChange={e => setSelectedMonth(e.target.value)}
                 className="bg-indigo-950 text-indigo-100 border border-indigo-700 py-1.5 px-2.5 sm:p-2 rounded-xl text-xs font-bold outline-none flex-1 sm:flex-none min-w-[110px]"
               >
                 <option value="">-- Pilih Bulan --</option>
                 {archiveList.map(m => <option key={m} value={m}>{m}</option>)}
               </select>
               <button onClick={fetchArchive} disabled={!selectedMonth || loading} className="bg-indigo-600 hover:bg-indigo-500 p-1.5 sm:p-2 rounded-xl disabled:opacity-50 shrink-0 cursor-pointer" title="Refresh data arsip">
                 <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
               </button>
               <button onClick={handleSaveToSupabase} disabled={!snapshot} className="flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs font-bold shadow-lg shrink-0 cursor-pointer disabled:opacity-50">
                 <Save className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                 <span>SIMPAN ARSIP</span>
               </button>
               <button onClick={handleDeleteFromSupabase} disabled={!selectedMonth || loading} className="flex items-center justify-center gap-1.5 bg-rose-600 hover:bg-rose-500 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-xs font-bold shadow-lg disabled:opacity-50 shrink-0 cursor-pointer" title="Hapus arsip bulan ini dari Supabase">
                 <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                 <span>HAPUS ARSIP</span>
               </button>
            </div>
         </div>
      </header>

      {saveMsg && (
        <div className="bg-indigo-100 text-indigo-800 text-center py-2 text-xs font-bold sticky top-[72px] z-40 border-b border-indigo-200">
          {saveMsg}
        </div>
      )}

      {!snapshot && !loading && (
        <div className="flex flex-col items-center justify-center p-12 sm:p-20 text-slate-400 text-center">
          <FileBox className="w-12 h-12 sm:w-16 sm:h-16 mb-4 opacity-50" />
          <p className="font-bold text-sm sm:text-base">Pilih bulan dan klik tombol Refresh untuk memuat arsip.</p>
        </div>
      )}

      {snapshot && (
        <main className="max-w-7xl mx-auto p-2.5 sm:p-4 flex flex-col md:flex-row gap-3 sm:gap-4 w-full min-w-0">
           {/* Sidebar Tabs */}
           <div className="w-full md:w-48 shrink-0 flex md:flex-col gap-1.5 sm:gap-2 overflow-x-auto pb-1 sm:pb-2 max-w-full">
              {[
                { id: "dashboard", label: "Dashboard", icon: "📊" },
                { id: "evaluasi", label: "Evaluasi", icon: "📋" },
                { id: "lhpp", label: "LHPP & LPPBJ", icon: "📝" },
                { id: "bd_realisasi", label: "BD & Realisasi", icon: "🧩" },
                { id: "target", label: "Target", icon: "🎯" },
                { id: "plg_pjl", label: "PLG & PJL", icon: "🏪" },
                { id: "rata2", label: "Rata-Rata", icon: "📈" },
                { id: "sales_record_tku", label: "Record TKU", icon: "📝" },
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={`p-2.5 sm:p-3 text-left rounded-xl text-xs font-bold flex items-center gap-1.5 sm:gap-2 shrink-0 transition-all ${
                    activeTab === t.id ? "bg-indigo-600 text-white shadow-md" : "bg-white text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <span className="text-base">{t.icon}</span>
                  <span className="whitespace-nowrap">{t.label}</span>
                </button>
              ))}
           </div>

           {/* Content Area */}
           <div className="flex-1 min-w-0 w-full overflow-x-hidden">
              {activeTab === "dashboard" && (
                <ManagerDashboardTab 
                  dashboardData={computedDashboardData}
                  targetTKU={snapshot.targetTKU || { target: 0, bln_lalu: 0, thn_lalu: 0 }}
                  cleanYlName={cleanYlName}
                  currentMonthTotal={currentMonthTotal}
                  calculateSektorTotals={calculateSektorTotals}
                />
              )}
              {activeTab === "evaluasi" && (
                <div className="space-y-4">
                  <div className="bg-white p-3 sm:p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-700">Tampilkan Evaluasi:</span>
                      <select
                        value={archiveEvalYl}
                        onChange={(e) => setArchiveEvalYl(e.target.value)}
                        className="text-xs font-bold bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      >
                        <option value="ALL">🏢 Semua Tim (Mirror Sheet Table)</option>
                        {(ylList || []).filter((y: any) => y.status !== "nonaktif").map((yl: any) => (
                          <option key={yl.area} value={yl.nama}>
                            Area {yl.area} - {cleanYlName(yl.nama)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md">
                      📅 Periode Arsip: {selectedMonth}
                    </div>
                  </div>

                  {archiveEvalYl === "ALL" ? (
                    <EvaluasiView
                      evaluasiData={snapshot.evaluasiData}
                      globalMonth={selectedMonth}
                      role="manager"
                      transactions={snapshot.transactions}
                    />
                  ) : (
                    <EvaluasiView
                      evaluasiData={snapshot.evaluasiData}
                      globalMonth={selectedMonth}
                      currentYlName={archiveEvalYl}
                      currentYlArea={(() => {
                        const matchingYl = (ylList || []).find((y: any) => y.nama === archiveEvalYl);
                        return matchingYl ? String(matchingYl.area).substring(0, 3) : "";
                      })()}
                      role="yl"
                      ylBreakdownRealisasi={
                        (() => {
                          const matchingYl = (ylList || []).find((y: any) => y.nama === archiveEvalYl);
                          const area = matchingYl ? String(matchingYl.area).substring(0, 3) : "";
                          return snapshot.breakdownRealisasiMap?.[area] || snapshot.breakdownRealisasiMap?.[archiveEvalYl];
                        })()
                      }
                      transactions={snapshot.transactions}
                    />
                  )}
                </div>
              )}
              {activeTab === "lhpp" && (
                <LhppRealisasiView ylList={ylList} selectedMonth={selectedMonth} motivasiConfig={motivasiConfig} />
              )}
              {activeTab === "plg_pjl" && (
                
                <div>
                   <div className="flex items-center justify-between mb-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                     <p className="text-xs font-bold text-slate-600">
                       💡 Mode Edit Aktif: Anda dapat klik kolom "AKM" untuk mengetik manual, atau <strong className="text-sky-600">Paste (Ctrl+V)</strong> sekumpulan data dari Spreadsheet (Excel/Google Sheets) ke sel AKM RUMAH YO dsb.
                     </p>
                   </div>
                   <PlgPjlView 
                     ylList={ylList} 
                     historicalMonth={selectedMonth} 
                     historicalData={{
                       ...snapshot,
                        editableAkm: true,
                        onAkmChange: (ylKey, secKey, prodCode, val) => {
                           const txKey = `${secKey}_${prodCode}`;
                           const dummyDate = selectedMonth + "-99";
                           const areaMatch = String(ylKey).match(/^(\d{3})/);
                           const area = areaMatch ? areaMatch[1] : "";
                           const name = cleanYlName(ylKey).toUpperCase().trim();

                           const matchesThisYl = (t) => {
                             if (!t) return false;
                             const tArea = String(t.area || "").trim();
                             const tNama = String(t.nama || "").trim();
                             const tClean = cleanYlName(tNama).toUpperCase().trim();
                             if (area && (tArea === area || tNama.startsWith(area))) return true;
                             if (name && (tClean === name || tNama === ylKey)) return true;
                             return false;
                           };

                           setSnapshot(prev => {
                             const next = { ...prev };
                             if (!next.transactions) next.transactions = [];
                             
                             let otherSum = 0;
                             next.transactions.forEach(t => {
                               if (t.tanggal !== dummyDate && matchesThisYl(t)) {
                                 otherSum += (Number(t[txKey]) || 0);
                               }
                             });
                             
                             let dummyTx = next.transactions.find(t => t.tanggal === dummyDate && matchesThisYl(t));
                             if (!dummyTx) {
                                dummyTx = { id: "manual-" + (area || name || "yl"), tanggal: dummyDate, nama: ylKey, area: area || "" };
                                next.transactions.push(dummyTx);
                             } else {
                                if (area && !dummyTx.area) dummyTx.area = area;
                                dummyTx.nama = ylKey;
                             }
                             dummyTx[txKey] = Number(val || 0) - otherSum;
                             return next;
                           });
                        },
                        
                        onTxFieldChange: (ylKey, field, val) => {
                           const dummyDate = selectedMonth + "-99";
                           const areaMatch = String(ylKey).match(/^(\d{3})/);
                           const area = areaMatch ? areaMatch[1] : "";
                           const name = cleanYlName(ylKey).toUpperCase().trim();

                           const matchesThisYl = (t) => {
                             if (!t) return false;
                             const tArea = String(t.area || "").trim();
                             const tNama = String(t.nama || "").trim();
                             const tClean = cleanYlName(tNama).toUpperCase().trim();
                             if (area && (tArea === area || tNama.startsWith(area))) return true;
                             if (name && (tClean === name || tNama === ylKey)) return true;
                             return false;
                           };

                           setSnapshot(prev => {
                             const next = { ...prev };
                             if (!next.transactions) next.transactions = [];
                             
                             // Fields that contribute to the total
                             let fieldsToSum = [field];
                             let fieldsToZero = [];
                             if (field === "bb_yo") {
                                fieldsToSum = ["bb_yo", "bb_om", "bb_os", "bb_yt"];
                                fieldsToZero = ["bb_om", "bb_os", "bb_yt"];
                             } else if (field === "pb_p") {
                                fieldsToSum = ["pb_p", "pb_s"];
                                fieldsToZero = ["pb_s"];
                             }
                             
                             let otherSum = 0;
                             next.transactions.forEach(t => {
                                if (t.tanggal !== dummyDate && matchesThisYl(t)) {
                                   fieldsToSum.forEach(f => {
                                      otherSum += (Number(t[f]) || 0);
                                   });
                                }
                             });
                             
                             let dummyTx = next.transactions.find(t => t.tanggal === dummyDate && matchesThisYl(t));
                             if (!dummyTx) {
                                dummyTx = { id: "manual-" + (area || name || "yl"), tanggal: dummyDate, nama: ylKey, area: area || "" };
                                next.transactions.push(dummyTx);
                             } else {
                                if (area && !dummyTx.area) dummyTx.area = area;
                                dummyTx.nama = ylKey;
                             }
                             
                             dummyTx[field] = Number(val || 0) - otherSum;
                             fieldsToZero.forEach(f => {
                                dummyTx[f] = 0;
                             });
                             return next;
                           });
                        },
                        onPotensiChange: (ylKey, field, val) => {
                           const cleanYl = cleanYlName(ylKey).toUpperCase().trim();
                           setSnapshot(prev => {
                             const next = { ...prev };
                             if (!next.potensiTembus) next.potensiTembus = {};
                             if (!next.potensiTembus[selectedMonth]) next.potensiTembus[selectedMonth] = {};
                             
                             const monthData = next.potensiTembus[selectedMonth];
                             if (!monthData[cleanYl]) monthData[cleanYl] = { nama: ylKey };
                             monthData[cleanYl][field] = Number(val || 0);
                             return next;
                           });
                        },
                        onAkmPaste: (e, ylKey, startIndex) => {
                           e.preventDefault();
                           const pastedData = e.clipboardData.getData("text/plain");
                           const rows = pastedData.split(/\r?\n/).filter(r => r.trim() !== "");
                           const parsedValues = rows.map(r => parseInt(r.replace(/\D/g, "")) || 0);
                           if (parsedValues.length === 0) return;

                           const areaMatch = String(ylKey).match(/^(\d{3})/);
                           const area = areaMatch ? areaMatch[1] : "";
                           const name = cleanYlName(ylKey).toUpperCase().trim();

                           const matchesThisYl = (t) => {
                             if (!t) return false;
                             const tArea = String(t.area || "").trim();
                             const tNama = String(t.nama || "").trim();
                             const tClean = cleanYlName(tNama).toUpperCase().trim();
                             if (area && (tArea === area || tNama.startsWith(area))) return true;
                             if (name && (tClean === name || tNama === ylKey)) return true;
                             return false;
                           };

                           const txKeys = [
                             "rmh_yo", "rmh_om", "rmh_os", "rmh_yt",
                             "psr_yo", "psr_om", "psr_os", "psr_yt",
                             "skh_yo", "skh_om", "skh_os", "skh_yt",
                             "ktr_yo", "ktr_om", "ktr_os", "ktr_yt",
                             "tk_yo",  "tk_om",  "tk_os",  "tk_yt",
                             "ib_yo",  "ib_om",  "ib_os",  "ib_yt",
                           ];

                           const dummyDate = selectedMonth + "-99";
                           setSnapshot(prev => {
                             const next = { ...prev };
                             if (!next.transactions) next.transactions = [];

                             let otherSum = {};
                             txKeys.forEach(k => otherSum[k] = 0);
                             next.transactions.forEach(t => {
                               if (t.tanggal !== dummyDate && matchesThisYl(t)) {
                                 txKeys.forEach(k => {
                                   otherSum[k] += (Number(t[k]) || 0);
                                 });
                               }
                             });

                             let dummyTx = next.transactions.find(t => t.tanggal === dummyDate && matchesThisYl(t));
                             if (!dummyTx) {
                                dummyTx = { id: "manual-" + (area || name || "yl"), tanggal: dummyDate, nama: ylKey, area: area || "" };
                                next.transactions.push(dummyTx);
                             } else {
                                if (area && !dummyTx.area) dummyTx.area = area;
                                dummyTx.nama = ylKey;
                             }

                             parsedValues.forEach((val, idx) => {
                                const kIdx = startIndex + idx;
                                if (kIdx < txKeys.length) {
                                   dummyTx[txKeys[kIdx]] = val - (otherSum[txKeys[kIdx]] || 0);
                                }
                             });
                             return next;
                           });
                        }
                      }}
                    />
                </div>

              )}
              {activeTab === "target" && (
                <div className="bg-white rounded-2xl p-4 shadow-sm overflow-x-auto border border-slate-200 space-y-4">
                   <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                     <div>
                       <h2 className="text-sm font-black text-slate-900">Target Yakult Lady (ARSIP {selectedMonth})</h2>
                       <p className="text-[11px] text-slate-500">Angka Target, Bulan Lalu, dan Tahun Lalu untuk 10 YL mendukung desimal 2 digit.</p>
                     </div>
                     <div className="flex flex-wrap items-center gap-2">
                       <button
                         type="button"
                         onClick={async () => {
                           if (!selectedMonth) return;
                           setLoading(true);
                           try {
                             const activeYls = ylList.filter(y => y.status !== "nonaktif");
                             const res = await lookupHistoricalTargetRealization(selectedMonth, activeYls);
                             
                             setSnapshot(prev => {
                               if (!prev) return prev;
                               const next = { ...prev };
                               const updatedTgtMap = { ...(next.targetYLMap || next.targetYL || {}) };
                               
                               activeYls.forEach(yl => {
                                 const area = yl.area;
                                 const prevRow = updatedTgtMap[area] || { target: 0, bln_lalu: 0, thn_lalu: 0 };
                                 updatedTgtMap[area] = {
                                   ...prevRow,
                                   bln_lalu: res.bulanLalu.perYL[area] ?? prevRow.bln_lalu,
                                   thn_lalu: res.tahunLalu.perYL[area] ?? prevRow.thn_lalu,
                                 };
                               });
                               next.targetYLMap = updatedTgtMap;
                               next.targetYL = updatedTgtMap;

                               // Kolom Tim: tanpa desimal, buang desimal tanpa dibulatkan (Math.trunc)
                               const curTku = next.targetTKU || {};
                               next.targetTKU = {
                                 ...curTku,
                                 bln_lalu: res.bulanLalu.totalTim,
                                 thn_lalu: res.tahunLalu.totalTim,
                               };
                               return next;
                             });
                             alert(`✅ Berhasil menarik realisasi dari arsip!\n• Bulan Lalu (${res.bulanLalu.monthLabel}): Total 10 YL = ${res.bulanLalu.totalYLSpe.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}, Tim = ${res.bulanLalu.totalTim.toLocaleString("id-ID")}\n• Tahun Lalu (${res.tahunLalu.monthLabel}): Total 10 YL = ${res.tahunLalu.totalYLSpe.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}, Tim = ${res.tahunLalu.totalTim.toLocaleString("id-ID")}`);
                           } catch (e: any) {
                             alert("Gagal menarik data arsip: " + e.message);
                           } finally {
                             setLoading(false);
                           }
                         }}
                         className="bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs px-3 py-1.5 rounded-xl transition shadow flex items-center gap-1.5 cursor-pointer"
                       >
                         <span>📥</span>
                         <span>Tarik Realisasi dari Arsip (Bulan Lalu & Tahun Lalu)</span>
                       </button>

                       <button
                         type="button"
                         onClick={() => {
                           const activeYls = ylList.filter(y => y.status !== "nonaktif");
                           const sumTarget = activeYls.reduce((sum, yl) => sum + (Number(activeTargetYLMap[yl.area]?.target) || 0), 0);
                           const sumBL = activeYls.reduce((sum, yl) => sum + (Number(activeTargetYLMap[yl.area]?.bln_lalu) || 0), 0);
                           const sumTL = activeYls.reduce((sum, yl) => sum + (Number(activeTargetYLMap[yl.area]?.thn_lalu) || 0), 0);
                           setSnapshot(prev => {
                             if (!prev) return prev;
                             return {
                               ...prev,
                               targetTKU: {
                                 ...(prev.targetTKU || {}),
                                 target: Math.trunc(sumTarget),
                                 bln_lalu: Math.trunc(sumBL),
                                 thn_lalu: Math.trunc(sumTL),
                               }
                             };
                           });
                         }}
                         className="bg-slate-800 hover:bg-slate-900 text-white font-extrabold text-xs px-3 py-1.5 rounded-xl transition shadow flex items-center gap-1.5 cursor-pointer"
                       >
                         <span>⚡</span>
                         <span>Hitung Tim dari Total YL (Truncate)</span>
                       </button>
                     </div>
                   </div>
                   
                   <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
                     <div className="flex items-center justify-between">
                       <div>
                         <h3 className="text-xs font-black text-slate-800 uppercase">Target Tim & Realisasi (Dengan Varian Produk)</h3>
                         <p className="text-[10.5px] text-slate-500 font-medium">Input target dan realisasi per varian (YO, OM, OS, YT) serta total untuk integrasi otomatis Record TKU</p>
                       </div>
                     </div>

                     {/* 1. Target Bulan Ini */}
                     <div className="bg-white p-3 rounded-lg border border-slate-200">
                       <div className="text-[11px] font-black text-emerald-800 uppercase mb-2 flex items-center justify-between">
                         <span>1. Target Bulan Ini (Rata2 Harian)</span>
                         <span className="text-[10px] text-slate-400 font-normal">Otomatis hitung total dari varian jika diisi</span>
                       </div>
                       <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                         <div>
                           <label className="text-[9.5px] font-bold text-slate-500 block mb-0.5">Target YO</label>
                           <input type="number" className="w-full p-1.5 text-xs font-bold text-slate-900 border border-slate-300 rounded bg-slate-50"
                             value={snapshot.targetTKU?.target_yo ?? ""}
                             placeholder="0"
                             onChange={(e) => {
                               const yoVal = parseFloat(e.target.value) || 0;
                               setSnapshot(prev => {
                                 const tk = prev.targetTKU || {};
                                 const om = tk.target_om || 0;
                                 const os = tk.target_os || 0;
                                 const yt = tk.target_yt || 0;
                                 const autoTot = Math.trunc(yoVal + om + os + yt);
                                 return { ...prev, targetTKU: { ...tk, target_yo: yoVal, target: autoTot > 0 ? autoTot : (tk.target || 0) } };
                               });
                             }}
                           />
                         </div>
                         <div>
                           <label className="text-[9.5px] font-bold text-slate-500 block mb-0.5">Target OM</label>
                           <input type="number" className="w-full p-1.5 text-xs font-bold text-slate-900 border border-slate-300 rounded bg-slate-50"
                             value={snapshot.targetTKU?.target_om ?? ""}
                             placeholder="0"
                             onChange={(e) => {
                               const omVal = parseFloat(e.target.value) || 0;
                               setSnapshot(prev => {
                                 const tk = prev.targetTKU || {};
                                 const yo = tk.target_yo || 0;
                                 const os = tk.target_os || 0;
                                 const yt = tk.target_yt || 0;
                                 const autoTot = Math.trunc(yo + omVal + os + yt);
                                 return { ...prev, targetTKU: { ...tk, target_om: omVal, target: autoTot > 0 ? autoTot : (tk.target || 0) } };
                               });
                             }}
                           />
                         </div>
                         <div>
                           <label className="text-[9.5px] font-bold text-slate-500 block mb-0.5">Target OS</label>
                           <input type="number" className="w-full p-1.5 text-xs font-bold text-slate-900 border border-slate-300 rounded bg-slate-50"
                             value={snapshot.targetTKU?.target_os ?? ""}
                             placeholder="0"
                             onChange={(e) => {
                               const osVal = parseFloat(e.target.value) || 0;
                               setSnapshot(prev => {
                                 const tk = prev.targetTKU || {};
                                 const yo = tk.target_yo || 0;
                                 const om = tk.target_om || 0;
                                 const yt = tk.target_yt || 0;
                                 const autoTot = Math.trunc(yo + om + osVal + yt);
                                 return { ...prev, targetTKU: { ...tk, target_os: osVal, target: autoTot > 0 ? autoTot : (tk.target || 0) } };
                               });
                             }}
                           />
                         </div>
                         <div>
                           <label className="text-[9.5px] font-bold text-slate-500 block mb-0.5">Target YT</label>
                           <input type="number" className="w-full p-1.5 text-xs font-bold text-slate-900 border border-slate-300 rounded bg-slate-50"
                             value={snapshot.targetTKU?.target_yt ?? ""}
                             placeholder="0"
                             onChange={(e) => {
                               const ytVal = parseFloat(e.target.value) || 0;
                               setSnapshot(prev => {
                                 const tk = prev.targetTKU || {};
                                 const yo = tk.target_yo || 0;
                                 const om = tk.target_om || 0;
                                 const os = tk.target_os || 0;
                                 const autoTot = Math.trunc(yo + om + os + ytVal);
                                 return { ...prev, targetTKU: { ...tk, target_yt: ytVal, target: autoTot > 0 ? autoTot : (tk.target || 0) } };
                               });
                             }}
                           />
                         </div>
                         <div>
                           <label className="text-[9.5px] font-black text-emerald-700 block mb-0.5">Target TOTAL</label>
                           <input type="number" className="w-full p-1.5 text-xs font-black text-emerald-800 border border-emerald-300 rounded bg-emerald-50/50"
                             value={snapshot.targetTKU?.target !== undefined ? Math.trunc(snapshot.targetTKU.target) : 0}
                             onChange={(e) => setSnapshot(prev => ({
                               ...prev,
                               targetTKU: { ...(prev.targetTKU || {}), target: Math.trunc(parseFloat(e.target.value) || 0) }
                             }))}
                           />
                         </div>
                       </div>
                     </div>

                     {/* 2. Realisasi Tahun Lalu */}
                     <div className="bg-white p-3 rounded-lg border border-slate-200">
                       <div className="text-[11px] font-black text-blue-800 uppercase mb-2 flex items-center justify-between">
                         <span>2. Realisasi Tahun Lalu (Bulan Sama Tahun Lalu)</span>
                         <span className="text-[10px] text-slate-400 font-normal">Otomatis hitung total dari varian jika diisi</span>
                       </div>
                       <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                         <div>
                           <label className="text-[9.5px] font-bold text-slate-500 block mb-0.5">Thn Lalu YO</label>
                           <input type="number" className="w-full p-1.5 text-xs font-bold text-slate-900 border border-slate-300 rounded bg-slate-50"
                             value={snapshot.targetTKU?.thn_lalu_yo ?? ""}
                             placeholder="0"
                             onChange={(e) => {
                               const yoVal = parseFloat(e.target.value) || 0;
                               setSnapshot(prev => {
                                 const tk = prev.targetTKU || {};
                                 const om = tk.thn_lalu_om || 0;
                                 const os = tk.thn_lalu_os || 0;
                                 const yt = tk.thn_lalu_yt || 0;
                                 const autoTot = Math.trunc(yoVal + om + os + yt);
                                 return { ...prev, targetTKU: { ...tk, thn_lalu_yo: yoVal, thn_lalu: autoTot > 0 ? autoTot : (tk.thn_lalu || 0) } };
                               });
                             }}
                           />
                         </div>
                         <div>
                           <label className="text-[9.5px] font-bold text-slate-500 block mb-0.5">Thn Lalu OM</label>
                           <input type="number" className="w-full p-1.5 text-xs font-bold text-slate-900 border border-slate-300 rounded bg-slate-50"
                             value={snapshot.targetTKU?.thn_lalu_om ?? ""}
                             placeholder="0"
                             onChange={(e) => {
                               const omVal = parseFloat(e.target.value) || 0;
                               setSnapshot(prev => {
                                 const tk = prev.targetTKU || {};
                                 const yo = tk.thn_lalu_yo || 0;
                                 const os = tk.thn_lalu_os || 0;
                                 const yt = tk.thn_lalu_yt || 0;
                                 const autoTot = Math.trunc(yo + omVal + os + yt);
                                 return { ...prev, targetTKU: { ...tk, thn_lalu_om: omVal, thn_lalu: autoTot > 0 ? autoTot : (tk.thn_lalu || 0) } };
                               });
                             }}
                           />
                         </div>
                         <div>
                           <label className="text-[9.5px] font-bold text-slate-500 block mb-0.5">Thn Lalu OS</label>
                           <input type="number" className="w-full p-1.5 text-xs font-bold text-slate-900 border border-slate-300 rounded bg-slate-50"
                             value={snapshot.targetTKU?.thn_lalu_os ?? ""}
                             placeholder="0"
                             onChange={(e) => {
                               const osVal = parseFloat(e.target.value) || 0;
                               setSnapshot(prev => {
                                 const tk = prev.targetTKU || {};
                                 const yo = tk.thn_lalu_yo || 0;
                                 const om = tk.thn_lalu_om || 0;
                                 const yt = tk.thn_lalu_yt || 0;
                                 const autoTot = Math.trunc(yo + om + osVal + yt);
                                 return { ...prev, targetTKU: { ...tk, thn_lalu_os: osVal, thn_lalu: autoTot > 0 ? autoTot : (tk.thn_lalu || 0) } };
                               });
                             }}
                           />
                         </div>
                         <div>
                           <label className="text-[9.5px] font-bold text-slate-500 block mb-0.5">Thn Lalu YT</label>
                           <input type="number" className="w-full p-1.5 text-xs font-bold text-slate-900 border border-slate-300 rounded bg-slate-50"
                             value={snapshot.targetTKU?.thn_lalu_yt ?? ""}
                             placeholder="0"
                             onChange={(e) => {
                               const ytVal = parseFloat(e.target.value) || 0;
                               setSnapshot(prev => {
                                 const tk = prev.targetTKU || {};
                                 const yo = tk.thn_lalu_yo || 0;
                                 const om = tk.thn_lalu_om || 0;
                                 const os = tk.thn_lalu_os || 0;
                                 const autoTot = Math.trunc(yo + om + os + ytVal);
                                 return { ...prev, targetTKU: { ...tk, thn_lalu_yt: ytVal, thn_lalu: autoTot > 0 ? autoTot : (tk.thn_lalu || 0) } };
                               });
                             }}
                           />
                         </div>
                         <div>
                           <label className="text-[9.5px] font-black text-blue-700 block mb-0.5">Thn Lalu TOTAL</label>
                           <input type="number" className="w-full p-1.5 text-xs font-black text-blue-800 border border-blue-300 rounded bg-blue-50/50"
                             value={snapshot.targetTKU?.thn_lalu !== undefined ? Math.trunc(snapshot.targetTKU.thn_lalu) : 0}
                             onChange={(e) => setSnapshot(prev => ({
                               ...prev,
                               targetTKU: { ...(prev.targetTKU || {}), thn_lalu: Math.trunc(parseFloat(e.target.value) || 0) }
                             }))}
                           />
                         </div>
                       </div>
                     </div>

                     {/* 3. Realisasi Bulan Lalu */}
                     <div className="bg-white p-3 rounded-lg border border-slate-200">
                       <div className="text-[11px] font-black text-slate-700 uppercase mb-2 flex items-center justify-between">
                         <span>3. Realisasi Bulan Lalu</span>
                         <span className="text-[10px] text-slate-400 font-normal">Otomatis hitung total dari varian jika diisi</span>
                       </div>
                       <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                         <div>
                           <label className="text-[9.5px] font-bold text-slate-500 block mb-0.5">Bln Lalu YO</label>
                           <input type="number" className="w-full p-1.5 text-xs font-bold text-slate-900 border border-slate-300 rounded bg-slate-50"
                             value={snapshot.targetTKU?.bln_lalu_yo ?? ""}
                             placeholder="0"
                             onChange={(e) => {
                               const yoVal = parseFloat(e.target.value) || 0;
                               setSnapshot(prev => {
                                 const tk = prev.targetTKU || {};
                                 const om = tk.bln_lalu_om || 0;
                                 const os = tk.bln_lalu_os || 0;
                                 const yt = tk.bln_lalu_yt || 0;
                                 const autoTot = Math.trunc(yoVal + om + os + yt);
                                 return { ...prev, targetTKU: { ...tk, bln_lalu_yo: yoVal, bln_lalu: autoTot > 0 ? autoTot : (tk.bln_lalu || 0) } };
                               });
                             }}
                           />
                         </div>
                         <div>
                           <label className="text-[9.5px] font-bold text-slate-500 block mb-0.5">Bln Lalu OM</label>
                           <input type="number" className="w-full p-1.5 text-xs font-bold text-slate-900 border border-slate-300 rounded bg-slate-50"
                             value={snapshot.targetTKU?.bln_lalu_om ?? ""}
                             placeholder="0"
                             onChange={(e) => {
                               const omVal = parseFloat(e.target.value) || 0;
                               setSnapshot(prev => {
                                 const tk = prev.targetTKU || {};
                                 const yo = tk.bln_lalu_yo || 0;
                                 const os = tk.bln_lalu_os || 0;
                                 const yt = tk.bln_lalu_yt || 0;
                                 const autoTot = Math.trunc(yo + omVal + os + yt);
                                 return { ...prev, targetTKU: { ...tk, bln_lalu_om: omVal, bln_lalu: autoTot > 0 ? autoTot : (tk.bln_lalu || 0) } };
                               });
                             }}
                           />
                         </div>
                         <div>
                           <label className="text-[9.5px] font-bold text-slate-500 block mb-0.5">Bln Lalu OS</label>
                           <input type="number" className="w-full p-1.5 text-xs font-bold text-slate-900 border border-slate-300 rounded bg-slate-50"
                             value={snapshot.targetTKU?.bln_lalu_os ?? ""}
                             placeholder="0"
                             onChange={(e) => {
                               const osVal = parseFloat(e.target.value) || 0;
                               setSnapshot(prev => {
                                 const tk = prev.targetTKU || {};
                                 const yo = tk.bln_lalu_yo || 0;
                                 const om = tk.bln_lalu_om || 0;
                                 const yt = tk.bln_lalu_yt || 0;
                                 const autoTot = Math.trunc(yo + om + osVal + yt);
                                 return { ...prev, targetTKU: { ...tk, bln_lalu_os: osVal, bln_lalu: autoTot > 0 ? autoTot : (tk.bln_lalu || 0) } };
                               });
                             }}
                           />
                         </div>
                         <div>
                           <label className="text-[9.5px] font-bold text-slate-500 block mb-0.5">Bln Lalu YT</label>
                           <input type="number" className="w-full p-1.5 text-xs font-bold text-slate-900 border border-slate-300 rounded bg-slate-50"
                             value={snapshot.targetTKU?.bln_lalu_yt ?? ""}
                             placeholder="0"
                             onChange={(e) => {
                               const ytVal = parseFloat(e.target.value) || 0;
                               setSnapshot(prev => {
                                 const tk = prev.targetTKU || {};
                                 const yo = tk.bln_lalu_yo || 0;
                                 const om = tk.bln_lalu_om || 0;
                                 const os = tk.bln_lalu_os || 0;
                                 const autoTot = Math.trunc(yo + om + os + ytVal);
                                 return { ...prev, targetTKU: { ...tk, bln_lalu_yt: ytVal, bln_lalu: autoTot > 0 ? autoTot : (tk.bln_lalu || 0) } };
                               });
                             }}
                           />
                         </div>
                         <div>
                           <label className="text-[9.5px] font-black text-slate-700 block mb-0.5">Bln Lalu TOTAL</label>
                           <input type="number" className="w-full p-1.5 text-xs font-black text-slate-900 border border-slate-300 rounded bg-slate-100"
                             value={snapshot.targetTKU?.bln_lalu !== undefined ? Math.trunc(snapshot.targetTKU.bln_lalu) : 0}
                             onChange={(e) => setSnapshot(prev => ({
                               ...prev,
                               targetTKU: { ...(prev.targetTKU || {}), bln_lalu: Math.trunc(parseFloat(e.target.value) || 0) }
                             }))}
                           />
                         </div>
                       </div>
                     </div>
                   </div>

                   <table className="w-full border-collapse text-xs">
                     <thead>
                       <tr>
                         <th className="p-2 bg-slate-900 text-white sticky left-0 z-10 text-left">Yakult Lady</th>
                         <th className="p-2 bg-slate-800 text-slate-200 border-l border-slate-700 text-center">Target Rata-Rata</th>
                         <th className="p-2 bg-slate-800 text-slate-200 border-l border-slate-700 text-center">Realisasi Bln Lalu</th>
                         <th className="p-2 bg-slate-800 text-slate-200 border-l border-slate-700 text-center">Realisasi Thn Lalu</th>
                       </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-200">
                       {ylList.filter(y => y.status !== "nonaktif").map((yl, idx) => (
                         <TargetManagerRow
                            key={yl.area}
                            yl={yl}
                            idx={idx}
                            targetYLMap={activeTargetYLMap}
                            setTargetYLMap={handleUpdateTargetYLMap}
                            getTargetCellProps={getTargetCellProps}
                            renderTargetSelectionHandle={renderTargetSelectionHandle}
                            selectTargetRow={selectTargetRow}
                            setTargetGridSelection={setTargetGridSelection}
                            handleTargetGridPaste={handleTargetGridPaste}
                         />
                       ))}
                     </tbody>
                     <tfoot className="bg-slate-100 text-slate-800 text-[11px] font-black uppercase shadow-[inset_0_1px_0_rgba(0,0,0,0.1)]">
                       <tr>
                         <td className="p-2.5 text-right border-r-2 border-slate-300 sticky left-0 bg-slate-100">TOTAL</td>
                         <td className="p-1.5 text-center border-r border-slate-300 text-xs sm:text-sm">
                           {ylList
                             .filter((y) => y.status !== "nonaktif")
                             .reduce((sum, yl) => sum + (Number(activeTargetYLMap[yl.area]?.target) || 0), 0)
                             .toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                         </td>
                         <td className="p-1.5 text-center border-r border-slate-300 text-xs sm:text-sm">
                           {ylList
                             .filter((y) => y.status !== "nonaktif")
                             .reduce((sum, yl) => sum + (Number(activeTargetYLMap[yl.area]?.bln_lalu) || 0), 0)
                             .toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                         </td>
                         <td className="p-1.5 text-center border-r border-slate-300 text-xs sm:text-sm">
                           {ylList
                             .filter((y) => y.status !== "nonaktif")
                             .reduce((sum, yl) => sum + (Number(activeTargetYLMap[yl.area]?.thn_lalu) || 0), 0)
                             .toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                         </td>
                       </tr>
                     </tfoot>
                   </table>

                   <GridSelectionToolbar
                     selection={targetGridSelection}
                     menuPos={targetMenuPos}
                     isMenuOpen={targetIsMenuOpen}
                     onClose={() => setTargetIsMenuOpen(false)}
                     onCopy={handleTargetGridCopy}
                     onCut={handleTargetGridCut}
                     onPaste={handleTargetGridPaste}
                     onClear={handleTargetGridClear}
                   />

                   {/* Fix: bilah input spreadsheet — sebelumnya menu Target Arsip
                       tidak pernah merender SpreadsheetInputBar sama sekali. */}
                   <SpreadsheetInputBar
                     activeCell={targetActiveCell}
                     cellLabel={targetActiveCell ? getArchiveTargetCellLabel(targetActiveCell.r, targetActiveCell.c) : undefined}
                     value={targetActiveCellValue}
                     isEditable={isTargetActiveCellEditable}
                     onChange={handleTargetActiveCellValueChange}
                     onPrev={goToPrevTargetCell}
                     onNext={goToNextTargetCell}
                     onDone={() => setTargetActiveCell(null)}
                   />

                   {targetClipboardModal && (
                     <ClipboardFallbackModal
                       mode={targetClipboardModal.mode}
                       initialText={targetClipboardModal.text}
                       onConfirmPaste={targetConfirmManualPaste}
                       onClose={closeTargetClipboardModal}
                     />
                   )}
                </div>
              )}
              {activeTab === "bd_realisasi" && (
                <div className="bg-white rounded-2xl p-4 shadow-sm overflow-x-auto border border-slate-200">
                   <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                     <div className="flex items-center gap-2">
                       <h2 className="text-sm font-black text-slate-900">
                         {archiveGridMode === "BD" ? "Breakdown Target / Plan (ARSIP)" : "Breakdown Realisasi (ARSIP)"}
                       </h2>
                       <span className="text-[10px] bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full font-bold">
                         Bulan: {selectedMonth}
                       </span>
                     </div>

                     <div className="flex flex-wrap items-center gap-2">
                       {/* Sub-mode Switcher: BD vs Realisasi */}
                       <div className="flex bg-slate-100 p-0.5 rounded-lg gap-0.5">
                         <button
                           type="button"
                           onClick={() => setArchiveGridMode("BD")}
                           className={`px-2.5 py-1 text-[11px] font-extrabold rounded-md transition-all cursor-pointer ${
                             archiveGridMode === "BD" ? "bg-red-600 text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
                           }`}
                         >
                           Breakdown (BD)
                         </button>
                         <button
                           type="button"
                           onClick={() => setArchiveGridMode("R")}
                           className={`px-2.5 py-1 text-[11px] font-extrabold rounded-md transition-all cursor-pointer ${
                             archiveGridMode === "R" ? "bg-emerald-600 text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
                           }`}
                         >
                           Realisasi (R)
                         </button>
                       </div>

                       {/* Input Pembagi Tanggal */}
                       <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2 py-1 rounded-lg">
                         <span className="text-[10px] font-bold text-slate-700">Pembagi:</span>
                         <input
                           type="number"
                           min={1}
                           max={31}
                           value={pembagiAktif}
                           onFocus={(e) => e.target.select()}
                           onChange={(e) => handleGlobalPembagiChange(e.target.value)}
                           className="w-10 p-0.5 text-xs font-extrabold text-center bg-white border border-slate-300 rounded-md text-slate-900 outline-none"
                         />
                       </div>

                       {/* Indikator vs Target / BL / TL */}
                       <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-2 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap">
                         <div className="flex items-center gap-1">
                           <span className="text-slate-500">vs Tgt:</span>
                           <span className={monthlyGridStats.pctTgt >= 100 ? "text-emerald-600 font-extrabold" : "text-rose-600 font-extrabold"}>
                             {formatTruncated(monthlyGridStats.pctTgt, 1, false)}%
                           </span>
                         </div>
                         <div className="flex items-center gap-1">
                           <span className="text-slate-500">vs BL:</span>
                           <span className={monthlyGridStats.pctBL >= 100 ? "text-emerald-600 font-extrabold" : "text-rose-600 font-extrabold"}>
                             {formatTruncated(monthlyGridStats.pctBL, 1, false)}%
                           </span>
                         </div>
                         <div className="flex items-center gap-1">
                           <span className="text-slate-500">vs TL:</span>
                           <span className={monthlyGridStats.pctTL >= 100 ? "text-emerald-600 font-extrabold" : "text-rose-600 font-extrabold"}>
                             {formatTruncated(monthlyGridStats.pctTL, 1, false)}%
                           </span>
                         </div>
                       </div>

                       {/* Tombol Seleksi Tambahan */}
                       <button
                         type="button"
                         onClick={handleBreakdownSelectAllNew}
                         className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold rounded-lg transition-all cursor-pointer"
                       >
                         Pilih Semua
                       </button>

                       {breakdownGridSelectionNew && (
                         <button
                           type="button"
                           onClick={handleBreakdownGridClear}
                           className="px-2 py-1 bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold rounded-lg hover:bg-rose-100 transition-all cursor-pointer"
                         >
                           Hapus Sel
                         </button>
                       )}
                     </div>
                   </div>

                   <table className="w-full border-collapse text-xs select-none">
                     <thead>
                       <tr>
                          <th className="p-2 bg-slate-900 text-slate-200 sticky left-0 z-20">Yakult Lady</th>
                          {Array.from({length: 31}, (_, i) => i+1).map(d => (
                            <th key={d} colSpan={4} className="p-1 border-l border-b border-slate-700 bg-slate-900 text-slate-200 min-w-[160px]">{d}</th>
                          ))}
                          <th colSpan={5} className="p-1 text-center border-l border-b border-slate-700 bg-slate-900 text-slate-200 font-bold min-w-[210px]">
                            TOTAL 4 ITEM + TOTAL
                          </th>
                          <th colSpan={5} className="p-1 text-center border-l border-b border-slate-700 bg-amber-950 text-amber-200 font-bold min-w-[210px]">
                            RATA-RATA HARIAN
                          </th>
                          <th colSpan={6} className="p-1 text-center border-l border-b border-slate-700 bg-purple-950 text-purple-200 font-bold min-w-[290px]">
                            TARGET & PEMBANDING
                          </th>
                       </tr>
                       <tr>
                          <th className="p-1 sticky left-0 bg-slate-900 z-20"></th>
                          {Array.from({length: 31}, (_, i) => i+1).map(d => (
                            <React.Fragment key={d}>
                              <th className="p-1 text-center border-l border-b border-slate-800 text-red-400 bg-slate-900/90 text-[9px] min-w-[40px]">YO</th>
                              <th className="p-1 text-center border-l border-b border-slate-800 text-amber-400 bg-slate-900/90 text-[9px] min-w-[40px]">OM</th>
                              <th className="p-1 text-center border-l border-b border-slate-800 text-pink-400 bg-slate-900/90 text-[9px] min-w-[40px]">OS</th>
                              <th className="p-1 text-center border-l border-b border-slate-800 text-blue-400 bg-slate-900/90 text-[9px] min-w-[40px]">YT</th>
                            </React.Fragment>
                          ))}
                          <th className="p-1 text-center border-l border-b border-slate-800 text-red-400 bg-slate-900/90 text-[9px] min-w-[42px]">YO</th>
                          <th className="p-1 text-center border-l border-b border-slate-800 text-amber-400 bg-slate-900/90 text-[9px] min-w-[42px]">OM</th>
                          <th className="p-1 text-center border-l border-b border-slate-800 text-pink-400 bg-slate-900/90 text-[9px] min-w-[42px]">OS</th>
                          <th className="p-1 text-center border-l border-b border-slate-800 text-blue-400 bg-slate-900/90 text-[9px] min-w-[42px]">YT</th>
                          <th className="p-1 text-center border-l border-b border-slate-800 text-slate-100 bg-slate-800 text-[9px] min-w-[48px]">TOTAL</th>

                          <th className="p-1 text-center border-l border-b border-slate-800 text-red-400 bg-amber-950/90 text-[9px] min-w-[42px]">YO</th>
                          <th className="p-1 text-center border-l border-b border-slate-800 text-amber-400 bg-amber-950/90 text-[9px] min-w-[42px]">OM</th>
                          <th className="p-1 text-center border-l border-b border-slate-800 text-pink-400 bg-amber-950/90 text-[9px] min-w-[42px]">OS</th>
                          <th className="p-1 text-center border-l border-b border-slate-800 text-blue-400 bg-amber-950/90 text-[9px] min-w-[42px]">YT</th>
                          <th className="p-1 text-center border-l border-b border-slate-800 text-amber-300 bg-amber-900 text-[9px] min-w-[48px]">RATA</th>

                          <th className="p-1 text-center border-l border-b border-slate-800 text-purple-300 bg-purple-950/90 text-[9px] min-w-[48px]">Target</th>
                          <th className="p-1 text-center border-l border-b border-slate-800 text-emerald-300 bg-purple-950/90 text-[9px] min-w-[48px]">Sel. Tgt</th>
                          <th className="p-1 text-center border-l border-b border-slate-800 text-indigo-300 bg-purple-950/90 text-[9px] min-w-[48px]">Bln Lalu</th>
                          <th className="p-1 text-center border-l border-b border-slate-800 text-emerald-300 bg-purple-950/90 text-[9px] min-w-[48px]">Sel. BL</th>
                          <th className="p-1 text-center border-l border-b border-slate-800 text-teal-300 bg-purple-950/90 text-[9px] min-w-[48px]">Thn Lalu</th>
                          <th className="p-1 text-center border-l border-b border-slate-800 text-emerald-300 bg-purple-950/90 text-[9px] min-w-[48px]">Sel. TL</th>
                       </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-200">
                       {ylList.filter(y => y.status !== "nonaktif").map((yl, idx) => (
                         <BreakdownGridRow
                            key={yl.area}
                            yl={yl}
                            rIdx={idx}
                            activeGridMap={activeGridMap}
                            targetYLMap={activeTargetYLMap}
                            breakdownDateRange="1-31"
                            getCellProps={getBreakdownCellProps}
                            renderSelectionHandle={renderBreakdownSelectionHandle}
                            selectRow={selectBreakdownRow}
                         />
                       ))}
                     </tbody>
                     <tfoot className="bg-slate-50 text-slate-800 font-black border-t-2 border-slate-300 shadow-[0_-1px_0_0_#cbd5e1]">
                       <tr className="text-[11px] divide-x divide-slate-200">
                         <td className="p-2.5 sticky left-0 bg-slate-50 z-20 font-black text-slate-800 text-left whitespace-nowrap shadow-[1px_0_0_0_#e2e8f0]">
                           TOTAL HARIAN
                         </td>
                         {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => {
                           const data = dailyGridTotals[d] || { yo: 0, om: 0, os: 0, yt: 0 };
                           return (
                             <React.Fragment key={d}>
                               <td className="p-1 text-center text-red-700 font-black bg-slate-50/90">{data.yo}</td>
                               <td className="p-1 text-center text-amber-700 font-black bg-slate-50/90">{data.om}</td>
                               <td className="p-1 text-center text-pink-700 font-black bg-slate-50/90">{data.os}</td>
                               <td className="p-1 text-center text-blue-700 font-black bg-slate-50/90">{data.yt}</td>
                             </React.Fragment>
                           );
                         })}
                         <td className="p-1 text-center font-bold text-red-800 bg-red-100/60">{monthlyGridTotals.yo}</td>
                         <td className="p-1 text-center font-bold text-amber-800 bg-red-100/60">{monthlyGridTotals.om}</td>
                         <td className="p-1 text-center font-bold text-pink-800 bg-red-100/60">{monthlyGridTotals.os}</td>
                         <td className="p-1 text-center font-bold text-blue-800 bg-red-100/60">{monthlyGridTotals.yt}</td>
                         <td className="p-1 text-center font-black text-slate-800 bg-slate-200">{monthlyGridTotals.total}</td>

                         {(() => {
                           const pembagi = pembagiAktif;
                           const ryo = Math.trunc(monthlyGridTotals.yo / pembagi);
                           const rom = Math.trunc(monthlyGridTotals.om / pembagi);
                           const ros = Math.trunc(monthlyGridTotals.os / pembagi);
                           const ryt = Math.trunc(monthlyGridTotals.yt / pembagi);
                           const rsum = ryo + rom + ros + ryt;
                           return (
                             <React.Fragment>
                               <td className="p-1 text-center font-bold text-red-800 bg-amber-100/60">{ryo}</td>
                               <td className="p-1 text-center font-bold text-amber-800 bg-amber-100/60">{rom}</td>
                               <td className="p-1 text-center font-bold text-pink-800 bg-amber-100/60">{ros}</td>
                               <td className="p-1 text-center font-bold text-blue-800 bg-amber-100/60">{ryt}</td>
                               <td className="p-1 text-center font-black text-amber-900 bg-amber-300">{rsum}</td>
                             </React.Fragment>
                           );
                         })()}

                         {(() => {
                           const totalTarget = monthlyGridStats.totalTarget;
                           const totalBL = monthlyGridStats.totalBL;
                           const totalTL = monthlyGridStats.totalTL;

                           const grandTotal = monthlyGridTotals.total;
                           const dTarget = grandTotal - totalTarget;
                           const dBL = grandTotal - totalBL;
                           const dTL = grandTotal - totalTL;
                           return (
                             <React.Fragment>
                               <td className="p-1 text-center font-bold text-purple-800 bg-purple-100/60">{totalTarget}</td>
                               <td className={`p-1 text-center font-black ${dTarget >= 0 ? "text-emerald-700 bg-emerald-100/80" : "text-rose-700 bg-rose-100/80"}`}>
                                 {dTarget >= 0 ? `+${dTarget}` : dTarget}
                               </td>
                               <td className="p-1 text-center font-bold text-indigo-800 bg-purple-100/60">{totalBL}</td>
                               <td className={`p-1 text-center font-black ${dBL >= 0 ? "text-emerald-700 bg-emerald-100/80" : "text-rose-700 bg-rose-100/80"}`}>
                                 {dBL >= 0 ? `+${dBL}` : dBL}
                               </td>
                               <td className="p-1 text-center font-bold text-teal-800 bg-purple-100/60">{totalTL}</td>
                               <td className={`p-1 text-center font-black ${dTL >= 0 ? "text-emerald-700 bg-emerald-100/80" : "text-rose-700 bg-rose-100/80"}`}>
                                 {dTL >= 0 ? `+${dTL}` : dTL}
                               </td>
                             </React.Fragment>
                           );
                         })()}
                       </tr>

                       <tr className="bg-slate-200 text-slate-800 font-black text-[11px] uppercase divide-x divide-slate-300">
                         <td className="p-2.5 sticky left-0 bg-slate-300 z-20 text-left font-black tracking-wide text-slate-900 shadow-[1px_0_0_0_#cbd5e1]">
                           TOTAL ALL VARIAN
                         </td>
                         {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => {
                           const data = dailyGridTotals[d] || { yo: 0, om: 0, os: 0, yt: 0 };
                           const sum = data.yo + data.om + data.os + data.yt;
                           return (
                             <td key={d} colSpan={4} className="p-1 text-center bg-slate-200 font-black text-slate-800">
                               {sum} btl
                             </td>
                           );
                         })}
                         <td colSpan={5} className="p-1 text-center font-black text-slate-900 bg-slate-300">
                           {monthlyGridTotals.total} btl
                         </td>
                         {(() => {
                           const pembagi = pembagiAktif;
                           const ryo = Math.trunc(monthlyGridTotals.yo / pembagi);
                           const rom = Math.trunc(monthlyGridTotals.om / pembagi);
                           const ros = Math.trunc(monthlyGridTotals.os / pembagi);
                           const ryt = Math.trunc(monthlyGridTotals.yt / pembagi);
                           const rsum = ryo + rom + ros + ryt;
                           return (
                             <td colSpan={5} className="p-1 text-center font-black text-slate-900 bg-slate-300/90">
                               {rsum} btl
                             </td>
                           );
                         })()}
                         <td colSpan={6} className="bg-slate-300/80"></td>
                       </tr>
                     </tfoot>
                   </table>

                   <GridSelectionToolbar
                     selection={breakdownGridSelectionNew}
                     isMenuOpen={isBreakdownMenuOpenNew}
                     menuPos={breakdownMenuPosNew}
                     onCopy={handleBreakdownGridCopy}
                     onCut={handleBreakdownGridCut}
                     onPaste={handleBreakdownGridPaste}
                     onClear={handleBreakdownGridClear}
                     onSelectAll={handleBreakdownSelectAllNew}
                     onClose={() => {
                       setIsBreakdownMenuOpenNew(false);
                       setBreakdownGridSelectionNew(null);
                     }}
                   />
                   {/* Fix: bilah input spreadsheet di atas keyboard — sebelumnya
                       grid BD & Realisasi Arsip tidak punya cara edit sama sekali
                       di HP (sel tidak bisa disentuh, tidak ada bilah input). */}
                   <SpreadsheetInputBar
                     activeCell={breakdownActiveCell}
                     cellLabel={breakdownActiveCell ? getBreakdownCellLabel(breakdownActiveCell.r, breakdownActiveCell.c) : undefined}
                     value={breakdownActiveCellValue}
                     isEditable={isBreakdownActiveCellEditable}
                     onChange={handleBreakdownActiveCellValueChange}
                     onPrev={goToPrevBreakdownCell}
                     onNext={goToNextBreakdownCell}
                     onDone={() => setBreakdownActiveCell(null)}
                   />
                   {breakdownClipboardModalNew && (
                     <ClipboardFallbackModal
                       mode={breakdownClipboardModalNew.mode}
                       initialText={breakdownClipboardModalNew.text}
                       onConfirmPaste={breakdownConfirmManualPaste}
                       onClose={closeBreakdownClipboardModal}
                     />
                   )}
                </div>
              )}
              {activeTab === "rata2" && (
                <div className="space-y-4">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-900 flex items-center justify-between">
                    <span className="font-bold flex items-center gap-1.5">
                      <span>📈</span>
                      <span>Rekap Rata-Rata Penjualan Arsip ({selectedMonth}): Terisi otomatis & terhubung dengan data snapshot.</span>
                    </span>
                    <span className="text-[10px] bg-emerald-200 text-emerald-800 px-2 py-0.5 rounded-md font-extrabold">
                      Arsip Aktif
                    </span>
                  </div>
                  <Rata2BulananTab ylList={ylList} defaultYearMonth={selectedMonth} />
                </div>
              )}
              {activeTab === "sales_record_tku" && (
                <React.Suspense fallback={<div className="p-8 text-center font-bold text-slate-500">Memuat...</div>}>
                  <SalesRecordTKU key={selectedMonth} defaultYear={selectedMonth ? selectedMonth.split('-')[0] : undefined} defaultMonthIndex={selectedMonth ? parseInt(selectedMonth.split('-')[1], 10) - 1 : undefined} />
                </React.Suspense>
              )}
           </div>
        </main>
      )}

      {/* Modal Konfirmasi Hapus Arsip Supabase */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-rose-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 flex items-center justify-center text-rose-600 text-2xl shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 leading-tight">Konfirmasi Hapus Arsip Cloud</h3>
                <p className="text-xs text-rose-600 font-bold">Database Supabase Permanen</p>
              </div>
            </div>

            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 text-xs text-rose-950 space-y-2">
              <p>
                Apakah Anda yakin ingin <strong>MENGHAPUS PERMANEN</strong> seluruh arsip data bulan:
              </p>
              <div className="text-center py-2 px-3 bg-white rounded-lg border border-rose-300 font-mono font-black text-sm text-rose-700">
                📅 BULAN {selectedMonth}
              </div>
              <p className="text-[11px] text-rose-800 leading-relaxed">
                ⚠️ Tindakan ini akan menghapus snapshot arsip bulan tersebut langsung dari cloud database Supabase. Tindakan ini <strong>tidak dapat dibatalkan</strong>!
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-2.5 px-4 rounded-xl transition-all cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={executeDeleteFromSupabase}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs py-2.5 px-4 rounded-xl transition-all cursor-pointer shadow-md flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Ya, Hapus Permanen</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
