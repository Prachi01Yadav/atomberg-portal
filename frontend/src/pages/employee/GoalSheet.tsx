import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/formatApiError";
import WeightageValidator from "@/components/WeightageValidator";
import BlockchainBadge from "@/components/BlockchainBadge";
import GoalForm from "./GoalForm";

interface Goal {
  id: string;
  title: string;
  description?: string;
  thrust_area: string;
  weightage: number;
  status: string;
  uom_type: string;
  target_value: number | null;
  target_date: string | null;
  blockchain_verified: boolean;
  blockchain_tx_hash: string | null;
  is_shared: boolean;
  manager_return_comment: string | null;
}

export default function GoalSheet() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);

  const { data: activeCycle } = useQuery({
    queryKey: ["active-cycle"],
    queryFn: async () => {
      const { data } = await api.get<{ id: string; name: string } | null>("/api/v1/cycles/active");
      if (data?.id) localStorage.setItem("active_cycle_id", data.id);
      return data;
    },
  });
  const cycleId = activeCycle?.id ?? localStorage.getItem("active_cycle_id");

  const { data: goals = [], isLoading } = useQuery({
    queryKey: ["goals", cycleId],
    queryFn: async () => {
      if (!cycleId) return [];
      const { data } = await api.get<Goal[]>("/api/v1/goals", { params: { cycle_id: cycleId } });
      return data;
    },
    enabled: !!cycleId,
  });

  const goalsSig = goals.map((g) => `${g.id}:${g.weightage}:${g.status}`).join("|");

  const { data: validation } = useQuery({
    queryKey: ["goals-validate", cycleId, goalsSig],
    queryFn: async () =>
      (
        await api.get<{
          valid: boolean;
          total_weightage: number;
          errors: { field: string; message: string }[];
        }>("/api/v1/goals/validate", { params: { cycle_id: cycleId } })
      ).data,
    enabled: !!cycleId,
  });

  const totalWeight = goals.reduce((s, g) => s + g.weightage, 0);
  const canSubmit =
    Math.abs(totalWeight - 100) < 0.01 &&
    goals.length > 0 &&
    goals.some((g) => g.status === "draft");

  const submitMut = useMutation({
    mutationFn: () =>
      api.post("/api/v1/goals/submit", null, { params: { cycle_id: cycleId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goals"] });
      qc.invalidateQueries({ queryKey: ["goals-validate"] });
    },
    onError: () => {
      qc.invalidateQueries({ queryKey: ["goals-validate"] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (goalId: string) => api.delete(`/api/v1/goals/${goalId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goals"] });
      qc.invalidateQueries({ queryKey: ["goals-validate"] });
    },
  });

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <header className="surface p-6 bg-gradient-to-br from-brand-50 to-white border-brand-100">
        <div className="flex justify-between items-end flex-wrap gap-3">
          <div>
            <p className="text-sm text-brand-700 font-semibold">Goal sheet</p>
            <h1 className="text-3xl font-bold text-slate-900 mt-1">My Goals</h1>
            <p className="text-sm text-slate-500 mt-1">
              {user?.full_name} · Cycle <strong className="text-slate-700">{activeCycle?.name ?? "—"}</strong>
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500 uppercase tracking-wider">Locked</p>
            <p className="text-2xl font-bold text-brand-700">
              {goals.filter((g) => g.status === "locked").length}
              <span className="text-sm font-normal text-slate-400">/{goals.length}</span>
            </p>
          </div>
        </div>
      </header>

      {!cycleId && (
        <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-4">
          No active cycle configured. Ask an admin to activate one.
        </p>
      )}

      <WeightageValidator total={totalWeight} count={goals.length} />

      {validation && !validation.valid && goals.length > 0 && (
        <div
          role="status"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 space-y-2"
        >
          <p className="font-semibold">Cannot submit yet — fix the following:</p>
          <ul className="list-disc pl-5 space-y-1">
            {validation.errors.map((e, i) => (
              <li key={i}>
                <span className="font-mono text-xs text-red-700">{e.field}</span> — {e.message}
              </li>
            ))}
          </ul>
          <p className="text-xs text-red-800/90 pt-1 border-t border-red-200">
            Tip: delete stray <strong>draft</strong> goals or adjust weightages so all goals sum to exactly{" "}
            <strong>100%</strong> (each goal ≥ 10%, max 8 goals). Or run{" "}
            <code className="bg-white/80 px-1 rounded">scripts/demo-prep.ps1</code>.
          </p>
        </div>
      )}

      {!canSubmit && goals.some((g) => g.status === "draft") && validation?.valid && (
        <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          <strong>Submit all goals</strong> stays disabled until total weight is exactly 100% and at least one goal is
          still in <strong>draft</strong> status.
        </p>
      )}
      <section className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
          disabled={goals.length >= 8}
          className="px-5 py-2 border border-brand-600 text-brand-600 rounded-lg font-medium hover:bg-brand-50 disabled:opacity-40"
        >
          + Add goal {goals.length >= 8 && "(max 8)"}
        </button>
        <button
          onClick={() => submitMut.mutate()}
          disabled={!canSubmit || submitMut.isPending}
          className="px-5 py-2 bg-brand-600 text-white rounded-lg font-medium disabled:opacity-40 hover:bg-brand-700"
        >
          Submit all goals
        </button>
        {submitMut.isError && (
          <div className="text-sm text-red-600 self-center max-w-xl whitespace-pre-wrap">
            {formatApiError(submitMut.error)}
          </div>
        )}
        {submitMut.isSuccess && (
          <p className="text-sm text-green-600 self-center">Submitted for approval</p>
        )}
      </section>

      {showForm && cycleId && (
        <GoalForm
          cycleId={cycleId}
          initial={editing}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSaved={() => {
            setShowForm(false);
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["goals"] });
          }}
        />
      )}

      {isLoading ? (
        <p className="text-slate-500">Loading goals…</p>
      ) : goals.length === 0 ? (
        <p className="text-slate-500">No goals yet. Add your first goal to get started.</p>
      ) : (
        <ul className="grid gap-4">
          {goals.map((g) => (
            <li
              key={g.id}
              id={`goal-${g.id}`}
              className="surface p-5 flex justify-between items-start hover:shadow-card transition scroll-mt-24"
            >
              <div className="flex-1">
                <span className="text-xs font-medium text-brand-600 uppercase">
                  {g.thrust_area}
                </span>
                <h3 className="font-medium mt-1">
                  {g.title}
                  {g.is_shared && (
                    <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 uppercase tracking-wide">
                      shared
                    </span>
                  )}
                </h3>
                {g.description && (
                  <p className="text-sm text-slate-500 mt-1">{g.description}</p>
                )}
                <p className="text-sm text-slate-500 mt-2">
                  <strong>{g.weightage}%</strong> · {g.uom_type}
                  {g.target_value !== null && ` · target ${g.target_value}`}
                  {g.target_date && ` · by ${g.target_date}`}
                </p>
                {g.manager_return_comment && (
                  <p className="mt-2 text-sm text-amber-800 bg-amber-50 p-2 rounded border border-amber-200">
                    Manager: {g.manager_return_comment}
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end gap-2 ml-4">
                <span
                  className={`text-xs px-2 py-1 rounded-full ${
                    g.status === "locked"
                      ? "bg-green-100 text-green-800"
                      : g.status === "submitted"
                      ? "bg-amber-100 text-amber-800"
                      : g.status === "returned"
                      ? "bg-red-100 text-red-800"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {g.status}
                </span>
                {(g.status === "draft" || g.status === "returned") && !g.is_shared && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(g);
                        setShowForm(true);
                      }}
                      className="text-xs text-brand-600 hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm("Delete this draft goal?")) deleteMut.mutate(g.id);
                      }}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                )}
                {(g.status === "draft" || g.status === "returned") && g.is_shared && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(g);
                      setShowForm(true);
                    }}
                    className="text-xs text-brand-600 hover:underline"
                  >
                    Edit weightage
                  </button>
                )}
                {g.status === "locked" && (
                  <BlockchainBadge
                    goalId={g.id}
                    txHash={g.blockchain_tx_hash}
                    verified={g.blockchain_verified}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
