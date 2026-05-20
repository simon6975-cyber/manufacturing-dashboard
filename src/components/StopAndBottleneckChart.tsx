// src/components/StopAndBottleneckChart.tsx
'use client';

import React, { useMemo } from 'react';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts';
import { StopCode, BottleneckCode, DailyStatistics } from '../lib/types';

interface StopAndBottleneckChartProps {
  stopCodes: StopCode[];
  bottleneckCodes: BottleneckCode[];
  statistics: DailyStatistics | null;
  stopCounts?: Record<string, number>;
  bottleneckCounts?: Record<string, number>;
}

const COLORS = ['#EF4444', '#F97316', '#EAB308', '#22C55E', '#3B82F6', '#8B5CF6'];

const StopAndBottleneckChart: React.FC<StopAndBottleneckChartProps> = ({
  stopCodes,
  bottleneckCodes,
  statistics,
  stopCounts = {},
  bottleneckCounts = {},
}) => {
  // 정지코드 데이터 준비
  const stopCodeChartData = useMemo(() => {
    return stopCodes.map((code) => ({
      code: code.code,
      name: code.name,
      count: stopCounts[code.code] || 0,
      category: code.category,
    }));
  }, [stopCodes, stopCounts]);

  // 병목코드 데이터 준비
  const bottleneckChartData = useMemo(() => {
    return bottleneckCodes.map((code) => ({
      code: code.bn_code,
      name: code.bn_name,
      count: bottleneckCounts[code.bn_code] || 0,
      severity: code.severity,
    }));
  }, [bottleneckCodes, bottleneckCounts]);

  // 카테고리별 정지 분포
  const categoryDistribution = useMemo(() => {
    const dist: Record<string, number> = {};
    stopCodeChartData.forEach((data) => {
      if (!dist[data.category]) {
        dist[data.category] = 0;
      }
      dist[data.category] += data.count;
    });
    return Object.entries(dist).map(([category, count]) => ({
      category,
      count,
    }));
  }, [stopCodeChartData]);

  // 심각도별 병목 분포
  const severityDistribution = useMemo(() => {
    const dist: Record<string, number> = {};
    bottleneckChartData.forEach((data) => {
      if (!dist[data.severity]) {
        dist[data.severity] = 0;
      }
      dist[data.severity] += data.count;
    });
    return Object.entries(dist).map(([severity, count]) => ({
      severity: severity === 'high' ? '높음' : severity === 'medium' ? '중간' : '낮음',
      count,
    }));
  }, [bottleneckChartData]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6 bg-gray-50">
      {/* 정지코드 분석 */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-lg font-bold text-gray-800 mb-4">
          📊 정지코드 분석 (상위 6가지)
        </h2>

        {stopCodeChartData.length > 0 ? (
          <div className="space-y-6">
            {/* 정지코드 막대 차트 */}
            <div>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={stopCodeChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="code" angle={-45} textAnchor="end" height={80} />
                  <YAxis />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#f9fafb',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                    }}
                    formatter={(value) => [`${value}회`, '정지']}
                  />
                  <Bar dataKey="count" fill="#EF4444" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* 카테고리별 분포 파이 차트 */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-700">카테고리별 분포</h3>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={categoryDistribution}
                    dataKey="count"
                    nameKey="category"
                    cx="50%"
                    cy="50%"
                    outerRadius={60}
                    label
                  >
                    {categoryDistribution.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => `${value}회`} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* 상세 리스트 */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-700">상세 정지코드</h3>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {stopCodeChartData
                  .sort((a, b) => b.count - a.count)
                  .map((data) => (
                    <div key={data.code} className="flex items-center justify-between p-2 hover:bg-gray-100 rounded text-sm">
                      <div className="flex-1">
                        <span className="font-medium text-gray-700">{data.code}</span>
                        <span className="text-gray-600 ml-2">{data.name}</span>
                      </div>
                      <span className="font-bold text-red-600">{data.count}회</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">정지 데이터가 없습니다.</p>
        )}
      </div>

      {/* 병목코드 분석 */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-lg font-bold text-gray-800 mb-4">
          🚧 병목코드 분석 (상위 10가지)
        </h2>

        {bottleneckChartData.length > 0 ? (
          <div className="space-y-6">
            {/* 병목코드 막대 차트 */}
            <div>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={bottleneckChartData.sort((a, b) => b.count - a.count).slice(0, 10)}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="code" angle={-45} textAnchor="end" height={80} />
                  <YAxis />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#f9fafb',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                    }}
                    formatter={(value) => [`${value}건`, '병목']}
                  />
                  <Bar dataKey="count" fill="#F97316" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* 심각도별 분포 */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-700">심각도별 분포</h3>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={severityDistribution}
                    dataKey="count"
                    nameKey="severity"
                    cx="50%"
                    cy="50%"
                    outerRadius={60}
                    label
                  >
                    <Cell fill="#EF4444" />
                    <Cell fill="#EAB308" />
                    <Cell fill="#22C55E" />
                  </Pie>
                  <Tooltip formatter={(value) => `${value}건`} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* 상세 리스트 */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-700">상위 병목항목</h3>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {bottleneckChartData
                  .sort((a, b) => b.count - a.count)
                  .slice(0, 10)
                  .map((data) => {
                    const severityColor =
                      data.severity === 'high'
                        ? 'bg-red-100 text-red-800'
                        : data.severity === 'medium'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-green-100 text-green-800';

                    return (
                      <div key={data.code} className="flex items-center justify-between p-2 hover:bg-gray-100 rounded text-sm">
                        <div className="flex-1">
                          <span className="font-medium text-gray-700">{data.code}</span>
                          <span className="text-gray-600 ml-2">{data.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${severityColor}`}>
                            {data.severity}
                          </span>
                          <span className="font-bold text-orange-600 w-8 text-right">{data.count}</span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">병목 데이터가 없습니다.</p>
        )}
      </div>
    </div>
  );
};

export default StopAndBottleneckChart;
