import React, { useState, useEffect, useCallback } from 'react';
import { History, Save, RotateCcw } from 'lucide-react';
import api from '../services/api';

const VersionHistory = ({ fileId, fileContent, onRestoreSuccess }) => {
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchHistory = useCallback(async () => {
    if (!fileId) return;
    try {
      setLoading(true);
      setError('');
      const response = await api.get(`/history/file/${fileId}`);
      if (response.data?.success) {
        setSnapshots(response.data.data);
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

  const handleSaveSnapshot = async () => {
    if (!fileId) return;
    try {
      setSaving(true);
      setError('');
      const response = await api.post('/history', {
        fileId,
        content: fileContent,
      });
      if (response.data?.success) {
        // Refresh snapshots list
        await fetchHistory();
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Error saving snapshot.');
    } finally {
      setSaving(false);
    }
  };

  const handleRestoreSnapshot = async (snapshotId) => {
    if (!confirm('Are you sure you want to restore this file to this version? Current unsaved changes will be overwritten.')) return;
    
    try {
      setError('');
      const response = await api.post(`/history/restore/${snapshotId}`);
      if (response.data?.success) {
        const { file } = response.data.data;
        // Notify parent workspace to load new code state
        onRestoreSuccess(file.content);
        // Refresh version list
        await fetchHistory();
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Error restoring version.');
    }
  };

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <History size={14} />
          Version History
        </h3>
        <button
          onClick={handleSaveSnapshot}
          className="text-slate-400 hover:text-white flex items-center gap-1 text-[10px] bg-white/5 border border-white/5 px-2 py-1 rounded transition-colors disabled:opacity-55"
          disabled={saving || !fileId}
          title="Save Snapshot"
        >
          <Save size={12} />
          {saving ? 'Saving...' : 'Save Snapshot'}
        </button>
      </div>

      {error && (
        <div className="p-2 rounded bg-rose-500/10 border border-rose-500/20 text-rose-300 text-[10px] mb-3">
          {error}
        </div>
      )}

      {/* Snapshots Lists */}
      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-xs">
          <div className="w-5 h-5 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin mb-2"></div>
          Loading snapshots...
        </div>
      ) : snapshots.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-xs font-light text-center">
          No history snapshots found.
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {snapshots.map((snapshot) => (
            <div
              key={snapshot._id}
              className="p-3 rounded-lg bg-slate-900/40 border border-white/5 flex flex-col gap-2 justify-between"
            >
              <div>
                <p className="text-[10px] text-slate-400 font-medium">{formatDate(snapshot.timestamp || snapshot.createdAt)}</p>
                <p className="text-[9px] text-slate-500 mt-0.5">Author: {snapshot.authorId?.username || 'System'}</p>
              </div>

              <button
                onClick={() => handleRestoreSnapshot(snapshot._id)}
                className="w-full h-7 glass-btn-secondary p-0 text-[10px] flex items-center justify-center gap-1"
              >
                <RotateCcw size={10} />
                Restore Version
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default VersionHistory;
