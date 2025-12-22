import React, { useState, useRef } from 'react';
import { PERSONAS, SUPPORTED_LANGUAGES, DEFAULT_VAD_THRESHOLD, DEFAULT_LANGUAGE } from './constants';
import { Persona, LanguageCode } from './types';
import PersonaCard from './components/PersonaCard';
import { useGeminiLive } from './hooks/useGeminiLive';
import AudioVisualizer from './components/AudioVisualizer';

type InputMode = 'mic' | 'file';

// Format duration as MM:SS
const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

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
    downloadUrl,
    recordingDuration
  } = useGeminiLive({ apiKey, vadThreshold });

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
      }, 500);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      if (status === 'connected') disconnect();
    }
  };

  // Generate filename with timestamp
  const getDownloadFilename = () => {
    const now = new Date();
    const timestamp = now.toISOString().slice(0, 19).replace(/[T:]/g, '-');
    return `voice-morph-${selectedPersona.id}-${timestamp}.wav`;
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center p-4 md:p-8 relative overflow-x-hidden">

      {isApiKeyMissing && (
        <div className="fixed top-0 left-0 w-full bg-red-600 text-white text-center py-2 z-50 shadow-lg font-medium">
          ⚠️ Missing API Key. Application is disabled.
        </div>
      )}

      <header className={`w-full max-w-5xl mb-8 flex flex-col md:flex-row justify-between items-center border-b border-zinc-900 pb-6 gap-4 ${isApiKeyMissing ? 'mt-8' : ''}`}>
        <div className="md:pr-4">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">
            Voice Morph
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-zinc-500">Real-time AI Voice Transformation</p>
            <span className="bg-blue-900/30 text-blue-400 text-[10px] px-2 py-0.5 rounded border border-blue-800 font-mono">
              LIVE
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4 flex-wrap justify-center">
          {/* Language Selector */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider ml-1">Language</label>
            <div className="relative group">
              <select
                value={selectedLanguage}
                onChange={(e) => {
                  setSelectedLanguage(e.target.value as LanguageCode);
                  if (status === 'connected') disconnect();
                }}
                disabled={status === 'connecting'}
                className="appearance-none bg-zinc-900 border border-zinc-800 text-zinc-300 py-2 pl-3 pr-8 rounded-lg text-sm focus:outline-none focus:border-blue-500 cursor-pointer hover:bg-zinc-800 transition-colors"
              >
                {SUPPORTED_LANGUAGES.map(lang => (
                  <option key={lang.code} value={lang.code}>
                    {lang.flag} {lang.name}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-zinc-500">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
              </div>
            </div>
          </div>

          {/* Source Selector */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider ml-1">Source</label>
            <div className="bg-zinc-900 p-1 rounded-lg flex border border-zinc-800">
              <button
                onClick={() => { setInputMode('mic'); disconnect(); }}
                disabled={isApiKeyMissing}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${inputMode === 'mic' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'} ${isApiKeyMissing ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                🎙 Mic
              </button>
              <button
                onClick={() => { setInputMode('file'); disconnect(); }}
                disabled={isApiKeyMissing}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${inputMode === 'file' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'} ${isApiKeyMissing ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                📁 File
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-3 gap-8">

        <div className="lg:col-span-2 flex flex-col gap-6">
          <div className="bg-zinc-900/30 border border-zinc-800 rounded-2xl p-6 shadow-2xl relative overflow-hidden min-h-[320px] flex flex-col">
            <div className="mb-4 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  {status === 'connected' ? '🔴 Live' : 'Preview'}
                </h2>
                {status === 'connected' && (
                  <div className="flex items-center gap-2">
                    {inputMode === 'mic' && (
                      <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-mono tracking-wide transition-all ${isVadActive ? 'bg-green-500/10 border-green-500/50 text-green-400' : 'bg-zinc-800 border-zinc-700 text-zinc-500'}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${isVadActive ? 'bg-green-400 animate-pulse' : 'bg-zinc-600'}`}></div>
                        {isVadActive ? 'DETECTING' : 'WAITING'}
                      </div>
                    )}
                    {/* Recording Duration */}
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/50 text-red-400 text-[10px] font-mono">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></div>
                      {formatDuration(recordingDuration)}
                    </div>
                  </div>
                )}
              </div>
              <button
                onClick={() => setShowCallGuide(!showCallGuide)}
                className="text-xs flex items-center gap-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded-full transition-colors"
              >
                <span>📞</span> Phone Guide
              </button>
            </div>

            {showCallGuide && (
              <div className="absolute inset-0 z-20 bg-zinc-950/95 backdrop-blur-md p-6 flex flex-col items-center justify-center text-center animate-in fade-in zoom-in-95 duration-200">
                <h3 className="text-xl font-bold text-white mb-2">Use with Phone Calls</h3>
                <p className="text-zinc-400 text-sm max-w-md mb-6 leading-relaxed">
                  To use this with a phone call, use the <strong>Two-Device Method</strong>:
                </p>
                <div className="grid grid-cols-3 gap-4 w-full max-w-lg mb-6 text-zinc-300">
                  <div className="bg-zinc-900 p-3 rounded-lg border border-zinc-800">
                    <div className="text-2xl mb-2">1️⃣</div>
                    <div className="text-[10px] uppercase font-bold text-zinc-500">Device A</div>
                    <div className="text-xs">Run this app on your PC</div>
                  </div>
                  <div className="bg-zinc-900 p-3 rounded-lg border border-zinc-800">
                    <div className="text-2xl mb-2">2️⃣</div>
                    <div className="text-[10px] uppercase font-bold text-zinc-500">Connection</div>
                    <div className="text-xs">Aux Cable PC → Phone Mic</div>
                  </div>
                  <div className="bg-zinc-900 p-3 rounded-lg border border-zinc-800">
                    <div className="text-2xl mb-2">3️⃣</div>
                    <div className="text-[10px] uppercase font-bold text-zinc-500">Call</div>
                    <div className="text-xs">Speak into PC Microphone</div>
                  </div>
                </div>
                <button
                  onClick={() => setShowCallGuide(false)}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-medium transition-colors"
                >
                  Close Guide
                </button>
              </div>
            )}

            <div className="flex-1 flex flex-col items-center justify-center gap-6 w-full relative">
              {inputMode === 'file' && status === 'disconnected' && (
                <div
                  onClick={() => !isApiKeyMissing && fileInputRef.current?.click()}
                  className={`w-full h-32 border-2 border-dashed rounded-xl flex flex-col items-center justify-center transition-all group ${isApiKeyMissing
                    ? 'border-zinc-800 cursor-not-allowed opacity-50'
                    : 'border-zinc-700 cursor-pointer hover:border-blue-500 hover:bg-zinc-800/50'
                    }`}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="audio/*"
                    className="hidden"
                    disabled={isApiKeyMissing}
                  />
                  {selectedFile ? (
                    <div className="text-center">
                      <p className="text-blue-400 font-medium mb-1">{selectedFile.name}</p>
                      <p className="text-zinc-500 text-xs">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                  ) : (
                    <div className="text-center text-zinc-500 group-hover:text-zinc-300">
                      <p className="font-medium">Click to upload audio file</p>
                      <p className="text-xs mt-1">MP3, WAV, M4A supported</p>
                    </div>
                  )}
                </div>
              )}

              {(inputMode === 'mic' || status === 'connected') && (
                <div className="relative w-full flex flex-col items-center">
                  <div className={`transition-opacity duration-300 w-full ${!isVadActive && inputMode === 'mic' && status === 'connected' ? 'opacity-30 blur-[1px]' : 'opacity-100'}`}>
                    <AudioVisualizer
                      stream={mediaStream || undefined}
                      isListening={status === 'connected' || (!!mediaStream && !isApiKeyMissing)}
                      accentColor={status === 'connected' ? '#3b82f6' : '#52525b'}
                    />
                  </div>

                  {inputMode === 'mic' && (
                    <div className="absolute -bottom-8 w-64 flex items-center gap-3 bg-zinc-900/80 px-4 py-2 rounded-full border border-zinc-800 backdrop-blur">
                      <span className="text-[10px] text-zinc-400 uppercase font-bold whitespace-nowrap">Gate</span>
                      <input
                        type="range"
                        min="0.001"
                        max="0.1"
                        step="0.001"
                        value={vadThreshold}
                        onChange={(e) => setVadThreshold(parseFloat(e.target.value))}
                        className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:bg-blue-400"
                        title="Adjust microphone sensitivity threshold"
                      />
                    </div>
                  )}
                </div>
              )}
              <div className="h-4"></div>
            </div>

            <div className="text-center h-8 mt-2 flex flex-col items-center justify-center">
              {status === 'connected' && (
                <p className="text-sm text-zinc-500 font-mono flex items-center gap-2">
                  <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                  {inputMode === 'mic' ? 'RECORDING...' : 'PROCESSING...'}
                </p>
              )}
              {status === 'connecting' && (
                <p className="text-sm text-yellow-500">
                  Connecting...
                </p>
              )}
              {status === 'disconnected' && !isApiKeyMissing && !downloadUrl && (
                <p className="text-sm text-zinc-600">
                  {inputMode === 'mic' ? 'Ready to record.' : selectedFile ? 'Ready to process.' : 'Select an audio file.'}
                </p>
              )}
              {downloadUrl && status === 'disconnected' && (
                <p className="text-sm text-green-400 animate-in fade-in slide-in-from-top-1">
                  ✓ Recording saved! Download below.
                </p>
              )}
            </div>
          </div>

          {/* Download Section - Enhanced */}
          {downloadUrl && status === 'disconnected' && (
            <div className="bg-gradient-to-r from-green-900/20 to-emerald-900/20 border border-green-700/50 rounded-2xl p-6 animate-in fade-in slide-in-from-top-2">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-green-400">Recording Complete!</h3>
                    <p className="text-xs text-zinc-400">WAV format • Works on all devices & WhatsApp</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-zinc-500">Duration</p>
                  <p className="text-lg font-mono text-green-400">{formatDuration(recordingDuration)}</p>
                </div>
              </div>
              
              <a
                href={downloadUrl}
                download={getDownloadFilename()}
                className="w-full py-4 rounded-xl text-md font-bold tracking-wide transition-all duration-300 bg-green-600 hover:bg-green-500 text-white flex items-center justify-center gap-3 shadow-lg shadow-green-900/30"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
                Download WAV Audio
              </a>
              
              <p className="text-center text-xs text-zinc-500 mt-3">
                ✓ Mobile Compatible • ✓ WhatsApp Ready • ✓ All Media Players
              </p>
            </div>
          )}

          {/* Main Action Button */}
          <button
            onClick={handleToggleConnection}
            disabled={isApiKeyMissing || status === 'connecting' || (inputMode === 'file' && !selectedFile)}
            className={`
              w-full py-5 rounded-xl text-lg font-bold tracking-wide transition-all duration-300 shadow-lg
              flex items-center justify-center gap-3
              ${status === 'connected'
                ? 'bg-red-500/10 border border-red-500 text-red-500 hover:bg-red-500/20 shadow-[0_0_30px_rgba(239,68,68,0.2)]'
                : (inputMode === 'file' && !selectedFile) || isApiKeyMissing
                  ? 'bg-zinc-800 border-zinc-700 text-zinc-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-[0_0_30px_rgba(59,130,246,0.3)]'
              }
              ${status === 'connecting' ? 'opacity-70 cursor-wait' : ''}
            `}
          >
            {status === 'connecting' ? (
              <>
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Initializing...
              </>
            ) : status === 'connected' ? (
              <>
                <span>⏹</span> Stop & Save Recording
              </>
            ) : (
              <>
                {inputMode === 'mic' ? (
                  <><span>🎙</span> Start Voice Changer</>
                ) : (
                  <><span>▶</span> Process Audio File</>
                )}
              </>
            )}
          </button>

          {error && (
            <div className="bg-red-900/20 border border-red-900/50 text-red-400 p-4 rounded-lg text-sm text-center font-medium animate-in fade-in slide-in-from-top-2">
              ⚠️ {error}
            </div>
          )}

        </div>

        {/* Persona Selection Panel */}
        <div className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold text-zinc-400 px-1">Select Voice</h3>
          <div className={`grid grid-cols-1 gap-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar ${isApiKeyMissing ? 'opacity-50 pointer-events-none' : ''}`}>
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

          {/* Info Box */}
          <div className="bg-blue-900/10 border border-blue-900/30 p-4 rounded-xl mt-2">
            <h4 className="text-blue-400 text-sm font-bold mb-1">💡 How it works</h4>
            <p className="text-xs text-blue-300/70 leading-relaxed">
              Select a voice persona, click Start, and speak into your microphone. 
              AI transforms your voice in real-time. Download as WAV file when done.
            </p>
          </div>

          {/* Format Info */}
          <div className="bg-green-900/10 border border-green-900/30 p-4 rounded-xl">
            <h4 className="text-green-400 text-sm font-bold mb-1">📱 Universal Format</h4>
            <p className="text-xs text-green-300/70 leading-relaxed">
              Audio saves as WAV format - works everywhere: iPhone, Android, WhatsApp, 
              all media players. No conversion needed!
            </p>
          </div>
        </div>

      </main>

      <footer className="w-full max-w-5xl mt-12 pt-8 border-t border-zinc-900 text-center text-zinc-600 text-sm">
        <p>Voice Morph • Real-time AI Voice Transformation</p>
        <p className="text-xs mt-1 text-zinc-700">Powered by Google Gemini Native Audio</p>
      </footer>
    </div>
  );
};

export default App;
