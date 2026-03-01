import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, onValue } from 'firebase/database';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject, listAll } from 'firebase/storage';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Only initialize if config is present
const isConfigured = !!firebaseConfig.apiKey && !!firebaseConfig.databaseURL;

let app = null;
let db = null;
let storage = null;

if (isConfigured) {
  app = initializeApp(firebaseConfig);
  db = getDatabase(app);
  try {
    storage = getStorage(app);
  } catch (e) {
    console.warn('Firebase Storage not available:', e.message);
  }
}

export { db, ref, set, onValue, storage, storageRef, uploadBytes, getDownloadURL, deleteObject, listAll, isConfigured };
