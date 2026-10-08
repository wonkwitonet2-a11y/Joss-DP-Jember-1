import React from "react";
import { GridSelectionToolbar } from "./GridSelectionToolbar";
import { SpreadsheetInputBar } from "./SpreadsheetInputBar";
import type { GridSelection } from "./useSimpleGrid";
import type { Transaction } from "../types";

interface YlRealisasiPotensiTabProps {
  currentMonth?: string;
  isEditRealisasi: boolean;
  isRefreshing?: boolean;
  realisasiGridSelection: GridSelection | null;
  realisasiIsMenuOpen?: boolean;
  setRealisasiIsMenuOpen?: (open: boolean) => void;
  realisasiMenuPos?: { x: number; y: number } | null;
  handleRealisasiGridCopy: () => void;
  handleRealisasiGridCut: () => void;
  handleRealisasiGridPaste: (text?: string, overrideSelection?: GridSelection | null) => void;
  handleRealisasiGridClear: () => void;
  setRealisasiGridSelection: React.Dispatch<React.SetStateAction<GridSelection | null>>;
  handleToggleEditRealisasi: () => void;
  handleSaveEditRealisasi: () => void;
  isSavingRealisasi: boolean;
  transactions: Transaction[];
  editDataRealisasi: Record<number, any>;
  setEditDataRealisasi: React.Dispatch<React.SetStateAction<Record<number, any>>>;
  ylBreakdownRealisasi: any;
  getRealisasiCellProps: (r: number, c: number) => { className?: string; [key: string]: any };
  renderRealisasiSelectionHandle?: (r: number, c: number) => React.ReactNode;
  selectRealisasiRow: (rIdx: number) => void;
  activeCell?: { r: number; c: number } | null;
  activeCellValue?: number | string;
  isActiveCellEditable?: boolean;
  handleActiveCellValueChange?: (val: number | string) => void;
  goToNextCell?: () => void;
  goToPrevCell?: () => void;
}

const REALISASI_COL_NAMES = [
  "Rumah • YO", "Rumah • OM", "Rumah • OS", "Rumah • YT",
  "Pasar • YO", "Pasar • OM", "Pasar • OS", "Pasar • YT",
  "Sekolah • YO", "Sekolah • OM", "Sekolah • OS", "Sekolah • YT",
  "Kantor • YO", "Kantor • OM", "Kantor • OS", "Kantor • YT",
  "Toko • YO", "Toko • OM", "Toko • OS", "Toko • YT",
  "IB • YO", "IB • OM", "IB • OS", "IB • YT",
  "BB • YO", "BB • OM", "BB • OS", "BB • YT",
  "PB Pagi", "PB Sore", "Pelanggan", "RK", "RA", "RB",
  "Pelanggan APK", "Sampah Botol"
];

function YlRealisasiPotensiTabInner({
  currentMonth,
  isEditRealisasi,
  isRefreshing,
  realisasiGridSelection,
  realisasiIsMenuOpen,
  setRealisasiIsMenuOpen,
  realisasiMenuPos,
  handleRealisasiGridCopy,
  handleRealisasiGridCut,
  handleRealisasiGridPaste,
  handleRealisasiGridClear,
  setRealisasiGridSelection,
  handleToggleEditRealisasi,
  handleSaveEditRealisasi,
  isSavingRealisasi,
  transactions,
  editDataRealisasi,
  setEditDataRealisasi,
  ylBreakdownRealisasi,
  getRealisasiCellProps,
  renderRealisasiSelectionHandle,
  selectRealisasiRow,
  activeCell,
  activeCellValue,
  isActiveCellEditable,
  handleActiveCellValueChange,
  goToNextCell,
  goToPrevCell,
}: YlRealisasiPotensiTabProps) {
  const daysList = Array.from({ length: 31 }, (_, i) => i + 1);

  let totRmh = 0, totPsr = 0, totSkh = 0, totKtr = 0, totTk = 0, totIb = 0;
  let totBb = 0, totPbPagi = 0, totPbSore = 0, totPlgApk = 0, totSampahBtl = 0, totPlg = 0, totRk = 0, totRa = 0, totRb = 0;
  let totDayYo = 0, totDayOm = 0, totDayOs = 0, totDayYt = 0;

  const cellLabel = activeCell
    ? `Tgl ${activeCell.r + 1} • ${REALISASI_COL_NAMES[activeCell.c] || `C${activeCell.c + 1}`}`
    : undefined;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 space-y-4 overflow-hidden">
        <div className="border-l-4 border-indigo-600 pl-3 flex flex-col md:flex-row md:items-start lg:items-center justify-between gap-3">
          <GridSelectionToolbar 
            selection={realisasiGridSelection}
            isMenuOpen={realisasiIsMenuOpen}
            menuPos={realisasiMenuPos}
            onCopy={handleRealisasiGridCopy}
            onCut={handleRealisasiGridCut}
            onPaste={() => handleRealisasiGridPaste()}
            onClear={handleRealisasiGridClear}
            onClose={() => {
              setRealisasiIsMenuOpen?.(false);
              setRealisasiGridSelection(null);
            }}
          />
          <div className="flex-1 min-w-0 pr-1">
            <h2 className="text-sm sm:text-base font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <span>🏘️ Tabel Realisasi Potensi Sektor (Pertanggal)</span>
            </h2>
            <p className="text-xs text-slate-500 font-bold leading-relaxed mt-0.5">
              Data realisasi potensi penjualan per sektor (Rumah, Pasar, Sekolah, Kantor, Toko, IB - Instan Buyer) otomatis tersimpan pertanggal sesuai input YL.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <span className="text-xs font-mono bg-indigo-100 text-indigo-800 font-black px-3 py-1.5 rounded-lg shrink-0">
              📌 Per Yakult Lady
            </span>
            {isEditRealisasi ? (
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={handleToggleEditRealisasi} className="text-xs sm:text-sm bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold py-1.5 px-3 rounded-lg cursor-pointer">Batal</button>
                <button onClick={handleSaveEditRealisasi} disabled={isSavingRealisasi} className="text-xs sm:text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-1.5 px-3 rounded-lg disabled:opacity-50 cursor-pointer">
                  {isSavingRealisasi ? "Menyimpan..." : "Simpan Perubahan"}
                </button>
              </div>
            ) : (
              <button onClick={handleToggleEditRealisasi} className="text-xs sm:text-sm bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold py-1.5 px-3 border border-indigo-200 rounded-lg cursor-pointer shrink-0">
                ✏️ Edit Tabel
              </button>
            )}
          </div>
        </div>

        <div className="space-y-3">
          {isRefreshing && (
            <div className="bg-sky-50 border border-sky-200 text-sky-800 text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-2 animate-pulse">
              <span className="inline-block w-2 h-2 rounded-full bg-sky-600 animate-ping" />
              <span>Memperbarui & menyelaraskan data tabel realisasi potensi dari server...</span>
            </div>
          )}
          <div className="overflow-x-auto overflow-y-auto max-h-[70vh] border border-slate-200 rounded-xl fast-scroll">
            <table className="w-full text-left text-xs sm:text-sm border-collapse font-mono min-w-[900px]">
              <thead className="sticky top-0 z-30 sticky-header-gpu">
                <tr className="bg-slate-900 text-slate-200 font-bold uppercase text-xs border-b border-slate-700">
                  <th rowSpan={2} className="p-2 border-r border-slate-800 sticky left-0 bg-slate-900 z-40 min-w-[70px]">Tgl</th>
                  <th colSpan={4} className="p-1.5 text-center border-r border-slate-700 text-emerald-400 bg-emerald-950/30">Rumah</th>
                  <th colSpan={4} className="p-1.5 text-center border-r border-slate-700 text-amber-400 bg-amber-950/30">Pasar</th>
                  <th colSpan={4} className="p-1.5 text-center border-r border-slate-700 text-pink-400 bg-pink-950/30">Sekolah</th>
                  <th colSpan={4} className="p-1.5 text-center border-r border-slate-700 text-purple-400 bg-purple-950/30">Kantor</th>
                  <th colSpan={4} className="p-1.5 text-center border-r border-slate-700 text-teal-400 bg-teal-950/30">Toko</th>
                  <th colSpan={4} className="p-1.5 text-center border-r border-slate-700 text-indigo-400 bg-indigo-950/30">IB</th>
                  <th colSpan={4} className="p-1.5 text-center border-r border-slate-700 text-yellow-300 bg-slate-800">Total Jual (Aktual/Acuan)</th>
                  {isEditRealisasi ? (
                    <th colSpan={4} className="p-1.5 text-center border-r border-slate-700 text-rose-400 bg-rose-950/30">BB</th>
                  ) : (
                    <th rowSpan={2} className="p-2 text-center text-rose-400 border-l border-slate-700">BB</th>
                  )}
                  <th rowSpan={2} className="p-2 text-center text-lime-400 border-l border-slate-700">PB Pg</th>
                  <th rowSpan={2} className="p-2 text-center text-lime-400 border-l border-slate-700">PB Sr</th>
                  <th rowSpan={2} className="p-2 text-center text-orange-400 border-l border-slate-700">PELANGGAN</th>
                  <th rowSpan={2} className="p-2 text-center text-blue-400 border-l border-slate-700">RK</th>
                  <th rowSpan={2} className="p-2 text-center text-violet-400 border-l border-slate-700">RA</th>
                  <th rowSpan={2} className="p-2 text-center text-fuchsia-400 border-l border-slate-700">RB</th>
                  <th rowSpan={2} className="p-2 text-center text-sky-400 border-l border-slate-700">PELANGGAN APK</th>
                  <th rowSpan={2} className="p-2 text-center text-cyan-400 border-l border-slate-700">Smpah</th>
                </tr>
                <tr className="bg-slate-800 text-slate-300 font-bold uppercase text-[10px] sm:text-xs">
                  <th className="p-1 text-center">YO</th><th className="p-1 text-center">OM</th><th className="p-1 text-center">OS</th><th className="p-1 text-center border-r border-slate-700">YT</th>
                  <th className="p-1 text-center">YO</th><th className="p-1 text-center">OM</th><th className="p-1 text-center">OS</th><th className="p-1 text-center border-r border-slate-700">YT</th>
                  <th className="p-1 text-center">YO</th><th className="p-1 text-center">OM</th><th className="p-1 text-center">OS</th><th className="p-1 text-center border-r border-slate-700">YT</th>
                  <th className="p-1 text-center">YO</th><th className="p-1 text-center">OM</th><th className="p-1 text-center">OS</th><th className="p-1 text-center border-r border-slate-700">YT</th>
                  <th className="p-1 text-center">YO</th><th className="p-1 text-center">OM</th><th className="p-1 text-center">OS</th><th className="p-1 text-center border-r border-slate-700">YT</th>
                  <th className="p-1 text-center">YO</th><th className="p-1 text-center">OM</th><th className="p-1 text-center">OS</th><th className="p-1 text-center border-r border-slate-700">YT</th>
                  <th className="p-1 text-center">YO</th>
                  <th className="p-1 text-center">OM</th>
                  <th className="p-1 text-center">OS</th>
                  <th className="p-1 text-center border-r border-slate-700">YT</th>
                  {isEditRealisasi && (
                    <>
                      <th className="p-1 text-center">YO</th><th className="p-1 text-center">OM</th><th className="p-1 text-center">OS</th><th className="p-1 text-center border-r border-slate-700">YT</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-bold text-slate-800 text-xs sm:text-sm">
                {daysList.map(d => {
                  const dayStrPadded = String(d).padStart(2, '0');
                  const dayStrUnpadded = String(d);
                  const targetDatePadded = currentMonth ? `${currentMonth}-${dayStrPadded}` : null;
                  const targetDateUnpadded = currentMonth ? `${currentMonth}-${dayStrUnpadded}` : null;
                  const tx = transactions.find(t => {
                    if (!t || !t.tanggal) return false;
                    if (targetDatePadded && t.tanggal === targetDatePadded) return true;
                    if (targetDateUnpadded && t.tanggal === targetDateUnpadded) return true;
                    return t.tanggal.endsWith(`-${dayStrPadded}`) || t.tanggal.endsWith(`-${dayStrUnpadded}`) || t.tanggal === dayStrUnpadded;
                  });
                  const dData = editDataRealisasi[d] || {};
                  const editChange = (field: string, val: number) => {
                    setEditDataRealisasi(prev => ({ ...prev, [d]: { ...prev[d], [field]: val } }));
                  };

                  const val = (f: string) => isEditRealisasi ? (dData[f] || 0) : (tx?.[f as keyof typeof tx] || 0);

                  const rmh_yo = val('rmh_yo'), rmh_om = val('rmh_om'), rmh_os = val('rmh_os'), rmh_yt = val('rmh_yt');
                  const psr_yo = val('psr_yo'), psr_om = val('psr_om'), psr_os = val('psr_os'), psr_yt = val('psr_yt');
                  const skh_yo = val('skh_yo'), skh_om = val('skh_om'), skh_os = val('skh_os'), skh_yt = val('skh_yt');
                  const ktr_yo = val('ktr_yo'), ktr_om = val('ktr_om'), ktr_os = val('ktr_os'), ktr_yt = val('ktr_yt');
                  const tk_yo  = val('tk_yo'),  tk_om  = val('tk_om'),  tk_os  = val('tk_os'),  tk_yt  = val('tk_yt');
                  const ib_yo  = val('ib_yo'),  ib_om  = val('ib_om'),  ib_os  = val('ib_os'),  ib_yt  = val('ib_yt');
                  
                  const rmh = rmh_yo + rmh_om + rmh_os + rmh_yt;
                  const psr = psr_yo + psr_om + psr_os + psr_yt;
                  const skh = skh_yo + skh_om + skh_os + skh_yt;
                  const ktr = ktr_yo + ktr_om + ktr_os + ktr_yt;
                  const tk = tk_yo + tk_om + tk_os + tk_yt;
                  const ib = ib_yo + ib_om + ib_os + ib_yt;
                  
                  const bb_yo = val('bb_yo'), bb_om = val('bb_om'), bb_os = val('bb_os'), bb_yt = val('bb_yt');
                  const bb = bb_yo + bb_om + bb_os + bb_yt;
                  
                  const pbPagi = val('pb_p');
                  const pbSore = val('pb_s');
                  const plgApk = val('apk_plg');
                  const sampahBtl = val('apk_botol');
                  const plg = val('f_plg');
                  const rk = val('f_rk');
                  const ra = val('f_ra');
                  const rb = val('f_rb');
                  const dayTotYo = rmh_yo + psr_yo + skh_yo + ktr_yo + tk_yo + ib_yo;
                  const dayTotOm = rmh_om + psr_om + skh_om + ktr_om + tk_om + ib_om;
                  const dayTotOs = rmh_os + psr_os + skh_os + ktr_os + tk_os + ib_os;
                  const dayTotYt = rmh_yt + psr_yt + skh_yt + ktr_yt + tk_yt + ib_yt;
                  const adminDataDay = ylBreakdownRealisasi?.days?.[String(d)];
                  const acuanYo = (adminDataDay as any)?.yo || 0;
                  const acuanOm = (adminDataDay as any)?.om || 0;
                  const acuanOs = (adminDataDay as any)?.os || 0;
                  const acuanYt = (adminDataDay as any)?.yt || 0;

                  totDayYo += dayTotYo; totDayOm += dayTotOm; totDayOs += dayTotOs; totDayYt += dayTotYt;
                  
                  totRmh += rmh; totPsr += psr; totSkh += skh; totKtr += ktr; totTk += tk; totIb += ib;
                  totBb += bb; totPbPagi += pbPagi; totPbSore += pbSore; totPlgApk += plgApk; totSampahBtl += sampahBtl;
                  totPlg += plg; totRk += rk; totRa += ra; totRb += rb;

                  const rIdx = d - 1;
                  const renderCell = (field: string, v: number, className: string, cIdx: number) => {
                    const { className: selClassName, ...cellProps } = getRealisasiCellProps(rIdx, cIdx);
                    return (
                      <td
                        {...cellProps}
                        className={`${className} relative select-none ${selClassName || ""}`}
                      >
                        {isEditRealisasi ? (
                          <input
                            type="number"
                            min="0"
                            value={v || ""}
                            onChange={(e) => editChange(field, parseInt(e.target.value) || 0)}
                            onPaste={(e) => {
                              const text = e.clipboardData.getData("text/plain");
                              if (!text) return;
                              e.preventDefault();
                              const newSel = { startR: rIdx, startC: cIdx, endR: rIdx, endC: cIdx };
                              setRealisasiGridSelection(newSel);
                              setTimeout(() => {
                                handleRealisasiGridPaste(text, newSel);
                              }, 0);
                            }}
                            onDragStart={(e) => e.preventDefault()}
                            className="w-10 text-xs border border-slate-300 rounded p-1 text-center outline-none focus:ring-1 focus:ring-indigo-500 font-bold bg-transparent"
                          />
                        ) : (
                          <span className="block truncate">{v || "-"}</span>
                        )}
                        {renderRealisasiSelectionHandle && renderRealisasiSelectionHandle(rIdx, cIdx)}
                      </td>
                    );
                  };
                  const renderBbCell = () => {
                    if (isEditRealisasi) {
                      return (
                        <>
                          <td title="📌 BB diinput oleh Manager via menu LHPP" className="p-1.5 text-center text-rose-700 bg-rose-50/50">
                            <input type="number" value={bb_yo || ""} disabled title="📌 BB diinput oleh Manager via menu LHPP" className="w-10 text-xs border border-slate-200 rounded p-1 text-center font-bold bg-slate-100 text-slate-500 cursor-not-allowed opacity-75" />
                          </td>
                          <td title="📌 BB diinput oleh Manager via menu LHPP" className="p-1.5 text-center text-rose-700 bg-rose-50/50">
                            <input type="number" value={bb_om || ""} disabled title="📌 BB diinput oleh Manager via menu LHPP" className="w-10 text-xs border border-slate-200 rounded p-1 text-center font-bold bg-slate-100 text-slate-500 cursor-not-allowed opacity-75" />
                          </td>
                          <td title="📌 BB diinput oleh Manager via menu LHPP" className="p-1.5 text-center text-rose-700 bg-rose-50/50">
                            <input type="number" value={bb_os || ""} disabled title="📌 BB diinput oleh Manager via menu LHPP" className="w-10 text-xs border border-slate-200 rounded p-1 text-center font-bold bg-slate-100 text-slate-500 cursor-not-allowed opacity-75" />
                          </td>
                          <td title="📌 BB diinput oleh Manager via menu LHPP" className="p-1.5 text-center font-bold text-rose-900 border-r border-slate-200 bg-rose-100/70">
                            <input type="number" value={bb_yt || ""} disabled title="📌 BB diinput oleh Manager via menu LHPP" className="w-10 text-xs border border-slate-200 rounded p-1 text-center font-bold bg-slate-100 text-slate-500 cursor-not-allowed opacity-75" />
                          </td>
                        </>
                      );
                    }
                    return <td title="📌 BB diinput oleh Manager via menu LHPP" className="p-1.5 text-center text-rose-700 bg-rose-50/50 font-bold">{bb || "-"}</td>;
                  };
                  return (
                    <tr key={d} className="hover:bg-slate-50/80 transition-colors optimized-table-row">
                      <td
                        onClick={() => selectRealisasiRow(rIdx)}
                        className="p-1.5 border-r border-slate-200 sticky left-0 bg-white z-10 text-center text-slate-600 font-mono font-black cursor-pointer hover:bg-amber-100 transition-colors select-none"
                      >
                        {dayStrPadded}
                      </td>
                      
                      {renderCell('rmh_yo',  rmh_yo,  "p-1.5 text-center text-slate-600", 0)}
                      {renderCell('rmh_om',  rmh_om,  "p-1.5 text-center text-slate-600", 1)}
                      {renderCell('rmh_os',  rmh_os,  "p-1.5 text-center text-slate-600", 2)}
                      {renderCell('rmh_yt',  rmh_yt,  "p-1.5 text-center font-bold text-slate-900 border-r border-slate-200 bg-slate-50", 3)}
                      
                      {renderCell('psr_yo',  psr_yo,  "p-1.5 text-center text-slate-600", 4)}
                      {renderCell('psr_om',  psr_om,  "p-1.5 text-center text-slate-600", 5)}
                      {renderCell('psr_os',  psr_os,  "p-1.5 text-center text-slate-600", 6)}
                      {renderCell('psr_yt',  psr_yt,  "p-1.5 text-center font-bold text-slate-900 border-r border-slate-200 bg-slate-50", 7)}
                      
                      {renderCell('skh_yo',  skh_yo,  "p-1.5 text-center text-slate-600", 8)}
                      {renderCell('skh_om',  skh_om,  "p-1.5 text-center text-slate-600", 9)}
                      {renderCell('skh_os',  skh_os,  "p-1.5 text-center text-slate-600", 10)}
                      {renderCell('skh_yt',  skh_yt,  "p-1.5 text-center font-bold text-slate-900 border-r border-slate-200 bg-slate-50", 11)}
                      
                      {renderCell('ktr_yo',  ktr_yo,  "p-1.5 text-center text-slate-600", 12)}
                      {renderCell('ktr_om',  ktr_om,  "p-1.5 text-center text-slate-600", 13)}
                      {renderCell('ktr_os',  ktr_os,  "p-1.5 text-center text-slate-600", 14)}
                      {renderCell('ktr_yt',  ktr_yt,  "p-1.5 text-center font-bold text-slate-900 border-r border-slate-200 bg-slate-50", 15)}
                      
                      {renderCell('tk_yo',  tk_yo,  "p-1.5 text-center text-slate-600", 16)}
                      {renderCell('tk_om',  tk_om,  "p-1.5 text-center text-slate-600", 17)}
                      {renderCell('tk_os',  tk_os,  "p-1.5 text-center text-slate-600", 18)}
                      {renderCell('tk_yt',  tk_yt,  "p-1.5 text-center font-bold text-slate-900 border-r border-slate-200 bg-slate-50", 19)}
                      
                      {renderCell('ib_yo',  ib_yo,  "p-1.5 text-center text-slate-600", 20)}
                      {renderCell('ib_om',  ib_om,  "p-1.5 text-center text-slate-600", 21)}
                      {renderCell('ib_os',  ib_os,  "p-1.5 text-center text-slate-600", 22)}
                      {renderCell('ib_yt',  ib_yt,  "p-1.5 text-center font-bold text-slate-900 border-r border-slate-200 bg-slate-50", 23)}

                      {(() => {
                        const renderTotAcuan = (aktual: number, acuan: number) => {
                          const cocok = aktual === acuan;
                          return (
                            <td className={`p-1.5 text-center font-black ${cocok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                              {aktual}/{acuan}
                            </td>
                          );
                        };
                        return (
                          <>
                            {renderTotAcuan(dayTotYo, acuanYo)}
                            {renderTotAcuan(dayTotOm, acuanOm)}
                            {renderTotAcuan(dayTotOs, acuanOs)}
                            <td className={`p-1.5 text-center font-black border-r border-slate-200 ${dayTotYt === acuanYt ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                              {dayTotYt}/{acuanYt}
                            </td>
                          </>
                        );
                      })()}

                      {renderBbCell()}
                      {renderCell('pb_p',  pbPagi,  "p-1.5 text-center text-lime-700", 28)}
                      {renderCell('pb_s',  pbSore,  "p-1.5 text-center text-lime-700", 29)}
                      {renderCell('f_plg',  plg,  "p-1.5 text-center text-orange-700 bg-orange-50/50", 30)}
                      {renderCell('f_rk',  rk,  "p-1.5 text-center text-blue-700", 31)}
                      {renderCell('f_ra',  ra,  "p-1.5 text-center text-violet-700", 32)}
                      {renderCell('f_rb',  rb,  "p-1.5 text-center text-fuchsia-700 bg-fuchsia-50/50", 33)}
                      {renderCell('apk_plg',  plgApk,  "p-1.5 text-center text-sky-700", 34)}
                      {renderCell('apk_botol',  sampahBtl,  "p-1.5 text-center text-cyan-700", 35)}
                    </tr>
                  );
                })}
                <tr className="bg-slate-900 text-amber-300 font-black text-xs sm:text-sm">
                  <td className="p-2 border-r border-slate-800 sticky left-0 bg-slate-900 z-10">Total</td>
                  <td colSpan={4} className="p-2 text-center border-r border-slate-700">{totRmh}</td>
                  <td colSpan={4} className="p-2 text-center border-r border-slate-700">{totPsr}</td>
                  <td colSpan={4} className="p-2 text-center border-r border-slate-700">{totSkh}</td>
                  <td colSpan={4} className="p-2 text-center border-r border-slate-700">{totKtr}</td>
                  <td colSpan={4} className="p-2 text-center border-r border-slate-700">{totTk}</td>
                  <td colSpan={4} className="p-2 text-center border-r border-slate-700">{totIb}</td>
                  <td className="p-2 text-center border-r border-slate-700 text-yellow-300">{totDayYo}</td>
                  <td className="p-2 text-center border-r border-slate-700 text-yellow-300">{totDayOm}</td>
                  <td className="p-2 text-center border-r border-slate-700 text-yellow-300">{totDayOs}</td>
                  <td className="p-2 text-center border-r border-slate-700 text-yellow-300">{totDayYt}</td>
                  {isEditRealisasi ? (
                    <td colSpan={4} className="p-2 text-center text-rose-300">{totBb}</td>
                  ) : (
                    <td className="p-2 text-center text-rose-300">{totBb}</td>
                  )}
                  <td className="p-2 text-center border-l border-slate-700 text-lime-300">{totPbPagi}</td>
                  <td className="p-2 text-center border-l border-slate-700 text-lime-300">{totPbSore}</td>
                  <td className="p-2 text-center border-l border-slate-700 text-orange-300">{totPlg}</td>
                  <td className="p-2 text-center border-l border-slate-700 text-blue-300">{totRk}</td>
                  <td className="p-2 text-center border-l border-slate-700 text-violet-300">{totRa}</td>
                  <td className="p-2 text-center border-l border-slate-700 text-fuchsia-300">{totRb}</td>
                  <td className="p-2 text-center border-l border-slate-700 text-sky-300">{totPlgApk}</td>
                  <td className="p-2 text-center border-l border-slate-700 text-cyan-300">{totSampahBtl}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {activeCell && (
        <SpreadsheetInputBar
          activeCell={activeCell}
          cellLabel={cellLabel}
          value={activeCellValue ?? 0}
          isEditable={isActiveCellEditable ?? isEditRealisasi}
          onChange={(val) => {
            if (handleActiveCellValueChange) {
              handleActiveCellValueChange(val);
            }
          }}
          onPrev={goToPrevCell}
          onNext={goToNextCell}
        />
      )}
    </div>
  );
}

export const YlRealisasiPotensiTab = React.memo(YlRealisasiPotensiTabInner);
