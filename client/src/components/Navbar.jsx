import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import API from '../api/axios';
import { io } from 'socket.io-client';

function getDeadlineStatus(deadline) {
  if (!deadline) return null;
  const diff = (new Date(deadline) - new Date()) / (1000 * 60 * 60 * 24);
  if (diff < 0) return 'overdue';
  if (diff < 3) return 'urgent';
  if (diff < 7) return 'warn';
  return 'safe';
}

export default function Navbar({ onAIOpen }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [notifOpen, setNotifOpen]         = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [projects, setProjects]           = useState([]);
  const [dark, setDark]                   = useState(() => localStorage.getItem('theme') === 'dark');
  const [showUserMenu, setShowUserMenu]   = useState(false);
  const notifRef = useRef();
  const userMenuRef = useRef();
  const socketRef = useRef(null);

  // Apply theme to <html>
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);

  // Init theme from localStorage on first mount
  useEffect(() => {
    const saved = localStorage.getItem('theme');
    if (saved) document.documentElement.setAttribute('data-theme', saved);
  }, []);

  // Build notifications from projects + tasks + DB
  useEffect(() => {
    if (!user) return;
    
    const load = async () => {
      try {
        const [{ data: projs }, { data: dbNotifs }] = await Promise.all([
          API.get('/projects'),
          API.get('/notifications').catch(() => ({ data: [] }))
        ]);
        setProjects(projs);
        const notifs = [];

        // Add DB notifications
        dbNotifs.forEach(n => {
          notifs.push({
            id: n._id,
            type: 'mention',
            icon: '💬',
            title: `Mentioned by ${n.sender?.name}`,
            body: n.message,
            projectId: n.project?._id || n.project,
            isRead: n.isRead,
            dbId: n._id
          });
        });

        for (const p of projs) {
          const { data: tasks } = await API.get(`/tasks/${p._id}`);

          // Overdue tasks
          const overdue = tasks.filter(t =>
            t.deadline && new Date(t.deadline) < new Date() && t.status !== 'done'
          );
          if (overdue.length > 0) {
            notifs.push({
              id: `overdue-${p._id}`,
              type: 'urgent',
              icon: '⚠',
              title: `${overdue.length} overdue task${overdue.length > 1 ? 's' : ''}`,
              body: `in "${p.name}"`,
              projectId: p._id,
            });
          }

          // Deadline approaching (< 3 days)
          const urgent = tasks.filter(t => {
            if (!t.deadline || t.status === 'done') return false;
            const diff = (new Date(t.deadline) - new Date()) / (1000 * 60 * 60 * 24);
            return diff >= 0 && diff < 3;
          });
          if (urgent.length > 0) {
            notifs.push({
              id: `urgent-${p._id}`,
              type: 'warn',
              icon: '🔔',
              title: `Deadline in < 3 days`,
              body: `${urgent.length} task${urgent.length > 1 ? 's' : ''} in "${p.name}"`,
              projectId: p._id,
            });
          }

          // Not visited long time — use updatedAt heuristic (> 7 days)
          const lastUpdate = new Date(p.updatedAt || p.createdAt);
          const daysSince = (Date.now() - lastUpdate) / (1000 * 60 * 60 * 24);
          if (daysSince > 7 && tasks.some(t => t.status !== 'done')) {
            notifs.push({
              id: `stale-${p._id}`,
              type: 'info',
              icon: '💤',
              title: `Inactive project`,
              body: `"${p.name}" hasn't been updated in ${Math.floor(daysSince)} days`,
              projectId: p._id,
            });
          }
        }

        setNotifications(notifs);
      } catch {
        // silent fail
      }
    };
    load();

    // Socket Connection for Real-time Notifications
    if (!socketRef.current) {
      socketRef.current = io('http://localhost:5000', { transports: ['websocket'] });
      
      socketRef.current.on('connect', () => {
        socketRef.current.emit('joinUserRoom', user.id);
      });
      
      socketRef.current.on('notification', (n) => {
        toast(`🔔 ${n.sender?.name} mentioned you in ${n.project?.name}`);
        setNotifications(prev => [{
          id: n._id,
          type: 'mention',
          icon: '💬',
          title: `Mentioned by ${n.sender?.name}`,
          body: n.message,
          projectId: n.project?._id || n.project,
          isRead: n.isRead,
          dbId: n._id
        }, ...prev]);
      });
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [user]);

  // Close panels on outside click
  useEffect(() => {
    const handler = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotifOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
    navigate('/login');
  };

  const handleNotifClick = async (n) => {
    if (n.dbId && !n.isRead) {
      try {
        await API.put(`/notifications/${n.dbId}/read`);
        setNotifications(prev => prev.map(p => p.id === n.id ? { ...p, isRead: true } : p));
      } catch {}
    }
    if (n.projectId) {
      navigate(`/project/${n.projectId}`);
      setNotifOpen(false);
    }
  };

  const unreadCount = notifications.filter(n => (n.dbId && !n.isRead) || n.type === 'urgent' || n.type === 'warn').length;

  const notifColors = {
    urgent:  { bg: 'var(--red-dim)',   border: 'var(--red-border)',   color: 'var(--red)',   dot: '#dc2626' },
    warn:    { bg: 'var(--amber-dim)', border: 'var(--amber-border)', color: 'var(--amber)', dot: '#d97706' },
    info:    { bg: 'var(--blue-dim)',  border: 'var(--blue-border)',  color: 'var(--blue)',  dot: '#2563eb' },
    mention: { bg: 'var(--purple-dim)',border: 'var(--purple-border)',color: 'var(--purple)',dot: '#7c3aed' },
  };

  return (
    <nav style={s.nav}>
      {/* Left: logo + links */}
      <div style={s.left}>
        <div style={s.logo} onClick={() => navigate('/')}>
          <div style={s.logoMark}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 1L14 4.5V11.5L8 15L2 11.5V4.5L8 1Z" fill="url(#grad-nav)" />
              <defs>
                <linearGradient id="grad-nav" x1="0" y1="0" x2="16" y2="16">
                  <stop offset="0%" stopColor="#2563eb"/>
                  <stop offset="100%" stopColor="#7c3aed"/>
                </linearGradient>
              </defs>
            </svg>
          </div>
          <span style={s.logoText}>CollabSpace</span>
        </div>

        <div style={s.navLinks}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigate('/')}
            style={{
              color: location.pathname === '/' ? 'var(--text)' : 'var(--text2)',
              background: location.pathname === '/' ? 'var(--bg3)' : 'transparent',
              fontWeight: location.pathname === '/' ? '600' : '500',
            }}
          >
            Dashboard
          </button>
          {location.pathname.includes('/project/') && (
            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--text)', background: 'var(--bg3)', fontWeight: '600' }}>
              Board
            </button>
          )}
        </div>
      </div>

      {/* Right: AI button + notifications + user */}
      <div style={s.right}>

        {/* AI Tools button — only on project board */}
        {location.pathname.includes('/project/') && onAIOpen && (
          <button
            onClick={onAIOpen}
            style={s.aiBtn}
            title="Open AI Tools"
          >
            <span style={{ fontSize: '14px' }}>✦</span>
            <span style={{ fontSize: '12px', fontWeight: '600' }}>AI Tools</span>
          </button>
        )}

        {/* Notification Bell */}
        <div ref={notifRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setNotifOpen(o => !o)}
            style={{
              ...s.iconBtn,
              background: notifOpen ? 'var(--bg3)' : 'transparent',
              border: `1px solid ${notifOpen ? 'var(--border2)' : 'transparent'}`,
            }}
            title="Notifications"
          >
            <span style={{ fontSize: '16px', animation: unreadCount > 0 ? 'bellShake 2s ease-in-out infinite' : 'none' }}>🔔</span>
            {unreadCount > 0 && (
              <span style={s.badge}>{unreadCount}</span>
            )}
          </button>

          {notifOpen && (
            <div className="notif-panel">
              <div style={s.notifHead}>
                <span style={{ fontWeight: '700', fontSize: '14px' }}>Notifications</span>
                {notifications.length > 0 && (
                  <span style={{ fontSize: '11px', color: 'var(--text3)' }}>{notifications.length} alert{notifications.length > 1 ? 's' : ''}</span>
                )}
              </div>
              <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
                {notifications.length === 0 ? (
                  <div style={s.notifEmpty}>
                    <span style={{ fontSize: '24px', marginBottom: '6px', display: 'block' }}>✅</span>
                    <p style={{ fontSize: '12px', color: 'var(--text3)' }}>All caught up!</p>
                  </div>
                ) : (
                  notifications.map(n => {
                    const c = notifColors[n.type] || notifColors.info;
                    return (
                      <div
                        key={n.id}
                        onClick={() => handleNotifClick(n)}
                        style={{
                          padding: '12px 16px',
                          borderBottom: '1px solid var(--border)',
                          cursor: n.projectId ? 'pointer' : 'default',
                          display: 'flex', gap: '10px', alignItems: 'flex-start',
                          transition: 'background 0.12s',
                          opacity: n.isRead ? 0.6 : 1,
                        }}
                        onMouseEnter={e => { if (n.projectId) e.currentTarget.style.background = 'var(--bg3)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        <div style={{
                          width: '8px', height: '8px', borderRadius: '50%',
                          background: c.dot, flexShrink: 0, marginTop: '5px',
                        }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)', marginBottom: '1px' }}>
                            {n.icon} {n.title}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text2)' }}>{n.body}</div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Theme Toggle */}
        <button
          onClick={() => setDark(d => !d)}
          title={dark ? 'Switch to Light mode' : 'Switch to Dark mode'}
          style={{
            ...s.iconBtn,
            fontSize: '16px',
            border: '1px solid var(--border2)',
            background: 'var(--bg3)',
          }}
        >
          {dark ? '☀️' : '🌙'}
        </button>

        <div style={s.divider} />

        {/* User */}
        <div style={{ position: 'relative' }} ref={userMenuRef}>
          <div 
            style={{ 
              display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '8px', 
              padding: '4px 8px', borderRadius: '8px', transition: 'background 0.2s' 
            }}
            onClick={() => setShowUserMenu(p => !p)}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <div style={s.avatar}>{user?.name?.[0]?.toUpperCase()}</div>
            <div style={s.userInfo}>
              <span style={s.userName}>{user?.name}</span>
              <span style={s.userEmail}>{user?.email}</span>
            </div>
            <span style={{ fontSize: '10px', color: 'var(--text3)', marginLeft: '2px' }}>▼</span>
          </div>

          {showUserMenu && (
            <div style={{
              position: 'absolute', top: '100%', right: '0', marginTop: '8px',
              background: 'var(--bg2)', border: '1px solid var(--border)',
              borderRadius: '12px', padding: '8px',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
              zIndex: 100, minWidth: '240px',
            }}>
              <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)', display: 'block' }}>{user?.name}</span>
                <span style={{ fontSize: '11px', color: 'var(--text3)' }}>{user?.email}</span>
              </div>
              
              <div style={{ padding: '8px 12px' }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text2)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>📊</span> Activity Feed
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {projects.length === 0 ? (
                    <div style={{ fontSize: '11px', color: 'var(--text3)', textAlign: 'center', padding: '8px 0' }}>
                      No projects active
                    </div>
                  ) : (
                    projects.slice(0, 3).map(p => {
                      // Stable mock hours based on project ID for UI demonstration
                      const mockHours = (p._id.charCodeAt(p._id.length - 1) % 5) + 1;
                      const dateStr = new Date(p.updatedAt || p.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                      
                      return (
                        <div key={p._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', overflow: 'hidden' }}>
                            <span style={{ color: 'var(--text)', fontWeight: '500', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '140px' }}>
                              {p.name}
                            </span>
                            <span style={{ color: 'var(--text3)', fontSize: '10px' }}>{dateStr}</span>
                          </div>
                          <span style={{ color: 'var(--blue)', fontWeight: '600', background: 'var(--blue-dim)', padding: '2px 6px', borderRadius: '4px', flexShrink: 0 }}>
                            {mockHours} hrs
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
              
              <div style={{ height: '1px', background: 'var(--border)', margin: '8px 0' }} />
              
              <button 
                className="btn btn-ghost" style={{ ...s.menuItem, color: 'var(--red)' }} 
                onClick={handleLogout}
              >
                <span style={{ fontSize: '14px' }}>🚪</span> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}

const s = {
  nav: {
    height: '54px',
    background: 'var(--nav-bg)',
    backdropFilter: 'blur(16px)',
    borderBottom: '1px solid var(--border)',
    display: 'flex', alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 20px',
    position: 'sticky', top: 0, zIndex: 100,
    boxShadow: '0 1px 0 var(--border)',
  },
  left:     { display: 'flex', alignItems: 'center', gap: '4px' },
  logo:     { display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginRight: '16px' },
  logoMark: {
    width: '28px', height: '28px', borderRadius: '7px',
    background: 'var(--bg3)', border: '1px solid var(--border2)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  logoText: { fontWeight: '800', fontSize: '15px', letterSpacing: '-0.04em', color: 'var(--text)' },
  navLinks: { display: 'flex', alignItems: 'center', gap: '2px' },
  right:    { display: 'flex', alignItems: 'center', gap: '8px' },

  aiBtn: {
    display: 'flex', alignItems: 'center', gap: '6px',
    padding: '6px 14px',
    background: 'var(--purple)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--radius)',
    cursor: 'pointer',
    fontFamily: 'DM Sans, sans-serif',
    transition: 'all 0.15s ease',
    boxShadow: '0 2px 8px rgba(124,58,237,0.25)',
  },

  iconBtn: {
    width: '34px', height: '34px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 'var(--radius)',
    cursor: 'pointer',
    position: 'relative',
    transition: 'all 0.15s',
  },
  badge: {
    position: 'absolute',
    top: '2px', right: '2px',
    minWidth: '16px', height: '16px',
    borderRadius: '99px',
    background: 'var(--red)',
    color: '#fff',
    fontSize: '9px',
    fontWeight: '700',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '0 3px',
    border: '2px solid var(--bg2)',
  },

  notifHead: {
    padding: '14px 16px 10px',
    borderBottom: '1px solid var(--border)',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  },
  notifEmpty: {
    padding: '32px 16px',
    textAlign: 'center',
  },

  divider:   { width: '1px', height: '20px', background: 'var(--border2)', marginLeft: '4px' },
  userArea:  { display: 'flex', alignItems: 'center', gap: '8px' },
  avatar: {
    width: '28px', height: '28px', borderRadius: '50%',
    background: 'var(--grad)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '11px', fontWeight: '700', color: '#fff', flexShrink: 0,
  },
  userInfo:  { display: 'flex', flexDirection: 'column' },
  userName:  { fontSize: '12px', fontWeight: '600', lineHeight: 1.2, color: 'var(--text)' },
  userEmail: { fontSize: '10px', color: 'var(--text3)', lineHeight: 1.2 },

  menuItem: {
    width: '100%',
    display: 'flex', alignItems: 'center', gap: '10px',
    justifyContent: 'flex-start',
    padding: '8px 12px',
    fontSize: '13px',
    fontWeight: '500',
    color: 'var(--text)',
    borderRadius: '6px',
  }
};