import { callable } from "@decky/api";
import type {
  CloudGameMeta,
  CloudProvider,
  DdgImageResult,
  DetectedGameItem,
  DirectoryListing,
  PathDetectionResult,
  PluginState,
} from "./types";

export const api = {
  getState: callable<[], PluginState>("get_state"),
  refreshLocalStatuses: callable<[], PluginState>("refresh_local_statuses"),
  setDeviceName: callable<[deviceName: string], { ok: boolean; deviceName: string }>("set_device_name"),

  startAuth: callable<
    [provider: CloudProvider],
    { ok: boolean; authUrl?: string | null; qrUrl?: string | null; done?: boolean; error?: string | null }
  >("start_auth"),
  pollAuth: callable<
    [provider: CloudProvider],
    { done: boolean; connected: boolean; authUrl?: string | null; qrUrl?: string | null; error?: string | null }
  >("poll_auth"),
  completeAuthRedirect: callable<
    [provider: CloudProvider, redirectUrl: string],
    { ok: boolean; connected?: boolean; error?: string }
  >("complete_auth_redirect"),
  cancelAuth: callable<[provider: CloudProvider], { ok: boolean }>("cancel_auth"),
  logoutProvider: callable<
    [provider: CloudProvider],
    { ok: boolean; connectedServices: Record<CloudProvider, boolean> }
  >("logout_provider"),

  listCloudGameSyncs: callable<[], CloudGameMeta[]>("list_cloud_game_syncs"),
  detectCloudGamePaths: callable<
    [syncs: CloudGameMeta[]],
    Record<string, PathDetectionResult>
  >("detect_cloud_game_paths"),
  linkAndPullSyncs: callable<
    [items: Array<{ meta: CloudGameMeta; localPath: string }>],
    { ok: boolean; results: Array<{ id: string; ok: boolean; error?: string }>; state: PluginState }
  >("link_and_pull_syncs"),

  scanLocalGames: callable<[], DetectedGameItem[]>("scan_local_games"),
  uploadScannedGames: callable<
    [items: Array<{ game: DetectedGameItem; provider: CloudProvider }>],
    { ok: boolean; results: Array<{ id: string; ok: boolean; error?: string }>; state: PluginState }
  >("upload_scanned_games"),
  createManualSync: callable<
    [params: {
      name: string;
      folderPath: string;
      selectedFiles: string[];
      provider: CloudProvider;
      coverUrl?: string | null;
    }],
    { ok: boolean; error?: string; state?: PluginState }
  >("create_manual_sync"),

  pushSync: callable<[syncId: string], { ok: boolean; error?: string; state: PluginState }>("push_sync"),
  pullSync: callable<[syncId: string], { ok: boolean; error?: string; state: PluginState }>("pull_sync"),
  smartSync: callable<[syncId: string], { ok: boolean; error?: string; state: PluginState }>("smart_sync"),
  deleteSync: callable<
    [syncId: string, deleteFromCloud: boolean],
    { ok: boolean; error?: string; state: PluginState }
  >("delete_sync"),

  listDirectory: callable<[path?: string], DirectoryListing>("list_directory"),
  searchDdgImages: callable<[query: string], DdgImageResult[]>("search_ddg_images"),
};
