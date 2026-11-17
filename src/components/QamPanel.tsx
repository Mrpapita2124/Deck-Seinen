import {
  DialogButton,
  Focusable,
  Navigation,
  PanelSection,
  PanelSectionRow,
  TextField,
  showModal,
} from "@decky/ui";
import { useEffect, useRef, useState } from "react";
import {
  FaArrowLeft,
  FaCheckCircle,
  FaCloud,
  FaCloudDownloadAlt,
  FaCloudUploadAlt,
  FaExternalLinkAlt,
  FaFolderOpen,
  FaGamepad,
  FaPlus,
  FaPowerOff,
  FaServer,
  FaSignOutAlt,
  FaSync,
  FaTrash,
} from "react-icons/fa";
import { api } from "../api";
import { useLang } from "../i18n";
import {
  PROVIDER_LABELS,
  type CloudProvider,
  type LocalSync,
  type PluginState,
  type SyncProgress,
} from "../types";
import { DeleteSyncModal } from "./DeleteSyncModal";
import { SyncProgressBar } from "./SyncProgressBar";

function PathPreviewModal({
  closeModal,
  sync,
}: {
  closeModal?: () => void;
  sync: LocalSync;
}) {
  const [, , tr] = useLang();
  return (
    <div
      style={{
        background: "#1b2028",
        color: "#fff",
        padding: "18px",
        borderRadius: "10px",
        minWidth: "360px",
        maxWidth: "520px",
      }}
    >
      <h3 style={{ margin: "0 0 8px 0", fontSize: "16px" }}>{sync.name}</h3>
      <div style={{ fontSize: "12px", opacity: 0.75, marginBottom: "6px" }}>
        {tr("Local path on Steam Deck:", "Ruta local en Steam Deck:")}
      </div>
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
          {tr(
            `Ignoring ${sync.ignoredPaths.length} item(s) outside selected files.`,
            `Ignorando ${sync.ignoredPaths.length} elemento(s) fuera de los archivos seleccionados.`
          )}
        </div>
      )}
      <DialogButton onClick={closeModal}>{tr("Close", "Cerrar")}</DialogButton>
    </div>
  );
}

export function QamPanel() {
  const [lang, setLang, tr] = useLang();
  const [state, setState] = useState<PluginState | null>(null);
  const [loading, setLoading] = useState(true);
  const [pluginOff, setPluginOff] = useState(false);
  const [view, setView] = useState<"syncs" | "services">("syncs");
  const [initialViewResolved, setInitialViewResolved] = useState(false);

  // Estados vista Sincronizaciones
  const [busyId, setBusyId] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Estados vista Servicios (inline, no sobrepuesta)
  const [deviceNameInput, setDeviceNameInput] = useState("Steam Deck");
  const [savingDevice, setSavingDevice] = useState(false);
  const [authProvider, setAuthProvider] = useState<CloudProvider | null>(null);
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const pollTimer = useRef<number | null>(null);

  const loadState = async (refreshCloud = false) => {
    setLoading(true);
    try {
      const next = refreshCloud ? await api.refreshLocalStatuses() : await api.getState();
      setState(next);
      setDeviceNameInput(next.deviceName || "Steam Deck");
      const anyConnected = Object.values(next.connectedServices || {}).some(Boolean);
      if (!initialViewResolved) {
        setView(anyConnected ? "syncs" : "services");
        setInitialViewResolved(true);
      } else if (!anyConnected) {
        setView("services");
      }
    } catch (err) {
      console.error("Error cargando estado DeckSeinen:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadState(false);
    return () => {
      if (pollTimer.current) window.clearInterval(pollTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!busyId) {
      setSyncProgress(null);
      return;
    }
    let cancelled = false;
    const poll = async () => {
      try {
        const p = await api.getSyncProgress();
        if (!cancelled) setSyncProgress(p);
      } catch {
        // ignore
      }
    };
    poll();
    const id = window.setInterval(poll, 300);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [busyId]);

  // --- Acciones de Sesiones / Servicios ---
  const startLogin = async (provider: CloudProvider) => {
    setStatusMsg(null);
    setAuthProvider(provider);
    setAuthUrl(null);
    try {
      const res = await api.startAuth(provider);
      if (!res.ok) {
        setStatusMsg(res.error || "No se pudo iniciar sesión");
        setAuthProvider(null);
        return;
      }
      if (res.authUrl) setAuthUrl(res.authUrl);
      if (pollTimer.current) window.clearInterval(pollTimer.current);
      pollTimer.current = window.setInterval(async () => {
        const poll = await api.pollAuth(provider);
        if (poll.authUrl) setAuthUrl(poll.authUrl);
        if (poll.done) {
          if (pollTimer.current) window.clearInterval(pollTimer.current);
          setAuthProvider(null);
          setAuthUrl(null);
          if (poll.error && !poll.connected) {
            setStatusMsg(poll.error);
          }
          await loadState(false);
        }
      }, 1500);
    } catch (err: any) {
      setStatusMsg(String(err?.message || err));
      setAuthProvider(null);
    }
  };

  const openInSteamBrowser = (url: string) => {
    Navigation.CloseSideMenus();
    Navigation.NavigateToExternalWeb(url);
  };

  const cancelLogin = async () => {
    if (pollTimer.current) window.clearInterval(pollTimer.current);
    if (authProvider) {
      await api.cancelAuth(authProvider);
    }
    setAuthProvider(null);
    setAuthUrl(null);
  };

  const handleLogout = async (provider: CloudProvider) => {
    await api.logoutProvider(provider);
    await loadState(false);
  };

  const handleSaveDeviceName = async () => {
    setSavingDevice(true);
    try {
      await api.setDeviceName(deviceNameInput);
      await loadState(false);
    } finally {
      setSavingDevice(false);
    }
  };

  // --- Acciones de Sincronizaciones ---
  const runCardAction = async (syncId: string, action: "smart" | "pull" | "push") => {
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
          return res;
        }}
      />
    );
  };

  const connectedServices = state?.connectedServices || {
    gdrive: false,
    onedrive: false,
    dropbox: false,
  };
  const anyConnected = Object.values(connectedServices).some(Boolean);
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

  if (pluginOff) {
    return (
      <div style={{ width: "100%", maxWidth: "100%", overflowX: "hidden", boxSizing: "border-box" }}>
        <PanelSection title={tr("DeckSeinen standby", "DeckSeinen en espera")}>
          <PanelSectionRow>
            <div style={{ fontSize: "12px", opacity: 0.78, padding: "4px 0" }}>
              {tr(
                "The plugin is turned off. It will turn back on automatically next time you open DeckSeinen, or you can turn it on now.",
                "El plugin está apagado. Se volverá a encender automáticamente la próxima vez que abras DeckSeinen, o puedes encenderlo ahora."
              )}
            </div>
          </PanelSectionRow>
          <PanelSectionRow>
            <DialogButton
              onClick={() => setPluginOff(false)}
              style={{
                width: "100%",
                minWidth: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                fontSize: "12px",
                boxSizing: "border-box",
              }}
            >
              <FaPowerOff />
              <span>{tr("Turn on DeckSeinen", "Encender DeckSeinen")}</span>
            </DialogButton>
          </PanelSectionRow>
        </PanelSection>
      </div>
    );
  }

  // ==================== VISTA DE SERVICIOS (INLINE) ====================
  if (view === "services") {
    return (
      <div style={{ width: "100%", maxWidth: "100%", overflowX: "hidden", boxSizing: "border-box" }}>
        <PanelSection title={tr("Cloud services", "Servicios en la nube")}>
          {anyConnected && (
            <PanelSectionRow>
              <DialogButton
                onClick={() => setView("syncs")}
                style={{
                  width: "100%",
                  minWidth: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  padding: "8px",
                  fontSize: "12px",
                  fontWeight: 700,
                }}
              >
                <FaArrowLeft />
                <span>{tr("Go to Syncs", "Ir a Sincronizaciones")}</span>
              </DialogButton>
            </PanelSectionRow>
          )}

          {!anyConnected && (
            <PanelSectionRow>
              <div style={{ fontSize: "12px", opacity: 0.8, lineHeight: 1.4 }}>
                {tr("Connect at least one service (", "Conecta al menos un servicio (")}
                <strong>Google Drive</strong>, <strong>OneDrive</strong>{" "}
                {tr("or", "o")} <strong>DropBox</strong>
                {tr(") to get started.", ") para comenzar.")}
              </div>
            </PanelSectionRow>
          )}

          {syncProgress?.active && (
          <PanelSectionRow>
            <SyncProgressBar progress={syncProgress} compact />
          </PanelSectionRow>
        )}

        {statusMsg && (
            <PanelSectionRow>
              <div
                style={{
                  fontSize: "11px",
                  color: "#fca5a5",
                  background: "rgba(239,68,68,0.18)",
                  padding: "6px 8px",
                  borderRadius: "6px",
                  wordBreak: "break-word",
                }}
              >
                {statusMsg}
              </div>
            </PanelSectionRow>
          )}

          {providersOrder.map((provider) => {
            const isConnected = connectedServices[provider];
            const isAuth = authProvider === provider;

            return (
              <PanelSectionRow key={provider}>
                <div
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    background: "rgba(255,255,255,0.06)",
                    borderRadius: "10px",
                    padding: "10px",
                    border: isConnected
                      ? "1px solid rgba(52,211,153,0.45)"
                      : "1px solid rgba(255,255,255,0.1)",
                    marginBottom: "6px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "8px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                      <FaCloud color={isConnected ? "#34d399" : "#94a3b8"} />
                      <span style={{ fontSize: "13px", fontWeight: 700 }}>
                        {PROVIDER_LABELS[provider]}
                      </span>
                    </div>
                    {isConnected && <FaCheckCircle color="#34d399" size={14} />}
                  </div>

                  {!isAuth && (
                    <div style={{ marginTop: "8px" }}>
                      {isConnected ? (
                        <DialogButton
                          onClick={() => handleLogout(provider)}
                          style={{
                            width: "100%",
                            minWidth: 0,
                            padding: "6px 8px",
                            fontSize: "11px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "6px",
                          }}
                        >
                          <FaSignOutAlt />
                          <span>{tr("Sign out", "Cerrar sesión")}</span>
                        </DialogButton>
                      ) : (
                        <DialogButton
                          onClick={() => startLogin(provider)}
                          style={{
                            width: "100%",
                            minWidth: 0,
                            padding: "6px 8px",
                            fontSize: "11px",
                            fontWeight: 700,
                          }}
                        >
                          {tr("Sign in", "Iniciar sesión")}
                        </DialogButton>
                      )}
                    </div>
                  )}

                  {isAuth && (
                    <div
                      style={{
                        marginTop: "10px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                      }}
                    >
                      {!authUrl ? (
                        <div style={{ fontSize: "11px", opacity: 0.75 }}>
                          {tr("Generating login link...", "Generando enlace de acceso...")}
                        </div>
                      ) : (
                        <>
                          <DialogButton
                            onClick={() => openInSteamBrowser(authUrl)}
                            style={{
                              width: "100%",
                              minWidth: 0,
                              padding: "7px 8px",
                              fontSize: "11px",
                              fontWeight: 700,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: "6px",
                            }}
                          >
                            <FaExternalLinkAlt size={11} />
                            <span>{tr("Open Steam browser", "Abrir navegador de Steam")}</span>
                          </DialogButton>
                        </>
                      )}

                      <DialogButton
                        onClick={cancelLogin}
                        style={{ width: "100%", minWidth: 0, padding: "6px", fontSize: "11px" }}
                      >
                        {tr("Cancel", "Cancelar")}
                      </DialogButton>
                    </div>
                  )}
                </div>
              </PanelSectionRow>
            );
          })}
        </PanelSection>

        <PanelSection title={tr("Settings", "Ajustes")}>
          <PanelSectionRow>
            <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "6px" }}>
              <div style={{ fontSize: "11px", opacity: 0.75 }}>
                {tr("Language / Idioma", "Idioma / Language")}
              </div>
              <Focusable
                flow-children="horizontal"
                style={{ display: "flex", gap: "6px", width: "100%", marginBottom: "6px" }}
              >
                <DialogButton
                  onClick={() => setLang("en")}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    padding: "6px",
                    fontSize: "11px",
                    fontWeight: lang === "en" ? 700 : 400,
                    borderBottom: lang === "en" ? "3px solid #38bdf8" : "3px solid transparent",
                  }}
                >
                  English
                </DialogButton>
                <DialogButton
                  onClick={() => setLang("es")}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    padding: "6px",
                    fontSize: "11px",
                    fontWeight: lang === "es" ? 700 : 400,
                    borderBottom: lang === "es" ? "3px solid #38bdf8" : "3px solid transparent",
                  }}
                >
                  Español
                </DialogButton>
              </Focusable>

              <div style={{ fontSize: "11px", opacity: 0.75 }}>
                {tr("Device name", "Nombre del dispositivo")}
              </div>
              <TextField
                value={deviceNameInput}
                onChange={(e) => setDeviceNameInput(e.target.value)}
                placeholder="Steam Deck"
              />
              <DialogButton
                disabled={savingDevice}
                onClick={handleSaveDeviceName}
                style={{ width: "100%", minWidth: 0, padding: "6px", fontSize: "11px" }}
              >
                {savingDevice
                  ? tr("Saving...", "Guardando...")
                  : tr("Save name", "Guardar nombre")}
              </DialogButton>
            </div>
          </PanelSectionRow>
        </PanelSection>
      </div>
    );
  }

  // ==================== VISTA DE SINCRONIZACIONES (PRINCIPAL) ====================
  return (
    <div style={{ width: "100%", maxWidth: "100%", overflowX: "hidden", boxSizing: "border-box" }}>
      <PanelSection>
        <PanelSectionRow>
          <Focusable
            flow-children="horizontal"
            style={{
              display: "flex",
              gap: "8px",
              width: "100%",
              maxWidth: "100%",
              boxSizing: "border-box",
            }}
          >
            <DialogButton
              onClick={() => setView("services")}
              style={{
                flex: 1,
                minWidth: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "5px",
                padding: "8px 6px",
                fontSize: "12px",
                boxSizing: "border-box",
              }}
            >
              <FaServer size={12} />
              <span>Services</span>
            </DialogButton>
            <DialogButton
              onClick={() => {
                Navigation.CloseSideMenus();
                Navigation.Navigate("/deck-seinen/add-more");
              }}
              style={{
                flex: 1,
                minWidth: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "5px",
                padding: "8px 6px",
                fontSize: "12px",
                boxSizing: "border-box",
              }}
            >
              <FaPlus size={12} />
              <span>Add more</span>
            </DialogButton>
          </Focusable>
        </PanelSectionRow>

        {syncProgress?.active && (
          <PanelSectionRow>
            <SyncProgressBar progress={syncProgress} compact />
          </PanelSectionRow>
        )}

        {statusMsg && (
          <PanelSectionRow>
            <div
              style={{
                fontSize: "11px",
                color: "#fca5a5",
                background: "rgba(239,68,68,0.18)",
                padding: "6px 8px",
                borderRadius: "6px",
                wordBreak: "break-word",
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
            <div style={{ fontSize: "12px", opacity: 0.7 }}>
              {tr("Loading syncs...", "Cargando sincronizaciones...")}
            </div>
          </PanelSectionRow>
        </PanelSection>
      ) : grouped.length === 0 ? (
        <PanelSection title={tr("Syncs", "Sincronizaciones")}>
          <PanelSectionRow>
            <div style={{ fontSize: "12px", opacity: 0.78, lineHeight: 1.45 }}>
              {tr(
                "You don't have any syncs added on this Steam Deck yet. Use ",
                "No tienes sincronizaciones agregadas en esta Steam Deck todavía. Usa "
              )}
              <strong>Add more</strong>{" "}
              {tr(
                "to pull saves from your cloud or upload new ones.",
                "para traer saves desde tu nube o subir nuevos."
              )}
            </div>
          </PanelSectionRow>
        </PanelSection>
      ) : (
        grouped.map((group) => (
          <PanelSection key={group.provider} title={group.label}>
            {group.items.map((sync) => {
              const isPending =
                Boolean(sync.lastPushDevice) &&
                sync.lastPushDevice !== deviceName &&
                (!sync.lastPulledAt ||
                  (Boolean(sync.lastPushAt) && sync.lastPushAt! > sync.lastPulledAt));
              const isBusy = busyId === sync.id;

              return (
                <PanelSectionRow key={sync.id}>
                  <div
                    style={{
                      width: "100%",
                      maxWidth: "100%",
                      boxSizing: "border-box",
                      overflow: "hidden",
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
                    <div
                      style={{
                        display: "flex",
                        gap: "8px",
                        alignItems: "center",
                        width: "100%",
                        minWidth: 0,
                      }}
                    >
                      <div
                        style={{
                          width: "48px",
                          height: "48px",
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
                          <FaGamepad size={20} color="#60a5fa" />
                        )}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: "12px",
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
                          {sync.lastPushDevice || tr("Unknown", "Desconocido")}
                        </div>
                      </div>

                      <DialogButton
                        disabled={isBusy}
                        onClick={() => runCardAction(sync.id, "smart")}
                        style={{
                          minWidth: 0,
                          width: "48px",
                          padding: "6px 4px",
                          fontSize: "11px",
                          fontWeight: 700,
                          flexShrink: 0,
                          boxSizing: "border-box",
                          borderBottom: isPending ? "2px solid #f59e0b" : undefined,
                        }}
                      >
                        {isBusy ? "..." : "sync"}
                      </DialogButton>
                    </div>

                    {/* Fila inferior: Pull, Push, Ruta y Eliminar (sin desbordamiento horizontal) */}
                    <Focusable
                      flow-children="horizontal"
                      style={{
                        display: "flex",
                        gap: "4px",
                        marginTop: "8px",
                        width: "100%",
                        minWidth: 0,
                        boxSizing: "border-box",
                      }}
                    >
                      <DialogButton
                        disabled={isBusy}
                        onClick={() => runCardAction(sync.id, "pull")}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          padding: "5px 4px",
                          fontSize: "11px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "3px",
                          boxSizing: "border-box",
                        }}
                      >
                        <FaCloudDownloadAlt size={11} />
                        <span>Pull</span>
                      </DialogButton>
                      <DialogButton
                        disabled={isBusy}
                        onClick={() => runCardAction(sync.id, "push")}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          padding: "5px 4px",
                          fontSize: "11px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "3px",
                          boxSizing: "border-box",
                        }}
                      >
                        <FaCloudUploadAlt size={11} />
                        <span>Push</span>
                      </DialogButton>
                      <DialogButton
                        disabled={isBusy}
                        onClick={() => showModal(<PathPreviewModal sync={sync} />)}
                        style={{
                          width: "34px",
                          minWidth: 0,
                          padding: "5px 4px",
                          fontSize: "11px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          boxSizing: "border-box",
                        }}
                      >
                        <FaFolderOpen size={11} />
                      </DialogButton>
                      <DialogButton
                        disabled={isBusy}
                        onClick={() => handleOpenDelete(sync)}
                        style={{
                          width: "34px",
                          minWidth: 0,
                          padding: "5px 4px",
                          fontSize: "11px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          boxSizing: "border-box",
                        }}
                      >
                        <FaTrash size={11} />
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
          <Focusable
            flow-children="horizontal"
            style={{
              display: "flex",
              gap: "8px",
              width: "100%",
              boxSizing: "border-box",
            }}
          >
            <DialogButton
              onClick={() => loadState(true)}
              disabled={loading}
              style={{
                flex: 1,
                minWidth: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                fontSize: "12px",
                boxSizing: "border-box",
              }}
            >
              <FaSync />
              <span>
                {loading
                  ? tr("Refreshing...", "Actualizando...")
                  : tr("Refresh status", "Actualizar estado")}
              </span>
            </DialogButton>
            <DialogButton
              onClick={() => {
                if (pollTimer.current) {
                  window.clearInterval(pollTimer.current);
                  pollTimer.current = null;
                }
                setPluginOff(true);
              }}
              style={{
                width: "44px",
                minWidth: "44px",
                padding: "8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                boxSizing: "border-box",
              }}
            >
              <FaPowerOff size={13} />
            </DialogButton>
          </Focusable>
        </PanelSectionRow>
      </PanelSection>
    </div>
  );
}
