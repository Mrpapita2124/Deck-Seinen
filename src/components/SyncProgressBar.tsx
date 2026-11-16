import { useLang } from "../i18n";
import type { SyncProgress } from "../types";

export function SyncProgressBar({
  progress,
  compact = false,
}: {
  progress: SyncProgress | null;
  compact?: boolean;
}) {
  const [, , tr] = useLang();
  if (!progress || !progress.active) return null;

  const pct = Math.max(0, Math.min(100, progress.percent || 0));
  const actionLabel =
    progress.operation === "pull"
      ? tr("Downloading", "Descargando")
      : tr("Uploading", "Subiendo");
  const batchLabel =
    progress.total > 1 && progress.index > 0
      ? ` (${progress.index}/${progress.total})`
      : "";

  return (
    <div
      style={{
        width: "100%",
        boxSizing: "border-box",
        background: "rgba(56,189,248,0.1)",
        border: "1px solid rgba(56,189,248,0.35)",
        borderRadius: "8px",
        padding: compact ? "7px 8px" : "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: "5px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "8px",
          fontSize: compact ? "11px" : "12px",
          fontWeight: 700,
        }}
      >
        <span
          style={{
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {actionLabel} {progress.syncName}
          {batchLabel}
        </span>
        <span style={{ color: "#38bdf8", flexShrink: 0 }}>{pct}%</span>
      </div>

      <div
        style={{
          width: "100%",
          height: compact ? "6px" : "8px",
          borderRadius: "999px",
          background: "rgba(255,255,255,0.12)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            borderRadius: "999px",
            background: "linear-gradient(90deg, #38bdf8 0%, #10b981 100%)",
            transition: "width 0.25s ease",
          }}
        />
      </div>

      {progress.detail && (
        <div
          style={{
            fontSize: "10px",
            opacity: 0.72,
            fontFamily: "monospace",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {progress.detail}
        </div>
      )}
    </div>
  );
}
