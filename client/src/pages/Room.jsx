import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import MonacoEditor, { DiffEditor } from '@monaco-editor/react';
import { useSocket } from '../context/SocketContext';
import api from '../services/api';
import { 
  Folder, Users, MessageSquare, History, Settings, Play, 
  ArrowLeft, AlertTriangle, Terminal, Cpu, Info, EyeOff
} from 'lucide-react';

import FileTree from '../components/FileTree';
import UsersPanel from '../components/UsersPanel';
import ChatPanel from '../components/ChatPanel';
import VersionHistory, { getUserColor } from '../components/VersionHistory';
import SettingsPanel from '../components/SettingsPanel';
import ReplayControls from '../components/ReplayControls';

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
    theme: 'premium-dark',
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

  // Replay states
  const [isReplayMode, setIsReplayMode] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [replayOperations, setReplayOperations] = useState([]);
  const [replayIndex, setReplayIndex] = useState(-1);
  const [replaySpeed, setReplaySpeed] = useState(1);
  const [diffMode, setDiffMode] = useState(false);
  const [originalDiffContent, setOriginalDiffContent] = useState('');
  const [modifiedDiffContent, setModifiedDiffContent] = useState('');
  const [activeVersionId, setActiveVersionId] = useState(null);

  const preReplayContentRef = useRef(null);
  const replayDecorationsRef = useRef([]);
  const playbackTimeoutRef = useRef(null);

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

    // Define custom premium theme matching user requirements
    monaco.editor.defineTheme('premium-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: '', foreground: 'F2F2F2' },
        { token: 'comment', foreground: '70706B', fontStyle: 'italic' },
        { token: 'keyword', foreground: '9EEA57' },
        { token: 'string', foreground: '8BA86D' },
        { token: 'number', foreground: 'F2F2F2' },
        { token: 'regexp', foreground: '8BA86D' },
        { token: 'type', foreground: '9EEA57' },
        { token: 'class', foreground: '9EEA57' },
        { token: 'function', foreground: 'B7FF5A' },
      ],
      colors: {
        'editor.background': '#1B1B19',
        'editor.foreground': '#F2F2F2',
        'editor.lineHighlightBackground': '#242422',
        'editorLineNumber.foreground': '#70706B',
        'editorLineNumber.activeForeground': '#F2F2F2',
        'editor.selectionBackground': '#9EEA5725',
        'editor.inactiveSelectionBackground': '#9EEA5712',
        'editorCursor.foreground': '#9EEA57',
      }
    });

    monaco.editor.setTheme('premium-dark');

    // Set model options from state
    const model = editor.getModel();
    if (model) {
      model.updateOptions({ tabSize: settings.tabSize });
    }

    // Attach local document change change-listener
    editor.onDidChangeModelContent((event) => {
      if (isPreventEmitRef.current) {
        // Change was applied programmatically; skip emitting
        isPreventEmitRef.current = false;
        return;
      }

      if (!socket || !activeFileId || isReplayMode || diffMode) return;

      const position = editor.getPosition();
      const selection = editor.getSelection();

      // Broadcast changes to peers, including cursor, selection, and filename for replay logs
      socket.emit('code-change', {
        roomId,
        fileId: activeFileId,
        content: editor.getValue(),
        changes: event.changes,
        cursor: position ? { line: position.lineNumber, column: position.column } : null,
        selection: selection ? {
          startLine: selection.startLineNumber,
          startColumn: selection.startColumn,
          endLine: selection.endLineNumber,
          endColumn: selection.endColumn,
        } : null,
        fileName: activeFile?.name || 'untitled',
      });

      // Typing indicator triggers
      handleTypingIndicator();
    });

    // Attach cursor movements & selections trackers
    const trackCursorAndSelection = () => {
      if (!socket || !activeFileId || isReplayMode || diffMode) return;

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
      if (isReplayMode || diffMode) return; // ignore incoming edits during replay or diff previews
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
    const handleCursorUpdate = ({ socketId, username, userId, fileId, cursor, selection }) => {
      if (isReplayMode || diffMode) return; // ignore cursor updates during replay or diff previews
      if (fileId !== activeFileId || !editorRef.current || !monacoRef.current) return;

      const editor = editorRef.current;
      const monaco = monacoRef.current;

      const oldDecorations = decorationsMap.current.get(socketId) || [];
      const newDecorations = [];

      const userColor = getUserColor(userId);

      // If we have cursor coords, add cursor line marker decoration with user color
      if (cursor) {
        newDecorations.push({
          range: new monaco.Range(cursor.line, cursor.column, cursor.line, cursor.column),
          options: {
            className: `remote-cursor remote-cursor-${userColor.name}`,
            hoverMessage: { value: `**${username}** is here` },
            // Display username tag inside the editor alongside their cursor!
            after: {
              content: username,
              inlineClassName: `remote-cursor-label remote-cursor-label-${userColor.name}`,
            },
          },
        });
      }

      // If selection range is active, add highlight range decoration with user color
      if (selection && (selection.startLine !== selection.endLine || selection.startColumn !== selection.endColumn)) {
        newDecorations.push({
          range: new monaco.Range(
            selection.startLine,
            selection.startColumn,
            selection.endLine,
            selection.endColumn
          ),
          options: {
            className: `remote-selection remote-selection-${userColor.name}`,
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

  // 1. Sync file content from DB helper (to resolve any changes during replay/diff views)
  const syncFileContent = async () => {
    if (!activeFileId) return;
    try {
      const response = await api.get(`/files/room/${roomId}`);
      if (response.data?.success) {
        const refreshedFiles = response.data.data;
        setFiles(refreshedFiles);
        const updatedFile = refreshedFiles.find((f) => f._id === activeFileId);
        if (updatedFile && editorRef.current) {
          isPreventEmitRef.current = true;
          editorRef.current.setValue(updatedFile.content || '');
        }
      }
    } catch (err) {
      console.error('Failed to sync file content:', err);
    }
  };

  // 2. Select a version in Version History sidebar
  const handleSelectVersion = (version, previousVersion) => {
    if (!version) {
      setDiffMode(false);
      setActiveVersionId(null);
      return;
    }

    setActiveVersionId(version._id);
    setDiffMode(true);
    setOriginalDiffContent(previousVersion?.snapshotContent || '');
    setModifiedDiffContent(version.snapshotContent || '');
  };

  // 3. Restore a specific version
  const handleRestoreVersion = async (version) => {
    try {
      setError('');
      const response = await api.post(`/history/restore/${version._id}`);
      if (response.data?.success) {
        const { file } = response.data.data;
        
        // Notify socket room that a restoration has occurred
        if (socket) {
          socket.emit('code-change', {
            roomId,
            fileId: file._id,
            content: file.content,
            changes: [], // triggers full replacement
          });
        }

        // Close diff preview and reload file content
        setDiffMode(false);
        setActiveVersionId(null);
        await syncFileContent();
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Error restoring version.');
    }
  };

  // 4. Start Time Travel Replay Session
  const handleStartReplay = async () => {
    if (!activeFileId || !editorRef.current) return;
    try {
      setLoading(true);
      setError('');
      
      // Save current content to restore upon exit
      preReplayContentRef.current = editorRef.current.getValue();

      // Fetch all operations
      const response = await api.get(`/history/replays/${activeFileId}`);
      if (response.data?.success) {
        const ops = response.data.data;
        setReplayOperations(ops);
        setIsReplayMode(true);
        setIsPlaying(true);
        
        // Set editor to empty string to start from scratch
        isPreventEmitRef.current = true;
        editorRef.current.setValue('');
        setReplayIndex(-1);
      }
    } catch (err) {
      setError('Failed to load replay session operations.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // 5. Apply a replay operation step
  const applyReplayStep = useCallback((index) => {
    if (!editorRef.current || !monacoRef.current || index < 0 || index >= replayOperations.length) return;
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    const model = editor.getModel();
    if (!model) return;

    const op = replayOperations[index];

    // Prevent emitting document changes
    isPreventEmitRef.current = true;
    if (op.changes && op.changes.length > 0) {
      const edits = op.changes.map((change) => ({
        range: new monaco.Range(
          change.range.startLineNumber,
          change.range.startColumn,
          change.range.endLineNumber,
          change.range.endColumn
        ),
        text: change.text,
        forceMoveMarkers: true,
      }));
      model.pushEditOperations([], edits, () => null);
    }

    // Update cursors and decorations
    updateReplayDecorations(op);

    // Scroll to active edit cursor
    if (op.cursor) {
      editor.revealPositionInCenterIfOutsideViewport({
        lineNumber: op.cursor.line,
        column: op.cursor.column
      });
    }
  }, [replayOperations]);

  // 6. Update user cursor and highlight decorations during replay
  const updateReplayDecorations = (op) => {
    if (!editorRef.current || !monacoRef.current || !op) return;
    const editor = editorRef.current;
    const monaco = monacoRef.current;

    const userColor = getUserColor(op.userId);
    const cursor = op.cursor;
    const selection = op.selection;

    const newDecorations = [];

    // Collaborator cursor
    if (cursor) {
      newDecorations.push({
        range: new monaco.Range(cursor.line, cursor.column, cursor.line, cursor.column),
        options: {
          className: `remote-cursor remote-cursor-${userColor.name}`,
          hoverMessage: { value: `**${op.username}** is replaying` },
          after: {
            content: op.username,
            inlineClassName: `remote-cursor-label remote-cursor-label-${userColor.name}`,
          },
        },
      });
    }

    // Collaborator selection range
    if (selection && (selection.startLine !== selection.endLine || selection.startColumn !== selection.endColumn)) {
      newDecorations.push({
        range: new monaco.Range(
          selection.startLine,
          selection.startColumn,
          selection.endLine,
          selection.endColumn
        ),
        options: {
          className: `remote-selection remote-selection-${userColor.name}`,
        },
      });
    }

    // Typing highlight (light background overlay fading out)
    if (op.changes && op.changes.length > 0) {
      op.changes.forEach((change) => {
        if (change.text) {
          const lines = change.text.split('\n');
          const endLine = change.range.startLineNumber + lines.length - 1;
          const endCol = lines.length === 1 
            ? change.range.startColumn + change.text.length 
            : lines[lines.length - 1].length + 1;

          newDecorations.push({
            range: new monaco.Range(
              change.range.startLineNumber,
              change.range.startColumn,
              endLine,
              endCol
            ),
            options: {
              className: `replay-new-text-highlight replay-typing-highlight-${userColor.name}`,
            },
          });
        }
      });
    }

    const decorationIds = editor.deltaDecorations(replayDecorationsRef.current, newDecorations);
    replayDecorationsRef.current = decorationIds;
  };

  // 7. Get playback delay based on keystroke timestamp diff
  const getDelayToNextStep = useCallback((index) => {
    if (index <= 0 || index >= replayOperations.length) return 500 / replaySpeed;
    const currentOp = replayOperations[index];
    const prevOp = replayOperations[index - 1];
    const diff = new Date(currentOp.timestamp).getTime() - new Date(prevOp.timestamp).getTime();
    
    // Cap idle delay to 1.5s max, 50ms min
    const cappedDiff = Math.min(1500, Math.max(50, diff));
    return cappedDiff / replaySpeed;
  }, [replayOperations, replaySpeed]);

  // 8. Replay playback loop hook
  useEffect(() => {
    if (isPlaying && isReplayMode) {
      const nextIndex = replayIndex + 1;
      if (nextIndex >= replayOperations.length) {
        setIsPlaying(false);
        return;
      }

      const delay = getDelayToNextStep(nextIndex);
      playbackTimeoutRef.current = setTimeout(() => {
        applyReplayStep(nextIndex);
        setReplayIndex(nextIndex);
      }, delay);
    }

    return () => {
      if (playbackTimeoutRef.current) {
        clearTimeout(playbackTimeoutRef.current);
      }
    };
  }, [isPlaying, replayIndex, isReplayMode, replayOperations, replaySpeed, getDelayToNextStep, applyReplayStep]);

  // 9. Stop / Exit Replay
  const stopReplay = () => {
    if (playbackTimeoutRef.current) {
      clearTimeout(playbackTimeoutRef.current);
    }
    setIsPlaying(false);
    setIsReplayMode(false);
    setReplayIndex(-1);

    if (editorRef.current) {
      editorRef.current.deltaDecorations(replayDecorationsRef.current, []);
      replayDecorationsRef.current = [];
    }

    syncFileContent();
  };

  // 10. Manual scrubbing or timeline jumping
  const handleSliderChange = (targetIndex) => {
    if (!editorRef.current || !monacoRef.current || replayOperations.length === 0) return;
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    const model = editor.getModel();
    if (!model) return;

    // Pause playback while scrubbing
    setIsPlaying(false);

    // Apply operations synchronously up to targetIndex
    isPreventEmitRef.current = true;
    model.setValue('');

    for (let i = 0; i <= targetIndex; i++) {
      const op = replayOperations[i];
      if (op.changes && op.changes.length > 0) {
        const edits = op.changes.map((change) => ({
          range: new monaco.Range(
            change.range.startLineNumber,
            change.range.startColumn,
            change.range.endLineNumber,
            change.range.endColumn
          ),
          text: change.text,
          forceMoveMarkers: true,
        }));
        model.pushEditOperations([], edits, () => null);
      }
    }

    const lastOp = replayOperations[targetIndex];
    updateReplayDecorations(lastOp);
    setReplayIndex(targetIndex);
  };

  // 11. Playback controls navigation
  const handleNextStep = () => {
    if (replayIndex < replayOperations.length - 1) {
      const nextIdx = replayIndex + 1;
      applyReplayStep(nextIdx);
      setReplayIndex(nextIdx);
    }
  };

  const handlePrevStep = () => {
    if (replayIndex > 0) {
      handleSliderChange(replayIndex - 1);
    } else if (replayIndex === 0) {
      // Jump back to initial blank state
      if (editorRef.current) {
        isPreventEmitRef.current = true;
        editorRef.current.getModel()?.setValue('');
        editorRef.current.deltaDecorations(replayDecorationsRef.current, []);
        replayDecorationsRef.current = [];
      }
      setReplayIndex(-1);
    }
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
      <header className="h-14 border-b border-slate-700 bg-slate-900 px-6 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-4 min-w-0">
          <button
            onClick={() => navigate('/')}
            className="text-slate-400 hover:text-slate-100 p-1.5 rounded-lg hover:bg-slate-600 transition-colors shrink-0"
          >
            <ArrowLeft size={16} />
          </button>
          
          <div className="min-w-0">
            <h1 className="text-xs font-semibold text-slate-100 truncate flex items-center gap-2">
              {room?.name}
              <span className="text-[10px] px-2 py-0.5 rounded bg-slate-600 text-slate-100 font-light lowercase">
                {activeFile?.language}
              </span>
            </h1>
            <p className="text-[10px] text-slate-400 truncate font-light hidden md:block">
              {room?.description || 'Collaborative coding workspace'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {!isReplayMode && activeFileId && (
            <button
              onClick={handleStartReplay}
              className="glass-btn-primary h-7 px-3 py-0 flex items-center gap-1.5 text-[10px] tracking-wide border-purple-600 bg-purple-600 hover:bg-purple-500"
            >
              <Play size={10} className="fill-white" />
              Replay Session
            </button>
          )}
          <span className="text-[10px] font-semibold tracking-wider uppercase text-slate-400 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            Syncing: {activeUsers.length} Online
          </span>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Tab Selection Sidebar (vertical bar) */}
        <div className="w-12 border-r border-slate-700 bg-slate-900 flex flex-col items-center py-4 gap-4 shrink-0">
          <button
            onClick={() => setActiveTab('files')}
            className={`p-2 rounded-lg transition-colors ${
              activeTab === 'files' ? 'bg-blue-600/10 text-blue-400' : 'text-slate-400 hover:text-slate-100'
            }`}
            title="Files Tree"
          >
            <Folder size={16} />
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`p-2 rounded-lg transition-colors ${
              activeTab === 'users' ? 'bg-blue-600/10 text-blue-400' : 'text-slate-400 hover:text-slate-100'
            }`}
            title="Room Members"
          >
            <Users size={16} />
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            className={`p-2 rounded-lg transition-colors relative ${
              activeTab === 'chat' ? 'bg-blue-600/10 text-blue-400' : 'text-slate-400 hover:text-slate-100'
            }`}
            title="Chat Room"
          >
            <MessageSquare size={16} />
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`p-2 rounded-lg transition-colors ${
              activeTab === 'history' ? 'bg-blue-600/10 text-blue-400' : 'text-slate-400 hover:text-slate-100'
            }`}
            title="Version Snapshots"
          >
            <History size={16} />
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`p-2 rounded-lg transition-colors ${
              activeTab === 'settings' ? 'bg-blue-600/10 text-blue-400' : 'text-slate-400 hover:text-slate-100'
            }`}
            title="Editor Settings"
          >
            <Settings size={16} />
          </button>
        </div>

        {/* Selected Tab panel */}
        <div className="w-72 border-r border-slate-700 bg-slate-900 p-4 flex flex-col overflow-y-auto shrink-0">
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
              socket={socket}
              activeVersionId={activeVersionId}
              onSelectVersion={handleSelectVersion}
              onRestoreVersion={handleRestoreVersion}
              onStartReplay={handleStartReplay}
              isReplayMode={isReplayMode}
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

            {/* Banners */}
            {diffMode && (
              <div className="absolute top-0 left-0 right-0 z-20 h-10 bg-purple-950/90 border-b border-purple-800 px-4 flex justify-between items-center text-xs">
                <span className="text-purple-200 font-medium">
                  Previewing Diff (Comparing version checkpoint with previous state)
                </span>
                <button
                  onClick={() => {
                    setDiffMode(false);
                    setActiveVersionId(null);
                  }}
                  className="glass-btn-secondary h-7 py-0 px-2.5 text-[10px] border-purple-500/30 text-purple-300 hover:border-purple-500 hover:text-white"
                >
                  Exit Preview
                </button>
              </div>
            )}

            {isReplayMode && (
              <div className="absolute top-0 left-0 right-0 z-20 h-10 bg-cyan-950/90 border-b border-cyan-800 px-4 flex justify-between items-center text-xs">
                <span className="text-cyan-200 flex items-center gap-1.5 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse"></span>
                  Time Travel Replay Mode {isPlaying ? '(Playing)' : '(Paused)'}
                </span>
                <button
                  onClick={stopReplay}
                  className="glass-btn-secondary h-7 py-0 px-2.5 text-[10px] border-cyan-500/30 text-cyan-300 hover:border-cyan-500 hover:text-white"
                >
                  Exit Replay
                </button>
              </div>
            )}

            {activeFileId && activeFile ? (
              diffMode ? (
                <DiffEditor
                  height="100%"
                  language={activeFile.language}
                  theme={settings.theme}
                  original={originalDiffContent}
                  modified={modifiedDiffContent}
                  options={{
                    readOnly: true,
                    fontSize: settings.fontSize,
                    fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', Courier, monospace",
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
                    automaticLayout: true,
                  }}
                  loading={
                    <div className="h-full flex flex-col items-center justify-center text-slate-500">
                      <div className="w-6 h-6 border-2 border-slate-700 border-t-purple-500 rounded-full animate-spin mb-2"></div>
                      <p className="text-xs font-light">Loading Monaco Diff Editor...</p>
                    </div>
                  }
                />
              ) : (
                <MonacoEditor
                  height="100%"
                  language={activeFile.language}
                  theme={settings.theme}
                  value={activeFile.content}
                  onMount={handleEditorDidMount}
                  options={{
                    readOnly: isReplayMode,
                    fontSize: settings.fontSize,
                    fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', Courier, monospace",
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
                    cursorBlinking: isReplayMode ? 'blink' : 'smooth',
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
              )
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs font-light">
                No active files open. Select or create a file in the sidebar tree.
              </div>
            )}
          </div>

          {/* Lower Tray: Compilation Panel OR Replay Controls */}
          {isReplayMode ? (
            <ReplayControls
              isPlaying={isPlaying}
              onPlayPause={() => setIsPlaying(!isPlaying)}
              onStop={stopReplay}
              onNext={handleNextStep}
              onPrev={handlePrevStep}
              speed={replaySpeed}
              onSpeedChange={(s) => setReplaySpeed(s)}
              currentIndex={replayIndex}
              totalOperations={replayOperations.length}
              activeUser={replayIndex >= 0 && replayIndex < replayOperations.length ? replayOperations[replayIndex].username : ''}
              currentTimestamp={replayIndex >= 0 && replayIndex < replayOperations.length ? replayOperations[replayIndex].timestamp : ''}
              operations={replayOperations}
              onSliderChange={handleSliderChange}
            />
          ) : (
            <div className="h-64 border-t border-slate-700 bg-slate-800 flex flex-col shrink-0">
              {/* Control Bar */}
              <div className="h-10 border-b border-slate-700 bg-slate-900 px-4 flex justify-between items-center shrink-0">
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
              <div className="flex-1 flex min-h-0 overflow-hidden divide-x divide-slate-700">
                {/* Input Stdin */}
                <div className="w-1/3 p-3 flex flex-col h-full bg-slate-800">
                  <label className="text-[9px] text-slate-500 uppercase font-semibold tracking-wider mb-2 block">
                    Console Input (Stdin)
                  </label>
                  <textarea
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-blue-600 resize-none"
                    placeholder="Enter stdin parameters..."
                    value={stdin}
                    onChange={(e) => setStdin(e.target.value)}
                  />
                </div>

                {/* Outputs Terminals */}
                <div className="w-2/3 p-3 flex flex-col h-full bg-slate-800 overflow-y-auto">
                  <label className="text-[9px] text-slate-500 uppercase font-semibold tracking-wider mb-2 block">
                    Console Output (Stdout/Stderr)
                  </label>
                  <div className="flex-1 bg-slate-900 border border-slate-700 rounded-lg p-3 font-mono text-xs overflow-y-auto space-y-2 select-text">
                    {compileOutput && (
                      <div className="text-amber-400/80 whitespace-pre-wrap pb-2 border-b border-slate-700">
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
          )}
        </div>
      </div>
    </div>
  );
};

export default Room;
