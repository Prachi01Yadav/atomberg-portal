import { useEffect, useRef } from "react";

export type WsEvent = {
  type: string;
  [key: string]: unknown;
};

type Handler = (event: WsEvent) => void;

const handlers = new Set<Handler>();
let socket: WebSocket | null = null;

function wsUrl(token: string): string {
  const base = import.meta.env.VITE_WS_URL;
  if (base) return `${base}/ws?token=${encodeURIComponent(token)}`;
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  const host = import.meta.env.DEV ? "localhost:8000" : window.location.host;
  return `${proto}://${host}/ws?token=${encodeURIComponent(token)}`;
}

export function connectWebSocket(token: string) {
  disconnectWebSocket();
  socket = new WebSocket(wsUrl(token));
  socket.onmessage = (msg) => {
    try {
      const data = JSON.parse(msg.data) as WsEvent;
      handlers.forEach((h) => h(data));
    } catch {
      /* ignore */
    }
  };
  socket.onclose = () => {
    socket = null;
  };
}

export function disconnectWebSocket() {
  socket?.close();
  socket = null;
}

export function subscribeWs(handler: Handler): () => void {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}

export function useWebSocket(onEvent: Handler) {
  const ref = useRef(onEvent);
  ref.current = onEvent;
  useEffect(() => {
    const unsub = subscribeWs((e) => ref.current(e));
    return unsub;
  }, []);
}
