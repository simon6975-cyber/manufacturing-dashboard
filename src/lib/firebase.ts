// src/lib/firebase.ts
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyBnBX-kzroSWJvqQFYqxaoZDZk6apENbqo",
  authDomain: "manufacturing-dashboard-45f40.firebaseapp.com",
  projectId: "manufacturing-dashboard-45f40",
  storageBucket: "manufacturing-dashboard-45f40.firebasestorage.app",
  messagingSenderId: "921171028024",
  appId: "1:921171028024:web:c98ed492efd91951b0decd"
};

// Firebase 초기화
const app = initializeApp(firebaseConfig);

// Firestore, Auth, Storage 초기화
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);

export default app;
