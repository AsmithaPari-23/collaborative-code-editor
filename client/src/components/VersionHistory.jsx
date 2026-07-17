import React, { useState, useEffect, useCallback } from 'react';
import { History, Save, RotateCcw, Play, Eye, EyeOff } from 'lucide-react';
import api from '../services/api';

// Premium collaborator colors helper matching index.css classes
export const COLLABORATOR_COLORS = [
  { name: 'violet', code: '#A855F7' },
  { name: 'pink', code: '#EC4899' },
  { name: 'blue', code: '#3B82F6' },
  { name: 'amber', code: '#F59E0B' },
  { name: 'emerald', code: '#10B981' },
  { name: 'red', code: '#EF4444' },
  { name: 'cyan', code: '#06B6D4' },
  { name: 'orange', code: '#F97316' },
  { name: 'lime', code: '#84CC16' }
];

export const getUserColor = (userId) => {
  if (!userId) return COLLABORATOR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % COLLABORATOR_COLORS.length;
  return COLLABORATOR_COLORS[index];
};

const VersionHistory = ({ 
  fileId, 
  socket, 
  activeVersionId, 
  onSelectVersion, 
  onRestoreVersion, 
  onStartReplay,
  isReplayMode
}) => {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchHistory = useCallback(async () => {
    if (!fileId) return;
    try {
      setLoading(true);
      setError('');
      const response = await api.get(`/history/versions/${fileId}`);
      if (response.data?.success) {
        setVersions(response.data.data);
      }
    } catch (err) {
      setError('Failed to fetch history snapshots.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [fileId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Real-time Version creation updates via WebSocket
  useEffect(() => {
    if (!socket) return;

    const handleVersionCreated = (newVersion) => {
      if (newVersion.fileId === fileId) {
        setVersions((prev) => [newVersion, ...prev]);
      }
    };

    socket.on('version-created', handleVersionCreated);

    return () => {
      socket.off('version-created', handleVersionCreated);
    };
  }, [socket, fileId]);

  const handleSaveSnapshot = async () => {
    if (!fileId) return;
    try {
      setSaving(true);
      setError('');
      const response = await api.post('/history', {
        fileId,
      });
      if (response.data?.success) {
        await fetchHistory();
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Error saving snapshot.');
    } finally {
      setSaving(false);
    }
  };

  const formatTime = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <div className="flex flex-col h-full select-none text-slate-100">
      {/* Action buttons */}
      <div className="flex flex-col gap-2 mb-4">
        <div className="flex justify-between items-center">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <History size={14} className="text-purple-400" />
            Version History
          </h3>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleSaveSnapshot}
            disabled={saving || !fileId || isReplayMode}
            className="flex-1 glass-btn-secondary flex items-center justify-center gap-1 text-[10px] py-1.5 h-8 transition-colors disabled:opacity-40"
            title="Create Checkpoint Snapshot"
          >
            <Save size={12} className="text-purple-400" />
            {saving ? 'Saving...' : 'Save Version'}
          </button>
          
          <button
            onClick={onStartReplay}
            disabled={isReplayMode || !fileId}
            className="flex-1 glass-btn-primary flex items-center justify-center gap-1 text-[10px] py-1.5 h-8 transition-colors disabled:opacity-40"
            title="Replay code session"
          >
            <Play size={12} className="text-white fill-white" />
            Replay Session
          </button>
        </div>
      </div>

      {error && (
        <div className="p-2 rounded bg-rose-500/10 border border-rose-500/20 text-rose-300 text-[10px] mb-3">
          {error}
        </div>
      )}

      {/* Snapshots List */}
      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-xs">
          <div className="w-5 h-5 border-2 border-slate-700 border-t-purple-500 rounded-full animate-spin mb-2"></div>
          Loading snapshots...
        </div>
      ) : versions.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-xs font-light text-center p-4">
          <History size={24} className="text-slate-700 mb-2" />
          No version checkpoints found for this file. Edits will generate version entries automatically.
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {versions.map((version, index) => {
            const userColor = getUserColor(version.userId?._id || version.userId);
            const isSelected = activeVersionId === version._id;
            const initials = version.username ? version.username.slice(0, 2).toUpperCase() : 'SY';

            return (
              <div
                key={version._id}
                onClick={() => onSelectVersion(version, versions[index + 1])}
                className={`p-3 rounded-lg bg-slate-800 border transition-all duration-200 cursor-pointer flex flex-col gap-2.5 ${
                  isSelected 
                    ? 'border-purple-500/80 shadow-[0_0_8px_0_rgba(168,85,247,0.15)] bg-slate-800/80' 
                    : 'border-slate-700 hover:border-slate-600 hover:bg-slate-800/60'
                }`}
              >
                {/* Header: User avatar, Username, Time */}
                <div className="flex items-center gap-2">
                  <div 
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border"
                    style={{
                      backgroundColor: `${userColor.code}1A`,
                      borderColor: userColor.code,
                      color: userColor.code
                    }}
                  >
                    {initials}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium text-slate-200 truncate">
                      {version.username || 'System'}
                    </p>
                    <p className="text-[9px] text-slate-500 font-light mt-0.5">
                      {formatTime(version.timestamp)} • {formatDate(version.timestamp)}
                    </p>
                  </div>
                </div>

                {/* Body: Edit summary and modified file */}
                <div className="pl-8">
                  <p className="text-[11px] text-purple-300 font-medium">
                    {version.name}
                  </p>
                  <p className="text-[9px] text-slate-500 font-light mt-0.5">
                    File: {version.description.includes('Restored') ? 'restore event' : 'code modification'}
                  </p>
                </div>

                {/* Actions when selected */}
                {isSelected && (
                  <div className="flex gap-2 mt-1 pl-8">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRestoreVersion(version);
                      }}
                      className="flex-1 h-6 glass-btn-secondary p-0 text-[10px] flex items-center justify-center gap-1 border-purple-500/30 text-purple-300 hover:border-purple-500 hover:text-white"
                    >
                      <RotateCcw size={10} />
                      Restore
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default VersionHistory;
