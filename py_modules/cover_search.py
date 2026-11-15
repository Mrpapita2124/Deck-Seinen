import base64
import json
import re
import ssl
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Dict, List, Optional

STEAMGRIDDB_API_KEY = "ac4b064580cac55b3050b8b2f4d42a73"
USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)


def _http_get(url: str, headers: Optional[Dict[str, str]] = None, timeout: int = 12) -> bytes:
    req_headers = {"User-Agent": USER_AGENT}
    if headers:
        req_headers.update(headers)
    req = urllib.request.Request(url, headers=req_headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read()
    except Exception:
        ctx = ssl._create_unverified_context()
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
            return resp.read()


def search_duckduckgo_images(query: str, max_results: int = 24) -> List[Dict[str, Any]]:
    q = (query or "").strip()
    if not q:
        return []

    encoded_q = urllib.parse.quote(q)
    html_bytes = _http_get(f"https://duckduckgo.com/?q={encoded_q}&iax=images&ia=images")
    html_text = html_bytes.decode("utf-8", errors="ignore")

    vqd_match = (
        re.search(r'vqd=["\']([^"\']+)["\']', html_text)
        or re.search(r"vqd=([0-9-]+)&", html_text)
        or re.search(r'"vqd"\s*:\s*"([^"]+)"', html_text)
    )
    if not vqd_match:
        return []

    vqd = urllib.parse.quote(vqd_match.group(1))
    api_url = (
        f"https://duckduckgo.com/i.js?l=wt-wt&o=json&q={encoded_q}"
        f"&vqd={vqd}&f=,,,&p=1"
    )
    raw_json = _http_get(
        api_url,
        headers={
            "Referer": "https://duckduckgo.com/",
            "Accept": "application/json, text/javascript, */*; q=0.01",
        },
    )
    data = json.loads(raw_json.decode("utf-8", errors="ignore"))
    results = []
    for item in (data.get("results") or [])[:max_results]:
        img_url = item.get("image") or ""
        thumb_url = item.get("thumbnail") or img_url
        if not img_url:
            continue
        results.append(
            {
                "title": item.get("title") or q,
                "imageUrl": img_url,
                "thumbUrl": thumb_url,
                "width": item.get("width") or 0,
                "height": item.get("height") or 0,
            }
        )
    return results


def download_image_as_data_url(image_url: str) -> Optional[str]:
    if not image_url:
        return None
    if image_url.startswith("data:image/"):
        return image_url
    try:
        raw = _http_get(image_url, timeout=10)
        if len(raw) > 2 * 1024 * 1024:
            return image_url
        mime = "image/jpeg"
        lower = image_url.lower()
        if ".png" in lower or raw.startswith(b"\x89PNG"):
            mime = "image/png"
        elif ".webp" in lower or raw[8:12] == b"WEBP":
            mime = "image/webp"
        b64 = base64.b64encode(raw).decode("ascii")
        return f"data:{mime};base64,{b64}"
    except Exception:
        return image_url


def search_steamgriddb_cover(game_name: str) -> Optional[str]:
    clean_name = re.sub(r"\([^)]*\)", "", game_name or "").strip()
    if not clean_name:
        return None
    try:
        q = urllib.parse.quote(clean_name)
        headers = {"Authorization": f"Bearer {STEAMGRIDDB_API_KEY}"}
        search_raw = _http_get(
            f"https://www.steamgriddb.com/api/v2/search/autocomplete/{q}",
            headers=headers,
            timeout=8,
        )
        search_data = json.loads(search_raw.decode("utf-8", errors="ignore"))
        hits = search_data.get("data") or []
        if not hits:
            return None
        game_id = hits[0].get("id")
        if not game_id:
            return None

        grids_raw = _http_get(
            f"https://www.steamgriddb.com/api/v2/grids/game/{game_id}",
            headers=headers,
            timeout=8,
        )
        grids_data = json.loads(grids_raw.decode("utf-8", errors="ignore"))
        grids = grids_data.get("data") or []
        if grids:
            url = grids[0].get("thumb") or grids[0].get("url")
            if url:
                return download_image_as_data_url(url)
    except Exception:
        return None
    return None


def populate_covers_parallel(items: List[Dict[str, Any]], max_items: int = 40) -> None:
    targets = [it for it in items[:max_items] if not it.get("coverUrl") and not it.get("coverDataUrl")]
    if not targets:
        return

    def _fetch(item: Dict[str, Any]) -> None:
        cover = search_steamgriddb_cover(str(item.get("name") or ""))
        if cover:
            item["coverUrl"] = cover

    with ThreadPoolExecutor(max_workers=6) as pool:
        list(pool.map(_fetch, targets))
