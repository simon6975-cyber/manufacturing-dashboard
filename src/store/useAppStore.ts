// src/store/useAppStore.ts
import { create } from 'zustand';

interface AppStore {
  selectedProcessNo: number | null;
  setSelectedProcess: (processNo: number | null) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

const useAppStore = create<AppStore>((set) => ({
  selectedProcessNo: null,
  setSelectedProcess: (processNo) => set({ selectedProcessNo: processNo }),
  isLoading: false,
  setIsLoading: (loading) => set({ isLoading: loading }),
}));

export default useAppStore;