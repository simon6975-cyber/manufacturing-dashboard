// src/lib/firebase-admin.ts
// Server-side Firebase Admin SDK (Vercel Cron, API routes 전용)
import { initializeApp, getApps, cert, type ServiceAccount, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

let _app: App | null = null;
let _db: Firestore | null = null;

function getAdminApp(): App {
  if (_app) return _app;
  if (getApps().length > 0) { _app = getApps()[0]; return _app; }

  // 방법1: FIREBASE_SERVICE_ACCOUNT_KEY 환경변수에 서비스 계정 JSON 통째로
  const saKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (saKey) {
    try {
      const parsed = JSON.parse(saKey);
      const serviceAccount: ServiceAccount = {
        projectId: parsed.project_id,
        clientEmail: parsed.client_email,
        privateKey: parsed.private_key,
      };
      _app = initializeApp({ credential: cert(serviceAccount) });
      return _app;
    } catch (e) {
      console.error('FIREBASE_SERVICE_ACCOUNT_KEY JSON 파싱 실패:', e);
    }
  }

  // 방법2: 개별 환경변수
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (projectId && clientEmail && privateKey) {
    _app = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
    return _app;
  }

  throw new Error(
    'Firebase Admin 초기화 실패: FIREBASE_SERVICE_ACCOUNT_KEY 환경변수를 확인하세요.'
  );
}

// lazy getter — 런타임에서만 호출됨 (빌드 시점에는 실행 안 됨)
export function getAdminDb(): Firestore {
  if (!_db) _db = getFirestore(getAdminApp());
  return _db;
}
