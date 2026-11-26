import ReportCategoryPage from '@/components/ReportCategoryPage';

export default function Page() {
  return (
    <ReportCategoryPage title="제작방식" description="제본 방식별 생산 실적"
      tabs={[{ key: 'binding', label: '제작방식', groups: [{ items: ['무선제본', '중철제본', '무철제본 (시험지)', '날개제본'] }] }]} />
  );
}
