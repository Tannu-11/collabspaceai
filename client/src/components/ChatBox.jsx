import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import API from '../api/axios';
import { useAuth } from '../context/AuthContext';

const COLORS = ['#2563eb','#16a34a','#7c3aed','#d97706','#dc2626','#0891b2'];
const gc = n => COLORS[n?.charCodeAt(0) % COLORS.length];
const EMOJIS = ['👍','👎','❤️','🔥','😂','🎉','👀','🙌'];
const INPUT_EMOJIS = ['😀', '😂', '🥺', '😎', '😍', '🤔', '🙌', '👍', '👎', '🔥', '❤️', '🎉', '✨', '😭', '😡', '✅'];

// Module-level socket so it persists across re-renders
let socketInstance = null;

export default function ChatBox({ projectId, members = [], onClose }) {
  const { user } = useAuth();
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [live, setLive] = useState(false);
  const [hoveredMsg, setHoveredMsg] = useState(null);
  const [pickerFor, setPickerFor]   = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const bottomRef = useRef();
  const inputRef  = useRef();
  const socketRef = useRef(null);
  const currentRoomRef = useRef(null);

  // Load history + establish socket once
  useEffect(() => {
    // Load message history
    API.get(`/messages/${projectId}`).then(({ data }) => setMsgs(data)).catch(() => {});

    // Create or reuse socket
    if (!socketRef.current || !socketRef.current.connected) {
      socketRef.current = io('http://localhost:5000', {
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
      });
    }

    const socket = socketRef.current;

    const onConnect = () => {
      setLive(true);
      // Join the project room after connect/reconnect
      socket.emit('joinRoom', projectId);
      currentRoomRef.current = projectId;
    };

    const onDisconnect = () => setLive(false);

    const onReceive = (msg) => {
      setMsgs(prev => {
        if (prev.some(m => m._id && m._id === msg._id)) return prev;
        return [...prev, msg];
      });
    };

    const onReact = ({ messageId, reactions }) => {
      setMsgs(prev => prev.map(m => m._id === messageId ? { ...m, reactions } : m));
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('receiveMessage', onReceive);
    socket.on('messageReacted', onReact);

    // If already connected, join room immediately
    if (socket.connected) {
      setLive(true);
      socket.emit('joinRoom', projectId);
      currentRoomRef.current = projectId;
    }

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('receiveMessage', onReceive);
      socket.off('messageReacted', onReact);
    };
  }, [projectId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs]);

  const send = useCallback((e) => {
    e.preventDefault();
    if (!text.trim() || !live || !socketRef.current) return;
    socketRef.current.emit('sendMessage', {
      content: text.trim(),
      senderId: user.id,
      senderName: user.name,
      projectId,
    });
    setText('');
    inputRef.current?.focus();
  }, [text, live, user, projectId]);

  const isMe  = msg => (msg.sender?._id || msg.sender) === user.id;
  const fmt   = d   => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const react = (msgId, emoji) => {
    socketRef.current.emit('reactMessage', { messageId: msgId, emoji, userId: user.id, projectId });
    setPickerFor(null);
  };

  const handleTextChange = (e) => {
    const val = e.target.value;
    setText(val);
    
    const cursor = e.target.selectionStart;
    const textBeforeCursor = val.slice(0, cursor);
    const lastWord = textBeforeCursor.split(/\s/).pop();

    if (lastWord && lastWord.startsWith('@')) {
      setShowMentions(true);
      setMentionQuery(lastWord.slice(1).toLowerCase());
      setMentionIndex(0);
    } else {
      setShowMentions(false);
    }
  };

  const filteredMembers = members.filter(m => m.name.toLowerCase().includes(mentionQuery));

  const handleSelectMention = (member) => {
    const cursor = inputRef.current.selectionStart;
    const textBeforeCursor = text.slice(0, cursor);
    const textAfterCursor = text.slice(cursor);
    const wordsBefore = textBeforeCursor.split(/\s/);
    wordsBefore.pop(); // remove the @query part
    const newTextBefore = wordsBefore.join(' ') + (wordsBefore.length > 0 ? ' ' : '') + `@${member.name} `;
    
    setText(newTextBefore + textAfterCursor);
    setShowMentions(false);
    
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.selectionStart = newTextBefore.length;
        inputRef.current.selectionEnd = newTextBefore.length;
      }
    }, 0);
  };

  const handleKeyDown = (e) => {
    if (showMentions && filteredMembers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(prev => (prev + 1) % filteredMembers.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(prev => (prev - 1 + filteredMembers.length) % filteredMembers.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleSelectMention(filteredMembers[mentionIndex]);
      } else if (e.key === 'Escape') {
        setShowMentions(false);
      }
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) send(e);
  };

  return (
    <div style={s.box}>
      <div style={s.head}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={s.headTitle}>Team Chat</span>
          <div style={{ ...s.dot, background: live ? 'var(--green)' : 'var(--red)', boxShadow: live ? '0 0 5px var(--green)' : 'none' }} />
          <span style={{ fontSize: '10px', color: live ? 'var(--green)' : 'var(--red)', fontWeight: '500' }}>
            {live ? 'Live' : 'Connecting...'}
          </span>
        </div>
        <button onClick={onClose} className="btn btn-ghost btn-sm">✕</button>
      </div>

      <div style={s.msgs}>
        {msgs.length === 0 && (
          <div style={s.empty}>
            <div style={{ fontSize: '28px', marginBottom: '8px' }}>💬</div>
            <p style={{ color: 'var(--text3)', fontSize: '12px', fontWeight: '500' }}>No messages yet — say hello!</p>
          </div>
        )}

        {msgs.map((msg, i) => {
          const mine  = isMe(msg);
          const name  = msg.sender?.name || 'Unknown';
          const color = gc(name);
          const prevSame = i > 0 && !isMe(msgs[i-1]) && (msgs[i-1]?.sender?._id || msgs[i-1]?.sender) === (msg.sender?._id || msg.sender);
          const showAvatar = !mine && !prevSame;

          return (
            <div
              key={msg._id || i}
              onMouseEnter={() => setHoveredMsg(msg._id)}
              onMouseLeave={() => setHoveredMsg(null)}
              style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', marginBottom: '8px', alignItems: 'flex-end', gap: '6px' }}
            >
              {!mine && (
                <div style={{ ...s.av, background: color, opacity: showAvatar ? 1 : 0 }}>
                  {name[0]?.toUpperCase()}
                </div>
              )}
              <div style={{ maxWidth: '78%', position: 'relative' }}>
                {!mine && showAvatar && (
                  <div style={{ fontSize: '10px', fontWeight: '600', color, marginBottom: '3px', paddingLeft: '2px' }}>{name}</div>
                )}
                
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', flexDirection: mine ? 'row-reverse' : 'row' }}>
                  <div style={{
                    background: mine ? 'var(--blue)' : 'var(--bg3)',
                    border: mine ? 'none' : '1px solid var(--border)',
                    borderRadius: mine ? '14px 4px 14px 14px' : showAvatar ? '4px 14px 14px 14px' : '14px 14px 14px 4px',
                    padding: '8px 12px',
                    position: 'relative',
                  }}>
                    <p style={{ fontSize: '13px', lineHeight: '1.5', color: mine ? '#fff' : 'var(--text)', wordBreak: 'break-word' }}>
                      {msg.content}
                    </p>
                    <span style={{ fontSize: '9px', color: mine ? 'rgba(255,255,255,0.55)' : 'var(--text3)', display: 'block', textAlign: 'right', marginTop: '3px' }}>
                      {fmt(msg.createdAt)}
                    </span>
                  </div>

                  {/* Reaction Button (hover) */}
                  {hoveredMsg === msg._id && !pickerFor && (
                    <button
                      onClick={() => setPickerFor(msg._id)}
                      style={{
                        background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '50%',
                        width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', fontSize: '12px', flexShrink: 0,
                        margin: mine ? '0 8px 0 0' : '0 0 0 8px',
                        boxShadow: 'var(--shadow)',
                      }}
                    >
                      😀
                    </button>
                  )}

                  {/* Emoji Picker was moved below */}
                </div>

                {/* Emoji Picker (Inline flow to prevent cutoff) */}
                {pickerFor === msg._id && (
                  <div style={{
                    marginTop: '4px',
                    background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
                    padding: '6px', display: 'flex', gap: '4px', flexWrap: 'wrap',
                    justifyContent: mine ? 'flex-end' : 'flex-start',
                    boxShadow: 'var(--shadow)',
                  }}>
                    {EMOJIS.map(e => (
                      <button key={e} onClick={() => react(msg._id, e)} style={{ background:'none', border:'none', fontSize:'16px', cursor:'pointer', padding:'2px', transition:'transform 0.1s' }} onMouseEnter={ev=>ev.target.style.transform='scale(1.2)'} onMouseLeave={ev=>ev.target.style.transform='scale(1)'}>
                        {e}
                      </button>
                    ))}
                    <button onClick={() => setPickerFor(null)} style={{ background:'none', border:'none', fontSize:'12px', cursor:'pointer', padding:'2px', color:'var(--text3)' }}>✕</button>
                  </div>
                )}

                {/* Render Reactions */}
                {msg.reactions && msg.reactions.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                    {msg.reactions.map(r => {
                      const hasReacted = r.users.some(u => (u._id || u).toString() === user.id.toString());
                      return (
                        <button
                          key={r.emoji}
                          onClick={() => react(msg._id, r.emoji)}
                          style={{
                            background: hasReacted ? 'var(--blue-dim)' : 'var(--bg2)',
                            border: `1px solid ${hasReacted ? 'var(--blue-border)' : 'var(--border2)'}`,
                            borderRadius: '99px', padding: '2px 6px',
                            display: 'flex', alignItems: 'center', gap: '4px',
                            fontSize: '11px', cursor: 'pointer',
                          }}
                        >
                          <span>{r.emoji}</span>
                          <span style={{ fontWeight: '600', color: hasReacted ? 'var(--blue)' : 'var(--text2)' }}>{r.users.length}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send} style={s.input}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          
          {showMentions && filteredMembers.length > 0 && (
            <div style={{
              position: 'absolute', bottom: '100%', left: '0', width: '200px',
              background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-lg)', zIndex: 10, padding: '4px', marginBottom: '8px',
              maxHeight: '150px', overflowY: 'auto'
            }}>
              {filteredMembers.map((m, idx) => (
                <div 
                  key={m._id} 
                  onClick={() => handleSelectMention(m)}
                  style={{
                    padding: '8px', cursor: 'pointer', borderRadius: 'var(--radius)',
                    background: idx === mentionIndex ? 'var(--blue-dim)' : 'transparent',
                    color: idx === mentionIndex ? 'var(--blue)' : 'var(--text)',
                    fontSize: '13px', fontWeight: '500'
                  }}
                  onMouseEnter={() => setMentionIndex(idx)}
                >
                  {m.name}
                </div>
              ))}
            </div>
          )}
          <button 
            type="button" 
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            style={{ 
              background: 'transparent', border: 'none', cursor: 'pointer',
              fontSize: '20px', padding: '4px', display: 'flex', alignItems: 'center',
              color: showEmojiPicker ? 'var(--blue)' : 'var(--text3)',
              transition: 'transform 0.1s'
            }}
            onMouseEnter={ev => ev.target.style.transform = 'scale(1.1)'}
            onMouseLeave={ev => ev.target.style.transform = 'scale(1)'}
          >
            😀
          </button>
          
          {showEmojiPicker && (
            <div style={{
              position: 'absolute', bottom: '100%', left: '0', marginBottom: '12px',
              background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
              padding: '8px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px',
              boxShadow: 'var(--shadow-lg)', zIndex: 10
            }}>
               {INPUT_EMOJIS.map(e => (
                 <button 
                   key={e} 
                   type="button" 
                   onClick={() => { 
                     setText(prev => prev + e); 
                     setShowEmojiPicker(false); 
                     inputRef.current?.focus(); 
                   }} 
                   style={{ 
                     background: 'none', border: 'none', fontSize: '20px', 
                     cursor: 'pointer', padding: '6px', transition: 'transform 0.1s',
                     display: 'flex', justifyContent: 'center', alignItems: 'center'
                   }} 
                   onMouseEnter={ev => ev.target.style.transform = 'scale(1.2)'} 
                   onMouseLeave={ev => ev.target.style.transform = 'scale(1)'}
                 >
                   {e}
                 </button>
               ))}
            </div>
          )}
        </div>
        <input
          ref={inputRef}
          value={text}
          onChange={handleTextChange}
          placeholder={live ? 'Send a message...' : 'Connecting...'}
          disabled={!live}
          style={{ flex: 1, borderRadius: '10px', fontSize: '13px' }}
          onKeyDown={handleKeyDown}
        />
        <button
          type="submit"
          className="btn btn-primary btn-sm"
          disabled={!text.trim() || !live}
          style={{ padding: '9px 16px', borderRadius: '10px' }}
        >
          ↑
        </button>
      </form>
    </div>
  );
}

const s = {
  box:  {
    display: 'flex', flexDirection: 'column', height: '100%',
    background: 'var(--bg2)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-xl)', overflow: 'hidden',
    boxShadow: 'var(--shadow-lg)',
  },
  head: {
    padding: '12px 14px', borderBottom: '1px solid var(--border)',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    background: 'var(--bg2)',
  },
  headTitle: { fontSize: '13px', fontWeight: '700', color: 'var(--text)' },
  dot:  { width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0 },
  msgs: {
    flex: 1, overflowY: 'auto',
    padding: '14px 12px',
    display: 'flex', flexDirection: 'column', gap: '0',
  },
  empty: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', flex: 1, padding: '40px',
  },
  av: {
    width: '24px', height: '24px', borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '10px', fontWeight: '700', color: '#fff',
    flexShrink: 0,
  },
  input: {
    display: 'flex', gap: '8px', alignItems: 'center',
    padding: '12px', borderTop: '1px solid var(--border)',
    background: 'var(--bg2)',
  },
};