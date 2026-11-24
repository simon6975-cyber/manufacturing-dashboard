// src/lib/bottleneck-rules.ts
// 병목 판정 규칙(BN1~BN5) — Firestore settings/bottleneck_rules { rules }
// 판정은 사내PC scripts/dspm-log-sync.js 가 1분마다 하고(dspm_live/bottlenecks),
// 이 파일은 규칙의 형태·기본값과 설정 화면 항목을 정의한다. 기본값은 스크립트 DEFAULT_BN_RULES 와 같게 유지.

export interface BottleneckRules {
  BN1: { enabled: boolean; name: string; overloadMinutes: number; countThreshold: number; windowHours: number };
  BN2: { enabled: boolean; name: string; emptyMinutes: number; excludePrevIdle: boolean };
  BN3: { enabled: boolean; name: string; stopCodes: string[]; countThreshold: number; windowHours: number };
  BN4: { enabled: boolean; name: string; runMinutes: number };
  BN5: { enabled: boolean; name: string; stopCodes: string[]; countThreshold: number; windowHours: number };
}
export type BottleneckCode = keyof BottleneckRules;
export const BOTTLENECK_CODES: BottleneckCode[] = ['BN1', 'BN2', 'BN3', 'BN4', 'BN5'];

export const DEFAULT_BOTTLENECK_RULES: BottleneckRules = {
  BN1: { enabled: true, name: '대기물량병목', overloadMinutes: 30, countThreshold: 10, windowHours: 24 },
  BN2: { enabled: true, name: '전공정병목', emptyMinutes: 60, excludePrevIdle: true },
  BN3: { enabled: true, name: '동시성병목', stopCodes: ['S1', 'S2', 'S3'], countThreshold: 20, windowHours: 2 },
  BN4: { enabled: true, name: '대량물량병목', runMinutes: 180 },
  BN5: { enabled: true, name: '긴급물량병목', stopCodes: ['S6'], countThreshold: 5, windowHours: 6 },
};

/** 저장값을 기본값 위에 덮어 빠진 항목·잘못된 타입을 정리 (API 저장·조회 공용) */
export function normalizeBottleneckRules(raw: unknown): BottleneckRules {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, Record<string, unknown>>;
  const out = JSON.parse(JSON.stringify(DEFAULT_BOTTLENECK_RULES)) as Record<string, Record<string, unknown>>;
  for (const code of BOTTLENECK_CODES) {
    const def = out[code];
    const given = src[code] || {};
    for (const [k, dv] of Object.entries(def)) {
      const v = given[k];
      if (typeof dv === 'boolean' && typeof v === 'boolean') def[k] = v;
      else if (typeof dv === 'number' && typeof v === 'number' && Number.isFinite(v) && v > 0) def[k] = Math.round(v * 100) / 100;
      else if (typeof dv === 'string' && typeof v === 'string' && v.trim()) def[k] = v.trim().slice(0, 30);
      else if (Array.isArray(dv) && Array.isArray(v)) {
        const codes = v.map((x) => String(x).trim().toUpperCase()).filter((x) => /^S\d+$/.test(x));
        if (codes.length > 0) def[k] = Array.from(new Set(codes));
      }
    }
  }
  return out as unknown as BottleneckRules;
}

/** 설정 화면에 보여줄 한 줄 설명 */
export function describeRule(code: BottleneckCode, r: BottleneckRules): string {
  switch (code) {
    case 'BN1': return `장비군 대기물량이 최대치 이상인 상태가 ${r.BN1.overloadMinutes}분 이상 지속되거나, 최근 ${r.BN1.windowHours}시간 동안 ${r.BN1.countThreshold}회 이상 초과`;
    case 'BN2': return `장비군 대기물량 0 인 상태가 ${r.BN2.emptyMinutes}분 이상 지속${r.BN2.excludePrevIdle ? ' (전공정 장비가 모두 IDLE 이면 제외)' : ''}`;
    case 'BN3': return `정지코드 ${r.BN3.stopCodes.join('·')} 가 최근 ${r.BN3.windowHours}시간 동안 ${r.BN3.countThreshold}회 이상`;
    case 'BN4': return `한 작업(매칭코드)이 ${r.BN4.runMinutes}분 이상 RUN 지속`;
    case 'BN5': return `정지코드 ${r.BN5.stopCodes.join('·')} 가 최근 ${r.BN5.windowHours}시간 동안 ${r.BN5.countThreshold}회 이상`;
  }
}

/** 실시간 판정 결과 — dspm_live/bottlenecks { machines: { [장비번호]: ActiveBottleneck[] } } */
export interface ActiveBottleneck { code: string; name: string; since: number; detail: string }

/** 병목 이력 한 건 — bottleneck_events (사내PC 가 발생·해제 때 기록). endedAt null = 진행 중 */
export interface BottleneckEvent {
  id: string; machineNo: number; machineName: string; code: string; name: string;
  detectedAt: number; since: number | null; endedAt: number | null; detail: string; lastDetail: string;
}
