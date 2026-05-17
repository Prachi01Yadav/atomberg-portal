import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";

const QUARTERS = ["Q1", "Q2", "Q3", "Q4"] as const;
type Quarter = (typeof QUARTERS)[number];

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
  quarter: Quarter;
  actual_value: number | null;
  completion_date: string | null;
  goal_status: string;
  employee_notes: string | null;
  manager_comment: string | null;
  computed_score: number | null;
}

interface WindowStatus {
  quarter: Quarter;
  is_open: boolean;
  message: string;
  days_until_open: number | null;
}

interface ActiveCycle {
  id: string;
  name: string;
  q1_open: string;
  q2_open: string;
  q3_open: string;
  q4_open: string;
}

function activeQuarterFromCycle(cycle: ActiveCycle | undefined): Quarter {
  if (!cycle) return "Q1";
  const today = new Date().toISOString().slice(0, 10);
  if (today >= cycle.q4_open) return "Q4";
  if (today >= cycle.q3_open) return "Q3";
  if (today >= cycle.q2_open) return "Q2";
  if (today >= cycle.q1_open) return "Q1";
  return "Q1";
}

export default function CheckinPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isAdmin = user?.role === "admin";
  const [activeQ, setActiveQ] = useState<Quarter>("Q1");
  const [forceOpen, setForceOpen] = useState(false);

  const { data: activeCycle } = useQuery({
    queryKey: ["active-cycle"],
    queryFn: async () =>
      (await api.get<ActiveCycle | null>("/api/v1/cycles/active")).data,
  });
  const cycleId = activeCycle?.id;

  useEffect(() => {
    if (activeCycle) setActiveQ(activeQuarterFromCycle(activeCycle));
  }, [activeCycle]);

  const { data: window } = useQuery<WindowStatus>({
    queryKey: ["checkin-window", cycleId, activeQ, forceOpen],
    queryFn: async () =>
      (await api.get<WindowStatus>("/api/v1/checkins/window", {
        params: { cycle_id: cycleId, quarter: activeQ, force_open: forceOpen },
      })).data,
    enabled: !!cycleId,
  });

  const { data: goals = [] } = useQuery({
    queryKey: ["my-locked-goals", cycleId],
    queryFn: async () => {
      const { data } = await api.get<Goal[]>("/api/v1/goals", {
        params: { cycle_id: cycleId },
      });
      return data.filter((g) => g.status === "locked");
    },
    enabled: !!cycleId,
  });

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <header className="surface p-6 bg-gradient-to-br from-emerald-50 to-white border-emerald-100">
        <div className="flex justify-between items-end flex-wrap gap-3">
          <div>
            <p className="text-sm text-emerald-700 font-semibold">Achievement tracking</p>
            <h1 className="text-3xl font-bold text-slate-900 mt-1">Quarterly Check-ins</h1>
            <p className="text-sm text-slate-500 mt-2">
              {user?.full_name} · Log planned vs actual achievement for cycle{" "}
              <strong className="text-slate-700">{activeCycle?.name ?? "—"}</strong>
            </p>
          </div>
          {isAdmin && (
            <label className="text-xs flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-amber-800">
              <input
                type="checkbox"
                checked={forceOpen}
                onChange={(e) => setForceOpen(e.target.checked)}
              />
              Admin: force window open
            </label>
          )}
        </div>
      </header>

      <FormulaLegend />

      <nav className="surface p-2 flex gap-1 w-fit">
        {QUARTERS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => setActiveQ(q)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition ${
              activeQ === q
                ? "bg-brand-600 text-white shadow-soft"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            {q}
          </button>
        ))}
      </nav>

      {window && (
        <div
          className={`surface p-4 flex items-center gap-3 ${
            window.is_open
              ? "border-emerald-200 bg-emerald-50/50"
              : "border-amber-200 bg-amber-50/50"
          }`}
        >
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              window.is_open ? "bg-emerald-500" : "bg-amber-500"
            }`}
          />
          <div>
            <p
              className={`text-sm font-semibold ${
                window.is_open ? "text-emerald-800" : "text-amber-800"
              }`}
            >
              {window.message}
            </p>
            {window.days_until_open != null && (
              <p className="text-xs text-amber-700 mt-1">
                Opens in {window.days_until_open} day(s). Try another quarter tab above, or ask an admin to enable{" "}
                <strong>force window open</strong> for demos.
              </p>
            )}
          </div>
        </div>
      )}

      {window && !window.is_open && !forceOpen && goals.length > 0 && (
        <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          Entries below are <strong>read-only</strong> until this quarter&apos;s window opens. You can still review
          planned targets and past actuals.
        </p>
      )}

      {goals.length === 0 && (
        <p className="surface p-6 text-slate-500 text-center">
          No locked goals yet. Submit your goal sheet and wait for manager approval before logging check-ins.
        </p>
      )}

      <section className="space-y-4">
        {goals.map((g) => (
          <GoalCheckinCard
            key={g.id}
            goal={g}
            quarter={activeQ}
            windowOpen={(window?.is_open ?? false) || forceOpen}
            onSaved={() => qc.invalidateQueries({ queryKey: ["goal-checkins", g.id] })}
          />
        ))}
      </section>
    </div>
  );
}

function GoalCheckinCard({
  goal,
  quarter,
  windowOpen,
  onSaved,
}: {
  goal: Goal;
  quarter: Quarter;
  windowOpen: boolean;
  onSaved: () => void;
}) {
  const { data: checkins = [] } = useQuery({
    queryKey: ["goal-checkins", goal.id],
    queryFn: async () =>
      (await api.get<Checkin[]>(`/api/v1/checkins/goal/${goal.id}`)).data,
  });
  const existing = checkins.find((c) => c.quarter === quarter);
  const [editing, setEditing] = useState(!existing);

  const planned =
    goal.uom_type === "timeline"
      ? goal.target_date ?? "—"
      : goal.target_value != null
      ? String(goal.target_value)
      : "—";
  const actual = existing
    ? existing.actual_value ?? existing.completion_date ?? "—"
    : "—";

  const uomLabel: Record<string, string> = {
    numeric_min: "Min (higher is better)",
    numeric_max: "Max (lower is better)",
    timeline: "Timeline",
    zero: "Zero (0 = success)",
  };

  return (
    <article className="surface p-5 space-y-3">
      <header className="flex justify-between items-start gap-3">
        <div className="flex-1">
          <span className="text-xs text-brand-600 uppercase font-semibold tracking-wide">
            {goal.thrust_area}
          </span>
          <h3 className="font-semibold text-slate-900 mt-0.5">{goal.title}</h3>
          {goal.description && (
            <p className="text-xs text-slate-500 mt-1">{goal.description}</p>
          )}
          <p className="text-xs text-slate-500 mt-2">
            {uomLabel[goal.uom_type] ?? goal.uom_type} · weightage {goal.weightage}%
          </p>
        </div>
        {existing && existing.computed_score !== null && (
          <ScoreChip score={existing.computed_score} uomType={goal.uom_type} />
        )}
      </header>

      <div className="grid sm:grid-cols-2 gap-3 mt-2">
        <PlanActualTile label="Planned target" value={planned} color="indigo" />
        <PlanActualTile
          label="Your actual"
          value={String(actual)}
          color={existing ? "emerald" : "slate"}
        />
      </div>

      {existing && goal.uom_type !== "timeline" && goal.target_value && (
        <ProgressBar score={existing.computed_score ?? 0} uomType={goal.uom_type} />
      )}

      {existing && (
        <div className="text-sm bg-slate-50 rounded-lg p-3 space-y-1 border border-slate-100">
          <p>
            <strong>Status:</strong>{" "}
            <StatusPill status={existing.goal_status} />
          </p>
          {existing.employee_notes && (
            <p className="text-slate-700"><strong>Your notes:</strong> {existing.employee_notes}</p>
          )}
          {existing.manager_comment && (
            <p className="text-brand-700">
              <strong>Manager comment:</strong> {existing.manager_comment}
            </p>
          )}
        </div>
      )}

      {windowOpen && (
        <>
          {!editing && existing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-sm text-brand-600 hover:underline"
            >
              Update check-in
            </button>
          )}
          {editing && (
            <CheckinForm
              goal={goal}
              quarter={quarter}
              existing={existing ?? null}
              onSaved={() => {
                setEditing(false);
                onSaved();
              }}
            />
          )}
        </>
      )}
    </article>
  );
}

function PlanActualTile({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: "indigo" | "emerald" | "slate";
}) {
  const map: Record<string, string> = {
    indigo: "bg-indigo-50 border-indigo-100 text-indigo-700",
    emerald: "bg-emerald-50 border-emerald-100 text-emerald-700",
    slate: "bg-slate-50 border-slate-100 text-slate-500",
  };
  return (
    <div className={`border rounded-lg p-3 ${map[color]}`}>
      <p className="text-[10px] uppercase font-semibold tracking-wider">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}

function ProgressBar({ score, uomType }: { score: number; uomType: string }) {
  const pct = Math.min(score * 100, 100);
  const colour =
    pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-400";
  const direction = uomType === "numeric_max" ? "lower is better" : "higher is better";
  return (
    <div>
      <div className="flex justify-between text-xs text-slate-500 mb-1">
        <span>Achievement vs target ({direction})</span>
        <span className="font-semibold">{pct.toFixed(0)}%</span>
      </div>
      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full ${colour} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    not_started: { label: "Not Started", cls: "bg-slate-200 text-slate-700" },
    on_track: { label: "On Track", cls: "bg-amber-100 text-amber-800" },
    completed: { label: "Completed", cls: "bg-emerald-100 text-emerald-800" },
  };
  const v = map[status] ?? { label: status, cls: "bg-slate-100 text-slate-700" };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${v.cls}`}>
      {v.label}
    </span>
  );
}

function ScoreChip({ score, uomType }: { score: number; uomType: string }) {
  const display = Math.min(score, 1.0) * 100;
  const cls =
    display >= 80
      ? "bg-emerald-100 text-emerald-800 border-emerald-200"
      : display >= 50
      ? "bg-amber-100 text-amber-800 border-amber-200"
      : "bg-red-100 text-red-800 border-red-200";
  const formula: Record<string, string> = {
    numeric_min: "Achievement ÷ Target",
    numeric_max: "Target ÷ Achievement",
    timeline: "On-time = 100% · else decays 30 days",
    zero: "0 = 100% · else 0%",
  };
  return (
    <div className="flex flex-col items-end gap-1">
      <span
        className={`text-xs px-3 py-1 rounded-full border font-semibold ${cls}`}
      >
        Score {display.toFixed(0)}%
      </span>
      <span className="text-[10px] text-slate-500 italic">
        Formula: {formula[uomType] ?? "—"}
      </span>
    </div>
  );
}

function FormulaLegend() {
  const [open, setOpen] = useState(true);
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
        <FormulaCard
          uom="Min (Numeric / %)"
          desc="Higher is better — e.g. Sales Revenue"
          formula="Achievement ÷ Target"
          color="brand"
        />
        <FormulaCard
          uom="Max (Numeric / %)"
          desc="Lower is better — e.g. TAT, Cost"
          formula="Target ÷ Achievement"
          color="indigo"
        />
        <FormulaCard
          uom="Timeline"
          desc="Date-based completion"
          formula="On-time = 100%, else –1/30 per late day"
          color="purple"
        />
        <FormulaCard
          uom="Zero"
          desc="0 = success — e.g. Safety incidents"
          formula="0 → 100%, else 0%"
          color="emerald"
        />
      </div>
    </details>
  );
}

function FormulaCard({
  uom,
  desc,
  formula,
  color,
}: {
  uom: string;
  desc: string;
  formula: string;
  color: "brand" | "indigo" | "purple" | "emerald";
}) {
  const accentMap: Record<string, string> = {
    brand: "border-brand-200 bg-brand-50/50",
    indigo: "border-indigo-200 bg-indigo-50/50",
    purple: "border-purple-200 bg-purple-50/50",
    emerald: "border-emerald-200 bg-emerald-50/50",
  };
  return (
    <div className={`border rounded-lg p-3 ${accentMap[color]}`}>
      <p className="text-xs font-semibold text-slate-800">{uom}</p>
      <p className="text-[10px] text-slate-500 mt-0.5">{desc}</p>
      <p className="mt-2 text-xs font-mono bg-white border border-slate-200 rounded px-2 py-1 text-slate-700">
        {formula}
      </p>
    </div>
  );
}

function CheckinForm({
  goal,
  quarter,
  existing,
  onSaved,
}: {
  goal: Goal;
  quarter: Quarter;
  existing: Checkin | null;
  onSaved: () => void;
}) {
  const [actual, setActual] = useState<number>(existing?.actual_value ?? 0);
  const [completionDate, setCompletionDate] = useState(existing?.completion_date ?? "");
  const [status, setStatus] = useState(existing?.goal_status ?? "on_track");
  const [notes, setNotes] = useState(existing?.employee_notes ?? "");
  const [error, setError] = useState("");

  const saveMut = useMutation({
    mutationFn: () => {
      const body: any = {
        actual_value: goal.uom_type === "timeline" ? null : actual,
        completion_date: goal.uom_type === "timeline" ? completionDate || null : null,
        goal_status: status,
        employee_notes: notes,
      };
      if (!existing) body.quarter = quarter;
      if (existing) return api.patch(`/api/v1/checkins/${existing.id}`, body);
      return api.post(`/api/v1/checkins/goal/${goal.id}`, body);
    },
    onSuccess: () => onSaved(),
    onError: (e: any) => setError(e?.response?.data?.detail ?? "Failed to save"),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        saveMut.mutate();
      }}
      className="border-t border-slate-100 pt-3 space-y-3"
    >
      <div className="grid sm:grid-cols-2 gap-3">
        {goal.uom_type === "timeline" ? (
          <label className="text-sm">
            <span className="text-slate-700 font-medium">Completion date</span>
            <input
              type="date"
              required
              className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              value={completionDate}
              onChange={(e) => setCompletionDate(e.target.value)}
            />
          </label>
        ) : (
          <label className="text-sm">
            <span className="text-slate-700 font-medium">Actual achievement</span>
            <input
              type="number"
              step="0.01"
              className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              value={actual}
              onChange={(e) => setActual(+e.target.value)}
            />
          </label>
        )}
        <label className="text-sm">
          <span className="text-slate-700 font-medium">Goal status</span>
          <select
            className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="not_started">Not Started</option>
            <option value="on_track">On Track</option>
            <option value="completed">Completed</option>
          </select>
        </label>
      </div>
      <label className="text-sm block">
        <span className="text-slate-700 font-medium">Notes (optional)</span>
        <textarea
          rows={2}
          placeholder="Any context, blockers, or next steps…"
          className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 p-2 rounded">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={saveMut.isPending}
        className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium shadow-soft disabled:opacity-50"
      >
        {saveMut.isPending ? "Saving…" : existing ? "Update check-in" : "Submit check-in"}
      </button>
    </form>
  );
}
