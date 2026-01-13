import { create } from 'zustand';

interface PreferencesState {
  theme: 'dark' | 'light';
  language: 'pl' | 'en';
  setTheme: (theme: 'dark' | 'light') => void;
  setLanguage: (language: 'pl' | 'en') => void;
}

export const usePreferencesStore = create<PreferencesState>((set) => ({
  theme: 'dark',
  language: 'pl',
  setTheme: (theme) => set({ theme }),
  setLanguage: (language) => set({ language }),
}));
