// src/lib/fetch-error.ts
// 화면용 API 호출 + 실패 사유 표시 — 실패를 빈 목록으로 삼키면 '이력 없음'처럼 보여 원인을 알 수 없었다

/** /api/* JSON 을 읽고, ok 가 아니면 서버가 준 error 로 예외를 던진다 */
export async function fetchApiJson<T = Record<string, unknown>>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.ok === false) {
    throw new Error((json && typeof json.error === 'string' && json.error) || `HTTP ${res.status}`);
  }
  return json as T;
}

/** 오류를 사람이 읽을 문구로 — Firestore 일일 한도 초과는 따로 안내 */
export function describeLoadError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/RESOURCE_EXHAUSTED|quota/i.test(msg)) return 'Firebase 사용량 한도 초과 — 매일 오후 5시(한국 시각)에 초기화됩니다';
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return '네트워크 연결 오류';
  return msg.length > 80 ? `${msg.slice(0, 80)}…` : msg;
}
