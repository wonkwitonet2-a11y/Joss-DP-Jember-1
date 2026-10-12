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

/**
 * Palet warna status (terbaca jelas di mode terang & gelap).
 * Merah = merah terang (BUKAN pink/rose).
 */
export const CLR_RED = "text-[#e60000] dark:text-[#ff2a2a]";
export const CLR_YELLOW = "text-yellow-600 dark:text-yellow-300";
export const CLR_ORANGE = "text-orange-600 dark:text-orange-400";
export const CLR_PURPLE = "text-purple-600 dark:text-purple-400";
export const CLR_GREEN = "text-green-600 dark:text-green-400";
export const CLR_BLUE = "text-blue-600 dark:text-blue-400";

/**
 * Warna persen BB (balik botol) — dipakai di SEMUA menu:
 *  - di bawah 5   -> hijau
 *  - 5 s/d 9,9    -> kuning
 *  - 10 ke atas   -> merah terang
 * Nilai dipotong 1 desimal dulu agar sama dengan angka yang tampil.
 */
export function bbColorClass(pct: number | string | null | undefined): string {
  const n = truncateDecimal(pct, 1);
  if (n >= 10) return CLR_RED;
  if (n >= 5) return CLR_YELLOW;
  return CLR_GREEN;
}

/**
 * Warna persen vs Target / vs Bulan Lalu / vs Tahun Lalu:
 *  - di bawah 100% -> merah terang
 *  - 100% ke atas  -> hijau
 */
export function vsPctColorClass(pct: number | string | null | undefined): string {
  return truncateDecimal(pct, 1) < 100 ? CLR_RED : CLR_GREEN;
}

/**
 * Warna rata-rata penjualan per hari:
 *  < 250 merah | 250-279 kuning | 280-299 orange | 300-329 ungu | 330-349 hijau | >= 350 biru
 */
export function rata2ColorClass(v: number | string | null | undefined): string {
  const n = Math.trunc(Number(v) || 0);
  if (n < 250) return CLR_RED;
  if (n < 280) return CLR_YELLOW;
  if (n < 300) return CLR_ORANGE;
  if (n < 330) return CLR_PURPLE;
  if (n < 350) return CLR_GREEN;
  return CLR_BLUE;
}
