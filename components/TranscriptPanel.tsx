import React, { useEffect, useRef } from 'react';
import { TranscriptItem } from '../types';

interface TranscriptPanelProps {
  transcripts: TranscriptItem[];
  isOpen: boolean;
  onClose: () => void;
}

const TranscriptPanel: React.FC<TranscriptPanelProps> = ({ transcripts, isOpen, onClose }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcripts, isOpen]);

  const downloadTranscript = () => {
    const text = transcripts
      .map(t => `[${t.timestamp.toLocaleTimeString()}] ${t.sender.toUpperCase()}: ${t.text}`)
      .join('\n');

    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcript-${new Date().getTime()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-full md:w-96 bg-zinc-950 border-l border-zinc-800 shadow-2xl z-50 transform transition-transform duration-300 flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-900/50 backdrop-blur">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <span>📜</span> Live Transcript
        </h3>
        <div className="flex gap-2">
          <button
            onClick={downloadTranscript}
            disabled={transcripts.length === 0}
            className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded transition-colors disabled:opacity-50"
          >
            Download
          </button>
          <button onClick={onClose} className="text-zinc-500 hover:text-white p-1">
            ✕
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-zinc-950/80 custom-scrollbar">
        {transcripts.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-zinc-600 space-y-2">
            <div className="text-4xl">💬</div>
            <p>No speech detected yet.</p>
            <p className="text-xs text-zinc-700 max-w-[200px] text-center">Start speaking to see real-time transcription in your selected language.</p>
          </div>
        ) : (
          transcripts.map((t) => (
            <div
              key={t.id}
              className={`flex flex-col ${t.sender === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm leading-relaxed ${t.sender === 'user'
                    ? 'bg-blue-600/20 text-blue-100 rounded-tr-none border border-blue-500/30'
                    : 'bg-zinc-800 text-zinc-200 rounded-tl-none border border-zinc-700'
                  }`}
              >
                {t.text}
                {!t.isFinal && <span className="inline-block w-1.5 h-1.5 bg-current rounded-full ml-1 animate-pulse" />}
              </div>
              <span className="text-[10px] text-zinc-600 mt-1 px-1">
                {t.sender === 'user' ? 'You' : 'Gemini'} • {t.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
          ))
        )}
      </div>

      <div className="p-3 border-t border-zinc-800 text-center text-xs text-zinc-500 bg-zinc-900/30">
        AI-generated transcripts may contain errors.
      </div>
    </div>
  );
};

export default TranscriptPanel;
