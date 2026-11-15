import {
  DialogButton,
  Focusable,
  Navigation,
  PanelSection,
  PanelSectionRow,
  showModal,
} from "@decky/ui";
import { useEffect, useState } from "react";
import {
  FaCloudDownloadAlt,
  FaCloudUploadAlt,
  FaFolderOpen,
  FaGamepad,
  FaPlus,
  FaServer,
  FaSync,
  FaTrash,
} from "react-icons/fa";
import { api } from "../api";
import {
  PROVIDER_LABELS,
  type CloudProvider,
  type LocalSync,
  type PluginState,
} from "../types";
import { DeleteSyncModal } from "./DeleteSyncModal";

function PathPreviewModal({
  closeModal,
  sync,
}: {
  closeModal?: () => void;
  sync: LocalSync;
}) {
  return (
    <div
      style={{
        background: "#1b2028",
        color: "#fff",
        padding: "18px",
        borderRadius: "10px",
        minWidth: "380px",
        maxWidth: "540px",
      }}
    >
      <h3 style={{ margin: "0 0 8px 0", fontSize: "16px" }}>{sync.name}</h3>
      <div style={{ fontSize: "12px", opacity: 0.75, marginBottom: "6px" }}>Ruta local en Steam Deck:</div>
      <div
        style={{
          fontFamily: "monospace",
          fontSize: "12px",
          background: "rgba(0,0,0,0.35)",
          padding: "8px 10px",
          borderRadius: "6px",
          wordBreak: "break-all",
          marginBottom: "10px",
        }}
      >
        {sync.localPath}
      </div>
      {sync.ignoredPaths && sync.ignoredPaths.length > 0 && (
        <div style={{ fontSize: "11px", opacity: 0.75, marginBottom: "12px" }}>
          Ignorando {sync.ignoredPaths.length} elemento(s) fuera de los archivos seleccionados.
        </div>
      )}
      <DialogButton onClick={closeModal}>Cerrar</DialogButton>
    </div>
  );
}

export function QamPanel() {
  const [state, setState] = useState<PluginState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const loadState = async (refreshCloud = false) => {
    setLoading(true);
    try {
      const next = refreshCloud ? await api.refreshLocalStatuses() : await api.getState();
      setState(next);
    } catch (err) {
      console.error("Error cargando estado DeckSeinen:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadState(true);
  }, []);

  const runCardAction = async (
    syncId: string,
    action: "smart" | "pull" | "push"
  ) => {
    setBusyId(syncId);
    setStatusMsg(null);
    try {
      const res =
        action === "smart"
          ? await api.smartSync(syncId)
          : action === "pull"
            ? await api.pullSync(syncId)
            : await api.pushSync(syncId);
      if (res.state) setState(res.state);
      if (!res.ok && res.error) {
        setStatusMsg(res.error);
      }
    } catch (err: any) {
      setStatusMsg(String(err?.message || err));
    } finally {
      setBusyId(null);
    }
  };

  const handleOpenDelete = (sync: LocalSync) => {
    showModal(
      <DeleteSyncModal
        sync={sync}
        onConfirmDelete={async (deleteFromCloud) => {
          const res = await api.deleteSync(sync.id, deleteFromCloud);
          if (res.state) setState(res.state);
        }}
      />
    );
  };

  const localSyncs = state?.localSyncs || [];
  const deviceName = state?.deviceName || "Steam Deck";
  const providersOrder: CloudProvider[] = ["gdrive", "onedrive", "dropbox"];

  const grouped = providersOrder
    .map((provider) => ({
      provider,
      label: PROVIDER_LABELS[provider],
      items: localSyncs.filter((s) => (s.provider || "gdrive") === provider),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <div>
      <PanelSection>
        <PanelSectionRow>
          <Focusable
            flow-children="horizontal"
            style={{ display: "flex", gap: "8px", width: "100%" }}
          >
            <DialogButton
              onClick={() => {
                Navigation.CloseSideMenus();
                Navigation.Navigate("/deck-seinen/services");
              }}
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                padding: "8px",
                fontSize: "12px",
              }}
            >
              <FaServer />
              <span>Services</span>
            </DialogButton>
            <DialogButton
              onClick={() => {
                Navigation.CloseSideMenus();
                Navigation.Navigate("/deck-seinen/add-more");
              }}
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                padding: "8px",
                fontSize: "12px",
                background: "#1a9fff",
                color: "#fff",
              }}
            >
              <FaPlus />
              <span>Add more</span>
            </DialogButton>
          </Focusable>
        </PanelSectionRow>

        {statusMsg && (
          <PanelSectionRow>
            <div
              style={{
                fontSize: "11px",
                color: "#fca5a5",
                background: "rgba(239,68,68,0.18)",
                padding: "6px 8px",
                borderRadius: "6px",
              }}
            >
              {statusMsg}
            </div>
          </PanelSectionRow>
        )}
      </PanelSection>

      {loading && localSyncs.length === 0 ? (
        <PanelSection>
          <PanelSectionRow>
            <div style={{ fontSize: "12px", opacity: 0.7 }}>Cargando sincronizaciones...</div>
          </PanelSectionRow>
        </PanelSection>
      ) : grouped.length === 0 ? (
        <PanelSection title="Sincronizaciones">
          <PanelSectionRow>
            <div style={{ fontSize: "12px", opacity: 0.78, lineHeight: 1.45 }}>
              No tienes sincronizaciones agregadas en esta Steam Deck todavía. Usa{" "}
              <strong>Services</strong> para conectar tu cuenta y <strong>Add more</strong> para
              vincular o subir partidas.
            </div>
          </PanelSectionRow>
        </PanelSection>
      ) : (
        grouped.map((group) => (
          <PanelSection key={group.provider} title={group.label}>
            {group.items.map((sync) => {
              const isPending =
                Boolean(sync.lastPushDevice) && sync.lastPushDevice !== deviceName;
              const isBusy = busyId === sync.id;

              return (
                <PanelSectionRow key={sync.id}>
                  <div
                    style={{
                      width: "100%",
                      background: "rgba(255,255,255,0.06)",
                      borderRadius: "10px",
                      padding: "8px",
                      border: isPending
                        ? "1px solid rgba(251,191,36,0.55)"
                        : "1px solid rgba(255,255,255,0.1)",
                      marginBottom: "6px",
                    }}
                  >
                    {/* Fila principal: Carátula + Info + botón sync */}
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <div
                        style={{
                          width: "54px",
                          height: "54px",
                          borderRadius: "8px",
                          overflow: "hidden",
                          background: "rgba(0,0,0,0.4)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {sync.coverDataUrl ? (
                          <img
                            src={sync.coverDataUrl}
                            alt={sync.name}
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        ) : (
                          <FaGamepad size={22} color="#60a5fa" />
                        )}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: "13px",
                            fontWeight: 700,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {sync.name}
                        </div>
                        <div
                          style={{
                            fontSize: "11px",
                            fontWeight: 600,
                            color: isPending ? "#fbbf24" : "#34d399",
                          }}
                        >
                          {isPending ? "Pending" : "Up to date"}
                        </div>
                        <div
                          style={{
                            fontSize: "10px",
                            opacity: 0.72,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {sync.lastPushDevice || deviceName}
                        </div>
                      </div>

                      <DialogButton
                        disabled={isBusy}
                        onClick={() => runCardAction(sync.id, "smart")}
                        style={{
                          minWidth: "56px",
                          padding: "6px 8px",
                          fontSize: "11px",
                          background: isPending ? "#f59e0b" : "#1a9fff",
                          color: isPending ? "#000" : "#fff",
                          fontWeight: 700,
                        }}
                      >
                        {isBusy ? "..." : "sync"}
                      </DialogButton>
                    </div>

                    {/* Fila inferior: 3 botones (Pull, Push, Ruta) + Eliminar (reemplaza la tuerquita) */}
                    <Focusable
                      flow-children="horizontal"
                      style={{
                        display: "flex",
                        gap: "6px",
                        marginTop: "8px",
                      }}
                    >
                      <DialogButton
                        disabled={isBusy}
                        onClick={() => runCardAction(sync.id, "pull")}
                        style={{
                          flex: 1,
                          padding: "5px",
                          minWidth: "auto",
                          fontSize: "11px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "4px",
                        }}
                      >
                        <FaCloudDownloadAlt />
                        <span>Pull</span>
                      </DialogButton>
                      <DialogButton
                        disabled={isBusy}
                        onClick={() => runCardAction(sync.id, "push")}
                        style={{
                          flex: 1,
                          padding: "5px",
                          minWidth: "auto",
                          fontSize: "11px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "4px",
                        }}
                      >
                        <FaCloudUploadAlt />
                        <span>Push</span>
                      </DialogButton>
                      <DialogButton
                        disabled={isBusy}
                        onClick={() => showModal(<PathPreviewModal sync={sync} />)}
                        style={{
                          padding: "5px 8px",
                          minWidth: "auto",
                          fontSize: "11px",
                        }}
                      >
                        <FaFolderOpen />
                      </DialogButton>
                      <DialogButton
                        disabled={isBusy}
                        onClick={() => handleOpenDelete(sync)}
                        style={{
                          padding: "5px 8px",
                          minWidth: "auto",
                          fontSize: "11px",
                          background: "rgba(239,68,68,0.22)",
                          color: "#fca5a5",
                        }}
                      >
                        <FaTrash />
                      </DialogButton>
                    </Focusable>
                  </div>
                </PanelSectionRow>
              );
            })}
          </PanelSection>
        ))
      )}

      <PanelSection>
        <PanelSectionRow>
          <DialogButton
            onClick={() => loadState(true)}
            disabled={loading}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              fontSize: "12px",
            }}
          >
            <FaSync />
            <span>{loading ? "Actualizando..." : "Actualizar estado"}</span>
          </DialogButton>
        </PanelSectionRow>
      </PanelSection>
    </div>
  );
}
