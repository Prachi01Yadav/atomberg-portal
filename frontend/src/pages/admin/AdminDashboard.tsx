import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "@/lib/api";

export default function AdminDashboard() {
  const { data: activeCycle } = useQuery({
    queryKey: ["active-cycle"],
    queryFn: async () =>
      (await api.get<{ id: string; name: string } | null>("/api/v1/cycles/active")).data,
  });

  const { data: dashboard = [] } = useQuery({
    queryKey: ["completion-dashboard", activeCycle?.id],
    queryFn: async () =>
      (await api.get("/api/v1/reports/completion-dashboard", {
        params: { cycle_id: activeCycle?.id },
      })).data as Array<{
        manager_name: string;
        team_size: number;
        goals_submitted_pct: number;
        goals_approved_pct: number;
        checkins_done_pct: number;
        active_quarter: string | null;
      }>,
    enabled: !!activeCycle?.id,
  });

  const { data: users = [] } = useQuery({
    queryKey: ["all-users-count"],
    queryFn: async () => (await api.get<any[]>("/api/v1/users")).data,
  });

  const { data: dist } = useQuery({
    queryKey: ["dist-admin", activeCycle?.id],
    queryFn: async () =>
      (await api.get<{
        thrust_area: Record<string, number>;
        status: Record<string, number>;
      }>("/api/v1/analytics/goal-distribution", { params: { cycle_id: activeCycle?.id } })).data,
    enabled: !!activeCycle?.id,
  });

  const { data: audits = [] } = useQuery({
    queryKey: ["audit-recent"],
    queryFn: async () => (await api.get<any[]>("/api/v1/admin/audit-logs?limit=5")).data,
  });

  const { data: escalations = [] } = useQuery({
    queryKey: ["esc-recent"],
    queryFn: async () => (await api.get<any[]>("/api/v1/escalations/logs?limit=5")).data,
  });

  const totalUsers = users.length;
  const totalManagers = users.filter((u) => u.role === "manager").length;
  const totalEmployees = users.filter((u) => u.role === "employee").length;
  const totalGoals = Object.values(dist?.status ?? {}).reduce((a, b) => a + (b as number), 0);
  const lockedGoals = (dist?.status ?? {})["locked"] ?? 0;
  const pendingEsc = escalations.filter((e) => !e.resolved_at).length;

  const thrustData = Object.entries(dist?.thrust_area ?? {}).map(([name, value]) => ({
    name,
    value,
  }));
  const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"];

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <header className="surface p-6 bg-gradient-to-br from-purple-50 to-white border-purple-100">
        <div className="flex justify-between items-start flex-wrap gap-3">
          <div>
            <p className="text-sm text-purple-700 font-semibold">Administration</p>
            <h1 className="text-3xl font-bold text-slate-900 mt-1">Admin Console</h1>
            <p className="text-sm text-slate-500 mt-2">
              Active cycle <strong className="text-slate-700">{activeCycle?.name ?? "None"}</strong>
              {dashboard[0]?.active_quarter && (
                <span> · Window <strong className="text-emerald-700">{dashboard[0].active_quarter}</strong></span>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <Link to="/admin/cycles" className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium shadow-soft">
              Manage cycles
            </Link>
            <Link to="/analytics" className="px-4 py-2 bg-white border border-slate-200 hover:border-purple-400 rounded-lg text-sm font-medium">
              Analytics
            </Link>
          </div>
        </div>
      </header>

      {/* Top stats */}
      <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile
          label="Total users"
          value={totalUsers}
          subtext={`${totalManagers} managers · ${totalEmployees} employees`}
          accent="brand"
        />
        <StatTile
          label="Total goals"
          value={totalGoals}
          subtext={`${lockedGoals} locked · ${totalGoals - lockedGoals} in-flight`}
          accent="indigo"
        />
        <StatTile
          label="Pending escalations"
          value={pendingEsc}
          subtext={pendingEsc > 0 ? "Action needed" : "All clear"}
          accent={pendingEsc > 0 ? "amber" : "emerald"}
        />
        <StatTile
          label="Audit entries"
          value={audits.length > 0 ? `${audits.length}+` : 0}
          subtext="Anchored on chain"
          accent="purple"
        />
      </section>

      <section className="grid lg:grid-cols-3 gap-4">
        {/* Completion */}
        <div className="surface p-5 lg:col-span-2">
          <div className="flex justify-between items-center mb-3">
            <p className="section-h !mb-0">Completion dashboard</p>
            <Link to="/reports" className="text-xs text-brand-600 hover:underline">
              Export reports →
            </Link>
          </div>
          {dashboard.length === 0 ? (
            <p className="text-slate-400 text-sm">No team data yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 uppercase tracking-wide">
                  <th className="text-left pb-2">Manager</th>
                  <th className="text-left pb-2">Team</th>
                  <th className="text-left pb-2">Submitted</th>
                  <th className="text-left pb-2">Approved</th>
                  <th className="text-left pb-2">Check-ins</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.map((row) => (
                  <tr key={row.manager_name} className="border-t border-slate-100">
                    <td className="py-3 font-medium">{row.manager_name}</td>
                    <td className="py-3 text-slate-600">{row.team_size}</td>
                    <td className="py-3 w-1/4"><ProgressCell pct={row.goals_submitted_pct} /></td>
                    <td className="py-3 w-1/4"><ProgressCell pct={row.goals_approved_pct} /></td>
                    <td className="py-3 w-1/4"><ProgressCell pct={row.checkins_done_pct} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Thrust area distribution */}
        <div className="surface p-5">
          <p className="section-h">Goals by thrust area</p>
          {thrustData.length === 0 ? (
            <p className="text-slate-400 text-sm">No goals yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={thrustData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" width={70} fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip />
                <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                  {thrustData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {/* Quick admin tiles */}
      <section>
        <p className="section-h">Quick actions</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { to: "/admin/cycles", label: "Cycles", desc: "Configure windows", color: "bg-brand-500" },
            { to: "/admin/users", label: "Users", desc: "Org hierarchy", color: "bg-purple-500" },
            { to: "/admin/audit", label: "Audit Log", desc: "Post-lock changes", color: "bg-emerald-500" },
            { to: "/admin/escalations", label: "Escalations", desc: "Rules + history", color: "bg-amber-500" },
            { to: "/admin/notifications", label: "Notifications", desc: "Email + Teams log", color: "bg-cyan-500" },
            { to: "/analytics", label: "Analytics", desc: "QoQ + heatmap", color: "bg-indigo-500" },
            { to: "/reports", label: "Reports", desc: "CSV / XLSX export", color: "bg-pink-500" },
            { to: "/manager/shared-goals", label: "Push KPI", desc: "Shared goals", color: "bg-slate-500" },
          ].map((t) => (
            <Link
              key={t.to}
              to={t.to}
              className="surface p-4 hover:shadow-card hover:-translate-y-0.5 transition group relative overflow-hidden"
            >
              <div className={`absolute top-0 left-0 w-1 h-full ${t.color}`} />
              <p className="font-semibold text-slate-900 group-hover:text-brand-700">{t.label}</p>
              <p className="text-xs text-slate-500 mt-1">{t.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Employee-level completion drill-down */}
      <EmployeeCompletionMatrix cycleId={activeCycle?.id} />

      {/* Recent activity */}
      <section className="grid lg:grid-cols-2 gap-4">
        <div className="surface p-5">
          <div className="flex justify-between items-center mb-3">
            <p className="section-h !mb-0">Recent audit entries</p>
            <Link to="/admin/audit" className="text-xs text-brand-600 hover:underline">All →</Link>
          </div>
          {audits.length === 0 ? (
            <p className="text-slate-400 text-sm">No audit activity.</p>
          ) : (
            <ul className="space-y-2">
              {audits.slice(0, 5).map((a: any) => (
                <li key={a.id} className="flex justify-between items-start text-sm border-b border-slate-100 pb-2 last:border-0">
                  <div>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                      {a.change_type}
                    </span>
                    <span className="ml-2 text-slate-700">{a.goal_title}</span>
                    <p className="text-xs text-slate-500 mt-0.5">by {a.changed_by_name}</p>
                  </div>
                  <span className="text-[10px] text-slate-400">{new Date(a.timestamp).toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="surface p-5">
          <div className="flex justify-between items-center mb-3">
            <p className="section-h !mb-0">Recent escalations</p>
            <Link to="/admin/escalations" className="text-xs text-brand-600 hover:underline">All →</Link>
          </div>
          {escalations.length === 0 ? (
            <p className="text-slate-400 text-sm">No escalations.</p>
          ) : (
            <ul className="space-y-2">
              {escalations.slice(0, 5).map((e: any) => (
                <li key={e.id} className="flex justify-between items-start text-sm border-b border-slate-100 pb-2 last:border-0">
                  <div>
                    <p className="text-slate-700">{e.message}</p>
                    <p className="text-xs text-slate-500 mt-0.5">→ {e.target_user_name}</p>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${e.resolved_at ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                    {e.resolved_at ? "resolved" : "open"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

interface MatrixRow {
  employee_id: string;
  employee_name: string;
  department: string | null;
  manager_name: string | null;
  total_locked_goals: number;
  quarters: Record<
    string,
    {
      checkins_done: number;
      of_goals: number;
      employee_complete: boolean;
      manager_reviewed: number;
      manager_complete: boolean;
    }
  >;
}

function EmployeeCompletionMatrix({ cycleId }: { cycleId?: string }) {
  const { data: matrix = [] } = useQuery({
    queryKey: ["checkin-matrix", cycleId],
    queryFn: async () =>
      (await api.get<MatrixRow[]>("/api/v1/reports/employee-checkin-matrix", {
        params: { cycle_id: cycleId },
      })).data,
    enabled: !!cycleId,
  });

  const quarters = ["Q1", "Q2", "Q3", "Q4"];

  return (
    <section className="surface p-5">
      <div className="flex justify-between items-center mb-3">
        <div>
          <p className="section-h !mb-0">
            Quarterly check-in completion (employees & managers)
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            Per BRD §4: real-time view of who has completed each quarter
          </p>
        </div>
      </div>
      {matrix.length === 0 ? (
        <p className="text-slate-400 text-sm">No employees yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="text-left p-2 rounded-l-lg">Employee</th>
                <th className="text-left p-2">Manager</th>
                <th className="text-left p-2">Goals</th>
                {quarters.map((q) => (
                  <th key={q} className="text-center p-2" colSpan={2}>
                    {q}
                  </th>
                ))}
              </tr>
              <tr className="text-[10px] text-slate-400">
                <th className="p-1" />
                <th className="p-1" />
                <th className="p-1" />
                {quarters.flatMap((q) => [
                  <th key={`${q}-e`} className="text-center p-1">
                    Employee
                  </th>,
                  <th key={`${q}-m`} className="text-center p-1">
                    Manager
                  </th>,
                ])}
              </tr>
            </thead>
            <tbody>
              {matrix.map((row) => (
                <tr key={row.employee_id} className="border-t border-slate-100">
                  <td className="p-2 font-medium">{row.employee_name}</td>
                  <td className="p-2 text-xs text-slate-600">{row.manager_name ?? "—"}</td>
                  <td className="p-2 text-xs text-slate-600">
                    {row.total_locked_goals} locked
                  </td>
                  {quarters.flatMap((q) => {
                    const cell = row.quarters[q];
                    const empCls =
                      row.total_locked_goals === 0
                        ? "bg-slate-100 text-slate-400"
                        : cell.employee_complete
                        ? "bg-emerald-100 text-emerald-800"
                        : cell.checkins_done > 0
                        ? "bg-amber-100 text-amber-800"
                        : "bg-red-50 text-red-700";
                    const mgrCls =
                      row.total_locked_goals === 0
                        ? "bg-slate-100 text-slate-400"
                        : cell.manager_complete
                        ? "bg-emerald-100 text-emerald-800"
                        : cell.manager_reviewed > 0
                        ? "bg-amber-100 text-amber-800"
                        : "bg-red-50 text-red-700";
                    return [
                      <td key={`${q}-e`} className="p-1">
                        <span
                          title={`${cell.checkins_done}/${cell.of_goals} check-ins logged`}
                          className={`block text-center text-[11px] py-1 rounded ${empCls}`}
                        >
                          {row.total_locked_goals === 0
                            ? "—"
                            : `${cell.checkins_done}/${cell.of_goals}`}
                        </span>
                      </td>,
                      <td key={`${q}-m`} className="p-1">
                        <span
                          title={`Manager comments on ${cell.manager_reviewed}/${cell.of_goals} check-ins`}
                          className={`block text-center text-[11px] py-1 rounded ${mgrCls}`}
                        >
                          {row.total_locked_goals === 0
                            ? "—"
                            : `${cell.manager_reviewed}/${cell.of_goals}`}
                        </span>
                      </td>,
                    ];
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex gap-3 mt-3 text-[10px] text-slate-500">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-200" />{" "}
              Complete
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-amber-100 border border-amber-200" />{" "}
              Partial
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-red-50 border border-red-200" />{" "}
              Not started
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-slate-100 border border-slate-200" />{" "}
              No locked goals
            </span>
          </div>
        </div>
      )}
    </section>
  );
}

function StatTile({
  label,
  value,
  accent,
  subtext,
}: {
  label: string;
  value: number | string;
  accent: "brand" | "emerald" | "amber" | "indigo" | "purple";
  subtext?: string;
}) {
  const map: Record<string, string> = {
    brand: "bg-brand-500",
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    indigo: "bg-indigo-500",
    purple: "bg-purple-500",
  };
  return (
    <div className="stat relative overflow-hidden">
      <div className={`absolute top-0 left-0 w-1 h-full ${map[accent]}`} />
      <p className="text-xs uppercase text-slate-500 font-semibold tracking-wider">{label}</p>
      <p className="text-3xl font-bold text-slate-900 mt-2">{value}</p>
      {subtext && <p className="text-xs text-slate-500 mt-1">{subtext}</p>}
    </div>
  );
}

function ProgressCell({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full ${
            pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : pct > 0 ? "bg-red-400" : "bg-slate-200"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs w-10 text-right text-slate-600">{pct}%</span>
    </div>
  );
}
