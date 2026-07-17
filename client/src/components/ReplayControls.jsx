import React, { useState } from 'react';
import { Play, Pause, Square, SkipBack, SkipForward, ChevronDown } from 'lucide-react';
import { getUserColor } from './VersionHistory';

const ReplayControls = ({
  isPlaying,
  onPlayPause,
  onStop,
  onNext,
  onPrev,
  speed,
  onSpeedChange,
  currentIndex,
  totalOperations,
  activeUser,
  currentTimestamp,
  operations = [],
  onSliderChange
}) => {
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);

  const firstOpTime = operations.length > 0 ? new Date(operations[0].timestamp).getTime() : 0;
  const lastOpTime = operations.length > 0 ? new Date(operations[operations.length - 1].timestamp).getTime() : 0;
  const totalDurationMs = lastOpTime - firstOpTime;

  // Format milliseconds to mm:ss
  const formatDuration = (ms) => {
    if (isNaN(ms) || ms < 0) return '00:00';
    const totalSecs = Math.floor(ms / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate elapsed duration based on the current index
  const getElapsedMs = () => {
    if (operations.length === 0 || currentIndex < 0) return 0;
    const currentOpTime = new Date(operations[Math.min(currentIndex, operations.length - 1)].timestamp).getTime();
    return Math.max(0, currentOpTime - firstOpTime);
  };

  // Pre-calculate positions of edit markers for the timeline to avoid heavy loops in render
  // Only draw a subset of markers (up to 150) if operations are too dense, to avoid DOM lag
  const getTimelineMarkers = () => {
    if (operations.length === 0 || totalDurationMs <= 0) return [];
    
    const step = Math.max(1, Math.floor(operations.length / 150));
    const markers = [];
    
    for (let i = 0; i < operations.length; i += step) {
      const op = operations[i];
      const opTime = new Date(op.timestamp).getTime();
      const pct = ((opTime - firstOpTime) / totalDurationMs) * 100;
      const color = getUserColor(op.userId);
      
      markers.push({
        id: op._id || i,
        index: i,
        pct: Math.min(100, Math.max(0, pct)),
        color: color.code,
        username: op.username,
        time: new Date(op.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        summary: op.editType === 'delete' ? 'Deleted code' : (op.summary || 'Edited code'),
      });
    }
    return markers;
  };

  const markers = getTimelineMarkers();
  const elapsedMs = getElapsedMs();

  return (
    <div className="bg-slate-900 border-t border-slate-700 p-4 flex flex-col gap-3.5 shrink-0 text-slate-200">
      
      {/* 1. Timeline Slider & Markers */}
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between text-[10px] text-slate-500 font-mono">
          <span>{formatDuration(elapsedMs)}</span>
          <span className="text-cyan-400 font-medium">Replay Progress: {currentIndex + 1} / {totalOperations} edits</span>
          <span>{formatDuration(totalDurationMs)}</span>
        </div>

        <div className="relative w-full h-4 flex items-center group">
          {/* Timeline background track */}
          <div className="absolute left-0 right-0 h-1.5 bg-slate-800 rounded-full border border-slate-700"></div>
          
          {/* Played progress fill */}
          <div 
            className="absolute left-0 h-1.5 bg-cyan-500/80 rounded-full pointer-events-none"
            style={{ width: `${totalOperations > 1 ? (currentIndex / (totalOperations - 1)) * 100 : 0}%` }}
          ></div>

          {/* Edit Markers ticks */}
          <div className="absolute inset-0 left-0 right-0 pointer-events-none">
            {markers.map((marker) => (
              <div
                key={marker.id}
                className="absolute w-1.5 h-3 top-0.5 rounded-full border border-slate-950 group/marker hover:scale-150 hover:z-30 transition-transform cursor-pointer pointer-events-auto"
                style={{ 
                  left: `calc(${marker.pct}% - 3px)`,
                  backgroundColor: marker.color
                }}
                onClick={() => onSliderChange(marker.index)}
              >
                {/* Tooltip */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/marker:flex flex-col bg-slate-950 text-slate-200 border border-slate-700 text-[10px] p-2.5 rounded shadow-xl whitespace-nowrap z-50 pointer-events-none font-sans leading-relaxed">
                  <div className="flex items-center gap-1.5 mb-1 font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: marker.color }}></span>
                    <span>{marker.username}</span>
                  </div>
                  <div className="text-slate-400">Time: {marker.time}</div>
                  <div className="text-cyan-400 mt-0.5 font-medium truncate max-w-[200px]">Action: {marker.summary}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Main Slider Input */}
          <input
            type="range"
            min="0"
            max={totalOperations > 0 ? totalOperations - 1 : 0}
            value={currentIndex}
            onChange={(e) => onSliderChange(parseInt(e.target.value))}
            className="absolute w-full h-4 opacity-0 cursor-pointer z-20"
          />
        </div>
      </div>

      {/* 2. Controls Dashboard */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        {/* Playback Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={onPrev}
            disabled={currentIndex <= 0}
            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-white transition-colors disabled:opacity-45 disabled:hover:bg-slate-800"
            title="Previous edit (Step backward)"
          >
            <SkipBack size={14} />
          </button>

          <button
            onClick={onPlayPause}
            className="p-2 rounded bg-purple-600 hover:bg-purple-500 text-white font-medium transition-colors shadow-md flex items-center justify-center"
            title={isPlaying ? 'Pause Replay' : 'Start Replay'}
          >
            {isPlaying ? <Pause size={16} className="fill-white" /> : <Play size={16} className="fill-white ml-0.5" />}
          </button>

          <button
            onClick={onStop}
            className="p-1.5 rounded bg-slate-800 hover:bg-rose-950/40 hover:border-rose-900 border border-slate-700 text-slate-400 hover:text-rose-400 transition-colors"
            title="Stop Replay (Return to workspace)"
          >
            <Square size={14} className="fill-current" />
          </button>

          <button
            onClick={onNext}
            disabled={currentIndex >= totalOperations - 1}
            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-white transition-colors disabled:opacity-45 disabled:hover:bg-slate-800"
            title="Next edit (Step forward)"
          >
            <SkipForward size={14} />
          </button>
        </div>

        {/* Speed Selector */}
        <div className="relative">
          <button
            onClick={() => setShowSpeedMenu(!showSpeedMenu)}
            className="h-8 px-3 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] font-medium flex items-center gap-1.5 text-slate-300 hover:text-white transition-colors"
          >
            Speed: {speed}x
            <ChevronDown size={12} className={`transition-transform duration-200 ${showSpeedMenu ? 'rotate-180' : ''}`} />
          </button>
          
          {showSpeedMenu && (
            <div className="absolute bottom-full right-0 mb-1 w-20 bg-slate-950 border border-slate-700 rounded shadow-xl overflow-hidden z-40">
              {[0.5, 1, 2, 4].map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    onSpeedChange(s);
                    setShowSpeedMenu(false);
                  }}
                  className={`w-full text-left text-[11px] px-3 py-1.5 hover:bg-purple-600 hover:text-white transition-colors ${
                    speed === s ? 'text-purple-400 font-bold bg-slate-900/60' : 'text-slate-400'
                  }`}
                >
                  {s}x
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Current Edit Metadata */}
        <div className="flex items-center gap-4 text-xs font-mono">
          {activeUser && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-500 uppercase">User:</span>
              <span className="font-semibold text-cyan-400">{activeUser}</span>
            </div>
          )}
          {currentTimestamp && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-500 uppercase">Time:</span>
              <span className="text-slate-300">{new Date(currentTimestamp).toLocaleTimeString()}</span>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default ReplayControls;
