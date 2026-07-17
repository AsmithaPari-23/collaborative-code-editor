import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { LogOut, Plus, Search, ArrowRight, Trash2 } from 'lucide-react';

const Dashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [filter, setFilter] = useState('all'); // 'all' or 'mine'

  // Modals / forms
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomDesc, setNewRoomDesc] = useState('');

  const [joinRoomId, setJoinRoomId] = useState('');

  const [error, setError] = useState('');
  const [modalError, setModalError] = useState('');

  // Fetch rooms on load and when filters change
  const fetchRooms = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await api.get(`/rooms?search=${submittedSearch}&filter=${filter}`);
      if (response.data?.success) {
        setRooms(response.data.data);
      }
    } catch (err) {
      setError('Failed to fetch rooms list.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [filter, submittedSearch]);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setSubmittedSearch(search);
  };

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    if (!newRoomName.trim()) {
      return setModalError('Room name is required.');
    }

    try {
      setModalError('');
      const response = await api.post('/rooms', {
        name: newRoomName.trim(),
        description: newRoomDesc.trim(),
      });

      if (response.data?.success) {
        const createdRoom = response.data.data.room;
        setShowCreateModal(false);
        setNewRoomName('');
        setNewRoomDesc('');
        // Redirect directly to the room
        navigate(`/room/${createdRoom._id}`);
      }
    } catch (err) {
      setModalError(err.response?.data?.message || 'Failed to create room.');
    }
  };

  const handleJoinRoom = async (e) => {
    e.preventDefault();
    const id = joinRoomId.trim();
    if (!id) {
      return setError('Please enter a Room ID.');
    }

    // Basic hex ObjectId validation (24 chars)
    if (!/^[0-9a-fA-F]{24}$/.test(id)) {
      return setError('Invalid Room ID format.');
    }

    try {
      setError('');
      const response = await api.post(`/rooms/join/${id}`);
      if (response.data?.success) {
        navigate(`/room/${id}`);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to join room. Verify the Room ID.');
    }
  };

  const handleDeleteRoom = async (roomId, e) => {
    e.stopPropagation(); // Avoid card click if click is on delete button
    if (!confirm('Are you sure you want to delete this room and all its files?')) return;

    try {
      const response = await api.delete(`/rooms/${roomId}`);
      if (response.data?.success) {
        fetchRooms();
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete room.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-10 flex flex-col">
      {/* Header */}
      <header className="flex justify-between items-center mb-10 pb-6 border-b border-slate-700">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white">CollabEditor</h1>
          <p className="text-xs text-slate-400 mt-1">
            Logged in as <span className="text-slate-200 font-medium">{user?.username}</span>
          </p>
        </div>

        <button
          onClick={logout}
          className="glass-btn-secondary h-10 px-4 py-0 flex items-center gap-2 text-xs"
        >
          <LogOut size={14} />
          Sign Out
        </button>
      </header>

      {/* Main Actions Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Search & Filter */}
        <div className="lg:col-span-2 glass-panel rounded-xl p-5 flex flex-col justify-between">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
            Search Workspace
          </h2>

          <form onSubmit={handleSearchSubmit} className="flex gap-3">
            <div className="relative flex-1 flex items-center">
              <Search className="absolute left-[18px] top-1/2 -translate-y-1/2 text-slate-500" size={16} />
              <input
                type="text"
                placeholder="Search rooms..."
                className="w-full glass-input glass-input-search text-xs"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button type="submit" className="glass-btn-secondary text-xs h-10 px-5">
              Search
            </button>
          </form>

          <div className="flex gap-2 mt-4">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${filter === 'all'
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-100'
                }`}
            >
              All Rooms
            </button>
            <button
              onClick={() => setFilter('mine')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${filter === 'mine'
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-100'
                }`}
            >
              My Rooms
            </button>
          </div>
        </div>

        {/* Quick Join and Create */}
        <div className="glass-panel rounded-xl p-5 flex flex-col justify-between">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
            Join or Create
          </h2>

          {/* Join Room */}
          <form onSubmit={handleJoinRoom} className="flex gap-2 mb-4">
            <input
              type="text"
              placeholder="Enter Room ID"
              className="flex-1 glass-input text-xs h-10"
              value={joinRoomId}
              onChange={(e) => setJoinRoomId(e.target.value)}
            />
            <button type="submit" className="glass-btn-primary text-xs h-10 px-4 flex items-center gap-1">
              Join
              <ArrowRight size={14} />
            </button>
          </form>

          {/* Trigger Create */}
          <button
            onClick={() => setShowCreateModal(true)}
            className="w-full glass-btn-secondary text-xs h-10 flex items-center justify-center gap-2"
          >
            <Plus size={14} />
            Create New Room
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
          {error}
        </div>
      )}

      {/* Rooms Listing */}
      <div className="flex-1">
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
          Collaboration Rooms ({rooms.length})
        </h2>

        {loading ? (
          <div className="h-64 flex flex-col items-center justify-center text-slate-500">
            <div className="w-8 h-8 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin mb-3"></div>
            <p className="text-xs">Loading rooms...</p>
          </div>
        ) : rooms.length === 0 ? (
          <div className="h-64 glass-panel rounded-xl flex flex-col items-center justify-center text-slate-400 p-6 text-center border-dashed border-slate-700">
            <p className="text-sm font-medium mb-1">No rooms found</p>
            <p className="text-xs text-slate-500 max-w-xs">
              Try search keywords or create a new room to begin code sharing.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {rooms.map((room) => {
              const isOwner = room.ownerId?._id === user?._id;
              return (
                <div
                  key={room._id}
                  onClick={() => navigate(`/room/${room._id}`)}
                  className="glass-panel rounded-xl p-5 hover:border-blue-600 cursor-pointer transition-all duration-200 flex flex-col justify-between group h-44 shadow-lg shadow-black/10"
                >
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="text-sm font-semibold text-slate-100 group-hover:text-blue-400 transition-colors line-clamp-1">
                        {room.name}
                      </h3>
                      {isOwner && (
                        <button
                          onClick={(e) => handleDeleteRoom(room._id, e)}
                          className="text-slate-500 hover:text-rose-400 p-1 rounded transition-colors"
                          title="Delete room"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 line-clamp-2 pr-1 mb-4 font-light">
                      {room.description || 'No description provided.'}
                    </p>
                  </div>

                  <div className="border-t border-slate-700 pt-3 flex justify-between items-center text-[10px] text-slate-500 font-medium uppercase tracking-wider">
                    <span>By: {room.ownerId?.username || 'Unknown'}</span>
                    <span className="text-slate-500">ID: {room._id}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Room Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md glass-panel rounded-2xl p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-white mb-2">Create Room</h3>
            <p className="text-xs text-slate-400 mb-5">Create a room to share code real-time.</p>

            {modalError && (
              <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
                {modalError}
              </div>
            )}

            <form onSubmit={handleCreateRoom} className="space-y-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider" htmlFor="room-name">
                  Room Name
                </label>
                <input
                  id="room-name"
                  type="text"
                  placeholder="E.g., Frontend Sprint"
                  className="glass-input text-xs"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider" htmlFor="room-desc">
                  Description
                </label>
                <textarea
                  id="room-desc"
                  rows={3}
                  placeholder="Optional details..."
                  className="glass-input text-xs resize-none"
                  value={newRoomDesc}
                  onChange={(e) => setNewRoomDesc(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setNewRoomName('');
                    setNewRoomDesc('');
                  }}
                  className="glass-btn-secondary text-xs h-9 px-4"
                >
                  Cancel
                </button>
                <button type="submit" className="glass-btn-primary text-xs h-9 px-4">
                  Create Room
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
