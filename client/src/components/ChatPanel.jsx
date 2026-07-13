import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Send } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const ChatPanel = ({ roomId, socket }) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [typedMessage, setTypedMessage] = useState('');
  const chatBottomRef = useRef(null);

  // Fetch previous messages on mount
  useEffect(() => {
    const fetchChatHistory = async () => {
      try {
        const response = await api.get(`/messages/room/${roomId}`);
        if (response.data?.success) {
          setMessages(response.data.data);
        }
      } catch (err) {
        console.error('Failed to load chat history:', err.message);
      }
    };

    fetchChatHistory();
  }, [roomId]);

  // Setup socket listener for live messages
  useEffect(() => {
    if (!socket) return;

    const handleReceiveMessage = (message) => {
      setMessages((prev) => [...prev, message]);
    };

    socket.on('receive-message', handleReceiveMessage);

    return () => {
      socket.off('receive-message', handleReceiveMessage);
    };
  }, [socket]);

  // Scroll to bottom on new messages
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = (e) => {
    e.preventDefault();
    const content = typedMessage.trim();
    if (!content || !socket || !user) return;

    socket.emit('send-message', {
      roomId,
      content,
      userId: user._id,
    });

    setTypedMessage('');
  };

  const formatTime = (isoString) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <MessageSquare size={14} />
          Room Chat
        </h3>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-1">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs font-light">
            No messages yet. Start the conversation!
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isMe = msg.senderId?._id === user?._id || msg.senderId === user?._id;
            const senderName = msg.senderId?.username || 'User';

            return (
              <div
                key={idx}
                className={`flex flex-col max-w-[85%] ${isMe ? 'self-end ml-auto items-end' : 'self-start mr-auto items-start'}`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[10px] text-slate-400 font-medium">
                    {isMe ? 'You' : senderName}
                  </span>
                  <span className="text-[9px] text-slate-500 font-light">
                    {formatTime(msg.timestamp || msg.createdAt)}
                  </span>
                </div>
                <div
                  className={`px-3 py-2 rounded-xl text-xs ${
                    isMe
                      ? 'bg-blue-600 text-white rounded-tr-none'
                      : 'bg-white/5 border border-white/5 text-slate-200 rounded-tl-none'
                  }`}
                >
                  <p className="break-words leading-relaxed">{msg.content}</p>
                </div>
              </div>
            );
          })
        )}
        <div ref={chatBottomRef} />
      </div>

      {/* Send Box */}
      <form onSubmit={handleSendMessage} className="flex gap-2">
        <input
          type="text"
          placeholder="Type a message..."
          className="flex-1 glass-input text-xs h-10"
          value={typedMessage}
          onChange={(e) => setTypedMessage(e.target.value)}
        />
        <button type="submit" className="glass-btn-primary h-10 w-10 p-0 flex items-center justify-center shrink-0">
          <Send size={14} />
        </button>
      </form>
    </div>
  );
};

export default ChatPanel;
