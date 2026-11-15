import { DialogButton, Focusable, ModalRoot } from "@decky/ui";
import { useState } from "react";
import { FaCloud, FaGamepad } from "react-icons/fa";
import { PROVIDER_LABELS, type LocalSync } from "../types";

interface DeleteSyncModalProps {
  closeModal?: () => void;
  sync: LocalSync;
  onConfirmDelete: (deleteFromCloud: boolean) => Promise<void>;
}

export function DeleteSyncModal({
  closeModal,
  sync,
  onConfirmDelete,
}: DeleteSyncModalProps) {
  const [busy, setBusy] = useState(false);
  const serviceName = PROVIDER_LABELS[sync.provider] || "la nube";

  const handleAction = async (fromCloud: boolean) => {
    setBusy(true);
    try {
      await onConfirmDelete(fromCloud);
      closeModal?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalRoot onCancel={closeModal} closeModal={closeModal}>
      <div style={{ minWidth: "420px", maxWidth: "520px", color: "#fff" }}>
        <h2 style={{ margin: "0 0 8px 0", fontSize: "18px", fontWeight: 700 }}>
          Eliminar "{sync.name}"
        </h2>
        <p style={{ margin: "0 0 16px 0", fontSize: "13px", opacity: 0.85, lineHeight: 1.45 }}>
          ¿Cómo deseas eliminar esta sincronización? Tus archivos locales en la Steam Deck no se borrarán del disco.
        </p>

        <Focusable style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <DialogButton
            disabled={busy}
            onClick={() => handleAction(false)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              justifyContent: "flex-start",
              padding: "12px 14px",
              background: "rgba(255,255,255,0.1)",
            }}
          >
            <FaGamepad color="#38bdf8" />
            <div style={{ textAlign: "left" }}>
              <div style={{ fontWeight: 700, fontSize: "13px" }}>
                Solo de esta Steam Deck / consola
              </div>
              <div style={{ fontSize: "11px", opacity: 0.75 }}>
                Se quita de tu lista local, pero se conserva en {serviceName}.
              </div>
            </div>
          </DialogButton>

          <DialogButton
            disabled={busy}
            onClick={() => handleAction(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              justifyContent: "flex-start",
              padding: "12px 14px",
              background: "rgba(239,68,68,0.28)",
              border: "1px solid rgba(239,68,68,0.6)",
            }}
          >
            <FaCloud color="#f87171" />
            <div style={{ textAlign: "left" }}>
              <div style={{ fontWeight: 700, fontSize: "13px", color: "#fecaca" }}>
                Eliminar de {serviceName} (tu cuenta)
              </div>
              <div style={{ fontSize: "11px", opacity: 0.8 }}>
                Borra la sincronización y su carpeta en la nube de {serviceName}.
              </div>
            </div>
          </DialogButton>

          <DialogButton onClick={closeModal} disabled={busy} style={{ marginTop: "4px" }}>
            Cancelar
          </DialogButton>
        </Focusable>
      </div>
    </ModalRoot>
  );
}
