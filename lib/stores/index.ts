export { useUIStore, useSidebarOpen, useAIAssistantOpen, useActiveModal, useModalData, useGlobalSearch } from './ui-store';
export { useFormStore, useFormDraft, useIsFormSubmitting } from './form-store';
export { useNotificationStore, useNotifications } from './notification-store';
export type { Notification } from './notification-store';

import React from 'react';
import { useFormStore } from './form-store';

export const useFormDraftAutoSave = (
  formId: string,
  data: Record<string, unknown>,
  debounceMs = 1000
) => {
  const saveDraft = useFormStore(state => state.saveDraft);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (Object.keys(data).length > 0) {
        saveDraft(formId, data);
      }
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [formId, data, debounceMs, saveDraft]);
};
