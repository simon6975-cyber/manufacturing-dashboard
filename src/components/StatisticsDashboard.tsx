// src/components/StatisticsDashboard.tsx
'use client';

import React, { useMemo } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { Process, DailyStatistics } from ../../lib/types';
import { TrendingUp, TrendingDown, AlertTriangle, Gauge } from 'lucide-react';

interface StatisticsDashboardProps {
  processes: Process[];
  statistics: DailyStatistics[];
  efficiencyData?: Record<number, number>;
}

const StatisticsDashboard: React.FC<StatisticsDashboardProps> = ({
  processes,
  statistics,
  efficiencyData = {},
}) => {
  // 공정별 효율성 데이터
  const processEfficiencyData = useMemo(() => {
    return processes.map((p) => ({
      no: p.no,
      name: p.jiheung.substring(0, 15),
      efficiency: efficiencyData[p.no] ?? 95,
    }));
  }, [processes, efficiencyData]);

  // 시간대별 통계
  const timeSeriesData = useMemo(() => {
    return statistics.map((stat) => ({
      date: stat.date,
      downtime: stat.total_downtime_minutes || 0,
      stoppages: stat.total_stoppages || 0,
      efficiency: 100 - (stat.total_downtime_minutes / (24 * 60)) * 100,
    }));
  }, [statistics]);

  // 종합 통계
  const summary = useMemo(() => {
    const totalStats = statistics.reduce(
      (acc, stat) => ({
        totalStoppages: acc.totalStoppages + (stat.total_stoppages || 0),
        totalDowntime: acc.totalDowntime + (stat.total_downtime_minutes || 0),
        avgEfficiency: acc.avgEfficiency + (100 - (stat.total_downtime_minutes || 0) / (24 * 60) * 100),
      }),
      { totalStoppages: 0, totalDowntime: 0, avgEfficiency: 0 }
    );

    return {
      totalStoppages: totalStats.totalStoppages,
      totalDowntime: totalStats.totalDowntime,
      avgEfficiency: statistics.length > 0 ? totalStats.avgEfficiency / statistics.length : 100,
      averageStoppagePerDay: statistics.length > 0 ? totalStats.totalStoppages / statistics.length : 0,
    };
  }, [statistics]);

  return (
    <div className="space-y-6 p-6 bg-gray-50">
      {/* KPI 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 총 정지횟수 */}
        <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-red-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm">총 정지 횟수</p>
              <p className="text-3xl font-bold text-gray-800 mt-1">{summary.totalStoppages}</p>
              <p className="text-xs text-gray-500 mt-2">
                일평균: {summary.averageStoppagePerDay.toFixed(1)}회
              </p>
            </div>
            <AlertTriangle className="w-10 h-10 text-red-500 opacity-20" />
          </div>
        </div>

        {/* 총 가동정지시간 */}
        <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-orange-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm">총 정지 시간</p>
              <p className="text-3xl font-bold text-gray-800 mt-1">
                {(summary.totalDowntime / 60).toFixed(1)}
              </p>
              <p className="text-xs text-gray-500 mt-2">시간 단위</p>
            </div>
            <TrendingDown className="w-10 h-10 text-orange-500 opacity-20" />
          </div>
        </div>

        {/* 평균 효율성 */}
        <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm">평균 효율성</p>
              <p className="text-3xl font-bold text-gray-800 mt-1">
                {Math.round(summary.avgEfficiency)}%
              </p>
              <p className="text-xs text-gray-500 mt-2">
                {summary.avgEfficiency >= 85 ? '👍 양호' : summary.avgEfficiency >= 70 ? '⚠️ 주의' : '❌ 나쁨'}
              </p>
            </div>
            <Gauge className="w-10 h-10 text-green-500 opacity-20" />
          </div>
        </div>

        {/* 분석 기간 */}
        <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm">분석 기간</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">{statistics.length}</p>
              <p className="text-xs text-gray-500 mt-2">일 기준 데이터</p>
            </div>
            <TrendingUp className="w-10 h-10 text-blue-500 opacity-20" />
          </div>
        </div>
      </div>

      {/* 공정별 효율성 비교 */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-lg font-bold text-gray-800 mb-4">📈 공정별 효율성</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={processEfficiencyData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="no" />
            <YAxis domain={[0, 100]} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#f9fafb',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
              }}
              formatter={(value) => [`${Math.round(value as number)}%`, '효율성']}
              labelFormatter={(label) => `공정 #${label}`}
            />
            <Bar dataKey="efficiency" radius={[8, 8, 0, 0]}>
              {processEfficiencyData.map((data) => (
                <Cell
                  key={`cell-${data.no}`}
                  fill={
                    data.efficiency >= 85
                      ? '#22C55E'
                      : data.efficiency >= 70
                      ? '#EAB308'
                      : '#EF4444'
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* 시간대별 정지 & 효율성 추이 */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-lg font-bold text-gray-800 mb-4">📊 시간대별 정지 및 효율성 추이</h2>
        {timeSeriesData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={timeSeriesData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                angle={-45}
                textAnchor="end"
                height={80}
                tick={{ fontSize: 12 }}
              />
              <YAxis yAxisId="left" />
              <YAxis yAxisId="right" orientation="right" domain={[0, 100]} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#f9fafb',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                }}
              />
              <Legend />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="downtime"
                stroke="#EF4444"
                name="정지시간(분)"
                strokeWidth={2}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="efficiency"
                stroke="#22C55E"
                name="효율성(%)"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-gray-500 text-center py-8">데이터가 없습니다.</p>
        )}
      </div>

      {/* 효율성 분포 */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-lg font-bold text-gray-800 mb-4">🎯 효율성 레벨 분포</h2>
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-green-50 rounded-lg p-4 border-l-4 border-green-500">
            <p className="text-gray-600 text-sm font-medium">우수 (≥85%)</p>
            <p className="text-2xl font-bold text-green-600 mt-2">
              {processEfficiencyData.filter((p) => p.efficiency >= 85).length}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {(
                (processEfficiencyData.filter((p) => p.efficiency >= 85).length /
                  processEfficiencyData.length) *
                100
              ).toFixed(0)}
              % 공정
            </p>
          </div>

          <div className="bg-yellow-50 rounded-lg p-4 border-l-4 border-yellow-500">
            <p className="text-gray-600 text-sm font-medium">주의 (70-85%)</p>
            <p className="text-2xl font-bold text-yellow-600 mt-2">
              {processEfficiencyData.filter((p) => p.efficiency >= 70 && p.efficiency < 85).length}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {(
                (processEfficiencyData.filter(
                  (p) => p.efficiency >= 70 && p.efficiency < 85
                ).length / processEfficiencyData.length) *
                100
              ).toFixed(0)}
              % 공정
            </p>
          </div>

          <div className="bg-red-50 rounded-lg p-4 border-l-4 border-red-500">
            <p className="text-gray-600 text-sm font-medium">저조 (&lt;70%)</p>
            <p className="text-2xl font-bold text-red-600 mt-2">
              {processEfficiencyData.filter((p) => p.efficiency < 70).length}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {(
                (processEfficiencyData.filter((p) => p.efficiency < 70).length /
                  processEfficiencyData.length) *
                100
              ).toFixed(0)}
              % 공정
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StatisticsDashboard;
