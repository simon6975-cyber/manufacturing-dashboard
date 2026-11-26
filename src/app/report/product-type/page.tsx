import ReportCategoryPage from '@/components/ReportCategoryPage';

export default function Page() {
  return (
    <ReportCategoryPage title="제품형태" description="제품 형태별 생산 실적"
      tabs={[{ key: 'type', label: '제품형태', groups: [{ items: ['교재', '시험지', 'OMR', '기타'] }] }]} />
  );
}
