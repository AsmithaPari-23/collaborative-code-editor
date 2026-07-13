import React, { useState } from 'react';
import { Users, Wifi, Copy, Check } from 'lucide-react';

const UsersPanel = ({ activeUsers, roomId, isConnected }) => {
  const [copied, setCopied] = useState(false);

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Room ID Copy Panel */}
      <div className="mb-6 p-4 rounded-xl bg-white/5 border border-white/5 flex flex-col gap-2">
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
          Collaboration Room ID
        </span>
        <div className="flex items-center justify-between gap-2">
          <code className="text-xs text-blue-400 select-all truncate">{roomId}</code>
          <button
            onClick={copyRoomId}
            className="text-slate-400 hover:text-white p-1 hover:bg-white/5 rounded transition-colors shrink-0"
            title="Copy Room ID"
          >
            {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
          </button>
        </div>
      </div>

      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <Users size={14} />
          Active Members ({activeUsers.length})
        </h3>
        <div className="flex items-center gap-1">
          <Wifi size={12} className={isConnected ? 'text-emerald-400 animate-pulse' : 'text-slate-500'} />
          <span className="text-[10px] text-slate-400">
            {isConnected ? 'Syncing' : 'Offline'}
          </span>
        </div>
      </div>

      {/* Users List */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {activeUsers.map((user, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/40 border border-white/5"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {/* Simple Avatar */}
              <div className="w-7 h-7 rounded-lg bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-xs font-semibold text-blue-400 uppercase">
                {user.username.charAt(0)}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-200 truncate">{user.username}</p>
                {user.typing && (
                  <p className="text-[10px] text-blue-400 animate-pulse font-light">Typing...</p>
                )}
              </div>
            </div>

            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50"></div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default UsersPanel;
