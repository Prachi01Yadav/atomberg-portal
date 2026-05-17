import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

const RULE_TYPES = [
  { v: "goal_not_submitted", l: "Goal not submitted" },
  { v: "goal_not_approved", l: "Goal not approved" },
  { v: "checkin_not_done", l: "Check-in not done" },
];
const TARGETS = [
  { v: "employee", l: "Employee" },
  { v: "manager", l: "Manager" },
  { v: "hr", l: "HR / Admin" },
];

interface Rule {
  id: string;
  rule_type: string;
  threshold_days: number;
  notification_target: string;
  is_active: boolean;
}

interface Log {
  id: string;
  rule_id: string;
  target_user_id: string;
  target_user_name: string | null;
  message: string;
  sent_at: string;
  resolved_at: string | null;
}

export default function EscalationConfig() {
  const qc = useQueryClient();

  const { data: rules = [] } = useQuery({
    queryKey: ["esc-rules"],
    queryFn: async () => {
      const { data } = await api.get<Rule[]>("/api/v1/escalations/rules");
      return data;
    },
  });

  const { data: logs = [] } = useQuery({
    queryKey: ["esc-logs"],
    queryFn: async () => {
      const { data } = await api.get<Log[]>("/api/v1/escalations/logs");
      return data;
    },
    refetchInterval: 15000,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/escalations/rules/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["esc-rules"] }),
  });

  const runMut = useMutation({
    mutationFn: () => api.post("/api/v1/escalations/run"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["esc-logs"] }),
  });

  const resolveMut = useMutation({
    mutationFn: (id: string) => api.post(`/api/v1/escalations/logs/${id}/resolve`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["esc-logs"] }),
  });

  return (
    <div className="p-6 space-y-6">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold">Escalations</h1>
          <p className="text-sm text-slate-500">
            Configurable rules; daily Celery job evaluates them automatically.
          </p>
        </div>
        <button
          type="button"
          onClick={() => runMut.mutate()}
          disabled={runMut.isPending}
          className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm"
        >
          {runMut.isPending ? "Running…" : "Run now (demo)"}
        </button>
      </header>

      {runMut.isSuccess && (
        <pre className="text-xs bg-slate-100 p-2 rounded">
          {JSON.stringify(runMut.data?.data, null, 2)}
        </pre>
      )}

      <RuleForm />

      <section className="bg-white border rounded-xl overflow-hidden">
        <h2 className="font-semibold p-3 border-b">Rules</h2>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="text-left p-3">Type</th>
              <th className="text-left p-3">Threshold</th>
              <th className="text-left p-3">Notify</th>
              <th className="text-left p-3">Active</th>
              <th className="text-left p-3"></th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-3">{r.rule_type}</td>
                <td className="p-3">{r.threshold_days}d</td>
                <td className="p-3">{r.notification_target}</td>
                <td className="p-3">{r.is_active ? "Yes" : "No"}</td>
                <td className="p-3">
                  <button
                    type="button"
                    onClick={() => deleteMut.mutate(r.id)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="bg-white border rounded-xl overflow-hidden">
        <h2 className="font-semibold p-3 border-b">Escalation log</h2>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="text-left p-3">When</th>
              <th className="text-left p-3">Target</th>
              <th className="text-left p-3">Message</th>
              <th className="text-left p-3">Resolved</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-t">
                <td className="p-3 text-xs">
                  {new Date(l.sent_at).toLocaleString()}
                </td>
                <td className="p-3">{l.target_user_name}</td>
                <td className="p-3 text-xs">{l.message}</td>
                <td className="p-3">
                  {l.resolved_at ? (
                    <span className="text-xs text-green-700">
                      Resolved {new Date(l.resolved_at).toLocaleDateString()}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => resolveMut.mutate(l.id)}
                      className="text-xs text-brand-600 hover:underline"
                    >
                      Mark resolved
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={4} className="p-3 text-slate-500 text-center">
                  No escalations yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function RuleForm() {
  const qc = useQueryClient();
  const [ruleType, setRuleType] = useState(RULE_TYPES[0].v);
  const [threshold, setThreshold] = useState(7);
  const [target, setTarget] = useState(TARGETS[0].v);

  const mut = useMutation({
    mutationFn: () =>
      api.post("/api/v1/escalations/rules", {
        rule_type: ruleType,
        threshold_days: threshold,
        notification_target: target,
        is_active: true,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["esc-rules"] }),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    mut.mutate();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white border rounded-xl p-4 grid grid-cols-4 gap-3 items-end"
    >
      <label className="text-sm">
        Rule type
        <select
          className="mt-1 w-full border rounded px-2 py-1"
          value={ruleType}
          onChange={(e) => setRuleType(e.target.value)}
        >
          {RULE_TYPES.map((r) => (
            <option key={r.v} value={r.v}>
              {r.l}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        Threshold (days)
        <input
          type="number"
          min={1}
          className="mt-1 w-full border rounded px-2 py-1"
          value={threshold}
          onChange={(e) => setThreshold(+e.target.value)}
        />
      </label>
      <label className="text-sm">
        Notify
        <select
          className="mt-1 w-full border rounded px-2 py-1"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        >
          {TARGETS.map((t) => (
            <option key={t.v} value={t.v}>
              {t.l}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={mut.isPending}
        className="px-4 py-2 bg-brand-600 text-white rounded text-sm"
      >
        Add rule
      </button>
    </form>
  );
}
