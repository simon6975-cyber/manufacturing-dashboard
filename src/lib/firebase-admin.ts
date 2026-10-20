// src/lib/firebase-admin.ts
// Server-side Firebase Admin SDK (Vercel Cron, API routes 전용)
import { initializeApp, getApps, cert, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];

  // FIREBASE_SERVICE_ACCOUNT_KEY 환경변수에 서비스 계정 JSON을 통째로 넣거나,
  // 개별 환경변수로 분리해서 넣을 수 있음
  const saKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (saKey) {
    const serviceAccount: ServiceAccount = JSON.parse(saKey);
    return initializeApp({ credential: cert(serviceAccount) });
  }

  // 개별 환경변수 방식
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (projectId && clientEmail && privateKey) {
    return initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
    });
  }

  // Application Default Credentials (로컬 개발 등)
  return initializeApp();
}

const adminApp = getAdminApp();
export const adminDb = getFirestore(adminApp);
