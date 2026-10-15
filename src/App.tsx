import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { KeyRound, Lock, } from "lucide-react";
import JossLogo from "./components/JossLogo";
import { Transaction, MotivasiConfig, KontesRow, DashboardData, EvaluasiData } from "./types";
import { safeFetchJson, parseJsonResponse } from "./lib/safeFetch";
import {
  getStoredManagerPin,
  getStoredYlPins,
  getStoredYlList,
  saveStoredYlData
} from "./lib/storage";
import {
  getFallbackDashboardData,
  getFallbackEvaluasiData
} from "./lib/fallbackData";
import { resetSupabaseClient } from "./lib/supabaseClient";

// Lazy-loaded: masing-masing hanya di-download & di-parse browser saat memang
// akan dirender (setelah login berhasil dan role diketahui). Sebelumnya semua
// diimpor langsung (eager) di atas, jadi seorang YL ikut mendownload seluruh
// kode ManagerView (3900+ baris + library chart recharts) padahal tidak
// pernah dipakainya — salah satu penyebab app berat di HP entry-level.
const ManagerView = lazy(() =>
  import("./components/ManagerView")
    .then(m => ({ default: m.ManagerView }))
    .catch((err) => {
      console.warn("Chunk loading error, reloading...", err);
      window.location.reload();
      return { default: () => null };
    })
);

const YLView = lazy(() =>
  import("./components/YLView")
    .then(m => ({ default: m.YLView }))
    .catch((err) => {
      console.warn("Chunk loading error, reloading...", err);
      window.location.reload();
      return { default: () => null };
    })
);

const AIChatBot = lazy(() => 
  import("./components/AIChatBot")
    .catch((err) => {
      console.warn("Chunk loading error, reloading...", err);
      window.location.reload();
      return { default: () => null };
    })
);

// Fallback ringan selagi chunk sedang di-download (biasanya sekejap di HP
// dgn koneksi normal, tapi tetap perlu ada agar tidak blank/error).
function ViewLoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center text-sm text-neutral-400">
      Memuat...
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState<{ role: "manager" | "yl"; name: string; viewAsFrom?: "manager" } | null>(null);
  const [pinInput, setPinInput] = useState<string>("");
  const [loginError, setLoginError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);

  // Theme support (light/dark)
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "dark" || saved === "light") return saved;
    // Belum pernah memilih: ikuti pengaturan gelap/terang HP
    try {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch {
      return "light";
    }
  });

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    // Warna status bar HP ikut tema (sama dengan navbar: putih / neutral-900)
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "dark" ? "#171717" : "#ffffff");
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === "light" ? "dark" : "light");

  // Global Datasets
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(() => getFallbackDashboardData());
  const [evaluasiData, setEvaluasiData] = useState<EvaluasiData | null>(() => getFallbackEvaluasiData());
  const [ylList, setYlList] = useState<any[]>(() => getStoredYlList());
  const [scriptUrl, setScriptUrl] = useState<string>("");
  const [motivasiConfig, setMotivasiConfig] = useState<MotivasiConfig>(() => {
    try {
      const saved = localStorage.getItem("yakult_motivasi_config");
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {
      list: [],
      terpilih: [],
      intervalDetik: 30,
      enabled: true,
      chatbotName: "AI Jember 1 Pro",
      tkuName: "DP Jember 1"
    };
  });
  const [kontesConfig, setKontesConfig] = useState<{ enabled: boolean; rows: KontesRow[] }>({
    enabled: true,
    rows: []
  });

  // Simulator fallbacks (for local copy)
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [targetYL, setTargetYL] = useState<any[]>([]);
  const [breakdownRealisasi, setBreakdownRealisasi] = useState<any[]>([]);
  const [tanggalValid, setTanggalValid] = useState<string[]>([]);

  // System PIN dictionary (fetched from server or LocalStorage)
  const [activeManagerPin, setActiveManagerPin] = useState<string>(() => getStoredManagerPin());
  const [activeYlPins, setActiveYlPins] = useState<Record<string, string>>(() => getStoredYlPins());
  
  // FIX (1 Sep 2026): dulu globalMonth SELALU di-set ulang dari new Date() setiap kali
  // App di-mount (setiap refresh/login ulang). Akibatnya begitu tanggal device berganti
  // bulan (mis. 31 Agu -> 1 Sep), seluruh tampilan otomatis "lompat" ke bulan baru walau
  // data bulan sebelumnya belum selesai/di-Finish — sehingga PLG PJL & Realisasi Potensi
  // YL bulan lama terlihat hilang (padahal datanya masih ada, cuma tidak lagi diminta).
  // Sekarang globalMonth disimpan di localStorage dan dipulihkan saat App dibuka lagi,
  // jadi bulan yang sedang dilihat manajer TIDAK berubah sendiri hanya karena kalender
  // device berganti. Bulan baru hanya aktif kalau user sendiri yang memilihnya lewat
  // date-picker "Pilih Bulan Data Aktif" di header, atau lewat "Selesaikan & Arsipkan".
  const [globalMonth, setGlobalMonth] = useState<string>(() => {
    try {
      const saved = localStorage.getItem("yakult_global_month");
      if (saved && /^\d{4}-\d{2}$/.test(saved)) return saved;
    } catch (e) {
      // localStorage tidak tersedia (mis. private mode) — abaikan, pakai fallback di bawah.
    }
    return new Date().toISOString().substring(0, 7);
  });

  useEffect(() => {
    try {
      localStorage.setItem("yakult_global_month", globalMonth);
    } catch (e) {
      // abaikan kalau localStorage penuh/diblokir; tidak fatal.
    }
  }, [globalMonth]);

  // FIX (1 Sep 2026): globalMonth dulu murni localStorage per-device, sehingga
  // HP Manager & HP tiap YL bisa menampilkan bulan aktif yang berbeda-beda
  // (mis. HP Manager masih di Agustus krn dipilih manual, HP YL default ke
  // tanggal kalender device-nya sendiri yaitu September yang datanya belum
  // diisi -> YL merasa data "hilang" padahal cuma beda bulan yang ditampilkan).
  // Sekarang bulan aktif disinkronkan lewat server (db.globalMonth):
  // - updateGlobalMonth: dipakai Manager saat pilih bulan -> push ke server.
  // - saat refreshAllData polling, ambil /api/getGlobalMonth & samakan semua
  //   device (termasuk YL) ke bulan yang sama tanpa perlu memilih manual.
  const updateGlobalMonth = async (month: string) => {
    setGlobalMonth(month);
    try {
      await safeFetchJson("/api/saveGlobalMonth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ globalMonth: month })
      });
    } catch (e) {
      // Offline/gagal kirim ke server - device ini tetap pakai bulan yang dipilih
      // secara lokal, akan tersinkron lagi otomatis saat polling berikutnya berhasil.
    }
  };

  const AUTO_LOGOUT_SECONDS = 300; // 5 menit: logout bila aplikasi ditutup/di-background lebih dari ini

  // 1. Initial Load & Session Recovery
  useEffect(() => {
    const checkAutoLogout = () => {
      const lastActive = localStorage.getItem("lastActiveTimestamp");
      if (lastActive) {
        const diffSeconds = (Date.now() - parseInt(lastActive, 10)) / 1000;
        if (diffSeconds > AUTO_LOGOUT_SECONDS) {
          setSession(null);
          localStorage.removeItem("yakult_session");
          localStorage.removeItem("lastActiveTimestamp");
          setTransactions([]);
          setTargetYL([]);
          setDashboardData(getFallbackDashboardData());
          setEvaluasiData(getFallbackEvaluasiData());
          return true; // Sesi di-logout
        }
      }
      return false; // Sesi masih aman
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        // App masuk background / layar mati, catat waktunya
        localStorage.setItem("lastActiveTimestamp", Date.now().toString());
      } else if (document.visibilityState === "visible") {
        // App aktif kembali, cek apakah butuh logout
        const wasLoggedOut = checkAutoLogout();
        if (!wasLoggedOut) {
          // Kalau belum waktunya logout, hapus timestamp karena sekarang aktif
          localStorage.setItem("lastActiveTimestamp", Date.now().toString());
        }
      }
    };

    const handleBeforeUnload = () => {
      localStorage.setItem("lastActiveTimestamp", Date.now().toString());
    };
    // WebView sering tidak memicu beforeunload saat aplikasi ditutup; pagehide lebih andal
    window.addEventListener("pagehide", handleBeforeUnload);

    // Listeners
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    // Initial Check saat aplikasi baru dibuka
    const isLoggedOut = checkAutoLogout();

    if (!isLoggedOut) {
      const saved = localStorage.getItem("yakult_session");
      if (saved) {
        try {
          setSession(JSON.parse(saved));
        } catch (e) {
          localStorage.removeItem("yakult_session");
        }
      }
      // Set timestamp saat ini agar aman
      localStorage.setItem("lastActiveTimestamp", Date.now().toString());
    }

    // Ping / update timestamp setiap 10 detik selama app terbuka & aktif
    // (Bermanfaat jika browser/webview force-close tanpa event beforeunload/visibilitychange)
    const pingInterval = setInterval(() => {
      if (document.visibilityState === "visible") {
        localStorage.setItem("lastActiveTimestamp", Date.now().toString());
      }
    }, 5000);

    // Load PIN dictionary and script url from backend

    Promise.all([
      safeFetchJson("/api/getPins"),
      safeFetchJson("/api/getScriptUrl"),
      safeFetchJson("/api/getMotivasi"),
      safeFetchJson("/api/getYlList"),
      safeFetchJson("/api/getSupabaseConfig")
    ])
      .then(([pins, scr, mot, ylData, sbConf]) => {
        if (sbConf && sbConf.url && sbConf.key) {
          localStorage.setItem("supabase_url", sbConf.url);
          localStorage.setItem("supabase_key", sbConf.key);
          resetSupabaseClient();
        }
        const mgrPin = pins?.managerPin || getStoredManagerPin();
        const ylPinsMap = (pins?.ylPins && Object.keys(pins.ylPins).length > 0)
          ? pins.ylPins
          : getStoredYlPins();

        setActiveManagerPin(mgrPin);
        setActiveYlPins(ylPinsMap);

        if (ylData && Array.isArray(ylData.ylList) && ylData.ylList.length > 0) {
          saveStoredYlData(ylData.ylList, mgrPin);
        } else {
          saveStoredYlData(getStoredYlList(), mgrPin);
        }

        if (scr && scr.scriptUrl) setScriptUrl(scr.scriptUrl);
        if (mot) {
          setMotivasiConfig(prev => {
            const updated = {
              ...prev,
              ...mot,
              chatbotName: prev.chatbotName || mot.chatbotName || "AI Jember 1 Pro",
              tkuName: prev.tkuName || mot.tkuName || "DP Jember 1"
            };
            try {
              localStorage.setItem("yakult_motivasi_config", JSON.stringify(updated));
            } catch (e) {}
            return updated;
          });
        }
      })
      .catch(e => {
        console.error("Error loading configs:", e);
        setActiveManagerPin(getStoredManagerPin());
        setActiveYlPins(getStoredYlPins());
      })
      .finally(() => setLoading(false));

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handleBeforeUnload);
      clearInterval(pingInterval);
    };
  }, []);

  // 2. Fetch Datasets when session is active
  useEffect(() => {
    if (!session) return;
    refreshAllData();

    // Periodic auto-sync so name/setting changes propagate to all accounts/tabs.
    // Interval is longer than before (20s instead of 8s) and pauses entirely
    // while the app is in the background/screen off, since polling every 8s
    // on 6 endpoints was a major source of lag and battery/data drain on
    // low-end phones.
    let interval: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (interval) return;
      interval = setInterval(() => {
        refreshAllData(true);
      }, 20000);
    };

    const stopPolling = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        // Refresh immediately on return, then resume the interval
        refreshAllData(true);
        startPolling();
      }
    };

    if (!document.hidden) startPolling();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const handleBdUpdated = () => {
      refreshAllData(true);
    };
    window.addEventListener("bd_realisasi_updated", handleBdUpdated);

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("bd_realisasi_updated", handleBdUpdated);
    };
  }, [session, scriptUrl, globalMonth]);

  // Menyimpan JSON string hasil fetch terakhir per endpoint. Dipakai supaya
  // polling tiap 20 detik tidak memicu setState (dan render ulang ManagerView/
  // YLView yang berat) kalau ternyata datanya sama persis dengan sebelumnya —
  // ini kasus yang paling sering terjadi (tidak ada admin/YL lain yang baru
  // saja menyimpan sesuatu di 20 detik terakhir).
  const lastPayloadRef = useRef<Record<string, string>>({});
  const lastSlowPollRef = useRef<number>(0);
  const lastDataVersionRef = useRef<string>("");
  const lastManagerFetchRef = useRef<number>(0);

  const setIfChanged = <T,>(key: string, data: T, setter: (value: T) => void) => {
    const serialized = JSON.stringify(data);
    if (lastPayloadRef.current[key] === serialized) return false;
    lastPayloadRef.current[key] = serialized;
    setter(data);
    return true;
  };

  const refreshAllData = async (isBackground = false) => {
    if (!isBackground) {
      setLoading(true);
      lastPayloadRef.current = {};
    }

    try {
      const isYl = session?.role === "yl";
      const activeName = session?.name || "";
      const activeMonth = globalMonth || new Date().toISOString().substring(0, 7);

      // Optimasi Egress:
      // 1. Motivasi, Kontes, PINs, YL List sangat jarang berubah:
      //    Cukup di-poll setiap 2 menit jika background, atau saat refresh manual.
      // 2. Akun YL tidak butuh mengunduh dasbor tim & evaluasi manajer (~230KB) saat background polling.
      const now = Date.now();
      const shouldPollSlowConfigs = !isBackground || (now - lastSlowPollRef.current > 120000);
      if (shouldPollSlowConfigs) {
        lastSlowPollRef.current = now;
      }
      let shouldFetchManagerData = !isYl || !isBackground;

      // Hemat bandwidth: polling latar belakang manajer cukup tanya versi data (beberapa byte).
      // Dasbor + evaluasi (~230 KB) baru diunduh kalau versi berubah, atau paling lama tiap 2 menit
      // sebagai pengaman. Refresh manual / ganti bulan / kembali ke aplikasi selalu unduh penuh.
      if (!isYl) {
        const vRes = await safeFetchJson<{ v?: string }>("/api/getDataVersion");
        const ver = vRes?.v || "";
        const unchanged =
          isBackground && !!ver && ver === lastDataVersionRef.current &&
          now - lastManagerFetchRef.current < 120000;
        if (ver) lastDataVersionRef.current = ver;
        if (unchanged) shouldFetchManagerData = false;
      }
      if (shouldFetchManagerData) lastManagerFetchRef.current = now;

      const [db, ev, mot, knt, pins, ylListData, globalMonthData, mineData] = await Promise.all([
        shouldFetchManagerData ? safeFetchJson(`/api/getDashboardDP1?month=${globalMonth}`) : Promise.resolve(null),
        shouldFetchManagerData ? safeFetchJson(`/api/getEvaluasi?month=${globalMonth}`) : Promise.resolve(null),
        shouldPollSlowConfigs ? safeFetchJson("/api/getMotivasi") : Promise.resolve(null),
        shouldPollSlowConfigs ? safeFetchJson("/api/getKontes") : Promise.resolve(null),
        shouldPollSlowConfigs ? safeFetchJson("/api/getPins") : Promise.resolve(null),
        shouldPollSlowConfigs ? safeFetchJson("/api/getYlList") : Promise.resolve(null),
        safeFetchJson("/api/getGlobalMonth"),
        isYl && activeName
          ? safeFetchJson(`/api/getMine?nama=${encodeURIComponent(activeName)}&month=${encodeURIComponent(activeMonth)}`)
          : Promise.resolve(null)
      ]);

      // Samakan bulan aktif device ini dengan bulan aktif di server (yang terakhir
      // dipilih Manager) — supaya HP YL otomatis ikut bulan yang sama dgn Manager,
      // tidak lagi default ke tanggal kalender device-nya sendiri.
      if (globalMonthData && globalMonthData.globalMonth && /^\d{4}-\d{2}$/.test(globalMonthData.globalMonth)) {
        if (globalMonthData.globalMonth !== globalMonth) {
          setGlobalMonth(globalMonthData.globalMonth);
          // Jangan return early di sini agar data mineData & evaluasi tetap terpasang ke state,
          // sehingga tampilan tabel tidak blank saat menunggu siklus render berikutnya.
        }
      } else if (!isBackground) {
        // Server belum pernah punya globalMonth tersimpan (mis. pertama kali dipakai
        // setelah update ini) — inisialisasi dari bulan device ini (kemungkinan besar
        // device Manager yang baru saja login) supaya YL punya acuan.
        updateGlobalMonth(globalMonth);
      }

      if (db) {
        setIfChanged("dashboard", db, setDashboardData);
      } else if (!isBackground) {
        const activeDatasetMonth = (globalMonthData && globalMonthData.globalMonth) || globalMonth || "2026-07";
        const fallbackDb = getFallbackDashboardData(activeDatasetMonth);
        setIfChanged("dashboard", fallbackDb, setDashboardData);
      }

      if (ev) {
        const rawEv = ev && ev.evaluasiData ? ev.evaluasiData : (ev && ev.dataRows ? ev : null);
        const fallbackEv = getFallbackEvaluasiData(globalMonth || "2026-07");
        const finalEv = rawEv ? rawEv : fallbackEv;
        setIfChanged("evaluasi", finalEv, setEvaluasiData);
      }
      if (mot) {
        const motChanged = setIfChanged("motivasi", mot, () => {});
        if (motChanged) {
          setMotivasiConfig(prev => ({
            ...mot,
            chatbotName: mot.chatbotName || prev.chatbotName || "AI Jember 1 Pro",
            tkuName: mot.tkuName || prev.tkuName || "DP Jember 1"
          }));
        }
      }
      if (knt) setIfChanged("kontes", knt, setKontesConfig);
      if (pins && pins.managerPin) setIfChanged("managerPin", pins.managerPin, setActiveManagerPin);
      if (pins && pins.ylPins) setIfChanged("ylPins", pins.ylPins, setActiveYlPins);

      // Auto-update YL session name if YL was renamed in Setting/Profil YL
      if (isYl && activeName) {
        const ylListArray = (ylListData && Array.isArray(ylListData.ylList)) ? ylListData.ylList : [];
        setIfChanged("ylList", ylListArray, setYlList);

        const isValid = pins?.ylPins && Object.values(pins.ylPins).includes(session.name);
        if (pins?.ylPins && !isValid) {
          setSession(null);
          localStorage.removeItem("yakult_session");
          return;
        }

        // Apply specific YL records immediately
        if (mineData) {
          if (mineData.transactions) setIfChanged("myTransactions", mineData.transactions, setTransactions);
          if (mineData.targetYL) setIfChanged("myTargetYL", mineData.targetYL, setTargetYL);
          setIfChanged("myBreakdownRealisasi", mineData.breakdownRealisasi || [], setBreakdownRealisasi);
          setIfChanged("myTanggalValid", mineData.tanggalValid || [], setTanggalValid);
        }
      }
    } catch (e) {
      console.error("Error loading data:", e);
    } finally {
      if (!isBackground) setLoading(false);
    }
  };

  // 3. Login Flow (Server-Side Verified)
  const handleLogin = async () => {
    setLoginError("");
    const pin = pinInput.trim();
    if (!pin) return;

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin })
      });
      const data = await res.json().catch(() => null);

      if (res.ok && data && data.ok) {
        const newSession = {
          role: data.role as "manager" | "yl",
          name: data.role === "manager" ? "Manager DP Jember 1" : data.name
        };
        setSession(newSession);
        localStorage.setItem("yakult_session", JSON.stringify(newSession));
        setPinInput("");
        return;
      }

      // Fallback offline bila response bukan OK
      const mgrPin = activeManagerPin || getStoredManagerPin();
      const ylPinsMap = (activeYlPins && Object.keys(activeYlPins).length > 0)
        ? activeYlPins
        : getStoredYlPins();

      if (pin === mgrPin) {
        const newSession = { role: "manager" as const, name: "Manager DP Jember 1" };
        setSession(newSession);
        localStorage.setItem("yakult_session", JSON.stringify(newSession));
        setPinInput("");
      } else if (ylPinsMap[pin]) {
        const newSession = { role: "yl" as const, name: ylPinsMap[pin] };
        setSession(newSession);
        localStorage.setItem("yakult_session", JSON.stringify(newSession));
        setPinInput("");
      } else {
        setLoginError(data?.error || "PIN salah. Silakan coba kembali!");
        setPinInput("");
      }
    } catch (e) {
      // Offline fallback
      const mgrPin = activeManagerPin || getStoredManagerPin();
      const ylPinsMap = (activeYlPins && Object.keys(activeYlPins).length > 0)
        ? activeYlPins
        : getStoredYlPins();

      if (pin === mgrPin) {
        const newSession = { role: "manager" as const, name: "Manager DP Jember 1" };
        setSession(newSession);
        localStorage.setItem("yakult_session", JSON.stringify(newSession));
        setPinInput("");
      } else if (ylPinsMap[pin]) {
        const newSession = { role: "yl" as const, name: ylPinsMap[pin] };
        setSession(newSession);
        localStorage.setItem("yakult_session", JSON.stringify(newSession));
        setPinInput("");
      } else {
        setLoginError("PIN salah. Silakan coba kembali!");
        setPinInput("");
      }
    }
  };

  // Admin masuk ke akun YL tanpa PIN (hanya bisa dari sesi manager).
  // Sesi ini sengaja TIDAK disimpan ke localStorage: kalau aplikasi ditutup,
  // yang pulih adalah sesi admin, bukan akun YL.
  const handleImpersonateYl = (name: string) => {
    if (session?.role !== "manager" || !name) return;
    setTransactions([]);
    setTargetYL([]);
    setSession({ role: "yl", name, viewAsFrom: "manager" });
  };

  const handleBackToAdmin = () => {
    if (session?.viewAsFrom !== "manager") return;
    setTransactions([]);
    setTargetYL([]);
    setSession({ role: "manager", name: "Manager DP Jember 1" });
  };

  // Daftar nama YL (sama persis dengan nama di PIN, supaya sesi valid)
  const ylAccountNames = Array.from(new Set(Object.values(activeYlPins || {}).filter(Boolean) as string[]))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  // 4. Logout Flow
  const handleLogout = () => {
    setSession(null);
    localStorage.removeItem("yakult_session");
    setTransactions([]);
    setTargetYL([]);
    setDashboardData(getFallbackDashboardData());
    setEvaluasiData(getFallbackEvaluasiData());
    lastPayloadRef.current = {};
  };

  // 5. Save Report Transaction (YL view)
  const handleSaveTransaction = async (data: Transaction) => {
    try {
      const res = await fetch("/api/saveTransaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      const resJson = await parseJsonResponse(res);

      if (res.ok && resJson && resJson.ok) {
        await refreshAllData();
        return { ok: true };
      }
      return { ok: false, alreadyExists: resJson?.alreadyExists, error: resJson?.error || "Gagal menyimpan laporan." };
    } catch (e: any) {
      console.error(e);
      return { ok: false, error: e.message || "Terjadi kesalahan jaringan." };
    }
  };

  // 6. Save Target / Divisor config (YL view)
  const handleSaveTargetYL = async (data: any) => {
    try {
      const res = await fetch("/api/saveTargetYL", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      const resJson = await parseJsonResponse(res);

      if (res.ok && resJson && resJson.ok) {
        await refreshAllData();
        return true;
      }
      return false;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  // 7. Save Web App script url
  const handleSaveScriptUrl = async (url: string) => {
    try {
      await fetch("/api/saveScriptUrl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptUrl: url })
      });
      setScriptUrl(url);
      alert("Script URL berhasil diperbarui! Mencoba memuat ulang data...");
    } catch (e) {
      alert("Gagal memperbarui URL.");
    }
  };

  // 8. Save Motivasi Config (chatbotName & tkuName)
  const handleSaveMotivasiConfig = async (newConfig: MotivasiConfig) => {
    // 1. Instantly save locally
    setMotivasiConfig(newConfig);
    try {
      localStorage.setItem("yakult_motivasi_config", JSON.stringify(newConfig));
    } catch (e) {}

    // 2. Persist to server if available
    try {
      const res = await fetch("/api/saveMotivasi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newConfig)
      });
      const json = await parseJsonResponse(res);

      if (res.ok && json?.ok) {
        alert("Pengaturan nama berhasil disimpan!");
      } else {
        alert("Pengaturan nama berhasil disimpan secara lokal!");
      }
    } catch (e: any) {
      console.warn("Server sync error, saved locally:", e);
      alert("Pengaturan nama berhasil disimpan secara lokal!");
    }
  };

  if (loading && !session) {
    return (
      <div className="min-h-[100dvh] bg-neutral-50 dark:bg-neutral-950 flex flex-col items-center justify-center text-neutral-800 dark:text-neutral-100">
        <div className="w-10 h-10 border-4 border-brand-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs font-bold text-neutral-500 mt-3 uppercase tracking-wider">Memuat Sistem Jember 1...</p>
      </div>
    );
  }

  // LOGIN SCREEN RENDER
  if (!session) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-neutral-100 dark:bg-neutral-950 p-4 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_50%_36%,rgba(29,79,145,0.07),transparent_58%)]" />
        <div className="bg-white dark:bg-neutral-900 rounded-[1.75rem] max-w-sm w-full text-center shadow-[0_18px_48px_-20px_rgba(23,37,56,0.28)] border border-neutral-200 dark:border-neutral-800 relative z-10 overflow-hidden">
          <div className="px-6 pt-7 pb-6 bg-[#0C2D57] text-white">
            <div className="flex justify-center mb-3">
              <JossLogo size={76} animated inverted className="drop-shadow-sm" />
            </div>
            <h1 className="text-base sm:text-lg font-bold tracking-tight text-white uppercase">
              JEMBER OPERATION SALES SYSTEM
            </h1>
            <p className="text-[11px] text-blue-100 font-semibold uppercase tracking-wide mt-1">
              {motivasiConfig?.tkuName || "DP Jember 1"}
            </p>
          </div>

          <div className="p-6 sm:p-7 space-y-4">
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                <Lock className="h-4 w-4 text-brand-600 dark:text-brand-400" />
              </span>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ""))}
                placeholder="Masukkan PIN Anda"
                className="w-full pl-9 pr-3 py-3 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100 rounded-xl text-center text-xl font-bold tracking-widest outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 dark:focus:ring-brand-900/40 transition-all placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleLogin();
                }}
                autoFocus
              />
            </div>

            {loginError && (
              <p className="text-xs text-rose-600 font-bold text-center animate-shake">{loginError}</p>
            )}

            <button
              onClick={handleLogin}
              className="w-full bg-brand-600 hover:bg-brand-700 text-white font-bold py-3.5 rounded-xl text-xs uppercase tracking-wider transition-all shadow-md shadow-brand-900/15 active:scale-[0.99] cursor-pointer"
            >
              Masuk ke Aplikasi
            </button>

            <div className="pt-1 flex justify-center items-center gap-1.5 text-[10px] text-neutral-500 font-semibold">
              <KeyRound className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
              <span>Sandi &amp; PIN dienkripsi server</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // MANAGER VIEW RENDER
  if (session.role === "manager") {
    return (
      <div className={`min-h-screen bg-neutral-100/60 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 transition-colors ${theme === "dark" ? "dark" : ""}`}>
        <Suspense fallback={<ViewLoadingFallback />}>
          <ManagerView
            onLogout={handleLogout}
            ylAccounts={ylAccountNames}
            onImpersonateYl={handleImpersonateYl}
            globalMonth={globalMonth}
            setGlobalMonth={updateGlobalMonth}
            dashboardData={dashboardData}
            evaluasiData={evaluasiData}
            onRefresh={refreshAllData}
            isRefreshing={loading}
            motivasiConfig={motivasiConfig}
            onUpdateMotivasi={handleSaveMotivasiConfig}
            kontesConfig={kontesConfig}
            scriptUrl={scriptUrl}
            onSaveScriptUrl={handleSaveScriptUrl}
            theme={theme}
            onToggleTheme={toggleTheme}
          />
          <AIChatBot role={session.role} userName={session.name} botName={motivasiConfig?.chatbotName || "AI Jember 1 Pro"} />
        </Suspense>
      </div>
    );
  }

  // YAKULT LADY VIEW RENDER
  return (
    <div className={`min-h-screen bg-neutral-100/60 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 transition-colors ${theme === "dark" ? "dark" : ""}`}>
      <Suspense fallback={<ViewLoadingFallback />}>
        <YLView
          ylName={session.name}
          ylList={ylList}
          onLogout={handleLogout}
          onBackToAdmin={session.viewAsFrom === "manager" ? handleBackToAdmin : undefined}
          globalMonth={globalMonth}
          setGlobalMonth={updateGlobalMonth}
          evaluasiData={evaluasiData}
          onRefresh={refreshAllData}
          isRefreshing={loading}
          transactions={transactions}
          targetYL={targetYL}
          breakdownRealisasi={breakdownRealisasi}
          tanggalValid={tanggalValid}
          onSaveTransaction={handleSaveTransaction}
          onSaveTargetYL={handleSaveTargetYL}
          motivasiConfig={motivasiConfig}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
        <AIChatBot role={session.role} userName={session.name} botName={motivasiConfig?.chatbotName || "AI Jember 1 Pro"} />
      </Suspense>
    </div>
  );
}