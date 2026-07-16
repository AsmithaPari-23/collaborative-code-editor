import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

const SOCKET_URL = import.meta.env.DEV ? 'http://localhost:5000' : window.location.origin;

export const SocketProvider = ({ children }) => {
  const { user } = useAuth();
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [activeUsers, setActiveUsers] = useState([]);
  const [currentRoomId, setCurrentRoomId] = useState(null);

  const roomIdRef = useRef(null);

  useEffect(() => {
    roomIdRef.current = currentRoomId;
  }, [currentRoomId]);

  // Connect / Disconnect socket based on user login
  useEffect(() => {
    if (!user) {
      return;
    }

    const socketInstance = io(SOCKET_URL, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      withCredentials: true,
    });

    socketInstance.on('connect', () => {
      setIsConnected(true);
      console.log('Socket connected:', socketInstance.id);
      
      // If we were previously in a room, re-join on reconnect
      if (roomIdRef.current) {
        socketInstance.emit('join-room', {
          roomId: roomIdRef.current,
          userId: user._id,
          username: user.username,
        });
      }
    });

    socketInstance.on('disconnect', () => {
      setIsConnected(false);
      console.log('Socket disconnected');
    });

    socketInstance.on('connect_error', (err) => {
      console.error('Socket connection error:', err.message);
      setIsConnected(false);
    });

    // Listen to real-time member join events
    socketInstance.on('user-joined', ({ activeUsers: updatedUsers }) => {
      setActiveUsers(updatedUsers);
    });

    // Listen to active user lists sent from server
    socketInstance.on('active-users-list', (users) => {
      setActiveUsers(users);
    });

    // Listen to user departure events
    socketInstance.on('user-left', ({ activeUsers: updatedUsers }) => {
      setActiveUsers(updatedUsers);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
      setSocket(null);
      setIsConnected(false);
    };
  }, [user]);

  // Join room helper
  const joinRoom = useCallback((roomId) => {
    if (!socket || !user) return;
    setCurrentRoomId(roomId);
    socket.emit('join-room', {
      roomId,
      userId: user._id,
      username: user.username,
    });
  }, [socket, user]);

  // Leave room helper
  const leaveRoom = useCallback(() => {
    if (!socket) return;
    socket.emit('leave-room');
    setCurrentRoomId(null);
    setActiveUsers([]);
  }, [socket]);

  return (
    <SocketContext.Provider
      value={{
        socket,
        isConnected,
        activeUsers,
        joinRoom,
        leaveRoom,
        roomId: currentRoomId,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};
