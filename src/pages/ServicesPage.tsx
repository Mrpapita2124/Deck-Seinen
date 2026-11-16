import { DialogButton, Focusable, Navigation, TextField } from "@decky/ui";
import { useEffect, useRef, useState } from "react";
import { FaArrowLeft, FaCheckCircle, FaCloud, FaSignOutAlt } from "react-icons/fa";
import { api } from "../api";
import { useLang } from "../i18n";
import { PROVIDER_LABELS, type CloudProvider } from "../types";

export function ServicesPage() {
  const [lang, setLang, tr] = useLang();
  const [connectedServices, setConnectedServices] = useState<Record<CloudProvider, boolean>>({
    gdrive: false,
    onedrive: false,
    dropbox: false,
  });
  const [deviceName, setDeviceName] = useState("Steam Deck");
  const [savingDevice, setSavingDevice] = useState(false);
  const [authProvider, setAuthProvider] = useState<CloudProvider | null>(null);
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const pollTimer = useRef<number | null>(null);

  const loadState = async () => {
    const st = await api.getState();
    setConnectedServices(st.connectedServices);
    setDeviceName(st.deviceName || "Steam Deck");
  };

  useEffect(() => {
    loadState();
    return () => {
      if (pollTimer.current) window.clearInterval(pollTimer.current);
    };
  }, []);

  const startLogin = async (provider: CloudProvider) => {
    setErrorMsg(null);
    setAuthProvider(provider);
    setAuthUrl(null);
    try {
      const res = await api.startAuth(provider);
      if (!res.ok) {
        setErrorMsg(res.error || "No se pudo iniciar sesión");
        setAuthProvider(null);
        return;
      }
      if (res.authUrl) {
        setAuthUrl(res.authUrl);
        Navigation.NavigateToExternalWeb(res.authUrl);
      }
      if (pollTimer.current) window.clearInterval(pollTimer.current);
      pollTimer.current = window.setInterval(async () => {
        const poll = await api.pollAuth(provider);
        if (poll.authUrl) setAuthUrl(poll.authUrl);
        if (poll.done) {
          if (pollTimer.current) window.clearInterval(pollTimer.current);
          setAuthProvider(null);
          setAuthUrl(null);
          if (poll.error && !poll.connected) {
            setErrorMsg(poll.error);
          }
          await loadState();
        }
      }, 1500);
    } catch (err: any) {
      setErrorMsg(String(err?.message || err));
      setAuthProvider(null);
    }
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
    const res = await api.logoutProvider(provider);
    setConnectedServices(res.connectedServices);
  };

  const handleSaveDeviceName = async () => {
    setSavingDevice(true);
    try {
      await api.setDeviceName(deviceName);
    } finally {
      setSavingDevice(false);
    }
  };

  const providers: CloudProvider[] = ["gdrive", "onedrive", "dropbox"];

  return (
    <div style={{ padding: "48px 36px", color: "#fff", maxWidth: "820px", margin: "0 auto" }}>
      <Focusable
        flow-children="horizontal"
        style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}
      >
        <DialogButton
          onClick={() => Navigation.NavigateBack()}
          style={{ minWidth: "auto", padding: "8px 14px" }}
        >
          <FaArrowLeft />
        </DialogButton>
        <h1 style={{ margin: 0, fontSize: "24px", fontWeight: 800 }}>Services</h1>
      </Focusable>

      {errorMsg && (
        <div
          style={{
            background: "rgba(239,68,68,0.22)",
            border: "1px solid rgba(239,68,68,0.6)",
            padding: "10px 14px",
            borderRadius: "8px",
            marginBottom: "16px",
            fontSize: "13px",
          }}
        >
          {errorMsg}
        </div>
      )}

      {/* Lista de servicios (Google Drive, OneDrive, DropBox) */}
      <Focusable style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "28px" }}>
        {providers.map((provider) => {
          const isConnected = connectedServices[provider];
          const isAuthenticating = authProvider === provider;

          return (
            <div
              key={provider}
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: "12px",
                padding: "16px 18px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <FaCloud size={24} color={isConnected ? "#34d399" : "#94a3b8"} />
                <div>
                  <div style={{ fontSize: "16px", fontWeight: 700 }}>
                    {PROVIDER_LABELS[provider]}
                  </div>
                  <div style={{ fontSize: "12px", opacity: 0.75 }}>
                    {isConnected
                      ? tr("Connected and ready to sync", "Conectado y listo para sincronizar")
                      : isAuthenticating
                        ? tr("Waiting for browser sign in...", "Esperando inicio de sesión en el navegador...")
                        : tr("Disconnected", "Desconectado")}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {isConnected ? (
                  <>
                    <FaCheckCircle color="#34d399" size={18} />
                    <DialogButton
                      onClick={() => handleLogout(provider)}
                      style={{
                        minWidth: "130px",
                        background: "rgba(239,68,68,0.25)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "6px",
                      }}
                    >
                      <FaSignOutAlt />
                      <span>{tr("Sign out", "Desconectar")}</span>
                    </DialogButton>
                  </>
                ) : isAuthenticating ? (
                  <>
                    {authUrl && (
                      <DialogButton
                        onClick={() => Navigation.NavigateToExternalWeb(authUrl)}
                        style={{ minWidth: "130px", background: "#1a9fff" }}
                      >
                        {tr("Open link", "Abrir enlace")}
                      </DialogButton>
                    )}
                    <DialogButton onClick={cancelLogin} style={{ minWidth: "100px" }}>
                      {tr("Cancel", "Cancelar")}
                    </DialogButton>
                  </>
                ) : (
                  <DialogButton
                    onClick={() => startLogin(provider)}
                    style={{ minWidth: "140px", background: "#1a9fff", fontWeight: 700 }}
                  >
                    {tr("Sign in", "Iniciar sesión")}
                  </DialogButton>
                )}
              </div>
            </div>
          );
        })}
      </Focusable>

      {/* Nombre del dispositivo */}
      <div
        style={{
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: "12px",
          padding: "16px 18px",
          marginBottom: "16px",
        }}
      >
        <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: "8px" }}>
          {tr("This device name", "Nombre de este dispositivo")}
        </div>
        <Focusable
          flow-children="horizontal"
          style={{ display: "flex", gap: "10px", alignItems: "center" }}
        >
          <div style={{ flex: 1 }}>
            <TextField
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              placeholder="Steam Deck"
            />
          </div>
          <DialogButton
            onClick={handleSaveDeviceName}
            disabled={savingDevice}
            style={{ minWidth: "120px", background: "#10b981", color: "#000", fontWeight: 700 }}
          >
            {savingDevice ? tr("Saving...", "Guardando...") : tr("Save", "Guardar")}
          </DialogButton>
        </Focusable>
      </div>

      {/* Idioma */}
      <div
        style={{
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: "12px",
          padding: "16px 18px",
        }}
      >
        <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: "8px" }}>
          {tr("Language / Idioma", "Idioma / Language")}
        </div>
        <Focusable flow-children="horizontal" style={{ display: "flex", gap: "10px" }}>
          <DialogButton
            onClick={() => setLang("en")}
            style={{
              minWidth: "120px",
              fontWeight: lang === "en" ? 700 : 400,
              borderBottom: lang === "en" ? "3px solid #38bdf8" : "3px solid transparent",
            }}
          >
            English
          </DialogButton>
          <DialogButton
            onClick={() => setLang("es")}
            style={{
              minWidth: "120px",
              fontWeight: lang === "es" ? 700 : 400,
              borderBottom: lang === "es" ? "3px solid #38bdf8" : "3px solid transparent",
            }}
          >
            Español
          </DialogButton>
        </Focusable>
      </div>
    </div>
  );
}
