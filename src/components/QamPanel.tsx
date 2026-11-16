import {
  DialogButton,
  Focusable,
  Navigation,
  PanelSection,
  PanelSectionRow,
  TextField,
  showModal,
} from "@decky/ui";
import QRCode from "qrcode";
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
        minWidth: "360px",
        maxWidth: "520px",
      }}
    >
      <h3 style={{ margin: "0 0 8px 0", fontSize: "16px" }}>{sync.name}</h3>
      <div style={{ fontSize: "12px", opacity: 0.75, marginBottom: "6px" }}>
        Ruta local en Steam Deck:
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
  const [pluginOff, setPluginOff] = useState(false);
  const [view, setView] = useState<"syncs" | "services">("syncs");
  const [initialViewResolved, setInitialViewResolved] = useState(false);

  // Estados vista Sincronizaciones
  const [busyId, setBusyId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Estados vista Servicios (inline, no sobrepuesta)
  const [deviceNameInput, setDeviceNameInput] = useState("Steam Deck");
  const [savingDevice, setSavingDevice] = useState(false);
  const [authProvider, setAuthProvider] = useState<CloudProvider | null>(null);
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [redirectUrlInput, setRedirectUrlInput] = useState("");
  const [completingRedirect, setCompletingRedirect] = useState(false);
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
    const targetQr = qrUrl || authUrl;
    if (!targetQr) {
      setQrDataUrl(null);
      return;
    }
    QRCode.toDataURL(targetQr, { width: 176, margin: 1 })
      .then((url) => setQrDataUrl(url))
      .catch(() => setQrDataUrl(null));
  }, [qrUrl, authUrl]);

  // --- Acciones de Sesiones / Servicios ---
  const startLogin = async (provider: CloudProvider) => {
    setStatusMsg(null);
    setAuthProvider(provider);
    setAuthUrl(null);
    setQrUrl(null);
    setRedirectUrlInput("");
    try {
      const res = await api.startAuth(provider);
      if (!res.ok) {
        setStatusMsg(res.error || "No se pudo iniciar sesión");
        setAuthProvider(null);
        return;
      }
      if (res.authUrl) setAuthUrl(res.authUrl);
      if (res.qrUrl) setQrUrl(res.qrUrl);
      if (pollTimer.current) window.clearInterval(pollTimer.current);
      pollTimer.current = window.setInterval(async () => {
        const poll = await api.pollAuth(provider);
        if (poll.authUrl) setAuthUrl(poll.authUrl);
        if (poll.qrUrl) setQrUrl(poll.qrUrl);
        if (poll.done) {
          if (pollTimer.current) window.clearInterval(pollTimer.current);
          setAuthProvider(null);
          setAuthUrl(null);
          setQrUrl(null);
          setRedirectUrlInput("");
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

  const handleCompleteRedirectUrl = async () => {
    if (!authProvider || !redirectUrlInput.trim()) return;
    setCompletingRedirect(true);
    setStatusMsg(null);
    try {
      const res = await api.completeAuthRedirect(authProvider, redirectUrlInput.trim());
      if (!res.ok && res.error) {
        setStatusMsg(res.error);
      } else {
        if (pollTimer.current) window.clearInterval(pollTimer.current);
        setAuthProvider(null);
        setAuthUrl(null);
        setRedirectUrlInput("");
        await loadState(false);
      }
    } catch (err: any) {
      setStatusMsg(String(err?.message || err));
    } finally {
      setCompletingRedirect(false);
    }
  };

  const cancelLogin = async () => {
    if (pollTimer.current) window.clearInterval(pollTimer.current);
    if (authProvider) {
      await api.cancelAuth(authProvider);
    }
    setAuthProvider(null);
    setAuthUrl(null);
    setQrUrl(null);
    setRedirectUrlInput("");
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
        <PanelSection title="DeckSeinen en espera">
          <PanelSectionRow>
            <div style={{ fontSize: "12px", opacity: 0.78, padding: "4px 0" }}>
              El plugin está apagado. Se volverá a encender automáticamente la próxima vez que abras DeckSeinen, o puedes encenderlo ahora.
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
              <span>Encender DeckSeinen</span>
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
        <PanelSection title="Servicios en la nube">
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
                <span>Ir a Sincronizaciones</span>
              </DialogButton>
            </PanelSectionRow>
          )}

          {!anyConnected && (
            <PanelSectionRow>
              <div style={{ fontSize: "12px", opacity: 0.8, lineHeight: 1.4 }}>
                Conecta al menos un servicio (<strong>Google Drive</strong>,{" "}
                <strong>OneDrive</strong> o <strong>DropBox</strong>) para comenzar.
              </div>
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
                          <span>Cerrar sesión</span>
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
                          Iniciar sesión
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
                          Generando enlace de acceso...
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
                            <span>Abrir navegador de Steam</span>
                          </DialogButton>

                          {qrDataUrl && (
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                gap: "4px",
                                background: "#fff",
                                padding: "8px",
                                borderRadius: "8px",
                              }}
                            >
                              <img
                                src={qrDataUrl}
                                alt="QR de inicio de sesión"
                                style={{ width: "148px", height: "148px" }}
                              />
                              <span style={{ fontSize: "10px", color: "#111", textAlign: "center" }}>
                                Escanea con tu celular si prefieres
                              </span>
                            </div>
                          )}

                          <div style={{ fontSize: "10px", opacity: 0.78, lineHeight: 1.3 }}>
                            Si usaste el QR en el celular y al final te manda a{" "}
                            <code>127.0.0.1</code>, pega esa URL aquí:
                          </div>
                          <TextField
                            value={redirectUrlInput}
                            onChange={(e) => setRedirectUrlInput(e.target.value)}
                            placeholder="http://127.0.0.1:53682/?code=..."
                          />
                          {redirectUrlInput.trim() && (
                            <DialogButton
                              disabled={completingRedirect}
                              onClick={handleCompleteRedirectUrl}
                              style={{
                                width: "100%",
                                minWidth: 0,
                                padding: "6px 8px",
                                fontSize: "11px",
                                fontWeight: 700,
                              }}
                            >
                              {completingRedirect ? "Validando..." : "Completar sesión"}
                            </DialogButton>
                          )}
                        </>
                      )}

                      <DialogButton
                        onClick={cancelLogin}
                        style={{ width: "100%", minWidth: 0, padding: "6px", fontSize: "11px" }}
                      >
                        Cancelar
                      </DialogButton>
                    </div>
                  )}
                </div>
              </PanelSectionRow>
            );
          })}
        </PanelSection>

        <PanelSection title="Dispositivo">
          <PanelSectionRow>
            <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "6px" }}>
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
                {savingDevice ? "Guardando..." : "Guardar nombre"}
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
            <div style={{ fontSize: "12px", opacity: 0.7 }}>Cargando sincronizaciones...</div>
          </PanelSectionRow>
        </PanelSection>
      ) : grouped.length === 0 ? (
        <PanelSection title="Sincronizaciones">
          <PanelSectionRow>
            <div style={{ fontSize: "12px", opacity: 0.78, lineHeight: 1.45 }}>
              No tienes sincronizaciones agregadas en esta Steam Deck todavía. Usa{" "}
              <strong>Add more</strong> para traer saves desde tu nube o subir nuevos.
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
                          {sync.lastPushDevice || deviceName}
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
              <span>{loading ? "Actualizando..." : "Actualizar estado"}</span>
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
