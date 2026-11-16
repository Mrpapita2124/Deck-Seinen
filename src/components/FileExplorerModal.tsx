import { DialogButton, Focusable, ModalRoot } from "@decky/ui";
import { useEffect, useState } from "react";
import { FaArrowUp, FaCheckSquare, FaFile, FaFolder, FaRegSquare } from "react-icons/fa";
import { api } from "../api";
import { useLang } from "../i18n";
import type { DirEntry, DirectoryListing } from "../types";

interface FileExplorerModalProps {
  closeModal?: () => void;
  mode: "folder" | "files-or-folder";
  initialPath?: string;
  title?: string;
  onConfirm: (result: { folderPath: string; selectedFiles: string[] }) => void;
}

export function FileExplorerModal({
  closeModal,
  mode,
  initialPath,
  title,
  onConfirm,
}: FileExplorerModalProps) {
  const [, , tr] = useLang();
  const [listing, setListing] = useState<DirectoryListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);

  const loadPath = async (targetPath?: string) => {
    setLoading(true);
    try {
      const res = await api.listDirectory(targetPath);
      setListing(res);
      setSelectedFiles([]);
    } catch (err) {
      console.error("Error listando directorio:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPath(initialPath);
  }, [initialPath]);

  const toggleFile = (entry: DirEntry) => {
    if (entry.isDir) return;
    setSelectedFiles((prev) =>
      prev.includes(entry.path) ? prev.filter((p) => p !== entry.path) : [...prev, entry.path]
    );
  };

  const handleConfirmFolder = () => {
    if (!listing) return;
    onConfirm({ folderPath: listing.currentPath, selectedFiles: [] });
    closeModal?.();
  };

  const handleConfirmSelectedFiles = () => {
    if (!listing || selectedFiles.length === 0) return;
    onConfirm({ folderPath: listing.currentPath, selectedFiles });
    closeModal?.();
  };

  return (
    <ModalRoot onCancel={closeModal} closeModal={closeModal}>
      <div style={{ minWidth: "560px", maxWidth: "720px", color: "#fff" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "10px",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700 }}>
            {title ||
              (mode === "folder"
                ? tr("Select Folder", "Seleccionar Carpeta")
                : tr("Select Folder or Files", "Seleccionar Carpeta o Archivos"))}
          </h2>
          <span style={{ fontSize: "11px", opacity: 0.7 }}>
            {tr("Read-only (browse & select)", "Solo lectura (navegación y selección)")}
          </span>
        </div>

        {/* Marcadores rápidos estilo Decky File Manager */}
        {listing && listing.bookmarks.length > 0 && (
          <Focusable
            flow-children="horizontal"
            style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}
          >
            {listing.bookmarks.map((bm) => (
              <DialogButton
                key={bm.path}
                onClick={() => loadPath(bm.path)}
                style={{
                  padding: "6px 12px",
                  fontSize: "12px",
                  minWidth: "auto",
                  borderBottom:
                    listing.currentPath === bm.path ? "3px solid #38bdf8" : "3px solid transparent",
                }}
              >
                {bm.label}
              </DialogButton>
            ))}
          </Focusable>
        )}

        {/* Barra de ruta actual + botón Subir */}
        <Focusable
          flow-children="horizontal"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: "rgba(0,0,0,0.35)",
            padding: "8px 10px",
            borderRadius: "8px",
            marginBottom: "10px",
          }}
        >
          <DialogButton
            onClick={() => listing && loadPath(listing.parentPath)}
            disabled={!listing || listing.currentPath === "/"}
            style={{ padding: "6px 10px", minWidth: "auto" }}
          >
            <FaArrowUp />
          </DialogButton>
          <div
            style={{
              flex: 1,
              fontFamily: "monospace",
              fontSize: "12px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {listing?.currentPath || tr("Loading...", "Cargando...")}
          </div>
        </Focusable>

        {/* Lista de carpetas y archivos */}
        <div
          style={{
            maxHeight: "300px",
            overflowY: "auto",
            background: "rgba(0,0,0,0.25)",
            borderRadius: "8px",
            padding: "6px",
            marginBottom: "12px",
          }}
        >
          {loading ? (
            <div style={{ padding: "24px", textAlign: "center", opacity: 0.7 }}>
              {tr("Loading files...", "Cargando archivos...")}
            </div>
          ) : !listing || listing.entries.length === 0 ? (
            <div style={{ padding: "24px", textAlign: "center", opacity: 0.6 }}>
              {tr("Empty folder", "Carpeta vacía")}
            </div>
          ) : (
            <Focusable style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {listing.entries.map((entry) => {
                const isChecked = selectedFiles.includes(entry.path);
                if (entry.isDir) {
                  return (
                    <DialogButton
                      key={entry.path}
                      onClick={() => loadPath(entry.path)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        justifyContent: "flex-start",
                        padding: "8px 12px",
                        background: "rgba(255,255,255,0.05)",
                        textAlign: "left",
                      }}
                    >
                      <FaFolder color="#60a5fa" />
                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {entry.name}
                      </span>
                    </DialogButton>
                  );
                }

                // Archivos: solo seleccionables en modo 'files-or-folder'
                return (
                  <DialogButton
                    key={entry.path}
                    disabled={mode === "folder"}
                    onClick={() => mode === "files-or-folder" && toggleFile(entry)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      justifyContent: "flex-start",
                      padding: "8px 12px",
                      background: isChecked
                        ? "rgba(26,159,255,0.28)"
                        : "rgba(255,255,255,0.02)",
                      opacity: mode === "folder" ? 0.55 : 1,
                      textAlign: "left",
                    }}
                  >
                    {mode === "files-or-folder" ? (
                      isChecked ? (
                        <FaCheckSquare color="#38bdf8" />
                      ) : (
                        <FaRegSquare color="#94a3b8" />
                      )
                    ) : (
                      <FaFile color="#94a3b8" />
                    )}
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {entry.name}
                    </span>
                  </DialogButton>
                );
              })}
            </Focusable>
          )}
        </div>

        {/* Botones de acción */}
        <Focusable
          flow-children="horizontal"
          style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}
        >
          <DialogButton onClick={closeModal} style={{ minWidth: "100px" }}>
            {tr("Cancel", "Cancelar")}
          </DialogButton>
          {mode === "files-or-folder" && selectedFiles.length > 0 && (
            <DialogButton
              onClick={handleConfirmSelectedFiles}
              style={{ minWidth: "180px", fontWeight: 700 }}
            >
              {tr(`Use ${selectedFiles.length} file(s)`, `Usar ${selectedFiles.length} archivo(s)`)}
            </DialogButton>
          )}
          <DialogButton
            onClick={handleConfirmFolder}
            disabled={!listing}
            style={{ minWidth: "180px", fontWeight: 700 }}
          >
            {tr("Select this folder", "Seleccionar esta carpeta")}
          </DialogButton>
        </Focusable>
      </div>
    </ModalRoot>
  );
}
