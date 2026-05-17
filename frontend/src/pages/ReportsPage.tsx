import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export default function ReportsPage() {
  const [department, setDepartment] = useState("");
  const [downloading, setDownloading] = useState(false);

  const { data: activeCycle } = useQuery({
    queryKey: ["active-cycle"],
    queryFn: async () => {
      const { data } = await api.get<{ id: string; name: string } | null>("/api/v1/cycles/active");
      return data;
    },
  });

  async function download(format: "csv" | "xlsx") {
    if (!activeCycle?.id) return;
    setDownloading(true);
    try {
      const res = await api.get("/api/v1/reports/achievement", {
        params: {
          cycle_id: activeCycle.id,
          department: department || undefined,
          format,
        },
        responseType: "blob",
      });
      const blob = new Blob([res.data]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `achievement.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <header>
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-sm text-slate-500">
          Export the achievement report (Planned vs Actual, all employees).
        </p>
      </header>

      <div className="bg-white border rounded-xl p-6 space-y-4">
        <p className="text-sm">
          Active cycle: <strong>{activeCycle?.name ?? "None"}</strong>
        </p>
        <label className="block text-sm">
          Filter by department (optional)
          <input
            placeholder="e.g. Sales"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className="mt-1 w-full border rounded px-2 py-1.5"
          />
        </label>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => download("csv")}
            disabled={!activeCycle?.id || downloading}
            className="px-4 py-2 bg-brand-600 text-white rounded text-sm disabled:opacity-50"
          >
            ⬇ Download CSV
          </button>
          <button
            type="button"
            onClick={() => download("xlsx")}
            disabled={!activeCycle?.id || downloading}
            className="px-4 py-2 bg-green-600 text-white rounded text-sm disabled:opacity-50"
          >
            ⬇ Download Excel (.xlsx)
          </button>
        </div>
      </div>
    </div>
  );
}
