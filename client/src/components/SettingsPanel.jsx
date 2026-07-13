import React from 'react';
import { Settings } from 'lucide-react';

const LANGUAGES = [
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'java', label: 'Java' },
  { value: 'c', label: 'C' },
  { value: 'cpp', label: 'C++' },
  { value: 'go', label: 'Go' },
  { value: 'csharp', label: 'C#' },
];

const THEMES = [
  { value: 'vs-dark', label: 'VS Dark (Default)' },
  { value: 'light', label: 'VS Light' },
];

const SettingsPanel = ({ settings, onUpdateSettings, activeFileLanguage, onUpdateLanguage }) => {
  return (
    <div className="flex flex-col h-full space-y-5">
      <div className="flex justify-between items-center mb-1">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <Settings size={14} />
          Editor Settings
        </h3>
      </div>

      {/* Font Size */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">
          Font Size ({settings.fontSize}px)
        </label>
        <input
          type="range"
          min={12}
          max={24}
          step={1}
          value={settings.fontSize}
          onChange={(e) => onUpdateSettings('fontSize', parseInt(e.target.value))}
          className="w-full accent-blue-500 cursor-pointer h-1.5 bg-slate-900 border-none rounded-lg outline-none"
        />
      </div>

      {/* Tab Size */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">
          Tab Spaces
        </label>
        <select
          value={settings.tabSize}
          onChange={(e) => onUpdateSettings('tabSize', parseInt(e.target.value))}
          className="glass-input text-xs w-full h-10"
        >
          <option value={2} className="bg-slate-950">2 Spaces</option>
          <option value={4} className="bg-slate-950">4 Spaces</option>
          <option value={8} className="bg-slate-950">8 Spaces</option>
        </select>
      </div>

      {/* Word Wrap */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">
          Word Wrap
        </label>
        <select
          value={settings.wordWrap}
          onChange={(e) => onUpdateSettings('wordWrap', e.target.value)}
          className="glass-input text-xs w-full h-10"
        >
          <option value="on" className="bg-slate-950">On</option>
          <option value="off" className="bg-slate-950">Off</option>
        </select>
      </div>

      {/* Editor Theme */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">
          Editor Theme
        </label>
        <select
          value={settings.theme}
          onChange={(e) => onUpdateSettings('theme', e.target.value)}
          className="glass-input text-xs w-full h-10"
        >
          {THEMES.map((theme) => (
            <option key={theme.value} value={theme.value} className="bg-slate-950">
              {theme.label}
            </option>
          ))}
        </select>
      </div>

      {/* Active File Language Selector */}
      {activeFileLanguage && (
        <div className="flex flex-col gap-1.5 pt-3 border-t border-white/5">
          <label className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">
            Current File Language
          </label>
          <select
            value={activeFileLanguage}
            onChange={(e) => onUpdateLanguage(e.target.value)}
            className="glass-input text-xs w-full h-10 border-blue-500/30"
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.value} value={lang.value} className="bg-slate-950">
                {lang.label}
              </option>
            ))}
          </select>
          <p className="text-[9px] text-slate-500 mt-1 font-light">
            Note: Changing language updates syntax rendering inside editor.
          </p>
        </div>
      )}
    </div>
  );
};

export default SettingsPanel;
