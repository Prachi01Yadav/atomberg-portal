import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface Entry {
  channel: "email" | "teams";
  to?: string;
  subject?: string;
  title?: string;
  body?: string;
  text?: string;
  deep_link?: string;
  timestamp: string;
  error?: string;
}

export default function NotificationsLog() {
  const { data: log = [], isLoading } = useQuery({
    queryKey: ["notification-log"],
    queryFn: async () => {
      const { data } = await api.get<Entry[]>("/api/v1/notifications/log");
      return data;
    },
    refetchInterval: 10000,
  });

  return (
    <div className="p-6 space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Notifications</h1>
        <p className="text-sm text-slate-500">
          Mock-mode delivery log. Configure SMTP / Teams webhook in <code>.env</code> for live
          sends.
        </p>
      </header>

      {isLoading ? (
        <p className="text-slate-500">Loading…</p>
      ) : log.length === 0 ? (
        <p className="text-slate-500">Nothing dispatched yet.</p>
      ) : (
        <ul className="space-y-2">
          {log.map((e, i) => (
            <li
              key={i}
              className={`bg-white border rounded-lg p-3 ${
                e.error ? "border-red-300" : "border-slate-200"
              }`}
            >
              <div className="flex justify-between text-xs text-slate-500">
                <span>
                  {e.channel === "email" ? "Email" : "Teams"} ·{" "}
                  {new Date(e.timestamp).toLocaleString()}
                </span>
                {e.error && <span className="text-red-600">Error: {e.error}</span>}
              </div>
              <p className="font-medium text-sm mt-1">
                {e.subject ?? e.title}
                {e.to && <span className="text-slate-500 text-xs ml-2">→ {e.to}</span>}
              </p>
              <div
                className="text-xs text-slate-600 mt-1"
                dangerouslySetInnerHTML={{ __html: e.body ?? e.text ?? "" }}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
