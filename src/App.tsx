import React, { useState, useRef, useEffect } from 'react';
import { PERSONAS, SUPPORTED_LANGUAGES, DEFAULT_VAD_THRESHOLD, DEFAULT_LANGUAGE } from './constants';
import { Persona, LanguageCode } from './types';
import PersonaCard from './components/PersonaCard';
import { useGeminiLive } from './hooks/useGeminiLive';
import AudioVisualizer from './components/AudioVisualizer';
import { formatDuration, formatSize } from './utils/audio';

type InputMode = 'mic' | 'file';

/**
 * Audio Player Component - Reusable for both original and transformed audio
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

  // Create URL when blob changes
  useEffect(() => {
    if (blob) {
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      setCurrentTime(0);
      setIsPlaying(false);
      return () => URL.revokeObjectURL(url);
    }
  }, [blob]);

  // Audio events
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
  const sliderThumb = colorClass === 'blue' ? 'bg-blue-500' : 'bg-green-500';

  return (
    <div className={`bg-gradient-to-br ${bgClass} border rounded-xl p-4`}>
      {audioUrl && <audio ref={audioRef} src={audioUrl} preload="metadata" />}
      
      {/* Header */}
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

      {/* Player Controls */}
      <div className="flex items-center gap-3 mb-3">
        {/* Play/Pause */}
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

        {/* Progress */}
        <div className="flex-1">
          <input
            type="range"
            min="0"
            max={duration || 100}
            step="0.1"
            value={currentTime}
            onChange={handleSeek}
            className={`w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:${sliderThumb} [&::-webkit-slider-thumb]:rounded-full`}
          />
          <div className="flex justify-between text-[10px] text-zinc-600 mt-1">
            <span>{formatDuration(currentTime)}</span>
            <span>{formatDuration(duration)}</span>
          </div>
        </div>
      </div>

      {/* Download Button */}
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

  // Check if we have any recordings
  const hasRecordings = originalAudioBlob || transformedAudioBlob;

  const handleToggleConnection = () => {
    if (status === 'connected' || status === 'connecting') {
      disconnect();
    } else {
      if (inputMode === 'file' && !selectedFile) {
        alert("Please select an audio file first.");
        return;
      }
      connect(selectedPersona, inputMode === 'file' ? selectedFile! : undefined, selectedLanguage);
    }
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

  // Generate filenames
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
          {/* Language */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-zinc-500 font-bold uppercase">Language</label>
            <select
              value={selectedLanguage}
              onChange={(e) => {
                setSelectedLanguage(e.target.value as LanguageCode);
                if (status === 'connected') disconnect();
              }}
              disabled={status === 'connecting'}
              className="bg-zinc-900 border border-zinc-800 text-zinc-300 py-2 px-3 rounded-lg text-sm focus:outline-none focus:border-blue-500"
            >
              {SUPPORTED_LANGUAGES.map(lang => (
                <option key={lang.code} value={lang.code}>{lang.flag} {lang.name}</option>
              ))}
            </select>
          </div>

          {/* Source */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-zinc-500 font-bold uppercase">Source</label>
            <div className="bg-zinc-900 p-1 rounded-lg flex border border-zinc-800">
              <button
                onClick={() => { setInputMode('mic'); disconnect(); }}
                disabled={isApiKeyMissing}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${inputMode === 'mic' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                🎙 Mic
              </button>
              <button
                onClick={() => { setInputMode('file'); disconnect(); }}
                disabled={isApiKeyMissing}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${inputMode === 'file' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
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
          
          {/* Visualizer */}
          <div className="bg-zinc-900/30 border border-zinc-800 rounded-2xl p-5 shadow-2xl relative overflow-hidden min-h-[240px] flex flex-col">
            
            {/* Header */}
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold">
                  {status === 'connected' ? '🔴 Recording' : 'Ready'}
                </h2>
                {status === 'connected' && (
                  <>
                    <span className="px-2 py-1 bg-red-500/20 text-red-400 text-xs font-mono rounded-full border border-red-500/30">
                      {formatDuration(recordingDuration)}
                    </span>
                    {inputMode === 'mic' && (
                      <span className={`px-2 py-1 text-xs font-mono rounded-full border ${isVadActive ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-zinc-800 text-zinc-500 border-zinc-700'}`}>
                        {isVadActive ? '● Voice' : '○ Silent'}
                      </span>
                    )}
                  </>
                )}
              </div>
              <button
                onClick={() => setShowCallGuide(!showCallGuide)}
                className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-400 px-3 py-1.5 rounded-full"
              >
                📞 Guide
              </button>
            </div>

            {/* Phone Guide */}
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

            {/* Content */}
            <div className="flex-1 flex flex-col items-center justify-center gap-3">
              
              {/* File Upload */}
              {inputMode === 'file' && status === 'disconnected' && !hasRecordings && (
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

              {/* Visualizer */}
              {(inputMode === 'mic' || status === 'connected') && !hasRecordings && (
                <div className="w-full">
                  <div className={`transition-opacity ${!isVadActive && inputMode === 'mic' && status === 'connected' ? 'opacity-40' : 'opacity-100'}`}>
                    <AudioVisualizer
                      stream={mediaStream || undefined}
                      isListening={status === 'connected' || !!mediaStream}
                      accentColor={status === 'connected' ? '#3b82f6' : '#52525b'}
                    />
                  </div>
                  
                  {inputMode === 'mic' && (
                    <div className="flex items-center gap-3 mt-3 bg-zinc-900/50 px-4 py-2 rounded-full border border-zinc-800 max-w-xs mx-auto">
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
                </div>
              )}

              {/* Status */}
              {status === 'connecting' && <p className="text-yellow-500 text-sm">Connecting...</p>}
              {status === 'disconnected' && !hasRecordings && !isApiKeyMissing && (
                <p className="text-zinc-600 text-sm">
                  {inputMode === 'mic' ? 'Ready to record' : selectedFile ? 'Ready' : 'Select a file'}
                </p>
              )}
            </div>
          </div>

          {/* Audio Players - Show after recording */}
          {hasRecordings && status === 'disconnected' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
              
              {/* Success Header */}
              <div className="flex items-center gap-2 px-1">
                <span className="text-green-400 text-lg">✓</span>
                <h3 className="font-semibold text-green-400">Recording Complete!</h3>
                <span className="text-zinc-500 text-sm">• Play & Download below</span>
              </div>

              {/* Two Audio Players Side by Side */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Original Voice */}
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

                {/* Transformed Voice */}
                {transformedAudioBlob && (
                  <AudioPlayer
                    blob={transformedAudioBlob}
                    title="Transformed Voice"
                    subtitle={`${selectedPersona.name} • AI Generated`}
                    icon="🎭"
                    colorClass="green"
                    filename={transformedFilename}
                  />
                )}
              </div>

              <p className="text-center text-xs text-zinc-600">
                ✓ WAV format • Works on Mobile, WhatsApp & All Players
              </p>
            </div>
          )}

          {/* Main Button */}
          <button
            onClick={handleToggleConnection}
            disabled={isApiKeyMissing || status === 'connecting' || (inputMode === 'file' && !selectedFile)}
            className={`
              w-full py-4 rounded-xl text-lg font-bold transition-all shadow-lg flex items-center justify-center gap-3
              ${status === 'connected'
                ? 'bg-red-500/10 border border-red-500 text-red-500 hover:bg-red-500/20'
                : (inputMode === 'file' && !selectedFile) || isApiKeyMissing
                  ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white'
              }
              ${status === 'connecting' ? 'opacity-70 cursor-wait' : ''}
            `}
          >
            {status === 'connecting' ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Connecting...
              </>
            ) : status === 'connected' ? (
              <>⏹ Stop Recording</>
            ) : hasRecordings ? (
              <>🎙 New Recording</>
            ) : (
              <>{inputMode === 'mic' ? '🎙 Start Voice Changer' : '▶ Process File'}</>
            )}
          </button>

          {error && (
            <div className="bg-red-900/20 border border-red-900/50 text-red-400 p-3 rounded-lg text-sm text-center">
              ⚠️ {error}
            </div>
          )}
        </div>

        {/* Right Panel - Personas */}
        <div className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold text-zinc-400">Select Voice</h3>
          
          <div className={`grid grid-cols-1 gap-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar ${isApiKeyMissing ? 'opacity-50 pointer-events-none' : ''}`}>
            {PERSONAS.map(persona => (
              <PersonaCard
                key={persona.id}
                persona={persona}
                isSelected={selectedPersona.id === persona.id}
                onClick={handlePersonaSelect}
                disabled={status === 'connecting'}
              />
            ))}
          </div>

          {/* Info */}
          <div className="space-y-2 mt-2">
            <div className="bg-blue-900/10 border border-blue-900/30 p-3 rounded-xl">
              <h4 className="text-blue-400 text-xs font-bold mb-1">⚡ How it Works</h4>
              <p className="text-[11px] text-zinc-500">Speak → AI transforms your voice → Get both original & transformed recordings.</p>
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
