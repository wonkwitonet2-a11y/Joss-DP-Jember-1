import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Maximize2,
  Minimize2,
  Clock,
  Zap,
  Home,
  UserCheck,
  Megaphone,
  Trash2,
  CheckCircle,
  Award,
  TrendingUp,
  Sparkles,
  ChevronLeft,
  RefreshCw
} from "lucide-react";
import { cleanYlName, Transaction } from "../types";
import { safeFetchJson, parseJsonResponse } from "../lib/safeFetch";
import { getFallbackEvaluasiData } from "../lib/fallbackData";
import { loadFromSupabase, getSupabaseDebugInfo } from "../lib/supabaseClient";

export interface EvaluasiViewProps {
  evaluasiData?: any;
  globalMonth?: string;
  currentYlName?: string;
  currentYlArea?: string;
  role?: "manager" | "yl";
  transactions?: Transaction[];
  ylBreakdownRealisasi?: any;
  selectedDate?: string;
  onBack?: () => void;
}

export function EvaluasiView({
  evaluasiData,
  globalMonth,
  currentYlName = "",
  currentYlArea = "",
  role = "manager",
  transactions = [],
  ylBreakdownRealisasi,
  selectedDate,
  onBack
}: EvaluasiViewProps) {
  const [localEval, setLocalEval] = useState<any>(evaluasiData || null);
  const [showFullEvalTable, setShowFullEvalTable] = useState<boolean>(false);
  const [isFullscreenEval, setIsFullscreenEval] = useState<boolean>(false);
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);
  const [aiInsight, setAiInsight] = useState<string>("");
  const [isFetching, setIsFetching] = useState<boolean>(false);
  const [prevMonthArchive, setPrevMonthArchive] = useState<any>(null);
  // Diagnostik: alasan SPESIFIK kenapa tiap sumber (API/Supabase/localStorage)
  // gagal, plus host Supabase yang dipakai runtime ini. Sebelumnya semua
  // kegagalan diringkas jadi satu kalimat generik "semua gagal" — itu yang
  // bikin susah dibedakan antara "memang belum ada" vs "salah project/key".
  const [prevMonthFetchDebug, setPrevMonthFetchDebug] = useState<string>("");

  const isFullCols = role === "yl" || showFullEvalTable;

  // Load previous month archive for accurate beginning-of-month H-7 comparison
  //
  // BUGFIX: sebelumnya ini jalan SEKALI SAJA saat mount (useEffect biasa, tanpa
  // cara untuk retry) dan 3 percobaannya (API server -> Supabase langsung ->
  // localStorage) dijalankan BERURUTAN dengan `await` — kalau percobaan
  // pertama gantung/gagal diam-diam (mis. endpoint /api/getMonthlyArchive
  // tidak tersedia di build/deploy tertentu), seluruh proses baru lanjut ke
  // percobaan berikutnya satu-satu, dan kalau ketiganya gagal, prevMonthArchive
  // TETAP null selamanya tanpa ada cara untuk diulang dari UI. Ini yang bikin
  // "3 kunjungan pertama bulan baru" jatuh ke fallback statis (lihat komentar
  // fallbackRataMggLalu di bawah). Sekarang: (a) dijadikan fungsi yang bisa
  // dipanggil ulang lewat tombol refresh, (b) 3 sumber dicoba paralel supaya
  // salah satu yang gagal/lambat tidak memblokir yang lain, (c) ada log jelas
  // di console kalau semuanya gagal, supaya gampang dicek dari HP/browser.
  const fetchPrevMonth = useCallback(async () => {
    const activeM = globalMonth || (selectedDate ? selectedDate.substring(0, 7) : new Date().toISOString().substring(0, 7));
    const [yStr, mStr] = activeM.split("-");
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10);
    if (isNaN(y) || isNaN(m)) return;
    const prevM = m === 1 ? 12 : m - 1;
    const prevY = m === 1 ? y - 1 : y;
    const prevMKey = `${prevY}-${String(prevM).padStart(2, "0")}`;

    const results = await Promise.allSettled([
      safeFetchJson<{ ok: boolean; archive?: any; message?: string }>(`/api/getMonthlyArchive?month=${prevMKey}`),
      loadFromSupabase<any>(`monthly_archive_${prevMKey}`),
      (async () => {
        try {
          const localSnap = localStorage.getItem(`monthly_archive_${prevMKey}`);
          return localSnap ? JSON.parse(localSnap) : null;
        } catch {
          return null;
        }
      })()
    ]);

    const apiRes = results[0].status === "fulfilled" ? results[0].value : null;
    const supabaseData = results[1].status === "fulfilled" ? results[1].value : null;
    const localData = results[2].status === "fulfilled" ? results[2].value : null;

    const archive =
      (apiRes && (apiRes as any).ok && (apiRes as any).archive) ? (apiRes as any).archive :
      supabaseData ? supabaseData :
      localData ? localData :
      null;

    // Alasan per-sumber, dibuat SEKARANG (bukan cuma dari boolean gagal/tidak)
    // supaya kalau ketiganya gagal, badge di layar langsung bilang KENAPA,
    // bukan cuma "gagal". Ini poin krusial: 3 sumber ini punya jalur credential
    // yang BEDA-BEDA (server env var utk /api, localStorage/VITE env utk
    // Supabase langsung, localStorage biasa utk fallback lokal) — jadi kalau
    // Archive Editor (browser/origin lain) berhasil simpan tapi device ini
    // gagal baca, kemungkinan besar salah satu dari 3 credential path ini
    // menunjuk ke project/host Supabase yang BEDA, bukan datanya hilang.
    const sbDebug = getSupabaseDebugInfo();
    const apiReason = results[0].status === "rejected"
      ? `exception: ${(results[0] as PromiseRejectedResult).reason?.message || results[0].reason}`
      : (apiRes && (apiRes as any).ok) ? "ok" : `gagal (${(apiRes as any)?.message || "server bilang tidak ok / tidak respon"})`;
    const sbReason = results[1].status === "rejected"
      ? `exception: ${(results[1] as PromiseRejectedResult).reason?.message || results[1].reason}`
      : supabaseData ? "ok" : `null (host dituju: ${sbDebug.host}, sumber credential: ${sbDebug.source}, key ada: ${sbDebug.hasKey})`;
    const localReason = localData ? "ok" : "kosong/tidak ada di localStorage device ini";

    setPrevMonthFetchDebug(
      `API=${apiReason} | Supabase-langsung=${sbReason} | localStorage=${localReason}`
    );

    if (archive) {
      const bdKeyCount = Object.keys(archive.breakdownRealisasiMap || archive.breakdownRealisasi || {}).length;
      console.info(`[EvaluasiView] Arsip ${prevMKey} berhasil dimuat (breakdown areas: ${bdKeyCount}).`);
      setPrevMonthArchive(archive);
    } else {
      console.warn(
        `[EvaluasiView] Gagal memuat arsip bulan lalu (${prevMKey}) dari API, Supabase, maupun localStorage. ` +
        `RATA MGG LALU untuk kunjungan awal bulan ini tidak akan akurat sampai arsip ${prevMKey} tersedia. ` +
        `Detail: API=${apiReason} | Supabase=${sbReason} | localStorage=${localReason}`
      );
      setPrevMonthArchive(null);
    }
  }, [globalMonth, selectedDate]);

  useEffect(() => {
    fetchPrevMonth();
  }, [fetchPrevMonth]);

  // Sync prop changes
  useEffect(() => {
    if (evaluasiData) {
      setLocalEval(evaluasiData);
    }
  }, [evaluasiData]);

  // Fetch evaluasi data if not provided or on month change
  const fetchEvaluasi = useCallback(async () => {
    setIsFetching(true);
    const qMonth = globalMonth || "";
    try {
      const res = await safeFetchJson<{ evaluasiData?: any; dataRows?: any }>(`/api/getEvaluasi?month=${qMonth}`);
      if (res && res.evaluasiData) {
        setLocalEval(res.evaluasiData);
      } else if (res && res.dataRows) {
        setLocalEval(res);
      } else {
        setLocalEval((prev: any) => prev || getFallbackEvaluasiData(qMonth));
      }
    } catch {
      setLocalEval((prev: any) => prev || getFallbackEvaluasiData(qMonth));
    } finally {
      setIsFetching(false);
    }
    // BUGFIX: tombol refresh dulu cuma menarik ulang data evaluasi bulan
    // berjalan, TIDAK PERNAH mencoba ulang arsip bulan lalu — jadi kalau
    // fetchPrevMonth gagal sekali di awal (mis. koneksi lambat saat pertama
    // buka halaman), RATA MGG LALU permanen salah sampai halaman di-reload
    // manual. Sekarang tombol refresh juga memicu retry arsip bulan lalu.
    fetchPrevMonth();
  }, [globalMonth, fetchPrevMonth]);

  useEffect(() => {
    if (!evaluasiData) {
      fetchEvaluasi();
    }
  }, [fetchEvaluasi, evaluasiData]);

  const activeEvaluasiData = localEval || evaluasiData;

  // Run AI Insight Generator
  const runAiInsight = async () => {
    if (!activeEvaluasiData) return;
    setIsAiLoading(true);
    setAiInsight("");
    try {
      const response = await fetch("/api/gemini/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: activeEvaluasiData })
      });
      const d = await parseJsonResponse(response);
      setAiInsight(d?.insight || "Tidak ada hasil analisis.");
    } catch (e) {
      setAiInsight("Gagal menghubungkan ke modul evaluasi AI server.");
    } finally {
      setIsAiLoading(false);
    }
  };

  // Normalize analysis data list from activeEvaluasiData
  const normalizedAnalisis = useMemo(() => {
    if (!activeEvaluasiData) return [];
    if (activeEvaluasiData.dataRows && activeEvaluasiData.dataRows.length > 0) {
      return activeEvaluasiData.dataRows.map((row: any) => {
        const area = String(row[0] || "");
        const nama = String(row[1] || "");
        const jualHariIni = typeof row[7] === "number" ? row[7] : parseFloat(row[7]) || 0;
        const rata2BulanBerjalan = typeof row[13] === "number" ? row[13] : parseFloat(row[13]) || 0;
        const vsMingguLaluPct = typeof row[15] === "number" ? row[15] : parseFloat(row[15]) || 0;
        const persenRumah = typeof row[18] === "number" ? row[18] : parseFloat(row[18]) || 0;
        const persenRbVsPlg = typeof row[21] === "number" ? row[21] : parseFloat(row[21]) || 0;
        const propagandaHariIni =
          (typeof row[22] === "number" ? row[22] : parseFloat(row[22]) || 0) +
          (typeof row[23] === "number" ? row[23] : parseFloat(row[23]) || 0);
        const sampahBotol = typeof row[26] === "number" ? row[26] : parseFloat(row[26]) || 0;
        const bb = typeof row[28] === "number" ? row[28] : parseFloat(row[28]) || 0;
        const akmBb = typeof row[30] === "number" ? row[30] : parseFloat(row[30]) || 0;

        return {
          area,
          nama,
          jualHariIni,
          rata2BulanBerjalan,
          vsMingguLaluPct,
          persenRumah,
          persenRbVsPlg,
          propagandaHariIni,
          sampahBotol,
          bb,
          akmBb,
          propagandaVs900: null
        };
      });
    }
    return (activeEvaluasiData.analisis || []).map((a: any) => ({ ...a, akmBb: a.akmBb ?? a.bb ?? 0 }));
  }, [activeEvaluasiData]);

  // Compute daily evaluation rows per visit date for YL role
  const ylDailyEvaluation = useMemo(() => {
    if (role !== "yl") return { rows: [], totalRow: null, maxSales: 0, totalKunjungan: 0, debugPrevMonth: "" };

    const currentM =
      globalMonth ||
      (selectedDate ? selectedDate.substring(0, 7) : new Date().toISOString().substring(0, 7));
    const [yStr, mStr] = currentM.split("-");
    const year = parseInt(yStr, 10) || new Date().getFullYear();
    const month = parseInt(mStr, 10) || new Date().getMonth() + 1;

    const totalDaysInMonth = new Date(year, month, 0).getDate();
    const daysList = Array.from({ length: totalDaysInMonth }, (_, i) => i + 1);

    const txs = transactions || [];
    const realDays = ylBreakdownRealisasi?.days || {};

    const isCurrentMonth = currentM === new Date().toISOString().substring(0, 7);
    const todayDayNum = new Date().getDate();

    const HARI_NAMES = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

    // 1. Periksa setiap tanggal kalender di bulan ini
    const candidateDays = daysList.map((d) => {
      const dayDate = new Date(year, month - 1, d);
      const hari = HARI_NAMES[dayDate.getDay()];
      const dayStrPadded = String(d).padStart(2, "0");
      const dateStr = `${currentM}-${dayStrPadded}`;
      const tx = txs.find((t) => t.tanggal === dateStr);
      const adminDay = realDays[String(d)] || realDays[d];

      const hasAdmin =
        adminDay &&
        (Number(adminDay.yo) || 0) +
          (Number(adminDay.om) || 0) +
          (Number(adminDay.os) || 0) +
          (Number(adminDay.yt) || 0) >
          0;

      const yo = hasAdmin ? Number(adminDay.yo) || 0 : Number(tx?.tot_yo) || 0;
      const om = hasAdmin ? Number(adminDay.om) || 0 : Number(tx?.tot_om) || 0;
      const os = hasAdmin ? Number(adminDay.os) || 0 : Number(tx?.tot_os) || 0;
      const yt = hasAdmin ? Number(adminDay.yt) || 0 : Number(tx?.tot_yt) || 0;
      const total = yo + om + os + yt;

      const isToday = isCurrentMonth && d === todayDayNum;
      const isSunday = hari === "Min";

      const hasTxActivity =
        tx &&
        (total > 0 ||
          Number(tx.f_plg || 0) > 0 ||
          Number(tx.f_rb || 0) > 0 ||
          Number(tx.rmh_yo || 0) + Number(tx.rmh_om || 0) + Number(tx.rmh_os || 0) + Number(tx.rmh_yt || 0) > 0 ||
          Number(tx.apk_botol || 0) > 0 ||
          Number(tx.pb_p || 0) + Number(tx.pb_s || 0) > 0 ||
          Number(tx.bb_yo || 0) + Number(tx.bb_om || 0) + Number(tx.bb_os || 0) + Number(tx.bb_yt || 0) > 0);

      // Kriteria hari kunjungan:
      // - Hari Minggu bukan hari kunjungan (kecuali jika ada transaksi/penjualan riil)
      // - Hari dengan transaksi / penjualan / realisasi adalah hari kunjungan
      // - Hari ini (jika hari kerja) tetap ditampilkan agar YL bisa mengamati progres hari berjalan
      const isKunjungan = !isSunday
        ? total > 0 || Boolean(hasAdmin) || Boolean(hasTxActivity) || isToday
        : total > 0;

      return {
        d,
        hari,
        dateStr,
        tx,
        yo,
        om,
        os,
        yt,
        total,
        isToday,
        isSunday,
        isKunjungan
      };
    });

    // Filter HANYA HARI KUNJUNGAN (Data yang bukan kunjungan dihapus dari tabel)
    const visitDays = candidateDays.filter((cd) => cd.isKunjungan);

    let maxSales = 0;
    visitDays.forEach((v) => {
      if (v.total > maxSales) maxSales = v.total;
    });

    // Hitung rata-rata per tanggal di bulan sebelumnya jika ada arsip bulan lalu di Supabase
    const activeM = globalMonth || (selectedDate ? selectedDate.substring(0, 7) : new Date().toISOString().substring(0, 7));
    const [yNum, mNum] = activeM.split("-").map(Number);
    const prevMonthDaysCount = !isNaN(yNum) && !isNaN(mNum) ? new Date(yNum, mNum - 1, 0).getDate() : 31;

    const cleanCurrentYl = cleanYlName(currentYlName || "");
    const matchingEvalRow = (activeEvaluasiData?.dataRows || []).find((r: any) => {
      const rowName = cleanYlName(r[1] || "");
      return cleanCurrentYl && (rowName === cleanCurrentYl || rowName.includes(cleanCurrentYl) || cleanCurrentYl.includes(rowName));
    });
    // PENTING: area kode diutamakan dari prop `currentYlArea` (dikirim langsung oleh parent
    // yang tahu pasti area sang YL, misal dari daftar ylList), BUKAN cuma dari dataRows evaluasi
    // bulan berjalan. Di awal bulan baru, dataRows evaluasi manager biasanya belum terisi, jadi
    // fallback ke matchingEvalRow saja sering gagal menemukan area -> imbasnya lookup arsip bulan
    // lalu ikut gagal dan RATA MGG LALU jatuh ke fallback statis.
    const currentAreaCode = (currentYlArea || (matchingEvalRow ? String(matchingEvalRow[0] || "").trim() : "")).trim();
    const areaDigits = (currentAreaCode || currentYlName || "").replace(/\D/g, "").substring(0, 3);

    const prevMonthDailyRtMap: Record<number, number> = {};
    const prevMonthVisits: { day: number; rt: number }[] = [];
    if (prevMonthArchive) {
      // 1. Cek dari breakdownRealisasiMap / breakdownRealisasi di snapshot arsip
      const bdMap = prevMonthArchive.breakdownRealisasiMap || prevMonthArchive.breakdownRealisasi || {};
      let foundBdEntry: any = null;

      if (areaDigits && bdMap[areaDigits]) {
        foundBdEntry = bdMap[areaDigits];
      } else if (currentAreaCode && bdMap[currentAreaCode]) {
        foundBdEntry = bdMap[currentAreaCode];
      } else {
        const bdKeys = Object.keys(bdMap);
        for (const k of bdKeys) {
          const cleanK = cleanYlName(k);
          const kDigits = k.replace(/\D/g, "").substring(0, 3);
          if (
            (areaDigits && kDigits === areaDigits) ||
            (cleanCurrentYl && (cleanK === cleanCurrentYl || cleanK.includes(cleanCurrentYl) || cleanCurrentYl.includes(cleanK)))
          ) {
            foundBdEntry = bdMap[k];
            break;
          }
        }
      }

      if (foundBdEntry) {
        const daysObj = foundBdEntry.days || foundBdEntry;
        let prevRun = 0;
        Array.from({ length: prevMonthDaysCount }, (_, i) => i + 1).forEach((pDay) => {
          const dData = daysObj[pDay] || daysObj[String(pDay)];
          const daySales = dData
            ? (Number(dData.yo) || 0) + (Number(dData.om) || 0) + (Number(dData.os) || 0) + (Number(dData.yt) || 0)
            : 0;
          if (daySales > 0) {
            prevRun += daySales;
            const rt = Math.trunc(prevRun / pDay);
            prevMonthDailyRtMap[pDay] = rt;
            prevMonthVisits.push({ day: pDay, rt });
          }
        });
      } else if (Array.isArray(prevMonthArchive.transactions)) {
        // 2. Cek dari transactions di snapshot arsip jika breakdownRealisasiMap belum terpetakan
        const prevYlTxs = prevMonthArchive.transactions.filter((t: any) => {
          const tYlName = cleanYlName(t.ylName || t.nama || "");
          const tArea = String(t.area || "").replace(/\D/g, "").substring(0, 3);
          return (
            (cleanCurrentYl && (tYlName === cleanCurrentYl || tYlName.includes(cleanCurrentYl) || cleanCurrentYl.includes(tYlName))) ||
            (areaDigits && tArea === areaDigits)
          );
        });

        if (prevYlTxs.length > 0) {
          let prevRun = 0;
          Array.from({ length: prevMonthDaysCount }, (_, i) => i + 1).forEach((pDay) => {
            const dateStr = String(pDay).padStart(2, "0");
            const foundTx = prevYlTxs.find((t: any) => {
              // BUGFIX: field transaksi yang benar adalah `tanggal` ("YYYY-MM-DD"),
              // BUKAN `date`/`day` (field itu tidak pernah ada di tipe Transaction,
              // sehingga txDay selalu "" dan pencarian selalu gagal 100%).
              const rawDate = typeof t.tanggal === "string" ? t.tanggal : (typeof t.date === "string" ? t.date : "");
              const txDay = rawDate ? (rawDate.split("-")[2] || rawDate) : String(t.day || "");
              return txDay.padStart(2, "0") === dateStr;
            });
            // BUGFIX: field penjualan resmi di tipe Transaction adalah `tot_yo/tot_om/tot_os/tot_yt`,
            // BUKAN `yo/om/os/yt` (field itu tidak pernah ada, sehingga daySales selalu 0).
            const daySales = foundTx
              ? (Number(foundTx.tot_yo ?? foundTx.yo) || 0) +
                (Number(foundTx.tot_om ?? foundTx.om) || 0) +
                (Number(foundTx.tot_os ?? foundTx.os) || 0) +
                (Number(foundTx.tot_yt ?? foundTx.yt) || 0)
              : 0;
            if (daySales > 0) {
              prevRun += daySales;
              const rt = Math.trunc(prevRun / pDay);
              prevMonthDailyRtMap[pDay] = rt;
              prevMonthVisits.push({ day: pDay, rt });
            }
          });
        }
      }

      // 3. Cek dari evaluasiData / dashboardData jika riwayat perkunjungan belum terpetakan
      if (prevMonthVisits.length === 0 && prevMonthArchive) {
        const prevEvalRows = prevMonthArchive.evaluasiData?.dataRows || prevMonthArchive.evaluasiData?.tableData || [];
        const foundPrevEval = prevEvalRows.find((r: any) => {
          const rName = cleanYlName(r[1] || "");
          const rArea = String(r[0] || "").replace(/\D/g, "").substring(0, 3);
          return (cleanCurrentYl && (rName === cleanCurrentYl || rName.includes(cleanCurrentYl))) || (areaDigits && rArea === areaDigits);
        });
        if (foundPrevEval) {
          // Hanya ada 1 angka rata-rata akhir bulan yang tersedia dari sumber ini (bukan riwayat
          // per-hari). Jangan dorong angka yang sama untuk mengisi 3 hari pertama bulan baru —
          // itu yang menyebabkan RATA MGG LALU tampil statis/berulang (contoh: 511, 511, 511).
          // Cukup tandai sebagai SATU titik referensi di akhir bulan lalu; hari-hari lain di awal
          // bulan baru akan memakai fallbackRataMggLalu (juga 1 angka, tapi minimal konsisten &
          // jelas ini estimasi kasar, bukan riwayat harian yang dipalsukan seolah-olah presisi).
          const prevRt = Number(foundPrevEval[13]) || Number(foundPrevEval[14]) || Number(foundPrevEval[7]) || 0;
          if (prevRt > 0) {
            prevMonthVisits.push({ day: prevMonthDaysCount, rt: prevRt });
          }
        } else if (prevMonthArchive.dashboardData?.perYL) {
          const perYl = prevMonthArchive.dashboardData.perYL;
          const pY = perYl[areaDigits] || (currentAreaCode && perYl[currentAreaCode]);
          if (pY && Number(pY.rata2) > 0) {
            prevMonthVisits.push({ day: prevMonthDaysCount, rt: Number(pY.rata2) });
          }
        }
      }
    }

    // Kalau cuma ada SATU titik cadangan (bukan riwayat harian asli dari breakdown/transactions),
    // jangan biarkan itu dipakai berulang untuk mengisi kunjungan ke-1, ke-2, ke-3 di awal bulan
    // baru (itulah penyebab RATA MGG LALU tampil sama persis 3x). Riwayat harian asli tetap dipakai
    // apa adanya karena memang punya banyak titik berbeda.
    const hasRealDailyHistory = prevMonthVisits.length > 1;

    // Log diagnostik: kalau arsip bulan lalu berhasil dimuat (prevMonthArchive tidak null)
    // TAPI tidak ketemu satupun titik riwayat untuk area ini (prevMonthVisits kosong),
    // berarti masalahnya ada di pencocokan area/nama (areaDigits vs key di breakdownRealisasiMap),
    // bukan di proses fetch-nya. Ini beda kasus dengan prevMonthArchive === null (arsipnya
    // sendiri gagal dimuat) yang sudah di-log terpisah di fetchPrevMonth.
    let debugPrevMonth = "";
    if (role === "yl") {
      // Debug ini SENGAJA dibuat tampil di layar (bukan cuma console.log) karena diakses
      // dari HP/Chrome Android — buka DevTools jauh lebih ribet daripada baca teks kecil
      // di layar. Ini bisa dihapus/disembunyikan lagi setelah akar masalahnya ketemu.
      const bdKeysAvail = prevMonthArchive
        ? Object.keys(prevMonthArchive.breakdownRealisasiMap || prevMonthArchive.breakdownRealisasi || {})
        : [];
      if (!prevMonthArchive) {
        debugPrevMonth = `⚠️ Arsip bulan lalu TIDAK ditemukan (API/Supabase/localStorage semua gagal).`;
      } else if (bdKeysAvail.length === 0) {
        debugPrevMonth = `⚠️ Arsip bulan lalu ditemukan tapi breakdownRealisasiMap-nya KOSONG (tidak ada data harian tersimpan sama sekali).`;
      } else if (prevMonthVisits.length === 0) {
        debugPrevMonth = `⚠️ Arsip bulan lalu ditemukan (area tersimpan: ${bdKeysAvail.join(", ")}) tapi TIDAK COCOK dengan area dicari ("${areaDigits}" / "${currentYlName}").`;
      } else {
        debugPrevMonth = `✅ Arsip bulan lalu ok: ${prevMonthVisits.length} titik riwayat ditemukan untuk area "${areaDigits}".`;
      }
      console.warn(`[EvaluasiView] ${debugPrevMonth}`);
    }

    if (prevMonthArchive && prevMonthVisits.length === 0 && role === "yl") {
      console.warn(
        `[EvaluasiView] Arsip bulan lalu ditemukan tapi tidak ada data cocok untuk area "${areaDigits}"` +
        ` / YL "${currentYlName}". Cek apakah key di breakdownRealisasiMap arsip sesuai kode area ini.`,
        { areaDigitsDicari: areaDigits, keyBreakdownTersedia: Object.keys(prevMonthArchive.breakdownRealisasiMap || prevMonthArchive.breakdownRealisasi || {}) }
      );
    }

    let sumYo = 0, sumOm = 0, sumOs = 0, sumYt = 0, sumAll = 0;
    let sumRumahHari = 0;
    let sumAllPotensi = 0;
    let sumPlg = 0, sumRb = 0;
    let sumPbPagi = 0, sumPbSore = 0;
    let sumSampahHari = 0;
    let sumBbHari = 0;

    let runYo = 0, runOm = 0, runOs = 0, runYt = 0, runAll = 0;
    let runRumahAkm = 0;
    let runPbAkm = 0;
    let runSampahAkm = 0;
    let runBbAkm = 0;

    const fallbackRataMggLalu = matchingEvalRow ? Number(matchingEvalRow[2]) || 0 : 0;

    const visitHistory: {
      d: number;
      kunjunganKe: number;
      runAll: number;
      rtAll: number;
    }[] = [];

    const rows = visitDays.map((item, vIdx) => {
      const { d, hari, tx, yo, om, os, yt, total: todayTotal } = item;

      sumYo += yo;
      sumOm += om;
      sumOs += os;
      sumYt += yt;
      sumAll += todayTotal;

      runYo += yo;
      runOm += om;
      runOs += os;
      runYt += yt;
      runAll += todayTotal;

      // Akumulasi berjalan dibagi ANGKA TANGGAL DI KOLOM DEPAN (d)
      const kunjunganKe = vIdx + 1;
      const pembagiTgl = d > 0 ? d : kunjunganKe;
      const rtYo = Math.trunc(runYo / pembagiTgl);
      const rtOm = Math.trunc(runOm / pembagiTgl);
      const rtOs = Math.trunc(runOs / pembagiTgl);
      const rtYt = Math.trunc(runYt / pembagiTgl);
      const rtAll = Math.trunc(runAll / pembagiTgl);

      // Rata Minggu Ini = Rata-rata kumulatif di tanggal tsb (Akumulasi s/d tanggal tsb dibagi angka tanggal tsb)
      const rataMggIni = rtAll;

      // Rata Minggu Lalu = Nilai rata-rata pada posisi 1 minggu sebelumnya (mundur 7 hari kalender / 6 hari kunjungan)
      const targetPrevDay = d - 7;
      let prevWeekVisit = visitHistory.slice().reverse().find((v) => v.d <= targetPrevDay);
      if (!prevWeekVisit && vIdx >= 6) {
        prevWeekVisit = visitHistory[vIdx - 6];
      }

      // Jika di minggu pertama (belum ada 7 hari di bulan berjalan):
      // 1. Cek apakah ada data persis di 7 hari kalender sebelumnya pada bulan lalu
      // 2. Jika tidak ada, gunakan kunjungan urut dari akhir bulan lalu (misal: 3 kunjungan terakhir)
      const targetPrevMonthDay = prevMonthDaysCount - (7 - d);
      let prevMonthDayRt = prevMonthDailyRtMap[targetPrevMonthDay] || 0;
      if (!prevMonthDayRt && hasRealDailyHistory) {
        // Riwayat harian asli (banyak titik berbeda) -> ambil 3 kunjungan terakhir bulan lalu
        // secara berurutan, contoh: 409, 415, 427 untuk 3 hari pertama bulan baru.
        if (vIdx === 0) {
          prevMonthDayRt = prevMonthVisits[Math.max(0, prevMonthVisits.length - 3)]?.rt || 0;
        } else if (vIdx === 1) {
          prevMonthDayRt = prevMonthVisits[Math.max(0, prevMonthVisits.length - 2)]?.rt || 0;
        } else {
          prevMonthDayRt = prevMonthVisits[Math.max(0, prevMonthVisits.length - 1)]?.rt || 0;
        }
      } else if (!prevMonthDayRt && prevMonthVisits.length === 1 && vIdx === 0) {
        // Cuma 1 titik cadangan (bukan riwayat harian) -> pakai HANYA di kunjungan pertama,
        // jangan diulang untuk kunjungan ke-2 & ke-3 (itu akar bug angka statis berulang).
        prevMonthDayRt = prevMonthVisits[0]?.rt || 0;
      }

      // BUGFIX: sebelumnya `fallbackRataMggLalu` (satu angka statis dari kolom
      // "Rata Mgg Lalu" tabel evaluasi BULAN INI milik YL yang sama — bukan
      // dari arsip bulan lalu sama sekali) dipakai untuk SEMUA kunjungan yang
      // gagal dapat data (vIdx 0, 1, 2, dst), sehingga kalau prevMonthArchive
      // gagal dimuat, 3 kunjungan pertama bulan baru semuanya menampilkan
      // angka yang SAMA PERSIS (mis. 511, 511, 511) — persis bug yang
      // dilaporkan. Sekarang fallback statis ini HANYA dipakai untuk
      // kunjungan pertama (vIdx 0); kunjungan ke-2 dst yang tetap tidak
      // punya data akan tampil 0 (tidak ada data) daripada mengulang angka
      // yang sama dan terlihat seolah-olah presisi padahal salah.
      let rataMggLalu = prevWeekVisit
        ? prevWeekVisit.rtAll
        : prevMonthDayRt > 0
        ? prevMonthDayRt
        : (vIdx === 0 && fallbackRataMggLalu > 0)
        ? fallbackRataMggLalu
        : 0;

      const vsMggLaluPct = rataMggLalu > 0 ? Math.trunc((rataMggIni / rataMggLalu) * 100) : 0;

      // Rekam riwayat rata-rata untuk referensi kunjungan-kunjungan berikutnya
      visitHistory.push({
        d,
        kunjunganKe,
        runAll,
        rtAll
      });

      // Potensi Rumah
      const rmhHari =
        (Number(tx?.rmh_yo) || 0) +
        (Number(tx?.rmh_om) || 0) +
        (Number(tx?.rmh_os) || 0) +
        (Number(tx?.rmh_yt) || 0);
      runRumahAkm += rmhHari;
      sumRumahHari += rmhHari;

      const potensiHari =
        rmhHari +
        (Number(tx?.psr_yo) || 0) + (Number(tx?.psr_om) || 0) + (Number(tx?.psr_os) || 0) + (Number(tx?.psr_yt) || 0) +
        (Number(tx?.skh_yo) || 0) + (Number(tx?.skh_om) || 0) + (Number(tx?.skh_os) || 0) + (Number(tx?.skh_yt) || 0) +
        (Number(tx?.ktr_yo) || 0) + (Number(tx?.ktr_om) || 0) + (Number(tx?.ktr_os) || 0) + (Number(tx?.ktr_yt) || 0) +
        (Number(tx?.tk_yo) || 0) + (Number(tx?.tk_om) || 0) + (Number(tx?.tk_os) || 0) + (Number(tx?.tk_yt) || 0) +
        (Number(tx?.ib_yo) || 0) + (Number(tx?.ib_om) || 0) + (Number(tx?.ib_os) || 0) + (Number(tx?.ib_yt) || 0);

      const effectivePotensiHari = potensiHari > 0 ? potensiHari : todayTotal > 0 ? todayTotal : rmhHari;
      sumAllPotensi += effectivePotensiHari;

      const persenRumah = sumAllPotensi > 0 ? Math.trunc((runRumahAkm / sumAllPotensi) * 100) : 0;

      // RB vs PLG
      const plg = Number(tx?.f_plg) || 0;
      const rb = Number(tx?.f_rb) || 0;
      sumPlg += plg;
      sumRb += rb;
      const persenRb = plg > 0 ? Math.trunc((rb / plg) * 100) : 0;

      // PB
      const pbPagi = Number(tx?.pb_p) || 0;
      const pbSore = Number(tx?.pb_s) || 0;
      runPbAkm += pbPagi + pbSore;
      sumPbPagi += pbPagi;
      sumPbSore += pbSore;

      // Sampah
      const sampahHari = Number(tx?.apk_botol) || 0;
      runSampahAkm += sampahHari;
      sumSampahHari += sampahHari;
      const vs900 = runSampahAkm - 900;

      // BB
      const bbHari =
        (Number(tx?.bb_yo) || 0) +
        (Number(tx?.bb_om) || 0) +
        (Number(tx?.bb_os) || 0) +
        (Number(tx?.bb_yt) || 0);
      runBbAkm += bbHari;
      sumBbHari += bbHari;
      const bbPctHari = todayTotal + bbHari > 0 ? Math.trunc((bbHari / (todayTotal + bbHari)) * 100) : 0;
      const bbPctAkm = runAll + runBbAkm > 0 ? Math.trunc((runBbAkm / (runAll + runBbAkm)) * 100) : 0;

      return [
        `Tgl ${d}`,        // 0
        hari,              // 1
        rataMggLalu,       // 2
        yo,                // 3
        om,                // 4
        os,                // 5
        yt,                // 6
        todayTotal,        // 7
        runAll,            // 8
        rtYo,              // 9
        rtOm,              // 10
        rtOs,              // 11
        rtYt,              // 12
        rtAll,             // 13
        rataMggIni,        // 14
        vsMggLaluPct,      // 15
        rmhHari,           // 16
        runRumahAkm,       // 17
        persenRumah,       // 18
        plg,               // 19
        rb,                // 20
        persenRb,          // 21
        pbPagi,            // 22
        pbSore,            // 23
        runPbAkm,          // 24
        sampahHari,        // 25
        runSampahAkm,      // 26
        vs900,             // 27
        bbHari,            // 28
        bbPctHari,         // 29
        runBbAkm,          // 30
        bbPctAkm           // 31
      ];
    });

    const totalKunjungan = visitDays.length;
    const lastVisitDay = visitDays.length > 0 ? visitDays[visitDays.length - 1].d : 1;
    const activePembagi = lastVisitDay > 0 ? lastVisitDay : 1;
    const totRtYo = Math.trunc(sumYo / activePembagi);
    const totRtOm = Math.trunc(sumOm / activePembagi);
    const totRtOs = Math.trunc(sumOs / activePembagi);
    const totRtYt = Math.trunc(sumYt / activePembagi);
    const totRtAll = Math.trunc(sumAll / activePembagi);

    const totPersenRumah = sumAllPotensi > 0 ? Math.trunc((runRumahAkm / sumAllPotensi) * 100) : 0;
    const totPersenRb = sumPlg > 0 ? Math.trunc((sumRb / sumPlg) * 100) : 0;
    const totBbPctHari = sumAll + sumBbHari > 0 ? Math.trunc((sumBbHari / (sumAll + sumBbHari)) * 100) : 0;
    const totBbPctAkm = sumAll + runBbAkm > 0 ? Math.trunc((runBbAkm / (sumAll + runBbAkm)) * 100) : 0;

    const lastRow = rows.length > 0 ? rows[rows.length - 1] : null;
    const totalRataMggLalu = lastRow ? Number(lastRow[2]) || 0 : 0;
    const totalRataMggIni = totRtAll;
    const totalVsMggLaluPct = totalRataMggLalu > 0 ? Math.trunc((totalRataMggIni / totalRataMggLalu) * 100) : 0;

    const totalRow = [
      "TOTAL",
      "",
      totalRataMggLalu,
      sumYo,
      sumOm,
      sumOs,
      sumYt,
      sumAll,
      sumAll,
      totRtYo,
      totRtOm,
      totRtOs,
      totRtYt,
      totRtAll,
      totalRataMggIni,
      totalVsMggLaluPct,
      sumRumahHari,
      runRumahAkm,
      totPersenRumah,
      sumPlg,
      sumRb,
      totPersenRb,
      sumPbPagi,
      sumPbSore,
      runPbAkm,
      sumSampahHari,
      runSampahAkm,
      runSampahAkm - 900,
      sumBbHari,
      totBbPctHari,
      runBbAkm,
      totBbPctAkm
    ];

    return { rows, totalRow, maxSales, totalKunjungan, debugPrevMonth };
  }, [
    role,
    globalMonth,
    selectedDate,
    transactions,
    ylBreakdownRealisasi,
    currentYlName,
    activeEvaluasiData,
    // BUGFIX: prevMonthArchive sebelumnya TIDAK ADA di sini. fetchPrevMonth()
    // sukses set prevMonthArchive lewat setState, tapi karena bukan dependency
    // useMemo ini, seluruh tabel (termasuk RATA MGG LALU & debugPrevMonth) tetap
    // pakai hasil hitung dari render PERTAMA saat prevMonthArchive masih null —
    // biarpun fetch belakangan berhasil. Inilah sebab angka & badge "TIDAK
    // ditemukan" seolah beku/tidak pernah update walau data sudah ketemu.
    prevMonthArchive
  ]);

  // Find overall highest performing and needy YL
  const evaluasiHighlights = useMemo(() => {
    const list = normalizedAnalisis;
    if (!list || list.length === 0) return { top: null, needImprovement: null, highestBB: null };

    const EVAL_CATEGORIES = [
      { key: "jualHariIni", label: "Tabel Penjualan Hari Ini", type: "max", requirePositive: true },
      { key: "rata2BulanBerjalan", label: "Rata Bulan Ini", type: "max", requirePositive: true },
      { key: "vsMingguLaluPct", label: "vs Minggu Lalu", type: "max", requirePositive: true },
      { key: "persenRumah", label: "Persen Rumah", type: "max", requirePositive: true },
      { key: "persenRbVsPlg", label: "Persen RB vs PLG", type: "max", requirePositive: true },
      { key: "propagandaHariIni", label: "PB Hari Ini", type: "max", requirePositive: true },
      { key: "sampahBotol", label: "Akm Sampah", type: "max", requirePositive: true },
      { key: "akmBb", label: "Akm BB", type: "min", requirePositive: false }
    ];

    const categoryStats = EVAL_CATEGORIES.map((cat) => {
      const vals = list.map((x: any) => (x as any)[cat.key] as number || 0);
      let bestVal: number | null = null;
      let worstVal: number | null = null;

      const validVals = cat.requirePositive ? vals.filter((v: number) => v > 0) : vals;

      let isWinner = (_v: any) => false;
      let isLoser = (_v: any) => false;
      let getScore = (_v: any) => 0;

      if (validVals.length > 0 || !cat.requirePositive) {
        if (cat.type === "max") {
          bestVal = validVals.length > 0 ? Math.max(...validVals) : 0;
          worstVal = validVals.length > 0 ? Math.min(...validVals) : 0;
          isWinner = (v) => v === bestVal && (!cat.requirePositive || v > 0);
          isLoser = (v) => v === worstVal && (!cat.requirePositive || v > 0);
          getScore = (v) => {
            if (cat.requirePositive && v === 0) return 0;
            return bestVal === worstVal ? 1 : (v - worstVal) / (bestVal! - worstVal);
          };
        } else if (cat.type === "min") {
          bestVal = validVals.length > 0 ? Math.min(...validVals) : 0;
          worstVal = validVals.length > 0 ? Math.max(...validVals) : 0;
          isWinner = (v) => v === bestVal && (!cat.requirePositive || v > 0);
          isLoser = (v) => v === worstVal && (!cat.requirePositive || v > 0);
          getScore = (v) => {
            if (cat.requirePositive && v === 0) return 0;
            return bestVal === worstVal ? 1 : (worstVal - v) / (worstVal - bestVal!);
          };
        }
      }

      return { ...cat, bestVal, worstVal, isWinner, isLoser, getScore };
    });

    const scoredList = list.map((yl: any) => {
      let winCount = 0;
      let loseCount = 0;
      let totalScore = 0;
      const wonCategories: string[] = [];
      const lostCategories: string[] = [];

      categoryStats.forEach((stat) => {
        const v = ((yl as any)[stat.key] as number) || 0;
        if (stat.isWinner(v)) {
          winCount++;
          wonCategories.push(stat.label);
        }
        if (stat.isLoser(v)) {
          loseCount++;
          lostCategories.push(stat.label);
        }
        totalScore += stat.getScore(v);
      });

      return { ...yl, winCount, loseCount, totalScore, wonCategories, lostCategories };
    });

    // Performa Terbaik
    const sortedTop = [...scoredList].sort((a, b) => b.winCount - a.winCount || b.totalScore - a.totalScore);
    const topWinCount = sortedTop[0]?.winCount || 0;
    const topTotalScore = sortedTop[0]?.totalScore || 0;
    const allTops = sortedTop.filter(
      (x) => x.winCount === topWinCount && Math.abs(x.totalScore - topTotalScore) < 0.001
    );

    const top = sortedTop[0]
      ? {
          ...sortedTop[0],
          nama: allTops.map((x) => cleanYlName(x.nama)).join(", ")
        }
      : null;

    // Performa Turun
    const sortedNeed = [...scoredList].sort((a, b) => b.loseCount - a.loseCount || a.totalScore - b.totalScore);
    const needLoseCount = sortedNeed[0]?.loseCount || 0;
    const needTotalScore = sortedNeed[0]?.totalScore || 0;
    const allNeeds = sortedNeed.filter(
      (x) => x.loseCount === needLoseCount && Math.abs(x.totalScore - needTotalScore) < 0.001
    );

    const needImprovement = sortedNeed[0]
      ? {
          ...sortedNeed[0],
          nama: allNeeds.map((x) => cleanYlName(x.nama)).join(", ")
        }
      : null;

    const sortedBB = [...list].sort((a, b) => (b.akmBb ?? b.bb) - (a.akmBb ?? a.bb));
    const bbVal = sortedBB[0]?.akmBb ?? sortedBB[0]?.bb ?? 0;
    const allBBs = sortedBB.filter((x) => (x.akmBb ?? x.bb) === bbVal);
    const highestBB = sortedBB[0]
      ? {
          ...sortedBB[0],
          nama: allBBs.map((x) => cleanYlName(x.nama)).join(", "),
          bb: bbVal
        }
      : null;

    return { top, needImprovement, highestBB };
  }, [normalizedAnalisis]);

  const evaluasiBlocks = useMemo(() => {
    const list = normalizedAnalisis;
    if (!list || list.length === 0) return null;

    const getTop = (key: keyof (typeof list)[0], ascending = false) => {
      if (list.length === 0) return null;
      let validList = list;
      if (key !== "akmBb") {
        validList = list.filter((item) => (item[key] as number) > 0);
      }
      if (validList.length === 0) return null;
      const sorted = [...validList].sort((a, b) =>
        ascending ? (a[key] as number) - (b[key] as number) : (b[key] as number) - (a[key] as number)
      );
      const topVal = sorted[0][key];
      const allTops = sorted.filter((item) => item[key] === topVal);
      const joinedNames = allTops.map((i) => cleanYlName(i.nama)).join(", ");

      return {
        ...sorted[0],
        nama: joinedNames,
        [key]: topVal
      };
    };

    const block1 = getTop("jualHariIni");
    const block2 = getTop("rata2BulanBerjalan");
    const block3 = getTop("vsMingguLaluPct");
    const block4 = getTop("persenRumah");
    const block5 = getTop("persenRbVsPlg");
    const block6 = getTop("propagandaHariIni");
    const block7 = getTop("sampahBotol");
    const block8 = getTop("akmBb", true); // lowest Akm BB (minimum retur)

    return { block1, block2, block3, block4, block5, block6, block7, block8 };
  }, [normalizedAnalisis]);

  const { top, needImprovement, highestBB } = evaluasiHighlights;

  const cleanCurrentYl = useMemo(() => cleanYlName(currentYlName), [currentYlName]);

  if (!activeEvaluasiData) {
    return (
      <div className="p-12 text-center text-slate-500 dark:text-slate-400 font-bold bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 border-3 border-red-600 border-t-transparent rounded-full animate-spin" />
        <span>Memuat Data Evaluasi Harian...</span>
      </div>
    );
  }

  const activeTotalRow = role === "yl" ? ylDailyEvaluation.totalRow : activeEvaluasiData?.totalRow;

  return (
    <div
      className={
        isFullscreenEval
          ? "fixed inset-0 z-[9999] bg-slate-950 text-slate-100 overflow-y-auto p-2 sm:p-4 space-y-3"
          : "space-y-3"
      }
    >
      {/* Optional Top Navigation Bar if onBack is provided (e.g. in YL View) */}
      {onBack && !isFullscreenEval && (
        <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-2 sm:p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs font-black text-slate-700 dark:text-slate-200 hover:text-red-600 dark:hover:text-red-400 px-2 py-1 rounded-lg transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Kembali ke Beranda</span>
          </button>
          <div className="flex items-center gap-2">
            <span className="text-[10px] sm:text-xs font-extrabold text-slate-500 uppercase tracking-wider">
              {globalMonth ? `Periode: ${globalMonth}` : "Evaluasi Harian Tim"}
            </span>
            <button
              onClick={fetchEvaluasi}
              disabled={isFetching}
              className="p-1 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 rounded cursor-pointer"
              title="Refresh Data Evaluasi"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-stretch">
        {/* 1. PALING ATAS (KIRI): Laporan Evaluasi Harian (Mirror Sheet Table Card) */}
        <div className={`col-span-1 ${role === "yl" ? "md:col-span-12 w-full" : "md:col-span-9"} bg-white text-slate-900 rounded-2xl border-2 border-slate-200 shadow-md p-1 flex flex-col justify-between overflow-hidden h-full`}>
          {/* Header */}
          <div className="py-1 px-2.5 bg-red-950 text-white flex flex-col sm:flex-row sm:items-center justify-between shrink-0 rounded-t-xl gap-1.5 sm:gap-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <h3 className="text-[11.5px] sm:text-[13px] font-black uppercase tracking-tight">
                {role === "yl"
                  ? `Laporan Evaluasi Harian Perkunjungan (${cleanYlName(currentYlName || "Yakult Lady")})`
                  : "Laporan Evaluasi Harian (Mirror Sheet)"}
              </h3>
              <div className="text-[9.5px] bg-red-800 text-red-100 px-1.5 py-1 rounded font-bold flex items-center whitespace-nowrap">
                {role === "yl" ? "32 Kolom Lengkap" : showFullEvalTable ? "32 Kolom Lengkap" : "8 Kategori Utama"}
              </div>
              {role === "yl" && (
                <div className="text-[9.5px] bg-red-900 border border-red-700/60 text-amber-200 px-1.5 py-0.5 rounded font-bold flex items-center whitespace-nowrap">
                  {ylDailyEvaluation.totalKunjungan} Hari Kunjungan
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {isFullscreenEval && (
                <div className="text-[9.5px] bg-emerald-600 text-white px-1.5 py-1 rounded font-bold animate-pulse flex items-center whitespace-nowrap">
                  Mode Slide Layar Penuh
                </div>
              )}
              {role !== "yl" && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowFullEvalTable(!showFullEvalTable);
                  }}
                  className="text-white bg-red-800 hover:bg-red-700 px-2 py-1 rounded transition-all flex items-center gap-1 font-bold text-[9.5px] cursor-pointer whitespace-nowrap"
                >
                  {showFullEvalTable ? "Sembunyikan Kolom" : "Tampilkan Tabel Lengkap"}
                </button>
              )}
              {!isFullscreenEval ? (
                <button
                  onClick={() => setIsFullscreenEval(true)}
                  className="text-white bg-red-800 hover:bg-red-700 px-2 py-1 rounded transition-all flex items-center gap-1 font-bold text-[9.5px] cursor-pointer whitespace-nowrap"
                  title="Layar Penuh"
                >
                  <Maximize2 className="w-3 h-3" />
                  <span>Slide Layar Penuh</span>
                </button>
              ) : (
                <button
                  onClick={() => setIsFullscreenEval(false)}
                  className="text-white bg-red-800 hover:bg-red-700 px-2 py-1 rounded transition-all flex items-center gap-1 font-bold text-[9.5px] cursor-pointer whitespace-nowrap"
                  title="Keluar Layar Penuh"
                >
                  <Minimize2 className="w-3 h-3" />
                  <span>Keluar Slide</span>
                </button>
              )}
            </div>
          </div>

          <div
            className="overflow-x-auto overflow-y-visible flex-1 cursor-pointer bg-white"
            onClick={() => {
              if (!isFullscreenEval) setIsFullscreenEval(true);
            }}
            title={isFullscreenEval ? "" : "Klik tabel untuk masuk Mode Presentasi Slide"}
          >
            <table className="w-full text-left border-collapse relative text-[12px] sm:text-[13px] bg-white text-slate-800 font-sans tabular-nums font-semibold">
              <thead className="sticky top-0 z-10 bg-blue-50 text-blue-900 text-[10.5px] sm:text-[11.5px] uppercase tracking-wider text-center font-bold">
                {/* Row 0 */}
                <tr className="border-b border-blue-200">
                  <th rowSpan={3} className="py-1 px-1 border-r border-blue-200 min-w-[32px] text-slate-900">
                    {role === "yl" ? "Tanggal" : "Area"}
                  </th>
                  <th
                    rowSpan={3}
                    className="py-1 px-1.5 border-r border-blue-200 text-left min-w-[75px] text-slate-900"
                  >
                    {role === "yl" ? "Hari" : "Nama YL"}
                  </th>
                  {isFullCols ? (
                    <>
                      <th rowSpan={3} className="py-1 px-1 border-r border-blue-200 text-slate-700">
                        Rata Mgg Lalu
                      </th>
                      <th colSpan={5} className="py-1 px-1 border-r border-blue-200 text-indigo-800">
                        Penjualan Hari Ini
                      </th>
                      <th colSpan={6} className="py-1 px-1 border-r border-blue-200 text-emerald-800">
                        Bulan Ini
                      </th>
                      <th rowSpan={3} className="py-1 px-1 border-r border-blue-200 text-slate-700">
                        Rata Mgg Ini
                      </th>
                      <th rowSpan={3} className="py-1 px-1 border-r border-blue-200 text-slate-700">
                        vs Mgg Lalu
                      </th>
                      <th colSpan={3} className="py-1 px-1 border-r border-blue-200 text-sky-800">
                        Potensi Rmh
                      </th>
                      <th colSpan={3} className="py-1 px-1 border-r border-blue-200 text-purple-800">
                        RB vs Pelanggan
                      </th>
                      <th colSpan={3} className="py-1 px-1 border-r border-blue-200 text-amber-800">
                        Propaganda (PB)
                      </th>
                      <th colSpan={3} className="py-1 px-1 border-r border-blue-200 text-teal-800">
                        Sampah Botol
                      </th>
                      <th colSpan={4} className="py-1 px-1 text-rose-800">
                        Barang Kembali (BB)
                      </th>
                    </>
                  ) : (
                    <>
                      <th colSpan={5} className="py-1 px-1 border-r border-blue-200 text-indigo-800">
                        Penjualan Hari Ini
                      </th>
                      <th rowSpan={3} className="py-1 px-1 border-r border-blue-200 text-emerald-800">
                        Rata Bulan Ini
                      </th>
                      <th rowSpan={3} className="py-1 px-1 border-r border-blue-200 text-slate-700">
                        vs Mgg Lalu
                      </th>
                      <th rowSpan={3} className="py-1 px-1 border-r border-blue-200 text-sky-800">
                        Persen Rumah
                      </th>
                      <th rowSpan={3} className="py-1 px-1 border-r border-blue-200 text-purple-800">
                        Persen RB vs PLG
                      </th>
                      <th colSpan={2} className="py-1 px-1 border-r border-blue-200 text-amber-800">
                        PB Hari Ini
                      </th>
                      <th rowSpan={3} className="py-1 px-1 border-r border-blue-200 text-teal-800">
                        Akm Sampah
                      </th>
                      <th rowSpan={3} className="py-1 px-1 text-rose-800">
                        Akm BB
                      </th>
                    </>
                  )}
                </tr>
                {/* Row 1 */}
                <tr className="border-b border-blue-200">
                  {/* Penjualan Hari Ini */}
                  <th rowSpan={2} className="py-0.5 px-1 border-r border-blue-200 text-indigo-800 font-bold">
                    YO
                  </th>
                  <th rowSpan={2} className="py-0.5 px-1 border-r border-blue-200 text-indigo-800 font-bold">
                    OM
                  </th>
                  <th rowSpan={2} className="py-0.5 px-1 border-r border-blue-200 text-indigo-800 font-bold">
                    OS
                  </th>
                  <th rowSpan={2} className="py-0.5 px-1 border-r border-blue-200 text-indigo-800 font-bold">
                    YT
                  </th>
                  <th
                    rowSpan={2}
                    className="py-0.5 px-1 border-r border-blue-200 font-bold text-slate-900 bg-blue-100/70"
                  >
                    ALL
                  </th>

                  {isFullCols ? (
                    <>
                      {/* Bulan Ini */}
                      <th
                        rowSpan={2}
                        className="py-0.5 px-1 border-r border-blue-200 font-bold text-slate-900 bg-blue-100/70"
                      >
                        Akm
                      </th>
                      <th colSpan={5} className="py-0.5 px-1 border-r border-blue-200 text-emerald-800 font-bold">
                        Rata-Rata (Rt2)
                      </th>

                      {/* Potensi Rmh */}
                      <th rowSpan={2} className="py-0.5 px-1 border-r border-blue-200 text-sky-800 font-bold">
                        Hari
                      </th>
                      <th rowSpan={2} className="py-0.5 px-1 border-r border-blue-200 text-sky-800 font-bold">
                        Akm
                      </th>
                      <th
                        rowSpan={2}
                        className="py-0.5 px-1 border-r border-blue-200 font-bold text-slate-900 bg-blue-100/70"
                      >
                        %
                      </th>

                      {/* RB vs Pelanggan */}
                      <th rowSpan={2} className="py-0.5 px-1 border-r border-blue-200 text-purple-800 font-bold">
                        Pelanggan
                      </th>
                      <th rowSpan={2} className="py-0.5 px-1 border-r border-blue-200 text-purple-800 font-bold">
                        RB
                      </th>
                      <th
                        rowSpan={2}
                        className="py-0.5 px-1 border-r border-blue-200 font-bold text-slate-900 bg-blue-100/70"
                      >
                        %
                      </th>

                      {/* Propaganda Baru */}
                      <th rowSpan={2} className="py-0.5 px-1 border-r border-blue-200 text-amber-800 font-bold">
                        Pagi
                      </th>
                      <th rowSpan={2} className="py-0.5 px-1 border-r border-blue-200 text-amber-800 font-bold">
                        Sore
                      </th>
                      <th
                        rowSpan={2}
                        className="py-0.5 px-1 border-r border-blue-200 font-bold text-slate-900 bg-blue-100/70"
                      >
                        Akm
                      </th>

                      {/* Sampah Botol */}
                      <th rowSpan={2} className="py-0.5 px-1 border-r border-blue-200 text-teal-800 font-bold">
                        Hari
                      </th>
                      <th rowSpan={2} className="py-0.5 px-1 border-r border-blue-200 text-teal-800 font-bold">
                        Akm
                      </th>
                      <th
                        rowSpan={2}
                        className="py-0.5 px-1 border-r border-blue-200 font-bold text-slate-900 bg-blue-100/70"
                      >
                        vs 900
                      </th>

                      {/* Kembali Botol */}
                      <th rowSpan={2} className="py-0.5 px-1 border-r border-blue-200 text-rose-800 font-bold">
                        Hari
                      </th>
                      <th
                        rowSpan={2}
                        className="py-0.5 px-1 border-r border-blue-200 font-bold text-slate-900 bg-blue-100/70"
                      >
                        %
                      </th>
                      <th rowSpan={2} className="py-0.5 px-1 border-r border-blue-200 text-rose-800 font-bold">
                        Akm
                      </th>
                      <th rowSpan={2} className="py-0.5 px-1 text-slate-900 font-bold bg-blue-100/70">
                        %
                      </th>
                    </>
                  ) : (
                    <>
                      <th rowSpan={2} className="py-0.5 px-1 border-r border-blue-200 text-amber-800 font-bold">
                        Pagi
                      </th>
                      <th rowSpan={2} className="py-0.5 px-1 text-amber-800 font-bold">
                        Sore
                      </th>
                    </>
                  )}
                </tr>
                {/* Row 2 */}
                <tr className="border-b border-blue-200">
                  {isFullCols && (
                    <>
                      {/* Rata-Rata Bulan Ini */}
                      <th className="py-0.5 px-1 border-r border-blue-200 text-emerald-800 font-bold">
                        YO
                      </th>
                      <th className="py-0.5 px-1 border-r border-blue-200 text-emerald-800 font-bold">
                        OM
                      </th>
                      <th className="py-0.5 px-1 border-r border-blue-200 text-emerald-800 font-bold">
                        OS
                      </th>
                      <th className="py-0.5 px-1 border-r border-blue-200 text-emerald-800 font-bold">
                        YT
                      </th>
                      <th className="py-0.5 px-1 border-r border-blue-200 font-bold text-slate-900 bg-blue-100/70">
                        ALL
                      </th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white text-slate-800">
                {(() => {
                  const maxCols = {
                    c7: -1,
                    c13: -1,
                    c15: -Infinity,
                    c18: -1,
                    c21: -1,
                    pb: -1,
                    c26: -1,
                    c28: Infinity
                  };
                  if (activeEvaluasiData?.dataRows) {
                    activeEvaluasiData.dataRows.forEach((row: any) => {
                      if ((row[7] || 0) > maxCols.c7) maxCols.c7 = row[7] || 0;
                      if ((row[13] || 0) > maxCols.c13) maxCols.c13 = row[13] || 0;
                      if ((row[15] || 0) > maxCols.c15) maxCols.c15 = row[15] || 0;
                      if ((row[18] || 0) > maxCols.c18) maxCols.c18 = row[18] || 0;
                      if ((row[21] || 0) > maxCols.c21) maxCols.c21 = row[21] || 0;
                      const pbSum = (row[22] || 0) + (row[23] || 0);
                      if (pbSum > maxCols.pb) maxCols.pb = pbSum;
                      if ((row[26] || 0) > maxCols.c26) maxCols.c26 = row[26] || 0;

                      const bb = typeof row[28] === "number" ? row[28] : 0;
                      if (bb < maxCols.c28) maxCols.c28 = bb;
                    });
                  }

                  const visibleCols = [0, 1, 3, 4, 5, 6, 7, 13, 15, 18, 21, 22, 23, 26, 30];
                  const displayRows = role === "yl" ? ylDailyEvaluation.rows : (activeEvaluasiData?.dataRows || []);
                  const displayTotalRow = role === "yl" ? ylDailyEvaluation.totalRow : activeEvaluasiData?.totalRow;

                  if (displayRows.length === 0) {
                    return (
                      <tr>
                        <td
                          colSpan={isFullCols ? 32 : visibleCols.length}
                          className="py-8 text-center text-xs font-semibold text-slate-500"
                        >
                          {role === "yl"
                            ? "Belum ada data kunjungan pada periode ini."
                            : "Tidak ada data evaluasi."}
                        </td>
                      </tr>
                    );
                  }

                  const currentM = globalMonth || (selectedDate ? selectedDate.substring(0, 7) : new Date().toISOString().substring(0, 7));
                  const isCurrentMonth = currentM === new Date().toISOString().substring(0, 7);
                  const todayDayNum = new Date().getDate();

                  return displayRows.map((row: any, rIdx: number) => {
                    const rowName = cleanYlName(row[1] || "");
                    const isCurrentYl = role !== "yl" && cleanCurrentYl && rowName === cleanCurrentYl;

                    const dayMatch = typeof row[0] === "string" ? row[0].match(/Tgl\s+(\d+)/) : null;
                    const rowDayNum = dayMatch ? parseInt(dayMatch[1], 10) : (rIdx + 1);
                    const isToday = role === "yl" && isCurrentMonth && rowDayNum === todayDayNum;
                    const isSunday = role === "yl" && row[1] === "Min";

                    return (
                      <tr
                        key={rIdx}
                        className={`transition-colors border-b border-slate-200 ${
                          isToday
                            ? "bg-amber-50/90 dark:bg-amber-950/40 font-bold"
                            : isCurrentYl
                            ? "bg-amber-50/80 dark:bg-amber-950/30 font-bold"
                            : isSunday
                            ? "bg-slate-50/70 text-slate-500"
                            : "hover:bg-slate-50"
                        }`}
                      >
                        {(row || []).map((val: any, cIdx: number) => {
                          if (!isFullCols && !visibleCols.includes(cIdx)) return null;
                          let isTopPerf = false;
                          if (role === "yl") {
                            if (cIdx === 7 && val > 0 && val === ylDailyEvaluation.maxSales) {
                              isTopPerf = true;
                            }
                          } else {
                            if (cIdx === 7 && val > 0 && val === maxCols.c7) isTopPerf = true;
                            if (cIdx === 13 && val > 0 && val === maxCols.c13) isTopPerf = true;
                            if (cIdx === 15 && maxCols.c15 !== -Infinity && val === maxCols.c15) isTopPerf = true;
                            if (cIdx === 18 && val > 0 && val === maxCols.c18) isTopPerf = true;
                            if (cIdx === 21 && val > 0 && val === maxCols.c21) isTopPerf = true;
                            if (
                              (cIdx === 22 || cIdx === 23) &&
                              maxCols.pb > 0 &&
                              (row[22] || 0) + (row[23] || 0) === maxCols.pb
                            )
                              isTopPerf = true;
                            if (cIdx === 26 && val > 0 && val === maxCols.c26) isTopPerf = true;
                            if (cIdx === 30 && maxCols.c28 !== Infinity && val === maxCols.c28) isTopPerf = true;
                          }

                          const displayVal = cIdx === 1 && typeof val === "string" && role !== "yl" ? cleanYlName(val) : val;

                          return (
                            <td
                              key={cIdx}
                              className={`py-0.5 px-1 border-r border-slate-100 text-center whitespace-nowrap ${
                                cIdx === 1
                                  ? (role === "yl"
                                      ? val === "Min"
                                        ? "text-rose-600 font-bold"
                                        : "text-slate-700 font-semibold"
                                      : "text-left font-sans font-bold text-slate-900 min-w-[70px]")
                                  : cIdx === 0 && role === "yl"
                                  ? "font-semibold text-slate-800"
                                  : "font-sans tabular-nums font-semibold"
                              } ${isTopPerf ? "bg-emerald-50/50 font-black text-emerald-700" : ""}`}
                            >
                              {cIdx === 0 && isToday ? (
                                <span className="flex items-center justify-center gap-1">
                                  <span>{displayVal}</span>
                                  <span className="text-[9px] bg-red-600 text-white font-black px-1 rounded-sm">
                                    Hari Ini
                                  </span>
                                </span>
                              ) : cIdx === 1 && isCurrentYl ? (
                                <span className="flex items-center gap-1">
                                  <span>{displayVal}</span>
                                  <span className="text-[9px] bg-red-600 text-white font-black px-1 rounded-sm">
                                    Anda
                                  </span>
                                </span>
                              ) : typeof displayVal === "number" ? (
                                [15, 18, 21, 29, 31].includes(cIdx) ? (
                                  `${displayVal}%`
                                ) : cIdx === 27 && displayVal > 0 ? (
                                  `+${displayVal.toLocaleString("id-ID")}`
                                ) : (
                                  displayVal.toLocaleString("id-ID")
                                )
                              ) : (
                                displayVal
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  });
                })()}
                {activeTotalRow && (
                  <tr className="bg-slate-50 font-black border-t-2 border-slate-300 text-slate-900">
                    {(activeTotalRow || []).map((val: any, cIdx: number) => {
                      const visibleCols = [0, 1, 3, 4, 5, 6, 7, 13, 15, 18, 21, 22, 23, 26, 30];
                      if (!isFullCols && !visibleCols.includes(cIdx)) return null;
                      const displayVal = cIdx === 1 && typeof val === "string" && role !== "yl" ? cleanYlName(val) : val;
                      return (
                        <td
                          key={cIdx}
                          className={`py-0.5 px-1 border-r border-slate-200 text-center whitespace-nowrap ${
                            cIdx === 1 ? "text-left font-sans" : "font-sans tabular-nums"
                          }`}
                        >
                          {typeof displayVal === "number"
                            ? [15, 18, 21, 29, 31].includes(cIdx)
                              ? `${displayVal}%`
                              : cIdx === 27 && displayVal > 0
                              ? `+${displayVal.toLocaleString("id-ID")}`
                              : displayVal.toLocaleString("id-ID")
                            : displayVal}
                        </td>
                      );
                    })}
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Action Footer */}
          {role !== "yl" && (
            <div className="bg-slate-50 py-1 px-2 text-xs font-bold flex flex-wrap items-center justify-between gap-1 border-t border-slate-200 shrink-0">
              <div className="flex items-center gap-1 text-[9.5px] text-slate-600">
                <span className="inline-block w-2.5 h-2.5 bg-emerald-200 border border-emerald-400 rounded mr-0.5" />
                Sel hijau = Performa terbaik harian.
              </div>
            </div>
          )}
        </div>

        {/* 2, 3, 4: HIDE SUMMARY, PERFORMANCE, & AI ANALYSIS IF ROLE IS YL */}
        {role !== "yl" && (
          <>
            {/* 2. PALING ATAS (KANAN): RINGKASAN PRESTASI */}
            <div className="col-span-1 md:col-span-3 bg-white rounded-2xl p-1.5 sm:p-2 border-2 border-slate-200 shadow-md flex flex-col justify-between h-full text-slate-900">
          <div className="flex items-center justify-between shrink-0 mb-1 pb-1 border-b border-slate-100">
            <h3 className="text-[13px] sm:text-[14px] font-black text-slate-900 uppercase tracking-tight flex items-center gap-1">
              <Award className="w-3 h-3 text-red-600" /> Ringkasan Prestasi
            </h3>
            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1 py-0.2 rounded">8 Block</span>
          </div>

          <div className="grid grid-cols-2 gap-1 flex-1 items-stretch">
            {/* Block 1 */}
            <div className="bg-white p-1 rounded-md border border-red-200 shadow-[0_1px_2px_rgba(0,0,0,0.02)] flex flex-col justify-between text-slate-900">
              <div className="flex items-center justify-between leading-none">
                <TrendingUp className="w-3 h-3 text-red-600 shrink-0" />
                <span className="text-[9.5px] font-black uppercase tracking-tight text-red-800 bg-red-100 border border-red-200 px-0.5 py-0 rounded">
                  Hari Ini
                </span>
              </div>
              <p className="text-[11px] font-extrabold text-slate-600 mt-0.5 truncate leading-none">Penjualan</p>
              {evaluasiBlocks?.block1 ? (
                <div className="mt-0.5 leading-tight">
                  <p className="text-[12px] font-black text-slate-950 truncate">
                    {cleanYlName(evaluasiBlocks!.block1.nama)}
                  </p>
                  <p className="text-[13px] font-black text-red-600">
                    {evaluasiBlocks!.block1.jualHariIni}{" "}
                    <span className="text-[10px] font-semibold text-slate-500">btl</span>
                  </p>
                </div>
              ) : (
                <p className="text-[11px] text-slate-400 italic">Memuat...</p>
              )}
            </div>

            {/* Block 2 */}
            <div className="bg-white p-1 rounded-md border border-amber-200 shadow-[0_1px_2px_rgba(0,0,0,0.02)] flex flex-col justify-between text-slate-900">
              <div className="flex items-center justify-between leading-none">
                <Clock className="w-3 h-3 text-amber-600 shrink-0" />
                <span className="text-[9.5px] font-black uppercase tracking-tight text-amber-800 bg-amber-100 border border-amber-200 px-0.5 py-0 rounded">
                  Bulan Ini
                </span>
              </div>
              <p className="text-[11px] font-extrabold text-slate-600 mt-0.5 truncate leading-none">Rata-Rata</p>
              {evaluasiBlocks?.block2 ? (
                <div className="mt-0.5 leading-tight">
                  <p className="text-[12px] font-black text-slate-950 truncate">
                    {cleanYlName(evaluasiBlocks!.block2.nama)}
                  </p>
                  <p className="text-[13px] font-black text-amber-600">
                    {Math.trunc(evaluasiBlocks!.block2.rata2BulanBerjalan)}{" "}
                    <span className="text-[10px] font-semibold text-slate-500">btl/hr</span>
                  </p>
                </div>
              ) : (
                <p className="text-[11px] text-slate-400 italic">Memuat...</p>
              )}
            </div>

            {/* Block 3 */}
            <div className="bg-white p-1 rounded-md border border-emerald-200 shadow-[0_1px_2px_rgba(0,0,0,0.02)] flex flex-col justify-between text-slate-900">
              <div className="flex items-center justify-between leading-none">
                <Zap className="w-3 h-3 text-emerald-600 shrink-0" />
                <span className="text-[9.5px] font-black uppercase tracking-tight text-emerald-800 bg-emerald-100 border border-emerald-200 px-0.5 py-0 rounded">
                  vs Mgg
                </span>
              </div>
              <p className="text-[11px] font-extrabold text-slate-600 mt-0.5 truncate leading-none">vs Mgg Lalu</p>
              {evaluasiBlocks?.block3 ? (
                <div className="mt-0.5 leading-tight">
                  <p className="text-[12px] font-black text-slate-950 truncate">
                    {cleanYlName(evaluasiBlocks!.block3.nama)}
                  </p>
                  <p className="text-[13px] font-black text-emerald-600">
                    +{Math.trunc(evaluasiBlocks!.block3.vsMingguLaluPct)}%
                  </p>
                </div>
              ) : (
                <p className="text-[11px] text-slate-400 italic">Memuat...</p>
              )}
            </div>

            {/* Block 4 */}
            <div className="bg-white p-1 rounded-md border border-blue-200 shadow-[0_1px_2px_rgba(0,0,0,0.02)] flex flex-col justify-between text-slate-900">
              <div className="flex items-center justify-between leading-none">
                <Home className="w-3 h-3 text-blue-600 shrink-0" />
                <span className="text-[9.5px] font-black uppercase tracking-tight text-blue-800 bg-blue-100 border border-blue-200 px-0.5 py-0 rounded">
                  Potensi
                </span>
              </div>
              <p className="text-[11px] font-extrabold text-slate-600 mt-0.5 truncate leading-none">% Rumah</p>
              {evaluasiBlocks?.block4 ? (
                <div className="mt-0.5 leading-tight">
                  <p className="text-[12px] font-black text-slate-950 truncate">
                    {cleanYlName(evaluasiBlocks!.block4.nama)}
                  </p>
                  <p className="text-[13px] font-black text-blue-600">
                    {Math.trunc(evaluasiBlocks!.block4.persenRumah)}%
                  </p>
                </div>
              ) : (
                <p className="text-[11px] text-slate-400 italic">Memuat...</p>
              )}
            </div>

            {/* Block 5 */}
            <div className="bg-white p-1 rounded-md border border-purple-200 shadow-[0_1px_2px_rgba(0,0,0,0.02)] flex flex-col justify-between text-slate-900">
              <div className="flex items-center justify-between leading-none">
                <UserCheck className="w-3 h-3 text-purple-600 shrink-0" />
                <span className="text-[9.5px] font-black uppercase tracking-tight text-purple-800 bg-purple-100 border border-purple-200 px-0.5 py-0 rounded">
                  Kunjungan
                </span>
              </div>
              <p className="text-[11px] font-extrabold text-slate-600 mt-0.5 truncate leading-none">% RB/PLG</p>
              {evaluasiBlocks?.block5 ? (
                <div className="mt-0.5 leading-tight">
                  <p className="text-[12px] font-black text-slate-950 truncate">
                    {cleanYlName(evaluasiBlocks!.block5.nama)}
                  </p>
                  <p className="text-[13px] font-black text-purple-600">
                    {Math.trunc(evaluasiBlocks!.block5.persenRbVsPlg)}%
                  </p>
                </div>
              ) : (
                <p className="text-[11px] text-slate-400 italic">Memuat...</p>
              )}
            </div>

            {/* Block 6 */}
            <div className="bg-white p-1 rounded-md border border-indigo-200 shadow-[0_1px_2px_rgba(0,0,0,0.02)] flex flex-col justify-between text-slate-900">
              <div className="flex items-center justify-between leading-none">
                <Megaphone className="w-3 h-3 text-indigo-600 shrink-0" />
                <span className="text-[9.5px] font-black uppercase tracking-tight text-indigo-800 bg-indigo-100 border border-indigo-200 px-0.5 py-0 rounded">
                  Propaganda
                </span>
              </div>
              <p className="text-[11px] font-extrabold text-slate-600 mt-0.5 truncate leading-none">PB Hari Ini</p>
              {evaluasiBlocks?.block6 ? (
                <div className="mt-0.5 leading-tight">
                  <p className="text-[12px] font-black text-slate-950 truncate">
                    {cleanYlName(evaluasiBlocks!.block6.nama)}
                  </p>
                  <p className="text-[13px] font-black text-indigo-600">
                    {evaluasiBlocks!.block6.propagandaHariIni}{" "}
                    <span className="text-[10px] font-semibold text-slate-500">PB</span>
                  </p>
                </div>
              ) : (
                <p className="text-[11px] text-slate-400 italic">Memuat...</p>
              )}
            </div>

            {/* Block 7 */}
            <div className="bg-white p-1 rounded-md border border-teal-200 shadow-[0_1px_2px_rgba(0,0,0,0.02)] flex flex-col justify-between text-slate-900">
              <div className="flex items-center justify-between leading-none">
                <Trash2 className="w-3 h-3 text-teal-600 shrink-0" />
                <span className="text-[9.5px] font-black uppercase tracking-tight text-teal-800 bg-teal-100 border border-teal-200 px-0.5 py-0 rounded">
                  Lingkungan
                </span>
              </div>
              <p className="text-[11px] font-extrabold text-slate-600 mt-0.5 truncate leading-none">Akm Sampah</p>
              {evaluasiBlocks?.block7 ? (
                <div className="mt-0.5 leading-tight">
                  <p className="text-[12px] font-black text-slate-950 truncate">
                    {cleanYlName(evaluasiBlocks!.block7.nama)}
                  </p>
                  <p className="text-[13px] font-black text-teal-600">
                    {evaluasiBlocks!.block7.sampahBotol}{" "}
                    <span className="text-[10px] font-semibold text-slate-500">btl</span>
                  </p>
                </div>
              ) : (
                <p className="text-[11px] text-slate-400 italic">Memuat...</p>
              )}
            </div>

            {/* Block 8 */}
            <div className="bg-white p-1 rounded-md border border-emerald-200 shadow-[0_1px_2px_rgba(0,0,0,0.02)] flex flex-col justify-between text-slate-900">
              <div className="flex items-center justify-between leading-none">
                <CheckCircle className="w-3 h-3 text-emerald-600 shrink-0" />
                <span className="text-[9.5px] font-black uppercase tracking-tight text-emerald-800 bg-emerald-100 border border-emerald-200 px-0.5 py-0 rounded">
                  Retur
                </span>
              </div>
              <p className="text-[11px] font-extrabold text-slate-600 mt-0.5 truncate leading-none">Akm BB</p>
              {evaluasiBlocks?.block8 ? (
                <div className="mt-0.5 leading-tight">
                  <p className="text-[12px] font-black text-slate-950 truncate">
                    {cleanYlName(evaluasiBlocks!.block8.nama)}
                  </p>
                  <p className="text-[13px] font-black text-emerald-600">
                    {((evaluasiBlocks!.block8 as any).akmBb ?? evaluasiBlocks!.block8.bb)}{" "}
                    <span className="text-[10px] font-semibold text-slate-500">btl</span>
                  </p>
                </div>
              ) : (
                <p className="text-[11px] text-slate-400 italic">Memuat...</p>
              )}
            </div>
          </div>
        </div>

        {/* 3. BARIS KEDUA: PERFORMA TERBAIK & PERFORMA TURUN */}
        <div className="col-span-1 md:col-span-12 grid grid-cols-1 md:grid-cols-2 gap-2">
          {/* Top Performer Card */}
          <div className="bg-white dark:bg-white rounded-xl p-2 sm:p-2.5 border-2 border-emerald-300 shadow-sm text-slate-900 flex flex-col justify-between">
            <div>
              <h3 className="text-[13px] sm:text-[14px] font-black text-emerald-800 uppercase tracking-tight mb-1 flex items-center gap-1.5">
                🏆 PERFORMA TERBAIK
              </h3>
              {top ? (
                <div className="text-[12px] sm:text-[13px] text-slate-800 space-y-0.5 leading-snug">
                  <p>
                    <strong className="font-black text-slate-950">{cleanYlName(top.nama)}</strong> memimpin
                    dengan memenangkan{" "}
                    <span className="font-black text-emerald-700">{(top as any).winCount || 0} dari 8 kategori</span>.
                  </p>
                  {(top as any).wonCategories && (top as any).wonCategories.length > 0 && (
                    <p className="text-slate-600 text-[12px]">
                      Keunggulan di:{" "}
                      <strong className="font-bold text-emerald-800">{(top as any).wonCategories.join(", ")}</strong>.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-[12px] text-emerald-700 italic">Memuat data...</p>
              )}
            </div>
            <div className="text-[11.5px] font-bold text-emerald-900 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-200 mt-1">
              👍 Pertahankan efisiensi kunjungan dan rute di potensi andalan Anda!
            </div>
          </div>

          {/* Need Improvement Card */}
          <div className="bg-white dark:bg-white rounded-xl p-2 sm:p-2.5 border-2 border-rose-300 shadow-sm text-slate-900 flex flex-col justify-between">
            <div>
              <h3 className="text-[13px] sm:text-[14px] font-black text-rose-800 uppercase tracking-tight mb-1 flex items-center gap-1.5">
                ⚠️ PERFORMA TURUN
              </h3>
              {needImprovement ? (
                <div className="text-[12px] sm:text-[13px] text-slate-800 space-y-0.5 leading-snug">
                  <p>
                    <strong className="font-black text-slate-950">{cleanYlName(needImprovement.nama)}</strong> berada
                    di posisi terbawah pada{" "}
                    <span className="font-black text-rose-700">
                      {(needImprovement as any).loseCount || 0} dari 8 kategori
                    </span>
                    .
                  </p>
                  {(needImprovement as any).lostCategories && (needImprovement as any).lostCategories.length > 0 && (
                    <p className="text-slate-600 text-[10.5px]">
                      Kelemahan di:{" "}
                      <strong className="font-bold text-rose-800">
                        {(needImprovement as any).lostCategories.join(", ")}
                      </strong>
                      .
                    </p>
                  )}
                  {highestBB && (
                    <p className="text-[12px]">
                      Balik Botol (BB) terbanyak:{" "}
                      <strong className="font-black text-slate-950">{cleanYlName(highestBB.nama)}</strong> (
                      {highestBB.bb} btl).
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-[12px] text-rose-700 italic">Memuat data...</p>
              )}
            </div>
            <div className="text-[11.5px] font-bold text-rose-900 bg-rose-50 px-2 py-1 rounded-md border border-rose-200 mt-1">
              🚨 Tindakan: Review rute drop-off dan sisa stock harian agar botol retur tidak membengkak!
            </div>
          </div>
        </div>

        {/* 4. BARIS KETIGA: AI DEEP EVALUATION CARD (Paling Bawah) */}
        <div className="col-span-1 md:col-span-12 bg-white dark:bg-white rounded-2xl p-3.5 sm:p-4 border-2 border-indigo-200 shadow-md text-slate-900 relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-black text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-indigo-600 animate-pulse" /> Analisis & Evaluasi AI Jember 1
            </h3>
            <button
              onClick={runAiInsight}
              disabled={isAiLoading}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[9.5px] px-2.5 py-1 rounded-lg transition-all shadow-sm flex items-center gap-1 disabled:opacity-50 cursor-pointer"
            >
              {isAiLoading ? "Sedang Menganalisis..." : "Jalankan Analisis AI"}
            </button>
          </div>

          {isAiLoading ? (
            <div className="flex flex-col items-center justify-center py-5 text-center">
              <div className="w-7 h-7 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-[10px] text-indigo-700 font-bold mt-2">
                Menganalisis data lembar evaluasi harian dengan Gemini...
              </span>
            </div>
          ) : aiInsight ? (
            <div
              className="text-xs text-slate-700 bg-white rounded-xl p-2.5 border border-indigo-100/50 prose max-w-none shadow-sm leading-relaxed max-h-[280px] overflow-y-auto"
              dangerouslySetInnerHTML={{ __html: aiInsight }}
            />
          ) : (
            <p className="text-xs text-slate-500 italic">
              Klik tombol di atas untuk memanggil modul kecerdasan buatan Gemini guna menganalisis laporan dropping tim
              secara mendalam.
            </p>
          )}
        </div>
          </>
        )}
      </div>
    </div>
  );
}
