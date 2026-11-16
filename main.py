import os
import re
import sys
import uuid
import asyncio
from typing import Any, Dict, List, Optional

_PLUGIN_DIR = os.path.dirname(os.path.abspath(__file__))
if _PLUGIN_DIR not in sys.path:
    sys.path.insert(0, _PLUGIN_DIR)

import decky

from py_modules.rclone_manager import RcloneManager, GAME_SAVES_ROOT
from py_modules.game_scanner import (
    scan_local_game_saves,
    detect_cloud_game_paths,
    list_directory as fs_list_directory,
)
from py_modules.cover_search import (
    search_duckduckgo_images,
    download_image_as_data_url,
    populate_covers_parallel,
)


def _safe_folder_name(name: str) -> str:
    cleaned = re.sub(r'[<>:"/\\|?*]+', "_", (name or "Sync").strip())
    return cleaned or "Sync"


class Plugin:
    manager: RcloneManager

    async def _main(self):
        self.manager = RcloneManager(
            settings_dir=decky.DECKY_PLUGIN_SETTINGS_DIR,
            runtime_dir=decky.DECKY_PLUGIN_RUNTIME_DIR,
            plugin_dir=decky.DECKY_PLUGIN_DIR,
            logger=decky.logger,
        )
        decky.logger.info("DeckSeinen backend iniciado.")

    async def _unload(self):
        decky.logger.info("DeckSeinen backend descargado.")

    async def _uninstall(self):
        try:
            rclone_conf = os.path.join(decky.DECKY_PLUGIN_SETTINGS_DIR, "rclone.conf")
            if os.path.isfile(rclone_conf):
                os.remove(rclone_conf)
                decky.logger.info("rclone.conf eliminado al desinstalar DeckSeinen.")
        except Exception as exc:
            decky.logger.warning(f"No se pudo eliminar rclone.conf al desinstalar: {exc}")

    async def get_state(self) -> Dict[str, Any]:
        cfg = self.manager.load_config()
        connected = self.manager.get_connected_services()
        mappings = cfg.get("localMappings") or {}
        device_name = cfg.get("deviceName") or "Steam Deck"

        # Solo devolver las sincronizaciones creadas o vinculadas en esta Steam Deck
        local_syncs = list(mappings.values())
        return {
            "deviceName": device_name,
            "connectedServices": connected,
            "localSyncs": local_syncs,
        }

    async def refresh_local_statuses(self) -> Dict[str, Any]:
        """Consulta metadata en la nube únicamente para las syncs ya vinculadas en esta Steam Deck."""
        cfg = self.manager.load_config()
        mappings = cfg.get("localMappings") or {}
        if not mappings:
            return await self.get_state()

        cloud_metas = await asyncio.to_thread(self.manager.list_cloud_metadatas)
        by_id = {m.get("id"): m for m in cloud_metas if m.get("id")}
        updated = False
        for sync_id, mapping in mappings.items():
            cm = by_id.get(sync_id)
            if cm:
                mapping["lastPushDevice"] = cm.get("lastPushDevice", mapping.get("lastPushDevice"))
                mapping["lastPushAt"] = cm.get("lastPushAt", mapping.get("lastPushAt"))
                mapping["fileCount"] = cm.get("fileCount", mapping.get("fileCount"))
                if cm.get("coverDataUrl"):
                    mapping["coverDataUrl"] = cm.get("coverDataUrl")
                updated = True
        if updated:
            cfg["localMappings"] = mappings
            self.manager.save_config(cfg)
        return await self.get_state()

    async def set_device_name(self, device_name: str) -> Dict[str, Any]:
        cfg = self.manager.load_config()
        clean = (device_name or "").strip() or "Steam Deck"
        cfg["deviceName"] = clean
        self.manager.save_config(cfg)
        return {"ok": True, "deviceName": clean}

    async def start_auth(self, provider: str) -> Dict[str, Any]:
        return await asyncio.to_thread(self.manager.start_auth, provider)

    async def poll_auth(self, provider: str) -> Dict[str, Any]:
        return await asyncio.to_thread(self.manager.poll_auth, provider)

    async def cancel_auth(self, provider: str) -> Dict[str, Any]:
        await asyncio.to_thread(self.manager.cancel_auth, provider)
        return {"ok": True}

    async def logout_provider(self, provider: str) -> Dict[str, Any]:
        return await asyncio.to_thread(self.manager.logout_provider, provider)

    async def list_cloud_game_syncs(self) -> List[Dict[str, Any]]:
        try:
            cfg = self.manager.load_config()
            local_ids = set((cfg.get("localMappings") or {}).keys())
            cloud_metas = await asyncio.to_thread(self.manager.list_cloud_metadatas)
            # En Sync here aparecen las existentes en la nube marcadas como videojuego
            games = []
            for m in cloud_metas:
                if bool(m.get("isGameSave")) and m.get("id") not in local_ids:
                    games.append(m)
            games.sort(key=lambda x: str(x.get("name") or "").lower())
            try:
                await asyncio.to_thread(populate_covers_parallel, games, 30)
            except Exception as exc:
                decky.logger.warning(f"Error cargando portadas en list_cloud_game_syncs: {exc}")
            for g in games:
                if not g.get("coverDataUrl") and g.get("coverUrl"):
                    g["coverDataUrl"] = g["coverUrl"]
            return games
        except Exception as exc:
            decky.logger.exception(f"Error en list_cloud_game_syncs: {exc}")
            return []

    async def detect_cloud_game_paths(self, syncs: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
        try:
            return await asyncio.to_thread(detect_cloud_game_paths, syncs)
        except Exception as exc:
            decky.logger.exception(f"Error en detect_cloud_game_paths: {exc}")
            return {}

    async def get_sync_progress(self) -> Dict[str, Any]:
        return self.manager.get_progress()

    async def link_and_pull_syncs(self, items: List[Dict[str, Any]]) -> Dict[str, Any]:
        """items: [{ meta, localPath }]"""
        cfg = self.manager.load_config()
        mappings = cfg.get("localMappings") or {}
        results = []
        total = len(items)

        try:
            for idx, item in enumerate(items, start=1):
                self.manager.set_batch_context(idx, total)
                meta = item.get("meta") or {}
                local_path = (item.get("localPath") or "").strip()
                sync_id = str(meta.get("id") or "")
                if not sync_id or not local_path:
                    continue

                mappings[sync_id] = {
                    "id": sync_id,
                    "name": meta.get("name") or "Juego",
                    "provider": meta.get("provider") or "gdrive",
                    "driveFolder": meta.get("driveFolder") or "",
                    "localPath": local_path,
                    "ignoredPaths": meta.get("ignoredPaths") or [],
                    "isGameSave": True,
                    "gameSource": meta.get("gameSource"),
                    "emulatorName": meta.get("emulatorName"),
                    "systemName": meta.get("systemName"),
                    "coverDataUrl": meta.get("coverDataUrl"),
                    "lastPushDevice": meta.get("lastPushDevice") or "",
                    "lastPushAt": meta.get("lastPushAt") or "",
                    "fileCount": meta.get("fileCount") or 0,
                }
                cfg["localMappings"] = mappings
                self.manager.save_config(cfg)

                pull_res = await asyncio.to_thread(self.manager.pull_sync, sync_id)
                results.append({"id": sync_id, "ok": pull_res.get("ok", False), "error": pull_res.get("error")})
        finally:
            self.manager.clear_batch_context()

        return {"ok": True, "results": results, "state": await self.get_state()}

    async def scan_local_games(self) -> List[Dict[str, Any]]:
        return await asyncio.to_thread(scan_local_game_saves, True)

    async def upload_scanned_games(self, items: List[Dict[str, Any]]) -> Dict[str, Any]:
        """items: [{ game, provider }]"""
        cfg = self.manager.load_config()
        mappings = cfg.get("localMappings") or {}
        results = []
        total = len(items)

        try:
            for idx, item in enumerate(items, start=1):
                self.manager.set_batch_context(idx, total)
                game = item.get("game") or {}
                provider = item.get("provider") or "gdrive"
                name = str(game.get("name") or "Juego").strip()
                local_path = str(game.get("localPath") or "").strip()
                if not local_path:
                    continue

                sync_id = str(uuid.uuid4())
                drive_folder = f"{GAME_SAVES_ROOT}/{_safe_folder_name(name)}"
                cover_data_url = None
                if game.get("coverUrl"):
                    cover_data_url = await asyncio.to_thread(download_image_as_data_url, game["coverUrl"])

                mappings[sync_id] = {
                    "id": sync_id,
                    "name": name,
                    "provider": provider,
                    "driveFolder": drive_folder,
                    "localPath": local_path,
                    "ignoredPaths": [],
                    "isGameSave": True,
                    "gameSource": game.get("source"),
                    "emulatorName": game.get("emulatorName"),
                    "systemName": game.get("systemName"),
                    "coverDataUrl": cover_data_url,
                    "lastPushDevice": cfg.get("deviceName") or "Steam Deck",
                    "lastPushAt": "",
                    "fileCount": 0,
                }
                cfg["localMappings"] = mappings
                self.manager.save_config(cfg)

                push_res = await asyncio.to_thread(self.manager.push_sync, sync_id)
                results.append({"id": sync_id, "ok": push_res.get("ok", False), "error": push_res.get("error")})
        finally:
            self.manager.clear_batch_context()

        return {"ok": True, "results": results, "state": await self.get_state()}

    async def create_manual_sync(self, params: Dict[str, Any]) -> Dict[str, Any]:
        name = str(params.get("name") or "").strip()
        folder_path = str(params.get("folderPath") or "").strip()
        selected_files: List[str] = params.get("selectedFiles") or []
        provider = str(params.get("provider") or "gdrive")
        cover_url = params.get("coverUrl")

        if not name or not folder_path:
            return {"ok": False, "error": "Nombre y ruta son obligatorios."}

        # Si el usuario seleccionó archivos específicos, ignorar todos los demás archivos/subrutas de esa carpeta
        ignored_paths: List[str] = []
        if selected_files:
            selected_abs = {os.path.abspath(p) for p in selected_files}
            try:
                for entry in os.scandir(folder_path):
                    entry_abs = os.path.abspath(entry.path)
                    if entry_abs not in selected_abs:
                        ignored_paths.append(entry.name)
            except Exception as exc:
                return {"ok": False, "error": f"No se pudo leer la carpeta seleccionada: {exc}"}

        cover_data_url = None
        if cover_url:
            cover_data_url = await asyncio.to_thread(download_image_as_data_url, str(cover_url))

        cfg = self.manager.load_config()
        mappings = cfg.get("localMappings") or {}
        sync_id = str(uuid.uuid4())
        drive_folder = f"{GAME_SAVES_ROOT}/{_safe_folder_name(name)}"

        mappings[sync_id] = {
            "id": sync_id,
            "name": name,
            "provider": provider,
            "driveFolder": drive_folder,
            "localPath": folder_path,
            "ignoredPaths": ignored_paths,
            "isGameSave": True,
            "gameSource": "manual",
            "coverDataUrl": cover_data_url,
            "lastPushDevice": cfg.get("deviceName") or "Steam Deck",
            "lastPushAt": "",
            "fileCount": 0,
        }
        cfg["localMappings"] = mappings
        self.manager.save_config(cfg)

        push_res = await asyncio.to_thread(self.manager.push_sync, sync_id)
        if not push_res.get("ok"):
            return {"ok": False, "error": push_res.get("error")}

        return {"ok": True, "state": await self.get_state()}

    async def push_sync(self, sync_id: str) -> Dict[str, Any]:
        res = await asyncio.to_thread(self.manager.push_sync, sync_id)
        res["state"] = await self.get_state()
        return res

    async def pull_sync(self, sync_id: str) -> Dict[str, Any]:
        res = await asyncio.to_thread(self.manager.pull_sync, sync_id)
        res["state"] = await self.get_state()
        return res

    async def smart_sync(self, sync_id: str) -> Dict[str, Any]:
        cfg = self.manager.load_config()
        mapping = (cfg.get("localMappings") or {}).get(sync_id)
        if not mapping:
            return {"ok": False, "error": "Sincronización no encontrada."}
        device_name = cfg.get("deviceName") or "Steam Deck"
        last_dev = mapping.get("lastPushDevice") or ""
        if last_dev and last_dev != device_name:
            res = await asyncio.to_thread(self.manager.pull_sync, sync_id)
        else:
            res = await asyncio.to_thread(self.manager.push_sync, sync_id)
        res["state"] = await self.get_state()
        return res

    async def delete_sync(self, sync_id: str, delete_from_cloud: bool) -> Dict[str, Any]:
        res = await asyncio.to_thread(self.manager.delete_sync, sync_id, bool(delete_from_cloud))
        res["state"] = await self.get_state()
        return res

    async def list_directory(self, path: Optional[str] = None) -> Dict[str, Any]:
        return await asyncio.to_thread(fs_list_directory, path)

    async def search_ddg_images(self, query: str) -> List[Dict[str, Any]]:
        return await asyncio.to_thread(search_duckduckgo_images, query)
