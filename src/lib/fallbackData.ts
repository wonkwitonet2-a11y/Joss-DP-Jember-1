import type { DashboardData, EvaluasiData } from "../types";
import { INITIAL_YL_LIST, getStoredYlList } from "./storage";

export const INITIAL_BREAKDOWN_REALISASI: Record<string, { pembagiTanggal: number; days: Record<string, { yo: number; om: number; os: number; yt: number }> }> = {
  "201": {
    pembagiTanggal: 15,
    days: {
      "1": { yo: 475, om: 50, os: 50, yt: 25 },
      "2": { yo: 625, om: 20, os: 95, yt: 0 },
      "3": { yo: 500, om: 30, os: 60, yt: 10 },
      "4": { yo: 550, om: 40, os: 70, yt: 20 },
      "5": { yo: 480, om: 50, os: 50, yt: 20 },
      "6": { yo: 520, om: 30, os: 80, yt: 10 },
      "7": { yo: 600, om: 25, os: 65, yt: 10 },
      "8": { yo: 510, om: 40, os: 70, yt: 30 },
      "9": { yo: 530, om: 35, os: 75, yt: 10 },
      "10": { yo: 580, om: 20, os: 80, yt: 20 },
      "11": { yo: 490, om: 45, os: 55, yt: 10 },
      "12": { yo: 540, om: 30, os: 70, yt: 20 },
      "13": { yo: 560, om: 25, os: 65, yt: 10 },
      "14": { yo: 500, om: 50, os: 50, yt: 20 },
      "15": { yo: 570, om: 30, os: 80, yt: 20 }
    }
  },
  "202": {
    pembagiTanggal: 15,
    days: {
      "1": { yo: 420, om: 30, os: 40, yt: 10 },
      "2": { yo: 480, om: 25, os: 55, yt: 15 },
      "3": { yo: 450, om: 35, os: 45, yt: 20 },
      "4": { yo: 500, om: 20, os: 60, yt: 10 },
      "5": { yo: 430, om: 40, os: 50, yt: 10 },
      "6": { yo: 470, om: 30, os: 50, yt: 20 },
      "7": { yo: 510, om: 25, os: 55, yt: 10 },
      "8": { yo: 460, om: 35, os: 45, yt: 15 },
      "9": { yo: 490, om: 30, os: 60, yt: 10 },
      "10": { yo: 520, om: 20, os: 65, yt: 15 },
      "11": { yo: 440, om: 40, os: 50, yt: 10 },
      "12": { yo: 480, om: 30, os: 55, yt: 15 },
      "13": { yo: 500, om: 25, os: 60, yt: 10 },
      "14": { yo: 450, om: 35, os: 45, yt: 20 },
      "15": { yo: 510, om: 30, os: 60, yt: 10 }
    }
  },
  "203": {
    pembagiTanggal: 15,
    days: {
      "1": { yo: 450, om: 35, os: 45, yt: 15 },
      "2": { yo: 500, om: 30, os: 60, yt: 10 },
      "3": { yo: 470, om: 40, os: 50, yt: 20 },
      "4": { yo: 520, om: 25, os: 65, yt: 10 },
      "5": { yo: 460, om: 35, os: 55, yt: 15 },
      "6": { yo: 490, om: 30, os: 60, yt: 10 },
      "7": { yo: 530, om: 20, os: 70, yt: 20 },
      "8": { yo: 480, om: 40, os: 50, yt: 10 },
      "9": { yo: 510, om: 30, os: 65, yt: 15 },
      "10": { yo: 540, om: 25, os: 70, yt: 10 },
      "11": { yo: 470, om: 35, os: 55, yt: 15 },
      "12": { yo: 500, om: 30, os: 60, yt: 20 },
      "13": { yo: 520, om: 25, os: 65, yt: 10 },
      "14": { yo: 480, om: 40, os: 50, yt: 15 },
      "15": { yo: 530, om: 30, os: 70, yt: 10 }
    }
  },
  "204": {
    pembagiTanggal: 15,
    days: {
      "1": { yo: 410, om: 25, os: 35, yt: 10 },
      "2": { yo: 460, om: 30, os: 45, yt: 15 },
      "3": { yo: 430, om: 35, os: 40, yt: 10 },
      "4": { yo: 480, om: 20, os: 50, yt: 10 },
      "5": { yo: 420, om: 30, os: 45, yt: 15 },
      "6": { yo: 450, om: 25, os: 50, yt: 10 },
      "7": { yo: 490, om: 20, os: 55, yt: 15 },
      "8": { yo: 440, om: 35, os: 40, yt: 10 },
      "9": { yo: 470, om: 25, os: 50, yt: 15 },
      "10": { yo: 500, om: 20, os: 55, yt: 10 },
      "11": { yo: 430, om: 30, os: 45, yt: 10 },
      "12": { yo: 460, om: 25, os: 50, yt: 15 },
      "13": { yo: 480, om: 20, os: 55, yt: 10 },
      "14": { yo: 440, om: 35, os: 40, yt: 15 },
      "15": { yo: 490, om: 25, os: 50, yt: 10 }
    }
  },
  "205": {
    pembagiTanggal: 15,
    days: {
      "1": { yo: 460, om: 40, os: 50, yt: 15 },
      "2": { yo: 510, om: 30, os: 65, yt: 20 },
      "3": { yo: 480, om: 35, os: 55, yt: 10 },
      "4": { yo: 530, om: 25, os: 70, yt: 15 },
      "5": { yo: 470, om: 40, os: 60, yt: 10 },
      "6": { yo: 500, om: 30, os: 65, yt: 20 },
      "7": { yo: 540, om: 25, os: 75, yt: 10 },
      "8": { yo: 490, om: 35, os: 60, yt: 15 },
      "9": { yo: 520, om: 30, os: 70, yt: 10 },
      "10": { yo: 550, om: 20, os: 75, yt: 20 },
      "11": { yo: 480, om: 40, os: 55, yt: 10 },
      "12": { yo: 510, om: 30, os: 65, yt: 15 },
      "13": { yo: 530, om: 25, os: 70, yt: 10 },
      "14": { yo: 490, om: 35, os: 60, yt: 15 },
      "15": { yo: 540, om: 30, os: 75, yt: 10 }
    }
  },
  "206": {
    pembagiTanggal: 15,
    days: {
      "1": { yo: 430, om: 30, os: 40, yt: 10 },
      "2": { yo: 470, om: 25, os: 50, yt: 15 },
      "3": { yo: 440, om: 35, os: 45, yt: 10 },
      "4": { yo: 490, om: 20, os: 55, yt: 15 },
      "5": { yo: 430, om: 30, os: 45, yt: 10 },
      "6": { yo: 460, om: 25, os: 50, yt: 15 },
      "7": { yo: 500, om: 20, os: 60, yt: 10 },
      "8": { yo: 450, om: 35, os: 45, yt: 10 },
      "9": { yo: 480, om: 25, os: 55, yt: 15 },
      "10": { yo: 510, om: 20, os: 60, yt: 10 },
      "11": { yo: 440, om: 30, os: 45, yt: 15 },
      "12": { yo: 470, om: 25, os: 50, yt: 10 },
      "13": { yo: 490, om: 20, os: 55, yt: 15 },
      "14": { yo: 450, om: 35, os: 45, yt: 10 },
      "15": { yo: 500, om: 25, os: 55, yt: 15 }
    }
  },
  "207": {
    pembagiTanggal: 15,
    days: {
      "1": { yo: 400, om: 25, os: 35, yt: 10 },
      "2": { yo: 450, om: 30, os: 45, yt: 10 },
      "3": { yo: 420, om: 35, os: 40, yt: 15 },
      "4": { yo: 470, om: 20, os: 50, yt: 10 },
      "5": { yo: 410, om: 30, os: 40, yt: 10 },
      "6": { yo: 440, om: 25, os: 45, yt: 15 },
      "7": { yo: 480, om: 20, os: 50, yt: 10 },
      "8": { yo: 430, om: 35, os: 40, yt: 10 },
      "9": { yo: 460, om: 25, os: 45, yt: 15 },
      "10": { yo: 490, om: 20, os: 50, yt: 10 },
      "11": { yo: 420, om: 30, os: 40, yt: 10 },
      "12": { yo: 450, om: 25, os: 45, yt: 15 },
      "13": { yo: 470, om: 20, os: 50, yt: 10 },
      "14": { yo: 430, om: 35, os: 40, yt: 15 },
      "15": { yo: 480, om: 25, os: 45, yt: 10 }
    }
  },
  "208": {
    pembagiTanggal: 15,
    days: {
      "1": { yo: 440, om: 30, os: 45, yt: 15 },
      "2": { yo: 490, om: 25, os: 55, yt: 10 },
      "3": { yo: 460, om: 35, os: 50, yt: 15 },
      "4": { yo: 510, om: 20, os: 60, yt: 10 },
      "5": { yo: 450, om: 30, os: 50, yt: 15 },
      "6": { yo: 480, om: 25, os: 55, yt: 10 },
      "7": { yo: 520, om: 20, os: 65, yt: 15 },
      "8": { yo: 470, om: 35, os: 50, yt: 10 },
      "9": { yo: 500, om: 25, os: 60, yt: 15 },
      "10": { yo: 530, om: 20, os: 65, yt: 10 },
      "11": { yo: 460, om: 30, os: 50, yt: 15 },
      "12": { yo: 490, om: 25, os: 55, yt: 10 },
      "13": { yo: 510, om: 20, os: 60, yt: 15 },
      "14": { yo: 470, om: 35, os: 50, yt: 10 },
      "15": { yo: 520, om: 25, os: 60, yt: 15 }
    }
  },
  "209": {
    pembagiTanggal: 15,
    days: {
      "1": { yo: 420, om: 25, os: 40, yt: 10 },
      "2": { yo: 460, om: 30, os: 45, yt: 15 },
      "3": { yo: 430, om: 35, os: 40, yt: 10 },
      "4": { yo: 480, om: 20, os: 50, yt: 15 },
      "5": { yo: 420, om: 30, os: 45, yt: 10 },
      "6": { yo: 450, om: 25, os: 50, yt: 10 },
      "7": { yo: 490, om: 20, os: 55, yt: 15 },
      "8": { yo: 440, om: 35, os: 40, yt: 10 },
      "9": { yo: 470, om: 25, os: 50, yt: 15 },
      "10": { yo: 500, om: 20, os: 55, yt: 10 },
      "11": { yo: 430, om: 30, os: 45, yt: 10 },
      "12": { yo: 460, om: 25, os: 50, yt: 15 },
      "13": { yo: 480, om: 20, os: 55, yt: 10 },
      "14": { yo: 440, om: 35, os: 40, yt: 15 },
      "15": { yo: 490, om: 25, os: 50, yt: 10 }
    }
  },
  "210": {
    pembagiTanggal: 15,
    days: {
      "1": { yo: 450, om: 35, os: 45, yt: 15 },
      "2": { yo: 500, om: 30, os: 55, yt: 10 },
      "3": { yo: 470, om: 40, os: 50, yt: 20 },
      "4": { yo: 520, om: 25, os: 60, yt: 10 },
      "5": { yo: 460, om: 35, os: 50, yt: 15 },
      "6": { yo: 490, om: 30, os: 55, yt: 10 },
      "7": { yo: 530, om: 20, os: 65, yt: 20 },
      "8": { yo: 480, om: 40, os: 50, yt: 10 },
      "9": { yo: 510, om: 30, os: 60, yt: 15 },
      "10": { yo: 540, om: 25, os: 65, yt: 10 },
      "11": { yo: 470, om: 35, os: 50, yt: 15 },
      "12": { yo: 500, om: 30, os: 55, yt: 20 },
      "13": { yo: 520, om: 25, os: 60, yt: 10 },
      "14": { yo: 480, om: 40, os: 50, yt: 15 },
      "15": { yo: 530, om: 30, os: 65, yt: 10 }
    }
  }
};

export function getStoredBreakdownRealisasi(month?: string) {
  const currentM = month || new Date().toISOString().substring(0, 7);
  try {
    const raw = localStorage.getItem(`bd_realisasi_${currentM}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && Object.keys(parsed).length > 0) return parsed;
    }
    const arcRaw = localStorage.getItem(`monthly_archive_${currentM}`);
    if (arcRaw) {
      const arcParsed = JSON.parse(arcRaw);
      if (arcParsed && arcParsed.breakdownRealisasiMap) return arcParsed.breakdownRealisasiMap;
    }
  } catch (e) {
    console.warn("Failed to read local bd_realisasi:", e);
  }
  return {};
}

export function getStoredBreakdownPlan(month?: string) {
  const currentM = month || new Date().toISOString().substring(0, 7);
  try {
    const raw = localStorage.getItem(`bd_plan_${currentM}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed;
    }
  } catch (e) {
    console.warn("Failed to read local bd_plan:", e);
  }
  return {};
}

export function getFallbackDashboardData(month?: string): DashboardData {
  const currentM = month || new Date().toISOString().substring(0, 7);
  const ylList = getStoredYlList() || INITIAL_YL_LIST;
  const realMap = getStoredBreakdownRealisasi(currentM);

  const perYL: Record<string, any> = {};
  let grandTotal = 0;
  let totalYo = 0, totalOm = 0, totalOs = 0, totalYt = 0;
  let teamTotalRata2 = 0;
  let totalPembagi = 0;

  const dailySalesMap: Record<number, number> = {};

  ylList.forEach(y => {
    const area = y.area;
    let areaData = realMap[area];
    if (!areaData) {
      const foundKey = Object.keys(realMap).find(k => k === area || k.startsWith(area) || area.startsWith(k) || k.includes(y.nama));
      if (foundKey) areaData = realMap[foundKey];
    }

    const days = areaData && areaData.days ? areaData.days : (areaData || {});
    const pembagi = (areaData && Number(areaData.pembagiTanggal) > 0) ? Number(areaData.pembagiTanggal) : 15;

    let ylYo = 0, ylOm = 0, ylOs = 0, ylYt = 0;
    if (days && typeof days === "object") {
      Object.entries(days).forEach(([dayStr, d]: [string, any]) => {
        if (!d) return;
        const dNum = parseInt(dayStr, 10);
        const yoVal = Number(d.yo) || 0;
        const omVal = Number(d.om) || 0;
        const osVal = Number(d.os) || 0;
        const ytVal = Number(d.yt) || 0;

        ylYo += yoVal;
        ylOm += omVal;
        ylOs += osVal;
        ylYt += ytVal;

        if (!isNaN(dNum)) {
          dailySalesMap[dNum] = (dailySalesMap[dNum] || 0) + (yoVal + omVal + osVal + ytVal);
        }
      });
    }

    const ylTotal = ylYo + ylOm + ylOs + ylYt;
    const ylRata2 = pembagi > 0 ? ylTotal / pembagi : 0;

    grandTotal += ylTotal;
    totalYo += ylYo;
    totalOm += ylOm;
    totalOs += ylOs;
    totalYt += ylYt;
    teamTotalRata2 += ylRata2;
    totalPembagi += pembagi;

    perYL[area] = {
      nama: y.nama,
      akumulasi: ylTotal,
      rata2: Math.round(ylRata2),
      hariAktif: pembagi,
      pembagi,
      targetYL: (y as any).target || 0,
      bulanLaluYL: (y as any).bln_lalu || 0,
      tahunLaluYL: (y as any).thn_lalu || 0,
      bbYL: 0,
      yo: ylYo,
      om: ylOm,
      os: ylOs,
      yt: ylYt
    };
  });

  const countYl = ylList.length || 1;
  const salesPerYl = countYl > 0 ? grandTotal / countYl : 0;
  const avgPembagi = countYl > 0 ? Math.round(totalPembagi / countYl) : 15;

  const datesList = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'));
  const salesList = datesList.map((_, i) => dailySalesMap[i + 1] || 0);

  let fbRmh = 0, fbPsr = 0, fbSkh = 0, fbKtr = 0, fbTk = 0, fbIb = 0;
  try {
    const rawTxs = localStorage.getItem("plg_pjl_transactions") || localStorage.getItem("transactions");
    if (rawTxs) {
      const txs = JSON.parse(rawTxs);
      if (Array.isArray(txs)) {
        txs.forEach((t: any) => {
          fbRmh += (Number(t.rmh_yo)||0) + (Number(t.rmh_om)||0) + (Number(t.rmh_os)||0) + (Number(t.rmh_yt)||0);
          fbPsr += (Number(t.psr_yo)||0) + (Number(t.psr_om)||0) + (Number(t.psr_os)||0) + (Number(t.psr_yt)||0);
          fbSkh += (Number(t.skh_yo)||0) + (Number(t.skh_om)||0) + (Number(t.skh_os)||0) + (Number(t.skh_yt)||0);
          fbKtr += (Number(t.ktr_yo)||0) + (Number(t.ktr_om)||0) + (Number(t.ktr_os)||0) + (Number(t.ktr_yt)||0);
          fbTk  += (Number(t.tk_yo)||0)  + (Number(t.tk_om)||0)  + (Number(t.tk_os)||0)  + (Number(t.tk_yt)||0);
          fbIb  += (Number(t.ib_yo)||0)  + (Number(t.ib_om)||0)  + (Number(t.ib_os)||0)  + (Number(t.ib_yt)||0);
        });
      }
    }
  } catch (e) {}

  return {
    totalPenjualan: grandTotal,
    rataHarian: Math.round(teamTotalRata2),
    salesPerYl: Math.round(salesPerYl),
    jwp: 0,
    rataItem: {
      YO: avgPembagi > 0 ? Math.round(totalYo / avgPembagi) : 0,
      OM: avgPembagi > 0 ? Math.round(totalOm / avgPembagi) : 0,
      OS: avgPembagi > 0 ? Math.round(totalOs / avgPembagi) : 0,
      YT: avgPembagi > 0 ? Math.round(totalYt / avgPembagi) : 0
    },
    vsTarget: 0,
    vsBulanLalu: 0,
    vsTahunLalu: 0,
    targetTim: { target: 0, bulanLalu: 0, tahunLalu: 0, rata2: Math.round(teamTotalRata2) },
    bbTimRaw: 0,
    hariAktif: avgPembagi,
    perYL,
    grafikHarian: {
      tanggal: datesList,
      penjualan: salesList,
      balikBotol: Array(31).fill(0)
    },
    sektorTim: {
      rumah: fbRmh,
      pasar: fbPsr,
      sekolah: fbSkh,
      kantor: fbKtr,
      toko: fbTk,
      ib: fbIb
    }
  };
}

export function getFallbackEvaluasiData(month?: string): EvaluasiData {
  const currentM = month || new Date().toISOString().substring(0, 7);
  const [yStr, mStr] = currentM.split("-");
  const yNum = parseInt(yStr, 10);
  const mNum = parseInt(mStr, 10);
  const prevMonthKey = mNum === 1 
    ? `${yNum - 1}-12` 
    : `${yNum}-${String(mNum - 1).padStart(2, "0")}`;

  const ylList = getStoredYlList() || INITIAL_YL_LIST;
  const realMap = getStoredBreakdownRealisasi(currentM);
  const prevRealMap = getStoredBreakdownRealisasi(prevMonthKey);

  const getSalesFromRealMap = (map: any, areaKey: string, dayNum: number): number => {
    let aData = map[areaKey];
    if (!aData) {
      const k = Object.keys(map).find(x => x === areaKey || x.startsWith(areaKey) || areaKey.startsWith(x));
      if (k) aData = map[k];
    }
    const dObj = aData?.days?.[String(dayNum)];
    if (!dObj) return 0;
    return (Number(dObj.yo) || 0) + (Number(dObj.om) || 0) + (Number(dObj.os) || 0) + (Number(dObj.yt) || 0);
  };

  const getDateWithOffsetLocal = (baseMonth: string, baseDay: number, offsetDays: number) => {
    const [ys, ms] = baseMonth.split("-");
    const y = parseInt(ys, 10);
    const mIdx = parseInt(ms, 10) - 1;
    const d = new Date(y, mIdx, baseDay - offsetDays);
    const resY = d.getFullYear();
    const resM = String(d.getMonth() + 1).padStart(2, "0");
    const resD = d.getDate();
    return { monthKey: `${resY}-${resM}`, day: resD };
  };

  const dataRows = ylList.map(y => {
    const area = y.area;
    let areaData = realMap[area];
    if (!areaData) {
      const foundKey = Object.keys(realMap).find(k => k === area || k.startsWith(area) || area.startsWith(k) || k.includes(y.nama));
      if (foundKey) areaData = realMap[foundKey];
    }

    const days = areaData && areaData.days ? areaData.days : (areaData || {});
    const pembagi = (areaData && Number(areaData.pembagiTanggal) > 0) ? Number(areaData.pembagiTanggal) : 15;

    let ylYo = 0, ylOm = 0, ylOs = 0, ylYt = 0;
    let todayYo = 0, todayOm = 0, todayOs = 0, todayYt = 0;

    if (days && typeof days === "object") {
      Object.entries(days).forEach(([dayStr, d]: [string, any]) => {
        if (!d) return;
        const dNum = parseInt(dayStr, 10);
        const yoVal = Number(d.yo) || 0;
        const omVal = Number(d.om) || 0;
        const osVal = Number(d.os) || 0;
        const ytVal = Number(d.yt) || 0;

        ylYo += yoVal;
        ylOm += omVal;
        ylOs += osVal;
        ylYt += ytVal;

        if (dNum === pembagi) {
          todayYo = yoVal;
          todayOm = omVal;
          todayOs = osVal;
          todayYt = ytVal;
        }
      });
    }

    const todayTotal = todayYo + todayOm + todayOs + todayYt;
    const ylTotal = ylYo + ylOm + ylOs + ylYt;
    const rata2Total = pembagi > 0 ? Math.round(ylTotal / pembagi) : 0;
    const rataYo = pembagi > 0 ? Math.round(ylYo / pembagi) : 0;
    const rataOm = pembagi > 0 ? Math.round(ylOm / pembagi) : 0;
    const rataOs = pembagi > 0 ? Math.round(ylOs / pembagi) : 0;
    const rataYt = pembagi > 0 ? Math.round(ylYt / pembagi) : 0;

    // Rata2 Minggu Ini (rata-rata kumulatif berjalan pada tanggal pembagi saat ini)
    const rataMingguIni = rata2Total;

    // Rata2 Minggu Lalu (rata-rata kumulatif pada posisi 7 hari sebelumnya)
    let rataMingguLalu = 0;
    if (pembagi > 7) {
      const prevD = pembagi - 7;
      let prevSum = 0;
      if (days && typeof days === "object") {
        for (let d = 1; d <= prevD; d++) {
          const dData = days[String(d)] || days[d];
          if (dData) {
            prevSum += (Number(dData.yo) || 0) + (Number(dData.om) || 0) + (Number(dData.os) || 0) + (Number(dData.yt) || 0);
          }
        }
      }
      rataMingguLalu = prevD > 0 ? Math.round(prevSum / prevD) : 0;
    } else {
      const prevEntry = prevRealMap[area];
      if (prevEntry && prevEntry.days) {
        let prevSum = 0;
        const prevTargetDay = 31 - (7 - pembagi);
        for (let d = 1; d <= prevTargetDay; d++) {
          const dData = prevEntry.days[String(d)] || prevEntry.days[d];
          if (dData) {
            prevSum += (Number(dData.yo) || 0) + (Number(dData.om) || 0) + (Number(dData.os) || 0) + (Number(dData.yt) || 0);
          }
        }
        rataMingguLalu = prevTargetDay > 0 ? Math.round(prevSum / prevTargetDay) : 0;
      }
    }

    if (rataMingguLalu === 0) {
      rataMingguLalu = Math.round(rata2Total > 0 ? rata2Total : 0);
    }

    const vsMingguLaluPct = rataMingguLalu > 0 ? Math.trunc((rataMingguIni / rataMingguLalu) * 100) : 0;

    return [
      y.area,
      y.nama,
      rataMingguLalu,
      todayYo, todayOm, todayOs, todayYt, todayTotal,
      ylTotal,
      rataYo, rataOm, rataOs, rataYt, rata2Total,
      rataMingguIni, vsMingguLaluPct,
      0, 0, 0, 0, 0, 0, 0, 0,
      0, 0,
      0, 0, 0, 0, 0, 0, 0
    ];
  });

  let totTodayYo = 0, totTodayOm = 0, totTodayOs = 0, totTodayYt = 0, totTodayTotal = 0;
  let totAkm = 0;
  let totRataYo = 0, totRataOm = 0, totRataOs = 0, totRataYt = 0, totRataTotal = 0;
  let totRataMingguLalu = 0, totRataMingguIni = 0;

  dataRows.forEach(r => {
    totRataMingguLalu += (r[2] as number) || 0;
    totTodayYo += (r[3] as number) || 0;
    totTodayOm += (r[4] as number) || 0;
    totTodayOs += (r[5] as number) || 0;
    totTodayYt += (r[6] as number) || 0;
    totTodayTotal += (r[7] as number) || 0;
    totAkm += (r[8] as number) || 0;
    totRataYo += (r[9] as number) || 0;
    totRataOm += (r[10] as number) || 0;
    totRataOs += (r[11] as number) || 0;
    totRataYt += (r[12] as number) || 0;
    totRataTotal += (r[13] as number) || 0;
    totRataMingguIni += (r[14] as number) || 0;
  });

  const totVsMingguLalu = totRataMingguLalu > 0 ? Math.trunc((totRataMingguIni / totRataMingguLalu) * 100) : 0;

  const totalRow = [
    "TOTAL", "",
    totRataMingguLalu,
    totTodayYo, totTodayOm, totTodayOs, totTodayYt, totTodayTotal,
    totAkm,
    totRataYo, totRataOm, totRataOs, totRataYt, totRataTotal,
    totRataMingguIni, totVsMingguLalu,
    ...Array(16).fill(0)
  ];

  const analisis = ylList.map((y, idx) => {
    const row = dataRows[idx];
    return {
      area: y.area,
      nama: y.nama,
      jualHariIni: (row[7] as number) || 0,
      rata2BulanBerjalan: (row[13] as number) || 0,
      vsMingguLaluPct: (row[15] as number) || 0,
      persenRumah: 0,
      persenRbVsPlg: 0,
      propagandaHariIni: 0,
      sampahBotol: 0,
      bb: 0,
      propagandaVs900: null
    };
  });

  return {
    headerRows: [],
    dataRows,
    totalRow,
    analisis
  };
}
