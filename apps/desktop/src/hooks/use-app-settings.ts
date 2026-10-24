import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { AppSettings } from '../lib/app-settings';
import { subscribeSettingsRequests } from '../native/app-settings';
import { type SettingsSnapshot, changeSettings, currentSettings, subscribeSettings } from '../state/settings-store';

/** The app's settings; the component re-renders when they change. */
export function useAppSettings(): SettingsSnapshot {
  return useSyncExternalStore(subscribeSettings, currentSettings);
}

export interface SettingsPanelState {
  readonly isOpen: boolean;
  readonly open: () => void;
  readonly close: () => void;
  readonly snapshot: SettingsSnapshot;
  readonly change: (change: Partial<AppSettings>) => void;
}

/** GP Editor ▸ Settings… (⌘,): the panel's open state and the settings it changes. */
export function useSettingsPanel(): SettingsPanelState {
  const [isOpen, setIsOpen] = useState(false);
  const snapshot = useAppSettings();
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  useEffect(() => subscribeSettingsRequests(open), [open]);
  // changeSettings shows its own failure in the panel.
  const change = useCallback((next: Partial<AppSettings>) => {
    void changeSettings(next);
  }, []);
  return { isOpen, open, close, snapshot, change };
}
