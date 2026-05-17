import { useEffect, useState } from "react";
import { subscribeWs, type WsEvent } from "@/lib/websocket";

interface Toast {
  id: number;
  message: string;
  tone: "info" | "success" | "warning";
}

function messageFor(event: WsEvent): Toast | null {
  switch (event.type) {
    case "goal_submitted":
      return {
        id: Date.now(),
        message: `${event.employee_name} submitted goal: ${event.title}`,
        tone: "info",
      };
    case "goal_approved":
      return {
        id: Date.now(),
        message: `Goal approved: ${event.title}`,
        tone: "success",
      };
    case "goal_returned":
      return {
        id: Date.now(),
        message: `Goal returned: ${event.title} — ${event.comment}`,
        tone: "warning",
      };
    case "goals_bulk_approved":
      return {
        id: Date.now(),
        message: `${event.count} goals approved by ${event.manager_name}`,
        tone: "success",
      };
    default:
      return null;
  }
}

export default function NotificationToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const unsub = subscribeWs((event) => {
      const toast = messageFor(event);
      if (!toast) return;
      setToasts((prev) => [...prev, toast]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, 5000);
    });
    return unsub;
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`rounded-lg shadow-lg border px-4 py-3 text-sm animate-in slide-in-from-right ${
            t.tone === "success"
              ? "bg-green-50 border-green-200 text-green-900"
              : t.tone === "warning"
                ? "bg-amber-50 border-amber-200 text-amber-900"
                : "bg-white border-slate-200 text-slate-800"
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
