import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import MonacoEditor from '@monaco-editor/react';
import { useSocket } from '../context/SocketContext';
import api from '../services/api';
import { 
  Folder, Users, MessageSquare, History, Settings, Play, 
  ArrowLeft, AlertTriangle, Terminal, Cpu, Info
} from 'lucide-react';

import FileTree from '../components/FileTree';
import UsersPanel from '../components/UsersPanel';
import ChatPanel from '../components/ChatPanel';
import VersionHistory from '../components/VersionHistory';
import SettingsPanel from '../components/SettingsPanel';

const Room = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { socket, isConnected, activeUsers, joinRoom, leaveRoom } = useSocket();

  // Room details & Files
  const [room, setRoom] = useState(null);
  const [files, setFiles] = useState([]);
  const [activeFileId, setActiveFileId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Editor states
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const isPreventEmitRef = useRef(false);
  const decorationsMap = useRef(new Map()); // socketId -> decorationIds[]

  // Editor settings
  const [settings, setSettings] = useState({
    fontSize: 14,
    tabSize: 2,
    wordWrap: 'on',
    theme: 'vs-dark',
  });

  // Code Execution states
  const [stdin, setStdin] = useState('');
  const [stdout, setStdout] = useState('');
  const [stderr, setStderr] = useState('');
  const [compileOutput, setCompileOutput] = useState('');
  const [executing, setExecuting] = useState(false);
  const [execStatus, setExecStatus] = useState(null); // { status, time, memory }

  // Sidebar tab state
  // 'files' | 'users' | 'chat' | 'history' | 'settings'
  const [activeTab, setActiveTab] = useState('files');

  // Typing state
  const typingTimeoutRef = useRef(null);
  const [isTyping, setIsTyping] = useState(false);

  // 1. Initial Room data fetch
  const fetchRoomData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      
      // Fetch details and joined list
      const response = await api.post(`/rooms/join/${roomId}`);
      if (response.data?.success) {
        setRoom(response.data.data.room);
        const fetchedFiles = response.data.data.files;
        setFiles(fetchedFiles);
        
        if (fetchedFiles.length > 0) {
          setActiveFileId(fetchedFiles[0]._id);
        }
      }
    } catch (err) {
      setError('Room not found or access denied.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    fetchRoomData();
    // Connect to room WebSocket
    joinRoom(roomId);

    return () => {
      leaveRoom();
    };
  }, [roomId, fetchRoomData, joinRoom, leaveRoom]);

  // Sync files list helper
  const fetchFiles = useCallback(async () => {
    try {
      const response = await api.get(`/files/room/${roomId}`);
      if (response.data?.success) {
        setFiles(response.data.data);
      }
    } catch (err) {
      console.error('Failed to refresh files:', err.message);
    }
  }, [roomId]);

  const activeFile = files.find((f) => f._id === activeFileId);

  // 2. Monaco Editor mounts
  const handleEditorDidMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Set model options from state
    const model = editor.getModel();
    if (model) {
      model.updateOptions({ tabSize: settings.tabSize });
    }

    // Attach local document change change-listener
    editor.onDidChangeModelContent((event) => {
      if (isPreventEmitRef.current) {
        // Change was applied programmatically by socket event; skip emitting
        isPreventEmitRef.current = false;
        return;
      }

      if (!socket || !activeFileId) return;

      // Broadcast changes to peers
      socket.emit('code-change', {
        roomId,
        fileId: activeFileId,
        content: editor.getValue(),
        changes: event.changes,
      });

      // Typing indicator triggers
      handleTypingIndicator();
    });

    // Attach cursor movements & selections trackers
    const trackCursorAndSelection = () => {
      if (!socket || !activeFileId) return;

      const position = editor.getPosition();
      const selection = editor.getSelection();

      socket.emit('cursor-update', {
        roomId,
        fileId: activeFileId,
        cursor: position ? { line: position.lineNumber, column: position.column } : null,
        selection: selection ? {
          startLine: selection.startLineNumber,
          startColumn: selection.startColumn,
          endLine: selection.endLineNumber,
          endColumn: selection.endColumn,
        } : null,
      });
    };

    editor.onDidChangeCursorPosition(trackCursorAndSelection);
    editor.onDidChangeCursorSelection(trackCursorAndSelection);
  };

  // Typing indicator debounce helper
  const handleTypingIndicator = () => {
    if (!socket) return;

    if (!isTyping) {
      setIsTyping(true);
      socket.emit('typing-start', { roomId });
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      socket.emit('typing-stop', { roomId });
    }, 2000);
  };

  // 3. WebSockets event listener binders
  useEffect(() => {
    if (!socket) return;

    // Code synchronize
    const handleReceiveCode = ({ fileId, content, changes }) => {
      if (fileId !== activeFileId || !editorRef.current || !monacoRef.current) return;

      // Flag content replacement so onDidChangeModelContent doesn't trigger loop
      isPreventEmitRef.current = true;

      const editor = editorRef.current;
      const monaco = monacoRef.current;
      const model = editor.getModel();

      if (model && changes && changes.length > 0) {
        const edits = changes.map((change) => ({
          range: new monaco.Range(
            change.range.startLineNumber,
            change.range.startColumn,
            change.range.endLineNumber,
            change.range.endColumn
          ),
          text: change.text,
          forceMoveMarkers: true,
        }));
        // Apply deltas keeping cursor and undo stack intact!
        model.pushEditOperations([], edits, () => null);
      } else if (model) {
        // Fallback: replace whole text
        const state = editor.saveViewState();
        model.setValue(content || '');
        editor.restoreViewState(state);
      }
    };

    // Live Cursors and selections synchronize
    const handleCursorUpdate = ({ socketId, username, fileId, cursor, selection }) => {
      if (fileId !== activeFileId || !editorRef.current || !monacoRef.current) return;

      const editor = editorRef.current;
      const monaco = monacoRef.current;

      // Get old decorations for this socket
      const oldDecorations = decorationsMap.current.get(socketId) || [];
      const newDecorations = [];

      // If we have cursor coords, add cursor line marker decoration
      if (cursor) {
        newDecorations.push({
          range: new monaco.Range(cursor.line, cursor.column, cursor.line, cursor.column),
          options: {
            className: 'remote-cursor',
            hoverMessage: { value: `**${username}** is here` },
            // Display username tag inside the editor alongside their cursor!
            after: {
              content: username,
              inlineClassName: 'remote-cursor-label',
            },
          },
        });
      }

      // If selection range is active, add highlight range decoration
      if (selection && (selection.startLine !== selection.endLine || selection.startColumn !== selection.endColumn)) {
        newDecorations.push({
          range: new monaco.Range(
            selection.startLine,
            selection.startColumn,
            selection.endLine,
            selection.endColumn
          ),
          options: {
            className: 'remote-selection',
          },
        });
      }

      // Update decorations
      const decorationIds = editor.deltaDecorations(oldDecorations, newDecorations);
      decorationsMap.current.set(socketId, decorationIds);
    };

    // Clean up decorations on user exit
    const handleUserLeft = ({ socketId }) => {
      const oldDecorations = decorationsMap.current.get(socketId) || [];
      if (editorRef.current && oldDecorations.length > 0) {
        editorRef.current.deltaDecorations(oldDecorations, []);
      }
      decorationsMap.current.delete(socketId);
    };

    // File operations triggers
    const handleFileCreated = async () => {
      await fetchFiles();
    };

    const handleFileRenamed = async () => {
      await fetchFiles();
    };

    const handleFileDeleted = async ({ fileId }) => {
      await fetchFiles();
      if (activeFileId === fileId) {
        // Active file was deleted, load a remaining one
        const remaining = files.filter((f) => f._id !== fileId);
        if (remaining.length > 0) {
          setActiveFileId(remaining[0]._id);
        } else {
          setActiveFileId(null);
        }
      }
    };

    socket.on('receive-code', handleReceiveCode);
    socket.on('cursor-update', handleCursorUpdate);
    socket.on('user-left', handleUserLeft);
    socket.on('file-created', handleFileCreated);
    socket.on('file-renamed', handleFileRenamed);
    socket.on('file-deleted', handleFileDeleted);

    return () => {
      socket.off('receive-code', handleReceiveCode);
      socket.off('cursor-update', handleCursorUpdate);
      socket.off('user-left', handleUserLeft);
      socket.off('file-created', handleFileCreated);
      socket.off('file-renamed', handleFileRenamed);
      socket.off('file-deleted', handleFileDeleted);
    };
  }, [socket, activeFileId, files, fetchFiles]);

  // Update editor values when changing files
  const handleSelectFile = (fileId) => {
    // Clear old remote decorations when switching files
    if (editorRef.current) {
      decorationsMap.current.forEach((decIds) => {
        editorRef.current.deltaDecorations(decIds, []);
      });
      decorationsMap.current.clear();
    }
    setActiveFileId(fileId);
  };

  const handleSettingsUpdate = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };



  // Simple language modifier locally and sync via files list
  const handleUpdateLanguageDirect = async (newLang) => {
    if (!activeFileId) return;
    try {
      // Modify file language on database by updating name but keeping it same
      // Wait, let's call a database helper or mock it.
      // Let's write an axios PUT to update language directly:
      // We can update the server controller later.
      // Let's call PUT `/files/${activeFileId}/rename` with { name: activeFile.name, language: newLang }
      const response = await api.put(`/files/${activeFileId}/rename`, {
        name: activeFile.name,
        language: newLang,
      });

      if (response.data?.success) {
        await fetchFiles();
        if (socket) {
          socket.emit('file-renamed', { roomId, file: response.data.data });
        }
      }
    } catch (err) {
      console.error('Failed to update file language:', err.message);
    }
  };

  // 4. Code Execution
  const handleExecuteCode = async () => {
    if (!activeFile || !editorRef.current) return;

    try {
      setExecuting(true);
      setStdout('');
      setStderr('');
      setCompileOutput('');
      setExecStatus(null);

      const codeContent = editorRef.current.getValue();
      const response = await api.post('/execute', {
        language: activeFile.language,
        code: codeContent,
        input: stdin,
      });

      if (response.data?.success) {
        const result = response.data.data;
        setStdout(result.stdout || '');
        setStderr(result.stderr || '');
        setCompileOutput(result.compile_output || '');
        setExecStatus({
          status: result.status,
          time: result.time,
          memory: result.memory,
        });
      }
    } catch (err) {
      setStderr(err.response?.data?.message || 'Execution request failed.');
    } finally {
      setExecuting(false);
    }
  };

  if (loading) {
    return (
      <div className="h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400">
        <div className="w-8 h-8 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin mb-3"></div>
        <p className="text-xs">Loading collaboration workspace...</p>
      </div>
    );
  }

  return (
    <div className="h-screen bg-slate-950 flex flex-col overflow-hidden">
      {/* Top Navigation Header */}
      <header className="h-14 border-b border-white/5 bg-slate-900/40 px-6 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-4 min-w-0">
          <button
            onClick={() => navigate('/')}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/5 transition-colors shrink-0"
          >
            <ArrowLeft size={16} />
          </button>
          
          <div className="min-w-0">
            <h1 className="text-xs font-semibold text-slate-100 truncate flex items-center gap-2">
              {room?.name}
              <span className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-slate-400 font-light lowercase">
                {activeFile?.language}
              </span>
            </h1>
            <p className="text-[10px] text-slate-400 truncate font-light hidden md:block">
              {room?.description || 'Collaborative coding workspace'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[10px] font-semibold tracking-wider uppercase text-slate-400 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            Syncing: {activeUsers.length} Online
          </span>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Tab Selection Sidebar (vertical bar) */}
        <div className="w-12 border-r border-white/5 bg-slate-900/20 flex flex-col items-center py-4 gap-4 shrink-0">
          <button
            onClick={() => setActiveTab('files')}
            className={`p-2 rounded-lg transition-colors ${
              activeTab === 'files' ? 'bg-blue-600/10 text-blue-400' : 'text-slate-400 hover:text-white'
            }`}
            title="Files Tree"
          >
            <Folder size={16} />
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`p-2 rounded-lg transition-colors ${
              activeTab === 'users' ? 'bg-blue-600/10 text-blue-400' : 'text-slate-400 hover:text-white'
            }`}
            title="Room Members"
          >
            <Users size={16} />
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            className={`p-2 rounded-lg transition-colors relative ${
              activeTab === 'chat' ? 'bg-blue-600/10 text-blue-400' : 'text-slate-400 hover:text-white'
            }`}
            title="Chat Room"
          >
            <MessageSquare size={16} />
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`p-2 rounded-lg transition-colors ${
              activeTab === 'history' ? 'bg-blue-600/10 text-blue-400' : 'text-slate-400 hover:text-white'
            }`}
            title="Version Snapshots"
          >
            <History size={16} />
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`p-2 rounded-lg transition-colors ${
              activeTab === 'settings' ? 'bg-blue-600/10 text-blue-400' : 'text-slate-400 hover:text-white'
            }`}
            title="Editor Settings"
          >
            <Settings size={16} />
          </button>
        </div>

        {/* Selected Tab panel */}
        <div className="w-72 border-r border-white/5 bg-slate-900/10 p-4 flex flex-col overflow-y-auto shrink-0">
          {activeTab === 'files' && (
            <FileTree
              files={files}
              activeFileId={activeFileId}
              onSelectFile={handleSelectFile}
              roomId={roomId}
              fetchFiles={fetchFiles}
              socket={socket}
            />
          )}

          {activeTab === 'users' && (
            <UsersPanel
              activeUsers={activeUsers}
              roomId={roomId}
              isConnected={isConnected}
            />
          )}

          {activeTab === 'chat' && (
            <ChatPanel
              roomId={roomId}
              socket={socket}
            />
          )}

          {activeTab === 'history' && (
            <VersionHistory
              fileId={activeFileId}
              fileContent={editorRef.current?.getValue() || ''}
              onRestoreSuccess={(restoredContent) => {
                // Update editor value
                if (editorRef.current) {
                  editorRef.current.setValue(restoredContent);
                }
              }}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsPanel
              settings={settings}
              onUpdateSettings={handleSettingsUpdate}
              activeFileLanguage={activeFile?.language}
              onUpdateLanguage={handleUpdateLanguageDirect}
            />
          )}
        </div>

        {/* Center Editor and Execution Workspace */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Monaco Editor Container */}
          <div className="flex-1 min-h-0 bg-slate-950 relative">
            {error && (
              <div className="absolute inset-0 z-10 bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
                <AlertTriangle size={32} className="text-amber-500 mb-3 animate-bounce" />
                <h3 className="text-sm font-semibold text-slate-100 mb-1">{error}</h3>
                <button onClick={() => navigate('/')} className="glass-btn-secondary text-xs mt-3">
                  Return to Dashboard
                </button>
              </div>
            )}

            {activeFileId && activeFile ? (
              <MonacoEditor
                height="100%"
                language={activeFile.language}
                theme={settings.theme}
                value={activeFile.content}
                onMount={handleEditorDidMount}
                options={{
                  fontSize: settings.fontSize,
                  fontFamily: "'Courier New', Courier, monospace",
                  tabSize: settings.tabSize,
                  wordWrap: settings.wordWrap,
                  minimap: { enabled: false },
                  scrollbar: {
                    vertical: 'visible',
                    horizontal: 'visible',
                    verticalScrollbarSize: 6,
                    horizontalScrollbarSize: 6,
                  },
                  smoothScrolling: true,
                  cursorBlinking: 'smooth',
                  cursorSmoothCaretAnimation: 'on',
                  automaticLayout: true,
                }}
                loading={
                  <div className="h-full flex flex-col items-center justify-center text-slate-500">
                    <div className="w-6 h-6 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin mb-2"></div>
                    <p className="text-xs font-light">Loading Monaco Editor...</p>
                  </div>
                }
              />
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs font-light">
                No active files open. Select or create a file in the sidebar tree.
              </div>
            )}
          </div>

          {/* Compilation Panel (Execution Tray) */}
          <div className="h-64 border-t border-white/5 bg-slate-900/30 flex flex-col shrink-0">
            {/* Control Bar */}
            <div className="h-10 border-b border-white/5 bg-slate-900/20 px-4 flex justify-between items-center shrink-0">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Terminal size={12} />
                Code Execution Console
              </span>

              <div className="flex items-center gap-3">
                {execStatus && (
                  <span className="text-[9px] text-slate-400 flex items-center gap-3 font-medium uppercase">
                    <span className="flex items-center gap-1">
                      <Cpu size={10} className="text-blue-400" />
                      CPU: {execStatus.time}s
                    </span>
                    <span className="flex items-center gap-1">
                      <Info size={10} className="text-blue-400" />
                      Status: {execStatus.status}
                    </span>
                  </span>
                )}

                <button
                  onClick={handleExecuteCode}
                  disabled={executing || !activeFileId}
                  className="glass-btn-primary h-7 px-3 py-0 flex items-center gap-1.5 text-[10px] tracking-wide"
                >
                  {executing ? (
                    <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    <Play size={10} />
                  )}
                  {executing ? 'Executing...' : 'Run Code'}
                </button>
              </div>
            </div>

            {/* Split Input & Terminals */}
            <div className="flex-1 flex min-h-0 overflow-hidden divide-x divide-white/5">
              {/* Input Stdin */}
              <div className="w-1/3 p-3 flex flex-col h-full bg-slate-900/10">
                <label className="text-[9px] text-slate-400 uppercase font-semibold tracking-wider mb-2 block">
                  Console Input (Stdin)
                </label>
                <textarea
                  className="flex-1 bg-slate-950/70 border border-white/5 rounded-lg p-2.5 text-xs font-mono text-slate-300 focus:outline-none focus:border-blue-500/50 resize-none"
                  placeholder="Enter stdin parameters..."
                  value={stdin}
                  onChange={(e) => setStdin(e.target.value)}
                />
              </div>

              {/* Outputs Terminals */}
              <div className="w-2/3 p-3 flex flex-col h-full bg-slate-950/20 overflow-y-auto">
                <label className="text-[9px] text-slate-400 uppercase font-semibold tracking-wider mb-2 block">
                  Console Output (Stdout/Stderr)
                </label>
                <div className="flex-1 bg-slate-950 border border-white/5 rounded-lg p-3 font-mono text-xs overflow-y-auto space-y-2 select-text">
                  {compileOutput && (
                    <div className="text-amber-400/80 whitespace-pre-wrap pb-2 border-b border-white/5">
                      <p className="text-[9px] font-semibold uppercase text-amber-500 mb-1">Compiler Output:</p>
                      {compileOutput}
                    </div>
                  )}

                  {stderr && (
                    <div className="text-rose-400 whitespace-pre-wrap">
                      <p className="text-[9px] font-semibold uppercase text-rose-500 mb-1">Error Stream:</p>
                      {stderr}
                    </div>
                  )}

                  {stdout && (
                    <div className="text-slate-200 whitespace-pre-wrap">
                      <p className="text-[9px] font-semibold uppercase text-emerald-500 mb-1">Stdout Output:</p>
                      {stdout}
                    </div>
                  )}

                  {!stdout && !stderr && !compileOutput && (
                    <span className="text-slate-600 italic">No output yet. Write some code and click 'Run Code' to execute.</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Room;
