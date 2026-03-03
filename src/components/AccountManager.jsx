import { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut as firebaseSignOut } from 'firebase/auth';
import { app, db, ref, set, onValue, auth, sendPasswordResetEmail } from '../utils/firebase';
import { UserPlus, Mail, Shield, ShieldCheck, Loader2, RefreshCw, Users } from 'lucide-react';

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

  // Subscribe to users path in RTDB
  useEffect(() => {
    if (!db) return;
    const usersRef = ref(db, 'users');
    const unsubscribe = onValue(usersRef, (snapshot) => {
      setUsers(snapshot.val() || {});
    });
    return () => unsubscribe();
  }, []);

  // Staff members who don't have accounts yet
  const linkedStaffIds = new Set(Object.values(users).map(u => u.staffId));
  const unlinkedStaff = staff.filter(s => !linkedStaffIds.has(s.id));

  const handleCreate = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setCreating(true);

    try {
      const member = staff.find(s => s.id === selectedStaffId);
      if (!member) throw new Error('Staff member not found.');

      // Create user on secondary auth instance
      const secAuth = getSecondaryAuth();
      const tempPassword = Math.random().toString(36).slice(-10) + 'A1!';
      const credential = await createUserWithEmailAndPassword(secAuth, newEmail, tempPassword);
      const newUid = credential.user.uid;

      // Write user record to RTDB
      await set(ref(db, `users/${newUid}`), {
        email: newEmail,
        role: newRole,
        staffId: selectedStaffId,
        name: member.name,
        createdAt: new Date().toISOString().split('T')[0],
      });

      // Sign out secondary auth
      await firebaseSignOut(secAuth);

      // Send password reset email so staff can set their own password
      await sendPasswordResetEmail(auth, newEmail);

      setSuccess(`Account created for ${member.name}. A password reset email has been sent to ${newEmail}.`);
      setSelectedStaffId('');
      setNewEmail('');
      setNewRole('staff');
      setShowCreate(false);
    } catch (err) {
      if (err.code === 'auth/email-already-in-use') {
        setError('This email is already in use.');
      } else if (err.code === 'auth/invalid-email') {
        setError('Invalid email address.');
      } else {
        setError(err.message || 'Failed to create account.');
      }
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
    const newRole = currentRole === 'admin' ? 'staff' : 'admin';
    try {
      await set(ref(db, `users/${uid}/role`), newRole);
    } catch {
      setError('Failed to update role.');
    }
  };

  const userEntries = Object.entries(users).sort((a, b) => a[1].name?.localeCompare(b[1].name || ''));

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Manage Accounts</h1>
          <p className="text-gray-500 text-sm">Create and manage staff login accounts</p>
        </div>
        <button
          onClick={() => { setShowCreate(!showCreate); setError(null); }}
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
        >
          <UserPlus className="w-4 h-4" />
          New Account
        </button>
      </div>

      {/* Messages */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
          {error}
          <button onClick={() => setError(null)} className="float-right text-red-500 hover:text-red-700 font-bold">&times;</button>
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg">
          {success}
          <button onClick={() => setSuccess(null)} className="float-right text-green-500 hover:text-green-700 font-bold">&times;</button>
        </div>
      )}

      {/* Create Account Form */}
      {showCreate && (
        <form onSubmit={handleCreate} className="bg-white rounded-xl shadow-sm border p-5 mb-6">
          <h3 className="font-semibold text-gray-800 mb-4">Create Staff Account</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Staff Member</label>
              <select
                value={selectedStaffId}
                onChange={(e) => setSelectedStaffId(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                required
              >
                <option value="">Select staff member...</option>
                {unlinkedStaff.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="staff@drip4life.co.za"
                required
              />
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <div className="flex gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="role" value="staff" checked={newRole === 'staff'} onChange={() => setNewRole('staff')} />
                <span className="text-sm text-gray-700">Staff</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="role" value="admin" checked={newRole === 'admin'} onChange={() => setNewRole('admin')} />
                <span className="text-sm text-gray-700">Admin</span>
              </label>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={creating}
              className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors text-sm"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              Create & Send Invite
            </button>
            <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-gray-600 hover:text-gray-800 text-sm">
              Cancel
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-3">
            A password reset email will be sent so the staff member can set their own password.
          </p>
        </form>
      )}

      {/* Accounts List */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="px-5 py-3 bg-gray-50 border-b flex items-center gap-2">
          <Users className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-700">{userEntries.length} Account{userEntries.length !== 1 ? 's' : ''}</span>
          {unlinkedStaff.length > 0 && (
            <span className="ml-auto text-xs text-amber-600">{unlinkedStaff.length} staff without accounts</span>
          )}
        </div>

        {userEntries.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">
            No accounts created yet. Click "New Account" to get started.
          </div>
        ) : (
          <div className="divide-y">
            {userEntries.map(([uid, user]) => (
              <div key={uid} className="px-5 py-3 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-800">{user.name}</div>
                  <div className="text-sm text-gray-500 truncate">{user.email}</div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => toggleRole(uid, user.role)}
                    className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      user.role === 'admin'
                        ? 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                    title="Click to toggle role"
                  >
                    {user.role === 'admin' ? <ShieldCheck className="w-3 h-3" /> : <Shield className="w-3 h-3" />}
                    {user.role}
                  </button>
                </div>
                <button
                  onClick={() => handlePasswordReset(user.email)}
                  disabled={resetting === user.email}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-500 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                  title="Send password reset email"
                >
                  {resetting === user.email ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3 h-3" />
                  )}
                  Reset Password
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
