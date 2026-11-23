import { create } from "zustand";

export type ViewType =
  | "dashboard"
  | "students"
  | "teachers"
  | "classes"
  | "attendance"
  | "exams"
  | "marks"
  | "reports"
  | "performance-reports"
  | "grading"
  | "my-profile"
  | "settings";

interface AppState {
  currentView: ViewType;
  sidebarOpen: boolean;
  selectedExamId: string | null;
  setCurrentView: (view: ViewType) => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setSelectedExamId: (id: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentView: "dashboard",
  sidebarOpen: false,
  selectedExamId: null,
  setCurrentView: (view) => {
    set({ currentView: view, sidebarOpen: false });
  },
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSelectedExamId: (id) => set({ selectedExamId: id }),
}));
