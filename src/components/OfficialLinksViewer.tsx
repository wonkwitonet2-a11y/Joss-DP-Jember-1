import React, { useState, useEffect, useCallback } from "react";
import { Link, ExternalLink, X, Globe, LayoutTemplate, ArrowLeft, Settings } from "lucide-react";
import { OfficialLinksManager } from "./OfficialLinksManager";

interface OfficialLink {
  id: string;
  title: string;
  url: string;
  mode: "iframe" | "new_tab";
}

interface Props {
  onBack: () => void;
  isAdmin?: boolean;
}

export const OfficialLinksViewer: React.FC<Props> = ({ onBack, isAdmin = false }) => {
  const [links, setLinks] = useState<OfficialLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIframeLink, setActiveIframeLink] = useState<OfficialLink | null>(null);
  const [showManager, setShowManager] = useState(false);

  const fetchLinks = useCallback(() => {
    setLoading(true);
    fetch("/api/getOfficialLinks")
      .then(res => res.json())
      .then(data => {
        setLinks(data.links || []);
        setLoading(false);
      })
      .catch(e => {
        console.error("Gagal load links", e);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!showManager) {
      fetchLinks();
    }
  }, [showManager, fetchLinks]);

  const handleLinkClick = (link: OfficialLink) => {
    if (link.mode === "new_tab") {
      window.open(link.url, "_blank");
    } else {
      setActiveIframeLink(link);
    }
  };

  return (
    <div className="min-h-[70vh] bg-neutral-50 dark:bg-neutral-950 pb-20 animate-fade-in relative rounded-2xl border border-line">
      {/* Header */}
      <div className="bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 p-4 md:p-5 rounded-t-2xl sticky top-0 z-10 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={showManager ? () => setShowManager(false) : onBack}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-sm font-bold text-neutral-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <Globe className="w-5 h-5 text-brand-500" />
              {showManager ? "Kelola Link" : "Link Yakult"}
            </h1>
            <p className="text-[10px] sm:text-xs font-semibold text-neutral-500 dark:text-neutral-400">
              {showManager ? "Atur link web resmi" : "Akses cepat link dan portal resmi"}
            </p>
          </div>
        </div>
        {!showManager && isAdmin && (
          <button
            onClick={() => setShowManager(true)}
            className="flex items-center gap-2 bg-brand-50 hover:bg-brand-100 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 px-3 sm:px-4 py-2 rounded-xl text-xs font-bold transition-colors border border-brand-200 dark:border-brand-800 cursor-pointer"
          >
            <Settings className="w-4 h-4" />
            <span className="hidden sm:inline">Pengaturan</span>
          </button>
        )}
      </div>

      <div className="p-4 md:p-5 max-w-3xl lg:max-w-5xl mx-auto space-y-3">
        {showManager ? (
          <div className="animate-fade-in">
            <OfficialLinksManager />
          </div>
        ) : loading ? (
          <p className="text-center text-xs text-neutral-500 dark:text-neutral-400 py-10 font-medium">Memuat tautan...</p>
        ) : links.length === 0 ? (
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl p-8 text-center shadow-sm">
            <Link className="w-12 h-12 text-neutral-300 dark:text-neutral-700 mx-auto mb-3" />
            <p className="text-sm font-bold text-neutral-600 dark:text-neutral-400">Belum ada tautan</p>
            <p className="text-[10px] sm:text-xs text-neutral-400 dark:text-neutral-500 mt-1">Admin belum menambahkan tautan resmi.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {links.map(link => {
              const cardClass = "bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 hover:border-brand-300 hover:shadow-md rounded-2xl p-4 flex flex-col justify-between items-start text-left group transition-all h-28 w-full";
              const content = (
                <>
                  <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-500/20 text-brand-600 dark:text-brand-300 flex items-center justify-center group-hover:scale-110 transition-transform mb-2">
                    {link.mode === "new_tab" ? <ExternalLink className="w-5 h-5" /> : <LayoutTemplate className="w-5 h-5" />}
                  </div>
                  <div>
                    <h3 className="font-bold text-neutral-800 dark:text-white text-xs sm:text-sm">{link.title}</h3>
                    <p className="text-[10px] text-neutral-400 truncate w-48 mt-0.5 font-medium">{link.url}</p>
                  </div>
                </>
              );

              if (link.mode === "new_tab") {
                return (
                  <a
                    key={link.id}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cardClass}
                    onClick={(e) => {
                      if ((window as any).AppInventor) {
                        e.preventDefault();
                        (window as any).AppInventor.setWebViewString(link.url);
                      }
                    }}
                  >
                    {content}
                  </a>
                );
              }

              return (
                <button
                  key={link.id}
                  onClick={() => handleLinkClick(link)}
                  className={cardClass}
                >
                  {content}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Iframe Modal */}
      {activeIframeLink && !showManager && (
        <div className="fixed inset-0 z-50 bg-white dark:bg-neutral-900 flex flex-col">
          <div className="bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 p-3 flex items-center justify-between shadow-sm shrink-0">
            <div className="flex items-center gap-3 overflow-hidden pr-2">
              <button
                onClick={() => setActiveIframeLink(null)}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 transition-colors shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="min-w-0">
                <h3 className="font-bold text-sm text-neutral-900 dark:text-neutral-100 truncate">{activeIframeLink.title}</h3>
                <p className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate">{activeIframeLink.url}</p>
              </div>
            </div>
            <a
              href={activeIframeLink.url}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 font-bold text-[10px] sm:text-xs px-3 sm:px-4 py-2 rounded-xl border border-indigo-200 dark:border-indigo-800 flex items-center gap-1.5 transition-colors shrink-0"
              onClick={(e) => {
                if ((window as any).AppInventor) {
                  e.preventDefault();
                  (window as any).AppInventor.setWebViewString(activeIframeLink.url);
                }
              }}
            >
              <ExternalLink className="w-4 h-4" />
              <span className="hidden sm:inline">Buka di Tab Lain</span>
              <span className="inline sm:hidden">Tab Lain</span>
            </a>
          </div>
          <div className="flex-1 bg-neutral-50 dark:bg-neutral-800/40 relative">
            <iframe 
              src={activeIframeLink.url} 
              className="w-full h-full border-0 absolute inset-0"
              title={activeIframeLink.title}
              sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-downloads"
            />
          </div>
        </div>
      )}
    </div>
  );
};
