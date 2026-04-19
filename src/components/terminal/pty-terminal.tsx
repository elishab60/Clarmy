"use client";

import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";

interface Props {
  readonly sessionId: string;
  readonly compact?: boolean;
  readonly onClose?: () => void;
}

export function PtyTerminal({ sessionId, compact = false }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<"connecting" | "open" | "closed" | "error">("connecting");

  useEffect(() => {
    if (!hostRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, Monaco, monospace",
      fontSize: compact ? 11 : 13,
      lineHeight: 1.22,
      convertEol: false,
      scrollback: 5000,
      theme: {
        background: "#0a0a0a",
        foreground: "#ededed",
        cursor: "#d97757",
        cursorAccent: "#0a0a0a",
        selectionBackground: "#3b3b3b",
        black: "#1a1a1a", red: "#ef4444", green: "#22c55e", yellow: "#f5a524", blue: "#4a9eff", magenta: "#a78bfa", cyan: "#22d3ee", white: "#ededed",
        brightBlack: "#4b4b4b", brightRed: "#f87171", brightGreen: "#4ade80", brightYellow: "#fbbf24", brightBlue: "#60a5fa", brightMagenta: "#c4b5fd", brightCyan: "#67e8f9", brightWhite: "#ffffff",
      },
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(hostRef.current);

    try { fit.fit(); } catch { /* ignore */ }

    termRef.current = term;
    fitRef.current = fit;

    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${window.location.host}/pty?id=${encodeURIComponent(sessionId)}`);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("open");
      sendResize();
    };
    ws.onerror = () => setStatus("error");
    ws.onclose = () => setStatus("closed");
    ws.onmessage = (ev) => {
      if (typeof ev.data === "string") {
        try {
          const msg = JSON.parse(ev.data) as { kind?: string; code?: number; message?: string };
          if (msg.kind === "exit") term.write(`\r\n\x1b[90m[session exited · code ${msg.code ?? 0}]\x1b[0m\r\n`);
          else if (msg.kind === "error") term.write(`\r\n\x1b[31m[${msg.message ?? "error"}]\x1b[0m\r\n`);
        } catch { term.write(ev.data); }
        return;
      }
      // binary
      const data = ev.data instanceof ArrayBuffer ? new Uint8Array(ev.data) : null;
      if (data) term.write(data);
    };

    const onData = term.onData((chunk) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(chunk);
    });

    const sendResize = () => {
      if (ws.readyState !== WebSocket.OPEN) return;
      try { ws.send(JSON.stringify({ kind: "resize", cols: term.cols, rows: term.rows })); } catch { /* ignore */ }
    };
    const onResize = term.onResize(() => sendResize());

    const host = hostRef.current;
    const ro = new ResizeObserver(() => {
      try { fit.fit(); } catch { /* ignore */ }
    });
    ro.observe(host);

    return () => {
      onData.dispose();
      onResize.dispose();
      ro.disconnect();
      try { ws.close(); } catch { /* ignore */ }
      try { term.dispose(); } catch { /* ignore */ }
      termRef.current = null;
      fitRef.current = null;
      wsRef.current = null;
    };
  }, [sessionId, compact]);

  return (
    <div className={`pty-wrap ${compact ? "compact" : ""}`}>
      <div className="pty-host" ref={hostRef} />
      {status !== "open" && (
        <div className="pty-status">
          {status === "connecting" && "connecting…"}
          {status === "closed" && "disconnected — tile will clear when session ends"}
          {status === "error" && "connection error"}
        </div>
      )}
    </div>
  );
}
