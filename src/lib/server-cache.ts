// src/lib/server-cache.ts
// API 라우트용 메모리 캐시 — 여러 화면(기기)이 같은 Firestore 데이터를 요청해도 서버가 TTL 동안
// 한 번만 읽는다. Firestore 무료 읽기 한도(5만/일)를 켜 둔 화면 수와 무관하게 유지하려는 것.
// Vercel 함수 인스턴스마다 따로 들고 있으므로(인스턴스 수만큼만 중복) CDN 캐시 헤더와 함께 쓴다.

type Entry = { at: number; value: unknown };
const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();
const MAX_ENTRIES = 500;

/** key 로 TTL 동안 결과를 재사용. 같은 키 동시 요청은 한 번만 읽는다. fresh 면 캐시를 건너뛰고 새로 채운다 */
export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>, fresh = false): Promise<T> {
  const hit = store.get(key);
  if (!fresh && hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const running = inflight.get(key);
  if (!fresh && running) return running as Promise<T>;

  const p = load()
    .then((value) => {
      if (store.size >= MAX_ENTRIES) store.delete(store.keys().next().value as string);
      store.set(key, { at: Date.now(), value });
      return value;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export function invalidate(key: string): void {
  store.delete(key);
}

/** KST 오늘 날짜 */
export function todayKstStr(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 날짜별 TTL — 오늘은 계속 바뀌므로 짧게, 지난 날짜는 길게 */
export function dateTtlMs(date: string): number {
  return date >= todayKstStr() ? 2 * 60 * 1000 : 10 * 60 * 1000;
}

/** Vercel CDN 이 같은 URL 응답을 공유하게 하는 헤더 (fresh 요청은 캐시 안 함) */
export function cacheHeaders(fresh: boolean, sMaxAge = 60): Record<string, string> {
  return fresh
    ? { 'Cache-Control': 'no-store' }
    : { 'Cache-Control': `public, s-maxage=${sMaxAge}, stale-while-revalidate=${sMaxAge}` };
}
