import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

function FormulaLegend() {
  const [open, setOpen] = useState(true);
  const cards: Array<{
    uom: string;
    desc: string;
    formula: string;
    color: "brand" | "indigo" | "purple" | "emerald";
  }> = [
    { uom: "Min (Numeric / %)", desc: "Higher is better — e.g. Sales Revenue", formula: "Achievement ÷ Target", color: "brand" },
    { uom: "Max (Numeric / %)", desc: "Lower is better — e.g. TAT, Cost", formula: "Target ÷ Achievement", color: "indigo" },
    { uom: "Timeline", desc: "Date-based completion", formula: "On-time = 100%, else -1/30 per late day", color: "purple" },
    { uom: "Zero", desc: "0 = success — e.g. Safety incidents", formula: "0 → 100%, else 0%", color: "emerald" },
  ];
  const accentMap: Record<string, string> = {
    brand: "border-brand-200 bg-brand-50/50",
    indigo: "border-indigo-200 bg-indigo-50/50",
    purple: "border-purple-200 bg-purple-50/50",
    emerald: "border-emerald-200 bg-emerald-50/50",
  };
  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      className="surface p-4"
    >
      <summary className="cursor-pointer text-sm font-semibold text-slate-700 flex items-center justify-between">
        <span>Score formulas (tracking only — not ratings)</span>
        <span className="text-xs text-brand-600">{open ? "Hide" : "Show"}</span>
      </summary>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
        {cards.map((c) => (
          <div key={c.uom} className={`border rounded-lg p-3 ${accentMap[c.color]}`}>
            <p className="text-xs font-semibold text-slate-800">{c.uom}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">{c.desc}</p>
            <p className="mt-2 text-xs font-mono bg-white border border-slate-200 rounded px-2 py-1 text-slate-700">
              {c.formula}
            </p>
          </div>
        ))}
      </div>
    </details>
  );
}

interface TeamMember {
  employee_id: string;
  full_name: string;
  department: string | null;
  total_goals: number;
  locked_count: number;
}

interface Goal {
  id: string;
  title: string;
  description?: string;
  thrust_area: string;
  uom_type: string;
  target_value: number | null;
  target_date: string | null;
  weightage: number;
  status: string;
}

interface Checkin {
  id: string;
  quarter: string;
  actual_value: number | null;
  completion_date: string | null;
  goal_status: string;
  employee_notes: string | null;
  manager_comment: string | null;
  computed_score: number | null;
}

const COMMENT_CHIPS = [
  "On track — keep it up",
  "Needs additional support",
  "Risk identified — let's discuss",
  "Stretch goal achieved",
  "Re-prioritise for next quarter",
];

export default function ManagerCheckinView() {
  const { user } = useAuth();
  const { data: activeCycle } = useQuery({
    queryKey: ["active-cycle"],
    queryFn: async () =>
      (await api.get<{ id: string; name: string } | null>("/api/v1/cycles/active")).data,
  });
  const cycleId = activeCycle?.id;

  const { data: team = [] } = useQuery({
    queryKey: ["team-summary-ck", cycleId],
    queryFn: async () =>
      (await api.get<TeamMember[]>("/api/v1/approvals/team/summary", {
        params: { cycle_id: cycleId },
      })).data,
    enabled: !!cycleId,
  });

  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <header className="surface p-6 bg-gradient-to-br from-emerald-50 to-white border-emerald-100">
        <p className="text-sm text-emerald-700 font-semibold">Manager check-in module</p>
        <h1 className="text-3xl font-bold text-slate-900 mt-1">Team Check-ins</h1>
        <p className="text-sm text-slate-500 mt-2">
          {user?.full_name} · Review planned vs achievement & log structured comments — cycle{" "}
          <strong className="text-slate-700">{activeCycle?.name ?? "—"}</strong>
        </p>
      </header>

      <FormulaLegend />

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        <aside className="surface p-4 space-y-2 h-fit">
          <p className="section-h">Direct reports</p>
          {team.length === 0 && (
            <p className="text-sm text-slate-500">No team members.</p>
          )}
          {team.map((m) => (
            <button
              key={m.employee_id}
              type="button"
              onClick={() => setSelected(m.employee_id)}
              className={`w-full text-left px-3 py-2 rounded-lg border transition ${
                selected === m.employee_id
                  ? "border-brand-400 bg-brand-50"
                  : "border-slate-100 hover:border-brand-200 hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-400 to-accent-500 text-white font-semibold flex items-center justify-center text-xs shadow-soft">
                  {m.full_name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{m.full_name}</p>
                  <p className="text-[10px] text-slate-500">
                    {m.locked_count} locked · {m.total_goals} goals
                  </p>
                </div>
              </div>
            </button>
          ))}
        </aside>

        <section>
          {selected ? (
            <EmployeeCheckins employeeId={selected} cycleId={cycleId!} />
          ) : (
            <div className="surface p-12 text-center text-slate-400">
              Select a team member to view their quarterly check-ins
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function EmployeeCheckins({ employeeId, cycleId }: { employeeId: string; cycleId: string }) {
  const { data: goals = [] } = useQuery({
    queryKey: ["approval-goals", employeeId, cycleId],
    queryFn: async () => {
      const { data } = await api.get<Goal[]>(`/api/v1/approvals/employee/${employeeId}`, {
        params: { cycle_id: cycleId },
      });
      return data.filter((g) => g.status === "locked");
    },
  });

  return (
    <div className="space-y-4">
      {goals.length === 0 && (
        <div className="surface p-8 text-center text-slate-400">
          No locked goals to review for this employee yet.
        </div>
      )}
      {goals.map((g) => (
        <GoalCheckinsView key={g.id} goal={g} />
      ))}
    </div>
  );
}

function GoalCheckinsView({ goal }: { goal: Goal }) {
  const qc = useQueryClient();
  const { data: checkins = [] } = useQuery({
    queryKey: ["mgr-goal-checkins", goal.id],
    queryFn: async () =>
      (await api.get<Checkin[]>(`/api/v1/checkins/goal/${goal.id}`)).data,
  });

  const commentMut = useMutation({
    mutationFn: (args: { id: string; comment: string }) =>
      api.post(`/api/v1/checkins/${args.id}/manager-comment`, {
        manager_comment: args.comment,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mgr-goal-checkins", goal.id] }),
  });

  const planned =
    goal.uom_type === "timeline"
      ? goal.target_date ?? "—"
      : goal.target_value != null
      ? String(goal.target_value)
      : "—";

  return (
    <article className="surface p-5">
      <header className="flex justify-between items-start mb-4 gap-3">
        <div>
          <span className="text-xs text-brand-600 uppercase font-semibold tracking-wide">
            {goal.thrust_area}
          </span>
          <h3 className="font-semibold text-slate-900 mt-0.5">{goal.title}</h3>
          {goal.description && (
            <p className="text-xs text-slate-500 mt-1">{goal.description}</p>
          )}
          <p className="text-xs text-slate-500 mt-2">
            <strong>Planned target:</strong> {planned} · {goal.uom_type} · weightage{" "}
            {goal.weightage}%
          </p>
        </div>
      </header>

      {checkins.length === 0 ? (
        <p className="text-sm text-slate-400 italic">No check-ins logged yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="text-left p-2 rounded-l-lg">Quarter</th>
                <th className="text-left p-2">Planned</th>
                <th className="text-left p-2">Actual</th>
                <th className="text-left p-2">Status</th>
                <th className="text-left p-2">Score</th>
                <th className="text-left p-2">Employee notes</th>
                <th className="text-left p-2 rounded-r-lg">Manager comment</th>
              </tr>
            </thead>
            <tbody>
              {checkins.map((c) => (
                <CheckinRow
                  key={c.id}
                  c={c}
                  planned={planned}
                  uomType={goal.uom_type}
                  onSave={(comment) => commentMut.mutate({ id: c.id, comment })}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}

function CheckinRow({
  c,
  planned,
  uomType,
  onSave,
}: {
  c: Checkin;
  planned: string;
  uomType: string;
  onSave: (comment: string) => void;
}) {
  const [comment, setComment] = useState(c.manager_comment ?? "");
  const [saved, setSaved] = useState(false);
  const actual = c.actual_value ?? c.completion_date ?? "—";

  const statusMap: Record<string, string> = {
    not_started: "bg-slate-200 text-slate-700",
    on_track: "bg-amber-100 text-amber-800",
    completed: "bg-emerald-100 text-emerald-800",
  };
  const statusLabel: Record<string, string> = {
    not_started: "Not Started",
    on_track: "On Track",
    completed: "Completed",
  };

  const scoreCls =
    c.computed_score === null
      ? "bg-slate-100 text-slate-500"
      : c.computed_score >= 0.8
      ? "bg-emerald-100 text-emerald-800"
      : c.computed_score >= 0.5
      ? "bg-amber-100 text-amber-800"
      : "bg-red-100 text-red-800";

  const formula: Record<string, string> = {
    numeric_min: "Achievement ÷ Target",
    numeric_max: "Target ÷ Achievement",
    timeline: "On-time = 100% · decays 30d",
    zero: "0 = 100% · else 0%",
  };

  return (
    <tr className="border-t border-slate-100 align-top">
      <td className="p-2 font-semibold">{c.quarter}</td>
      <td className="p-2 text-indigo-700">{planned}</td>
      <td className="p-2 text-emerald-700 font-medium">{String(actual)}</td>
      <td className="p-2">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusMap[c.goal_status] ?? "bg-slate-100"}`}>
          {statusLabel[c.goal_status] ?? c.goal_status}
        </span>
      </td>
      <td className="p-2">
        <div className="flex flex-col gap-0.5">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium w-fit ${scoreCls}`}>
            {c.computed_score !== null
              ? `${Math.min(c.computed_score, 1) * 100}%`.replace(/\.\d+/, "")
              : "—"}
          </span>
          <span className="text-[9px] text-slate-400 italic whitespace-nowrap">
            {formula[uomType] ?? "—"}
          </span>
        </div>
      </td>
      <td className="p-2 text-xs text-slate-600 max-w-[140px]">
        {c.employee_notes || "—"}
      </td>
      <td className="p-2 min-w-[240px]">
        <div className="flex flex-wrap gap-1 mb-1">
          {COMMENT_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => setComment((prev) => (prev ? `${prev} · ${chip}` : chip))}
              className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 hover:bg-brand-100 text-slate-700 hover:text-brand-700 border border-slate-200 transition"
            >
              + {chip}
            </button>
          ))}
        </div>
        <textarea
          rows={2}
          placeholder="Structured discussion notes…"
          className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs focus:ring-2 focus:ring-brand-500"
          value={comment}
          onChange={(e) => {
            setComment(e.target.value);
            setSaved(false);
          }}
        />
        <div className="flex items-center justify-between mt-1">
          <button
            type="button"
            onClick={() => {
              onSave(comment);
              setSaved(true);
              setTimeout(() => setSaved(false), 2000);
            }}
            className="text-xs px-2 py-1 bg-brand-600 hover:bg-brand-700 text-white rounded font-medium"
          >
            Save
          </button>
          {saved && <span className="text-xs text-emerald-600">Saved</span>}
        </div>
      </td>
    </tr>
  );
}
