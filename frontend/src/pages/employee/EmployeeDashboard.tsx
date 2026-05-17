import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";

interface Goal {
  id: string;
  title: string;
  thrust_area: string;
  weightage: number;
  status: string;
}

interface Checkin {
  id: string;
  quarter: string;
  actual_value: number | null;
  goal_status: string;
  computed_score: number | null;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "#94a3b8",
  submitted: "#f59e0b",
  locked: "#10b981",
  returned: "#ef4444",
  approved: "#10b981",
};

export default function EmployeeDashboard() {
  const { user } = useAuth();

  const { data: activeCycle } = useQuery({
    queryKey: ["active-cycle"],
    queryFn: async () =>
      (await api.get<{ id: string; name: string } | null>("/api/v1/cycles/active")).data,
  });
  const cycleId = activeCycle?.id;

  const { data: goals = [] } = useQuery({
    queryKey: ["my-goals", cycleId],
    queryFn: async () =>
      (await api.get<Goal[]>("/api/v1/goals", { params: { cycle_id: cycleId } })).data,
    enabled: !!cycleId,
  });

  const { data: qoq } = useQuery({
    queryKey: ["qoq-me"],
    queryFn: async () =>
      (await api.get<{ quarters: string[]; weighted_scores: number[] }>(
        "/api/v1/analytics/qoq-trends"
      )).data,
  });

  // Aggregate stats
  const totalWeight = goals.reduce((s, g) => s + g.weightage, 0);
  const locked = goals.filter((g) => g.status === "locked").length;
  const submitted = goals.filter((g) => g.status === "submitted").length;
  const drafts = goals.filter((g) => g.status === "draft" || g.status === "returned").length;

  const statusData = [
    { name: "Locked", value: locked, color: "#10b981" },
    { name: "Submitted", value: submitted, color: "#f59e0b" },
    { name: "Draft", value: drafts, color: "#94a3b8" },
  ].filter((d) => d.value > 0);

  // Latest quarter score (from QoQ trend, most recent non-zero)
  const latestScore = qoq?.weighted_scores
    .slice()
    .reverse()
    .find((s) => s > 0);
  const latestQ = qoq && latestScore
    ? qoq.quarters[qoq.weighted_scores.lastIndexOf(latestScore)]
    : null;

  // Fetch check-ins for all locked goals (just count totals across quarters)
  const lockedIds = goals.filter((g) => g.status === "locked").map((g) => g.id);
  const { data: allCheckins = [] } = useQuery({
    queryKey: ["all-checkins", lockedIds.join(",")],
    queryFn: async () => {
      const out: Checkin[] = [];
      for (const id of lockedIds) {
        const { data } = await api.get<Checkin[]>(`/api/v1/checkins/goal/${id}`);
        out.push(...data);
      }
      return out;
    },
    enabled: lockedIds.length > 0,
  });

  const completedCheckins = allCheckins.filter((c) => c.goal_status === "completed").length;
  const onTrackCheckins = allCheckins.filter((c) => c.goal_status === "on_track").length;

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      {/* Hero */}
      <header className="surface p-6 bg-gradient-to-br from-brand-50 to-white border-brand-100">
        <div className="flex justify-between items-start flex-wrap gap-4">
          <div>
            <p className="text-sm text-brand-700 font-semibold">
              Welcome back, {user?.full_name?.split(" ")[0]}
            </p>
            <h1 className="text-3xl font-bold text-slate-900 mt-1">My Dashboard</h1>
            <p className="text-sm text-slate-500 mt-2">
              Active cycle <strong className="text-slate-700">{activeCycle?.name ?? "—"}</strong>
              {user?.department && (
                <span> · Department <strong className="text-slate-700">{user.department}</strong></span>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <Link to="/goals" className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium shadow-soft">
              View my goals
            </Link>
            <Link to="/checkins" className="px-4 py-2 bg-white border border-slate-200 hover:border-brand-400 rounded-lg text-sm font-medium">
              Log check-in
            </Link>
          </div>
        </div>
      </header>

      {/* Stat tiles */}
      <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile
          label="Total goals"
          value={goals.length}
          subtext={`${locked} locked · ${submitted} pending`}
          accent="brand"
        />
        <StatTile
          label="Weightage total"
          value={`${totalWeight}%`}
          subtext={
            Math.abs(totalWeight - 100) < 0.01
              ? "Ready to submit"
              : `${(100 - totalWeight).toFixed(0)}% remaining`
          }
          accent={Math.abs(totalWeight - 100) < 0.01 ? "emerald" : "amber"}
        />
        <StatTile
          label="Check-ins logged"
          value={allCheckins.length}
          subtext={`${completedCheckins} completed · ${onTrackCheckins} on track`}
          accent="purple"
        />
        <StatTile
          label={`Latest quarter (${latestQ ?? "—"})`}
          value={latestScore ? `${(latestScore * 100).toFixed(0)}%` : "—"}
          subtext="Weighted achievement"
          accent="indigo"
        />
      </section>

      {/* Charts row */}
      <section className="grid lg:grid-cols-3 gap-4">
        <div className="surface p-5 lg:col-span-1">
          <p className="section-h">Goal status</p>
          {statusData.length === 0 ? (
            <p className="text-slate-400 text-sm">No goals yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={statusData}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={80}
                  innerRadius={45}
                  paddingAngle={2}
                >
                  {statusData.map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
          <div className="flex justify-center gap-3 text-xs text-slate-500">
            {statusData.map((s) => (
              <span key={s.name} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                {s.name} {s.value}
              </span>
            ))}
          </div>
        </div>

        <div className="surface p-5 lg:col-span-2">
          <div className="flex justify-between items-center mb-3">
            <p className="section-h !mb-0">My goals</p>
            <Link to="/goals" className="text-xs text-brand-600 hover:underline">
              View all →
            </Link>
          </div>
          {goals.length === 0 ? (
            <p className="text-slate-400 text-sm">No goals yet. Click "View my goals" to add your first one.</p>
          ) : (
            <ul className="space-y-2">
              {goals.slice(0, 5).map((g) => (
                <li
                  key={g.id}
                  className="flex justify-between items-center p-3 rounded-lg border border-slate-100 hover:border-brand-200 hover:bg-slate-50 transition"
                >
                  <div className="flex-1">
                    <p className="text-xs text-brand-600 font-medium uppercase tracking-wide">
                      {g.thrust_area}
                    </p>
                    <p className="text-sm font-medium text-slate-900">{g.title}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-slate-700">{g.weightage}%</span>
                    <span
                      className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full"
                      style={{
                        background: `${STATUS_COLORS[g.status] ?? "#cbd5e1"}22`,
                        color: STATUS_COLORS[g.status] ?? "#64748b",
                      }}
                    >
                      {g.status}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* QoQ trend mini */}
      <section className="surface p-5">
        <p className="section-h">Quarter-on-Quarter weighted score</p>
        {qoq && qoq.weighted_scores.some((s) => s > 0) ? (
          <div className="grid grid-cols-4 gap-3">
            {qoq.quarters.map((q, i) => {
              const v = qoq.weighted_scores[i];
              const pct = Math.round(v * 100);
              return (
                <div key={q} className="text-center">
                  <p className="text-xs text-slate-500">{q}</p>
                  <div className="my-2 h-20 flex items-end justify-center">
                    <div
                      className="w-12 rounded-t-lg bg-gradient-to-t from-brand-500 to-brand-300"
                      style={{ height: `${Math.max(pct, 4)}%` }}
                    />
                  </div>
                  <p className="text-sm font-semibold text-slate-700">{pct}%</p>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-slate-400 text-sm">No completed quarters yet. Log a check-in to start tracking.</p>
        )}
      </section>
    </div>
  );
}

function StatTile({
  label,
  value,
  subtext,
  accent,
}: {
  label: string;
  value: string | number;
  subtext?: string;
  accent: "brand" | "emerald" | "amber" | "purple" | "indigo";
}) {
  const accentMap: Record<string, string> = {
    brand: "bg-brand-500",
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    purple: "bg-purple-500",
    indigo: "bg-indigo-500",
  };
  return (
    <div className="stat relative overflow-hidden">
      <div className={`absolute top-0 left-0 w-1 h-full ${accentMap[accent]}`} />
      <p className="text-xs uppercase text-slate-500 font-semibold tracking-wider">{label}</p>
      <p className="text-3xl font-bold text-slate-900 mt-2">{value}</p>
      {subtext && <p className="text-xs text-slate-500 mt-1">{subtext}</p>}
    </div>
  );
}
