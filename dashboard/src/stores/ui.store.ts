import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface ScopeSelection {
  type: 'global' | 'project';
  projectId?: string;
  projectName?: string;
}

interface UIState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  scope: ScopeSelection;
  setScope: (scope: ScopeSelection) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      scope: { type: 'global' },
      setScope: (scope) => set({ scope }),
    }),
    {
      name: 'agent-memory-ui',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
