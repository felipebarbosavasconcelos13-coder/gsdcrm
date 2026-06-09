import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';

interface UIState {
  sidebarOpen: boolean;
  toggleSidebar: () => void;

  aiAssistantOpen: boolean;
  setAIAssistantOpen: (open: boolean) => void;
  toggleAIAssistant: () => void;

  activeModal: string | null;
  modalData: Record<string, unknown>;
  openModal: (modalId: string, data?: Record<string, unknown>) => void;
  closeModal: () => void;

  globalSearchQuery: string;
  setGlobalSearchQuery: (query: string) => void;

  loadingStates: Record<string, boolean>;
  setLoading: (key: string, loading: boolean) => void;
  isLoading: (key: string) => boolean;
}

export const useUIStore = create<UIState>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      sidebarOpen: true,
      toggleSidebar: () => set(state => ({ sidebarOpen: !state.sidebarOpen })),

      aiAssistantOpen: false,
      setAIAssistantOpen: open => set({ aiAssistantOpen: open }),
      toggleAIAssistant: () => set(state => ({ aiAssistantOpen: !state.aiAssistantOpen })),

      activeModal: null,
      modalData: {},
      openModal: (modalId, data = {}) => set({ activeModal: modalId, modalData: data }),
      closeModal: () => set({ activeModal: null, modalData: {} }),

      globalSearchQuery: '',
      setGlobalSearchQuery: query => set({ globalSearchQuery: query }),

      loadingStates: {},
      setLoading: (key, loading) =>
        set(state => ({
          loadingStates: { ...state.loadingStates, [key]: loading },
        })),
      isLoading: key => get().loadingStates[key] ?? false,
    })),
    { name: 'ui-store' }
  )
);

export const useSidebarOpen = () => useUIStore(state => state.sidebarOpen);
export const useAIAssistantOpen = () => useUIStore(state => state.aiAssistantOpen);
export const useActiveModal = () => useUIStore(state => state.activeModal);
export const useModalData = () => useUIStore(state => state.modalData);
export const useGlobalSearch = () => useUIStore(state => state.globalSearchQuery);
