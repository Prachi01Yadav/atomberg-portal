import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";

interface AuditEntry {
  id: string;
  goal_id: string;
  goal_title: string | null;
  employee_name: string | null;
  changed_by_name: string | null;
  change_type: string;
  field_changed: string | null;
  old_value: string | null;
  new_value: string | null;
  timestamp: string;
  blockchain_tx_hash: string | null;
}

interface VerifyResult {
  verified: boolean;
  tx_hash: string | null;
  polygon_scan_url: string | null;
}

export default function AuditLogPage() {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: async () => {
      const { data } = await api.get<AuditEntry[]>("/api/v1/admin/audit-logs");
      return data;
    },
  });

  return (
    <div className="p-6 space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Audit Log</h1>
        <p className="text-sm text-slate-500">
          Every post-lock change is recorded here and anchored on Polygon (mock or live).
        </p>
      </header>

      {isLoading ? (
        <p className="text-slate-500">Loading…</p>
      ) : logs.length === 0 ? (
        <p className="text-slate-500">No audit entries yet.</p>
      ) : (
        <div className="overflow-x-auto bg-white border rounded-xl">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-xs uppercase text-slate-500">
              <tr>
                <th className="text-left p-3">Time</th>
                <th className="text-left p-3">Employee</th>
                <th className="text-left p-3">Goal</th>
                <th className="text-left p-3">Change</th>
                <th className="text-left p-3">Old → New</th>
                <th className="text-left p-3">By</th>
                <th className="text-left p-3">Blockchain</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <AuditRow key={l.id} log={l} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AuditRow({ log }: { log: AuditEntry }) {
  const [verify, setVerify] = useState<VerifyResult | null>(null);
  const verifyMut = useMutation({
    mutationFn: async () => {
      const { data } = await api.get<VerifyResult>(`/api/v1/blockchain/verify/${log.goal_id}`);
      return data;
    },
    onSuccess: (data) => setVerify(data),
  });

  return (
    <tr className="border-t hover:bg-slate-50">
      <td className="p-3 text-xs text-slate-500">
        {new Date(log.timestamp).toLocaleString()}
      </td>
      <td className="p-3">{log.employee_name}</td>
      <td className="p-3">{log.goal_title}</td>
      <td className="p-3">
        <span className="text-xs font-medium bg-slate-100 px-2 py-1 rounded">
          {log.change_type}
        </span>
        {log.field_changed && (
          <span className="text-xs ml-2 text-slate-500">{log.field_changed}</span>
        )}
      </td>
      <td className="p-3 text-xs">
        {log.old_value !== null ? <s>{log.old_value}</s> : "—"} → {log.new_value ?? "—"}
      </td>
      <td className="p-3 text-xs">{log.changed_by_name}</td>
      <td className="p-3 text-xs space-y-1">
        {log.blockchain_tx_hash ? (
          <code className="text-xs">{log.blockchain_tx_hash.slice(0, 14)}…</code>
        ) : (
          <span className="text-slate-400">—</span>
        )}
        <button
          type="button"
          onClick={() => verifyMut.mutate()}
          disabled={verifyMut.isPending}
          className="block text-brand-600 hover:underline text-xs"
        >
          {verifyMut.isPending ? "Verifying…" : "Verify"}
        </button>
        {verify && (
          <span
            className={`block text-xs ${
              verify.verified ? "text-green-700" : "text-red-700"
            }`}
          >
            {verify.verified ? "On-chain" : "Not found"}
            {verify.polygon_scan_url && (
              <a
                href={verify.polygon_scan_url}
                target="_blank"
                rel="noreferrer"
                className="ml-1 underline"
              >
                Scan
              </a>
            )}
          </span>
        )}
      </td>
    </tr>
  );
}
