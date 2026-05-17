import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface Cycle {
  id: string;
  name: string;
  goal_setting_open: string;
  q1_open: string;
  q2_open: string;
  q3_open: string;
  q4_open: string;
  is_active: boolean;
  created_at: string;
}

interface LockedGoal {
  goal_id: string;
  title: string;
  employee_name: string;
  department: string | null;
  weightage: number;
  locked_at: string | null;
}

export default function CycleManagement() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [unlockId, setUnlockId] = useState<string>("");
  const [unlockReason, setUnlockReason] = useState<string>("");

  const { data: cycles = [] } = useQuery({
    queryKey: ["cycles"],
    queryFn: async () => {
      const { data } = await api.get<Cycle[]>("/api/v1/cycles");
      return data;
    },
  });

  const { data: lockedGoals = [] } = useQuery({
    queryKey: ["locked-goals"],
    queryFn: async () =>
      (await api.get<LockedGoal[]>("/api/v1/admin/goals/locked")).data,
  });

  const activateMut = useMutation({
    mutationFn: (id: string) => api.post(`/api/v1/cycles/${id}/activate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cycles"] }),
  });

  const unlockMut = useMutation({
    mutationFn: ({ goalId, reason }: { goalId: string; reason: string }) =>
      api.post(`/api/v1/admin/goals/${goalId}/unlock`, { reason }),
    onSuccess: () => {
      setUnlockId("");
      setUnlockReason("");
      qc.invalidateQueries({ queryKey: ["audit-logs"] });
      qc.invalidateQueries({ queryKey: ["locked-goals"] });
    },
  });

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold">Performance Cycles</h1>
          <p className="text-sm text-slate-500">Configure goal-setting and quarterly windows.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm"
        >
          + New cycle
        </button>
      </header>

      {showCreate && <CreateCycleForm onDone={() => setShowCreate(false)} />}

      <div className="bg-white border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-xs uppercase text-slate-500">
            <tr>
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3">Goal setting</th>
              <th className="text-left p-3">Q1</th>
              <th className="text-left p-3">Q2</th>
              <th className="text-left p-3">Q3</th>
              <th className="text-left p-3">Q4</th>
              <th className="text-left p-3">Active</th>
            </tr>
          </thead>
          <tbody>
            {cycles.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="p-3 font-medium">{c.name}</td>
                <td className="p-3 text-xs">{c.goal_setting_open}</td>
                <td className="p-3 text-xs">{c.q1_open}</td>
                <td className="p-3 text-xs">{c.q2_open}</td>
                <td className="p-3 text-xs">{c.q3_open}</td>
                <td className="p-3 text-xs">{c.q4_open}</td>
                <td className="p-3">
                  {c.is_active ? (
                    <span className="text-xs text-green-700 font-medium px-2 py-0.5 rounded-full bg-green-50 border border-green-200">Active</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => activateMut.mutate(c.id)}
                      className="text-xs text-brand-600 hover:underline"
                    >
                      Activate
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="bg-white border rounded-xl p-4">
        <h2 className="font-semibold mb-2">Goal unlock</h2>
        <p className="text-sm text-slate-500 mb-3">
          Pick a locked goal to unlock for re-editing. Every unlock is audited and anchored
          on chain.
        </p>
        {lockedGoals.length === 0 ? (
          <p className="text-sm text-slate-400">No locked goals available.</p>
        ) : (
          <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2">
            <select
              value={unlockId}
              onChange={(e) => setUnlockId(e.target.value)}
              className="border rounded px-2 py-1.5 text-sm"
            >
              <option value="">— select a locked goal —</option>
              {lockedGoals.map((g) => (
                <option key={g.goal_id} value={g.goal_id}>
                  {g.employee_name} — {g.title} ({g.weightage}%)
                </option>
              ))}
            </select>
            <input
              placeholder="Reason (audited)"
              value={unlockReason}
              onChange={(e) => setUnlockReason(e.target.value)}
              className="border rounded px-2 py-1.5 text-sm"
            />
            <button
              type="button"
              disabled={!unlockId || !unlockReason || unlockMut.isPending}
              onClick={() =>
                unlockMut.mutate({ goalId: unlockId, reason: unlockReason })
              }
              className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded text-sm disabled:opacity-50"
            >
              Unlock
            </button>
          </div>
        )}
        {unlockMut.isSuccess && (
          <p className="text-sm text-green-600 mt-2">Unlocked. Audit entry created.</p>
        )}
        {unlockMut.isError && (
          <p className="text-sm text-red-600 mt-2">
            {(unlockMut.error as any)?.response?.data?.detail ?? "Failed"}
          </p>
        )}
      </section>
    </div>
  );
}

function CreateCycleForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("FY2026-27");
  const [gso, setGso] = useState("2026-05-01");
  const [q1, setQ1] = useState("2026-07-01");
  const [q2, setQ2] = useState("2026-10-01");
  const [q3, setQ3] = useState("2027-01-01");
  const [q4, setQ4] = useState("2027-04-01");
  const [active, setActive] = useState(true);

  const mut = useMutation({
    mutationFn: () =>
      api.post("/api/v1/cycles", {
        name,
        goal_setting_open: gso,
        q1_open: q1,
        q2_open: q2,
        q3_open: q3,
        q4_open: q4,
        is_active: active,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cycles"] });
      qc.invalidateQueries({ queryKey: ["active-cycle"] });
      onDone();
    },
  });

  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        mut.mutate();
      }}
      className="bg-white border rounded-xl p-4 grid grid-cols-3 gap-3"
    >
      <label className="text-sm col-span-3">
        Name
        <input
          className="mt-1 w-full border rounded px-2 py-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      {[
        ["Goal setting open", gso, setGso],
        ["Q1 open", q1, setQ1],
        ["Q2 open", q2, setQ2],
        ["Q3 open", q3, setQ3],
        ["Q4 open", q4, setQ4],
      ].map(([label, val, set]: any) => (
        <label key={label} className="text-sm">
          {label}
          <input
            type="date"
            className="mt-1 w-full border rounded px-2 py-1"
            value={val}
            onChange={(e) => set(e.target.value)}
          />
        </label>
      ))}
      <label className="flex items-center gap-2 text-sm col-span-3">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
        />
        Set as active cycle
      </label>
      <div className="col-span-3 flex gap-2">
        <button
          type="submit"
          disabled={mut.isPending}
          className="px-4 py-1.5 bg-brand-600 text-white rounded text-sm"
        >
          Create
        </button>
        <button
          type="button"
          onClick={onDone}
          className="px-4 py-1.5 border rounded text-sm"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
