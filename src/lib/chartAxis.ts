// Satu sumbu Y bersama untuk garis penjualan & batang BB.
// Skala LURUS & proporsional (nilai 2x = tinggi 2x). Agar batang BB kecil tetap terlihat,
// grafiknya ditinggikan (plotPx besar), bukan skalanya diubah.
export interface StepAxis {
  top: number;                       // puncak sumbu
  scale: (v: number) => number;      // 0..1 (0 = dasar, 1 = puncak), lurus
  ticks: number[];                   // nilai garis bantu sumbu Y
  showLabel: (v: number) => boolean; // label hanya jika muat (tidak bertumpuk)
}

// Admin: label 1k, 2k, 3k, 4k, 5k, lalu kelipatan 5k (10k, 15k, ...)
export function makeStepAxis(maxVal: number, plotPx: number): StepAxis {
  const top = Math.max(5000, Math.ceil(Math.max(1, maxVal) / 5000) * 5000);
  const scale = (v: number) => (v <= 0 ? 0 : Math.min(1.2, v / top));
  const ticks: number[] = [1000, 2000, 3000, 4000, 5000];
  for (let t = 10000; t <= top; t += 5000) ticks.push(t);
  const pxPer1k = (plotPx / top) * 1000;
  const everyLow = [1, 2, 5].find(k => pxPer1k * k >= 12) ?? 5;
  const showLabel = (v: number) =>
    v <= 5000 ? (v / 1000) % everyLow === 0 : (pxPer1k * 5 >= 12 || v % 10000 === 0);
  return { top, scale, ticks, showLabel };
}

// TKU: kelipatan tetap (default 1k): 1k, 2k, 3k, ... 6k, 7k, dst
export function makeUnitAxis(maxVal: number, plotPx: number, unit = 1000): StepAxis {
  const top = Math.max(unit, Math.ceil(Math.max(1, maxVal) / unit) * unit);
  const n = Math.round(top / unit);
  const scale = (v: number) => (v <= 0 ? 0 : Math.min(1.2, v / top));
  const ticks: number[] = [];
  for (let i = 1; i <= n; i++) ticks.push(i * unit);
  const every = [1, 2, 5, 10].find(k => (plotPx / n) * k >= 12) ?? 10;
  const showLabel = (v: number) => Math.round(v / unit) % every === 0;
  return { top, scale, ticks, showLabel };
}

// Sumbu terpisah untuk batang BB (panel bawah): skala lurus, angka "rapi" (1-2-5) mengikuti nilai BB terbesar
export function makeNiceAxis(maxVal: number, plotPx: number): StepAxis {
  const m = Math.max(1, maxVal);
  const raw = m / 3;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / pow;
  const step = Math.max(1, (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow);
  const n = Math.max(2, Math.ceil(m / step));
  const top = n * step;
  const ticks: number[] = [];
  for (let i = 1; i <= n; i++) ticks.push(i * step);
  const every = plotPx / n >= 12 ? 1 : 2;
  const showLabel = (v: number) => Math.round(v / step) % every === 0;
  return { top, scale: (v: number) => (v <= 0 ? 0 : Math.min(1.2, v / top)), ticks, showLabel };
}

export const formatAxisLabel = (v: number) => (v >= 1000 ? `${Math.round((v / 1000) * 10) / 10}k` : `${v}`);
