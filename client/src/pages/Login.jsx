import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import API from '../api/axios';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function Login() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await API.post('/auth/login', form);
      login(data.user, data.token);
      toast.success(`Welcome back, ${data.user.name}!`);
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Login failed');
    }
    setLoading(false);
  };

  return (
    <div style={s.page}>
      {/* Left panel */}
      <div style ={s.left}>
        <div style={s.leftInner}>
          <div style={s.brand}>
            <div style={s.brandMark}>
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                <path d="M8 1L14 4.5V11.5L8 15L2 11.5V4.5L8 1Z" fill="url(#g1)"/>
                <defs><linearGradient id="g1" x1="0" y1="0" x2="16" y2="16">
                  <stop offset="0%" stopColor="#2563eb"/>
                  <stop offset="100%" stopColor="#7c3aed"/>
                </linearGradient></defs>
              </svg>
            </div>
            <span style={s.brandName}>CollabSpace</span>
          </div>

          <div style={s.heroBlock}>
            <div style={s.eyebrow}>AI-Powered Project Management</div>
            <h1 style={s.h1}>
              The workspace<br />
              your team <span className="grad-text">deserves.</span>
            </h1>
            <p style={s.heroSub}>
              Kanban boards, real-time chat, AI task generation, and smart analytics — all in one elegant place.
            </p>
          </div>

          <div style={s.feats}>
            {[
              { icon: '🤖', title: 'AI Task Generator',  desc: 'Describe your project, AI creates all tasks' },
              { icon: '📊', title: 'Smart Analytics',    desc: 'Track progress with beautiful reports' },
              { icon: '💬', title: 'Real-time Chat',     desc: 'Collaborate with your team instantly' },
              { icon: '⚡', title: 'Drag & Drop Kanban', desc: 'Visual task management that works' },
            ].map((f, i) => (
              <div key={i} style={s.feat} className={`fade-up d${i+1}`}>
                <span style={s.featIcon}>{f.icon}</span>
                <div>
                  <div style={s.featTitle}>{f.title}</div>
                  <div style={s.featDesc}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div style={s.right}>
        <div style={s.card} className="scale-in">
          <div style={s.cardTop}>
            <h2 style={s.cardTitle}>Sign in</h2>
            <p style={s.cardSub}>Welcome back to your workspace</p>
          </div>

          <form onSubmit={handleSubmit} style={s.form}>
            <div>
              <label className="label">Email address</label>
              <input
                type="email" placeholder="you@example.com"
                value={form.email}
                onChange={e => setForm({...form, email: e.target.value})}
                required
              />
            </div>
            <div>
              <label className="label">Password</label>
              <input
                type="password" placeholder="Enter your password"
                value={form.password}
                onChange={e => setForm({...form, password: e.target.value})}
                required
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary btn-xl"
              style={{ width: '100%' }}
              disabled={loading}
            >
              {loading ? <><span className="spinner" /> Signing in...</> : 'Sign in →'}
            </button>
          </form>

          <p style={s.foot}>
            No account?{' '}
            <Link to="/register" style={s.link}>Create one free</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

const s = {
  page: {
    minHeight: '100vh',
    display: 'grid',
    gridTemplateColumns: '1.1fr 0.9fr',
    background: 'var(--bg)',
  },
  left: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '60px',
    borderRight: '1px solid var(--border)',
    background: 'var(--bg2)',
  },
  leftInner: { maxWidth: '460px', width: '100%' },
  brand:     { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '52px' },
  brandMark: {
    width: '34px', height: '34px', borderRadius: '9px',
    background: 'var(--bg3)', border: '1px solid var(--border2)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: 'var(--shadow)',
  },
  brandName: { fontWeight: '800', fontSize: '16px', letterSpacing: '-0.04em', color: 'var(--text)' },
  heroBlock: { marginBottom: '44px' },
  eyebrow:   {
    display: 'inline-flex', alignItems: 'center',
    padding: '4px 12px', borderRadius: '99px',
    background: 'var(--blue-dim)', color: 'var(--blue)',
    border: '1px solid var(--blue-border)',
    fontSize: '11px', fontWeight: '600', letterSpacing: '0.04em',
    marginBottom: '20px',
  },
  h1:        { fontSize: '44px', lineHeight: 1.05, marginBottom: '14px', fontWeight: '800', letterSpacing: '-0.04em', color: 'var(--text)' },
  heroSub:   { fontSize: '15px', color: 'var(--text2)', lineHeight: 1.7, maxWidth: '400px' },
  feats:     { display: 'flex', flexDirection: 'column', gap: '8px' },
  feat:      {
    display: 'flex', alignItems: 'center', gap: '12px',
    padding: '12px 16px',
    background: 'var(--bg3)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    transition: 'all 0.15s',
  },
  featIcon:  { fontSize: '20px', flexShrink: 0 },
  featTitle: { fontSize: '13px', fontWeight: '600', marginBottom: '2px', color: 'var(--text)' },
  featDesc:  { fontSize: '12px', color: 'var(--text3)' },

  right: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '40px', background: 'var(--bg)',
  },
  card: {
    width: '100%', maxWidth: '380px',
    background: 'var(--bg2)',
    border: '1px solid var(--border2)',
    borderRadius: 'var(--radius-2xl)',
    padding: '36px',
    boxShadow: 'var(--shadow-xl)',
  },
  cardTop:   { marginBottom: '28px' },
  cardTitle: { fontSize: '24px', marginBottom: '6px', fontWeight: '800', letterSpacing: '-0.03em', color: 'var(--text)' },
  cardSub:   { fontSize: '13px', color: 'var(--text2)' },
  form:      { display: 'flex', flexDirection: 'column', gap: '18px' },
  foot:      { textAlign: 'center', marginTop: '24px', fontSize: '13px', color: 'var(--text2)' },
  link:      { color: 'var(--blue)', textDecoration: 'none', fontWeight: '600' },
};