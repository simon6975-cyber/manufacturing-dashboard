// src/store/useAppStore.ts
import { create } from 'zustand';
import { Process, StopCode, BottleneckCode, DailyStatistics } from '@/lib/types';

interface AppState {
  // 데이터
  processes: Process[];
  stopCodes: StopCode[];
  bottleneckCodes: BottleneckCode[];
  statistics: DailyStatistics | null;

  // UI 상태
  isLoading: boolean;
  selectedProcessNo: number | null;
  selectedStopCode: string | null;
  dateRange: { start: Date; end: Date } | null;
  viewMode: 'overview' | 'detail' | 'analytics';

  // 액션
  setProcesses: (processes: Process[]) => void;
  setStopCodes: (codes: StopCode[]) => void;
  setBottleneckCodes: (codes: BottleneckCode[]) => void;
  setStatistics: (stats: DailyStatistics | null) => void;
  setIsLoading: (loading: boolean) => void;
  setSelectedProcess: (processNo: number | null) => void;
  setSelectedStopCode: (code: string | null) => void;
  setDateRange: (range: { start: Date; end: Date } | null) => void;
  setViewMode: (mode: 'overview' | 'detail' | 'analytics') => void;
  reset: () => void;
}

const useAppStore = create<AppState>((set) => ({
  // 초기값
  processes: [],
  stopCodes: [],
  bottleneckCodes: [],
  statistics: null,
  isLoading: false,
  selectedProcessNo: null,
  selectedStopCode: null,
  dateRange: null,
  viewMode: 'overview',

  // 액션
  setProcesses: (processes) => set({ processes }),
  setStopCodes: (stopCodes) => set({ stopCodes }),
  setBottleneckCodes: (bottleneckCodes) => set({ bottleneckCodes }),
  setStatistics: (statistics) => set({ statistics }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setSelectedProcess: (selectedProcessNo) => set({ selectedProcessNo }),
  setSelectedStopCode: (selectedStopCode) => set({ selectedStopCode }),
  setDateRange: (dateRange) => set({ dateRange }),
  setViewMode: (viewMode) => set({ viewMode }),
  reset: () =>
    set({
      processes: [],
      stopCodes: [],
      bottleneckCodes: [],
      statistics: null,
      isLoading: false,
      selectedProcessNo: null,
      selectedStopCode: null,
      dateRange: null,
      viewMode: 'overview',
    }),
}));

export default useAppStore;
