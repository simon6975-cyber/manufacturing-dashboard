// src/app/page.tsx
'use client';

import React, { useEffect, useState } from 'react';
import Navigation from '../components/Navigation';
import ProcessFlowChart from '../components/ProcessFlowChart';
import StopAndBottleneckChart from '../components/StopAndBottleneckChart';
import StatisticsDashboard from '../components/StatisticsDashboard';
import { Process, StopCode, BottleneckCode, StopageRecord } from '../lib/types';
import { 
  getProcesses, 
  getStopCodes, 
  getBottleneckCodes, 
  getStopageRecords 
} from '../lib/firestore';
import { Factory, Activity, AlertTriangle, TrendingUp } from 'lucide-react';

export default function Home() {
  const [processes, setProcesses] = useState<Process[]>([]);
  const [stopCodes, setStopCodes] = useState<StopCode[]>([]);
  const [bottleneckCodes, setBottleneckCodes] = useState<BottleneckCode[]>([]);
  const [stopageRecords, setStopageRecords] = useState<StopageRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [proc, stops, bottlenecks, records] = await Promise.all([
        getProcesses(),
        getStopCodes(),
        getBottleneckCodes(),
        getStopageRecords()
      ]);
      setProcesses(proc);
      setStopCodes(stops);
      setBottleneckCodes(bottlenecks);
      setStopageRecords(records);
    } catch (error) {
      console.error('데이터 로드 실패:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <Factory className="w-8 h-8 text-blue-600" />
            제작공정 대시보드
          </h1>
          <p className="text-gray-600 mt-2">실시간 공정 모니터링 및 분석</p>
        </div>

        {isLoading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-gray-600">데이터 로드 중...</p>
          </div>
        ) : (
          <>
            <StatisticsDashboard 
              processes={processes}
              stopageRecords={stopageRecords}
            />
            <ProcessFlowChart 
              processes={processes}
            />
            <StopAndBottleneckChart 
              stopCodes={stopCodes}
              bottleneckCodes={bottleneckCodes}
              stopageRecords={stopageRecords}
            />
          </>
        )}
      </main>
    </div>
  );
}