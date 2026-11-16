import { DialogButton, Focusable, ModalRoot, TextField } from "@decky/ui";
import { useEffect, useState } from "react";
import { FaSearch } from "react-icons/fa";
import { api } from "../api";
import { useLang } from "../i18n";
import type { DdgImageResult } from "../types";

interface CoverSearchModalProps {
  closeModal?: () => void;
  initialQuery?: string;
  onSelect: (imageUrl: string) => void;
}

export function CoverSearchModal({
  closeModal,
  initialQuery = "",
  onSelect,
}: CoverSearchModalProps) {
  const [, , tr] = useLang();
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<DdgImageResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const runSearch = async (q: string) => {
    const clean = q.trim();
    if (!clean) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const hits = await api.searchDdgImages(clean);
      setResults(hits);
      if (hits.length === 0) {
        setErrorMsg(tr("No images found for this search.", "No se encontraron imágenes para esta búsqueda."));
      }
    } catch (err: any) {
      console.error("Error searching DuckDuckGo:", err);
      setErrorMsg(String(err?.message || err || tr("Error querying DuckDuckGo", "Error consultando DuckDuckGo")));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialQuery.trim()) {
      runSearch(initialQuery);
    }
  }, [initialQuery]);

  return (
    <ModalRoot onCancel={closeModal} closeModal={closeModal}>
      <div style={{ minWidth: "560px", maxWidth: "680px", color: "#fff" }}>
        <h2 style={{ margin: "0 0 10px 0", fontSize: "18px", fontWeight: 700 }}>
          {tr("Search cover on DuckDuckGo", "Buscar carátula en DuckDuckGo")}
        </h2>

        <Focusable
          flow-children="horizontal"
          style={{
            display: "flex",
            gap: "10px",
            alignItems: "center",
            width: "100%",
            marginBottom: "12px",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <TextField
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tr("e.g. Mario Kart 8 Deluxe cover", "Ej. Mario Kart 8 Deluxe cover")}
              style={{ width: "100%" }}
            />
          </div>
          <DialogButton
            onClick={() => runSearch(query)}
            disabled={loading || !query.trim()}
            style={{
              width: "115px",
              minWidth: "115px",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
            }}
          >
            <FaSearch />
            <span>{loading ? "..." : tr("Search", "Buscar")}</span>
          </DialogButton>
        </Focusable>

        {errorMsg && (
          <div
            style={{
              fontSize: "12px",
              color: "#fca5a5",
              background: "rgba(239,68,68,0.18)",
              padding: "6px 10px",
              borderRadius: "6px",
              marginBottom: "10px",
            }}
          >
            {errorMsg}
          </div>
        )}

        <div
          style={{
            maxHeight: "320px",
            overflowY: "auto",
            background: "rgba(0,0,0,0.28)",
            borderRadius: "10px",
            padding: "10px",
            marginBottom: "12px",
          }}
        >
          {loading ? (
            <div style={{ padding: "36px", textAlign: "center", opacity: 0.75 }}>
              {tr("Searching DuckDuckGo images...", "Buscando imágenes en DuckDuckGo...")}
            </div>
          ) : results.length === 0 ? (
            <div style={{ padding: "36px", textAlign: "center", opacity: 0.65 }}>
              {tr(
                "Type a game or folder name and press Search.",
                "Escribe el nombre del juego o carpeta y presiona Buscar."
              )}
            </div>
          ) : (
            <Focusable
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                gap: "8px",
              }}
            >
              {results.map((item, idx) => (
                <DialogButton
                  key={`${item.imageUrl}_${idx}`}
                  onClick={() => {
                    onSelect(item.imageUrl);
                    closeModal?.();
                  }}
                  style={{
                    padding: "4px",
                    height: "110px",
                    overflow: "hidden",
                    background: "rgba(255,255,255,0.06)",
                    borderRadius: "8px",
                  }}
                >
                  <img
                    src={item.thumbUrl || item.imageUrl}
                    alt={item.title}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      borderRadius: "6px",
                    }}
                  />
                </DialogButton>
              ))}
            </Focusable>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <DialogButton onClick={closeModal} style={{ minWidth: "100px" }}>
            Cerrar
          </DialogButton>
        </div>
      </div>
    </ModalRoot>
  );
}
