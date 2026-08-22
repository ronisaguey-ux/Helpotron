import React, { useRef } from 'react';
import { Paperclip } from 'lucide-react';

export function FileAttachButton({ onFilesSelected, attachedCount = 0 }) {
  const fileInputRef = useRef(null);

  const handleChange = (e) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length > 0) {
      onFilesSelected(selectedFiles);
    }
  };

  return (
    <div className="relative flex items-center">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleChange}
        multiple
        className="hidden"
        aria-label="Upload file attachment"
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        aria-label="Attach local assets (.txt, .pdf, .docx, .mp3, .mp4, .zip, .csv)"
        title="Attach local assets"
        className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl border border-white/10 bg-slate-950/40 text-slate-400 hover:text-cyan-300 hover:border-cyan-500/30 transition-all focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
      >
        <Paperclip className="w-4 h-4" />
      </button>
      {attachedCount > 0 && (
        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-cyan-500 font-mono text-[9px] font-bold text-black ring-2 ring-slate-900 animate-scaleIn">
          {attachedCount}
        </span>
      )}
    </div>
  );
}
