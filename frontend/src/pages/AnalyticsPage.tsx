import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "@/lib/api";

const COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#dc2626", "#9333ea", "#0ea5e9", "#65a30d"];

export default function AnalyticsPage() {
  const { data: activeCycle } = useQuery({
    queryKey: ["active-cycle"],
    queryFn: async () => {
      const { data } = await api.get<{ id: string; name: string } | null>("/api/v1/cycles/active");
      return data;
    },
  });
  const cycleId = activeCycle?.id;

  const { data: qoq } = useQuery({
    queryKey: ["qoq"],
    queryFn: async () => {
      const { data } = await api.get<{ quarters: string[]; weighted_scores: number[] }>(
        "/api/v1/analytics/qoq-trends"
      );
      return data;
    },
  });

  const { data: dist } = useQuery({
    queryKey: ["dist", cycleId],
    queryFn: async () => {
      const { data } = await api.get<{
        thrust_area: Record<string, number>;
        uom_type: Record<string, number>;
        status: Record<string, number>;
      }>("/api/v1/analytics/goal-distribution", { params: { cycle_id: cycleId } });
      return data;
    },
    enabled: !!cycleId,
  });

  const { data: heatmap } = useQuery({
    queryKey: ["heatmap", cycleId],
    queryFn: async () => {
      const { data } = await api.get<{
        departments: string[];
        quarters: string[];
        rows: Array<Record<string, string | number>>;
      }>("/api/v1/analytics/completion-heatmap", { params: { cycle_id: cycleId } });
      return data;
    },
    enabled: !!cycleId,
  });

  const { data: mgrEff } = useQuery({
    queryKey: ["mgr-effectiveness", cycleId],
    queryFn: async () => {
      const { data } = await api.get<{
        quarters: string[];
        managers: Array<{
          manager_id: string;
          manager_name: string;
          department: string | null;
          team_size: number;
          goals_total: number;
          goals_locked: number;
          approval_rate_pct: number;
          checkin_pct_by_quarter: Record<string, number>;
          checkin_pct_overall: number;
        }>;
      }>("/api/v1/analytics/manager-effectiveness", { params: { cycle_id: cycleId } });
      return data;
    },
    enabled: !!cycleId,
  });

  const qoqData =
    qoq?.quarters?.map((q, i) => ({ quarter: q, weighted: qoq.weighted_scores[i] })) ?? [];

  const thrustData = Object.entries(dist?.thrust_area ?? {}).map(([name, value]) => ({
    name,
    value,
  }));
  const uomData = Object.entries(dist?.uom_type ?? {}).map(([name, value]) => ({ name, value }));
  const statusData = Object.entries(dist?.status ?? {}).map(([name, value]) => ({ name, value }));

  function heatColor(pct: number): string {
    if (pct >= 80) return "bg-green-500";
    if (pct >= 60) return "bg-green-300";
    if (pct >= 40) return "bg-amber-300";
    if (pct >= 20) return "bg-red-300";
    if (pct > 0) return "bg-red-400";
    return "bg-slate-100";
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <header className="surface p-6 bg-gradient-to-br from-indigo-50 to-white border-indigo-100">
        <p className="text-sm text-indigo-700 font-semibold">Insights</p>
        <h1 className="text-3xl font-bold text-slate-900 mt-1">Analytics</h1>
        <p className="text-sm text-slate-500 mt-2">
          QoQ trends, distribution and completion heatmap for{" "}
          <strong className="text-slate-700">{activeCycle?.name ?? "—"}</strong>
        </p>
      </header>

      <section className="grid lg:grid-cols-2 gap-4">
        <div className="surface p-5">
          <h2 className="section-h">Quarter-on-Quarter weighted score</h2>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={qoqData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="quarter" />
              <YAxis />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="weighted"
                stroke="#2563eb"
                strokeWidth={2}
                dot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="surface p-5">
          <h2 className="section-h">Goals by thrust area</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={thrustData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value">
                {thrustData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="surface p-5">
          <h2 className="section-h">Distribution by UoM</h2>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={uomData} dataKey="value" nameKey="name" outerRadius={100} label>
                {uomData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="surface p-5">
          <h2 className="section-h">Distribution by status</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={statusData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" allowDecimals={false} />
              <YAxis dataKey="name" type="category" />
              <Tooltip />
              <Bar dataKey="value">
                {statusData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="surface p-5">
        <h2 className="section-h">Completion heatmap (department × quarter)</h2>
        {heatmap && heatmap.rows.length > 0 ? (
          <table className="text-sm w-auto">
            <thead>
              <tr>
                <th className="p-2 text-left">Department</th>
                {heatmap.quarters.map((q) => (
                  <th key={q} className="p-2 text-center w-20">
                    {q}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {heatmap.rows.map((row, i) => (
                <tr key={i}>
                  <td className="p-2 font-medium">{row.department}</td>
                  {heatmap.quarters.map((q) => {
                    const v = Number(row[q] ?? 0);
                    return (
                      <td key={q} className="p-1">
                        <div
                          className={`${heatColor(v)} text-white text-xs text-center rounded h-10 flex items-center justify-center`}
                        >
                          {v}%
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-slate-500 text-sm">No data yet.</p>
        )}
      </section>

      <section className="surface p-5">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="section-h">Manager effectiveness</h2>
            <p className="text-xs text-slate-500 mt-1">
              Side-by-side comparison of L1 managers — approval rate and
              quarterly check-in completion across their teams.
            </p>
          </div>
          <span className="text-xs text-slate-400">
            {mgrEff?.managers.length ?? 0} manager(s)
          </span>
        </div>

        {mgrEff && mgrEff.managers.length > 0 ? (
          <>
            <div className="mt-4">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={mgrEff.managers.map((m) => ({
                    name: m.manager_name,
                    "Approval %": m.approval_rate_pct,
                    "Check-in %": m.checkin_pct_overall,
                  }))}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" />
                  <YAxis domain={[0, 100]} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="Approval %" fill="#2563eb" />
                  <Bar dataKey="Check-in %" fill="#16a34a" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="text-sm w-full">
                <thead className="text-xs uppercase text-slate-500">
                  <tr>
                    <th className="text-left p-2">Manager</th>
                    <th className="text-left p-2">Dept</th>
                    <th className="text-right p-2">Team</th>
                    <th className="text-right p-2">Locked / Total</th>
                    <th className="text-right p-2">Approval %</th>
                    {mgrEff.quarters.map((q) => (
                      <th key={q} className="text-right p-2">
                        {q}
                      </th>
                    ))}
                    <th className="text-right p-2">Overall %</th>
                  </tr>
                </thead>
                <tbody>
                  {mgrEff.managers.map((m) => (
                    <tr key={m.manager_id} className="border-t border-slate-100">
                      <td className="p-2 font-medium">{m.manager_name}</td>
                      <td className="p-2 text-slate-600">{m.department ?? "—"}</td>
                      <td className="p-2 text-right">{m.team_size}</td>
                      <td className="p-2 text-right">
                        {m.goals_locked} / {m.goals_total}
                      </td>
                      <td className="p-2 text-right">{m.approval_rate_pct}%</td>
                      {mgrEff.quarters.map((q) => (
                        <td key={q} className="p-2 text-right">
                          <span
                            className={`px-2 py-0.5 rounded text-xs ${heatColor(
                              m.checkin_pct_by_quarter[q] ?? 0,
                            )} text-white`}
                          >
                            {m.checkin_pct_by_quarter[q] ?? 0}%
                          </span>
                        </td>
                      ))}
                      <td className="p-2 text-right font-semibold">
                        {m.checkin_pct_overall}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="text-slate-500 text-sm mt-2">No manager data yet.</p>
        )}
      </section>
    </div>
  );
}
