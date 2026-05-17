import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface TeamMember {
  employee_id: string;
  full_name: string;
  department: string | null;
}

interface RiskItem {
  goal_title: string;
  risk_level: "high" | "medium" | "low";
  reasoning: string;
}

export default function RiskPanel() {
  const [selected, setSelected] = useState<string | null>(null);

  const { data: activeCycle } = useQuery({
    queryKey: ["active-cycle"],
    queryFn: async () => {
      const { data } = await api.get<{ id: string } | null>("/api/v1/cycles/active");
      return data;
    },
  });
  const cycleId = activeCycle?.id;

  const { data: team = [] } = useQuery({
    queryKey: ["team-summary-risk", cycleId],
    queryFn: async () => {
      const { data } = await api.get<TeamMember[]>("/api/v1/approvals/team/summary", {
        params: { cycle_id: cycleId },
      });
      return data;
    },
    enabled: !!cycleId,
  });

  const riskMut = useMutation({
    mutationFn: (empId: string) =>
      api.post<RiskItem[]>("/api/v1/ai/risk-analysis", {
        employee_id: empId,
        cycle_id: cycleId,
      }),
  });

  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-bold">AI Risk Analysis</h1>
        <p className="text-sm text-slate-500">
          Claude analyses each employee's goal trajectory and flags at-risk targets.
        </p>
      </header>

      <div className="grid grid-cols-[260px_1fr] gap-6">
        <aside className="space-y-2">
          {team.map((m) => (
            <button
              key={m.employee_id}
              type="button"
              onClick={() => {
                setSelected(m.employee_id);
                riskMut.mutate(m.employee_id);
              }}
              className={`w-full text-left px-3 py-2 rounded border ${
                selected === m.employee_id
                  ? "border-brand-500 bg-brand-50"
                  : "border-slate-200 bg-white"
              }`}
            >
              <p className="font-medium text-sm">{m.full_name}</p>
              <p className="text-xs text-slate-500">{m.department}</p>
            </button>
          ))}
        </aside>

        <section>
          {riskMut.isPending && <p className="text-slate-500">Asking AI…</p>}
          {riskMut.isError && (
            <p className="text-red-600 text-sm">AI request failed.</p>
          )}
          {riskMut.data && (
            <div className="space-y-3">
              {(riskMut.data.data as unknown as RiskItem[]).map((r, i) => (
                <article
                  key={i}
                  className={`p-4 rounded-xl border ${
                    r.risk_level === "high"
                      ? "border-red-300 bg-red-50"
                      : r.risk_level === "medium"
                      ? "border-amber-300 bg-amber-50"
                      : "border-green-300 bg-green-50"
                  }`}
                >
                  <div className="flex justify-between">
                    <h3 className="font-semibold">{r.goal_title}</h3>
                    <span className="text-xs uppercase font-bold">
                      {r.risk_level} risk
                    </span>
                  </div>
                  <p className="text-sm mt-2">{r.reasoning}</p>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
