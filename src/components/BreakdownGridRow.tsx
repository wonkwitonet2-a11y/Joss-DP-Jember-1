import React from "react";
import type { GridSelection } from "./useSimpleGrid";

interface BreakdownGridRowProps {
  yl: any;
  rIdx: number;
  activeGridMap: any;
  targetYLMap: any;
  breakdownDateRange: string;
  gridSelection?: GridSelection | null;
  getCellProps?: (r: number, c: number) => { className?: string; [key: string]: any };
  renderSelectionHandle?: (r: number, c: number) => React.ReactNode;
  selectRow?: (r: number) => void;
  // Legacy / fallback props if needed
  isFillDragging?: boolean;
  fillHoverCell?: { r: number; c: number } | null;
  isGridDragging?: boolean;
  touchStartRef?: React.MutableRefObject<any>;
  setGridSelection?: React.Dispatch<React.SetStateAction<GridSelection | null>>;
  setIsGridDragging?: (val: boolean) => void;
  setFillHoverCell?: React.Dispatch<React.SetStateAction<{ r: number; c: number } | null>>;
  handleTouchMoveGrid?: (e: React.TouchEvent) => void;
  handleBreakdownCellChange?: (area: string, day: number, item: "yo" | "om" | "os" | "yt", val: number) => void;
  handlePasteIntoGrid?: (text: string, origin: { r: number; c: number }) => void;
  setIsBreakdownMenuOpen?: (open: boolean) => void;
  setBreakdownMenuPos?: (pos: { x: number; y: number } | null) => void;
}

function BreakdownGridRowInner({
  yl,
  rIdx,
  activeGridMap,
  targetYLMap,
  breakdownDateRange,
  gridSelection,
  getCellProps,
  renderSelectionHandle,
  selectRow,
}: BreakdownGridRowProps) {
  const area = String(yl.area).substring(0, 3);
  const ylPlan = activeGridMap[area] || { pembagiTanggal: 25, days: {} };

  // Compute grand totals
  let totYo = 0, totOm = 0, totOs = 0, totYt = 0;
  Object.values(ylPlan.days || {}).forEach((d: any) => {
    totYo += Number(d.yo) || 0;
    totOm += Number(d.om) || 0;
    totOs += Number(d.os) || 0;
    totYt += Number(d.yt) || 0;
  });
  const grandTotal = totYo + totOm + totOs + totYt;

  // Active pembagi calculation
  const activePembagi = ylPlan.pembagiTanggal || 25;

  // Rata-rata 4 Item + Total
  const avgYo = activePembagi > 0 ? Math.trunc(totYo / activePembagi) : 0;
  const avgOm = activePembagi > 0 ? Math.trunc(totOm / activePembagi) : 0;
  const avgOs = activePembagi > 0 ? Math.trunc(totOs / activePembagi) : 0;
  const avgYt = activePembagi > 0 ? Math.trunc(totYt / activePembagi) : 0;
  const avgTotal = activePembagi > 0 ? Math.trunc(grandTotal / activePembagi) : 0;

  // Target calculation: Target manager per day * activePembagi
  const tgtObj = targetYLMap[area] || { target: 0, bln_lalu: 0, thn_lalu: 0 };
  const targetTotal = Math.trunc(tgtObj.target ?? 0) * activePembagi;
  const diffTarget = grandTotal - targetTotal;

  const blnLaluTotal = Math.trunc(tgtObj.bln_lalu ?? 0) * activePembagi;
  const diffLM = grandTotal - blnLaluTotal;

  const thnLaluTotal = Math.trunc(tgtObj.thn_lalu ?? 0) * activePembagi;
  const diffLY = grandTotal - thnLaluTotal;

  const daysList = (
    breakdownDateRange === "1-10" ? Array.from({ length: 10 }, (_, i) => i + 1) :
    breakdownDateRange === "11-20" ? Array.from({ length: 10 }, (_, i) => i + 11) :
    breakdownDateRange === "21-31" ? Array.from({ length: 11 }, (_, i) => i + 21) :
    Array.from({ length: 31 }, (_, i) => i + 1)
  );

  const items: Array<"yo" | "om" | "os" | "yt"> = ["yo", "om", "os", "yt"];

  const itemColors = {
    yo: "text-red-700",
    om: "text-amber-700",
    os: "text-pink-700",
    yt: "text-blue-700"
  };

  return (
    <tr className="hover:bg-red-50/40 transition-colors divide-x divide-slate-100 optimized-table-row">
      {/* YL Name Sticky Cell */}
      <td
        className="p-2 sticky left-0 bg-white z-20 font-black text-slate-900 truncate min-w-[120px] max-w-[140px] shadow-r border-r border-slate-200 cursor-pointer hover:bg-slate-100 select-none"
        onClick={() => selectRow?.(rIdx)}
      >
        <span className="text-red-600 font-mono mr-1">[{area}]</span>
        <span>{yl.nama.replace(/^\d+\s*/, "")}</span>
      </td>

      {/* Day inputs with spreadsheet block selection */}
      {daysList.flatMap(day => {
        const dData = ylPlan.days?.[String(day)] || { yo: 0, om: 0, os: 0, yt: 0 };
        const dayTotal = (dData.yo || 0) + (dData.om || 0) + (dData.os || 0) + (dData.yt || 0);
        const isUnderTarget = dayTotal > 0 && dayTotal < 400;

        return items.map((item, itemIdx) => {
          const cIdx = (day - 1) * 4 + itemIdx;
          const cellProps = getCellProps ? getCellProps(rIdx, cIdx) : {};

          return (
            <td
              key={`${area}-${day}-${item}`}
              {...cellProps}
              className={`p-1 text-center font-mono text-[11px] font-black border-r border-slate-200/60 select-none relative ${
                cellProps.className || ""
              } ${isUnderTarget && !cellProps.className?.includes("!bg-") ? "bg-red-50/50" : ""}`}
            >
              <span className={`block truncate ${itemColors[item]}`}>
                {dData[item] || 0}
              </span>
              {renderSelectionHandle && renderSelectionHandle(rIdx, cIdx)}
            </td>
          );
        });
      })}

      {/* AKUMULASI 4 ITEM + TOTAL */}
      <td className="p-1 text-center font-bold text-red-700 bg-red-50/50 border-l border-slate-200 select-text cursor-text">{totYo}</td>
      <td className="p-1 text-center font-bold text-amber-700 bg-red-50/50 select-text cursor-text">{totOm}</td>
      <td className="p-1 text-center font-bold text-pink-700 bg-red-50/50 select-text cursor-text">{totOs}</td>
      <td className="p-1 text-center font-bold text-blue-700 bg-red-50/50 select-text cursor-text">{totYt}</td>
      <td className="p-1 text-center font-black text-slate-800 bg-slate-200 select-text cursor-text shadow-sm">{grandTotal}</td>

      {/* RATA-RATA 4 ITEM + TOTAL */}
      <td className="p-1 text-center font-bold text-red-700 bg-amber-50/50 border-l border-slate-200 select-text cursor-text">{avgYo}</td>
      <td className="p-1 text-center font-bold text-amber-700 bg-amber-50/50 select-text cursor-text">{avgOm}</td>
      <td className="p-1 text-center font-bold text-pink-700 bg-amber-50/50 select-text cursor-text">{avgOs}</td>
      <td className="p-1 text-center font-bold text-blue-700 bg-amber-50/50 select-text cursor-text">{avgYt}</td>
      <td className="p-1 text-center font-black text-amber-900 bg-amber-300 select-text cursor-text shadow-sm">{avgTotal}</td>

      {/* VALUASI vs TARGET MANAGER */}
      <td className="p-1 text-center font-bold text-purple-700 bg-purple-50/80 border-l border-slate-200 select-text cursor-text">{targetTotal}</td>
      <td className={`p-1 text-center font-black select-text cursor-text ${diffTarget >= 0 ? "text-emerald-700 bg-emerald-100/80" : "text-rose-700 bg-rose-100/80"}`}>
        {diffTarget >= 0 ? `+${diffTarget}` : diffTarget}
      </td>
      <td className="p-1 text-center font-bold text-indigo-700 bg-purple-50/80 select-text cursor-text">{blnLaluTotal}</td>
      <td className={`p-1 text-center font-black select-text cursor-text ${diffLM >= 0 ? "text-emerald-700 bg-emerald-100/80" : "text-rose-700 bg-rose-100/80"}`}>
        {diffLM >= 0 ? `+${diffLM}` : diffLM}
      </td>
      <td className="p-1 text-center font-bold text-teal-700 bg-purple-50/80 select-text cursor-text">{thnLaluTotal}</td>
      <td className={`p-1 text-center font-black select-text cursor-text ${diffLY >= 0 ? "text-emerald-700 bg-emerald-100/80" : "text-rose-700 bg-rose-100/80"}`}>
        {diffLY >= 0 ? `+${diffLY}` : diffLY}
      </td>
    </tr>
  );
}

export const BreakdownGridRow = React.memo(BreakdownGridRowInner);

