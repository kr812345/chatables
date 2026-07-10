import React, { useState, useEffect } from 'react';
import { Settings, Shield, User, Heart, Sparkles, Check } from 'lucide-react';
import { UserSettings } from '../types';
import { CONFIG } from '../config';

export default function OptionsApp() {
  const [settings, setSettings] = useState<UserSettings>({
    userId: '',
    interests: [],
    niche: '',
    gender: 'other',
    genderPref: 'any',
    websocketUrl: CONFIG.WEBSOCKET_URL,
  });

  const [interestInput, setInterestInput] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [micPermission, setMicPermission] = useState<'prompt' | 'granted' | 'denied'>('prompt');

  useEffect(() => {
    // Check permission status
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'microphone' as any }).then((result) => {
        setMicPermission(result.state);
        result.onchange = () => {
          setMicPermission(result.state);
        };
      }).catch(() => {});
    }
  }, []);

  const handleRequestMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      setMicPermission('granted');
    } catch (err) {
      console.error(err);
      setMicPermission('denied');
    }
  };

  useEffect(() => {
    chrome.storage.local.get(['userId', 'interests', 'niche', 'gender', 'genderPref'], (result) => {
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
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanInterests = interestInput
      .split(',')
      .map(i => i.trim())
      .filter(i => i.length > 0);

    const updated = {
      ...settings,
      interests: cleanInterests
    };

    await chrome.storage.local.set(updated);
    setSettings(updated);
    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
    }, 2000);
  };

  return (
    <div className="w-full max-w-xl bg-dark-900 border border-dark-800 rounded-2xl shadow-2xl p-6 font-sans">
      <div className="flex items-center justify-between border-b border-dark-800 pb-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-brand-900/10 text-white">
            <Settings size={20} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-wide">Chatables Configuration</h1>
            <p className="text-xs text-dark-400">Manage your matching profiles and local keys</p>
          </div>
        </div>
        <div className="flex items-center gap-1 bg-dark-950 border border-dark-800 rounded-full px-3 py-1 text-[10px] font-semibold text-brand-400 font-mono">
          <Shield size={10} /> Privacy-First Mode
        </div>
      </div>

      <form onSubmit={handleSave} className="flex flex-col gap-5">
        <div className="bg-dark-950 border border-dark-800/80 rounded-xl p-4 flex flex-col gap-4">
          <h2 className="text-xs font-bold text-brand-300 uppercase tracking-widest flex items-center gap-1.5">
            <Sparkles size={13} /> Matching Attributes
          </h2>

          <div>
            <label className="block text-xs font-medium text-dark-400 mb-1.5">Interests / Topics (Comma separated)</label>
            <input
              type="text"
              value={interestInput}
              onChange={(e) => setInterestInput(e.target.value)}
              placeholder="e.g. Coding, Gaming, Techno, Cinema"
              className="w-full text-sm bg-dark-900 border border-dark-800 rounded-lg px-3 py-2 focus:outline-none focus:border-brand-500 text-dark-100 placeholder-dark-600 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-dark-400 mb-1.5">Niche Sub-topics (Specific focus)</label>
            <input
              type="text"
              value={settings.niche}
              onChange={(e) => setSettings({ ...settings, niche: e.target.value })}
              placeholder="e.g. React Native, Doom Eternal, Modular Synths"
              className="w-full text-sm bg-dark-900 border border-dark-800 rounded-lg px-3 py-2 focus:outline-none focus:border-brand-500 text-dark-100 placeholder-dark-600 transition-colors"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-dark-950 border border-dark-800/80 rounded-xl p-4 flex flex-col gap-3">
            <h2 className="text-xs font-bold text-brand-300 uppercase tracking-widest flex items-center gap-1.5">
              <User size={13} /> Gender Identity
            </h2>
            <select
              value={settings.gender}
              onChange={(e: any) => setSettings({ ...settings, gender: e.target.value })}
              className="w-full text-sm bg-dark-900 border border-dark-800 rounded-lg px-3 py-2 focus:outline-none focus:border-brand-500 text-dark-100 cursor-pointer"
            >
              <option value="other">Other / Secret</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>

          <div className="bg-dark-950 border border-dark-800/80 rounded-xl p-4 flex flex-col gap-3">
            <h2 className="text-xs font-bold text-brand-300 uppercase tracking-widest flex items-center gap-1.5">
              <Heart size={13} /> Gender Target Filter
            </h2>
            <select
              value={settings.genderPref}
              onChange={(e: any) => setSettings({ ...settings, genderPref: e.target.value })}
              className="w-full text-sm bg-dark-900 border border-dark-800 rounded-lg px-3 py-2 focus:outline-none focus:border-brand-500 text-dark-100 cursor-pointer"
            >
              <option value="any">Any Gender</option>
              <option value="male">Male Match Only</option>
              <option value="female">Female Match Only</option>
            </select>
          </div>
        </div>


        <div className="bg-dark-950 border border-dark-800/80 rounded-xl p-4 flex flex-col gap-3">
          <h2 className="text-xs font-bold text-brand-300 uppercase tracking-widest flex items-center gap-1.5">
            <Shield size={13} className="text-brand-400" /> Microphone Access
          </h2>
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <p className="text-sm font-medium text-dark-250">Voice Chat Permission</p>
              <p className="text-xs text-dark-500 mt-0.5 leading-normal">Required to speak during anonymous call matches.</p>
            </div>
            {micPermission === 'granted' ? (
              <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-xl">
                Active & Allowed
              </span>
            ) : (
              <button
                type="button"
                onClick={handleRequestMic}
                className="bg-brand-600 hover:bg-brand-500 text-white font-medium text-xs py-2 px-4 rounded-lg transition-all active:scale-95 shadow-lg shadow-brand-900/10"
              >
                Grant Access
              </button>
            )}
          </div>
        </div>

        <div className="text-[11px] text-dark-500 leading-relaxed bg-dark-950/50 rounded-lg p-3 border border-dark-800/40">
          <p className="font-semibold text-dark-400 mb-0.5">Privacy Notice:</p>
          Preferences are kept inside your secure local chrome storage instance. They are not stored on our server, not used for profiling, and can be wiped or updated instantly by editing this panel.
        </div>

        <div className="flex items-center gap-3 mt-2">
          <button
            type="submit"
            disabled={saveSuccess}
            className="flex-1 bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white font-medium text-sm py-2.5 px-4 rounded-xl transition-all shadow-[0_0_20px_rgba(139,92,246,0.15)] flex items-center justify-center gap-1.5 active:scale-98"
          >
            {saveSuccess ? (
              <>
                <Check size={16} className="text-emerald-400" /> Settings Updated
              </>
            ) : (
              'Save Preferences'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
