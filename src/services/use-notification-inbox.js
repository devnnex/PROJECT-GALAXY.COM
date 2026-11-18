import { useMemo, useSyncExternalStore } from 'react';
import { createNotificationInbox, mergeNotificationRows } from './notification-inbox';

export function useNotificationInbox(userId, acknowledge) {
  const store = useMemo(() => createNotificationInbox({ acknowledge }), [userId, acknowledge]);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const visible = useMemo(() => mergeNotificationRows(state.reading, state.items), [state.reading, state.items]);
  return { ...state, visible, unread: state.items.filter((row) => !row.readAt).length,
    setItems: store.setItems, getVersion: store.getVersion, readAll: store.readAll, openPanel: store.open, close: store.close, toggle: store.toggle };
}
