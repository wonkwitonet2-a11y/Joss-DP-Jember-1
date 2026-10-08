import React, { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";


const MTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];
const DAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

const UNIFORMS = [
  { id: "yellow", name: "Yakult Mangga", color: "bg-amber-400", desc: "Ceria sepanjang hari dengan warna mangga yang manis 💛" },
  { id: "blue", name: "Yakult Light", color: "bg-blue-600", desc: "Anggun dan segar dengan sentuhan biru Yakult Light 💙" },
  { id: "red", name: "Yes Everyday", color: "bg-red-600", desc: "Tampil percaya diri dengan baju Yes Everyday hari ini ✨" }
];
const DEFAULT_DESC = "Belum ada jadwal, mungkin bajunya masih disetrika 😄";

export default function YLSeragamView({ onBack }: { onBack?: () => void }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [images, setImages] = useState<any>({});
  const [schedules, setSchedules] = useState<any>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/getSeragam").then(r => r.json())
      .then(data => {
        setImages(data.images || {});
        setSchedules(data.schedules || {});
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  const monthKey = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, "0")}`;
  const day = currentDate.getDate();
  const schedule = schedules[monthKey] || {};
  const assigned = schedule[day];
  
  const uniformInfo = UNIFORMS.find(u => u.id === assigned);
  const title = uniformInfo ? uniformInfo.name : "Bajunya Lagi Bingung";
  const desc = uniformInfo ? uniformInfo.desc : DEFAULT_DESC;
  const imageSrc = uniformInfo ? images[uniformInfo.id] : images["default"];
  
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


  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
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

  const isToday = currentDate.toDateString() === new Date().toDateString();

  return (
    <div className="flex flex-col sm:max-w-md sm:mx-auto bg-[#Fdfbf7] dark:bg-slate-950 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden my-2">
      <div className="flex items-center justify-between p-4 pb-2">
        <h1 className="font-bold text-xl text-slate-800 dark:text-slate-100 flex items-center gap-2">
          Pakai Apa Ya? 👗
        </h1>
        <button onClick={handleToday} className="p-3 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 active:scale-95 transition-transform" title="Hari Ini">
          <Calendar className="w-5 h-5 text-blue-500" />
        </button>
      </div>

      <div className="px-4 pb-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 flex items-center justify-between p-2">
          <button onClick={handlePrev} className="p-2 text-slate-400 hover:text-slate-600 dark:text-slate-400 active:bg-slate-50 rounded-xl">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex flex-col items-center">
            <span className="font-bold text-slate-700 dark:text-slate-300 text-sm">
              {DAYS[currentDate.getDay()]}, {day} {MTHS[currentDate.getMonth()]} {currentDate.getFullYear()}
            </span>
            {isToday && <span className="text-[10px] font-bold text-red-500">Hari ini</span>}
          </div>
          <button onClick={handleNext} className="p-2 text-slate-400 hover:text-slate-600 dark:text-slate-400 active:bg-slate-50 rounded-xl">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-8 flex flex-col" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <>
            <div className="bg-white dark:bg-slate-900 rounded-[32px] shadow-sm border border-slate-100 dark:border-slate-800 p-6 flex flex-col items-center text-center flex-1">
              <div className="bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs font-bold px-3 py-1 rounded-full mb-6 flex items-center gap-1">
                👕 Seragam Hari Ini
              </div>
              
              <div className="flex-1 flex items-center justify-center w-full min-h-[200px] mb-6">
                {imageSrc ? (
                  <img src={imageSrc} className="max-w-[80%] max-h-[300px] object-contain drop-shadow-xl" alt={title} />
                ) : (
                  <div className="w-48 h-48 bg-slate-100 dark:bg-slate-800 rounded-full flex flex-col items-center justify-center text-slate-400">
                    <span className="text-4xl mb-2">📸</span>
                    <span className="text-xs">Gambar belum diupload</span>
                  </div>
                )}
              </div>
              
              <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 mb-2">{title}</h2>
              <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed max-w-[250px]">{desc}</p>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 p-4 mt-4">
              <h3 className="font-bold text-slate-700 dark:text-slate-300 text-sm mb-3">Keterangan Warna</h3>
              <div className="flex gap-4 mb-2">
                <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                  <div className="w-3 h-3 rounded bg-blue-600"></div> Yakult Light
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                  <div className="w-3 h-3 rounded bg-amber-400"></div> Yakult Mangga
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                  <div className="w-3 h-3 rounded bg-red-600"></div> Yes Everyday
                </div>
              </div>
              <p className="text-[10px] text-slate-400 italic">Periode jadwal: Diatur oleh Admin</p>
            </div>
            
            <div className="text-center mt-6 text-slate-400 text-xs flex items-center justify-center gap-2">
              <span className="opacity-50">👆</span> Geser kiri / kanan untuk ganti hari
            </div>
          </>
        )}
      </div>
    </div>
  );
}
