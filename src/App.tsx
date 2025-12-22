import React, { useState, useRef, useEffect } from 'react';
import { PERSONAS, SUPPORTED_LANGUAGES, DEFAULT_VAD_THRESHOLD, DEFAULT_LANGUAGE } from './constants';
import { Persona, LanguageCode } from './types';
import PersonaCard from './components/PersonaCard';
import { useGeminiLive } from './hooks/useGeminiLive';
import AudioVisualizer from './components/AudioVisualizer';
import { formatDuration, formatSize } from './utils/audio';

type InputMode = 'mic' | 'file';

const App: React.FC = () => {
  const [selectedPersona, setSelectedPersona] = useState<Persona>(PERSONAS[0]);
  const [inputMode, setInputMode] = useState<InputMode>('mic');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showCallGuide, setShowCallGuide] = useState(false);
  const [vadThreshold, setVadThreshold] = useState(DEFAULT_VAD_THRESHOLD);
  const [selectedLanguage, setSelectedLanguage] = useState<LanguageCode>(DEFAULT_LANGUAGE);
  
  // Audio player state
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  const apiKey = process.env.API_KEY || '';
  const isApiKeyMissing = !apiKey;

  const {
    connect,
    disconnect,
    status,
    error,
    mediaStream,
    isVadActive,
    audioBlob,
    recordingDuration
  } = useGeminiLive({ apiKey, vadThreshold });

  // Create audio URL when blob is ready
  useEffect(() => {
    if (audioBlob) {
      // Revoke old URL
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
      const url = URL.createObjectURL(audioBlob);
      setAudioUrl(url);
      setPlaybackTime(0);
      setIsPlaying(false);
    }
  }, [audioBlob]);

  // Cleanup URL on unmount
  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, []);

  // Handle audio element events
  useEffect(() => {
    if (audioRef.current) {
      const audio = audioRef.current;
      
      const onTimeUpdate = () => setPlaybackTime(audio.currentTime);
      const onLoadedMetadata = () => setAudioDuration(audio.duration);
      const onEnded = () => {
        setIsPlaying(false);
        setPlaybackTime(0);
      };
      
      audio.addEventListener('timeupdate', onTimeUpdate);
      audio.addEventListener('loadedmetadata', onLoadedMetadata);
      audio.addEventListener('ended', onEnded);
      
      return () => {
        audio.removeEventListener('timeupdate', onTimeUpdate);
        audio.removeEventListener('loadedmetadata', onLoadedMetadata);
        audio.removeEventListener('ended', onEnded);
      };
    }
  }, [audioUrl]);

  const handleToggleConnection = () => {
    if (status === 'connected' || status === 'connecting') {
      disconnect();
    } else {
      if (inputMode === 'file' && !selectedFile) {
        alert("Please select an audio file first.");
        return;
      }
      // Reset player
      setAudioUrl(null);
      setIsPlaying(false);
      setPlaybackTime(0);
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

  // Play/Pause toggle
  const togglePlayback = () => {
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  // Seek audio
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current) return;
    const time = parseFloat(e.target.value);
    audioRef.current.currentTime = time;
    setPlaybackTime(time);
  };

  // Download handler
  const handleDownload = () => {
    if (!audioUrl) return;
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    const filename = `voice-morph-${selectedPersona.id}-${timestamp}.wav`;
    
    const a = document.createElement('a');
    a.href = audioUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center p-4 md:p-8 relative overflow-x-hidden">
      
      {/* Hidden audio element for playback */}
      {audioUrl && <audio ref={audioRef} src={audioUrl} preload="metadata" />}

      {isApiKeyMissing && (
        <div className="fixed top-0 left-0 w-full bg-red-600 text-white text-center py-2 z-50 shadow-lg font-medium">
          ⚠️ Missing API Key. Application is disabled.
        </div>
      )}

      {/* Header */}
      <header className={`w-full max-w-5xl mb-8 flex flex-col md:flex-row justify-between items-center border-b border-zinc-900 pb-6 gap-4 ${isApiKeyMissing ? 'mt-8' : ''}`}>
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">
            Voice Morph
          </h1>
          <p className="text-zinc-500 text-sm mt-1">Real-time AI Voice Transformation</p>
        </div>
        
        <div className="flex items-center gap-4 flex-wrap justify-center">
          {/* Language */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Language</label>
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
            <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Source</label>
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
      <main className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Panel - Voice Converter */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          
          {/* Visualizer Panel */}
          <div className="bg-zinc-900/30 border border-zinc-800 rounded-2xl p-6 shadow-2xl relative overflow-hidden min-h-[280px] flex flex-col">
            
            {/* Header */}
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold">
                  {status === 'connected' ? '🔴 Recording' : 'Ready'}
                </h2>
                {status === 'connected' && (
                  <span className="px-2 py-1 bg-red-500/20 text-red-400 text-xs font-mono rounded-full border border-red-500/30">
                    {formatDuration(recordingDuration)}
                  </span>
                )}
                {status === 'connected' && inputMode === 'mic' && (
                  <span className={`px-2 py-1 text-xs font-mono rounded-full border ${isVadActive ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-zinc-800 text-zinc-500 border-zinc-700'}`}>
                    {isVadActive ? '● Voice' : '○ Silent'}
                  </span>
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
              <div className="absolute inset-0 z-20 bg-zinc-950/98 backdrop-blur p-6 flex flex-col items-center justify-center text-center">
                <h3 className="text-lg font-bold mb-4">Use with Phone Calls</h3>
                <div className="grid grid-cols-3 gap-3 max-w-md mb-4 text-xs">
                  <div className="bg-zinc-900 p-3 rounded-lg border border-zinc-800">
                    <div className="text-xl mb-1">1️⃣</div>
                    <div className="text-zinc-400">PC runs this app</div>
                  </div>
                  <div className="bg-zinc-900 p-3 rounded-lg border border-zinc-800">
                    <div className="text-xl mb-1">2️⃣</div>
                    <div className="text-zinc-400">Aux cable to phone</div>
                  </div>
                  <div className="bg-zinc-900 p-3 rounded-lg border border-zinc-800">
                    <div className="text-xl mb-1">3️⃣</div>
                    <div className="text-zinc-400">Speak into PC mic</div>
                  </div>
                </div>
                <button onClick={() => setShowCallGuide(false)} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg text-sm">
                  Close
                </button>
              </div>
            )}

            {/* Content Area */}
            <div className="flex-1 flex flex-col items-center justify-center gap-4">
              
              {/* File Upload (when file mode & disconnected) */}
              {inputMode === 'file' && status === 'disconnected' && !audioUrl && (
                <div
                  onClick={() => !isApiKeyMissing && fileInputRef.current?.click()}
                  className={`w-full h-28 border-2 border-dashed rounded-xl flex flex-col items-center justify-center transition-all cursor-pointer ${isApiKeyMissing ? 'border-zinc-800 opacity-50' : 'border-zinc-700 hover:border-blue-500 hover:bg-zinc-800/30'}`}
                >
                  <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="audio/*" className="hidden" disabled={isApiKeyMissing} />
                  {selectedFile ? (
                    <div className="text-center">
                      <p className="text-blue-400 font-medium">{selectedFile.name}</p>
                      <p className="text-zinc-500 text-xs">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                  ) : (
                    <div className="text-center text-zinc-500">
                      <p>Click to upload audio file</p>
                      <p className="text-xs mt-1">MP3, WAV, M4A</p>
                    </div>
                  )}
                </div>
              )}

              {/* Audio Visualizer (mic mode or recording) */}
              {(inputMode === 'mic' || status === 'connected') && !audioUrl && (
                <div className="w-full">
                  <div className={`transition-opacity ${!isVadActive && inputMode === 'mic' && status === 'connected' ? 'opacity-40' : 'opacity-100'}`}>
                    <AudioVisualizer
                      stream={mediaStream || undefined}
                      isListening={status === 'connected' || !!mediaStream}
                      accentColor={status === 'connected' ? '#3b82f6' : '#52525b'}
                    />
                  </div>
                  
                  {/* Gate Threshold Slider */}
                  {inputMode === 'mic' && (
                    <div className="flex items-center gap-3 mt-4 bg-zinc-900/50 px-4 py-2 rounded-full border border-zinc-800 max-w-xs mx-auto">
                      <span className="text-[10px] text-zinc-500 uppercase font-bold">Sensitivity</span>
                      <input
                        type="range"
                        min="0.001"
                        max="0.1"
                        step="0.001"
                        value={vadThreshold}
                        onChange={(e) => setVadThreshold(parseFloat(e.target.value))}
                        className="flex-1 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-full"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Status Text */}
              {status === 'connecting' && (
                <p className="text-yellow-500 text-sm">Connecting...</p>
              )}
              {status === 'disconnected' && !audioUrl && !isApiKeyMissing && (
                <p className="text-zinc-600 text-sm">
                  {inputMode === 'mic' ? 'Ready to record' : selectedFile ? 'Ready to process' : 'Select a file'}
                </p>
              )}
            </div>
          </div>

          {/* Audio Player Panel (after recording) */}
          {audioUrl && status === 'disconnected' && (
            <div className="bg-gradient-to-br from-green-900/20 to-emerald-900/10 border border-green-700/40 rounded-2xl p-6 animate-in fade-in slide-in-from-bottom-2">
              
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
                    <span className="text-green-400 text-lg">✓</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-green-400">Recording Complete</h3>
                    <p className="text-xs text-zinc-500">WAV format • Universal compatibility</p>
                  </div>
                </div>
                {audioBlob && (
                  <div className="text-right text-xs text-zinc-500">
                    <div>{formatDuration(audioDuration || recordingDuration)}</div>
                    <div>{formatSize(audioBlob.size)}</div>
                  </div>
                )}
              </div>

              {/* Audio Player Controls */}
              <div className="bg-zinc-900/50 rounded-xl p-4 mb-4">
                <div className="flex items-center gap-4">
                  {/* Play/Pause Button */}
                  <button
                    onClick={togglePlayback}
                    className="w-12 h-12 bg-green-600 hover:bg-green-500 rounded-full flex items-center justify-center transition-all shadow-lg shadow-green-900/30"
                  >
                    {isPlaying ? (
                      <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <rect x="6" y="4" width="4" height="16" rx="1" />
                        <rect x="14" y="4" width="4" height="16" rx="1" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    )}
                  </button>

                  {/* Progress Bar */}
                  <div className="flex-1">
                    <input
                      type="range"
                      min="0"
                      max={audioDuration || 100}
                      step="0.1"
                      value={playbackTime}
                      onChange={handleSeek}
                      className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-green-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-md"
                    />
                    <div className="flex justify-between text-xs text-zinc-500 mt-1">
                      <span>{formatDuration(playbackTime)}</span>
                      <span>{formatDuration(audioDuration || recordingDuration)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Download Button */}
              <button
                onClick={handleDownload}
                className="w-full py-4 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-green-900/30"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download WAV
              </button>
              
              <p className="text-center text-xs text-zinc-600 mt-3">
                ✓ Works on Mobile • ✓ WhatsApp Ready • ✓ All Players
              </p>
            </div>
          )}

          {/* Main Action Button */}
          <button
            onClick={handleToggleConnection}
            disabled={isApiKeyMissing || status === 'connecting' || (inputMode === 'file' && !selectedFile)}
            className={`
              w-full py-5 rounded-xl text-lg font-bold transition-all shadow-lg flex items-center justify-center gap-3
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
            ) : audioUrl ? (
              <>🎙 New Recording</>
            ) : (
              <>{inputMode === 'mic' ? '🎙 Start Voice Changer' : '▶ Process File'}</>
            )}
          </button>

          {error && (
            <div className="bg-red-900/20 border border-red-900/50 text-red-400 p-4 rounded-lg text-sm text-center">
              ⚠️ {error}
            </div>
          )}
        </div>

        {/* Right Panel - Persona Selection */}
        <div className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold text-zinc-400">Select Voice</h3>
          
          <div className={`grid grid-cols-1 gap-3 max-h-[450px] overflow-y-auto pr-2 custom-scrollbar ${isApiKeyMissing ? 'opacity-50 pointer-events-none' : ''}`}>
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

          {/* Info Cards */}
          <div className="space-y-3 mt-2">
            <div className="bg-blue-900/10 border border-blue-900/30 p-3 rounded-xl">
              <h4 className="text-blue-400 text-xs font-bold mb-1">⚡ Fast Processing</h4>
              <p className="text-[11px] text-zinc-500">Optimized for low latency real-time voice transformation.</p>
            </div>
            <div className="bg-green-900/10 border border-green-900/30 p-3 rounded-xl">
              <h4 className="text-green-400 text-xs font-bold mb-1">📱 Universal Format</h4>
              <p className="text-[11px] text-zinc-500">WAV audio works on all devices, WhatsApp, and media players.</p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-5xl mt-12 pt-6 border-t border-zinc-900 text-center text-zinc-700 text-xs">
        Voice Morph • Powered by Google Gemini
      </footer>
    </div>
  );
};

export default App;
