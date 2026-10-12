import React, { useState, useEffect } from "react";
import { YLLady, Transaction, MotivasiConfig } from "../types";
import { safeFetchJson } from "../lib/safeFetch";
import { NumberInput } from "./NumberInput";
import { MenuTitleIcon } from "./AppSidebar";
import { Users, Building2, School, Store, Award, PieChart, FileSpreadsheet } from "lucide-react";
import { downloadBlob } from "../utils/fileDownloader";

interface PlgPjlViewProps {
  ylList?: YLLady[];
  pembagiManager?: number;
  motivasiConfig?: MotivasiConfig;
  theme?: "light" | "dark";
  // FIX: dulu komponen ini SELALU fetch data live bulan berjalan sendiri, tidak peduli
  // manajer sedang "membuka arsip bulan Juli" atau tidak. Sekarang parent (ManagerView)
  // bisa mengirim historicalMonth + historicalData supaya tab ini menampilkan data
  // arsip yang benar, bukan data live yang mungkin sudah kosong/berubah.
  historicalMonth?: string | null;
  historicalData?: {
    transactions: Transaction[];
    editableAkm?: boolean;
    onAkmChange?: (ylKey: string, secKey: string, prodCode: string, val: number) => void;
    onAkmPaste?: (e: React.ClipboardEvent, ylKey: string, startIndex: number) => void;
    onTxFieldChange?: (ylKey: string, field: string, val: number) => void;
    onPotensiChange?: (ylKey: string, field: string, val: number) => void;
    potensiTembus?: any;
    breakdownRealisasiMap?: Record<string, any>;
  } | null;
}

interface ManualPlgPjlData {
  sklh_total: number;
  sklh_tembus: number;
  kntr_total: number;
  kntr_tembus: number;
  tko_total: number;
  tko_tembus: number;
}

function PlgPjlViewInner({
  ylList = [],
  pembagiManager: initialDivisor = 15,
  theme = "light",
  historicalMonth = null,
  historicalData = null
}: PlgPjlViewProps) {
  const [selectedArea, setSelectedArea] = useState<string>("TKU_DP1");
  const [activeYlList, setActiveYlList] = useState<YLLady[]>(ylList);
  const [pembagi, setPembagi] = useState<number>(initialDivisor);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [potensiTembusData, setPotensiTembusData] = useState<any>({});
  const [breakdownRealisasiMap, setBreakdownRealisasiMap] = useState<Record<string, any>>({});
    
    
  // Local state for manual inputs of currently selected YL
            
  const cleanYlName = (fullName: string): string => {
    if (!fullName) return "";
    const match = fullName.match(/^\d+\s+(.+)$/);
    return match ? match[1] : fullName;
  };

  
  const loadData = async () => {
    
    try {
      const activeMonth = historicalMonth || new Date().toISOString().substring(0, 7);
      const monthQuery = `?month=${encodeURIComponent(activeMonth)}`;
      const res = await safeFetchJson<{
        ok: boolean;
        ylList: YLLady[];
        pembagiManager: number;
        transactions: Transaction[];
        potensiTembus?: any;
        breakdownRealisasiMap?: Record<string, any>;
      }>(`/api/getPlgPjlData${monthQuery}`);

      if (res && res.ok) {
        if (res.ylList && res.ylList.length > 0) {
          const activeOnly = res.ylList.filter(y => !y.status || y.status === "Aktif");
          setActiveYlList(activeOnly);
        }
        // setPembagi(res.pembagiManager || initialDivisor);
        setTransactions(res.transactions || []);
        if (res.potensiTembus) setPotensiTembusData(res.potensiTembus);
        if (res.breakdownRealisasiMap) setBreakdownRealisasiMap(res.breakdownRealisasiMap);
      }
    } catch (e) {
      console.error("Gagal mengambil data PLG/PJL", e);
    } finally {
      
    }
  };

  useEffect(() => {
    if (historicalData) {
      // Data arsip sudah tersedia dari parent (hasil "Ambil Data Bulan X dari Supabase"),
      // langsung pakai ini tanpa overwrite.
      if (ylList && ylList.length > 0) {
        const activeOnly = ylList.filter(y => !y.status || y.status === "Aktif");
        setActiveYlList(activeOnly);
      }
      setTransactions(historicalData.transactions || []);
      setPotensiTembusData(historicalData.potensiTembus || {});
      setBreakdownRealisasiMap(historicalData.breakdownRealisasiMap || {});
    } else {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historicalData, historicalMonth]);

  const isTkuDp1 = selectedArea === "TKU_DP1";

  useEffect(() => {
    if (isTkuDp1) {
      let totalPembagi = 0;
      activeYlList.forEach(yl => {
        const areaStr = yl.area.substring(0, 3);
        const ylData = breakdownRealisasiMap[areaStr];
        totalPembagi += (ylData && Number(ylData.pembagiTanggal) > 0) ? Number(ylData.pembagiTanggal) : 15;
      });
      setPembagi(activeYlList.length > 0 ? (totalPembagi / activeYlList.length) : 15);
    } else {
      const areaStr = selectedArea.substring(0, 3);
      const ylData = breakdownRealisasiMap[areaStr];
      setPembagi((ylData && Number(ylData.pembagiTanggal) > 0) ? Number(ylData.pembagiTanggal) : 15);
    }
  }, [selectedArea, isTkuDp1, breakdownRealisasiMap, activeYlList]);

  // Get current active YL object
  const currentYl = isTkuDp1
    ? { area: "TKU DP 1", nama: "TOTAL TIM (SEMUA YL)" }
    : activeYlList.find(y => y.area === selectedArea) || {
        area: selectedArea,
        nama: `${selectedArea} YL`
      };

  // Filter transactions for current YL or all active YLs if TKU DP 1 is selected
  const ylTxs = isTkuDp1
    ? transactions.filter(
        t => t.nama && activeYlList.some(y => t.nama.startsWith(y.area) || t.nama === y.nama)
      )
    : transactions.filter(
        t => t.nama && (t.nama.startsWith(selectedArea) || t.nama === currentYl.nama)
      );

  // Helper calculation functions
  const sumTxKey = (key: keyof Transaction) => {
    return ylTxs.reduce((sum, t) => sum + (Number(t[key]) || 0), 0);
  };

  // Calculate sector accumulated sales (AKM) for selected YL
  const sectorsData = {
    rmh: {
      yo: sumTxKey("rmh_yo"),
      om: sumTxKey("rmh_om"),
      os: sumTxKey("rmh_os"),
      yt: sumTxKey("rmh_yt")
    },
    psr: {
      yo: sumTxKey("psr_yo"),
      om: sumTxKey("psr_om"),
      os: sumTxKey("psr_os"),
      yt: sumTxKey("psr_yt")
    },
    skh: {
      yo: sumTxKey("skh_yo"),
      om: sumTxKey("skh_om"),
      os: sumTxKey("skh_os"),
      yt: sumTxKey("skh_yt")
    },
    ktr: {
      yo: sumTxKey("ktr_yo"),
      om: sumTxKey("ktr_om"),
      os: sumTxKey("ktr_os"),
      yt: sumTxKey("ktr_yt")
    },
    tk: {
      yo: sumTxKey("tk_yo"),
      om: sumTxKey("tk_om"),
      os: sumTxKey("tk_os"),
      yt: sumTxKey("tk_yt")
    },
    ib: {
      yo: sumTxKey("ib_yo"),
      om: sumTxKey("ib_om"),
      os: sumTxKey("ib_os"),
      yt: sumTxKey("ib_yt")
    }
  };

  // Total product sales across all sectors
  const totalYo =
    sectorsData.rmh.yo +
    sectorsData.psr.yo +
    sectorsData.skh.yo +
    sectorsData.ktr.yo +
    sectorsData.tk.yo +
    sectorsData.ib.yo;

  const totalOm =
    sectorsData.rmh.om +
    sectorsData.psr.om +
    sectorsData.skh.om +
    sectorsData.ktr.om +
    sectorsData.tk.om +
    sectorsData.ib.om;

  const totalOs =
    sectorsData.rmh.os +
    sectorsData.psr.os +
    sectorsData.skh.os +
    sectorsData.ktr.os +
    sectorsData.tk.os +
    sectorsData.ib.os;

  const totalYt =
    sectorsData.rmh.yt +
    sectorsData.psr.yt +
    sectorsData.skh.yt +
    sectorsData.ktr.yt +
    sectorsData.tk.yt +
    sectorsData.ib.yt;

  const grandTotal = totalYo + totalOm + totalOs + totalYt;

  // Additional Metrics - Jumlah pelanggan dihitung dari total transaksi per YL di tampilan UI
  const calculateTotalPlg = () => {
    if (isTkuDp1) {
      return activeYlList.reduce((acc, yl) => {
        const txsForYl = transactions.filter(
          t => t.nama && (t.nama.startsWith(yl.area) || t.nama === yl.nama)
        );
        const ylPlg = txsForYl.reduce((sum, t) => sum + (Number(t.f_plg) || 0), 0);
        return acc + ylPlg;
      }, 0);
    } else {
      return ylTxs.reduce((sum, t) => sum + (Number(t.f_plg) || 0), 0);
    }
  };

  const totalPlg = calculateTotalPlg();
  const totalRk = sumTxKey("f_rk");
  const totalRa = sumTxKey("f_ra");
  const totalRb = sumTxKey("f_rb");
  const totalPb = sumTxKey("pb_p") + sumTxKey("pb_s");
  const totalBb = sumTxKey("bb_yo") + sumTxKey("bb_om") + sumTxKey("bb_os") + sumTxKey("bb_yt");
  const totalPlgApk = sumTxKey("apk_plg");
  const totalSampahBotol = sumTxKey("apk_botol");

  const currentMonth = historicalMonth || new Date().toISOString().substring(0, 7);
  let manualSklhTotal = 0, manualSklhTembus = 0;
  let manualKntrTotal = 0, manualKntrTembus = 0;
  let manualTkoTotal = 0, manualTkoTembus = 0;
  
  if (potensiTembusData && Object.keys(potensiTembusData).length > 0) {
    const getYLVal = (ylItemName: string, areaCodeParam?: string) => {
      if (!ylItemName || !potensiTembusData) return null;
      const cleanTarget = cleanYlName(ylItemName).toLowerCase().trim();
      const areaCode = (areaCodeParam || ylItemName.substring(0, 3)).trim();

      const monthsToSearch = [
        currentMonth,
        ...Object.keys(potensiTembusData).sort().reverse()
      ];

      for (const m of monthsToSearch) {
        const mData = potensiTembusData[m];
        if (!mData || typeof mData !== "object") continue;
        if (mData[ylItemName]) return mData[ylItemName];
        if (cleanTarget && mData[cleanTarget]) return mData[cleanTarget];
        if (areaCode && mData[areaCode]) return mData[areaCode];
        if (areaCode && cleanTarget && mData[`${areaCode} - ${cleanTarget}`]) return mData[`${areaCode} - ${cleanTarget}`];

        const matchKey = Object.keys(mData).find(k => {
          const ck = cleanYlName(k).toLowerCase().trim();
          return (ck && ck === cleanTarget) || (areaCode && (k === areaCode || k.startsWith(areaCode)));
        });
        if (matchKey && mData[matchKey]) return mData[matchKey];
      }
      return null;
    };

    if (isTkuDp1) {
      activeYlList.forEach(y => {
        const val = getYLVal(y.nama, y.area);
        if (val) {
          manualSklhTotal += Number(val.skhTotal || 0);
          manualSklhTembus += Number(val.skhTembus || 0);
          manualKntrTotal += Number(val.kntrTotal || 0);
          manualKntrTembus += Number(val.kntrTembus || 0);
          manualTkoTotal += Number(val.tkoTotal || 0);
          manualTkoTembus += Number(val.tkoTembus || 0);
        }
      });
    } else if (currentYl && currentYl.nama) {
      const val = getYLVal(currentYl.nama, currentYl.area);
      if (val) {
        manualSklhTotal = Number(val.skhTotal || 0);
        manualSklhTembus = Number(val.skhTembus || 0);
        manualKntrTotal = Number(val.kntrTotal || 0);
        manualKntrTembus = Number(val.kntrTembus || 0);
        manualTkoTotal = Number(val.tkoTotal || 0);
        manualTkoTembus = Number(val.tkoTembus || 0);
      }
    }
  }

  // Ratios
  const pctRkVsPlg = totalPlg > 0 ? (totalRk / totalPlg) * 100 : 0;
  const pctRaVsRk = totalRk > 0 ? (totalRa / totalRk) * 100 : 0;
  const pctRbVsRa = totalRa > 0 ? (totalRb / totalRa) * 100 : 0;
  const pctRbVsPlg = totalPlg > 0 ? (totalRb / totalPlg) * 100 : 0;

  // Number formatting helpers
  const fmtDec = (val: number) => {
    if (isNaN(val) || !isFinite(val)) return "0,00";
    return val.toLocaleString("id-ID", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  const fmtInt = (val: number) => {
    if (isNaN(val) || !isFinite(val)) return "0";
    return Math.trunc(val).toLocaleString("id-ID");
  };

  const fmtPct = (val: number) => {
    if (isNaN(val) || !isFinite(val)) return "0,00%";
    return fmtDec(val) + "%";
  };

  const sectorConfigs = [
    {
      key: "rmh",
      label: "RUMAH",
      bgColor: "bg-amber-100 dark:bg-amber-900/50 text-neutral-950 dark:text-neutral-100 font-bold"
    },
    {
      key: "psr",
      label: "PASAR",
      bgColor: "bg-yellow-200 dark:bg-yellow-900/40 text-neutral-950 dark:text-neutral-100 font-bold"
    },
    {
      key: "skh",
      label: "SEKOLAH",
      bgColor: "bg-sky-100 dark:bg-sky-900/50 text-neutral-950 dark:text-neutral-100 font-bold"
    },
    {
      key: "ktr",
      label: "KANTOR",
      bgColor: "bg-emerald-100 dark:bg-emerald-900/50 text-neutral-950 dark:text-neutral-100 font-bold"
    },
    {
      key: "tk",
      label: "TOKO",
      bgColor: "bg-indigo-100 dark:bg-indigo-900/50 text-neutral-950 dark:text-neutral-100 font-bold"
    },
    {
      key: "ib",
      label: "IB",
      bgColor: "bg-pink-100 dark:bg-pink-900/50 text-neutral-950 dark:text-neutral-100 font-bold"
    }
  ];

  
  const [sendingSpreadsheet, setSendingSpreadsheet] = useState(false);

  const handleKirimSpreadsheet = async () => {
    setSendingSpreadsheet(true);
    try {
      const currentMonth = new Date().toISOString().substring(0, 7);
      
      const payloadData = await Promise.all(activeYlList.map(async (yl) => {
        // Filter transactions for this YL
        const ylTxs = transactions.filter(t => cleanYlName(t.nama) === cleanYlName(yl.nama));
        
        const sumKey = (key: keyof Transaction) => ylTxs.reduce((acc, t) => acc + (Number(t[key]) || 0), 0);
        
        const yo = sumKey("rmh_yo") + sumKey("psr_yo") + sumKey("skh_yo") + sumKey("ktr_yo") + sumKey("tk_yo") + sumKey("ib_yo");
        const om = sumKey("rmh_om") + sumKey("psr_om") + sumKey("skh_om") + sumKey("ktr_om") + sumKey("tk_om") + sumKey("ib_om");
        const os = sumKey("rmh_os") + sumKey("psr_os") + sumKey("skh_os") + sumKey("ktr_os") + sumKey("tk_os") + sumKey("ib_os");
        const yt = sumKey("rmh_yt") + sumKey("psr_yt") + sumKey("skh_yt") + sumKey("ktr_yt") + sumKey("tk_yt") + sumKey("ib_yt");
        
        const totalSales = yo + om + os + yt;
        const avgSales = pembagi > 0 ? totalSales / pembagi : 0;
        
        const yoPct = totalSales > 0 ? (yo / totalSales) * 100 : 0;
        const omPct = totalSales > 0 ? (om / totalSales) * 100 : 0;
        const osPct = totalSales > 0 ? (os / totalSales) * 100 : 0;
        const ytPct = totalSales > 0 ? (yt / totalSales) * 100 : 0;
        
        const last3Txs = [...ylTxs]
          .sort((a, b) => (a.tanggal || "").localeCompare(b.tanggal || ""))
          .slice(-3);
        const plg = last3Txs.reduce((sum, t) => sum + (Number(t.f_plg) || 0), 0);
        const rk = sumKey("f_rk");
        const ra = sumKey("f_ra");
        const rb = sumKey("f_rb");
        
        const rkRatio = plg > 0 ? (rk / plg) * 100 : 0;
        const raRatio = rk > 0 ? (ra / rk) * 100 : 0;
        const rbRaRatio = ra > 0 ? (rb / ra) * 100 : 0;
        const rbPlgRatio = plg > 0 ? (rb / plg) * 100 : 0;

        let pt = { skhTotal: 0, skhTembus: 0, kntrTotal: 0, kntrTembus: 0, tkoTotal: 0, tkoTembus: 0 };
        try {
          const res = await fetch(`/api/getPotensiTembus?bulan=${currentMonth}&nama=${encodeURIComponent(yl.nama)}`);
          if (!res.ok) throw new Error("error");
          const data = await res.json();
          if (data && data.data) {
             pt = data.data;
          }
        } catch(e) {}

        return {
          nama: cleanYlName(yl.nama),
          akumulasi: { yo, om, os, yt, total: totalSales },
          rataRata: avgSales,
          persentase: { yo: yoPct, om: omPct, os: osPct, yt: ytPct },
          pelanggan: { plg, rk, ra, rb },
          rasioPelanggan: { rkPlg: rkRatio, raRk: raRatio, rbRa: rbRaRatio, rbPlg: rbPlgRatio },
          potensiTembus: pt
        };
      }));

      const res = await fetch("/api/kirimPlgPjlKeSpreadsheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bulan: currentMonth,
          data: payloadData
        })
      });

      if (res.ok) {
        alert("✅ Data berhasil dikirim ke spreadsheet!");
      } else {
        alert("❌ Gagal mengirim data ke spreadsheet.");
      }
    } catch (e: any) {
      alert("❌ Error: " + e.message);
    } finally {
      setSendingSpreadsheet(false);
    }
  };

  const handleDownloadExcel = async () => {
    try {
      const activeMonth = historicalMonth || new Date().toISOString().substring(0, 7);
      let res: Response;
      if (historicalData && historicalData.transactions) {
        res = await fetch(`/api/exportRealisasi?month=${encodeURIComponent(activeMonth)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transactions: historicalData.transactions || [],
            breakdownRealisasiMap: historicalData.breakdownRealisasiMap || {},
            potensiTembus: historicalData.potensiTembus || {},
            ylList: ylList || (historicalData as any)?.ylList || []
          })
        });
      } else {
        res = await fetch(`/api/exportRealisasi?month=${encodeURIComponent(activeMonth)}`);
      }

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Server status: ${res.status}`);
      }
      
      const contentDisposition = res.headers.get('Content-Disposition');
      let filename = `Laporan_PLG_PJL_DP1_${activeMonth}.xlsx`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^";]+)"?/);
        if (match) filename = match[1];
      }

      const blob = await res.blob();
      await downloadBlob(blob, {
        filename,
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        directUrl: `/api/exportRealisasi?month=${encodeURIComponent(activeMonth)}`
      });

      alert(`✅ File Excel Laporan PLG PJL (Sheet: plg pjl(laporan Dp 1)) bulan ${activeMonth} berhasil diunduh!`);
    } catch (e: any) {
      alert("Error unduh Excel: " + (e.message || "Gagal mengunduh file"));
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header Card */}
      <div className="bd-card p-4 md:p-5 space-y-4 text-neutral-900 dark:text-neutral-100">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <MenuTitleIcon id="plg_pjl" />
              <h2 className="bd-title uppercase">
                LAPORAN PELANGGAN & PENJUALAN
              </h2>
            </div>
            <p className="bd-sub font-medium">
              Analisis akumulasi penjualan per potensi, rasio kunjungan, pelanggan, dan ketercapaian tembus.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="bd-field text-xs font-bold text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5 font-mono tabular-nums">
              <span className="text-brand-700 dark:text-brand-300 font-bold text-sm">📅 {pembagi} Hari</span>
            </div>

            <button
              onClick={handleDownloadExcel}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl transition-all shadow cursor-pointer flex items-center gap-1.5"
              title="Unduh Laporan Format Excel: plg pjl(laporan Dp 1)"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Unduh Excel PLG PJL</span>
            </button>
          </div>
        </div>

        {/* Dropdown Selector for All Active YLs + TKU DP 1 */}
        <div className="bd-subcard p-3 flex flex-col sm:flex-row sm:items-center gap-3">
          <label className="text-xs font-bold text-neutral-800 dark:text-neutral-200 uppercase tracking-wider flex items-center gap-1.5 min-w-[120px]">
            <Users className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            <span>Pilih YL / Unit:</span>
          </label>
          <select
            value={selectedArea}
            onChange={(e) => setSelectedArea(e.target.value)}
            className="flex-1 bg-white dark:bg-neutral-800 text-neutral-950 dark:text-white font-bold text-sm border-2 border-cyan-500 rounded-xl px-3 py-2 focus:ring-2 focus:ring-cyan-400 outline-none cursor-pointer shadow-sm"
          >
            <option value="TKU_DP1">
              🏆 TKU DP 1 - TOTAL TIM KESELURUHAN ({activeYlList.length} YL)
            </option>
            {activeYlList.map((yl) => (
              <option key={yl.area} value={yl.area}>
                {yl.area} - {cleanYlName(yl.nama)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Table Container matching Excel Layout with Crisp Grid Lines */}
      <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-300 dark:border-neutral-800 shadow-md overflow-hidden text-neutral-900 dark:text-neutral-100">
        <div className="overflow-x-auto">
          <table className="w-full text-xs sm:text-sm font-bold border-collapse min-w-[700px]">
            <thead>
              {/* Header Row matching bright cyan Excel format with clear borders */}
              <tr className="bg-cyan-500 text-neutral-950 font-bold text-xs sm:text-sm border-b-2 border-neutral-900 divide-x-2 divide-neutral-900">
                <th className="p-2.5 text-left uppercase w-48 border-r-2 border-neutral-900">
                  {isTkuDp1 ? "TKU DP 1 (TOTAL TIM)" : `${selectedArea} \u00a0 ${cleanYlName(currentYl.nama)}`}
                </th>
                <th className="p-2.5 text-right uppercase w-24 border-r-2 border-neutral-900 font-mono">AKM</th>
                <th className="p-2.5 text-right uppercase w-24 border-r-2 border-neutral-900 bg-cyan-400 font-mono">
                  SUB AKM
                </th>
                <th className="p-2.5 text-right uppercase w-28 border-r-2 border-neutral-900 font-mono">RATA RATA</th>
                <th className="p-2.5 text-right uppercase w-28 border-r-2 border-neutral-900 bg-cyan-400 font-mono">
                  SUB RATA
                </th>
                <th className="p-2.5 text-right uppercase w-28 border-r-2 border-neutral-900 font-mono">PERSEN</th>
                <th className="p-2.5 text-right uppercase w-28 font-mono">SUB PERSEN</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-neutral-300">
              {sectorConfigs.map((sec) => {
                const sData = sectorsData[sec.key as keyof typeof sectorsData];
                const subAkm = sData.yo + sData.om + sData.os + sData.yt;
                const subRata = pembagi > 0 ? subAkm / pembagi : 0;
                const subPct = grandTotal > 0 ? (subAkm / grandTotal) * 100 : 0;

                const products: Array<{
                  code: "yo" | "om" | "os" | "yt";
                  label: string;
                  totalProduct: number;
                }> = [
                  { code: "yo", label: `${sec.label} YO`, totalProduct: totalYo },
                  { code: "om", label: `${sec.label} OM`, totalProduct: totalOm },
                  { code: "os", label: `${sec.label} OS`, totalProduct: totalOs },
                  { code: "yt", label: `${sec.label} YT`, totalProduct: totalYt }
                ];

                return (
                  <React.Fragment key={sec.key}>
                    {products.map((prod, pIdx) => {
                      const valAkm = sData[prod.code];
                      const valRata = pembagi > 0 ? valAkm / pembagi : 0;
                      const valPct = prod.totalProduct > 0 ? (valAkm / prod.totalProduct) * 100 : 0;

                      return (
                        <tr
                          key={`${sec.key}_${prod.code}`}
                          className={`${sec.bgColor} border-b border-neutral-400 dark:border-neutral-600 hover:brightness-95 transition-all`}
                        >
                          {/* 1. Item Name */}
                          <td className="p-2 border-r-2 border-neutral-400 dark:border-neutral-600 font-bold uppercase pl-4 text-neutral-900 dark:text-neutral-100">
                            {prod.label}
                          </td>

                          {/* 2. AKM Row */}
                          <td className="p-0 border-r border-neutral-400 dark:border-neutral-600 font-black font-mono tabular-nums text-neutral-900 dark:text-neutral-100">
                            {historicalData?.editableAkm && !isTkuDp1 ? (
                              <NumberInput
                                className="w-full h-full p-2 text-right bg-yellow-50 dark:bg-yellow-950/40 outline-none focus:bg-yellow-200 dark:focus:bg-yellow-900/50 focus:ring-2 focus:ring-yellow-500 font-black font-mono tabular-nums text-neutral-900 dark:text-neutral-100 border-none"
                                value={valAkm}
                                onChange={(val) => historicalData.onAkmChange?.(currentYl.nama, sec.key, prod.code, val)}
                                onPaste={(e) => {
                                  // Compute global row index for paste (24 rows total)
                                  const secIndex = sectorConfigs.findIndex(s => s.key === sec.key);
                                  const startIndex = secIndex * 4 + pIdx;
                                  historicalData.onAkmPaste?.(e, currentYl.nama, startIndex);
                                }}
                              />
                            ) : (
                              <div className="p-2 text-right font-mono tabular-nums">{fmtInt(valAkm)}</div>
                            )}
                          </td>

                          {/* 3. Subtotal AKM (Merged column spanning 4 product rows) */}
                          {pIdx === 0 && (
                            <td
                              rowSpan={4}
                              className="p-2 text-right border-r-2 border-neutral-400 dark:border-neutral-600 font-black font-mono tabular-nums text-sm sm:text-base bg-neutral-100/90 dark:bg-neutral-800/90 text-neutral-950 dark:text-white align-middle shadow-inner"
                            >
                              {fmtInt(subAkm)}
                            </td>
                          )}

                          {/* 4. RATA RATA Row */}
                          <td className="p-2 text-right border-r border-neutral-400 dark:border-neutral-600 font-black font-mono tabular-nums text-neutral-900 dark:text-neutral-100">
                            {fmtDec(valRata)}
                          </td>

                          {/* 5. Subtotal RATA RATA (Merged column) */}
                          {pIdx === 0 && (
                            <td
                              rowSpan={4}
                              className="p-2 text-right border-r-2 border-neutral-400 dark:border-neutral-600 font-black font-mono tabular-nums text-sm sm:text-base bg-neutral-100/90 dark:bg-neutral-800/90 text-neutral-950 dark:text-white align-middle shadow-inner"
                            >
                              {fmtDec(subRata)}
                            </td>
                          )}

                          {/* 6. PERSEN Row */}
                          <td className="p-2 text-right border-r border-neutral-400 dark:border-neutral-600 font-black font-mono tabular-nums text-neutral-900 dark:text-neutral-100">
                            {fmtPct(valPct)}
                          </td>

                          {/* 7. Subtotal PERSEN (Merged column) */}
                          {pIdx === 0 && (
                            <td
                              rowSpan={4}
                              className="p-2 text-right font-black font-mono tabular-nums text-sm sm:text-base bg-neutral-100/90 dark:bg-neutral-800/90 text-neutral-950 dark:text-white align-middle shadow-inner"
                            >
                              {fmtPct(subPct)}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}

              {/* GRAND TOTAL ROW matching Cyan Excel Footer */}
              <tr className="bg-cyan-500 text-neutral-950 font-bold text-xs sm:text-sm border-t-2 border-b-2 border-neutral-950">
                <td className="p-2 border-r-2 border-neutral-950 uppercase">TOTAL YO</td>
                <td className="p-2 text-right border-r border-neutral-950 font-mono tabular-nums">{fmtInt(totalYo)}</td>
                <td rowSpan={4} className="p-2 text-right border-r-2 border-neutral-950 bg-cyan-400 font-black font-mono tabular-nums text-base sm:text-lg align-middle">
                  {fmtInt(grandTotal)}
                </td>
                <td className="p-2 text-right border-r border-neutral-950 font-mono tabular-nums">{fmtDec(pembagi > 0 ? totalYo / pembagi : 0)}</td>
                <td rowSpan={4} className="p-2 text-right border-r-2 border-neutral-950 bg-cyan-400 font-black font-mono tabular-nums text-base sm:text-lg align-middle">
                  {fmtDec(pembagi > 0 ? grandTotal / pembagi : 0)}
                </td>
                <td className="p-2 text-right border-r border-neutral-950 font-mono tabular-nums">100,00%</td>
                <td rowSpan={4} className="p-2 text-right bg-cyan-400 font-black font-mono tabular-nums text-base sm:text-lg align-middle">
                  100,00%
                </td>
              </tr>

              <tr className="bg-cyan-500 text-neutral-950 font-bold text-xs sm:text-sm border-b border-neutral-950">
                <td className="p-2 border-r-2 border-neutral-950 uppercase">TOTAL OM</td>
                <td className="p-2 text-right border-r border-neutral-950 font-mono tabular-nums">{fmtInt(totalOm)}</td>
                <td className="p-2 text-right border-r border-neutral-950 font-mono tabular-nums">{fmtDec(pembagi > 0 ? totalOm / pembagi : 0)}</td>
                <td className="p-2 text-right border-r border-neutral-950 font-mono tabular-nums">100,00%</td>
              </tr>

              <tr className="bg-cyan-500 text-neutral-950 font-bold text-xs sm:text-sm border-b border-neutral-950">
                <td className="p-2 border-r-2 border-neutral-950 uppercase">TOTAL OS</td>
                <td className="p-2 text-right border-r border-neutral-950 font-mono tabular-nums">{fmtInt(totalOs)}</td>
                <td className="p-2 text-right border-r border-neutral-950 font-mono tabular-nums">{fmtDec(pembagi > 0 ? totalOs / pembagi : 0)}</td>
                <td className="p-2 text-right border-r border-neutral-950 font-mono tabular-nums">100,00%</td>
              </tr>

              <tr className="bg-cyan-500 text-neutral-950 font-bold text-xs sm:text-sm border-b-2 border-neutral-950">
                <td className="p-2 border-r-2 border-neutral-950 uppercase">TOTAL YT</td>
                <td className="p-2 text-right border-r border-neutral-950 font-mono tabular-nums">{fmtInt(totalYt)}</td>
                <td className="p-2 text-right border-r border-neutral-950 font-mono tabular-nums">{fmtDec(pembagi > 0 ? totalYt / pembagi : 0)}</td>
                <td className="p-2 text-right border-r border-neutral-950 font-mono tabular-nums">100,00%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Metrics & Otomatis dari YLs Section Below Table */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 [&>*]:min-w-0">
        {/* Left Card: Summary Metrics & Percentages */}
        <div className="bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-neutral-200 dark:border-neutral-800 shadow-md space-y-3 text-neutral-900 dark:text-neutral-100">
          <div className="flex items-center gap-2 border-b border-neutral-100 dark:border-neutral-800 pb-2">
            <Award className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-900 dark:text-white">
              METRIK PELANGGAN, KUNJUNGAN & RASIO (%)
            </h3>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs font-bold">
            <div className="bg-neutral-50 dark:bg-neutral-800/60 p-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 shadow-sm">
              <span className="text-[10px] text-neutral-600 dark:text-neutral-400 block uppercase font-bold">JML PELANGGAN</span>
              {historicalData?.editableAkm && !isTkuDp1 ? (
                <NumberInput
                  className="w-full text-sm font-black font-mono tabular-nums text-neutral-950 dark:text-white bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 rounded px-1.5 py-0.5 outline-none focus:ring-2 focus:ring-cyan-500 shadow-inner"
                  value={totalPlg}
                  onChange={(val) => historicalData.onTxFieldChange?.(currentYl.nama, "f_plg", val)}
                />
              ) : (
                <span className="text-sm font-black font-mono tabular-nums text-neutral-950 dark:text-white">{fmtInt(totalPlg)}</span>
              )}
            </div>

            <div className="bg-neutral-50 dark:bg-neutral-800/60 p-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 shadow-sm">
              <span className="text-[10px] text-neutral-600 dark:text-neutral-400 block uppercase font-bold">RK (Kunjungan)</span>
              {historicalData?.editableAkm && !isTkuDp1 ? (
                <NumberInput
                  className="w-full text-sm font-black font-mono tabular-nums text-neutral-950 dark:text-white bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 rounded px-1.5 py-0.5 outline-none focus:ring-2 focus:ring-cyan-500 shadow-inner"
                  value={totalRk}
                  onChange={(val) => historicalData.onTxFieldChange?.(currentYl.nama, "f_rk", val)}
                />
              ) : (
                <span className="text-sm font-black font-mono tabular-nums text-neutral-950 dark:text-white">{fmtInt(totalRk)}</span>
              )}
            </div>

            <div className="bg-neutral-50 dark:bg-neutral-800/60 p-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 shadow-sm">
              <span className="text-[10px] text-neutral-600 dark:text-neutral-400 block uppercase font-bold">RA (Rumah Ada)</span>
              {historicalData?.editableAkm && !isTkuDp1 ? (
                <NumberInput
                  className="w-full text-sm font-black font-mono tabular-nums text-neutral-950 dark:text-white bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 rounded px-1.5 py-0.5 outline-none focus:ring-2 focus:ring-cyan-500 shadow-inner"
                  value={totalRa}
                  onChange={(val) => historicalData.onTxFieldChange?.(currentYl.nama, "f_ra", val)}
                />
              ) : (
                <span className="text-sm font-black font-mono tabular-nums text-neutral-950 dark:text-white">{fmtInt(totalRa)}</span>
              )}
            </div>

            <div className="bg-amber-50 dark:bg-amber-950/30 p-2.5 rounded-xl border border-amber-200 dark:border-amber-800 shadow-sm">
              <span className="text-[10px] text-amber-800 dark:text-amber-300 block uppercase font-bold">RB (Rumah Beli)</span>
              {historicalData?.editableAkm && !isTkuDp1 ? (
                <NumberInput
                  className="w-full text-sm font-black font-mono tabular-nums text-amber-950 dark:text-amber-200 bg-white dark:bg-neutral-800 border border-amber-300 dark:border-amber-700 rounded px-1.5 py-0.5 outline-none focus:ring-2 focus:ring-amber-500 shadow-inner"
                  value={totalRb}
                  onChange={(val) => historicalData.onTxFieldChange?.(currentYl.nama, "f_rb", val)}
                />
              ) : (
                <span className="text-sm font-black font-mono tabular-nums text-amber-950 dark:text-amber-200">{fmtInt(totalRb)}</span>
              )}
            </div>

            <div className="bg-emerald-50 dark:bg-emerald-950/30 p-2.5 rounded-xl border border-emerald-200 dark:border-emerald-800 shadow-sm">
              <span className="text-[10px] text-emerald-800 dark:text-emerald-300 block uppercase font-bold">PB (Propaganda)</span>
              {historicalData?.editableAkm && !isTkuDp1 ? (
                <NumberInput
                  className="w-full text-sm font-black font-mono tabular-nums text-emerald-950 dark:text-emerald-200 bg-white dark:bg-neutral-800 border border-emerald-300 dark:border-emerald-700 rounded px-1.5 py-0.5 outline-none focus:ring-2 focus:ring-emerald-500 shadow-inner"
                  value={totalPb}
                  onChange={(val) => historicalData.onTxFieldChange?.(currentYl.nama, "pb_p", val)}
                />
              ) : (
                <span className="text-sm font-black font-mono tabular-nums text-emerald-950 dark:text-emerald-200">{fmtInt(totalPb)}</span>
              )}
            </div>

            <div className="bg-rose-50 dark:bg-rose-950/30 p-2.5 rounded-xl border border-rose-200 dark:border-rose-800 shadow-sm">
              <span className="text-[10px] text-rose-800 dark:text-rose-300 block uppercase font-bold">BB (Barang Kembali)</span>
              {historicalData?.editableAkm && !isTkuDp1 ? (
                <NumberInput
                  className="w-full text-sm font-black font-mono tabular-nums text-rose-950 dark:text-rose-200 bg-white dark:bg-neutral-800 border border-rose-300 dark:border-rose-700 rounded px-1.5 py-0.5 outline-none focus:ring-2 focus:ring-rose-500 shadow-inner"
                  value={totalBb}
                  onChange={(val) => historicalData.onTxFieldChange?.(currentYl.nama, "bb_yo", val)}
                />
              ) : (
                <span className="text-sm font-black font-mono tabular-nums text-rose-950 dark:text-rose-200">{fmtInt(totalBb)}</span>
              )}
            </div>

            <div className="bg-neutral-50 dark:bg-neutral-800/60 p-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 shadow-sm">
              <span className="text-[10px] text-neutral-600 dark:text-neutral-400 block uppercase font-bold">PELANGGAN APK</span>
              {historicalData?.editableAkm && !isTkuDp1 ? (
                <NumberInput
                  className="w-full text-sm font-black font-mono tabular-nums text-neutral-950 dark:text-white bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 rounded px-1.5 py-0.5 outline-none focus:ring-2 focus:ring-cyan-500 shadow-inner"
                  value={totalPlgApk}
                  onChange={(val) => historicalData.onTxFieldChange?.(currentYl.nama, "apk_plg", val)}
                />
              ) : (
                <span className="text-sm font-black font-mono tabular-nums text-neutral-950 dark:text-white">{fmtInt(totalPlgApk)}</span>
              )}
            </div>

            <div className="bg-indigo-50 dark:bg-indigo-950/30 p-2.5 rounded-xl border border-indigo-200 dark:border-indigo-800 shadow-sm col-span-2">
              <span className="text-[10px] text-indigo-800 dark:text-indigo-300 block uppercase font-bold">SAMPAH BOTOL</span>
              {historicalData?.editableAkm && !isTkuDp1 ? (
                <NumberInput
                  className="w-full text-sm font-black font-mono tabular-nums text-indigo-950 dark:text-indigo-200 bg-white dark:bg-neutral-800 border border-indigo-300 dark:border-indigo-700 rounded px-1.5 py-0.5 outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner"
                  value={totalSampahBotol}
                  onChange={(val) => historicalData.onTxFieldChange?.(currentYl.nama, "apk_botol", val)}
                />
              ) : (
                <span className="text-sm font-black font-mono tabular-nums text-indigo-950 dark:text-indigo-200">{fmtInt(totalSampahBotol)}</span>
              )}
            </div>
          </div>

          {/* Calculated Percentages Table */}
          <div className="pt-2">
            <h4 className="text-[11px] font-bold uppercase text-neutral-800 dark:text-neutral-200 mb-2">
              📊 PERSENTASE RASIO KUNJUNGAN & TRANSAKSI:
            </h4>
            <div className="grid grid-cols-1 min-[420px]:grid-cols-3 md:grid-cols-1 xl:grid-cols-3 gap-2 text-xs font-bold font-mono tabular-nums [&>*]:min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 bg-cyan-50 dark:bg-cyan-950/40 p-2 rounded-lg border border-cyan-200 dark:border-cyan-800 shadow-sm">
                <span className="text-cyan-900 dark:text-cyan-300 font-bold font-sans">% RA vs RK:</span>
                <span className="font-bold text-cyan-950 dark:text-cyan-200 text-sm">{fmtPct(pctRaVsRk)}</span>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 bg-cyan-50 dark:bg-cyan-950/40 p-2 rounded-lg border border-cyan-200 dark:border-cyan-800 shadow-sm">
                <span className="text-cyan-900 dark:text-cyan-300 font-bold font-sans">% RB vs RA:</span>
                <span className="font-bold text-cyan-950 dark:text-cyan-200 text-sm">{fmtPct(pctRbVsRa)}</span>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 bg-cyan-50 dark:bg-cyan-950/40 p-2 rounded-lg border border-cyan-200 dark:border-cyan-800 shadow-sm">
                <span className="text-cyan-900 dark:text-cyan-300 font-bold font-sans">% RB vs Pelanggan:</span>
                <span className="font-bold text-cyan-950 dark:text-cyan-200 text-sm">{fmtPct(pctRbVsPlg)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Card: Otomatis dari YLs for Sekolah, Kantor, Toko & Tembus */}
        <div className="bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-neutral-200 dark:border-neutral-800 shadow-md space-y-3 flex flex-col justify-between text-neutral-900 dark:text-neutral-100">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 pb-2">
              <div className="flex items-center gap-2">
                <School className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-900 dark:text-white">
                  {isTkuDp1
                    ? "TOTAL AKUMULASI LEMBAGA & TEMBUS (TKU DP 1)"
                    : `AKUMULASI LEMBAGA & TEMBUS (${selectedArea})`}
                </h3>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                isTkuDp1
                  ? "text-cyan-800 dark:text-cyan-300 bg-cyan-100 dark:bg-cyan-950/60 border-cyan-300 dark:border-cyan-800"
                  : "text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/60 border-amber-300 dark:border-amber-800"
              }`}>
                {isTkuDp1 ? "Total Otomatis Tim" : "Otomatis dari YL"}
              </span>
            </div>

            <p className="text-[11px] text-neutral-600 dark:text-neutral-400 font-medium">
              {isTkuDp1
                ? `Menampilkan total gabungan lembaga & tembus dari seluruh ${activeYlList.length} YL aktif.`
                : "Menampilkan total kunjungan lembaga dan tembus dari YL yang dipilih."}
            </p>

            {/* Manual Form Controls */}
            <div className="space-y-3 pt-1">
              {/* 1. Sekolah */}
              <div className="bg-neutral-50 dark:bg-neutral-800/60 p-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 space-y-2">
                <label className="text-xs font-bold text-neutral-900 dark:text-white flex items-center gap-1.5">
                  <School className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                  <span>TOTAL SKLH / TEMBUS:</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] text-neutral-600 dark:text-neutral-400 block mb-0.5 font-bold">Total Sekolah</span>
                    <NumberInput
                      disabled={!historicalData?.editableAkm || isTkuDp1}
                      value={manualSklhTotal}
                      onChange={(val) => historicalData?.onPotensiChange?.(currentYl.nama, "skhTotal", val)}
                      className="w-full bg-white dark:bg-neutral-800 text-neutral-950 dark:text-white font-extrabold font-mono tabular-nums text-xs border border-neutral-300 dark:border-neutral-600 rounded-lg p-2 focus:ring-2 focus:ring-cyan-500 outline-none disabled:bg-neutral-100 dark:disabled:bg-neutral-900 disabled:opacity-80 disabled:cursor-not-allowed shadow-sm"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-neutral-600 dark:text-neutral-400 block mb-0.5 font-bold">Sekolah Tembus</span>
                    <NumberInput
                      disabled={!historicalData?.editableAkm || isTkuDp1}
                      value={manualSklhTembus}
                      onChange={(val) => historicalData?.onPotensiChange?.(currentYl.nama, "skhTembus", val)}
                      className="w-full bg-white dark:bg-neutral-800 text-neutral-950 dark:text-white font-extrabold font-mono tabular-nums text-xs border border-neutral-300 dark:border-neutral-600 rounded-lg p-2 focus:ring-2 focus:ring-cyan-500 outline-none disabled:bg-neutral-100 dark:disabled:bg-neutral-900 disabled:opacity-80 disabled:cursor-not-allowed shadow-sm"
                    />
                  </div>
                </div>
              </div>

              {/* 2. Kantor */}
              <div className="bg-neutral-50 dark:bg-neutral-800/60 p-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 space-y-2">
                <label className="text-xs font-bold text-neutral-900 dark:text-white flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>TOTAL KNTR / TEMBUS:</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] text-neutral-600 dark:text-neutral-400 block mb-0.5 font-bold">Total Kantor</span>
                    <NumberInput
                      disabled={!historicalData?.editableAkm || isTkuDp1}
                      value={manualKntrTotal}
                      onChange={(val) => historicalData?.onPotensiChange?.(currentYl.nama, "kntrTotal", val)}
                      className="w-full bg-white dark:bg-neutral-800 text-neutral-950 dark:text-white font-extrabold font-mono tabular-nums text-xs border border-neutral-300 dark:border-neutral-600 rounded-lg p-2 focus:ring-2 focus:ring-cyan-500 outline-none disabled:bg-neutral-100 dark:disabled:bg-neutral-900 disabled:opacity-80 disabled:cursor-not-allowed shadow-sm"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-neutral-600 dark:text-neutral-400 block mb-0.5 font-bold">Kantor Tembus</span>
                    <NumberInput
                      disabled={!historicalData?.editableAkm || isTkuDp1}
                      value={manualKntrTembus}
                      onChange={(val) => historicalData?.onPotensiChange?.(currentYl.nama, "kntrTembus", val)}
                      className="w-full bg-white dark:bg-neutral-800 text-neutral-950 dark:text-white font-extrabold font-mono tabular-nums text-xs border border-neutral-300 dark:border-neutral-600 rounded-lg p-2 focus:ring-2 focus:ring-cyan-500 outline-none disabled:bg-neutral-100 dark:disabled:bg-neutral-900 disabled:opacity-80 disabled:cursor-not-allowed shadow-sm"
                    />
                  </div>
                </div>
              </div>

              {/* 3. Toko */}
              <div className="bg-neutral-50 dark:bg-neutral-800/60 p-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 space-y-2">
                <label className="text-xs font-bold text-neutral-900 dark:text-white flex items-center gap-1.5">
                  <Store className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>TOTAL TKO / TEMBUS:</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] text-neutral-600 dark:text-neutral-400 block mb-0.5 font-bold">Total Toko</span>
                    <NumberInput
                      disabled={!historicalData?.editableAkm || isTkuDp1}
                      value={manualTkoTotal}
                      onChange={(val) => historicalData?.onPotensiChange?.(currentYl.nama, "tkoTotal", val)}
                      className="w-full bg-white dark:bg-neutral-800 text-neutral-950 dark:text-white font-extrabold font-mono tabular-nums text-xs border border-neutral-300 dark:border-neutral-600 rounded-lg p-2 focus:ring-2 focus:ring-cyan-500 outline-none disabled:bg-neutral-100 dark:disabled:bg-neutral-900 disabled:opacity-80 disabled:cursor-not-allowed shadow-sm"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-neutral-600 dark:text-neutral-400 block mb-0.5 font-bold">Toko Tembus</span>
                    <NumberInput
                      disabled={!historicalData?.editableAkm || isTkuDp1}
                      value={manualTkoTembus}
                      onChange={(val) => historicalData?.onPotensiChange?.(currentYl.nama, "tkoTembus", val)}
                      className="w-full bg-white dark:bg-neutral-800 text-neutral-950 dark:text-white font-extrabold font-mono tabular-nums text-xs border border-neutral-300 dark:border-neutral-600 rounded-lg p-2 focus:ring-2 focus:ring-cyan-500 outline-none disabled:bg-neutral-100 dark:disabled:bg-neutral-900 disabled:opacity-80 disabled:cursor-not-allowed shadow-sm"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export const PlgPjlView = React.memo(PlgPjlViewInner);
