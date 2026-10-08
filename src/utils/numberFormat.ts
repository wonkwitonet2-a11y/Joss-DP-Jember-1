/**
 * Utility untuk memotong angka desimal tanpa pembulatan (truncation).
 * Sesuai kebutuhan operasional:
 * - rata-rata misal 324.9967 -> 324 atau 324,9 (bukan 325)
 * - persentase 99.9989 -> 99 atau 99,99 (bukan 100)
 */

export function truncateDecimal(val: number | string | null | undefined, decimals = 1): number {
  if (val === null || val === undefined || isNaN(Number(val))) return 0;
  const num = Number(val);
  if (!isFinite(num)) return 0;
  if (decimals <= 0) return Math.trunc(num);
  const factor = Math.pow(10, decimals);
  return Math.trunc(num * factor) / factor;
}

export function formatTruncated(
  val: number | string | null | undefined,
  decimals = 0,
  useGrouping = true
): string {
  if (val === null || val === undefined || isNaN(Number(val))) {
    return decimals > 0 ? `0,${"0".repeat(decimals)}` : "0";
  }
  const num = Number(val);
  if (!isFinite(num)) return "0";

  const isNeg = num < 0;
  const absNum = Math.abs(num);
  const intVal = Math.trunc(absNum);

  const intStr = useGrouping ? intVal.toLocaleString("id-ID") : String(intVal);

  if (decimals <= 0) {
    return (isNeg ? "-" : "") + intStr;
  }

  const fixedStr = absNum.toFixed(10);
  const rawDecPart = fixedStr.split(".")[1] || "";
  const decStr = rawDecPart.substring(0, decimals).padEnd(decimals, "0");

  return (isNeg ? "-" : "") + `${intStr},${decStr}`;
}

export function formatPercentTruncated(
  val: number | string | null | undefined,
  decimals = 1
): string {
  if (val === null || val === undefined || isNaN(Number(val))) return "0,0%";
  return `${formatTruncated(val, decimals, false)}%`;
}
