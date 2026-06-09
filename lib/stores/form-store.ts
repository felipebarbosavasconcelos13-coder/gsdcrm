import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

interface FormDraft {
  data: Record<string, unknown>;
  savedAt: number;
}

interface FormState {
  drafts: Record<string, FormDraft>;
  saveDraft: (formId: string, data: Record<string, unknown>) => void;
  getDraft: (formId: string) => FormDraft | null;
  clearDraft: (formId: string) => void;
  clearAllDrafts: () => void;

  submitting: Record<string, boolean>;
  setSubmitting: (formId: string, submitting: boolean) => void;
  isSubmitting: (formId: string) => boolean;
}

export const useFormStore = create<FormState>()(
  devtools(
    persist(
      (set, get) => ({
        drafts: {},
        saveDraft: (formId, data) =>
          set(state => ({
            drafts: {
              ...state.drafts,
              [formId]: { data, savedAt: Date.now() },
            },
          })),
        getDraft: formId => get().drafts[formId] ?? null,
        clearDraft: formId =>
          set(state => {
            const drafts = { ...state.drafts };
            delete drafts[formId];
            return { drafts };
          }),
        clearAllDrafts: () => set({ drafts: {} }),

        submitting: {},
        setSubmitting: (formId, submitting) =>
          set(state => ({
            submitting: { ...state.submitting, [formId]: submitting },
          })),
        isSubmitting: formId => get().submitting[formId] ?? false,
      }),
      {
        name: 'form-drafts',
        partialize: state => ({ drafts: state.drafts }),
      }
    ),
    { name: 'form-store' }
  )
);

export const useFormDraft = (formId: string) => useFormStore(state => state.drafts[formId] ?? null);
export const useIsFormSubmitting = (formId: string) =>
  useFormStore(state => state.submitting[formId] ?? false);
