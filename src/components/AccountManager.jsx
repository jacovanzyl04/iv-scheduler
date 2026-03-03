import { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut as firebaseSignOut } from 'firebase/auth';
import { app, db, ref, set, onValue, auth, sendPasswordResetEmail } from '../utils/firebase';
import { UserPlus, Mail, Shield, ShieldCheck, Loader2, RefreshCw, Users, X } from 'lucide-react';

// Secondary app for creating users without logging out admin
let secondaryApp = null;
let secondaryAuth = null;

function getSecondaryAuth() {
  if (!secondaryApp) {
    const config = {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    };
    secondaryApp = initializeApp(config, 'secondary');
    secondaryAuth = getAuth(secondaryApp);
  }
  return secondaryAuth;
}

const gradients = {
  blue: 'from-blue-500 to-cyan-400',
  purple: 'from-purple-500 to-violet-400',
  green: 'from-green-500 to-emerald-400',
  amber: 'from-amber-500 to-yellow-400',
};
const glows = {
  blue: 'rgba(59,130,246,0.07)',
  purple: 'rgba(139,92,246,0.07)',
  green: 'rgba(34,197,94,0.07)',
  amber: 'rgba(245,158,11,0.07)',
};

export default function AccountManager({ staff }) {
  const [users, setUsers] = useState({});
  const [showCreate, setShowCreate] = useState(false);
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('staff');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [resetting, setResetting] = useState(null);

  useEffect(() => {
    if (!db) return;
    const usersRef = ref(db, 'users');
    const unsubscribe = onValue(usersRef, (snapshot) => {
      setUsers(snapshot.val() || {});
    });
    return () => unsubscribe();
  }, []);

  const linkedStaffIds = new Set(Object.values(users).map(u => u.staffId));
  const unlinkedStaff = staff.filter(s => !linkedStaffIds.has(s.id));
  const userEntries = Object.entries(users).sort((a, b) => a[1].name?.localeCompare(b[1].name || ''));

  const adminCount = userEntries.filter(([, u]) => u.role === 'admin').length;
  const staffCount = userEntries.filter(([, u]) => u.role === 'staff').length;

  const handleCreate = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setCreating(true);
    try {
      const member = staff.find(s => s.id === selectedStaffId);
      if (!member) throw new Error('Staff member not found.');
      const secAuth = getSecondaryAuth();
      const tempPassword = Math.random().toString(36).slice(-10) + 'A1!';
      const credential = await createUserWithEmailAndPassword(secAuth, newEmail, tempPassword);
      const newUid = credential.user.uid;
      await set(ref(db, `users/${newUid}`), {
        email: newEmail,
        role: newRole,
        staffId: selectedStaffId,
        name: member.name,
        createdAt: new Date().toISOString().split('T')[0],
      });
      await firebaseSignOut(secAuth);
      await sendPasswordResetEmail(auth, newEmail);
      setSuccess(`Account created for ${member.name}. A password reset email has been sent to ${newEmail}.`);
      setSelectedStaffId('');
      setNewEmail('');
      setNewRole('staff');
      setShowCreate(false);
    } catch (err) {
      if (err.code === 'auth/email-already-in-use') setError('This email is already in use.');
      else if (err.code === 'auth/invalid-email') setError('Invalid email address.');
      else setError(err.message || 'Failed to create account.');
    } finally {
      setCreating(false);
    }
  };

  const handlePasswordReset = async (email) => {
    setResetting(email);
    try {
      await sendPasswordResetEmail(auth, email);
      setSuccess(`Password reset email sent to ${email}.`);
    } catch {
      setError('Failed to send reset email.');
    } finally {
      setResetting(null);
    }
  };

  const toggleRole = async (uid, currentRole) => {
    const nr = currentRole === 'admin' ? 'staff' : 'admin';
    try { await set(ref(db, `users/${uid}/role`), nr); }
    catch { setError('Failed to update role.'); }
  };

  const StatCard = ({ color, icon: Icon, label, value, sub }) => (
    <div className="stat-animate hover-lift panel-glow relative overflow-hidden bg-d4l-surface rounded-xl border border-d4l-border">
      <div className={`h-[2px] bg-gradient-to-r ${gradients[color]}`} />
      <div className="absolute top-0 right-0 w-32 h-32 pointer-events-none opacity-40"
        style={{ background: `radial-gradient(circle at top right, ${glows[color]}, transparent 70%)` }} />
      <div className="p-5 relative">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-d4l-muted font-medium">{label}</p>
            <p className="text-4xl font-bold tracking-wide count-animate mt-1 text-d4l-text" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
              {value}
            </p>
          </div>
          <div className={`p-3 rounded-xl bg-${color === 'amber' ? 'amber' : color}-500/10`}>
            <Icon className={`w-6 h-6 text-${color === 'amber' ? 'amber' : color}-400`} />
          </div>
        </div>
        {sub && <p className="text-[11px] text-d4l-dim mt-2">{sub}</p>}
      </div>
    </div>
  );

  return (
    <div className="p-6 max-w-6xl mx-auto">

      {/* ===== HEADER ===== */}
      <div className="flex items-center justify-between mb-8 section-animate">
        <div>
          <h1 className="text-3xl font-bold tracking-wide text-d4l-text" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
            Manage Accounts
          </h1>
          <p className="text-d4l-muted text-sm mt-0.5">Create and manage staff login accounts</p>
        </div>
        <button
          onClick={() => { setShowCreate(true); setError(null); }}
          className="flex items-center gap-2 px-4 py-2 bg-d4l-gold text-black font-semibold rounded-lg hover:bg-d4l-gold-dark btn-glow"
        >
          <UserPlus className="w-4 h-4" />
          New Account
        </button>
      </div>

      {/* ===== STAT CARDS ===== */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <StatCard color="blue" icon={Users} label="Total Accounts" value={userEntries.length} sub="registered users" />
        <StatCard color="purple" icon={ShieldCheck} label="Admins" value={adminCount} sub="full access" />
        <StatCard color="green" icon={Shield} label="Staff" value={staffCount} sub="schedule view" />
        <StatCard color="amber" icon={UserPlus} label="Unlinked" value={unlinkedStaff.length} sub="staff without accounts" />
      </div>

      {/* ===== ALERTS ===== */}
      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg flex items-center justify-between animate-fade-in">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300 ml-2"><X className="w-4 h-4" /></button>
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-green-500/10 border border-green-500/20 text-green-400 text-sm rounded-lg flex items-center justify-between animate-fade-in">
          <span>{success}</span>
          <button onClick={() => setSuccess(null)} className="text-green-400 hover:text-green-300 ml-2"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* ===== CREATE ACCOUNT MODAL ===== */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowCreate(false)}>
          <div className="bg-d4l-surface rounded-2xl shadow-2xl w-[500px] max-h-[90vh] overflow-hidden animate-fade-in border border-d4l-border" onClick={e => e.stopPropagation()}>
            {/* Modal header */}
            <div className="px-6 py-4 border-b border-d4l-border flex items-center justify-between">
              <h3 className="text-lg font-semibold text-d4l-text">Create Staff Account</h3>
              <button onClick={() => setShowCreate(false)} className="p-1.5 rounded-lg hover:bg-d4l-hover transition-colors text-d4l-muted">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal body */}
            <form onSubmit={handleCreate}>
              <div className="px-6 py-5 space-y-5">
                <div>
                  <label className="block text-xs uppercase tracking-wider text-d4l-muted font-medium mb-2">Staff Member</label>
                  <select
                    value={selectedStaffId}
                    onChange={(e) => setSelectedStaffId(e.target.value)}
                    className="w-full px-3 py-2.5 border border-d4l-border rounded-lg text-sm bg-d4l-bg text-d4l-text focus:outline-none focus:ring-2 focus:ring-d4l-gold/50"
                    required
                  >
                    <option value="">Select staff member...</option>
                    {unlinkedStaff.map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs uppercase tracking-wider text-d4l-muted font-medium mb-2">Email Address</label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="w-full px-3 py-2.5 border border-d4l-border rounded-lg text-sm bg-d4l-bg text-d4l-text focus:outline-none focus:ring-2 focus:ring-d4l-gold/50"
                    placeholder="staff@drip4life.co.za"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs uppercase tracking-wider text-d4l-muted font-medium mb-2">Role</label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setNewRole('staff')}
                      className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
                        newRole === 'staff'
                          ? 'bg-d4l-gold text-black font-semibold'
                          : 'bg-d4l-bg text-d4l-dim border border-d4l-border hover:border-d4l-gold/30'
                      }`}>
                      Staff
                    </button>
                    <button type="button" onClick={() => setNewRole('admin')}
                      className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
                        newRole === 'admin'
                          ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30 font-semibold'
                          : 'bg-d4l-bg text-d4l-dim border border-d4l-border hover:border-purple-500/30'
                      }`}>
                      Admin
                    </button>
                  </div>
                </div>

                <p className="text-[11px] text-d4l-dim">
                  A password reset email will be sent so the staff member can set their own password.
                </p>
              </div>

              {/* Modal footer */}
              <div className="px-6 py-4 border-t border-d4l-border flex items-center gap-3">
                <button
                  type="submit"
                  disabled={creating}
                  className="flex items-center gap-2 px-5 py-2.5 bg-d4l-gold text-black font-semibold rounded-lg hover:bg-d4l-gold-dark disabled:opacity-50 transition-colors text-sm btn-glow"
                >
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  Create & Send Invite
                </button>
                <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2.5 text-d4l-text2 hover:text-d4l-text text-sm rounded-lg hover:bg-d4l-hover transition-colors">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== ACCOUNTS SECTION ===== */}
      <div className="section-animate section-animate-delay-1">
        <h2 className="text-lg font-semibold text-d4l-text mb-4 uppercase tracking-wider" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
          Accounts
        </h2>

        {unlinkedStaff.length > 0 && (
          <p className="text-xs text-amber-400 mb-3 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 pulse-dot" />
            {unlinkedStaff.length} staff member{unlinkedStaff.length !== 1 ? 's' : ''} without accounts
          </p>
        )}

        {userEntries.length === 0 ? (
          <div className="bg-d4l-surface rounded-xl border border-d4l-border p-12 text-center">
            <Users className="w-10 h-10 text-d4l-dim mx-auto mb-3" />
            <p className="text-d4l-dim text-sm">No accounts created yet.</p>
            <p className="text-d4l-dim text-xs mt-1">Click "New Account" to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {userEntries.map(([uid, user]) => (
              <div key={uid} className="card-animate bg-d4l-surface rounded-xl border border-d4l-border hover-lift panel-glow p-4">
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold bg-d4l-gold/10 text-d4l-gold border border-d4l-gold/20 shrink-0">
                    {user.name?.charAt(0) || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-d4l-text text-sm truncate">{user.name}</h3>
                    <p className="text-xs text-d4l-muted truncate">{user.email}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-d4l-border">
                  {/* Role toggle pill */}
                  <button
                    onClick={() => toggleRole(uid, user.role)}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all ${
                      user.role === 'admin'
                        ? 'bg-purple-500/15 text-purple-400 border border-purple-500/20 hover:bg-purple-500/25'
                        : 'bg-d4l-raised text-d4l-text2 border border-d4l-border hover:bg-d4l-hover'
                    }`}
                    title="Click to toggle role"
                  >
                    {user.role === 'admin' ? <ShieldCheck className="w-3 h-3" /> : <Shield className="w-3 h-3" />}
                    {user.role}
                  </button>

                  {/* Reset password */}
                  <button
                    onClick={() => handlePasswordReset(user.email)}
                    disabled={resetting === user.email}
                    className="p-2 rounded-lg text-d4l-dim hover:text-d4l-gold hover:bg-d4l-gold/5 transition-colors"
                    title="Send password reset email"
                  >
                    {resetting === user.email
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <RefreshCw className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
