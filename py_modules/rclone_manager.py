import json
import os
import re
import shutil
import stat
import subprocess
import tempfile
import threading
import time
import urllib.request
import zipfile
from typing import Any, Dict, List, Optional

METADATA_FOLDER = "_SyncSeinen_Metadata"
GAME_SAVES_ROOT = "SyncSeinen_games_saves"

PROVIDER_CONFIG: Dict[str, Dict[str, str]] = {
    "gdrive": {"remote": "syncseinen", "rclone_type": "drive", "label": "Google Drive"},
    "dropbox": {"remote": "syncseinen_dropbox", "rclone_type": "dropbox", "label": "Dropbox"},
    "onedrive": {"remote": "syncseinen_onedrive", "rclone_type": "onedrive", "label": "OneDrive"},
}


class RcloneManager:
    def __init__(self, settings_dir: str, runtime_dir: str, plugin_dir: str = "", logger: Any = None):
        self.settings_dir = settings_dir
        self.runtime_dir = runtime_dir
        self.plugin_dir = plugin_dir
        self.logger = logger
        os.makedirs(self.settings_dir, exist_ok=True)
        os.makedirs(self.runtime_dir, exist_ok=True)

        self.config_path = os.path.join(self.settings_dir, "config.json")
        self.rclone_conf_path = os.path.join(self.settings_dir, "rclone.conf")
        self._auth_lock = threading.Lock()
        self._auth_processes: Dict[str, Dict[str, Any]] = {}

    def _log(self, msg: str) -> None:
        if self.logger:
            try:
                self.logger.info(msg)
            except Exception:
                pass

    def ensure_rclone(self) -> str:
        runtime_bin = os.path.join(self.runtime_dir, "bin", "rclone")
        if os.path.isfile(runtime_bin) and os.access(runtime_bin, os.X_OK):
            return runtime_bin

        # 1. Usar binario integrado en el plugin (bin/rclone)
        if self.plugin_dir:
            bundled_bin = os.path.join(self.plugin_dir, "bin", "rclone")
            if os.path.isfile(bundled_bin):
                try:
                    os.chmod(bundled_bin, os.stat(bundled_bin).st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
                    if os.access(bundled_bin, os.X_OK):
                        return bundled_bin
                except Exception:
                    pass
                # Si la carpeta del plugin es de solo lectura, copiar al runtime_dir
                os.makedirs(os.path.dirname(runtime_bin), exist_ok=True)
                shutil.copy2(bundled_bin, runtime_bin)
                os.chmod(runtime_bin, os.stat(runtime_bin).st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
                return runtime_bin

        sys_rclone = shutil.which("rclone")
        if sys_rclone:
            return sys_rclone

        # 2. Fallback: descargar rclone oficial con User-Agent válido
        os.makedirs(os.path.dirname(runtime_bin), exist_ok=True)
        zip_path = os.path.join(self.runtime_dir, "rclone-linux.zip")
        url = "https://downloads.rclone.org/rclone-current-linux-amd64.zip"
        self._log(f"Descargando rclone desde {url}...")
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=60) as resp, open(zip_path, "wb") as out:
            shutil.copyfileobj(resp, out)
        with zipfile.ZipFile(zip_path, "r") as zf:
            for member in zf.namelist():
                if member.endswith("/rclone") or member == "rclone":
                    with zf.open(member) as src, open(runtime_bin, "wb") as dst:
                        shutil.copyfileobj(src, dst)
                    break
        if os.path.exists(zip_path):
            os.remove(zip_path)
        os.chmod(runtime_bin, os.stat(runtime_bin).st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
        return runtime_bin

    def load_config(self) -> Dict[str, Any]:
        default_cfg: Dict[str, Any] = {
            "deviceName": "Steam Deck",
            "localMappings": {},
        }
        if os.path.isfile(self.config_path):
            try:
                with open(self.config_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if isinstance(data, dict):
                    default_cfg.update(data)
            except Exception:
                pass
        if not isinstance(default_cfg.get("localMappings"), dict):
            default_cfg["localMappings"] = {}
        return default_cfg

    def save_config(self, cfg: Dict[str, Any]) -> None:
        with open(self.config_path, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2, ensure_ascii=False)

    def get_connected_services(self) -> Dict[str, bool]:
        result = {p: False for p in PROVIDER_CONFIG}
        if not os.path.isfile(self.rclone_conf_path):
            return result
        try:
            with open(self.rclone_conf_path, "r", encoding="utf-8") as f:
                content = f.read()
            for provider, info in PROVIDER_CONFIG.items():
                if f"[{info['remote']}]" in content:
                    result[provider] = True
        except Exception:
            pass
        return result

    def _run_rclone(self, args: List[str], timeout: int = 120) -> subprocess.CompletedProcess:
        rclone_bin = self.ensure_rclone()
        cmd = [rclone_bin, "--config", self.rclone_conf_path, *args]
        return subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )

    def start_auth(self, provider: str) -> Dict[str, Any]:
        if provider not in PROVIDER_CONFIG:
            return {"ok": False, "error": f"Proveedor no soportado: {provider}"}

        info = PROVIDER_CONFIG[provider]
        rclone_bin = self.ensure_rclone()
        self.cancel_auth(provider)

        proc = subprocess.Popen(
            [rclone_bin, "authorize", info["rclone_type"], "--auth-no-open-browser"],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )

        state: Dict[str, Any] = {
            "proc": proc,
            "url": None,
            "token": None,
            "done": False,
            "error": None,
            "provider": provider,
        }

        def _reader() -> None:
            output_lines: List[str] = []
            try:
                assert proc.stdout is not None
                for line in proc.stdout:
                    output_lines.append(line)
                    url_match = re.search(r"(http://(?:127\.0\.0\.1|localhost):\d+/auth[^\s]*)", line)
                    if url_match and not state["url"]:
                        state["url"] = url_match.group(1)
                proc.wait()
                full_out = "".join(output_lines)
                token_match = re.search(r"(\{\"access_token\".*?\})", full_out, re.DOTALL)
                if not token_match:
                    arrow_match = re.search(r"--->\s*(\{.*?\})\s*<---", full_out, re.DOTALL)
                    if arrow_match:
                        token_match = arrow_match
                if proc.returncode == 0 and token_match:
                    token_json = token_match.group(1).strip()
                    self._create_remote_with_token(provider, token_json)
                    state["token"] = token_json
                    state["done"] = True
                elif not state["error"]:
                    state["error"] = "Autenticación cancelada o incompleta."
                    state["done"] = True
            except Exception as exc:
                state["error"] = str(exc)
                state["done"] = True

        with self._auth_lock:
            self._auth_processes[provider] = state

        t = threading.Thread(target=_reader, daemon=True)
        t.start()

        deadline = time.time() + 10.0
        while time.time() < deadline and not state["url"] and not state["done"]:
            time.sleep(0.1)

        return {
            "ok": True,
            "authUrl": state["url"],
            "done": state["done"],
            "error": state["error"],
        }

    def _create_remote_with_token(self, provider: str, token_json: str) -> None:
        info = PROVIDER_CONFIG[provider]
        remote = info["remote"]
        rtype = info["rclone_type"]

        # Eliminar configuración previa si existe
        self._run_rclone(["config", "delete", remote], timeout=20)
        args = ["config", "create", remote, rtype, f"token={token_json}", "--non-interactive"]
        res = self._run_rclone(args, timeout=30)
        if res.returncode != 0:
            raise RuntimeError(res.stderr or res.stdout or "Error creando remoto en rclone")

        if provider == "onedrive":
            # Resolver drive_id personal evitando Bóveda Personal
            drives_res = self._run_rclone(["backend", "drives", f"{remote}:"], timeout=30)
            if drives_res.returncode == 0 and drives_res.stdout.strip():
                try:
                    drives = json.loads(drives_res.stdout)
                    personal = [
                        d
                        for d in drives
                        if isinstance(d, dict)
                        and d.get("driveType") == "personal"
                        and not str(d.get("id", "")).startswith("b!")
                    ]
                    chosen = personal[0] if personal else (drives[0] if drives else None)
                    if chosen and chosen.get("id"):
                        self._run_rclone(
                            [
                                "config",
                                "update",
                                remote,
                                f"drive_id={chosen['id']}",
                                f"drive_type={chosen.get('driveType', 'personal')}",
                                "--non-interactive",
                            ],
                            timeout=20,
                        )
                except Exception:
                    pass

        # Asegurar carpeta _SyncSeinen_Metadata
        self._run_rclone(["mkdir", f"{remote}:{METADATA_FOLDER}"], timeout=30)

    def poll_auth(self, provider: str) -> Dict[str, Any]:
        with self._auth_lock:
            state = self._auth_processes.get(provider)
        if not state:
            connected = self.get_connected_services().get(provider, False)
            return {"done": True, "connected": connected, "authUrl": None, "error": None}
        connected = self.get_connected_services().get(provider, False)
        return {
            "done": bool(state["done"]),
            "connected": connected,
            "authUrl": state["url"],
            "error": state["error"],
        }

    def cancel_auth(self, provider: str) -> None:
        with self._auth_lock:
            state = self._auth_processes.pop(provider, None)
        if state and state.get("proc"):
            try:
                state["proc"].terminate()
            except Exception:
                pass

    def logout_provider(self, provider: str) -> Dict[str, Any]:
        self.cancel_auth(provider)
        if provider in PROVIDER_CONFIG:
            self._run_rclone(["config", "delete", PROVIDER_CONFIG[provider]["remote"]], timeout=20)
        return {"ok": True, "connectedServices": self.get_connected_services()}

    def list_cloud_metadatas(self) -> List[Dict[str, Any]]:
        connected = self.get_connected_services()
        all_metas: List[Dict[str, Any]] = []
        for provider, is_conn in connected.items():
            if not is_conn:
                continue
            remote = PROVIDER_CONFIG[provider]["remote"]
            res = self._run_rclone(["lsjson", f"{remote}:{METADATA_FOLDER}"], timeout=45)
            if res.returncode != 0 or not res.stdout.strip():
                continue
            try:
                entries = json.loads(res.stdout)
            except Exception:
                continue
            for entry in entries:
                name = entry.get("Name") or ""
                if not name.endswith(".json") or entry.get("IsDir"):
                    continue
                cat_res = self._run_rclone(["cat", f"{remote}:{METADATA_FOLDER}/{name}"], timeout=30)
                if cat_res.returncode == 0 and cat_res.stdout.strip():
                    try:
                        meta = json.loads(cat_res.stdout)
                        meta.setdefault("provider", provider)
                        all_metas.append(meta)
                    except Exception:
                        pass
        return all_metas

    def save_cloud_metadata(self, provider: str, metadata: Dict[str, Any]) -> None:
        remote = PROVIDER_CONFIG[provider]["remote"]
        self._run_rclone(["mkdir", f"{remote}:{METADATA_FOLDER}"], timeout=30)
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as tmp:
            json.dump(metadata, tmp, indent=2, ensure_ascii=False)
            tmp_path = tmp.name
        try:
            dest = f"{remote}:{METADATA_FOLDER}/sync-{metadata['id']}.json"
            res = self._run_rclone(["copyto", tmp_path, dest], timeout=45)
            if res.returncode != 0:
                raise RuntimeError(res.stderr or res.stdout or "Error guardando metadata en la nube")
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

    def _build_exclude_args(self, local_path: str, ignored_paths: List[str]) -> List[str]:
        args: List[str] = []
        for rel in ignored_paths or []:
            clean_rel = rel.strip().replace("\\", "/").lstrip("/")
            if not clean_rel:
                continue
            full = os.path.join(local_path, clean_rel)
            if os.path.isdir(full):
                args.extend(["--exclude", f"{clean_rel}/**"])
            else:
                args.extend(["--exclude", clean_rel])
        return args

    def _count_files(self, local_path: str, ignored_paths: List[str]) -> int:
        ignored_set = {p.replace("\\", "/").strip("/") for p in (ignored_paths or [])}
        count = 0
        if not os.path.isdir(local_path):
            return 0
        for root, dirs, files in os.walk(local_path):
            rel_root = os.path.relpath(root, local_path).replace("\\", "/")
            if rel_root == ".":
                rel_root = ""
            dirs[:] = [
                d
                for d in dirs
                if (f"{rel_root}/{d}".strip("/") not in ignored_set)
            ]
            for f in files:
                rel_file = f"{rel_root}/{f}".strip("/")
                if rel_file not in ignored_set:
                    count += 1
        return count

    def push_sync(self, sync_id: str) -> Dict[str, Any]:
        cfg = self.load_config()
        mapping = cfg["localMappings"].get(sync_id)
        if not mapping:
            return {"ok": False, "error": "Sincronización no encontrada en esta Steam Deck."}

        local_path = mapping.get("localPath") or ""
        if not os.path.isdir(local_path):
            return {"ok": False, "error": f"La carpeta local no existe: {local_path}"}

        provider = mapping.get("provider") or "gdrive"
        remote = PROVIDER_CONFIG[provider]["remote"]
        drive_folder = str(mapping.get("driveFolder") or "").strip("/")
        ignored_paths = mapping.get("ignoredPaths") or []

        self._run_rclone(["mkdir", f"{remote}:{drive_folder}"], timeout=30)
        exclude_args = self._build_exclude_args(local_path, ignored_paths)
        res = self._run_rclone(
            ["sync", local_path, f"{remote}:{drive_folder}", *exclude_args],
            timeout=600,
        )
        if res.returncode != 0:
            return {"ok": False, "error": res.stderr or res.stdout or "Error durante Push con rclone"}

        now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        file_count = self._count_files(local_path, ignored_paths)
        device_name = cfg.get("deviceName") or "Steam Deck"

        mapping["lastPushDevice"] = device_name
        mapping["lastPushAt"] = now_iso
        mapping["fileCount"] = file_count
        cfg["localMappings"][sync_id] = mapping
        self.save_config(cfg)

        cloud_meta = {
            "id": sync_id,
            "name": mapping.get("name"),
            "provider": provider,
            "driveFolder": drive_folder,
            "lastPushDevice": device_name,
            "lastPushAt": now_iso,
            "fileCount": file_count,
            "ignoredPaths": ignored_paths,
            "coverDataUrl": mapping.get("coverDataUrl"),
            "isGameSave": bool(mapping.get("isGameSave", True)),
            "gameSource": mapping.get("gameSource"),
            "emulatorName": mapping.get("emulatorName"),
            "systemName": mapping.get("systemName"),
        }
        self.save_cloud_metadata(provider, cloud_meta)
        return {"ok": True, "mapping": mapping}

    def pull_sync(self, sync_id: str) -> Dict[str, Any]:
        cfg = self.load_config()
        mapping = cfg["localMappings"].get(sync_id)
        if not mapping:
            return {"ok": False, "error": "Sincronización no encontrada en esta Steam Deck."}

        local_path = mapping.get("localPath") or ""
        os.makedirs(local_path, exist_ok=True)
        provider = mapping.get("provider") or "gdrive"
        remote = PROVIDER_CONFIG[provider]["remote"]
        drive_folder = str(mapping.get("driveFolder") or "").strip("/")
        ignored_paths = mapping.get("ignoredPaths") or []

        # Actualizar metadata desde la nube antes de hacer Pull
        cloud_metas = self.list_cloud_metadatas()
        cloud_match = next((m for m in cloud_metas if m.get("id") == sync_id), None)

        exclude_args = self._build_exclude_args(local_path, ignored_paths)
        res = self._run_rclone(
            ["sync", f"{remote}:{drive_folder}", local_path, *exclude_args],
            timeout=600,
        )
        if res.returncode != 0:
            return {"ok": False, "error": res.stderr or res.stdout or "Error durante Pull con rclone"}

        if cloud_match:
            mapping["lastPushDevice"] = cloud_match.get("lastPushDevice", mapping.get("lastPushDevice"))
            mapping["lastPushAt"] = cloud_match.get("lastPushAt", mapping.get("lastPushAt"))
            mapping["fileCount"] = cloud_match.get("fileCount", mapping.get("fileCount"))
            if cloud_match.get("coverDataUrl"):
                mapping["coverDataUrl"] = cloud_match["coverDataUrl"]
            cfg["localMappings"][sync_id] = mapping
            self.save_config(cfg)

        return {"ok": True, "mapping": mapping}

    def delete_sync(self, sync_id: str, delete_from_cloud: bool) -> Dict[str, Any]:
        cfg = self.load_config()
        mapping = cfg["localMappings"].get(sync_id)

        if delete_from_cloud and mapping:
            provider = mapping.get("provider") or "gdrive"
            if provider in PROVIDER_CONFIG and self.get_connected_services().get(provider):
                remote = PROVIDER_CONFIG[provider]["remote"]
                try:
                    meta_res = self._run_rclone(
                        [
                            "delete",
                            f"{remote}:{METADATA_FOLDER}",
                            "--include",
                            f"sync-{sync_id}.json",
                            "--include",
                            f"{sync_id}.json",
                        ],
                        timeout=30,
                    )
                    if meta_res.returncode != 0:
                        err_txt = (meta_res.stderr or meta_res.stdout or "").strip()
                        if "directory not found" not in err_txt.lower() and "not found" not in err_txt.lower():
                            return {"ok": False, "error": f"No se pudo borrar metadata en la nube: {err_txt}"}

                    drive_folder = str(mapping.get("driveFolder") or "").strip("/")
                    if drive_folder:
                        purge_res = self._run_rclone(["purge", f"{remote}:{drive_folder}"], timeout=45)
                        if purge_res.returncode != 0:
                            err_txt = (purge_res.stderr or purge_res.stdout or "").strip()
                            if "directory not found" not in err_txt.lower() and "not found" not in err_txt.lower():
                                return {"ok": False, "error": f"No se pudo borrar carpeta en la nube: {err_txt}"}
                except Exception as exc:
                    return {"ok": False, "error": f"Error eliminando de la nube: {exc}"}

        cfg["localMappings"].pop(sync_id, None)
        self.save_config(cfg)
        return {"ok": True}
