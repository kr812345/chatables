import React, { useState, useEffect, useRef } from 'react';
import { 
  Settings, 
  MessageSquare, 
  Mic, 
  MicOff, 
  LogOut, 
  AlertTriangle, 
  Sparkles, 
  X, 
  ChevronLeft, 
  Globe, 
  Send,
  Loader2,
  Check,
  Sun,
  Moon
} from 'lucide-react';
import { ExtensionState, ChatMode, UserSettings } from '../types';
import { CONFIG } from '../config';

export default function PopupApp() {
  // Navigation: 'home' | 'choose-mode' | 'settings'
  const [view, setView] = useState<'home' | 'choose-mode' | 'settings'>('home');
  
  // App Chat State synchronized from chrome.storage.local
  const [appState, setAppState] = useState<ExtensionState>({
    status: 'idle',
    mode: null,
    name: null,
    peerName: null,
    messages: [],
    isPeerTyping: false,
    isMuted: false,
    error: null,
  });

  // Local settings state
  const [settings, setSettings] = useState<UserSettings>({
    userId: '',
    interests: [],
    niche: '',
    gender: 'other',
    genderPref: 'any',
    websocketUrl: CONFIG.WEBSOCKET_URL,
  });

  // UI state variables
  const [interestInput, setInterestInput] = useState('');
  const [textMsg, setTextMsg] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [callDuration, setCallDuration] = useState(0);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isVoiceChatOpen, setIsVoiceChatOpen] = useState(false); // Toggle chat drawer during voice
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  // Load and apply theme on mount
  useEffect(() => {
    chrome.storage.local.get(['theme'], (result) => {
      const loadedTheme = result.theme || 'dark';
      setTheme(loadedTheme);
      document.documentElement.className = loadedTheme;
    });
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    document.documentElement.className = nextTheme;
    chrome.storage.local.set({ theme: nextTheme });
  };

  // References
  const messageEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<any>(null);
  const timerIntervalRef = useRef<any>(null);

  // 1. Sync App State and Settings from Chrome Storage on mount
  useEffect(() => {
    // Fetch state and settings
    chrome.storage.local.get(['appState', 'userId', 'interests', 'niche', 'gender', 'genderPref'], (result) => {
      if (result.appState) {
        setAppState(result.appState);
      }
      
      const loadedSettings: UserSettings = {
        userId: result.userId || '',
        interests: result.interests || [],
        niche: result.niche || '',
        gender: result.gender || 'other',
        genderPref: result.genderPref || 'any',
        websocketUrl: CONFIG.WEBSOCKET_URL,
      };
      setSettings(loadedSettings);
      setInterestInput(loadedSettings.interests.join(', '));
    });

    // Listen for state changes written by offscreen document
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
      if (areaName === 'local') {
        if (changes.appState) {
          setAppState(changes.appState.newValue);
        }
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  // 2. Manage Call Duration Timer for voice calls
  useEffect(() => {
    if (appState.status === 'chatting' && appState.mode === 'voice') {
      setCallDuration(0);
      timerIntervalRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      setCallDuration(0);
    }

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [appState.status, appState.mode]);

  // 3. Scroll messages container to bottom on new messages
  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [appState.messages, appState.isPeerTyping]);

  // Format call duration: mm:ss
  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Start matchmaking: Spawn offscreen document
  const handleStartMatchmaking = async (mode: ChatMode) => {
    if (mode === 'voice') {
      try {
        // Request microphone permission inside the visible popup to trigger Chrome prompt
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Stop the tracks immediately since we just wanted the permission grant
        stream.getTracks().forEach(track => track.stop());
      } catch (err: any) {
        console.error('Microphone permission denied:', err);
        const errorState = { 
          status: 'idle' as const, 
          mode: null,
          name: null,
          peerName: null,
          messages: [],
          isPeerTyping: false,
          isMuted: false,
          error: 'Microphone permission is required for voice chat. Please allow microphone access.' 
        };
        await chrome.storage.local.set({ appState: errorState });
        setAppState(errorState);
        setView('home');
        return;
      }
    }

    await chrome.storage.local.set({ matchmakingMode: mode });
    
    // Clear any previous error and set queuing state
    const cleanState: ExtensionState = {
      status: 'queuing',
      mode,
      name: null,
      peerName: null,
      messages: [],
      isPeerTyping: false,
      isMuted: false,
      error: null,
    };
    await chrome.storage.local.set({ appState: cleanState });
    setAppState(cleanState);

    // Call background worker to open the offscreen page
    chrome.runtime.sendMessage({ type: 'START_MATCHMAKING' }, (response) => {
      if (response && response.success) {
        // Send connect trigger immediately in case it was already open
        chrome.runtime.sendMessage({
          type: 'CONNECT_WS',
          payload: {
            mode,
            settings: {
              userId: settings.userId,
              interests: settings.interests,
              niche: settings.niche,
              gender: settings.gender,
              genderPref: settings.genderPref,
              websocketUrl: CONFIG.WEBSOCKET_URL,
            }
          }
        });
      } else if (response && !response.success) {
        console.error('Failed to initialize voice/signaling offscreen channel:', response.error);
        updateLocalError('Failed to spawn call channel');
      }
    });

    setView('home');
  };

  const updateLocalError = async (errText: string) => {
    const errorState = { ...appState, status: 'idle' as const, error: errText };
    await chrome.storage.local.set({ appState: errorState });
    setAppState(errorState);
  };

  // Stop matchmaking or leave chat
  const handleStop = async () => {
    const idleState: ExtensionState = {
      status: 'idle',
      mode: null,
      name: null,
      peerName: null,
      messages: [],
      isPeerTyping: false,
      isMuted: false,
      error: null,
    };
    await chrome.storage.local.set({ appState: idleState });
    setAppState(idleState);
    setView('home');
    
    chrome.runtime.sendMessage({ type: 'STOP_MATCHMAKING' });
  };

  // Save local preferences
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanInterests = interestInput
      .split(',')
      .map((i) => i.trim())
      .filter((i) => i.length > 0);

    const updatedSettings = {
      ...settings,
      interests: cleanInterests,
    };

    await chrome.storage.local.set(updatedSettings);
    setSettings(updatedSettings);
    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
      setView('home');
    }, 1200);
  };

  // Send Text Message to Matched Peer
  const handleSendText = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!textMsg.trim()) return;

    chrome.runtime.sendMessage({
      type: 'SEND_TEXT_MSG',
      payload: { text: textMsg.trim() },
    });

    setTextMsg('');
    handleTyping(false);
  };

  // Typing indicator broadcast
  const handleTyping = (typingState: boolean) => {
    if (isTyping === typingState) return;
    setIsTyping(typingState);
    chrome.runtime.sendMessage({
      type: 'SET_TYPING',
      payload: { isTyping: typingState },
    });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTextMsg(e.target.value);
    handleTyping(true);

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      handleTyping(false);
    }, 1500);
  };

  // Mute voice channel
  const handleToggleMute = () => {
    chrome.runtime.sendMessage({
      type: 'MUTE_MIC',
      payload: { isMuted: !appState.isMuted },
    });
  };

  // Submit Abuse Report
  const handleSubmitReport = () => {
    if (!reportReason.trim()) return;
    chrome.runtime.sendMessage({
      type: 'REPORT_PEER',
      payload: { reason: reportReason.trim() },
    });
    setShowReportModal(false);
    setReportReason('');
  };

  // Render view templates
  if (view === 'settings') {
    return (
      <div className="w-full h-full flex flex-col bg-dark-950 text-dark-100 p-4 font-sans">
        <div className="flex items-center justify-between mb-4 border-b border-dark-800 pb-2">
          <button 
            onClick={() => setView('home')}
            className="flex items-center gap-1 text-sm text-dark-400 hover:text-dark-100 transition-colors"
          >
            <ChevronLeft size={16} /> Back
          </button>
          <h2 className="font-semibold text-brand-300 flex items-center gap-1">
            <Settings size={16} /> Local Preferences
          </h2>
          <div className="w-8"></div>
        </div>

        <form onSubmit={handleSaveSettings} className="flex-1 flex flex-col gap-3 overflow-y-auto pr-1">
          <div>
            <label className="block text-xs font-medium text-dark-400 mb-1">Interests / Topics (Comma separated)</label>
            <input
              type="text"
              value={interestInput}
              onChange={(e) => setInterestInput(e.target.value)}
              placeholder="e.g., Coding, Gaming, Techno"
              className="w-full text-sm bg-dark-900 border border-dark-800 rounded px-2.5 py-1.5 focus:outline-none focus:border-brand-500 text-dark-100 placeholder-dark-600"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-dark-400 mb-1">Niche (Specific sub-interest)</label>
            <input
              type="text"
              value={settings.niche}
              onChange={(e) => setSettings({ ...settings, niche: e.target.value })}
              placeholder="e.g., React, Dark Souls, Synthwave"
              className="w-full text-sm bg-dark-900 border border-dark-800 rounded px-2.5 py-1.5 focus:outline-none focus:border-brand-500 text-dark-100 placeholder-dark-600"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-dark-400 mb-1">Your Gender</label>
              <select
                value={settings.gender}
                onChange={(e: any) => setSettings({ ...settings, gender: e.target.value })}
                className="w-full text-sm bg-dark-900 border border-dark-800 rounded px-2 py-1.5 focus:outline-none focus:border-brand-500 text-dark-100"
              >
                <option value="other">Other / Secret</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-dark-400 mb-1">Match Preference</label>
              <select
                value={settings.genderPref}
                onChange={(e: any) => setSettings({ ...settings, genderPref: e.target.value })}
                className="w-full text-sm bg-dark-900 border border-dark-800 rounded px-2 py-1.5 focus:outline-none focus:border-brand-500 text-dark-100"
              >
                <option value="any">Any Gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
          </div>


          <p className="text-[10px] text-dark-500 italic mt-1 leading-relaxed">
            * All matching inputs are stored locally in your browser cache and only sent temporarily during matchmaking queues.
          </p>

          <button
            type="submit"
            disabled={saveSuccess}
            className="w-full bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white font-medium text-sm py-2 px-4 rounded mt-auto flex items-center justify-center gap-1 transition-all shadow-[0_0_15px_rgba(139,92,246,0.1)] active:scale-95"
          >
            {saveSuccess ? (
              <>
                <Check size={16} className="text-emerald-400" /> Preferences Saved!
              </>
            ) : (
              'Save & Return'
            )}
          </button>
        </form>
      </div>
    );
  }

  // Active chat interface (chatting status)
  if (appState.status === 'chatting') {
    const isVoice = appState.mode === 'voice';

    return (
      <div className="w-full h-full flex flex-col bg-dark-950 text-dark-100 font-sans relative">
        {/* Connection Header */}
        <div className="bg-dark-900 border-b border-dark-800 px-4 py-3 flex items-center justify-between shadow-sm">
          <div className="flex flex-col">
            <span className="text-xs text-brand-300 font-medium tracking-wide flex items-center gap-1.5 uppercase">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Matched {isVoice ? '🎙 Voice' : '💬 Text'}
            </span>
            <span className="text-sm font-semibold text-white truncate max-w-[180px]">
              {appState.peerName || 'Anonymous Traveler'}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button 
              onClick={() => setShowReportModal(true)}
              title="Report User"
              className="p-2 rounded text-dark-400 hover:text-amber-500 hover:bg-dark-800 transition-all"
            >
              <AlertTriangle size={16} />
            </button>
            <button 
              onClick={handleStop}
              title="Leave Chat"
              className="p-2 rounded text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 transition-all border border-rose-950/20"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>

        {/* VOICE CALL INTERFACE */}
        {isVoice ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 relative overflow-hidden">
            {/* Ambient call graphics */}
            <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
              <div className="w-56 h-56 rounded-full border border-brand-500 animate-ping"></div>
            </div>

            <div className="flex flex-col items-center gap-4 text-center z-10">
              <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-brand-600 to-indigo-600 flex items-center justify-center shadow-lg relative shadow-brand-500/20">
                <Mic size={32} className="text-white" />
                {!appState.isMuted && (
                  <>
                    <div className="pulse-ring"></div>
                    <div className="pulse-ring-2"></div>
                  </>
                )}
              </div>

              <div>
                <h3 className="text-base font-bold text-white mb-0.5">{appState.peerName}</h3>
                <p className="text-xs text-dark-400">Live Voice Stream Connected</p>
              </div>

              <div className="bg-dark-900 border border-dark-800 px-3 py-1 rounded-full text-xs font-mono text-brand-300">
                {formatTimer(callDuration)}
              </div>
            </div>

            {/* Voice call action panel */}
            <div className="w-full flex justify-center gap-4 mt-8 z-10">
              <button
                onClick={handleToggleMute}
                className={`p-4 rounded-full flex items-center justify-center transition-all ${
                  appState.isMuted 
                    ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-900/30' 
                    : 'bg-dark-800 hover:bg-dark-700 text-brand-300 hover:text-white border border-dark-700'
                } shadow-md`}
              >
                {appState.isMuted ? <MicOff size={20} /> : <Mic size={20} />}
              </button>
              
              <button
                onClick={() => setIsVoiceChatOpen(!isVoiceChatOpen)}
                className={`p-4 rounded-full flex items-center justify-center transition-all ${
                  isVoiceChatOpen 
                    ? 'bg-brand-600 text-white border border-brand-500' 
                    : 'bg-dark-800 hover:bg-dark-700 text-dark-300 border border-dark-700'
                } shadow-md`}
                title="Toggle Text Drawer"
              >
                <MessageSquare size={20} />
              </button>
            </div>

            {/* SEAMLESS TEXT DRAWER FOR VOICE MODE */}
            {isVoiceChatOpen && (
              <div className="absolute inset-0 bg-dark-950/95 z-20 flex flex-col border-t border-dark-800 animate-slide-up">
                <div className="px-4 py-2 border-b border-dark-800 flex items-center justify-between bg-dark-900">
                  <span className="text-xs text-dark-400 font-semibold uppercase tracking-wider">Voice Text Channel</span>
                  <button onClick={() => setIsVoiceChatOpen(false)} className="text-dark-500 hover:text-dark-300">
                    <X size={16} />
                  </button>
                </div>
                {renderMessagesWindow()}
                {renderChatInput()}
              </div>
            )}
          </div>
        ) : (
          /* TEXT CALL INTERFACE */
          <>
            {renderMessagesWindow()}
            {renderChatInput()}
          </>
        )}

        {/* REPORT MODAL */}
        {showReportModal && renderReportModal()}
      </div>
    );
  }

  // Matchmaking or waiting interface (queuing status)
  if (appState.status === 'queuing') {
    return (
      <div className="w-full h-full flex flex-col bg-dark-950 text-dark-100 p-6 items-center justify-center font-sans relative">
        <div className="flex flex-col items-center gap-6 text-center z-10">
          {/* Matchmaking glowing loader animation */}
          <div className="w-24 h-24 rounded-full bg-dark-900 border border-brand-500/20 flex items-center justify-center relative shadow-[0_0_30px_rgba(139,92,246,0.05)]">
            <Loader2 size={32} className="text-brand-400 animate-spin" />
            <div className="pulse-ring"></div>
            <div className="pulse-ring-2"></div>
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="text-lg font-bold text-white tracking-wide">Finding a connection...</h3>
            <p className="text-xs text-dark-400 max-w-[240px] leading-relaxed">
              Matching you anonymouly based on your interests.
            </p>
            {settings.interests.length > 0 && (
              <div className="flex flex-wrap justify-center gap-1.5 mt-2 max-w-[280px]">
                {settings.interests.map((tag, idx) => (
                  <span key={idx} className="bg-brand-950/80 border border-brand-900/60 text-brand-300 text-[10px] px-2 py-0.5 rounded-full font-medium">
                    #{tag}
                  </span>
                ))}
                {settings.niche && (
                  <span className="bg-indigo-950/80 border border-indigo-900/60 text-indigo-300 text-[10px] px-2 py-0.5 rounded-full font-medium">
                    {settings.niche}
                  </span>
                )}
              </div>
            )}
          </div>
          
          <div className="text-[11px] text-brand-400/60 italic font-mono bg-dark-900/40 border border-dark-800/20 rounded px-2.5 py-1">
            As: {appState.name || 'Generating name...'}
          </div>
        </div>

        <button
          onClick={handleStop}
          className="w-full bg-dark-900 hover:bg-dark-800 text-dark-300 font-medium text-sm py-2 px-4 rounded-lg mt-auto border border-dark-800 transition-all"
        >
          Cancel Matchmaking
        </button>
      </div>
    );
  }

  // Home Screen View (status = idle)
  return (
    <div className="w-full h-full flex flex-col bg-dark-950 text-dark-100 p-5 font-sans justify-between">
      {/* Home Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-gradient-to-tr from-brand-600 to-indigo-600 flex items-center justify-center shadow-md">
            <Sparkles size={16} className="text-white" />
          </div>
          <h1 className="text-base font-bold text-white tracking-wide font-sans">Chatables</h1>
        </div>

        <div className="flex items-center gap-2">
          <button 
            type="button"
            onClick={toggleTheme}
            className="p-2 rounded-full bg-dark-900 border border-dark-800 text-dark-400 hover:text-white hover:border-dark-700 transition-all active:scale-95 shadow-sm"
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          <button 
            onClick={() => setView('settings')}
            className="p-2 rounded-full bg-dark-900 border border-dark-800 text-dark-400 hover:text-white hover:border-dark-700 transition-all active:scale-95 shadow-sm"
          >
            <Settings size={16} />
          </button>
        </div>
      </div>

      {/* Main visual button container */}
      <div className="flex-1 flex flex-col items-center justify-center my-6 gap-6">
        <button
          onClick={() => setView('choose-mode')}
          className="w-28 h-28 rounded-full bg-gradient-to-tr from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white font-bold text-base shadow-lg shadow-brand-600/10 flex flex-col items-center justify-center gap-1.5 transition-all hover:scale-105 active:scale-95 border border-brand-400/20 relative group"
        >
          <span className="text-sm font-semibold tracking-wide">New Chat</span>
          <MessageSquare size={18} className="opacity-80 group-hover:scale-110 transition-transform" />
        </button>

        {appState.error && (
          <div className="bg-rose-950/30 border border-rose-900/40 text-rose-300 text-xs px-3.5 py-2.5 rounded-lg max-w-[280px] text-center leading-relaxed shadow-sm flex flex-col gap-2 items-center">
            <span>{appState.error}</span>
            {appState.error.includes('Microphone') && (
              <button
                type="button"
                onClick={() => chrome.runtime.openOptionsPage()}
                className="text-brand-400 hover:text-brand-350 font-bold underline cursor-pointer mt-1 active:scale-95"
              >
                👉 Click here to grant access
              </button>
            )}
          </div>
        )}

        {!appState.error && (
          <div className="text-center max-w-[260px] flex flex-col gap-1.5">
            <h3 className="text-xs font-semibold text-dark-400 uppercase tracking-widest">Privacy is the product</h3>
            <p className="text-[11px] text-dark-500 leading-relaxed">
              No accounts. No histories. Zero stored audio or messages. Every trace disappears instantly.
            </p>
          </div>
        )}
      </div>

      {/* Footer statistics or instructions */}
      <div className="border-t border-dark-900 pt-3 flex items-center justify-between text-[10px] text-dark-500">
        <span className="flex items-center gap-1">
          <Globe size={10} /> server: {new URL(settings.websocketUrl).host}
        </span>
        <span>v1.0.0</span>
      </div>

      {/* Choose Mode Modal Overlay */}
      {view === 'choose-mode' && (
        <div className="absolute inset-0 bg-dark-950/90 backdrop-blur-sm z-30 flex items-center justify-center p-6 transition-all">
          <div className="w-full bg-dark-900 border border-dark-800 rounded-xl p-5 shadow-2xl flex flex-col gap-4 animate-scale-up">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white tracking-wide uppercase">Select Chat Mode</h2>
              <button 
                onClick={() => setView('home')}
                className="text-dark-500 hover:text-dark-300 p-1 rounded-full hover:bg-dark-800"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handleStartMatchmaking('voice')}
                className="bg-brand-950 hover:bg-brand-900 border border-brand-900/50 hover:border-brand-700 p-4 rounded-lg flex flex-col items-center gap-2 text-center text-brand-300 font-semibold transition-all group hover:shadow-[0_0_15px_rgba(139,92,246,0.1)] active:scale-95"
              >
                <Mic size={24} className="group-hover:scale-110 transition-transform" />
                <span className="text-xs">🎙 Voice Chat</span>
              </button>

              <button
                onClick={() => handleStartMatchmaking('text')}
                className="bg-indigo-950 hover:bg-indigo-900 border border-indigo-900/50 hover:border-indigo-700 p-4 rounded-lg flex flex-col items-center gap-2 text-center text-indigo-300 font-semibold transition-all group hover:shadow-[0_0_15px_rgba(99,102,241,0.1)] active:scale-95"
              >
                <MessageSquare size={24} className="group-hover:scale-110 transition-transform" />
                <span className="text-xs">💬 Text Chat</span>
              </button>
            </div>

            <p className="text-[10px] text-dark-500 italic text-center">
              Microphone permission is only prompted when choosing Voice Chat.
            </p>
          </div>
        </div>
      )}
    </div>
  );

  // Helper renderers
  function renderMessagesWindow() {
    return (
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2.5">
        {appState.messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
            <span className="bg-brand-950/30 border border-brand-900/20 text-brand-400 text-[10px] uppercase font-semibold px-2.5 py-1 rounded-full mb-2 tracking-wider">Secure Connection Established</span>
            <p className="text-[11px] text-dark-500 max-w-[200px] leading-relaxed">
              Say hello! Remember, closing this screen destroys all records.
            </p>
          </div>
        ) : (
          appState.messages.map((msg) => {
            const isMe = msg.senderId === 'me';
            return (
              <div 
                key={msg.id}
                className={`flex flex-col max-w-[75%] ${isMe ? 'self-end items-end' : 'self-start items-start'}`}
              >
                <div className={`text-xs px-3 py-2 rounded-lg leading-relaxed shadow-sm ${
                  isMe 
                    ? 'bg-gradient-to-r from-brand-600 to-indigo-600 text-white rounded-tr-none' 
                    : 'bg-dark-900 border border-dark-800 text-dark-100 rounded-tl-none'
                }`}>
                  {msg.text}
                </div>
                <span className="text-[9px] text-dark-500 mt-0.5 px-1 font-mono">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            );
          })
        )}
        
        {/* Peer Typing Indicator */}
        {appState.isPeerTyping && (
          <div className="self-start flex items-center gap-1.5 bg-dark-900 border border-dark-800 px-3 py-2 rounded-lg rounded-tl-none text-[11px] text-dark-400 shadow-sm">
            <span className="font-semibold text-brand-300">{appState.peerName}</span> is typing
            <span className="flex gap-0.5 ml-1">
              <span className="w-1.5 h-1.5 rounded-full bg-dark-500 animate-bounce [animation-delay:-0.3s]"></span>
              <span className="w-1.5 h-1.5 rounded-full bg-dark-500 animate-bounce [animation-delay:-0.15s]"></span>
              <span className="w-1.5 h-1.5 rounded-full bg-dark-500 animate-bounce"></span>
            </span>
          </div>
        )}
        <div ref={messageEndRef} />
      </div>
    );
  }

  function renderChatInput() {
    return (
      <form 
        onSubmit={handleSendText}
        className="bg-dark-900 border-t border-dark-800 p-2.5 flex items-center gap-2"
      >
        <input
          type="text"
          value={textMsg}
          onChange={handleInputChange}
          placeholder="Type message anonymous..."
          className="flex-1 bg-dark-950 text-sm border border-dark-800 rounded-lg px-3 py-1.5 focus:outline-none focus:border-brand-500 text-dark-100 placeholder-dark-600"
        />
        <button
          type="submit"
          disabled={!textMsg.trim()}
          className="p-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white transition-all disabled:opacity-40 disabled:hover:bg-brand-600 active:scale-95 shadow-md shadow-brand-900/10"
        >
          <Send size={15} />
        </button>
      </form>
    );
  }

  function renderReportModal() {
    return (
      <div className="absolute inset-0 bg-dark-950/90 backdrop-blur-sm z-40 flex items-center justify-center p-6">
        <div className="w-full bg-dark-900 border border-dark-800 rounded-xl p-5 shadow-2xl flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-rose-400 flex items-center gap-1.5">
              <AlertTriangle size={18} /> Report Partner
            </h2>
            <button 
              onClick={() => setShowReportModal(false)}
              className="text-dark-500 hover:text-dark-300 p-1 rounded-full"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs text-dark-400">Briefly describe the violation (e.g., Harassment, Spam):</label>
            <input
              type="text"
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder="Reason for report..."
              className="w-full text-sm bg-dark-950 border border-dark-800 rounded-lg px-3 py-2 focus:outline-none focus:border-rose-500 text-dark-100"
            />
          </div>

          <p className="text-[10px] text-dark-500 italic leading-relaxed">
            * Submitting a report will instantly disconnect the chat, discard all current keys, and place the reported peer's session on a temporary blacklist cooldown.
          </p>

          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={() => setShowReportModal(false)}
              className="flex-1 bg-dark-800 hover:bg-dark-700 text-dark-300 font-medium text-xs py-2 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmitReport}
              disabled={!reportReason.trim()}
              className="flex-1 bg-rose-600 hover:bg-rose-500 text-white font-medium text-xs py-2 rounded-lg disabled:opacity-50"
            >
              Submit Report
            </button>
          </div>
        </div>
      </div>
    );
  }
}
