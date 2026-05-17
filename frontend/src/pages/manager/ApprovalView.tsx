import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useState } from "react";
import { api } from "@/lib/api";
import BlockchainBadge from "@/components/BlockchainBadge";

interface Goal {
  id: string;
  title: string;
  description?: string;
  thrust_area: string;
  weightage: number;
  target_value: number | null;
  target_date: string | null;
  status: string;
  uom_type: string;
  blockchain_tx_hash: string | null;
  blockchain_verified: boolean;
  manager_return_comment: string | null;
  is_shared: boolean;
}

export default function ApprovalView() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const qc = useQueryClient();
  const [returnComment, setReturnComment] = useState<Record<string, string>>({});
  const [edits, setEdits] = useState<Record<string, { target_value?: number; weightage?: number }>>({});

  const { data: activeCycle } = useQuery({
    queryKey: ["active-cycle"],
    queryFn: async () => {
      const { data } = await api.get<{ id: string } | null>("/api/v1/cycles/active");
      return data;
    },
  });

  const cycleId = activeCycle?.id;

  const { data: goals = [], isLoading } = useQuery({
    queryKey: ["approval-goals", employeeId, cycleId],
    queryFn: async () => {
      const { data } = await api.get<Goal[]>(`/api/v1/approvals/employee/${employeeId}`, {
        params: { cycle_id: cycleId },
      });
      return data;
    },
    enabled: !!employeeId && !!cycleId,
  });

  const approveMut = useMutation({
    mutationFn: (goalId: string) => api.post(`/api/v1/approvals/${goalId}/approve`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["approval-goals"] }),
  });

  const returnMut = useMutation({
    mutationFn: ({ goalId, comment }: { goalId: string; comment: string }) =>
      api.post(`/api/v1/approvals/${goalId}/return`, { comment }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["approval-goals"] }),
  });

  const editMut = useMutation({
    mutationFn: ({ goalId, body }: { goalId: string; body: object }) =>
      api.patch(`/api/v1/approvals/${goalId}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["approval-goals"] }),
  });

  const approveAllMut = useMutation({
    mutationFn: () =>
      api.post(`/api/v1/approvals/employee/${employeeId}/approve-all`, null, {
        params: { cycle_id: cycleId },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["approval-goals"] }),
  });

  const submitted = goals.filter((g) => g.status === "submitted");

  return (
    <div className="p-6 space-y-4">
      <Link to="/manager" className="text-brand-600 text-sm hover:underline">
        ← Back to team
      </Link>
      <h1 className="text-2xl font-bold">Approve Goals</h1>

      {submitted.length > 0 && (
        <button
          onClick={() => approveAllMut.mutate()}
          disabled={approveAllMut.isPending}
          className="px-5 py-2 bg-brand-600 text-white rounded-lg font-medium hover:bg-brand-700 disabled:opacity-50"
        >
          Approve all submitted ({submitted.length})
        </button>
      )}

      {isLoading ? (
        <p className="text-slate-500">Loading…</p>
      ) : goals.length === 0 ? (
        <p className="text-slate-500">No goals for this employee yet.</p>
      ) : (
        goals.map((goal) => (
          <article key={goal.id} className="bg-white rounded-xl border p-5 space-y-3">
            <div className="flex justify-between">
              <span>
                <span className="text-xs text-brand-600 uppercase">{goal.thrust_area}</span>
                <h3 className="font-medium">{goal.title}</h3>
                {goal.description && (
                  <p className="text-xs text-slate-500 mt-1">{goal.description}</p>
                )}
                <p className="text-xs text-slate-500 mt-1">
                  {goal.uom_type} · target {goal.target_value ?? goal.target_date} · {goal.weightage}%
                </p>
              </span>
              <span className="text-xs px-2 py-1 rounded-full bg-slate-100 self-start">{goal.status}</span>
            </div>

            {goal.status === "locked" && (
              <BlockchainBadge
                goalId={goal.id}
                txHash={goal.blockchain_tx_hash}
                verified={goal.blockchain_verified}
              />
            )}

            {goal.manager_return_comment && (
              <p className="text-sm text-amber-800 bg-amber-50 p-2 rounded">
                Previous comment: {goal.manager_return_comment}
              </p>
            )}

            {goal.status === "submitted" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm">
                    Target value
                    <input
                      type="number"
                      disabled={goal.is_shared}
                      className="mt-1 w-full border rounded px-2 py-1 disabled:bg-slate-100"
                      defaultValue={goal.target_value ?? ""}
                      onChange={(e) =>
                        setEdits((prev) => ({
                          ...prev,
                          [goal.id]: {
                            ...prev[goal.id],
                            target_value: parseFloat(e.target.value),
                          },
                        }))
                      }
                    />
                  </label>
                  <label className="text-sm">
                    Weightage %
                    <input
                      type="number"
                      className="mt-1 w-full border rounded px-2 py-1"
                      defaultValue={goal.weightage}
                      onChange={(e) =>
                        setEdits((prev) => ({
                          ...prev,
                          [goal.id]: {
                            ...prev[goal.id],
                            weightage: parseFloat(e.target.value),
                          },
                        }))
                      }
                    />
                  </label>
                </div>
                {edits[goal.id] && (
                  <button
                    type="button"
                    onClick={() => editMut.mutate({ goalId: goal.id, body: edits[goal.id] })}
                    className="text-sm text-brand-600 hover:underline"
                  >
                    Save inline edits (audited)
                  </button>
                )}
                <textarea
                  placeholder="Return comment (required to return)"
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={returnComment[goal.id] ?? ""}
                  onChange={(e) =>
                    setReturnComment((prev) => ({ ...prev, [goal.id]: e.target.value }))
                  }
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => approveMut.mutate(goal.id)}
                    disabled={approveMut.isPending}
                    className="flex-1 bg-green-600 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    Approve & lock
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const c = returnComment[goal.id]?.trim();
                      if (!c) return alert("Comment required");
                      returnMut.mutate({ goalId: goal.id, comment: c });
                    }}
                    disabled={returnMut.isPending}
                    className="flex-1 bg-amber-500 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    Return for rework
                  </button>
                </div>
              </>
            )}
          </article>
        ))
      )}
    </div>
  );
}
