import { DialogButton, Focusable, ModalRoot, TextField } from "@decky/ui";
import { useEffect, useState } from "react";
import { FaSearch } from "react-icons/fa";
import { api } from "../api";
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
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<DdgImageResult[]>([]);
  const [loading, setLoading] = useState(false);

  const runSearch = async (q: string) => {
    const clean = q.trim();
    if (!clean) return;
    setLoading(true);
    try {
      const hits = await api.searchDdgImages(clean);
      setResults(hits);
    } catch (err) {
      console.error("Error buscando en DuckDuckGo:", err);
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
      <div style={{ minWidth: "540px", maxWidth: "680px", color: "#fff" }}>
        <h2 style={{ margin: "0 0 10px 0", fontSize: "18px", fontWeight: 700 }}>
          Buscar carátula en DuckDuckGo
        </h2>

        <Focusable
          flow-children="horizontal"
          style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "12px" }}
        >
          <div style={{ flex: 1 }}>
            <TextField
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ej. Mario Kart 8 Deluxe cover"
            />
          </div>
          <DialogButton
            onClick={() => runSearch(query)}
            disabled={loading || !query.trim()}
            style={{
              minWidth: "110px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              background: "#1a9fff",
            }}
          >
            <FaSearch />
            <span>{loading ? "Buscando..." : "Buscar"}</span>
          </DialogButton>
        </Focusable>

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
              Buscando imágenes en DuckDuckGo...
            </div>
          ) : results.length === 0 ? (
            <div style={{ padding: "36px", textAlign: "center", opacity: 0.65 }}>
              Escribe el nombre del juego o carpeta y presiona Buscar.
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
