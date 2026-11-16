import os
import re
from typing import Any, Dict, List, Optional, Tuple
from .cover_search import populate_covers_parallel


def _normalize_name(name: str) -> str:
    s = (name or "").lower()
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    return s


def _home_dir() -> str:
    env_home = os.environ.get("DECKY_USER_HOME")
    if env_home and os.path.isdir(env_home):
        return env_home
    try:
        import decky
        if getattr(decky, "DECKY_USER_HOME", None) and os.path.isdir(decky.DECKY_USER_HOME):
            return decky.DECKY_USER_HOME
    except Exception:
        pass
    if os.path.isdir("/home/deck"):
        return "/home/deck"
    return os.path.expanduser("~")


def _get_steam_library_paths() -> List[str]:
    home = _home_dir()
    candidates = [
        os.path.join(home, ".local", "share", "Steam"),
        os.path.join(home, ".steam", "steam"),
        os.path.join(home, ".var", "app", "com.valvesoftware.Steam", ".local", "share", "Steam"),
    ]
    # Agregar tarjetas SD / almacenamiento externo en SteamOS (/run/media)
    media_root = "/run/media"
    if os.path.isdir(media_root):
        try:
            for entry in os.scandir(media_root):
                if entry.is_dir():
                    candidates.append(entry.path)
                    candidates.append(os.path.join(entry.path, "SteamLibrary"))
                    # También /run/media/deck/<label>
                    try:
                        for sub in os.scandir(entry.path):
                            if sub.is_dir():
                                candidates.append(sub.path)
                                candidates.append(os.path.join(sub.path, "SteamLibrary"))
                    except Exception:
                        pass
        except Exception:
            pass

    libs: List[str] = []
    seen = set()
    for base in candidates:
        steamapps = base if os.path.basename(base) == "steamapps" else os.path.join(base, "steamapps")
        if os.path.isdir(steamapps):
            real = os.path.realpath(steamapps)
            if real not in seen:
                seen.add(real)
                libs.append(real)
    return libs


def _get_installed_steam_games() -> List[Dict[str, str]]:
    games: List[Dict[str, str]] = []
    for steamapps in _get_steam_library_paths():
        try:
            for entry in os.scandir(steamapps):
                if entry.is_file() and entry.name.startswith("appmanifest_") and entry.name.endswith(".acf"):
                    try:
                        with open(entry.path, "r", encoding="utf-8", errors="ignore") as f:
                            text = f.read()
                        appid_m = re.search(r'"appid"\s+"(\d+)"', text)
                        name_m = re.search(r'"name"\s+"([^"]+)"', text)
                        if appid_m and name_m:
                            appid = appid_m.group(1)
                            name = name_m.group(1)
                            if "Proton" in name or "Steam Linux Runtime" in name or "Steamworks" in name:
                                continue
                            compat = os.path.join(steamapps, "compatdata", appid, "pfx", "drive_c", "users", "steamuser")
                            games.append({"appid": appid, "name": name, "compatUserDir": compat})
                    except Exception:
                        pass
        except Exception:
            pass
    return games


def _find_save_dir_in_proton_prefix(user_dir: str, game_name: str) -> Optional[str]:
    if not os.path.isdir(user_dir):
        return None
    norm_game = _normalize_name(game_name)
    tokens = [t for t in norm_game.split() if len(t) >= 3]
    search_roots = [
        os.path.join(user_dir, "Saved Games"),
        os.path.join(user_dir, "Documents", "My Games"),
        os.path.join(user_dir, "Documents"),
        os.path.join(user_dir, "AppData", "LocalLow"),
        os.path.join(user_dir, "AppData", "Local"),
        os.path.join(user_dir, "AppData", "Roaming"),
    ]
    ignore_dirs = {
        "microsoft", "steam", "valve", "vulkan", "nvidia", "amd",
        "temp", "cache", "packages", "windows", "crashdumps", "intel",
        "google", "pip", "wine", "openxr", "khronos", "directx",
    }

    best_path: Optional[str] = None
    best_score = 0
    fallback_path: Optional[str] = None

    for root in search_roots:
        if not os.path.isdir(root):
            continue
        try:
            for entry in os.scandir(root):
                if not entry.is_dir():
                    continue
                low = entry.name.lower()
                if low in ignore_dirs or low.startswith("."):
                    continue
                try:
                    has_files = any(True for _ in os.scandir(entry.path))
                except Exception:
                    has_files = False
                if not has_files:
                    continue

                if fallback_path is None:
                    fallback_path = entry.path

                norm_dir = _normalize_name(entry.name)
                if not norm_dir:
                    continue
                score = 0
                if norm_dir == norm_game:
                    score = 100
                elif norm_dir in norm_game or norm_game in norm_dir:
                    score = 70
                else:
                    matches = sum(1 for t in tokens if t in norm_dir)
                    if matches > 0:
                        score = matches * 25
                if score > best_score:
                    best_score = score
                    best_path = entry.path
        except Exception:
            pass

    return best_path or fallback_path


def _scan_emulator_saves() -> List[Dict[str, Any]]:
    home = _home_dir()
    results: List[Dict[str, Any]] = []
    seen_paths = set()

    # Raíces típicas de EmuDeck, RetroDECK, Flatpak y Linux nativo
    emu_roots: List[Tuple[str, str, str]] = [
        # (emulatorName, systemName, path)
        ("Yuzu / Eden / Suyu", "Nintendo Switch", os.path.join(home, "Emulation", "saves", "yuzu")),
        ("Yuzu / Eden / Suyu", "Nintendo Switch", os.path.join(home, ".local", "share", "yuzu", "nand", "user", "save")),
        ("Yuzu / Eden / Suyu", "Nintendo Switch", os.path.join(home, ".local", "share", "eden", "nand", "user", "save")),
        ("Yuzu / Eden / Suyu", "Nintendo Switch", os.path.join(home, ".local", "share", "suyu", "nand", "user", "save")),
        ("Ryujinx", "Nintendo Switch", os.path.join(home, "Emulation", "saves", "ryujinx")),
        ("Ryujinx", "Nintendo Switch", os.path.join(home, ".config", "Ryujinx", "bis", "user", "save")),
        ("Cemu", "Wii U", os.path.join(home, "Emulation", "saves", "cemu")),
        ("Cemu", "Wii U", os.path.join(home, ".local", "share", "Cemu", "mlc01", "usr", "save")),
        ("Azahar / Citra", "Nintendo 3DS", os.path.join(home, "Emulation", "saves", "citra")),
        ("Azahar / Citra", "Nintendo 3DS", os.path.join(home, "Emulation", "saves", "azahar")),
        ("Azahar / Citra", "Nintendo 3DS", os.path.join(home, ".local", "share", "citra-emu", "sdmc")),
        ("Dolphin", "GameCube / Wii", os.path.join(home, "Emulation", "saves", "dolphin")),
        ("Dolphin", "GameCube / Wii", os.path.join(home, ".local", "share", "dolphin-emu", "GC")),
        ("Dolphin", "GameCube / Wii", os.path.join(home, ".var", "app", "org.DolphinEmu.dolphin-emu", "data", "dolphin-emu", "GC")),
        ("PCSX2", "PS2", os.path.join(home, "Emulation", "saves", "pcsx2")),
        ("PCSX2", "PS2", os.path.join(home, ".config", "PCSX2", "memcards")),
        ("DuckStation", "PS1", os.path.join(home, "Emulation", "saves", "duckstation")),
        ("DuckStation", "PS1", os.path.join(home, ".local", "share", "duckstation", "memcards")),
        ("PPSSPP", "PSP", os.path.join(home, "Emulation", "saves", "ppsspp", "PSP", "SAVEDATA")),
        ("PPSSPP", "PSP", os.path.join(home, ".config", "ppsspp", "PSP", "SAVEDATA")),
        ("RPCS3", "PS3", os.path.join(home, "Emulation", "saves", "rpcs3")),
        ("RPCS3", "PS3", os.path.join(home, ".config", "rpcs3", "dev_hdd0", "home", "00000001", "savedata")),
        ("RetroArch", "Multi-sistema", os.path.join(home, "Emulation", "saves", "retroarch")),
        ("RetroArch", "Multi-sistema", os.path.join(home, ".config", "retroarch", "saves")),
        ("melonDS", "Nintendo DS", os.path.join(home, "Emulation", "saves", "melonds")),
        ("mGBA", "Game Boy Advance", os.path.join(home, "Emulation", "saves", "mgba")),
        ("Ports PC", "Recompilación / Port", os.path.join(home, ".local", "share", "soh")),
        ("Ports PC", "Recompilación / Port", os.path.join(home, ".local", "share", "2ship2harkinian")),
        ("Ports PC", "Recompilación / Port", os.path.join(home, ".config", "Zelda64Recompiled")),
    ]

    for emu_name, sys_name, base_dir in emu_roots:
        if not os.path.isdir(base_dir):
            continue
        try:
            entries = list(os.scandir(base_dir))
        except Exception:
            continue

        subdirs = [e for e in entries if e.is_dir()]
        if subdirs:
            for sub in subdirs[:40]:
                real = os.path.realpath(sub.path)
                if real in seen_paths:
                    continue
                try:
                    if not any(True for _ in os.scandir(sub.path)):
                        continue
                except Exception:
                    continue
                seen_paths.add(real)
                clean_label = sub.name.replace("_", " ").strip()
                results.append(
                    {
                        "id": f"emu_{abs(hash(real))}",
                        "name": clean_label,
                        "localPath": sub.path,
                        "source": "emulation",
                        "emulatorName": emu_name,
                        "systemName": sys_name,
                    }
                )
        elif any(e.is_file() for e in entries):
            real = os.path.realpath(base_dir)
            if real not in seen_paths:
                seen_paths.add(real)
                results.append(
                    {
                        "id": f"emu_{abs(hash(real))}",
                        "name": f"{emu_name} ({os.path.basename(base_dir)})",
                        "localPath": base_dir,
                        "source": "emulation",
                        "emulatorName": emu_name,
                        "systemName": sys_name,
                    }
                )

    return results


def scan_local_game_saves(with_covers: bool = True) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    seen_paths = set()

    # 1. Juegos de Steam / Proton en la Steam Deck
    for game in _get_installed_steam_games():
        save_dir = _find_save_dir_in_proton_prefix(game["compatUserDir"], game["name"])
        if save_dir:
            real = os.path.realpath(save_dir)
            if real in seen_paths:
                continue  # Ignorar rutas compartidas/duplicadas silenciosamente
            seen_paths.add(real)
            items.append(
                {
                    "id": f"pc_{game['appid']}",
                    "name": game["name"],
                    "localPath": save_dir,
                    "source": "pc",
                    "emulatorName": None,
                    "systemName": "Steam / Proton",
                    "coverUrl": None,
                }
            )

    # 2. Emuladores y Ports PC
    for emu in _scan_emulator_saves():
        real = os.path.realpath(emu["localPath"])
        if real in seen_paths:
            continue
        seen_paths.add(real)
        emu["coverUrl"] = None
        items.append(emu)

    # Ordenar alfabéticamente
    items.sort(key=lambda x: x["name"].lower())

    if with_covers:
        populate_covers_parallel(items, max_items=40)

    return items


def detect_cloud_game_paths(cloud_syncs: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    local_items = scan_local_game_saves(with_covers=False)
    steam_games = _get_installed_steam_games()
    results: Dict[str, Dict[str, Any]] = {}

    for sync in cloud_syncs:
        sync_id = str(sync.get("id") or "")
        sync_name = str(sync.get("name") or "")
        norm_sync = _normalize_name(sync_name)
        tokens = [t for t in norm_sync.split() if len(t) >= 3]

        matched_path: Optional[str] = None
        reason = ""

        # 1. Buscar coincidencia exacta o por tokens en saves locales ya detectados
        for loc in local_items:
            norm_loc = _normalize_name(loc["name"])
            if norm_loc == norm_sync or (norm_sync and (norm_sync in norm_loc or norm_loc in norm_sync)):
                matched_path = loc["localPath"]
                reason = f"Detectado en {loc.get('emulatorName') or 'Steam/Proton'}"
                break

        # 2. Si no hay save previo, revisar si el juego de Steam está instalado y tiene prefix Proton
        if not matched_path and tokens:
            for sg in steam_games:
                norm_sg = _normalize_name(sg["name"])
                if norm_sg == norm_sync or all(t in norm_sg for t in tokens[:2]):
                    save_dir = _find_save_dir_in_proton_prefix(sg["compatUserDir"], sg["name"])
                    if save_dir:
                        matched_path = save_dir
                        reason = f"Prefix Proton de {sg['name']}"
                        break

        # 3. Revisar carpeta directa de EmuDeck si es emulador
        if not matched_path and sync.get("emulatorName"):
            emu_low = str(sync.get("emulatorName") or "").lower()
            home = _home_dir()
            emu_base = os.path.join(home, "Emulation", "saves")
            if os.path.isdir(emu_base):
                for key in ["yuzu", "ryujinx", "cemu", "dolphin", "pcsx2", "duckstation", "ppsspp", "rpcs3", "retroarch", "citra", "azahar", "melonds", "mgba"]:
                    if key in emu_low:
                        cand = os.path.join(emu_base, key, sync_name)
                        if os.path.isdir(os.path.join(emu_base, key)):
                            matched_path = cand
                            reason = f"Carpeta de emulador ({key})"
                            break

        results[sync_id] = {
            "detected": bool(matched_path),
            "path": matched_path,
            "reason": reason,
        }

    return results


def list_directory(target_path: Optional[str] = None) -> Dict[str, Any]:
    home = _home_dir()
    path = target_path or home
    if not os.path.exists(path) or not os.path.isdir(path):
        path = home
    path = os.path.abspath(path)
    parent = os.path.dirname(path) if path != "/" else "/"

    bookmarks = [{"label": "Home", "path": home}]
    emulation_saves = os.path.join(home, "Emulation", "saves")
    if os.path.isdir(emulation_saves):
        bookmarks.append({"label": "Emulation/saves", "path": emulation_saves})
    steam_compat = os.path.join(home, ".local", "share", "Steam", "steamapps", "compatdata")
    if os.path.isdir(steam_compat):
        bookmarks.append({"label": "Steam compatdata", "path": steam_compat})
    if os.path.isdir("/run/media"):
        bookmarks.append({"label": "SD Card (/run/media)", "path": "/run/media"})

    entries: List[Dict[str, Any]] = []
    try:
        for entry in os.scandir(path):
            try:
                is_dir = entry.is_dir()
                size = 0 if is_dir else entry.stat().st_size
                entries.append(
                    {
                        "name": entry.name,
                        "path": entry.path,
                        "isDir": is_dir,
                        "size": size,
                    }
                )
            except Exception:
                pass
    except Exception:
        pass

    entries.sort(key=lambda e: (not e["isDir"], e["name"].lower()))

    return {
        "currentPath": path,
        "parentPath": parent,
        "bookmarks": bookmarks,
        "entries": entries,
    }
