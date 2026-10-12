import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Bell, Cake, AlertTriangle, CheckCircle2, Trash2, X, ChevronDown, ChevronUp, RotateCcw, Sparkles } from "lucide-react";
import { safeFetchJson } from "../lib/safeFetch";
import { saveToSupabase, loadFromSupabase } from "../lib/supabaseClient";

export interface NotificationItem {
  id: string;
  category: "birthday" | "potensi";
  title: string;
  area: string;
  nama: string;
  subtitle: string;
  badgeText: string;
  badgeColor: string;
  daysRemaining?: number;
  unfilledDates?: number[];
  mismatchDates?: number[];
  details?: Array<{
    date: number;
    dateStr: string;
    type: "empty" | "mismatch";
    acuan: number;
    aktual: number;
    selisih?: number;
    acuanDetail?: { yo: number; om: number; os: number; yt: number };
    aktualDetail?: { yo: number; om: number; os: number; yt: number };
  }>;
}

interface NotificationBellProps {
  role?: "manager" | "yl";
  currentYlName?: string;
  currentYlArea?: string;
  globalMonth?: string;
  ylList?: any[];
}

const MONTH_NAMES_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

function parseBirthDate(tglLahir: string): { month: number; day: number; year?: number } | null {
  if (!tglLahir || typeof tglLahir !== "string") return null;
  const clean = tglLahir.trim();
  const ymdMatch = clean.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (ymdMatch) {
    return {
      year: parseInt(ymdMatch[1], 10),
      month: parseInt(ymdMatch[2], 10),
      day: parseInt(ymdMatch[3], 10)
    };
  }
  const dmyMatch = clean.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmyMatch) {
    return {
      year: parseInt(dmyMatch[3], 10),
      month: parseInt(dmyMatch[2], 10),
      day: parseInt(dmyMatch[1], 10)
    };
  }
  const mdMatch = clean.match(/^(\d{1,2})[-/](\d{1,2})$/);
  if (mdMatch) {
    return {
      month: parseInt(mdMatch[1], 10),
      day: parseInt(mdMatch[2], 10)
    };
  }
  return null;
}

function calculateDaysUntilBirthday(bMonth: number, bDay: number, now: Date = new Date()): { days: number; targetDate: Date } {
  const currentYear = now.getFullYear();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let target = new Date(currentYear, bMonth - 1, bDay);
  target.setHours(0, 0, 0, 0);

  if (target.getTime() < todayMidnight.getTime()) {
    target = new Date(currentYear + 1, bMonth - 1, bDay);
    target.setHours(0, 0, 0, 0);
  }

  const diffMs = target.getTime() - todayMidnight.getTime();
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24));
  return { days, targetDate: target };
}

const SUPABASE_STORAGE_KEY = "yakult_dismissed_notifications_v1";

export function NotificationBell({
  role = "manager",
  currentYlName = "",
  currentYlArea = "",
  globalMonth = "",
  ylList = []
}: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [activeFilter, setActiveFilter] = useState<"all" | "birthday" | "potensi">("all");
  const [potensiRaw, setPotensiRaw] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
  const [showHistory, setShowHistory] = useState<boolean>(false);

  // Load dismissed notifications from localStorage first, then sync from Supabase
  const [dismissedIds, setDismissedIds] = useState<string[]>(() => {
    try {
      const local = localStorage.getItem(SUPABASE_STORAGE_KEY);
      if (local) return JSON.parse(local);
    } catch (e) {}
    return [];
  });

  // Supabase Sync on Mount
  useEffect(() => {
    let isMounted = true;
    loadFromSupabase<string[]>(SUPABASE_STORAGE_KEY).then((remoteData) => {
      if (!isMounted || !remoteData || !Array.isArray(remoteData)) return;
      setDismissedIds((prev) => {
        const merged = Array.from(new Set([...prev, ...remoteData]));
        try {
          localStorage.setItem(SUPABASE_STORAGE_KEY, JSON.stringify(merged));
        } catch (e) {}
        return merged;
      });
    }).catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  const activeMonth = useMemo(() => {
    if (globalMonth && /^\d{4}-\d{2}$/.test(globalMonth)) return globalMonth;
    return new Date().toISOString().substring(0, 7);
  }, [globalMonth]);

  // Fetch Realisasi Potensi notifications
  const fetchPotensiNotifications = useCallback(async () => {
    setIsLoading(true);
    try {
      const qNama = role === "yl" && currentYlName ? encodeURIComponent(currentYlName) : "";
      const res = await safeFetchJson<{ ok: boolean; data: any[] }>(
        `/api/getPotensiNotifications?month=${activeMonth}&nama=${qNama}`
      );
      if (res && res.ok && Array.isArray(res.data)) {
        setPotensiRaw(res.data);
      } else {
        setPotensiRaw([]);
      }
    } catch (e) {
      console.warn("Failed to fetch potensi notifications:", e);
    } finally {
      setIsLoading(false);
    }
  }, [activeMonth, role, currentYlName]);

  useEffect(() => {
    fetchPotensiNotifications();
  }, [fetchPotensiNotifications]);

  // Compute all notifications
  const allNotifications = useMemo(() => {
    const list: NotificationItem[] = [];
    const now = new Date();

    // 1. Birthday Notifications (H-7 s/d Hari H) - Only for Admin / Manager, NOT displayed in YL account
    if (role !== "yl") {
      const effectiveYlList = Array.isArray(ylList) && ylList.length > 0 ? ylList : [];
      effectiveYlList.forEach((yl: any) => {
        if (yl.status === "Resign" || yl.status === "nonaktif") return;
        if (!yl.tglLahir) return;

        const birth = parseBirthDate(yl.tglLahir);
        if (!birth) return;

        const { days, targetDate } = calculateDaysUntilBirthday(birth.month, birth.day, now);
        if (days >= 0 && days <= 7) {
          const isToday = days === 0;
          const isTomorrow = days === 1;
          const bMonthName = MONTH_NAMES_ID[birth.month - 1] || "";
          const id = `bday_${yl.area || yl.nama}_${targetDate.getFullYear()}_${birth.month}_${birth.day}`;

          let countdownLabel = `H-${days}`;
          let badgeColor = "bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800";
          if (isToday) {
            countdownLabel = "🎉 HARI INI!";
            badgeColor = "bg-red-500 text-white border-red-600 animate-pulse";
          } else if (isTomorrow) {
            countdownLabel = "⏰ BESOK (H-1)";
            badgeColor = "bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700";
          }

          list.push({
            id,
            category: "birthday",
            title: isToday
              ? `Hari Ini Ulang Tahun: Area ${yl.area} - ${yl.nama}!`
              : `H-${days} Ulang Tahun: Area ${yl.area} - ${yl.nama}`,
            area: String(yl.area || "-"),
            nama: String(yl.nama || "-"),
            subtitle: `${birth.day} ${bMonthName} (${isToday ? "Hari ini" : isTomorrow ? "Besok" : `${days} hari lagi`})`,
            badgeText: countdownLabel,
            badgeColor,
            daysRemaining: days
          });
        }
      });
    }

    // 2. Realisasi Potensi Notifications
    potensiRaw.forEach((item: any) => {
      const area = String(item.area || "-");
      const nama = String(item.nama || "-");
      const unfilled = item.unfilledDates || [];
      const mismatch = item.mismatchDates || [];

      if (unfilled.length === 0 && mismatch.length === 0) return;

      const id = `potensi_${area}_${activeMonth}_u${unfilled.join(",")}_m${mismatch.join(",")}`;

      let subtitle = "";
      if (unfilled.length > 0 && mismatch.length > 0) {
        subtitle = `Tgl belum diisi: ${unfilled.join(", ")} • Tgl selisih: ${mismatch.join(", ")}`;
      } else if (unfilled.length > 0) {
        subtitle = `Belum diisi potensinya pada tgl: ${unfilled.join(", ")}`;
      } else {
        subtitle = `Ada selisih aktual vs acuan pada tgl: ${mismatch.join(", ")}`;
      }

      list.push({
        id,
        category: "potensi",
        title: `Realisasi Potensi Belum Dikerjakan: Area ${area} - ${nama}`,
        area,
        nama,
        subtitle,
        badgeText: unfilled.length > 0 ? `⚠️ ${unfilled.length} Hari Kosong` : `⚡ ${mismatch.length} Hari Selisih`,
        badgeColor: unfilled.length > 0
          ? "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800"
          : "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
        unfilledDates: unfilled,
        mismatchDates: mismatch,
        details: item.details || []
      });
    });

    return list;
  }, [ylList, potensiRaw, activeMonth]);

  // Active (un-dismissed) notifications
  const activeNotifications = useMemo(() => {
    return allNotifications.filter((n) => !dismissedIds.includes(n.id));
  }, [allNotifications, dismissedIds]);

  // Dismissed notifications (history)
  const dismissedNotifications = useMemo(() => {
    return allNotifications.filter((n) => dismissedIds.includes(n.id));
  }, [allNotifications, dismissedIds]);

  // Filtered active notifications
  const displayedNotifications = useMemo(() => {
    const source = showHistory ? dismissedNotifications : activeNotifications;
    if (activeFilter === "all") return source;
    return source.filter((n) => n.category === activeFilter);
  }, [showHistory, dismissedNotifications, activeNotifications, activeFilter]);

  // Save dismissed changes to LocalStorage and Supabase
  const persistDismissed = useCallback(async (newIds: string[]) => {
    setDismissedIds(newIds);
    try {
      localStorage.setItem(SUPABASE_STORAGE_KEY, JSON.stringify(newIds));
    } catch (e) {}
    try {
      await saveToSupabase(SUPABASE_STORAGE_KEY, newIds);
    } catch (e) {
      console.warn("Failed saving dismissed notifications to Supabase:", e);
    }
  }, []);

  // Dismiss one notification
  const handleDismiss = useCallback((id: string) => {
    if (dismissedIds.includes(id)) return;
    const next = [...dismissedIds, id];
    persistDismissed(next);
  }, [dismissedIds, persistDismissed]);

  // Dismiss all active notifications
  const handleDismissAll = useCallback(() => {
    const toAdd = activeNotifications.map((n) => n.id);
    const next = Array.from(new Set([...dismissedIds, ...toAdd]));
    persistDismissed(next);
  }, [activeNotifications, dismissedIds, persistDismissed]);

  // Restore one dismissed notification
  const handleRestore = useCallback((id: string) => {
    const next = dismissedIds.filter((item) => item !== id);
    persistDismissed(next);
  }, [dismissedIds, persistDismissed]);

  // Restore all dismissed notifications
  const handleRestoreAll = useCallback(() => {
    persistDismissed([]);
  }, [persistDismissed]);

  const toggleExpand = (id: string) => {
    setExpandedCards((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const unreadCount = activeNotifications.length;

  return (
    <div className="relative inline-block">
      {/* Tombol Bel di Header */}
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) {
            fetchPotensiNotifications();
          }
        }}
        className={`relative flex items-center justify-center p-2 rounded-xl transition-all duration-200 cursor-pointer shadow-xs ${
          unreadCount > 0
            ? "bg-brand-50 hover:bg-brand-100 dark:bg-brand-950/50 dark:hover:bg-brand-900/50 border border-brand-300 dark:border-brand-700 text-brand-700 dark:text-brand-300"
            : "bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 border border-neutral-200 dark:border-neutral-700 text-brand-600 dark:text-brand-300"
        }`}
        title={unreadCount > 0 ? `${unreadCount} Notifikasi Penting` : "Notifikasi"}
        aria-label="Notifikasi"
      >
        <Bell className={`w-4 h-4 text-brand-600 dark:text-brand-300 ${unreadCount > 0 ? "animate-wiggle" : ""}`} />

        {/* Tanda Titik / Badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[18px] h-4.5 px-1 bg-brand-600 border-2 border-white dark:border-neutral-900 rounded-full text-[9px] font-bold text-white shadow-md animate-pulse">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Modal / Flyout Notifikasi */}
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-start justify-center sm:justify-end sm:pr-6 sm:pt-16 p-3 bg-neutral-950/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            className="w-full max-w-lg bg-neutral-900 dark:bg-neutral-950 border border-neutral-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200 text-neutral-100"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 bg-neutral-900 dark:bg-neutral-950 border-b border-neutral-800 text-white flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-brand-600/20 border border-brand-500/30 rounded-xl">
                  <Bell className="w-5 h-5 text-brand-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm sm:text-base leading-tight text-white">Pusat Notifikasi</h3>
                    <span className="bg-brand-500/20 border border-brand-500/30 text-brand-400 text-[11px] font-bold px-2 py-0.5 rounded-full">
                      {activeNotifications.length} Aktif
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-400 font-medium">
                    {role === "yl" ? "Pengingat Realisasi Potensi" : "Pengingat Ultah (H-7) & Realisasi Potensi"}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-xl hover:bg-white/20 text-white transition-colors cursor-pointer"
                title="Tutup"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Filter Tabs & Quick Action */}
            <div className="p-3 bg-neutral-50 dark:bg-neutral-800/60 border-b border-neutral-200 dark:border-neutral-700/60 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setActiveFilter("all")}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                    activeFilter === "all"
                      ? "bg-brand-600 text-white shadow-sm"
                      : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                  }`}
                >
                  Semua ({showHistory ? dismissedNotifications.length : activeNotifications.length})
                </button>
                {role !== "yl" && (
                  <button
                    onClick={() => setActiveFilter("birthday")}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1 ${
                      activeFilter === "birthday"
                        ? "bg-rose-600 text-white shadow-sm"
                        : "bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    }`}
                  >
                    <span>🎂</span>
                    <span>Ultah</span>
                  </button>
                )}
                <button
                  onClick={() => setActiveFilter("potensi")}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1 ${
                    activeFilter === "potensi"
                      ? "bg-amber-600 text-white shadow-sm"
                      : "bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  }`}
                >
                  <span>🎯</span>
                  <span>Potensi</span>
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                {!showHistory && activeNotifications.length > 0 && (
                  <button
                    onClick={handleDismissAll}
                    className="text-neutral-500 hover:text-red-600 dark:text-neutral-400 font-bold text-[11px] px-2 py-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors flex items-center gap-1 cursor-pointer"
                    title="Hapus / Tandai Selesai Semua"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus Semua</span>
                  </button>
                )}

                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className={`text-[11px] font-bold px-2 py-1 rounded transition-colors cursor-pointer ${
                    showHistory
                      ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                      : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-100 dark:text-neutral-400"
                  }`}
                  title="Lihat riwayat notifikasi yang telah dihapus"
                >
                  {showHistory ? "← Kembali ke Aktif" : `Riwayat (${dismissedIds.length})`}
                </button>
              </div>
            </div>

            {/* Notification List Body */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5 divide-y divide-transparent">
              {isLoading && (
                <div className="py-8 text-center text-neutral-400 text-xs flex flex-col items-center gap-2">
                  <div className="w-6 h-6 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                  <span>Memeriksa data notifikasi...</span>
                </div>
              )}

              {!isLoading && displayedNotifications.length === 0 && (
                <div className="py-12 px-4 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center mb-3">
                    <CheckCircle2 className="w-7 h-7" />
                  </div>
                  <h4 className="font-bold text-sm text-neutral-800 dark:text-neutral-200">
                    {showHistory ? "Tidak ada riwayat notifikasi terhapus." : "Semua Sudah Beres & Bersih!"}
                  </h4>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 max-w-xs mx-auto">
                    {showHistory
                      ? "Notifikasi yang Anda hapus akan tercatat di sini dan tersimpan aman di Supabase."
                      : role === "yl"
                      ? "Seluruh Realisasi Potensi telah terisi sesuai acuan."
                      : "Tidak ada ulang tahun dalam 7 hari ke depan, dan seluruh Realisasi Potensi telah terisi sesuai acuan."}
                  </p>
                </div>
              )}

              {!isLoading &&
                displayedNotifications.map((notif) => {
                  const isBirthday = notif.category === "birthday";
                  const isExpanded = !!expandedCards[notif.id];

                  return (
                    <div
                      key={notif.id}
                      className={`rounded-2xl border p-3.5 transition-all shadow-xs ${
                        isBirthday
                          ? "bg-gradient-to-br from-rose-50/70 via-white to-pink-50/50 dark:from-rose-950/20 dark:via-neutral-800 dark:to-pink-950/10 border-rose-200 dark:border-rose-900/40"
                          : "bg-white dark:bg-neutral-800/90 border-neutral-200 dark:border-neutral-700/70 hover:border-amber-300 dark:hover:border-amber-700/60"
                      }`}
                    >
                      {/* Top Bar of Card */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2.5">
                          <div
                            className={`p-2 rounded-xl shrink-0 mt-0.5 shadow-xs ${
                              isBirthday
                                ? "bg-rose-500 text-white"
                                : "bg-amber-500 text-white"
                            }`}
                          >
                            {isBirthday ? <Cake className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                          </div>

                          <div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-neutral-900 dark:bg-neutral-950 text-white">
                                Area {notif.area}
                              </span>
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${notif.badgeColor}`}
                              >
                                {notif.badgeText}
                              </span>
                            </div>

                            <h4 className="font-bold text-xs sm:text-sm text-neutral-900 dark:text-neutral-100 mt-1 leading-snug">
                              {notif.title}
                            </h4>
                            <p className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 mt-0.5">
                              {notif.subtitle}
                            </p>
                          </div>
                        </div>

                        {/* Dismiss or Restore Button */}
                        <div className="flex items-center gap-1 shrink-0">
                          {showHistory ? (
                            <button
                              onClick={() => handleRestore(notif.id)}
                              className="p-1.5 text-neutral-400 hover:text-emerald-600 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-all cursor-pointer"
                              title="Pulihkan notifikasi ini ke daftar aktif"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleDismiss(notif.id)}
                              className="p-1.5 text-neutral-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-all cursor-pointer"
                              title="Hapus / Tutup notifikasi ini"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Detail Section for Potensi (Expandable) */}
                      {!isBirthday && notif.details && notif.details.length > 0 && (
                        <div className="mt-2.5 pt-2 border-t border-neutral-100 dark:border-neutral-700/60">
                          <button
                            onClick={() => toggleExpand(notif.id)}
                            className="text-[11px] font-bold text-amber-700 dark:text-amber-400 hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            <span>{isExpanded ? "Sembunyikan Rincian Tanggal" : `Lihat ${notif.details.length} Tanggal Bermasalah`}</span>
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>

                          {isExpanded && (
                            <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto pr-1">
                              {notif.details.map((d, dIdx) => {
                                const isKosong = d.type === "empty";
                                return (
                                  <div
                                    key={dIdx}
                                    className={`p-2 rounded-xl text-[11px] font-mono border flex items-center justify-between ${
                                      isKosong
                                        ? "bg-rose-50/80 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/40 text-rose-800 dark:text-rose-200"
                                        : "bg-amber-50/80 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/40 text-amber-900 dark:text-amber-200"
                                    }`}
                                  >
                                    <div>
                                      <span className="font-bold font-sans bg-neutral-900 dark:bg-neutral-950 text-white px-1.5 py-0.5 rounded text-[10px] mr-1.5">
                                        Tgl {d.date}
                                      </span>
                                      <span>
                                        {isKosong ? "Belum Diisi (Potensi 0)" : `Selisih: ${d.aktual} vs Acuan ${d.acuan}`}
                                      </span>
                                    </div>
                                    <div className="text-right text-[10px] font-sans font-bold">
                                      {isKosong ? (
                                        <span className="text-rose-600 dark:text-rose-400">Acuan: {d.acuan} btl</span>
                                      ) : (
                                        <span className="text-amber-700 dark:text-amber-300">
                                          Δ {d.selisih && d.selisih > 0 ? `+${d.selisih}` : d.selisih} btl
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Friendly Birthday Greeting Note */}
                      {isBirthday && (
                        <div className="mt-2.5 pt-2 border-t border-rose-100 dark:border-rose-900/30 flex items-center gap-1.5 text-[11px] text-rose-800 dark:text-rose-300">
                          <Sparkles className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                          <span>
                            {notif.daysRemaining === 0
                              ? "Berikan ucapan selamat ulang tahun & semangat target hari ini!"
                              : `Siapkan ucapan selamat ulang tahun untuk ${notif.nama} dalam ${notif.daysRemaining} hari kedepan.`}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-neutral-50 dark:bg-neutral-800/80 border-t border-neutral-200 dark:border-neutral-700 flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
              <span className="text-[10px]">
                ☁️ Riwayat hapus tersinkron ke Supabase Cloud
              </span>
              {showHistory && dismissedIds.length > 0 && (
                <button
                  onClick={handleRestoreAll}
                  className="text-red-600 dark:text-red-400 font-bold hover:underline cursor-pointer text-[11px]"
                >
                  Pulihkan Semua
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
