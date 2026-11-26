// src/lib/date-range.ts
// KST 기준 날짜 범위 유틸 — 생산현황·리포트 공통 기간 선택

export const kstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

export const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** 0=일 … 6=토 */
export const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
export const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

/** 양끝 포함 일수 */
export const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000) + 1;

export type RangePreset = 'today' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth';
export const RANGE_PRESETS: { key: RangePreset; label: string }[] = [
  { key: 'today', label: '오늘' },
  { key: 'thisWeek', label: '이번 주' },
  { key: 'lastWeek', label: '지난 주' },
  { key: 'thisMonth', label: '이번 달' },
  { key: 'lastMonth', label: '지난 달' },
];

/** 바로가기 기간 — 주는 월요일 시작 */
export function presetRange(key: RangePreset): [string, string] {
  const today = kstToday();
  const monday = addDays(today, -((weekday(today) + 6) % 7));
  const monthStart = `${today.slice(0, 7)}-01`;
  switch (key) {
    case 'thisWeek': return [monday, today];
    case 'lastWeek': return [addDays(monday, -7), addDays(monday, -1)];
    case 'thisMonth': return [monthStart, today];
    case 'lastMonth': {
      const lastEnd = addDays(monthStart, -1);
      return [`${lastEnd.slice(0, 7)}-01`, lastEnd];
    }
    default: return [today, today];
  }
}
