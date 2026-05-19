// src/lib/types.ts

export interface Process {
  id: string;
  no: number; // 1-19
  gubun: string; // 네거, 표지, 제본
  jiheung: string; // 작업명
  model: string; // 기계모델
  jechasa: string; // 제작사
  timestamp: Date;
}

export interface StopCode {
  id: string;
  code: string; // A01, A02, ...
  name: string; // 정지 사유명
  category: 'machinery' | 'material' | 'manpower' | 'method' | 'environment' | 'other';
  description?: string;
  timestamp: Date;
}

export interface BottleneckCode {
  id: string;
  bn_code: string; // BN01, BN02, ...
  bn_name: string; // 병목 항목명
  process_no: number; // 해당 공정 번호
  severity: 'high' | 'medium' | 'low';
  description?: string;
  timestamp: Date;
}

export interface StopageRecord {
  id: string;
  process_no: number;
  stop_code: string;
  bn_code?: string;
  duration_minutes: number;
  timestamp: Date;
  notes?: string;
}

export interface DailyStatistics {
  id: string;
  date: string; // YYYY-MM-DD
  total_processes: number;
  total_stoppages: number;
  total_downtime_minutes: number;
  stop_code_counts: Record<string, number>;
  bottleneck_counts: Record<string, number>;
  process_efficiency: Record<number, number>; // 공정별 가동률
  timestamp: Date;
}

export interface ProcessFlowNode {
  no: number;
  name: string;
  model: string;
  status: 'normal' | 'stopped' | 'warning';
  efficiency: number; // 0-100
}

export interface AnalyticsData {
  period: 'daily' | 'weekly' | 'monthly';
  totalDowntime: number;
  topStopCodes: Array<{
    code: string;
    name: string;
    count: number;
    percentage: number;
  }>;
  topBottlenecks: Array<{
    code: string;
    name: string;
    process: number;
    count: number;
  }>;
  processEfficiency: Array<{
    processNo: number;
    processName: string;
    efficiency: number;
  }>;
}

export interface UserSettings {
  id: string;
  userId: string;
  theme: 'light' | 'dark';
  notifications: boolean;
  timezone: string;
  language: 'ko' | 'en' | 'ja';
  timestamp: Date;
}
