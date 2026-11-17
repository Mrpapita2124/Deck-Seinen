export type CloudProvider = "gdrive" | "onedrive" | "dropbox";

export const PROVIDER_LABELS: Record<CloudProvider, string> = {
  gdrive: "Google Drive",
  onedrive: "OneDrive",
  dropbox: "DropBox",
};

export interface LocalSync {
  id: string;
  name: string;
  provider: CloudProvider;
  driveFolder: string;
  localPath: string;
  ignoredPaths?: string[];
  isGameSave?: boolean;
  gameSource?: string;
  emulatorName?: string;
  systemName?: string;
  coverDataUrl?: string | null;
  lastPushDevice?: string;
  lastPushAt?: string;
  lastPulledAt?: string;
  fileCount?: number;
}

export interface CloudGameMeta {
  id: string;
  name: string;
  provider: CloudProvider;
  driveFolder: string;
  lastPushDevice?: string;
  lastPushAt?: string;
  lastPulledAt?: string;
  fileCount?: number;
  ignoredPaths?: string[];
  coverDataUrl?: string | null;
  isGameSave?: boolean;
  gameSource?: string;
  emulatorName?: string;
  systemName?: string;
}

export interface DetectedGameItem {
  id: string;
  name: string;
  localPath: string;
  source: "pc" | "emulation";
  emulatorName?: string | null;
  systemName?: string | null;
  coverUrl?: string | null;
}

export interface PathDetectionResult {
  detected: boolean;
  path: string | null;
  reason: string;
}

export interface DirEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
}

export interface DirectoryListing {
  currentPath: string;
  parentPath: string;
  bookmarks: Array<{ label: string; path: string }>;
  entries: DirEntry[];
}

export interface DdgImageResult {
  title: string;
  imageUrl: string;
  thumbUrl: string;
  width: number;
  height: number;
}

export interface PluginState {
  deviceName: string;
  connectedServices: Record<CloudProvider, boolean>;
  localSyncs: LocalSync[];
}

export interface SyncProgress {
  active: boolean;
  syncId: string | null;
  syncName: string;
  operation: "push" | "pull" | "";
  percent: number;
  detail: string;
  index: number;
  total: number;
}
