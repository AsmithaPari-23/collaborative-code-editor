import React, { useState } from 'react';
import { Folder, FileCode, Plus, Edit2, Trash, Check, X } from 'lucide-react';
import api from '../services/api';

const LANGUAGE_MAP = {
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  java: 'java',
  c: 'c',
  cpp: 'cpp',
  go: 'go',
  cs: 'csharp',
};

const FileTree = ({ files, activeFileId, onSelectFile, roomId, fetchFiles, socket }) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  
  const [editingFileId, setEditingFileId] = useState(null);
  const [editFileName, setEditFileName] = useState('');
  
  const [error, setError] = useState('');

  const detectLanguage = (filename) => {
    const ext = filename.split('.').pop().toLowerCase();
    return LANGUAGE_MAP[ext] || 'javascript';
  };

  const handleCreateFile = async (e) => {
    e.preventDefault();
    const name = newFileName.trim();
    if (!name) return;

    try {
      setError('');
      const language = detectLanguage(name);
      const response = await api.post('/files', {
        roomId,
        name,
        language,
      });

      if (response.data?.success) {
        const newFile = response.data.data;
        setIsCreating(false);
        setNewFileName('');
        await fetchFiles();
        onSelectFile(newFile._id);

        // Notify socket
        if (socket) {
          socket.emit('file-created', { roomId, file: newFile });
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Error creating file');
    }
  };

  const handleRenameFile = async (fileId) => {
    const name = editFileName.trim();
    if (!name) return;

    try {
      setError('');
      const response = await api.put(`/files/${fileId}/rename`, { name });
      if (response.data?.success) {
        setEditingFileId(null);
        setEditFileName('');
        await fetchFiles();

        // Notify socket
        if (socket) {
          socket.emit('file-renamed', { roomId, file: response.data.data });
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Error renaming file');
    }
  };

  const handleDeleteFile = async (fileId, e) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this file?')) return;

    try {
      setError('');
      const response = await api.delete(`/files/${fileId}`);
      if (response.data?.success) {
        await fetchFiles();
        
        // Notify socket
        if (socket) {
          socket.emit('file-deleted', { roomId, fileId });
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Error deleting file');
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <Folder size={14} className="text-slate-400" />
          Files
        </h3>
        <button
          onClick={() => setIsCreating(true)}
          className="text-slate-400 hover:text-white transition-colors"
          title="New File"
        >
          <Plus size={16} />
        </button>
      </div>

      {error && (
        <div className="p-2 rounded bg-rose-500/10 border border-rose-500/20 text-rose-300 text-[10px] mb-3">
          {error}
        </div>
      )}

      {/* Creation form */}
      {isCreating && (
        <form onSubmit={handleCreateFile} className="mb-3 flex items-center gap-1">
          <input
            type="text"
            placeholder="e.g. index.js"
            className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            autoFocus
          />
          <button type="submit" className="text-emerald-400 hover:text-emerald-300 p-1">
            <Check size={14} />
          </button>
          <button
            type="button"
            onClick={() => {
              setIsCreating(false);
              setNewFileName('');
            }}
            className="text-slate-500 hover:text-slate-400 p-1"
          >
            <X size={14} />
          </button>
        </form>
      )}

      {/* Files List */}
      <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
        {files.map((file) => {
          const isActive = file._id === activeFileId;
          const isEditing = file._id === editingFileId;

          return (
            <div
              key={file._id}
              onClick={() => !isEditing && onSelectFile(file._id)}
              className={`group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-all ${
                isActive
                  ? 'bg-blue-600/10 border border-blue-500/30 text-blue-400'
                  : 'bg-white/0 border border-transparent text-slate-300 hover:bg-slate-600 hover:text-slate-100'
              }`}
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <FileCode size={14} className={isActive ? 'text-blue-400' : 'text-slate-400'} />
                
                {isEditing ? (
                  <div className="flex items-center gap-1 flex-1" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="text"
                      className="bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none focus:border-blue-500 w-full"
                      value={editFileName}
                      onChange={(e) => setEditFileName(e.target.value)}
                      autoFocus
                    />
                    <button onClick={() => handleRenameFile(file._id)} className="text-emerald-400 p-0.5">
                      <Check size={12} />
                    </button>
                    <button onClick={() => setEditingFileId(null)} className="text-slate-500 p-0.5">
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <span className="text-xs truncate font-medium">{file.name}</span>
                )}
              </div>

              {!isEditing && (
                <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 md:group-hover:opacity-100 hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingFileId(file._id);
                      setEditFileName(file.name);
                    }}
                    className="text-slate-500 hover:text-slate-300 p-0.5"
                    title="Rename File"
                  >
                    <Edit2 size={12} />
                  </button>
                  {files.length > 1 && (
                    <button
                      onClick={(e) => handleDeleteFile(file._id, e)}
                      className="text-slate-500 hover:text-rose-400 p-0.5"
                      title="Delete File"
                    >
                      <Trash size={12} />
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default FileTree;
