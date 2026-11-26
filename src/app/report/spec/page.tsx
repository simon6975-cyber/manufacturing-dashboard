import ReportCategoryPage from '@/components/ReportCategoryPage';

export default function Page() {
  return (
    <ReportCategoryPage title="제작사양" description="판형·용지·후가공별 생산 실적"
      tabs={[
        { key: 'size', label: '판형', groups: [{ items: ['A4', 'B5', 'A5', '비규격'] }] },
        { key: 'paper', label: '용지', groups: [
          { label: '내지', items: ['미색 80', '백색 80', '미색 100', '백색 100', '기타'] },
          { label: '표지', items: ['아트 200', '아트 250', '스노우 200', '스노우 250', '기타'] },
        ] },
        { key: 'finish', label: '후가공', groups: [{ items: ['무광코팅', '유광코팅', '에폭시'] }] },
      ]} />
  );
}
