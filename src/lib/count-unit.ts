// src/lib/count-unit.ts
// 장비군(equipmentGroup) 기준 작업건수 단위

export function getCountUnit(equipmentGroup: string): string {
  if (/연속지출력|롤재단|낱장출력/.test(equipmentGroup)) return '페이지';
  if (/코팅|에폭시|낱장재단/.test(equipmentGroup)) return '장';
  if (/제본|중철|날개접지|시험지접지|포장/.test(equipmentGroup)) return '부';
  return '건';
}
