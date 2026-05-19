// src/app/settings/page.tsx
'use client';

import React, { useState } from 'react';
import Navigation from '../../components/Navigation';
import { addProcess, addStopCode, addBottleneckCode } from '../../lib/firestore';
import { Settings, Database, AlertCircle, CheckCircle } from 'lucide-react';

// 초기 공정 데이터 (스크린샷 기반)
const INITIAL_PROCESSES = [
  { no: 1, gubun: '네거', jiheung: '인쇄지중심 1공정', model: '5204H+', jechasa: 'SCREEN' },
  { no: 2, gubun: '네거', jiheung: '잉크종류 2공정', model: '5204H+', jechasa: 'SCREEN' },
  { no: 3, gubun: '네거', jiheung: 'R2C 1공정', model: '52020', jechasa: 'TECHNAU' },
  { no: 4, gubun: '네거', jiheung: 'R2C 2공정', model: '52320', jechasa: 'TECHNAU' },
  { no: 5, gubun: '네거', jiheung: '냉장탱크 1공정', model: '야마지타', jechasa: 'FUJI FILM' },
  { no: 6, gubun: '네거', jiheung: '냉장정보 2공정', model: '해보리야', jechasa: 'FUJI FILM' },
  { no: 7, gubun: '표지', jiheung: '고정 1공정', model: 'EURO/DI 540', jechasa: 'GMP' },
  { no: 8, gubun: '표지', jiheung: '고정 2공정', model: 'PROTO/DI 540', jechasa: 'GMP' },
  { no: 9, gubun: '표지', jiheung: '에폭시', model: 'DDC 810', jechasa: 'DUPLO' },
  { no: 10, gubun: '표지', jiheung: '수동짐값 1공정', model: 'POLAR 92', jechasa: 'HEIDELBERG' },
  { no: 11, gubun: '표지', jiheung: '수동짐값 2공정', model: '5860', jechasa: '' },
  { no: 12, gubun: '제본', jiheung: '제본 1공정', model: 'BQ470/HT80', jechasa: 'HORIZON' },
  { no: 13, gubun: '제본', jiheung: '제본 2공정', model: 'BQ470/HT70', jechasa: 'HORIZON' },
  { no: 14, gubun: '제본', jiheung: '제본 3공정', model: 'BQ470/HT300', jechasa: 'HORIZON' },
  { no: 15, gubun: '제본', jiheung: '중징기', model: 'SPF-200A', jechasa: 'HORIZON' },
  { no: 16, gubun: '제본', jiheung: '냉장자기', model: 'ZK320', jechasa: '' },
  { no: 17, gubun: '제본', jiheung: '자동검지기', model: 'CSMO', jechasa: 'HUNKELER' },
  { no: 18, gubun: '보정', jiheung: '박스포장', model: '', jechasa: '' },
  { no: 19, gubun: '보정', jiheung: '팬지포장', model: '', jechasa: '' },
];

// 정지코드 (6가지)
const INITIAL_STOP_CODES = [
  { code: 'A01', name: '설비고장', category: 'machinery' as const },
  { code: 'A02', name: '원자재부족', category: 'material' as const },
  { code: 'A03', name: '인력부족', category: 'manpower' as const },
  { code: 'A04', name: '공정오류', category: 'method' as const },
  { code: 'A05', name: '환경문제', category: 'environment' as const },
  { code: 'A06', name: '기타', category: 'other' as const },
];

// 병목코드 (10가지)
const INITIAL_BOTTLENECK_CODES = [
  { bn_code: 'BN01', bn_name: '잉크점도', process_no: 1, severity: 'high' as const },
  { bn_code: 'BN02', bn_name: '용지품질', process_no: 2, severity: 'high' as const },
  { bn_code: 'BN03', bn_name: '가열온도', process_no: 3, severity: 'medium' as const },
  { bn_code: 'BN04', bn_name: '기계속도', process_no: 5, severity: 'high' as const },
  { bn_code: 'BN05', bn_name: '먹지조절', process_no: 7, severity: 'medium' as const },
  { bn_code: 'BN06', bn_name: '수분조절', process_no: 8, severity: 'medium' as const },
  { bn_code: 'BN07', bn_name: '압력설정', process_no: 10, severity: 'low' as const },
  { bn_code: 'BN08', bn_name: '절단정밀도', process_no: 12, severity: 'high' as const },
  { bn_code: 'BN09', bn_name: '정렬정확도', process_no: 13, severity: 'medium' as const },
  { bn_code: 'BN10', bn_name: '바인딩강도', process_no: 15, severity: 'high' as const },
];

export default function SettingsPage() {
  const [isInitializing, setIsInitializing] = useState(false);
  const [initStatus, setInitStatus] = useState<{
    type: 'idle' | 'success' | 'error';
    message: string;
  }>({ type: 'idle', message: '' });

  const handleInitializeData = async () => {
    if (
      !confirm(
        '모든 초기 데이터를 로드하시겠습니까? 기존 데이터는 유지됩니다.'
      )
    ) {
      return;
    }

    setIsInitializing(true);
    setInitStatus({ type: 'idle', message: '초기화 중...' });

    try {
      // 공정 데이터 추가
      for (const process of INITIAL_PROCESSES) {
        await addProcess(process as any);
      }

      // 정지코드 추가
      for (const code of INITIAL_STOP_CODES) {
        await addStopCode(code as any);
      }

      // 병목코드 추가
      for (const code of INITIAL_BOTTLENECK_CODES) {
        await addBottleneckCode(code as any);
      }

      setInitStatus({
        type: 'success',
        message: `초기화 완료! 공정 ${INITIAL_PROCESSES.length}개, 정지코드 ${INITIAL_STOP_CODES.length}개, 병목코드 ${INITIAL_BOTTLENECK_CODES.length}개가 로드되었습니다.`,
      });
    } catch (err) {
      console.error('초기화 오류:', err);
      setInitStatus({
        type: 'error',
        message: '초기화 중 오류가 발생했습니다. Firebase 연결을 확인하세요.',
      });
    } finally {
      setIsInitializing(false);
    }
  };

  return (
    <>
      <Navigation />
      <main className="min-h-screen bg-gray-100">
        {/* 헤더 */}
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-4xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
            <h1 className="text-2xl font-bold text-gray-900">설정</h1>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-6 sm:px-6 lg:px-8 space-y-6">
          {/* 상태 메시지 */}
          {initStatus.type !== 'idle' && (
            <div
              className={`rounded-lg p-6 flex items-start gap-4 ${
                initStatus.type === 'success'
                  ? 'bg-green-50 border-l-4 border-green-500'
                  : 'bg-red-50 border-l-4 border-red-500'
              }`}
            >
              {initStatus.type === 'success' ? (
                <CheckCircle className="w-6 h-6 text-green-500 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
              )}
              <p
                className={`text-sm font-medium ${
                  initStatus.type === 'success'
                    ? 'text-green-800'
                    : 'text-red-800'
                }`}
              >
                {initStatus.message}
              </p>
            </div>
          )}

          {/* 데이터베이스 초기화 */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="flex items-start gap-4 mb-6">
              <div className="p-3 bg-blue-100 rounded-lg">
                <Database className="w-6 h-6 text-blue-600" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-bold text-gray-900">데이터베이스 초기화</h2>
                <p className="text-sm text-gray-600 mt-1">
                  스크린샷 기반 초기 데이터를 Firebase에 로드합니다.
                </p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-6 mb-6 space-y-4">
              <div>
                <h3 className="font-semibold text-gray-800 mb-2">로드될 데이터</h3>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                    <span>공정 정보: {INITIAL_PROCESSES.length}개</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                    <span>정지코드: {INITIAL_STOP_CODES.length}가지</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                    <span>병목코드: {INITIAL_BOTTLENECK_CODES.length}가지</span>
                  </li>
                </ul>
              </div>

              <div className="pt-4 border-t border-gray-200">
                <h3 className="font-semibold text-gray-800 mb-3 text-sm">공정 구분</h3>
                <div className="flex flex-wrap gap-2">
                  {['네거', '표지', '제본', '보정'].map((gubun) => (
                    <span
                      key={gubun}
                      className="inline-block px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium"
                    >
                      {gubun}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={handleInitializeData}
              disabled={isInitializing}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {isInitializing && (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              )}
              {isInitializing ? '초기화 중...' : '초기 데이터 로드'}
            </button>
          </div>

          {/* Firebase 환경 확인 */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="flex items-start gap-4 mb-6">
              <div className="p-3 bg-green-100 rounded-lg">
                <Settings className="w-6 h-6 text-green-600" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-bold text-gray-900">Firebase 설정 확인</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Firebase 연결이 정상인지 확인하세요.
                </p>
              </div>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                <span className="text-gray-600">
                  💡 <strong>.env.local</strong> 파일에 다음 환경변수를 설정했나요?
                </span>
              </div>

              <pre className="p-4 bg-gray-900 text-green-400 rounded-lg text-xs overflow-x-auto font-mono">
{`NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id`}
              </pre>

              <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
                <span className="text-blue-700 text-xs">
                  ℹ️ Firestore 보안 규칙은 <strong>테스트 모드</strong>로 시작하세요.
                  (프로덕션은 적절한 규칙을 설정해야 합니다)
                </span>
              </div>
            </div>
          </div>

          {/* 빠른 시작 가이드 */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">📖 빠른 시작 가이드</h2>
            <div className="space-y-4 text-sm">
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center font-bold text-xs text-blue-600">
                  1
                </div>
                <div>
                  <p className="font-medium text-gray-800">초기 데이터 로드</p>
                  <p className="text-gray-600 mt-1">위의 "초기 데이터 로드" 버튼을 클릭하여 19개 공정, 6개 정지코드, 10개 병목코드를 로드합니다.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center font-bold text-xs text-blue-600">
                  2
                </div>
                <div>
                  <p className="font-medium text-gray-800">대시보드 확인</p>
                  <p className="text-gray-600 mt-1">"대시보드" 메뉴로 이동하여 공정 흐름도와 통계를 확인합니다.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center font-bold text-xs text-blue-600">
                  3
                </div>
                <div>
                  <p className="font-medium text-gray-800">공정 관리</p>
                  <p className="text-gray-600 mt-1">"공정 관리" 메뉴에서 공정 정보를 수정하거나 새로운 공정을 추가할 수 있습니다.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center font-bold text-xs text-blue-600">
                  4
                </div>
                <div>
                  <p className="font-medium text-gray-800">분석 페이지</p>
                  <p className="text-gray-600 mt-1">"분석" 메뉴에서 상세 통계 및 추이를 분석합니다.</p>
                </div>
              </div>
            </div>
          </div>

          {/* 배포 정보 */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">🚀 Vercel 배포</h2>
            <div className="space-y-3 text-sm text-gray-600">
              <p>
                1. GitHub에 프로젝트를 push합니다.
              </p>
              <p>
                2. <a href="https://vercel.com" className="text-blue-600 hover:underline">Vercel</a>에서 GitHub 계정으로 로그인합니다.
              </p>
              <p>
                3. "New Project"에서 GitHub repository를 선택합니다.
              </p>
              <p>
                4. Environment Variables에서 위의 Firebase 설정을 추가합니다.
              </p>
              <p>
                5. "Deploy" 버튼을 클릭하여 배포합니다.
              </p>
              <p className="text-blue-600 font-medium mt-4">
                배포 후 URL: https://your-project.vercel.app
              </p>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
