import React, { useState, useEffect, useRef } from "react";
import { X, Send, Sparkles, Bot, Trash2, History } from "lucide-react";
import { motion } from "motion/react";
import { parseJsonResponse } from "../lib/safeFetch";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date | string;
}

interface AIChatBotProps {
  role: "manager" | "yl";
  userName: string;
  botName?: string;
}

function AIChatBotInner({ role, userName, botName = "AI Jember 1 Pro" }: AIChatBotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isDraggingRef = useRef(false);

  // Listen for open-ai-chat event from menus
  useEffect(() => {
    const handleOpen = () => setIsOpen(true);
    window.addEventListener("open-ai-chat", handleOpen);
    return () => window.removeEventListener("open-ai-chat", handleOpen);
  }, []);

  // Dynamic storage key for chat history based on user role and username
  const storageKey = `yakult_chat_history_${role}_${(userName || "user").trim().toLowerCase().replace(/\s+/g, "_")}`;

  // Helper to construct default welcome message
  const createWelcomeMessage = (): Message => ({
    id: "welcome",
    role: "assistant",
    content: `Halo ${role === "manager" ? "Manager Wito" : "Ibu " + userName}! Saya adalah **${botName}** 🚀. Saya terhubung langsung dengan database Jember 1 Anda.\n\nAnda bisa meminta saya untuk **menganalisa penjualan**, **mengevaluasi kinerja rute**, atau bahkan **bertanya apa saja di luar pekerjaan** seperti resep makanan, tips kesehatan, atau topik lainnya secara bebas. Ada yang bisa saya bantu hari ini?`,
    timestamp: new Date(),
  });

  // Initialize messages state from localStorage or fallback to welcome message
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((m: any) => ({
            ...m,
            timestamp: m.timestamp ? new Date(m.timestamp) : new Date()
          }));
        }
      }
    } catch (e) {
      console.warn("Gagal memuat histori chat:", e);
    }
    return [createWelcomeMessage()];
  });

  // Re-sync messages when role, userName, or botName changes
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed.map((m: any) => ({
            ...m,
            timestamp: m.timestamp ? new Date(m.timestamp) : new Date()
          })));
          return;
        }
      }
    } catch (e) {}

    setMessages([createWelcomeMessage()]);
  }, [role, userName, botName, storageKey]);

  // Persist messages to localStorage on every update
  useEffect(() => {
    if (messages && messages.length > 0) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(messages));
      } catch (e) {
        console.warn("Gagal menyimpan histori chat ke localStorage", e);
      }
    }
  }, [messages, storageKey]);

  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showClearSuccess, setShowClearSuccess] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);

  // Clear total chat history handler (No window.confirm to avoid iframe blocks)
  const handleOpenConfirmDelete = () => {
    setShowConfirmModal(true);
  };

  const confirmDeleteChat = () => {
    try {
      localStorage.removeItem(storageKey);
    } catch (e) {
      console.warn("Gagal hapus localStorage chat:", e);
    }

    const resetMsg: Message = {
      id: "reset_" + Date.now(),
      role: "assistant",
      content: `Halo ${role === "manager" ? "Manager Wito" : "Ibu " + userName}! Saya adalah **${botName}** 🚀. Seluruh riwayat percakapan sebelumnya telah **dihapus total** 🧹.\n\nAda yang ingin ditanyakan lagi hari ini?`,
      timestamp: new Date()
    };

    setMessages([resetMsg]);
    setShowConfirmModal(false);
    setShowClearSuccess(true);
    setTimeout(() => setShowClearSuccess(false), 4000);
  };

  // Keep the chat window locked to the real, visible screen height on mobile
  useEffect(() => {
    const updateHeight = () => {
      setViewportHeight(window.visualViewport ? window.visualViewport.height : window.innerHeight);
    };
    updateHeight();
    window.addEventListener("resize", updateHeight);
    window.visualViewport?.addEventListener("resize", updateHeight);
    return () => {
      window.removeEventListener("resize", updateHeight);
      window.visualViewport?.removeEventListener("resize", updateHeight);
    };
  }, []);

  // Quick suggestions based on user role
  const quickPrompts = role === "manager" ? [
    { label: "📊 Analisa Penjualan Tim", text: "Tolong berikan analisa mendalam performa penjualan tim Jember 1 bulan ini" },
    { label: "🏆 Siapa YL Terbaik?", text: "Siapa saja Yakult Lady dengan performa atau rata-rata penjualan harian tertinggi?" },
    { label: "⚠️ Evaluasi Retur (BB)", text: "Apakah ada YL yang memiliki tingkat retur balik botol (BB) terlalu tinggi?" },
    { label: "💡 Tanya Hal Bebas", text: "Berikan saya resep masakan sarapan pagi yang praktis, sehat, dan lezat!" }
  ] : [
    { label: "📈 Capaian Target Saya", text: "Bagaimana capaian target penjualan bulanan saya sejauh ini?" },
    { label: "💰 Estimasi Bonus Saya", text: "Berapa estimasi kompensasi atau bonus harian & bulanan saya bulan ini?" },
    { label: "🚀 Tips Pelanggan Baru", text: "Berikan tips cara efektif mendapatkan pelanggan baru saat canvassing di lapangan" },
    { label: "🌱 Tips Kesehatan Bebas", text: "Apa saja manfaat minum air hangat di pagi hari saat bangun tidur?" }
  ];

  // Auto scroll to bottom when messages list changes
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isLoading]);

  const handleSendMessage = async (textToSend: string) => {
    const text = textToSend.trim();
    if (!text) return;

    const userMessage: Message = {
      id: Math.random().toString(36).substring(7),
      role: "user",
      content: text,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);

    try {
      // Prepare history formatted for API
      const history = (messages || []).map(m => ({
        role: m.role,
        content: m.content
      }));

      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: text,
          history: history,
          role: role,
          user_name: userName
        })
      });

      const data = await parseJsonResponse(response);

      if (response.ok && data && data.reply) {
        const assistantMessage: Message = {
          id: Math.random().toString(36).substring(7),
          role: "assistant",
          content: data.reply,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, assistantMessage]);
      } else {
        throw new Error(data?.error || "Gagal memperoleh balasan dari AI.");
      }
    } catch (err: any) {
      console.error(err);
      const errorMessage: Message = {
        id: Math.random().toString(36).substring(7),
        role: "assistant",
        content: `⚠️ Maaf, terjadi kesalahan koneksi. Pastikan koneksi internet Anda stabil atau silakan coba lagi beberapa saat lagi.`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Expanded Chat Window (Draggable by Header) */}
      {isOpen && (
        <motion.div
          id="ai-chatbot-window"
          className="fixed inset-0 z-[9999] w-screen h-screen h-dvh bg-white flex flex-col overflow-hidden animate-fadeInUp"
          style={{
            display: "flex",
            flexDirection: "column",
            ...(viewportHeight ? { height: viewportHeight } : {})
          }}
        >
          {/* Header */}
          <div className="p-3.5 sm:p-4 pt-safe bg-gradient-to-r from-red-800 via-rose-900 to-rose-950 border-b border-red-700 flex justify-between items-center text-white shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-red-600 rounded-lg shadow-inner">
                <Sparkles className="w-5 h-5 text-yellow-300" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base sm:text-lg font-black tracking-wide uppercase">{botName}</h3>
                  <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-400/30 font-bold hidden sm:inline-flex items-center gap-1">
                    <History className="w-2.5 h-2.5" /> Histori Tersimpan
                  </span>
                </div>
                <p className="text-xs text-red-200 font-bold">Asisten Pintar & Analis Data</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleOpenConfirmDelete}
                className="px-2.5 py-1.5 bg-red-950/90 hover:bg-red-900 text-rose-100 rounded-lg border border-red-600/70 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-sm active:scale-95"
                title="Hapus Total Seluruh Riwayat Chat"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-300" />
                <span className="text-xs">Hapus Chat</span>
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 hover:bg-white/10 rounded-lg text-red-100 transition-colors cursor-pointer"
                title="Tutup Chat"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Modal Konfirmasi Hapus Chat Custom */}
          {showConfirmModal && (
            <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-[999] flex items-center justify-center p-4 animate-fade-in">
              <div className="bg-slate-900 border border-red-500/40 text-white rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-2xl">
                <div className="flex items-center gap-3 text-red-400">
                  <div className="p-3 bg-red-500/20 rounded-xl border border-red-500/30">
                    <Trash2 className="w-6 h-6 text-red-400" />
                  </div>
                  <div>
                    <h4 className="font-black text-sm uppercase tracking-wide text-white">Hapus Total Chat?</h4>
                    <p className="text-[11px] text-slate-300">Riwayat percakapan akan dibersihkan</p>
                  </div>
                </div>

                <p className="text-xs text-slate-200 leading-relaxed bg-slate-950/80 p-3 rounded-xl border border-slate-800">
                  Apakah {role === "yl" ? "Ibu " + userName : "Anda"} yakin ingin menghapus SELURUH riwayat percakapan dengan <strong className="text-amber-400">{botName}</strong> secara permanen?
                </p>

                <div className="flex gap-2.5 pt-1">
                  <button
                    onClick={() => setShowConfirmModal(false)}
                    className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs py-2.5 rounded-xl transition-all border border-slate-700 cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    onClick={confirmDeleteChat}
                    className="flex-1 bg-red-600 hover:bg-red-500 text-white font-black text-xs py-2.5 rounded-xl transition-all shadow-lg shadow-red-600/30 cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Trash2 className="w-4 h-4" />
                    Ya, Hapus Semua
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Toast Notification when chat cleared */}
          {showClearSuccess && (
            <div className="bg-emerald-600 text-white text-xs font-bold px-4 py-2 text-center animate-fade-in flex items-center justify-center gap-1.5 shrink-0 shadow-md">
              <span>🧹</span>
              <span>Seluruh riwayat chat berhasil dihapus total!</span>
            </div>
          )}

          {/* Messages Body */}
          <div className="flex-1 min-h-0 p-3.5 overflow-y-auto bg-slate-50 space-y-3.5">
            {(messages || []).map((m) => {
              const formattedTime = (() => {
                try {
                  const d = new Date(m.timestamp);
                  if (isNaN(d.getTime())) return "";
                  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                } catch (e) {
                  return "";
                }
              })();

              return (
                <div
                  key={m.id}
                  className={`flex gap-2 max-w-[88%] sm:max-w-[85%] ${m.role === "user" ? "ml-auto flex-row-reverse" : "mr-auto"}`}
                >
                  {m.role === "assistant" && (
                    <div className="w-6 h-6 rounded-lg bg-red-100 text-red-700 flex items-center justify-center shrink-0 border border-red-200 mt-1">
                      <Bot className="w-3.5 h-3.5" />
                    </div>
                  )}
                  <div
                    className={`p-3 rounded-xl text-base leading-relaxed shadow-sm border ${
                      m.role === "user"
                        ? "bg-red-600 text-white border-red-500 rounded-tr-none"
                        : "bg-white text-slate-800 border-slate-150 rounded-tl-none"
                    }`}
                  >
                    {/* Simplistic markdown bold parser to keep code fully static and robust */}
                    {m.content.split("\n").map((para, pIdx) => (
                      <p key={pIdx} className={pIdx > 0 ? "mt-1.5" : ""}>
                        {para.split("**").map((text, tIdx) => 
                          tIdx % 2 === 1 ? <strong key={tIdx} className={`font-extrabold px-0.5 rounded ${m.role === "user" ? "text-yellow-200 bg-red-700/80" : "text-red-950 bg-red-50"}`}>{text}</strong> : text
                        )}
                      </p>
                    ))}

                    {formattedTime && (
                      <div className={`text-[9.5px] font-mono font-medium mt-1.5 text-right ${m.role === "user" ? "text-red-200" : "text-slate-400"}`}>
                        {formattedTime}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {isLoading && (
              <div className="flex gap-2 max-w-[80%] mr-auto items-center">
                <div className="w-6 h-6 rounded-lg bg-red-100 text-red-700 flex items-center justify-center border border-red-200">
                  <Bot className="w-3.5 h-3.5 animate-bounce" />
                </div>
                <div className="p-3 bg-white text-slate-500 rounded-xl rounded-tl-none shadow-sm border border-slate-150 text-sm font-bold flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></span>
                  <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></span>
                  <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></span>
                  <span>AI sedang menganalisis...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick suggestions */}
          <div className="px-3 py-2 bg-white border-t border-slate-100 overflow-x-auto whitespace-nowrap flex gap-1.5 scrollbar-thin shrink-0">
            {quickPrompts.map((p, idx) => (
              <button
                key={idx}
                onClick={() => handleSendMessage(p.text)}
                disabled={isLoading}
                className="inline-flex items-center gap-1 bg-slate-50 hover:bg-red-50 hover:text-red-700 border border-slate-200 hover:border-red-200 rounded-lg px-3 py-1.5 text-sm font-bold text-slate-600 transition-all cursor-pointer whitespace-nowrap active:scale-95 disabled:opacity-50"
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Input Area */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage(inputValue);
            }}
            className="p-2 pb-safe border-t border-slate-100 bg-white flex gap-2 shrink-0"
          >
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={`Tanya ${botName} (Contoh: analisa penjualan / resep bakso)...`}
              disabled={isLoading}
              className="flex-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-base font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:border-red-500 focus:bg-white disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isLoading || !inputValue.trim()}
              className="p-2.5 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </motion.div>
      )}
    </>
  );
}

export default React.memo(AIChatBotInner);

