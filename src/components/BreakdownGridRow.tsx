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
  const displayName = String(yl?.nama || "")
    .trim()
    .replace(/^\[\d+\]\s*/, "")
    .replace(/^\d+(?:\s*[-–—.)/:]\s*|\s+)/, "")
    .trim();
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

  const nf = (n: number) => Number(n).toLocaleString("id-ID");
  const items: Array<"yo" | "om" | "os" | "yt"> = ["yo", "om", "os", "yt"];

  const numCls = (v: number, extra = "") => `bd-td ${extra} ${v ? "" : "bd-td-zero"}`;
  const diffCls = (v: number) => `bd-td select-text cursor-text ${v >= 0 ? "bd-td-pos" : "bd-td-neg"}`;
  const fmtDiff = (v: number) => (v >= 0 ? `+${nf(v)}` : nf(v));

  return (
    <tr className="bd-row optimized-table-row">
      {/* Nama YL (sticky) */}
      <td className="bd-td-name bd-td" onClick={() => selectRow?.(rIdx)}>
        <span>{displayName}</span>
      </td>

      {/* Sel input harian (blok seleksi ala spreadsheet) */}
      {daysList.flatMap(day => {
        const dData = ylPlan.days?.[String(day)] || { yo: 0, om: 0, os: 0, yt: 0 };
        const dayTotal = (dData.yo || 0) + (dData.om || 0) + (dData.os || 0) + (dData.yt || 0);
        const isUnderTarget = dayTotal > 0 && dayTotal < 400;

        return items.map((item, itemIdx) => {
          const cIdx = (day - 1) * 4 + itemIdx;
          const cellProps = getCellProps ? getCellProps(rIdx, cIdx) : {};
          const val = dData[item] || 0;

          return (
            <td
              key={`${area}-${day}-${item}`}
              {...cellProps}
              className={`bd-td select-none ${val ? "" : "bd-td-zero"} ${
                isUnderTarget && !cellProps.className?.includes("!bg-") ? "bd-td-warn" : ""
              } ${cellProps.className || ""}`}
            >
              <span className="block truncate">{nf(val)}</span>
              {renderSelectionHandle && renderSelectionHandle(rIdx, cIdx)}
            </td>
          );
        });
      })}

      {/* Akumulasi 4 item + total */}
      <td className={numCls(totYo, "bd-td-sum select-text cursor-text")}>{nf(totYo)}</td>
      <td className={numCls(totOm, "bd-td-sum select-text cursor-text")}>{nf(totOm)}</td>
      <td className={numCls(totOs, "bd-td-sum select-text cursor-text")}>{nf(totOs)}</td>
      <td className={numCls(totYt, "bd-td-sum select-text cursor-text")}>{nf(totYt)}</td>
      <td className={numCls(grandTotal, "bd-td-total select-text cursor-text")}>{nf(grandTotal)}</td>

      {/* Rata-rata 4 item + total */}
      <td className={numCls(avgYo, "bd-td-avg select-text cursor-text")}>{nf(avgYo)}</td>
      <td className={numCls(avgOm, "bd-td-avg select-text cursor-text")}>{nf(avgOm)}</td>
      <td className={numCls(avgOs, "bd-td-avg select-text cursor-text")}>{nf(avgOs)}</td>
      <td className={numCls(avgYt, "bd-td-avg select-text cursor-text")}>{nf(avgYt)}</td>
      <td className="bd-td bd-td-avgt select-text cursor-text">{nf(avgTotal)}</td>

      {/* Target & pembanding */}
      <td className={numCls(targetTotal, "bd-td-cmp select-text cursor-text")}>{nf(targetTotal)}</td>
      <td className={diffCls(diffTarget)}>{fmtDiff(diffTarget)}</td>
      <td className={numCls(blnLaluTotal, "bd-td-cmp select-text cursor-text")}>{nf(blnLaluTotal)}</td>
      <td className={diffCls(diffLM)}>{fmtDiff(diffLM)}</td>
      <td className={numCls(thnLaluTotal, "bd-td-cmp select-text cursor-text")}>{nf(thnLaluTotal)}</td>
      <td className={diffCls(diffLY)}>{fmtDiff(diffLY)}</td>
    </tr>
  );
}

export const BreakdownGridRow = React.memo(BreakdownGridRowInner);

