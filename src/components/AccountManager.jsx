import { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword as firebaseSignIn, signOut as firebaseSignOut, deleteUser } from 'firebase/auth';
import { app, db, ref, set, remove, onValue, auth, sendPasswordResetEmail, updatePassword } from '../utils/firebase';
import { UserPlus, Mail, Shield, ShieldCheck, Loader2, RefreshCw, Users, X, Eye, EyeOff, KeyRound, Pencil, Trash2 } from 'lucide-react';

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
  const [useCustomPassword, setUseCustomPassword] = useState(false);
  const [customPassword, setCustomPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [createdPassword, setCreatedPassword] = useState(null);
  const [editingUser, setEditingUser] = useState(null); // { uid, ...userData }
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editCurrentPassword, setEditCurrentPassword] = useState('');
  const [editShowPassword, setEditShowPassword] = useState(false);
  const [editShowCurrentPassword, setEditShowCurrentPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingUser, setDeletingUser] = useState(null); // { uid, name, email }
  const [deleting, setDeleting] = useState(false);

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
      if (useCustomPassword && customPassword.length < 6) throw new Error('Password must be at least 6 characters.');
      const secAuth = getSecondaryAuth();
      const password = useCustomPassword ? customPassword : (Math.random().toString(36).slice(-10) + 'A1!');
      const credential = await createUserWithEmailAndPassword(secAuth, newEmail, password);
      const newUid = credential.user.uid;
      await set(ref(db, `users/${newUid}`), {
        email: newEmail,
        role: newRole,
        staffId: selectedStaffId,
        name: member.name,
        createdAt: new Date().toISOString().split('T')[0],
        ...(useCustomPassword ? {} : { _tempPass: password }),
      });
      await firebaseSignOut(secAuth);
      if (useCustomPassword) {
        setCreatedPassword(password);
        setSuccess(`Account created for ${member.name} with custom password. You can now log in as ${newEmail}.`);
      } else {
        await sendPasswordResetEmail(auth, newEmail);
        setSuccess(`Account created for ${member.name}. A password reset email has been sent to ${newEmail}.`);
      }
      setSelectedStaffId('');
      setNewEmail('');
      setNewRole('staff');
      setCustomPassword('');
      setUseCustomPassword(false);
      setShowPassword(false);
      setShowCreate(false);
    } catch (err) {
      if (err.code === 'auth/email-already-in-use') setError('This email is already in use in Firebase Auth. If you just deleted an account with this email, the auth record may still exist — try using a different email or delete the user from the Firebase Console.');
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

  const handleDelete = async () => {
    if (!deletingUser) return;
    setDeleting(true);
    setError(null);
    try {
      // Try to delete the Firebase Auth user too
      const userData = users[deletingUser.uid];
      if (userData) {
        const secAuth = getSecondaryAuth();
        const pass = userData._tempPass; // stored during invite creation
        if (pass) {
          try {
            const credential = await firebaseSignIn(secAuth, userData.email, pass);
            await deleteUser(credential.user);
          } catch {
            // Auth deletion failed (password changed, etc.) — continue with DB removal
            await firebaseSignOut(secAuth).catch(() => {});
          }
        }
      }
      await remove(ref(db, `users/${deletingUser.uid}`));
      setSuccess(`Account for ${deletingUser.name} has been deleted.`);
      setDeletingUser(null);
    } catch {
      setError('Failed to delete account.');
    } finally {
      setDeleting(false);
    }
  };

  const openEdit = (uid, user) => {
    setEditingUser({ uid, ...user });
    setEditEmail(user.email);
    setEditPassword('');
    setEditCurrentPassword('');
    setEditShowPassword(false);
    setEditShowCurrentPassword(false);
    setError(null);
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      if (!editCurrentPassword) throw new Error('Current password is required.');
      const secAuth = getSecondaryAuth();
      const emailChanged = editEmail !== editingUser.email;
      const passwordChanged = editPassword.length > 0;
      if (passwordChanged && editPassword.length < 6) throw new Error('New password must be at least 6 characters.');

      if (emailChanged) {
        // Email changed: delete old auth account, create new one with new email
        const credential = await firebaseSignIn(secAuth, editingUser.email, editCurrentPassword);
        await deleteUser(credential.user);
        const newPassword = passwordChanged ? editPassword : editCurrentPassword;
        const newCredential = await createUserWithEmailAndPassword(secAuth, editEmail, newPassword);
        const newUid = newCredential.user.uid;
        // Migrate RTDB data to new UID
        const userData = { email: editEmail, role: editingUser.role, staffId: editingUser.staffId, name: editingUser.name, createdAt: editingUser.createdAt };
        await set(ref(db, `users/${newUid}`), userData);
        await remove(ref(db, `users/${editingUser.uid}`));
        await firebaseSignOut(secAuth);
      } else if (passwordChanged) {
        // Only password changed: sign in and update
        const credential = await firebaseSignIn(secAuth, editingUser.email, editCurrentPassword);
        await updatePassword(credential.user, editPassword);
        await firebaseSignOut(secAuth);
      }

      setSuccess(`Account for ${editingUser.name} updated successfully.${passwordChanged ? ' Password changed.' : ''}${emailChanged ? ` Email changed to ${editEmail}.` : ''}`);
      setEditingUser(null);
    } catch (err) {
      const msg = err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential'
        ? 'Current password is incorrect.'
        : err.code === 'auth/email-already-in-use'
        ? 'That email is already in use by another account.'
        : err.code === 'auth/invalid-email'
        ? 'Invalid email address.'
        : err.code === 'auth/requires-recent-login'
        ? 'Session expired. Please try again.'
        : err.message || 'Failed to update account.';
      setError(msg);
    } finally {
      setSaving(false);
    }
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
        <div className="mb-4 p-3 bg-green-500/10 border border-green-500/20 text-green-400 text-sm rounded-lg animate-fade-in">
          <div className="flex items-center justify-between">
            <span>{success}</span>
            <button onClick={() => { setSuccess(null); setCreatedPassword(null); }} className="text-green-400 hover:text-green-300 ml-2"><X className="w-4 h-4" /></button>
          </div>
          {createdPassword && (
            <div className="mt-2 flex items-center gap-2 bg-green-500/10 rounded-lg px-3 py-2">
              <KeyRound className="w-3.5 h-3.5 text-green-400 shrink-0" />
              <span className="text-xs text-green-300">Password: <code className="bg-green-500/20 px-1.5 py-0.5 rounded font-mono">{createdPassword}</code></span>
              <button
                type="button"
                onClick={() => { navigator.clipboard.writeText(createdPassword); }}
                className="ml-auto text-[10px] text-green-400 hover:text-green-300 underline shrink-0"
              >
                Copy
              </button>
            </div>
          )}
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

                <div>
                  <label className="block text-xs uppercase tracking-wider text-d4l-muted font-medium mb-2">Password Method</label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => { setUseCustomPassword(false); setCustomPassword(''); }}
                      className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
                        !useCustomPassword
                          ? 'bg-d4l-gold text-black font-semibold'
                          : 'bg-d4l-bg text-d4l-dim border border-d4l-border hover:border-d4l-gold/30'
                      }`}>
                      <Mail className="w-3.5 h-3.5" />
                      Send Invite
                    </button>
                    <button type="button" onClick={() => setUseCustomPassword(true)}
                      className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
                        useCustomPassword
                          ? 'bg-d4l-gold text-black font-semibold'
                          : 'bg-d4l-bg text-d4l-dim border border-d4l-border hover:border-d4l-gold/30'
                      }`}>
                      <KeyRound className="w-3.5 h-3.5" />
                      Set Password
                    </button>
                  </div>
                </div>

                {useCustomPassword && (
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-d4l-muted font-medium mb-2">Password</label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={customPassword}
                        onChange={(e) => setCustomPassword(e.target.value)}
                        className="w-full px-3 py-2.5 pr-10 border border-d4l-border rounded-lg text-sm bg-d4l-bg text-d4l-text focus:outline-none focus:ring-2 focus:ring-d4l-gold/50"
                        placeholder="Min 6 characters"
                        minLength={6}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-d4l-dim hover:text-d4l-text transition-colors"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                )}

                <p className="text-[11px] text-d4l-dim">
                  {useCustomPassword
                    ? 'You can use this password to log in as this staff member for testing.'
                    : 'A password reset email will be sent so the staff member can set their own password.'}
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
                  {useCustomPassword ? 'Create Account' : 'Create & Send Invite'}
                </button>
                <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2.5 text-d4l-text2 hover:text-d4l-text text-sm rounded-lg hover:bg-d4l-hover transition-colors">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== EDIT ACCOUNT MODAL ===== */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setEditingUser(null)}>
          <div className="bg-d4l-surface rounded-2xl shadow-2xl w-[500px] max-h-[90vh] overflow-hidden animate-fade-in border border-d4l-border" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-d4l-border flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-d4l-text">Edit Account</h3>
                <p className="text-xs text-d4l-muted mt-0.5">{editingUser.name}</p>
              </div>
              <button onClick={() => setEditingUser(null)} className="p-1.5 rounded-lg hover:bg-d4l-hover transition-colors text-d4l-muted">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEdit}>
              <div className="px-6 py-5 space-y-5">
                <div>
                  <label className="block text-xs uppercase tracking-wider text-d4l-muted font-medium mb-2">Current Password</label>
                  <div className="relative">
                    <input
                      type={editShowCurrentPassword ? 'text' : 'password'}
                      value={editCurrentPassword}
                      onChange={(e) => setEditCurrentPassword(e.target.value)}
                      className="w-full px-3 py-2.5 pr-10 border border-d4l-border rounded-lg text-sm bg-d4l-bg text-d4l-text focus:outline-none focus:ring-2 focus:ring-d4l-gold/50"
                      placeholder="Required to make changes"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setEditShowCurrentPassword(!editShowCurrentPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-d4l-dim hover:text-d4l-text transition-colors"
                    >
                      {editShowCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs uppercase tracking-wider text-d4l-muted font-medium mb-2">Email Address</label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="w-full px-3 py-2.5 border border-d4l-border rounded-lg text-sm bg-d4l-bg text-d4l-text focus:outline-none focus:ring-2 focus:ring-d4l-gold/50"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs uppercase tracking-wider text-d4l-muted font-medium mb-2">New Password</label>
                  <div className="relative">
                    <input
                      type={editShowPassword ? 'text' : 'password'}
                      value={editPassword}
                      onChange={(e) => setEditPassword(e.target.value)}
                      className="w-full px-3 py-2.5 pr-10 border border-d4l-border rounded-lg text-sm bg-d4l-bg text-d4l-text focus:outline-none focus:ring-2 focus:ring-d4l-gold/50"
                      placeholder="Leave blank to keep current"
                      minLength={6}
                    />
                    <button
                      type="button"
                      onClick={() => setEditShowPassword(!editShowPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-d4l-dim hover:text-d4l-text transition-colors"
                    >
                      {editShowPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <p className="text-[11px] text-d4l-dim">
                  Enter the account's current password to authenticate changes. Leave new password blank to only change email.
                </p>
              </div>

              <div className="px-6 py-4 border-t border-d4l-border flex items-center gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-2.5 bg-d4l-gold text-black font-semibold rounded-lg hover:bg-d4l-gold-dark disabled:opacity-50 transition-colors text-sm btn-glow"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pencil className="w-4 h-4" />}
                  Save Changes
                </button>
                <button type="button" onClick={() => setEditingUser(null)} className="px-4 py-2.5 text-d4l-text2 hover:text-d4l-text text-sm rounded-lg hover:bg-d4l-hover transition-colors">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== DELETE CONFIRMATION MODAL ===== */}
      {deletingUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setDeletingUser(null)}>
          <div className="bg-d4l-surface rounded-2xl shadow-2xl w-[420px] overflow-hidden animate-fade-in border border-red-500/20" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-d4l-border">
              <h3 className="text-lg font-semibold text-red-400">Delete Account</h3>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm text-d4l-text">
                Are you sure you want to delete the account for <strong>{deletingUser.name}</strong>?
              </p>
              <p className="text-xs text-d4l-muted mt-2">{deletingUser.email}</p>
              <p className="text-[11px] text-d4l-dim mt-3">This will remove the account from the system. The staff member will no longer be able to log in.</p>
            </div>
            <div className="px-6 py-4 border-t border-d4l-border flex items-center gap-3">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-2 px-5 py-2.5 bg-red-500 text-white font-semibold rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors text-sm"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Delete Account
              </button>
              <button onClick={() => setDeletingUser(null)} className="px-4 py-2.5 text-d4l-text2 hover:text-d4l-text text-sm rounded-lg hover:bg-d4l-hover transition-colors">
                Cancel
              </button>
            </div>
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

                  <div className="flex items-center gap-1">
                    {/* Edit account */}
                    <button
                      onClick={() => openEdit(uid, user)}
                      className="p-2 rounded-lg text-d4l-dim hover:text-d4l-gold hover:bg-d4l-gold/5 transition-colors"
                      title="Edit account"
                    >
                      <Pencil className="w-4 h-4" />
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
                    {/* Delete account */}
                    <button
                      onClick={() => setDeletingUser({ uid, name: user.name, email: user.email })}
                      className="p-2 rounded-lg text-d4l-dim hover:text-red-400 hover:bg-red-500/5 transition-colors"
                      title="Delete account"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
