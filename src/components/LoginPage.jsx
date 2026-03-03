import { useState } from 'react';
import { auth, signInWithEmailAndPassword } from '../utils/firebase';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

function mapFirebaseError(code) {
  switch (code) {
    case 'auth/user-not-found': return 'No account found with this email.';
    case 'auth/wrong-password': return 'Incorrect password.';
    case 'auth/invalid-credential': return 'Invalid email or password.';
    case 'auth/invalid-email': return 'Invalid email address.';
    case 'auth/too-many-requests': return 'Too many attempts. Try again later.';
    default: return 'Login failed. Please try again.';
  }
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setError(mapFirebaseError(err.code));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      {/* ---- Left Visual Panel ---- */}
      <div className="login-visual">
        {/* Ambient blobs */}
        <div className="login-blob login-blob-1" />
        <div className="login-blob login-blob-2" />
        <div className="login-blob login-blob-3" />

        {/* IV drip lines */}
        <div className="login-drip-line login-drip-line-1">
          <div className="login-drip-drop" style={{ '--drip-speed': '3.8s', '--drip-delay': '0s' }} />
        </div>
        <div className="login-drip-line login-drip-line-2">
          <div className="login-drip-drop" style={{ '--drip-speed': '4.5s', '--drip-delay': '1.2s' }} />
        </div>
        <div className="login-drip-line login-drip-line-3">
          <div className="login-drip-drop" style={{ '--drip-speed': '3s', '--drip-delay': '2.4s' }} />
        </div>

        {/* Brand */}
        <div className="login-brand">
          <div className="login-brand-icon">
            <svg viewBox="0 0 56 72" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* IV bag */}
              <rect x="14" y="16" width="28" height="34" rx="4" fill="url(#loginBagGrad)" stroke="rgba(232,232,0,0.2)" strokeWidth="1" />
              {/* Bag hook */}
              <path d="M24 16V8C24 6 25 5 27 5H29C31 5 32 6 32 8V16" stroke="rgba(232,232,0,0.35)" strokeWidth="1.5" fill="none" />
              <circle cx="28" cy="3" r="2" fill="none" stroke="rgba(232,232,0,0.35)" strokeWidth="1" />
              {/* Fluid level */}
              <rect x="17" y="26" width="22" height="20" rx="2" fill="rgba(232,232,0,0.1)" />
              {/* Fluid line */}
              <line x1="28" y1="50" x2="28" y2="66" stroke="rgba(232,232,0,0.3)" strokeWidth="1.5" />
              {/* Drip at bottom */}
              <ellipse cx="28" cy="68" rx="3" ry="3.5" fill="url(#loginDropGrad)" />
              <defs>
                <linearGradient id="loginBagGrad" x1="14" y1="16" x2="42" y2="50" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="rgba(232,232,0,0.15)" />
                  <stop offset="100%" stopColor="rgba(200,168,0,0.08)" />
                </linearGradient>
                <linearGradient id="loginDropGrad" x1="25" y1="64" x2="31" y2="72" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#e8e800" />
                  <stop offset="100%" stopColor="#c8a800" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <h1 className="login-brand-name">DRIP4LIFE</h1>
          <p className="login-brand-tagline">All Your Body Needs</p>
        </div>
      </div>

      {/* ---- Right Form Panel ---- */}
      <div className="login-form-panel">
        <div className="login-form-container">
          <div className="login-form-header">
            <h2>Welcome Back</h2>
            <p>Sign in to manage your schedules</p>
          </div>

          <div className="login-divider" />

          {error && (
            <div className="login-error">{error}</div>
          )}

          <form onSubmit={handleLogin}>
            <div className="login-form-item" style={{ animationDelay: '0.55s' }}>
              <div className="login-field">
                <label htmlFor="login-email">Email</label>
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@drip4life.co.za"
                  required
                  autoFocus
                />
              </div>
            </div>

            <div className="login-form-item" style={{ animationDelay: '0.65s' }}>
              <div className="login-field">
                <label htmlFor="login-password">Password</label>
                <div className="login-password-wrap">
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="login-password-toggle"
                    tabIndex={-1}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            </div>

            <div className="login-form-item" style={{ animationDelay: '0.75s' }}>
              <button type="submit" disabled={loading} className="login-submit">
                {loading ? (
                  <Loader2 size={20} className="login-spinner" />
                ) : (
                  'Sign In'
                )}
              </button>
            </div>
          </form>

          <div className="login-form-item" style={{ animationDelay: '0.85s' }}>
            <p className="login-footer">
              Contact your admin if you need an account
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
