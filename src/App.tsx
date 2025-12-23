import React, { useState, useRef, useEffect } from 'react';
import { PERSONAS, SUPPORTED_LANGUAGES, DEFAULT_VAD_THRESHOLD, DEFAULT_LANGUAGE } from './constants';
import { Persona, LanguageCode } from './types';
import PersonaCard from './components/PersonaCard';
import { useGeminiLive } from './hooks/useGeminiLive';
import AudioVisualizer from './components/AudioVisualizer';
import { formatDuration, formatSize } from './utils/audio';

type InputMode = 'mic' | 'file';

/**
 * Audio Player Component
 */
interface AudioPlayerProps {
  blob: Blob;
  title: string;
  subtitle: string;
  icon: string;
  colorClass: string;
  filename: string;
}

const AudioPlayer: React.FC<AudioPlayerProps> = ({ blob, title, subtitle, icon, colorClass, filename }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (blob) {
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      setCurrentTime(0);
      setIsPlaying(false);
      return () => URL.revokeObjectURL(url);
    }
  }, [blob]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => setDuration(audio.duration);
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
    };
  }, [audioUrl]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current) return;
    const time = parseFloat(e.target.value);
    audioRef.current.currentTime = time;
    setCurrentTime(time);
  };

  const handleDownload = () => {
    if (!audioUrl) return;
    const a = document.createElement('a');
    a.href = audioUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const bgClass = colorClass === 'blue' 
    ? 'from-blue-900/20 to-indigo-900/10 border-blue-700/40' 
    : 'from-green-900/20 to-emerald-900/10 border-green-700/40';
  
  const btnClass = colorClass === 'blue'
    ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-900/30'
    : 'bg-green-600 hover:bg-green-500 shadow-green-900/30';

  const textClass = colorClass === 'blue' ? 'text-blue-400' : 'text-green-400';

  return (
    <div className={`bg-gradient-to-br ${bgClass} border rounded-xl p-4`}>
      {audioUrl && <audio ref={audioRef} src={audioUrl} preload="metadata" />}
      
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">{icon}</span>
          <div>
            <h4 className={`font-semibold ${textClass}`}>{title}</h4>
            <p className="text-[10px] text-zinc-500">{subtitle}</p>
          </div>
        </div>
        <div className="text-right text-[10px] text-zinc-500">
          <div>{formatDuration(duration)}</div>
          <div>{formatSize(blob.size)}</div>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-3">
        <button
          onClick={togglePlay}
          className={`w-10 h-10 ${btnClass} rounded-full flex items-center justify-center transition-all shadow-lg`}
        >
          {isPlaying ? (
            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        <div className="flex-1">
          <input
            type="range"
            min="0"
            max={duration || 100}
            step="0.1"
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full"
          />
          <div className="flex justify-between text-[10px] text-zinc-600 mt-1">
            <span>{formatDuration(currentTime)}</span>
            <span>{formatDuration(duration)}</span>
          </div>
        </div>
      </div>

      <button
        onClick={handleDownload}
        className={`w-full py-2.5 ${btnClass} text-white font-medium rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg text-sm`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        Download WAV
      </button>
    </div>
  );
};

/**
 * Main App Component
 */
const App: React.FC = () => {
  const [selectedPersona, setSelectedPersona] = useState<Persona>(PERSONAS[0]);
  const [inputMode, setInputMode] = useState<InputMode>('mic');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showCallGuide, setShowCallGuide] = useState(false);
  const [vadThreshold, setVadThreshold] = useState(DEFAULT_VAD_THRESHOLD);
  const [selectedLanguage, setSelectedLanguage] = useState<LanguageCode>(DEFAULT_LANGUAGE);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const apiKey = process.env.API_KEY || '';
  const isApiKeyMissing = !apiKey;

  const {
    connect,
    disconnect,
    status,
    error,
    mediaStream,
    isVadActive,
    originalAudioBlob,
    transformedAudioBlob,
    recordingDuration
  } = useGeminiLive({ apiKey, vadThreshold });

  const hasRecordings = originalAudioBlob || transformedAudioBlob;

  const handleStartRecording = () => {
    if (inputMode === 'file' && !selectedFile) {
      alert("Please select an audio file first.");
      return;
    }
    connect(selectedPersona, inputMode === 'file' ? selectedFile! : undefined, selectedLanguage);
  };

  const handleStopRecording = () => {
    disconnect();
  };

  const handleNewRecording = () => {
    // This will start a new recording
    connect(selectedPersona, inputMode === 'file' ? selectedFile! : undefined, selectedLanguage);
  };

  const handlePersonaSelect = async (persona: Persona) => {
    setSelectedPersona(persona);
    if (status === 'connected') {
      await disconnect();
      setTimeout(() => {
        connect(persona, inputMode === 'file' ? selectedFile! : undefined, selectedLanguage);
      }, 300);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setSelectedFile(e.target.files[0]);
      if (status === 'connected') disconnect();
    }
  };

  const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
  const originalFilename = `original-voice-${timestamp}.wav`;
  const transformedFilename = `transformed-${selectedPersona.id}-${timestamp}.wav`;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center p-4 md:p-8 relative overflow-x-hidden">

      {isApiKeyMissing && (
        <div className="fixed top-0 left-0 w-full bg-red-600 text-white text-center py-2 z-50 shadow-lg font-medium">
          ⚠️ Missing API Key. Application is disabled.
        </div>
      )}

      {/* Header */}
      <header className={`w-full max-w-5xl mb-6 flex flex-col md:flex-row justify-between items-center border-b border-zinc-900 pb-5 gap-4 ${isApiKeyMissing ? 'mt-8' : ''}`}>
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">
            Voice Morph
          </h1>
          <p className="text-zinc-500 text-sm mt-1">Real-time AI Voice Transformation</p>
        </div>
        
        <div className="flex items-center gap-4 flex-wrap justify-center">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-zinc-500 font-bold uppercase">Language</label>
            <select
              value={selectedLanguage}
              onChange={(e) => {
                setSelectedLanguage(e.target.value as LanguageCode);
                if (status === 'connected') disconnect();
              }}
              disabled={status === 'connecting' || status === 'connected'}
              className="bg-zinc-900 border border-zinc-800 text-zinc-300 py-2 px-3 rounded-lg text-sm focus:outline-none focus:border-blue-500 disabled:opacity-50"
            >
              {SUPPORTED_LANGUAGES.map(lang => (
                <option key={lang.code} value={lang.code}>{lang.flag} {lang.name}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-zinc-500 font-bold uppercase">Source</label>
            <div className="bg-zinc-900 p-1 rounded-lg flex border border-zinc-800">
              <button
                onClick={() => { setInputMode('mic'); if (status === 'connected') disconnect(); }}
                disabled={isApiKeyMissing || status === 'connected'}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${inputMode === 'mic' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'} disabled:opacity-50`}
              >
                🎙 Mic
              </button>
              <button
                onClick={() => { setInputMode('file'); if (status === 'connected') disconnect(); }}
                disabled={isApiKeyMissing || status === 'connected'}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${inputMode === 'file' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'} disabled:opacity-50`}
              >
                📁 File
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Panel */}
        <div className="lg:col-span-2 flex flex-col gap-5">
          
          {/* Recording Panel */}
          <div className="bg-zinc-900/30 border border-zinc-800 rounded-2xl p-5 shadow-2xl relative overflow-hidden flex flex-col">
            
            {/* Header */}
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-3">
                {status === 'connected' ? (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                      </span>
                      <span className="text-lg font-semibold text-white">Recording</span>
                    </div>
                    <span className="px-3 py-1 bg-red-500/20 text-red-400 text-sm font-mono rounded-full border border-red-500/30 font-bold">
                      {formatDuration(recordingDuration)}
                    </span>
                    {inputMode === 'mic' && (
                      <span className={`px-2 py-1 text-xs font-mono rounded-full border transition-all ${isVadActive ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-zinc-800 text-zinc-500 border-zinc-700'}`}>
                        {isVadActive ? '● Speaking' : '○ Silent'}
                      </span>
                    )}
                  </>
                ) : hasRecordings ? (
                  <div className="flex items-center gap-2">
                    <span className="text-green-400 text-xl">✓</span>
                    <span className="text-lg font-semibold text-green-400">Recording Complete</span>
                  </div>
                ) : (
                  <span className="text-lg font-semibold text-zinc-400">Ready to Record</span>
                )}
              </div>
              <button
                onClick={() => setShowCallGuide(!showCallGuide)}
                className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-400 px-3 py-1.5 rounded-full"
              >
                📞 Guide
              </button>
            </div>

            {/* Phone Guide Modal */}
            {showCallGuide && (
              <div className="absolute inset-0 z-20 bg-zinc-950/98 backdrop-blur p-5 flex flex-col items-center justify-center text-center">
                <h3 className="text-lg font-bold mb-3">Use with Phone Calls</h3>
                <div className="grid grid-cols-3 gap-2 max-w-md mb-3 text-xs">
                  <div className="bg-zinc-900 p-2 rounded-lg border border-zinc-800">
                    <div className="text-lg mb-1">1️⃣</div>
                    <div className="text-zinc-400">PC runs app</div>
                  </div>
                  <div className="bg-zinc-900 p-2 rounded-lg border border-zinc-800">
                    <div className="text-lg mb-1">2️⃣</div>
                    <div className="text-zinc-400">Aux to phone</div>
                  </div>
                  <div className="bg-zinc-900 p-2 rounded-lg border border-zinc-800">
                    <div className="text-lg mb-1">3️⃣</div>
                    <div className="text-zinc-400">Speak to PC</div>
                  </div>
                </div>
                <button onClick={() => setShowCallGuide(false)} className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-lg text-sm">
                  Close
                </button>
              </div>
            )}

            {/* Content Area */}
            <div className="flex-1 flex flex-col items-center justify-center gap-4 min-h-[180px]">
              
              {/* RECORDING STATE - Show visualizer and DONE button */}
              {status === 'connected' && (
                <>
                  {/* Visualizer */}
                  <div className="w-full">
                    <div className={`transition-opacity ${!isVadActive && inputMode === 'mic' ? 'opacity-40' : 'opacity-100'}`}>
                      <AudioVisualizer
                        stream={mediaStream || undefined}
                        isListening={true}
                        accentColor="#3b82f6"
                      />
                    </div>
                  </div>

                  {/* Sensitivity Slider */}
                  {inputMode === 'mic' && (
                    <div className="flex items-center gap-3 bg-zinc-900/50 px-4 py-2 rounded-full border border-zinc-800 max-w-xs">
                      <span className="text-[10px] text-zinc-500 uppercase font-bold">Sensitivity</span>
                      <input
                        type="range"
                        min="0.001"
                        max="0.05"
                        step="0.001"
                        value={vadThreshold}
                        onChange={(e) => setVadThreshold(parseFloat(e.target.value))}
                        className="flex-1 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-full"
                      />
                    </div>
                  )}

                  {/* Recording Info */}
                  <p className="text-zinc-500 text-sm text-center">
                    {inputMode === 'mic' 
                      ? "Speak now... Click the button below when you're done." 
                      : "Processing audio file..."}
                  </p>

                  {/* BIG DONE BUTTON */}
                  <button
                    onClick={handleStopRecording}
                    className="w-full max-w-md py-5 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white text-xl font-bold rounded-2xl flex items-center justify-center gap-3 transition-all shadow-lg shadow-green-900/30 mt-2"
                  >
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                    I'm Done - Save Recording
                  </button>
                </>
              )}

              {/* IDLE STATE - Show start button */}
              {status === 'disconnected' && !hasRecordings && (
                <>
                  {/* File Upload (if file mode) */}
                  {inputMode === 'file' && (
                    <div
                      onClick={() => !isApiKeyMissing && fileInputRef.current?.click()}
                      className={`w-full h-24 border-2 border-dashed rounded-xl flex flex-col items-center justify-center transition-all cursor-pointer ${isApiKeyMissing ? 'border-zinc-800 opacity-50' : 'border-zinc-700 hover:border-blue-500 hover:bg-zinc-800/30'}`}
                    >
                      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="audio/*" className="hidden" disabled={isApiKeyMissing} />
                      {selectedFile ? (
                        <div className="text-center">
                          <p className="text-blue-400 font-medium text-sm">{selectedFile.name}</p>
                          <p className="text-zinc-500 text-xs">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                        </div>
                      ) : (
                        <div className="text-center text-zinc-500 text-sm">
                          <p>Click to upload audio</p>
                          <p className="text-xs mt-1">MP3, WAV, M4A</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Mic Preview (if mic mode) */}
                  {inputMode === 'mic' && (
                    <div className="w-full opacity-50">
                      <AudioVisualizer
                        stream={mediaStream || undefined}
                        isListening={!!mediaStream}
                        accentColor="#52525b"
                      />
                    </div>
                  )}

                  <p className="text-zinc-600 text-sm">
                    {inputMode === 'mic' ? 'Click below to start recording' : selectedFile ? 'Ready to process' : 'Select an audio file'}
                  </p>

                  {/* START BUTTON */}
                  <button
                    onClick={handleStartRecording}
                    disabled={isApiKeyMissing || (inputMode === 'file' && !selectedFile)}
                    className={`w-full max-w-md py-5 text-xl font-bold rounded-2xl flex items-center justify-center gap-3 transition-all shadow-lg
                      ${(inputMode === 'file' && !selectedFile) || isApiKeyMissing
                        ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                        : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-900/30'
                      }`}
                  >
                    <span className="text-2xl">{inputMode === 'mic' ? '🎙' : '▶'}</span>
                    {inputMode === 'mic' ? 'Start Recording' : 'Process File'}
                  </button>
                </>
              )}

              {/* CONNECTING STATE */}
              {status === 'connecting' && (
                <div className="flex flex-col items-center gap-4">
                  <svg className="animate-spin h-12 w-12 text-blue-500" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <p className="text-yellow-500 text-lg font-medium">Connecting...</p>
                </div>
              )}

              {/* COMPLETED STATE - Show recordings */}
              {status === 'disconnected' && hasRecordings && (
                <div className="w-full space-y-4">
                  {/* Success Message */}
                  <div className="text-center mb-2">
                    <p className="text-zinc-400 text-sm">Your recordings are ready! Play to preview, then download.</p>
                  </div>

                  {/* Audio Players */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {originalAudioBlob && (
                      <AudioPlayer
                        blob={originalAudioBlob}
                        title="Your Original Voice"
                        subtitle="Direct mic recording"
                        icon="🎤"
                        colorClass="blue"
                        filename={originalFilename}
                      />
                    )}

                    {transformedAudioBlob && (
                      <AudioPlayer
                        blob={transformedAudioBlob}
                        title="Transformed Voice"
                        subtitle={`${selectedPersona.name} • AI`}
                        icon="🎭"
                        colorClass="green"
                        filename={transformedFilename}
                      />
                    )}
                  </div>

                  <p className="text-center text-xs text-zinc-600">
                    ✓ WAV format • Works on Mobile, WhatsApp & All Players
                  </p>

                  {/* NEW RECORDING BUTTON */}
                  <button
                    onClick={handleNewRecording}
                    className="w-full py-4 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all border border-zinc-700"
                  >
                    <span>🎙</span> Start New Recording
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-900/20 border border-red-900/50 text-red-400 p-3 rounded-lg text-sm text-center">
              ⚠️ {error}
            </div>
          )}
        </div>

        {/* Right Panel - Personas */}
        <div className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold text-zinc-400">Select Voice</h3>
          
          <div className={`grid grid-cols-1 gap-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar ${isApiKeyMissing || status === 'connected' ? 'opacity-50 pointer-events-none' : ''}`}>
            {PERSONAS.map(persona => (
              <PersonaCard
                key={persona.id}
                persona={persona}
                isSelected={selectedPersona.id === persona.id}
                onClick={handlePersonaSelect}
                disabled={status === 'connecting' || status === 'connected'}
              />
            ))}
          </div>

          {/* Info Cards */}
          <div className="space-y-2 mt-2">
            <div className="bg-blue-900/10 border border-blue-900/30 p-3 rounded-xl">
              <h4 className="text-blue-400 text-xs font-bold mb-1">💡 How to Use</h4>
              <p className="text-[11px] text-zinc-500 leading-relaxed">
                1. Select a voice persona<br/>
                2. Click "Start Recording"<br/>
                3. Speak into your mic<br/>
                4. Click "I'm Done" when finished<br/>
                5. Play & download your recordings
              </p>
            </div>
            <div className="bg-green-900/10 border border-green-900/30 p-3 rounded-xl">
              <h4 className="text-green-400 text-xs font-bold mb-1">📱 Universal Format</h4>
              <p className="text-[11px] text-zinc-500">WAV format works everywhere - Mobile, WhatsApp, all players.</p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-5xl mt-10 pt-5 border-t border-zinc-900 text-center text-zinc-700 text-xs">
        Voice Morph • Powered by Google Gemini
      </footer>
    </div>
  );
};

export default App;
