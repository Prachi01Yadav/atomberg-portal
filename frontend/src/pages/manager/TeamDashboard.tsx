import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useWebSocket } from "@/lib/websocket";
import { useAuth } from "@/lib/auth";

interface TeamMember {
  employee_id: string;
  full_name: string;
  department: string | null;
  total_goals: number;
  submitted_count: number;
  locked_count: number;
  pending_approval: number;
}

export default function TeamDashboard() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: activeCycle } = useQuery({
    queryKey: ["active-cycle"],
    queryFn: async () =>
      (await api.get<{ id: string; name: string } | null>("/api/v1/cycles/active")).data,
  });
  const cycleId = activeCycle?.id;

  const { data: team = [], isLoading } = useQuery({
    queryKey: ["team-summary", cycleId],
    queryFn: async () =>
      (await api.get<TeamMember[]>("/api/v1/approvals/team/summary", {
        params: { cycle_id: cycleId },
      })).data,
    enabled: !!cycleId,
  });

  useWebSocket((event) => {
    if (event.type === "goal_submitted" || event.type === "checkin_logged") {
      qc.invalidateQueries({ queryKey: ["team-summary"] });
    }
  });

  const totalGoals = team.reduce((s, m) => s + m.total_goals, 0);
  const totalLocked = team.reduce((s, m) => s + m.locked_count, 0);
  const totalSubmitted = team.reduce((s, m) => s + m.submitted_count, 0);
  const totalPending = team.reduce((s, m) => s + m.pending_approval, 0);

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <header className="surface p-6 bg-gradient-to-br from-emerald-50 to-white border-emerald-100">
        <div className="flex justify-between items-start flex-wrap gap-3">
          <div>
            <p className="text-sm text-emerald-700 font-semibold">
              Manager dashboard
            </p>
            <h1 className="text-3xl font-bold text-slate-900 mt-1">Your team</h1>
            <p className="text-sm text-slate-500 mt-2">
              {user?.full_name} · cycle <strong className="text-slate-700">{activeCycle?.name ?? "—"}</strong>
            </p>
          </div>
          <div className="flex gap-2">
            <Link to="/manager/risk" className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium shadow-soft">
              AI Risk analysis
            </Link>
            <Link to="/manager/shared-goals" className="px-4 py-2 bg-white border border-slate-200 hover:border-emerald-400 rounded-lg text-sm font-medium">
              + Push shared goal
            </Link>
          </div>
        </div>
      </header>

      <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile label="Team size" value={team.length} accent="brand" />
        <StatTile label="Total goals" value={totalGoals} accent="indigo" />
        <StatTile
          label="Awaiting approval"
          value={totalPending}
          accent={totalPending > 0 ? "amber" : "emerald"}
          subtext={totalPending > 0 ? "Action needed" : "All clear"}
        />
        <StatTile
          label="Locked & live"
          value={totalLocked}
          accent="emerald"
          subtext={`${totalSubmitted} submitted`}
        />
      </section>

      <section className="surface p-5">
        <div className="flex justify-between items-center mb-4">
          <p className="section-h !mb-0">Direct reports</p>
          {totalPending > 0 && (
            <span className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded-full font-medium">
              {totalPending} goals awaiting your approval
            </span>
          )}
        </div>

        {isLoading ? (
          <p className="text-slate-500">Loading team…</p>
        ) : team.length === 0 ? (
          <p className="text-slate-500">No direct reports.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {team.map((member) => (
              <Link
                key={member.employee_id}
                to={`/manager/approve/${member.employee_id}`}
                className="group p-5 rounded-xl border border-slate-200 bg-white hover:border-brand-300 hover:shadow-card transition"
              >
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-400 to-accent-500 text-white flex items-center justify-center font-semibold shadow">
                      {member.full_name.charAt(0)}
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900 group-hover:text-brand-700 transition">
                        {member.full_name}
                      </h3>
                      <p className="text-xs text-slate-500">{member.department ?? "—"}</p>
                    </div>
                  </div>
                  {member.pending_approval > 0 && (
                    <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-medium">
                      {member.pending_approval} pending
                    </span>
                  )}
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                  <Mini label="Goals" value={member.total_goals} color="text-slate-700" />
                  <Mini label="Submitted" value={member.submitted_count} color="text-amber-600" />
                  <Mini label="Locked" value={member.locked_count} color="text-emerald-600" />
                </div>
                {member.total_goals > 0 && (
                  <div className="mt-3 w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600"
                      style={{
                        width: `${Math.round((member.locked_count / member.total_goals) * 100)}%`,
                      }}
                    />
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
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
  accent: "brand" | "emerald" | "amber" | "indigo";
  subtext?: string;
}) {
  const map: Record<string, string> = {
    brand: "bg-brand-500",
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    indigo: "bg-indigo-500",
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

function Mini({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
      <p className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</p>
    </div>
  );
}
