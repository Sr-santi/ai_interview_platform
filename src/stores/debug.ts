import { create } from "zustand";

export type DebugSource = "STT" | "TTS" | "Interview" | "Room" | "LLM";

export interface DebugEntry {
  id: number;
  timestamp: number;
  source: DebugSource;
  event: string;
  data?: unknown;
}

interface DebugStore {
  entries: DebugEntry[];
  isOpen: boolean;
  addEntry: (source: DebugSource, event: string, data?: unknown) => void;
  toggle: () => void;
  clear: () => void;
}

let nextId = 0;
const MAX_ENTRIES = 200;

export const useDebugStore = create<DebugStore>((set) => ({
  entries: [],
  isOpen: false,

  addEntry: (source, event, data) => {
    const entry: DebugEntry = {
      id: nextId++,
      timestamp: performance.now(),
      source,
      event,
      data,
    };

    set((state) => {
      const entries = [...state.entries, entry];
      if (entries.length > MAX_ENTRIES) {
        return { entries: entries.slice(entries.length - MAX_ENTRIES) };
      }
      return { entries };
    });

    // Also log to console for devtools visibility
    const dataStr = data !== undefined ? ` ${JSON.stringify(data).slice(0, 200)}` : "";
    console.debug(
      `%c[${source}]%c ${event}${dataStr}`,
      "color: #6366f1; font-weight: bold",
      "color: inherit"
    );
  },

  toggle: () => set((s) => ({ isOpen: !s.isOpen })),

  clear: () => set({ entries: [] }),
}));

// Convenience: get store outside React (for use in non-hook contexts like DOM event handlers)
export const debug = {
  stt: (event: string, data?: unknown) =>
    useDebugStore.getState().addEntry("STT", event, data),
  tts: (event: string, data?: unknown) =>
    useDebugStore.getState().addEntry("TTS", event, data),
  interview: (event: string, data?: unknown) =>
    useDebugStore.getState().addEntry("Interview", event, data),
  room: (event: string, data?: unknown) =>
    useDebugStore.getState().addEntry("Room", event, data),
  llm: (event: string, data?: unknown) =>
    useDebugStore.getState().addEntry("LLM", event, data),
};
