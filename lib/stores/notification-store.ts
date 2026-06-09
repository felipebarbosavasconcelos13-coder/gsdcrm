import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface NotificationState {
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, 'id'>) => string;
  removeNotification: (id: string) => void;
  clearAll: () => void;
}

export const useNotificationStore = create<NotificationState>()(
  devtools(
    (set, get) => ({
      notifications: [],

      addNotification: notification => {
        const id = crypto.randomUUID();
        set(state => ({
          notifications: [...state.notifications, { ...notification, id }],
        }));

        const duration = notification.duration ?? 5000;
        if (duration > 0) {
          setTimeout(() => {
            get().removeNotification(id);
          }, duration);
        }

        return id;
      },

      removeNotification: id =>
        set(state => ({
          notifications: state.notifications.filter(n => n.id !== id),
        })),

      clearAll: () => set({ notifications: [] }),
    }),
    { name: 'notification-store' }
  )
);

export const useNotifications = () => useNotificationStore(state => state.notifications);
