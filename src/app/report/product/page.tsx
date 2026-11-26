import ReportCategoryPage from '@/components/ReportCategoryPage';

export default function Page() {
  return (
    <ReportCategoryPage title="제품별" description="제품별 생산 실적"
      tabs={[{ key: 'product', label: '제품별', groups: [{
        items: ['V-book', 'V-M', 'P-book', 'P-M', 'P+A', 'P+S', 'P+M', 'OMR', '기타 (봉투·브로슈어·포스터·수작업)'],
      }] }]} />
  );
}
