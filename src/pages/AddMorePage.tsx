import {
  DialogButton,
  Dropdown,
  Focusable,
  ModalRoot,
  Navigation,
  TextField,
  showModal,
} from "@decky/ui";
import { useEffect, useState } from "react";
import {
  FaArrowLeft,
  FaCheck,
  FaFolderOpen,
  FaGamepad,
  FaImage,
  FaPlus,
  FaSearch,
} from "react-icons/fa";
import { api } from "../api";
import { CoverSearchModal } from "../components/CoverSearchModal";
import { FileExplorerModal } from "../components/FileExplorerModal";
import {
  PROVIDER_LABELS,
  type CloudGameMeta,
  type CloudProvider,
  type DetectedGameItem,
  type PathDetectionResult,
} from "../types";

type MainTab = "sync_here" | "upload";
type SourceFilter = "all" | "pc" | "emulation";

function DetectedPathViewerModal({
  closeModal,
  gameName,
  path,
  reason,
  onChangePath,
}: {
  closeModal?: () => void;
  gameName: string;
  path: string;
  reason?: string;
  onChangePath: () => void;
}) {
  return (
    <ModalRoot onCancel={closeModal} closeModal={closeModal}>
      <div style={{ minWidth: "420px", maxWidth: "580px", color: "#fff" }}>
        <h2 style={{ margin: "0 0 8px 0", fontSize: "18px", fontWeight: 700 }}>
          Ruta detectada: {gameName}
        </h2>
        {reason && (
          <div style={{ fontSize: "12px", color: "#34d399", marginBottom: "8px" }}>{reason}</div>
        )}
        <div
          style={{
            fontFamily: "monospace",
            fontSize: "12px",
            background: "rgba(0,0,0,0.38)",
            padding: "10px 12px",
            borderRadius: "8px",
            wordBreak: "break-all",
            marginBottom: "14px",
          }}
        >
          {path}
        </div>
        <Focusable
          flow-children="horizontal"
          style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}
        >
          <DialogButton
            onClick={() => {
              closeModal?.();
              onChangePath();
            }}
          >
            Cambiar ruta
          </DialogButton>
          <DialogButton
            onClick={closeModal}
            style={{ background: "#1a9fff", color: "#fff", fontWeight: 700 }}
          >
            Aceptar
          </DialogButton>
        </Focusable>
      </div>
    </ModalRoot>
  );
}

export function AddMorePage() {
  const [activeTab, setActiveTab] = useState<MainTab>("sync_here");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [connectedServices, setConnectedServices] = useState<Record<CloudProvider, boolean>>({
    gdrive: false,
    onedrive: false,
    dropbox: false,
  });

  // --- Estados de Sync here ---
  const [cloudGames, setCloudGames] = useState<CloudGameMeta[]>([]);
  const [loadingCloud, setLoadingCloud] = useState(false);
  const [selectedCloudIds, setSelectedCloudIds] = useState<string[]>([]);
  const [syncHereStep, setSyncHereStep] = useState<1 | 2>(1);
  const [detectingPaths, setDetectingPaths] = useState(false);
  const [detectedPaths, setDetectedPaths] = useState<Record<string, PathDetectionResult>>({});
  const [manualPaths, setManualPaths] = useState<Record<string, string>>({});
  const [syncingHere, setSyncingHere] = useState(false);

  // --- Estados de Upload ---
  const [localGames, setLocalGames] = useState<DetectedGameItem[]>([]);
  const [loadingScan, setLoadingScan] = useState(false);
  const [selectedLocalIds, setSelectedLocalIds] = useState<string[]>([]);
  const [uploadStep, setUploadStep] = useState<"scan" | "confirm_scan" | "manual">("scan");
  const [uploadProviderMap, setUploadProviderMap] = useState<Record<string, CloudProvider>>({});
  const [uploadingGames, setUploadingGames] = useState(false);

  // --- Estados de Add manual (dentro de Upload) ---
  const [manualName, setManualName] = useState("");
  const [manualCoverUrl, setManualCoverUrl] = useState<string | null>(null);
  const [manualFolderPath, setManualFolderPath] = useState("");
  const [manualSelectedFiles, setManualSelectedFiles] = useState<string[]>([]);
  const [manualProvider, setManualProvider] = useState<CloudProvider>("gdrive");
  const [creatingManual, setCreatingManual] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const connectedProviders = (["gdrive", "onedrive", "dropbox"] as CloudProvider[]).filter(
    (p) => connectedServices[p]
  );

  useEffect(() => {
    (async () => {
      const st = await api.getState();
      setConnectedServices(st.connectedServices);
      const first = (["gdrive", "onedrive", "dropbox"] as CloudProvider[]).find(
        (p) => st.connectedServices[p]
      );
      if (first) setManualProvider(first);
    })();
  }, []);

  const loadCloudGames = async () => {
    setLoadingCloud(true);
    setErrorMsg(null);
    try {
      const list = await api.listCloudGameSyncs();
      setCloudGames(list);
    } catch (err: any) {
      setErrorMsg(String(err?.message || err));
    } finally {
      setLoadingCloud(false);
    }
  };

  const loadLocalGames = async () => {
    setLoadingScan(true);
    setErrorMsg(null);
    try {
      const list = await api.scanLocalGames();
      setLocalGames(list);
    } catch (err: any) {
      setErrorMsg(String(err?.message || err));
    } finally {
      setLoadingScan(false);
    }
  };

  useEffect(() => {
    if (activeTab === "sync_here") {
      loadCloudGames();
    } else {
      loadLocalGames();
    }
  }, [activeTab]);

  // Filtrado All / Pc Games / Emulation
  const filterBySource = <T extends { gameSource?: string; source?: string; emulatorName?: string | null }>(
    list: T[]
  ): T[] => {
    if (sourceFilter === "all") return list;
    if (sourceFilter === "emulation") {
      return list.filter(
        (it) =>
          it.source === "emulation" ||
          it.gameSource === "emulation" ||
          it.gameSource === "emuatlas" ||
          it.gameSource === "emuvault" ||
          Boolean(it.emulatorName)
      );
    }
    return list.filter(
      (it) =>
        it.source !== "emulation" &&
        it.gameSource !== "emulation" &&
        it.gameSource !== "emuatlas" &&
        it.gameSource !== "emuvault" &&
        !it.emulatorName
    );
  };

  const filteredCloudGames = filterBySource(cloudGames);
  const filteredLocalGames = filterBySource(localGames);

  // --- Handlers Sync here ---
  const toggleCloudSelect = (id: string) => {
    setSelectedCloudIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSyncHereContinue = async () => {
    const selected = cloudGames.filter((g) => selectedCloudIds.includes(g.id));
    if (selected.length === 0) return;
    setSyncHereStep(2);
    setDetectingPaths(true);
    setErrorMsg(null);
    try {
      const res = await api.detectCloudGamePaths(selected);
      setDetectedPaths(res);
      const initialManual: Record<string, string> = {};
      for (const s of selected) {
        if (res[s.id]?.detected && res[s.id]?.path) {
          initialManual[s.id] = res[s.id].path!;
        }
      }
      setManualPaths(initialManual);
    } catch (err: any) {
      setErrorMsg(String(err?.message || err));
    } finally {
      setDetectingPaths(false);
    }
  };

  const openFolderPickerForSyncHere = (syncId: string, gameName: string) => {
    showModal(
      <FileExplorerModal
        mode="folder"
        title={`Seleccionar carpeta para ${gameName}`}
        onConfirm={({ folderPath }) => {
          setManualPaths((prev) => ({ ...prev, [syncId]: folderPath }));
        }}
      />
    );
  };

  const handleConfirmSyncHere = async () => {
    const selected = cloudGames.filter((g) => selectedCloudIds.includes(g.id));
    const missing = selected.filter((g) => !(manualPaths[g.id] || "").trim());
    if (missing.length > 0) {
      setErrorMsg("Selecciona la ruta para todos los juegos antes de sincronizar.");
      return;
    }
    setSyncingHere(true);
    setErrorMsg(null);
    try {
      const payload = selected.map((meta) => ({
        meta,
        localPath: manualPaths[meta.id],
      }));
      await api.linkAndPullSyncs(payload);
      Navigation.NavigateBack();
    } catch (err: any) {
      setErrorMsg(String(err?.message || err));
    } finally {
      setSyncingHere(false);
    }
  };

  // --- Handlers Upload ---
  const toggleLocalSelect = (id: string) => {
    setSelectedLocalIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleUploadContinueFromScan = () => {
    if (selectedLocalIds.length === 0) return;
    const defaultProv = connectedProviders[0] || "gdrive";
    const map: Record<string, CloudProvider> = {};
    for (const id of selectedLocalIds) {
      map[id] = uploadProviderMap[id] || defaultProv;
    }
    setUploadProviderMap(map);
    setUploadStep("confirm_scan");
  };

  const handleUploadScanned = async () => {
    const selected = localGames.filter((g) => selectedLocalIds.includes(g.id));
    setUploadingGames(true);
    setErrorMsg(null);
    try {
      await api.uploadScannedGames(
        selected.map((game) => ({
          game,
          provider: uploadProviderMap[game.id] || connectedProviders[0] || "gdrive",
        }))
      );
      Navigation.NavigateBack();
    } catch (err: any) {
      setErrorMsg(String(err?.message || err));
    } finally {
      setUploadingGames(false);
    }
  };

  const handleCreateManual = async () => {
    if (!manualName.trim() || !manualFolderPath.trim()) {
      setErrorMsg("Ingresa un nombre y selecciona una carpeta o archivos.");
      return;
    }
    setCreatingManual(true);
    setErrorMsg(null);
    try {
      const res = await api.createManualSync({
        name: manualName.trim(),
        folderPath: manualFolderPath,
        selectedFiles: manualSelectedFiles,
        provider: manualProvider,
        coverUrl: manualCoverUrl,
      });
      if (!res.ok) {
        setErrorMsg(res.error || "Error creando sincronización manual.");
        return;
      }
      Navigation.NavigateBack();
    } catch (err: any) {
      setErrorMsg(String(err?.message || err));
    } finally {
      setCreatingManual(false);
    }
  };

  const serviceOptions = connectedProviders.map((p) => ({
    data: p,
    label: PROVIDER_LABELS[p],
  }));

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        padding: "44px 24px 24px 24px",
        gap: "20px",
        color: "#fff",
        boxSizing: "border-box",
      }}
    >
      {/* Sidebar izquierdo: Add more -> Sync here | Upload */}
      <Focusable
        style={{
          width: "210px",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          background: "rgba(255,255,255,0.04)",
          padding: "16px",
          borderRadius: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
          <DialogButton
            onClick={() => Navigation.NavigateBack()}
            style={{ minWidth: "auto", padding: "6px 10px" }}
          >
            <FaArrowLeft />
          </DialogButton>
          <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 800 }}>Add more</h2>
        </div>

        <DialogButton
          onClick={() => {
            setActiveTab("sync_here");
            setSyncHereStep(1);
            setErrorMsg(null);
          }}
          style={{
            background: activeTab === "sync_here" ? "#1a9fff" : "rgba(255,255,255,0.08)",
            fontWeight: 700,
          }}
        >
          Sync here
        </DialogButton>

        <DialogButton
          onClick={() => {
            setActiveTab("upload");
            setUploadStep("scan");
            setErrorMsg(null);
          }}
          style={{
            background: activeTab === "upload" ? "#1a9fff" : "rgba(255,255,255,0.08)",
            fontWeight: 700,
          }}
        >
          Upload
        </DialogButton>
      </Focusable>

      {/* Panel derecho */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          background: "rgba(255,255,255,0.03)",
          borderRadius: "12px",
          padding: "18px",
          overflow: "hidden",
        }}
      >
        {/* Filtros All | Pc Games | Emulation */}
        {!(activeTab === "upload" && uploadStep === "manual") && (
          <Focusable
            flow-children="horizontal"
            style={{ display: "flex", gap: "8px", marginBottom: "16px" }}
          >
            {(
              [
                { id: "all", label: "All" },
                { id: "pc", label: "Pc Games" },
                { id: "emulation", label: "Emulation" },
              ] as Array<{ id: SourceFilter; label: string }>
            ).map((f) => (
              <DialogButton
                key={f.id}
                onClick={() => setSourceFilter(f.id)}
                style={{
                  minWidth: "100px",
                  padding: "6px 14px",
                  fontSize: "12px",
                  background: sourceFilter === f.id ? "#1a9fff" : "rgba(255,255,255,0.08)",
                  fontWeight: 700,
                }}
              >
                {f.label}
              </DialogButton>
            ))}
          </Focusable>
        )}

        {errorMsg && (
          <div
            style={{
              background: "rgba(239,68,68,0.22)",
              border: "1px solid rgba(239,68,68,0.6)",
              padding: "8px 12px",
              borderRadius: "8px",
              marginBottom: "12px",
              fontSize: "12px",
            }}
          >
            {errorMsg}
          </div>
        )}

        {/* ==================== TAB: SYNC HERE ==================== */}
        {activeTab === "sync_here" && syncHereStep === 1 && (
          <>
            <div style={{ flex: 1, overflowY: "auto" }}>
              {loadingCloud ? (
                <div style={{ padding: "40px", textAlign: "center", opacity: 0.7 }}>
                  Buscando saves de videojuegos en tu nube...
                </div>
              ) : filteredCloudGames.length === 0 ? (
                <div style={{ padding: "40px", textAlign: "center", opacity: 0.7 }}>
                  No se encontraron saves de videojuegos pendientes en tu nube para este filtro.
                </div>
              ) : (
                <Focusable
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
                    gap: "12px",
                  }}
                >
                  {filteredCloudGames.map((game) => {
                    const selected = selectedCloudIds.includes(game.id);
                    return (
                      <DialogButton
                        key={game.id}
                        onClick={() => toggleCloudSelect(game.id)}
                        style={{
                          padding: "8px",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: "8px",
                          background: selected
                            ? "rgba(26,159,255,0.28)"
                            : "rgba(255,255,255,0.06)",
                          border: selected ? "2px solid #38bdf8" : "1px solid rgba(255,255,255,0.1)",
                          borderRadius: "10px",
                        }}
                      >
                        <div
                          style={{
                            width: "100%",
                            height: "90px",
                            borderRadius: "6px",
                            overflow: "hidden",
                            background: "rgba(0,0,0,0.4)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            position: "relative",
                          }}
                        >
                          {game.coverDataUrl ? (
                            <img
                              src={game.coverDataUrl}
                              alt={game.name}
                              style={{ width: "100%", height: "100%", objectFit: "cover" }}
                            />
                          ) : (
                            <FaGamepad size={28} color="#60a5fa" />
                          )}
                          {selected && (
                            <div
                              style={{
                                position: "absolute",
                                top: "6px",
                                right: "6px",
                                background: "#10b981",
                                borderRadius: "999px",
                                padding: "4px",
                              }}
                            >
                              <FaCheck size={10} color="#000" />
                            </div>
                          )}
                        </div>
                        <div
                          style={{
                            fontSize: "12px",
                            fontWeight: 700,
                            textAlign: "center",
                            width: "100%",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {game.name}
                        </div>
                      </DialogButton>
                    );
                  })}
                </Focusable>
              )}
            </div>

            <Focusable
              flow-children="horizontal"
              style={{ display: "flex", justifyContent: "flex-end", paddingTop: "12px" }}
            >
              <DialogButton
                disabled={selectedCloudIds.length === 0}
                onClick={handleSyncHereContinue}
                style={{ minWidth: "130px", background: "#1a9fff", fontWeight: 700 }}
              >
                Continue ({selectedCloudIds.length})
              </DialogButton>
            </Focusable>
          </>
        )}

        {activeTab === "sync_here" && syncHereStep === 2 && (
          <>
            <div style={{ flex: 1, overflowY: "auto" }}>
              {detectingPaths ? (
                <div style={{ padding: "40px", textAlign: "center", opacity: 0.75 }}>
                  Detectando rutas de guardado en tu Steam Deck...
                </div>
              ) : (
                <Focusable
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(175px, 1fr))",
                    gap: "12px",
                  }}
                >
                  {cloudGames
                    .filter((g) => selectedCloudIds.includes(g.id))
                    .map((game) => {
                      const det = detectedPaths[game.id];
                      const chosenPath = manualPaths[game.id] || "";
                      const hasPath = Boolean(chosenPath.trim());

                      return (
                        <div
                          key={game.id}
                          style={{
                            padding: "10px",
                            background: "rgba(255,255,255,0.06)",
                            borderRadius: "10px",
                            border: "1px solid rgba(255,255,255,0.12)",
                            display: "flex",
                            flexDirection: "column",
                            gap: "8px",
                          }}
                        >
                          <div
                            style={{
                              width: "100%",
                              height: "85px",
                              borderRadius: "6px",
                              overflow: "hidden",
                              background: "rgba(0,0,0,0.4)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            {game.coverDataUrl ? (
                              <img
                                src={game.coverDataUrl}
                                alt={game.name}
                                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                              />
                            ) : (
                              <FaGamepad size={26} color="#60a5fa" />
                            )}
                          </div>

                          <div
                            style={{
                              fontSize: "12px",
                              fontWeight: 700,
                              textAlign: "center",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {game.name}
                          </div>

                          {hasPath ? (
                            <>
                              <div
                                style={{
                                  fontSize: "11px",
                                  textAlign: "center",
                                  color: "#34d399",
                                  fontWeight: 700,
                                  background: "rgba(16,185,129,0.16)",
                                  padding: "3px 6px",
                                  borderRadius: "6px",
                                }}
                              >
                                {det?.detected ? "Path detected" : "Ruta seleccionada"}
                              </div>
                              <DialogButton
                                onClick={() =>
                                  showModal(
                                    <DetectedPathViewerModal
                                      gameName={game.name}
                                      path={chosenPath}
                                      reason={det?.reason}
                                      onChangePath={() =>
                                        openFolderPickerForSyncHere(game.id, game.name)
                                      }
                                    />
                                  )
                                }
                                style={{ padding: "5px 8px", fontSize: "11px" }}
                              >
                                Path
                              </DialogButton>
                            </>
                          ) : (
                            <DialogButton
                              onClick={() => openFolderPickerForSyncHere(game.id, game.name)}
                              style={{
                                padding: "6px 8px",
                                fontSize: "11px",
                                background: "#f59e0b",
                                color: "#000",
                                fontWeight: 700,
                              }}
                            >
                              Select Path
                            </DialogButton>
                          )}
                        </div>
                      );
                    })}
                </Focusable>
              )}
            </div>

            <Focusable
              flow-children="horizontal"
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
                paddingTop: "12px",
              }}
            >
              <DialogButton
                onClick={() => setSyncHereStep(1)}
                disabled={syncingHere}
                style={{ minWidth: "110px" }}
              >
                Cancel
              </DialogButton>
              <DialogButton
                onClick={handleConfirmSyncHere}
                disabled={syncingHere || detectingPaths}
                style={{ minWidth: "120px", background: "#10b981", color: "#000", fontWeight: 700 }}
              >
                {syncingHere ? "Syncing..." : "Sync"}
              </DialogButton>
            </Focusable>
          </>
        )}

        {/* ==================== TAB: UPLOAD (SCAN) ==================== */}
        {activeTab === "upload" && uploadStep === "scan" && (
          <>
            <div style={{ flex: 1, overflowY: "auto" }}>
              {loadingScan ? (
                <div style={{ padding: "40px", textAlign: "center", opacity: 0.7 }}>
                  Escaneando saves de juegos y emuladores en tu Steam Deck...
                </div>
              ) : filteredLocalGames.length === 0 ? (
                <div style={{ padding: "40px", textAlign: "center", opacity: 0.7 }}>
                  No se detectaron saves automáticamente para este filtro. Puedes usar{" "}
                  <strong>Add manual</strong>.
                </div>
              ) : (
                <Focusable
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
                    gap: "12px",
                  }}
                >
                  {filteredLocalGames.map((game) => {
                    const selected = selectedLocalIds.includes(game.id);
                    return (
                      <DialogButton
                        key={game.id}
                        onClick={() => toggleLocalSelect(game.id)}
                        style={{
                          padding: "8px",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: "8px",
                          background: selected
                            ? "rgba(26,159,255,0.28)"
                            : "rgba(255,255,255,0.06)",
                          border: selected ? "2px solid #38bdf8" : "1px solid rgba(255,255,255,0.1)",
                          borderRadius: "10px",
                        }}
                      >
                        <div
                          style={{
                            width: "100%",
                            height: "90px",
                            borderRadius: "6px",
                            overflow: "hidden",
                            background: "rgba(0,0,0,0.4)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            position: "relative",
                          }}
                        >
                          {game.coverUrl ? (
                            <img
                              src={game.coverUrl}
                              alt={game.name}
                              style={{ width: "100%", height: "100%", objectFit: "cover" }}
                            />
                          ) : (
                            <FaGamepad size={28} color="#60a5fa" />
                          )}
                          {selected && (
                            <div
                              style={{
                                position: "absolute",
                                top: "6px",
                                right: "6px",
                                background: "#10b981",
                                borderRadius: "999px",
                                padding: "4px",
                              }}
                            >
                              <FaCheck size={10} color="#000" />
                            </div>
                          )}
                        </div>
                        <div
                          style={{
                            fontSize: "12px",
                            fontWeight: 700,
                            textAlign: "center",
                            width: "100%",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {game.name}
                        </div>
                      </DialogButton>
                    );
                  })}
                </Focusable>
              )}
            </div>

            <Focusable
              flow-children="horizontal"
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
                paddingTop: "12px",
              }}
            >
              <DialogButton
                onClick={() => {
                  setUploadStep("manual");
                  setErrorMsg(null);
                }}
                style={{
                  minWidth: "130px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                }}
              >
                <FaPlus />
                <span>Add manual</span>
              </DialogButton>
              <DialogButton
                disabled={selectedLocalIds.length === 0}
                onClick={handleUploadContinueFromScan}
                style={{ minWidth: "130px", background: "#1a9fff", fontWeight: 700 }}
              >
                Continue ({selectedLocalIds.length})
              </DialogButton>
            </Focusable>
          </>
        )}

        {/* ==================== TAB: UPLOAD (CONFIRMAR ESCANEADOS) ==================== */}
        {activeTab === "upload" && uploadStep === "confirm_scan" && (
          <>
            <div style={{ flex: 1, overflowY: "auto" }}>
              <Focusable style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {localGames
                  .filter((g) => selectedLocalIds.includes(g.id))
                  .map((game) => (
                    <div
                      key={game.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        padding: "10px 14px",
                        background: "rgba(255,255,255,0.06)",
                        borderRadius: "10px",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: "14px" }}>{game.name}</div>
                        <div
                          style={{
                            fontSize: "11px",
                            opacity: 0.7,
                            fontFamily: "monospace",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {game.localPath}
                        </div>
                      </div>
                      <div style={{ width: "180px" }}>
                        <Dropdown
                          rgOptions={serviceOptions}
                          selectedOption={uploadProviderMap[game.id] || connectedProviders[0] || "gdrive"}
                          onChange={(opt) =>
                            setUploadProviderMap((prev) => ({
                              ...prev,
                              [game.id]: opt.data as CloudProvider,
                            }))
                          }
                        />
                      </div>
                    </div>
                  ))}
              </Focusable>
            </div>

            <Focusable
              flow-children="horizontal"
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
                paddingTop: "12px",
              }}
            >
              <DialogButton
                onClick={() => setUploadStep("scan")}
                disabled={uploadingGames}
                style={{ minWidth: "110px" }}
              >
                Cancel
              </DialogButton>
              <DialogButton
                onClick={handleUploadScanned}
                disabled={uploadingGames || connectedProviders.length === 0}
                style={{ minWidth: "130px", background: "#10b981", color: "#000", fontWeight: 700 }}
              >
                {uploadingGames ? "Subiendo..." : "Sync"}
              </DialogButton>
            </Focusable>
          </>
        )}

        {/* ==================== TAB: UPLOAD -> ADD MANUAL ==================== */}
        {activeTab === "upload" && uploadStep === "manual" && (
          <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "space-between" }}>
            <div>
              <h2 style={{ margin: "0 0 18px 0", fontSize: "18px", fontWeight: 800 }}>
                Add manual
              </h2>

              <Focusable
                flow-children="horizontal"
                style={{ display: "flex", gap: "20px", alignItems: "flex-start" }}
              >
                {/* Izquierda: Buscar imagen (ventanita flotante DuckDuckGo) */}
                <DialogButton
                  onClick={() =>
                    showModal(
                      <CoverSearchModal
                        initialQuery={manualName}
                        onSelect={(url) => setManualCoverUrl(url)}
                      />
                    )
                  }
                  style={{
                    width: "160px",
                    height: "160px",
                    padding: 0,
                    overflow: "hidden",
                    borderRadius: "12px",
                    background: "rgba(255,255,255,0.06)",
                    border: "1px dashed rgba(255,255,255,0.3)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    flexShrink: 0,
                  }}
                >
                  {manualCoverUrl ? (
                    <img
                      src={manualCoverUrl}
                      alt="Carátula"
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <>
                      <FaImage size={28} color="#60a5fa" />
                      <span style={{ fontSize: "12px", fontWeight: 600 }}>Buscar imagen</span>
                      <FaSearch size={12} style={{ opacity: 0.65 }} />
                    </>
                  )}
                </DialogButton>

                {/* Derecha: Name, Select files, Select service */}
                <Focusable
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                  }}
                >
                  <TextField
                    label="Name"
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                    placeholder="Nombre del juego o sincronización"
                  />

                  <DialogButton
                    onClick={() =>
                      showModal(
                        <FileExplorerModal
                          mode="files-or-folder"
                          title="Seleccionar carpeta o archivos"
                          onConfirm={({ folderPath, selectedFiles }) => {
                            setManualFolderPath(folderPath);
                            setManualSelectedFiles(selectedFiles);
                          }}
                        />
                      )
                    }
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 14px",
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <FaFolderOpen color="#60a5fa" />
                      <span>Select files</span>
                    </span>
                    <span
                      style={{
                        fontSize: "11px",
                        opacity: 0.8,
                        fontFamily: "monospace",
                        maxWidth: "240px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {manualFolderPath
                        ? manualSelectedFiles.length > 0
                          ? `${manualSelectedFiles.length} archivo(s) en ${manualFolderPath}`
                          : manualFolderPath
                        : "Ninguno seleccionado"}
                    </span>
                  </DialogButton>

                  <div>
                    <div style={{ fontSize: "12px", opacity: 0.75, marginBottom: "4px" }}>
                      Select service
                    </div>
                    {serviceOptions.length > 0 ? (
                      <Dropdown
                        rgOptions={serviceOptions}
                        selectedOption={manualProvider}
                        onChange={(opt) => setManualProvider(opt.data as CloudProvider)}
                      />
                    ) : (
                      <div style={{ fontSize: "12px", color: "#fbbf24" }}>
                        Conecta primero un servicio en Services.
                      </div>
                    )}
                  </div>
                </Focusable>
              </Focusable>
            </div>

            <Focusable
              flow-children="horizontal"
              style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}
            >
              <DialogButton
                onClick={() => setUploadStep("scan")}
                disabled={creatingManual}
                style={{ minWidth: "110px" }}
              >
                Cancel
              </DialogButton>
              <DialogButton
                onClick={handleCreateManual}
                disabled={creatingManual || connectedProviders.length === 0}
                style={{ minWidth: "130px", background: "#1a9fff", fontWeight: 700 }}
              >
                {creatingManual ? "Creando..." : "Continue"}
              </DialogButton>
            </Focusable>
          </div>
        )}
      </div>
    </div>
  );
}
