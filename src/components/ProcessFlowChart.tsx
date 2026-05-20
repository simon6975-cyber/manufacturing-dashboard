// src/components/ProcessFlowChart.tsx
'use client';

import React, { useMemo } from 'react';
import { Process } from '../lib/types';
import useAppStore from '../store/useAppStore';
import {
  AlertCircle,
  CheckCircle,
  Zap,
  ChevronRight,
  Info,
} from 'lucide-react';

interface ProcessFlowChartProps {
  processes: Process[];
  stopageData?: Record<number, number>; // process_no -> count
  efficiencyData?: Record<number, number>; // process_no -> efficiency %
}

const ProcessFlowChart: React.FC<ProcessFlowChartProps> = ({
  processes,
  stopageData = {},
  efficiencyData = {},
}:any) => {
  const selectedProcessNo = useAppStore((state:any) => state.selectedProcessNo);
  const setSelectedProcess = useAppStore((state:any) => state.setSelectedProcess);

  // 공정을 구룹별로 정렬
  const groupedProcesses = useMemo(() => {
    const groups: Record<string, Process[]> = {};
    processes.forEach((p:any) => {
      if (!groups[p.gubun]) {
        groups[p.gubun] = [];
      }
      groups[p.gubun].push(p);
    });
    return groups;
  }, [processes]);

  const getStatusIcon = (processNo: number) => {
    const stopCount = stopageData[processNo] || 0;
    const efficiency = efficiencyData[processNo] ?? 100;

    if (stopCount > 0) {
      return (
        <AlertCircle className="w-5 h-5 text-red-500" title={`${stopCount}회 정지`} />
      );
    }

    if (efficiency < 70) {
      return (
        <Zap className="w-5 h-5 text-yellow-500" title={`효율 ${efficiency}%`} />
      );
    }

    return (
      <CheckCircle className="w-5 h-5 text-green-500" title="정상 운영" />
    );
  };

  const getStatusColor = (processNo: number): string => {
    const stopCount = stopageData[processNo] || 0;
    const efficiency = efficiencyData[processNo] ?? 100;

    if (stopCount > 0) return 'border-red-500 bg-red-950/40';
    if (efficiency < 70) return 'border-yellow-500 bg-yellow-950/40';
    return 'border-green-500 bg-green-950/40';
  };

  return (
    <div className="w-full space-y-8 p-6 bg-black rounded-lg overflow-x-auto">
      {Object.entries(groupedProcesses).map(([gubun, groupProcesses]) => (
        <div key={gubun} className="space-y-4">
          {/* 그룹 헤더 */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-2 h-8 bg-blue-500 rounded"></div>
            <h3 className="text-lg font-bold text-white">{gubun}</h3>
            <span className="text-sm text-gray-500 ml-auto">
              {groupProcesses.length}개 공정
            </span>
          </div>

          {/* 공정 흐름 */}
          <div className="flex items-center gap-2 overflow-x-auto pb-4">
            {groupProcesses.map((process, idx) => (
              <React.Fragment key={process.id}>
                {/* 공정 박스 */}
                <div
                  onClick={() => setSelectedProcess(process.no)}
                  className={`flex-shrink-0 w-40 p-4 rounded-lg border-2 cursor-pointer transition-all ${getStatusColor(
                    process.no
                  )} ${
                    selectedProcessNo === process.no
                      ? 'ring-2 ring-blue-400 shadow-lg'
                      : 'hover:shadow-md hover:brightness-125'
                  }`}
                >
                  {/* 상단 정보 */}
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <p className="text-xs text-gray-400">공정 #{process.no}</p>
                      <p className="font-semibold text-sm text-white truncate">
                        {process.jiheung}
                      </p>
                    </div>
                    {getStatusIcon(process.no)}
                  </div>

                  {/* 기계 정보 */}
                  <div className="text-xs space-y-1 text-gray-400 mb-3">
                    <p className="truncate" title={process.model}>
                      📦 {process.model}
                    </p>
                    <p className="truncate" title={process.jechasa}>
                      🏭 {process.jechasa}
                    </p>
                  </div>

                  {/* 통계 */}
                  {(stopageData[process.no] || efficiencyData[process.no]) && (
                    <div className="space-y-1 pt-2 border-t border-gray-700">
                      {stopageData[process.no] > 0 && (
                        <p className="text-xs text-red-400 font-medium">
                          정지: {stopageData[process.no]}회
                        </p>
                      )}
                      {efficiencyData[process.no] !== undefined && (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-800 rounded-full h-2">
                            <div
                              className="bg-green-500 h-2 rounded-full transition-all"
                              style={{
                                width: `${Math.max(0, Math.min(100, efficiencyData[process.no]))}%`,
                              }}
                            ></div>
                          </div>
                          <span className="text-xs font-medium text-gray-300">
                            {Math.round(efficiencyData[process.no])}%
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 화살표 (마지막 아님) */}
                {idx < groupProcesses.length - 1 && (
                  <div className="flex-shrink-0 text-gray-600">
                    <ChevronRight className="w-6 h-6" />
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      ))}

      {/* 범례 */}
      <div className="mt-8 pt-6 border-t border-gray-800">
        <div className="flex flex-wrap gap-6 text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-500" />
            <span className="text-gray-400">정상 운영</span>
          </div>
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-yellow-500" />
            <span className="text-gray-400">효율 저하 (&lt;70%)</span>
          </div>
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500" />
            <span className="text-gray-400">정지 발생</span>
          </div>
        </div>
      </div>

      {/* 선택된 공정 상세 정보 */}
      {selectedProcessNo && (
        <div className="mt-6 p-4 bg-gray-900 border-2 border-blue-500 rounded-lg">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-white">
                공정 #{selectedProcessNo} 상세 정보
              </p>
              <p className="text-sm text-gray-400 mt-1">
                우측 패널에서 상세 정보 및 통계를 확인할 수 있습니다.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProcessFlowChart;
