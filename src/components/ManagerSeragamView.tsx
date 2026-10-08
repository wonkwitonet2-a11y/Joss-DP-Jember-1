import React, { useState, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, Upload, Save, Info, Settings, ArrowLeft } from "lucide-react";

const MTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

const DAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

const UNIFORMS_YL = [
  { id: "yellow", name: "Yakult Mangga", color: "bg-amber-400" },
  { id: "blue", name: "Yakult Light", color: "bg-blue-600" },
  { id: "red", name: "Yes Everyday", color: "bg-red-600" }
];

const UNIFORMS_KARYAWAN = [
  { id: "karyawan_yellow", name: "Yakult Mangga", color: "bg-amber-400", desc: "Seragam Yakult Mangga" },
  { id: "karyawan_blue", name: "Yakult Light", color: "bg-blue-600", desc: "Seragam Yakult Light" },
  { id: "karyawan_red", name: "CU Merah", color: "bg-red-600", desc: "Seragam CU Merah" },
  { id: "karyawan_default", name: "Seragam Biasa", color: "bg-slate-400", desc: "Seragam Biasa" }
];

export default function ManagerSeragamView() {
  const [viewMode, setViewMode] = useState<"today" | "setting">("today");
  const [settingTab, setSettingTab] = useState<"karyawan" | "yl">("karyawan");

  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentDate, setCurrentDate] = useState(new Date());

  const [images, setImages] = useState<any>({});
  const [schedules, setSchedules] = useState<any>({});
  const [schedulesKaryawan, setSchedulesKaryawan] = useState<any>({});
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/getSeragam").then(r => r.json())
      .then(data => {
        setImages(data.images || {});
        setSchedules(data.schedules || {});
        setSchedulesKaryawan(data.schedulesKaryawan || {});
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  const monthKey = `${currentYear}-${(currentMonth + 1).toString().padStart(2, "0")}`;
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const scheduleYL = schedules[monthKey] || {};
  const scheduleK = schedulesKaryawan[monthKey] || {};

  const [rawDatesYL, setRawDatesYL] = useState<Record<string, string>>({});
  const [rawDatesKaryawan, setRawDatesKaryawan] = useState<Record<string, string>>({});
  const lastSyncMonthRef = useRef<string>("");

  // Sync raw input strings when month changes or data loads
  useEffect(() => {
    if (!loading) {
      const initYL: Record<string, string> = {};
      ["yellow", "blue", "red"].forEach(uId => {
        const dates: number[] = [];
        for (let i = 1; i <= daysInMonth; i++) {
          if (scheduleYL[i] === uId) dates.push(i);
        }
        initYL[uId] = dates.join(", ");
      });
      setRawDatesYL(initYL);

      const initK: Record<string, string> = {};
      ["karyawan_yellow", "karyawan_blue", "karyawan_red"].forEach(uId => {
        const dates: number[] = [];
        for (let i = 1; i <= daysInMonth; i++) {
          if (scheduleK[i] === uId) dates.push(i);
        }
        initK[uId] = dates.join(", ");
      });
      setRawDatesKaryawan(initK);
      lastSyncMonthRef.current = monthKey;
    }
  }, [monthKey, daysInMonth, loading]);

  // For YL
  const getDatesStringYL = (uniformId: string) => {
    if (rawDatesYL[uniformId] !== undefined) return rawDatesYL[uniformId];
    const dates = [];
    for (let i = 1; i <= daysInMonth; i++) {
      if (scheduleYL[i] === uniformId) dates.push(i);
    }
    return dates.join(", ");
  };

  const handleDatesChangeYL = (uniformId: string, val: string) => {
    // Keep user's exact typed string so commas and spaces are never swallowed
    setRawDatesYL(prev => ({ ...prev, [uniformId]: val }));
    const parts = val.split(",").map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n >= 1 && n <= daysInMonth);
    setSchedules((prev: any) => {
      const monthSched = { ...(prev[monthKey] || {}) };
      for (let i = 1; i <= daysInMonth; i++) {
        if (monthSched[i] === uniformId) delete monthSched[i];
      }
      parts.forEach(d => { monthSched[d] = uniformId; });
      return { ...prev, [monthKey]: monthSched };
    });
  };

  const handleDatesBlurYL = (uniformId: string) => {
    // Normalize format on blur
    const dates: number[] = [];
    for (let i = 1; i <= daysInMonth; i++) {
      if (schedules[monthKey]?.[i] === uniformId) dates.push(i);
    }
    setRawDatesYL(prev => ({ ...prev, [uniformId]: dates.join(", ") }));
  };

  // For Karyawan
  const getDatesStringKaryawan = (uniformId: string) => {
    if (rawDatesKaryawan[uniformId] !== undefined) return rawDatesKaryawan[uniformId];
    const dates = [];
    for (let i = 1; i <= daysInMonth; i++) {
      if (scheduleK[i] === uniformId) dates.push(i);
    }
    return dates.join(", ");
  };

  const handleDatesChangeKaryawan = (uniformId: string, val: string) => {
    // Keep user's exact typed string so commas and spaces are never swallowed
    setRawDatesKaryawan(prev => ({ ...prev, [uniformId]: val }));
    const parts = val.split(",").map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n >= 1 && n <= daysInMonth);
    setSchedulesKaryawan((prev: any) => {
      const monthSched = { ...(prev[monthKey] || {}) };
      for (let i = 1; i <= daysInMonth; i++) {
        if (monthSched[i] === uniformId) delete monthSched[i];
      }
      parts.forEach(d => { monthSched[d] = uniformId; });
      return { ...prev, [monthKey]: monthSched };
    });
  };

  const handleDatesBlurKaryawan = (uniformId: string) => {
    // Normalize format on blur
    const dates: number[] = [];
    for (let i = 1; i <= daysInMonth; i++) {
      if (schedulesKaryawan[monthKey]?.[i] === uniformId) dates.push(i);
    }
    setRawDatesKaryawan(prev => ({ ...prev, [uniformId]: dates.join(", ") }));
  };

  const save = async () => {
    setSaving(true);
    try {
      await fetch("/api/saveSeragam", { 
        method: "POST", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify({ schedules, schedulesKaryawan }) 
      });
      alert("Jadwal berhasil disimpan!");
    } catch (e) {
      alert("Gagal menyimpan jadwal.");
    }
    setSaving(false);
  };

  const handleImageUpload = (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const MAX_WIDTH = 400;
        let w = img.width;
        let h = img.height;
        if (w > MAX_WIDTH) {
          h = Math.floor(h * (MAX_WIDTH / w));
          w = MAX_WIDTH;
        }
        canvas.width = w;
        canvas.height = h;
        ctx?.drawImage(img, 0, 0, w, h);
        const compressed = canvas.toDataURL("image/png");
        
        setImages((prev: any) => ({ ...prev, [id]: compressed }));
        
        try {
          await fetch("/api/saveSeragam", { 
            method: "POST", 
            headers: { "Content-Type": "application/json" }, 
            body: JSON.stringify({ images: { [id]: compressed } }) 
          });
        } catch(err) {
          console.error(err);
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  if (loading) return <div className="p-8 text-center text-slate-500 dark:text-slate-400">Memuat data...</div>;

  // View Today (Karyawan)
  if (viewMode === "today") {
    const todayMonthKey = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, "0")}`;
    const todayDay = currentDate.getDate();
    const todaySchedule = schedulesKaryawan[todayMonthKey] || {};
    const assigned = todaySchedule[todayDay] || "karyawan_default";
    
    const uniformInfo = UNIFORMS_KARYAWAN.find(u => u.id === assigned) || UNIFORMS_KARYAWAN[2];
    const imageSrc = images[uniformInfo.id];

    const isToday = currentDate.toDateString() === new Date().toDateString();

    const handlePrev = () => {
      const prev = new Date(currentDate);
      prev.setDate(prev.getDate() - 1);
      setCurrentDate(prev);
    };
      
    const handleNext = () => {
      const next = new Date(currentDate);
      next.setDate(next.getDate() + 1);
      setCurrentDate(next);
    };

    const handleToday = () => {
      setCurrentDate(new Date());
    };

    const minSwipeDistance = 50;
    
    const onTouchStart = (e: React.TouchEvent) => {
      setTouchEnd(null);
      setTouchStart(e.targetTouches[0].clientX);
    };

    const onTouchMove = (e: React.TouchEvent) => {
      setTouchEnd(e.targetTouches[0].clientX);
    };

    const onTouchEnd = () => {
      if (!touchStart || !touchEnd) return;
      const distance = touchStart - touchEnd;
      const isLeftSwipe = distance > minSwipeDistance;
      const isRightSwipe = distance < -minSwipeDistance;
      
      if (isLeftSwipe) {
        handleNext();
      } else if (isRightSwipe) {
        handlePrev();
      }
    };

    return (
      <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950 sm:max-w-md sm:mx-auto sm:border-x sm:border-slate-200 dark:border-slate-700 pb-32">
        <div className="flex items-center justify-between p-4 pb-2">
          <h1 className="font-bold text-xl text-slate-800 dark:text-slate-100 flex items-center gap-2">
            Jadwal Seragam
          </h1>
          <div className="flex items-center gap-2">
            <button onClick={handleToday} className="p-2.5 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 hover:bg-slate-50 transition-colors">
              <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Hari Ini</span>
            </button>
            <button onClick={() => setViewMode("setting")} className="p-2.5 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 hover:bg-slate-50 transition-colors">
              <Settings className="w-5 h-5 text-slate-700 dark:text-slate-300" />
            </button>
          </div>
        </div>

        <div className="px-4 pb-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 flex items-center justify-between p-2">
            <button onClick={handlePrev} className="p-2 text-slate-400 hover:text-slate-600 dark:text-slate-400 active:bg-slate-50 rounded-xl">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex flex-col items-center">
              <span className="font-bold text-slate-700 dark:text-slate-300 text-sm">
                {DAYS[currentDate.getDay()]}, {todayDay} {MTHS[currentDate.getMonth()]} {currentDate.getFullYear()}
              </span>
              {isToday && <span className="text-[10px] font-bold text-red-500">Hari ini</span>}
            </div>
            <button onClick={handleNext} className="p-2 text-slate-400 hover:text-slate-600 dark:text-slate-400 active:bg-slate-50 rounded-xl">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 px-4 flex flex-col" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
          <div className="bg-white dark:bg-slate-900 rounded-[32px] shadow-sm border border-slate-200 dark:border-slate-800 p-6 flex flex-col items-center text-center flex-1">
            <div className="bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs font-bold px-3 py-1 rounded-full mb-6 flex items-center gap-1">
              👕 Seragam Karyawan Hari Ini
            </div>
            
            <div className="flex-1 flex items-center justify-center w-full min-h-[200px] mb-6">
              {imageSrc ? (
                <img src={imageSrc} className="max-w-[80%] max-h-[300px] object-contain drop-shadow-xl" alt={uniformInfo.name} />
              ) : (
                <div className="w-48 h-48 bg-slate-100 dark:bg-slate-800 rounded-full flex flex-col items-center justify-center text-slate-400">
                  <span className="text-4xl mb-2">📸</span>
                  <span className="text-xs">Gambar belum diupload</span>
                </div>
              )}
            </div>
            
            <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 mb-2">{uniformInfo.name}</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed max-w-[250px]">{uniformInfo.desc}</p>
          </div>
        </div>
      </div>
    );
  }

  // View Setting
  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto pb-32">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => setViewMode("today")} className="p-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:bg-slate-50 transition-colors">
          <ArrowLeft className="w-5 h-5 text-slate-700 dark:text-slate-300" />
        </button>
        <h1 className="font-bold text-2xl text-slate-800 dark:text-slate-100">Pengaturan Seragam</h1>
      </div>

      <div className="flex bg-slate-200/50 dark:bg-slate-800 p-1 rounded-xl mb-6">
        <button 
          onClick={() => setSettingTab("karyawan")}
          className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-colors ${settingTab === "karyawan" ? "bg-white dark:bg-slate-900 text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}`}
        >
          Seragam Karyawan
        </button>
        <button 
          onClick={() => setSettingTab("yl")}
          className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-colors ${settingTab === "yl" ? "bg-white dark:bg-slate-900 text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}`}
        >
          Seragam YL
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 mb-8 overflow-hidden">
        <div className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 p-4 font-bold text-slate-800 dark:text-slate-100">
          Upload Gambar Seragam {settingTab === "karyawan" ? "Karyawan" : "YL"}
        </div>
        <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
          {(settingTab === "yl" ? [...UNIFORMS_YL, { id: "default", name: "Pakaian Bebas", color: "bg-slate-400" }] : UNIFORMS_KARYAWAN).map(u => (
            <div key={u.id} className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 flex flex-col items-center">
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2 text-center">{u.name}</p>
              <div className="w-20 h-20 sm:w-24 sm:h-24 bg-slate-100 dark:bg-white/10 rounded-md mb-3 flex items-center justify-center overflow-hidden">
                {images[u.id] ? (
                  <img src={images[u.id]} className="w-full h-full object-contain drop-shadow-md" alt={u.name} />
                ) : (
                  <span className="text-slate-400 text-[10px] sm:text-xs">Kosong</span>
                )}
              </div>
              <label className="cursor-pointer bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 text-xs py-1.5 px-3 rounded-full flex items-center gap-1 transition-colors">
                <Upload className="w-3 h-3" /> Upload
                <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(u.id, e)} />
              </label>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 p-4 flex items-center justify-between">
          <button 
            onClick={() => {
              if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y-1); }
              else setCurrentMonth(m => m-1);
            }}
            className="p-2 hover:bg-slate-200 rounded-full"
          >
            <ChevronLeft className="w-5 h-5 text-slate-600 dark:text-slate-400" />
          </button>
          <h2 className="font-bold text-lg text-slate-800 dark:text-slate-100">
            {MTHS[currentMonth]} {currentYear}
          </h2>
          <button 
            onClick={() => {
              if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y+1); }
              else setCurrentMonth(m => m+1);
            }}
            className="p-2 hover:bg-slate-200 rounded-full"
          >
            <ChevronRight className="w-5 h-5 text-slate-600 dark:text-slate-400" />
          </button>
        </div>
        
        <div className="p-4 sm:p-6 space-y-6">
          <div className="mb-2 bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3 text-blue-800 dark:text-blue-400">
            <Info className="w-6 h-6 shrink-0" />
            <p className="text-sm">
              <strong>Petunjuk:</strong> Masukkan tanggal (pisahkan koma) untuk jadwal seragam di bulan ini.
              {settingTab === "karyawan" && " Seragam Biasa tidak perlu diisi tanggalnya (otomatis jika tidak ada jadwal)."}
            </p>
          </div>

          {settingTab === "karyawan" && (
            <>
              <div className="bg-amber-50/50 dark:bg-amber-900/20 p-4 rounded-xl border border-amber-200">
                <h3 className="font-bold text-amber-800 dark:text-amber-400 mb-2 flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full bg-amber-400 border border-amber-500"></div>
                  Yakult Mangga
                </h3>
                <input 
                  type="text"
                  value={getDatesStringKaryawan("karyawan_yellow")}
                  onChange={(e) => handleDatesChangeKaryawan("karyawan_yellow", e.target.value)}
                  onBlur={() => handleDatesBlurKaryawan("karyawan_yellow")}
                  className="w-full bg-white dark:bg-slate-900 border border-amber-300 rounded-lg px-4 py-2.5 text-slate-800 dark:text-slate-100 font-medium focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="Contoh: 1, 8, 15"
                />
              </div>
              <div className="bg-blue-50/50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-200">
                <h3 className="font-bold text-blue-800 dark:text-blue-400 mb-2 flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full bg-blue-600 border border-blue-700"></div>
                  Yakult Light
                </h3>
                <input 
                  type="text"
                  value={getDatesStringKaryawan("karyawan_blue")}
                  onChange={(e) => handleDatesChangeKaryawan("karyawan_blue", e.target.value)}
                  onBlur={() => handleDatesBlurKaryawan("karyawan_blue")}
                  className="w-full bg-white dark:bg-slate-900 border border-blue-300 rounded-lg px-4 py-2.5 text-slate-800 dark:text-slate-100 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Contoh: 2, 9, 16"
                />
              </div>
              <div className="bg-red-50/50 dark:bg-red-900/20 p-4 rounded-xl border border-red-200">
                <h3 className="font-bold text-red-800 dark:text-red-400 mb-2 flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full bg-red-600 border border-red-700"></div>
                  CU Merah
                </h3>
                <input 
                  type="text"
                  value={getDatesStringKaryawan("karyawan_red")}
                  onChange={(e) => handleDatesChangeKaryawan("karyawan_red", e.target.value)}
                  onBlur={() => handleDatesBlurKaryawan("karyawan_red")}
                  className="w-full bg-white dark:bg-slate-900 border border-red-300 rounded-lg px-4 py-2.5 text-slate-800 dark:text-slate-100 font-medium focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="Contoh: 3, 10, 17"
                />
              </div>
            </>
          )}

          {settingTab === "yl" && (
            <>
              <div className="bg-amber-50/50 dark:bg-amber-900/20 p-4 rounded-xl border border-amber-200">
                <h3 className="font-bold text-amber-800 dark:text-amber-400 mb-2 flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full bg-amber-400 border border-amber-500"></div>
                  Kuning (Yakult Mangga)
                </h3>
                <input 
                  type="text"
                  value={getDatesStringYL("yellow")}
                  onChange={(e) => handleDatesChangeYL("yellow", e.target.value)}
                  onBlur={() => handleDatesBlurYL("yellow")}
                  className="w-full bg-white dark:bg-slate-900 border border-amber-300 rounded-lg px-4 py-2.5 text-slate-800 dark:text-slate-100 font-medium focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="Contoh: 1, 8, 15"
                />
              </div>
              <div className="bg-blue-50/50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-200">
                <h3 className="font-bold text-blue-800 dark:text-blue-400 mb-2 flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full bg-blue-600 border border-blue-700"></div>
                  Biru (Yakult Light)
                </h3>
                <input 
                  type="text"
                  value={getDatesStringYL("blue")}
                  onChange={(e) => handleDatesChangeYL("blue", e.target.value)}
                  onBlur={() => handleDatesBlurYL("blue")}
                  className="w-full bg-white dark:bg-slate-900 border border-blue-300 rounded-lg px-4 py-2.5 text-slate-800 dark:text-slate-100 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Contoh: 2, 9, 16"
                />
              </div>
              <div className="bg-red-50/50 dark:bg-red-900/20 p-4 rounded-xl border border-red-200">
                <h3 className="font-bold text-red-800 dark:text-red-400 mb-2 flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full bg-red-600 border border-red-700"></div>
                  Merah (Yes Everyday)
                </h3>
                <input 
                  type="text"
                  value={getDatesStringYL("red")}
                  onChange={(e) => handleDatesChangeYL("red", e.target.value)}
                  onBlur={() => handleDatesBlurYL("red")}
                  className="w-full bg-white dark:bg-slate-900 border border-red-300 rounded-lg px-4 py-2.5 text-slate-800 dark:text-slate-100 font-medium focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="Contoh: 3, 10, 17"
                />
              </div>
            </>
          )}

        </div>
        <div className="bg-slate-50 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 p-4 flex justify-end">
          <button
            onClick={save}
            disabled={saving}
            className="bg-teal-600 hover:bg-teal-700 text-white px-8 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            <Save className="w-5 h-5" />
            {saving ? "Menyimpan..." : "Simpan Jadwal"}
          </button>
        </div>
      </div>
    </div>
  );
}
