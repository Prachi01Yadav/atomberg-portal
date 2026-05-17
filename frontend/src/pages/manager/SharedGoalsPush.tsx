import { FormEvent, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface User {
  id: string;
  full_name: string;
  email: string;
  role: string;
  department: string | null;
  manager_id: string | null;
}

export default function SharedGoalsPush() {
  const [thrustArea, setThrustArea] = useState("Customer");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [uomType, setUomType] = useState("numeric_min");
  const [targetValue, setTargetValue] = useState(70);
  const [weightage, setWeightage] = useState(15);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const { data: activeCycle } = useQuery({
    queryKey: ["active-cycle"],
    queryFn: async () => {
      const { data } = await api.get<{ id: string } | null>("/api/v1/cycles/active");
      return data;
    },
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["all-employees"],
    queryFn: async () => {
      const { data } = await api.get<User[]>("/api/v1/users", { params: { role: "employee" } });
      return data;
    },
  });

  const pushMut = useMutation({
    mutationFn: () =>
      api.post("/api/v1/shared-goals/push", {
        cycle_id: activeCycle?.id,
        thrust_area: thrustArea,
        title,
        description,
        uom_type: uomType,
        target_value: targetValue,
        weightage,
        employee_ids: [...selected],
      }),
    onSuccess: () => {
      setSuccess(`Pushed shared goal to ${selected.size} employees`);
      setError("");
      setSelected(new Set());
      setTitle("");
    },
    onError: (e: any) => {
      setError(e?.response?.data?.detail ?? "Failed");
      setSuccess("");
    },
  });

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (selected.size === 0) {
      setError("Select at least one employee");
      return;
    }
    pushMut.mutate();
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <header>
        <h1 className="text-2xl font-bold">Push Shared Goal</h1>
        <p className="text-sm text-slate-500">
          Publish a department KPI to multiple employees. Recipients can only adjust weightage.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="bg-white border rounded-xl p-6 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            Thrust area
            <input
              className="mt-1 w-full border rounded px-2 py-1.5"
              value={thrustArea}
              onChange={(e) => setThrustArea(e.target.value)}
            />
          </label>
          <label className="text-sm">
            UoM
            <select
              className="mt-1 w-full border rounded px-2 py-1.5"
              value={uomType}
              onChange={(e) => setUomType(e.target.value)}
            >
              <option value="numeric_min">numeric_min</option>
              <option value="numeric_max">numeric_max</option>
              <option value="timeline">timeline</option>
              <option value="zero">zero</option>
            </select>
          </label>
        </div>
        <label className="text-sm block">
          Title
          <input
            required
            className="mt-1 w-full border rounded px-2 py-1.5"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="text-sm block">
          Description
          <textarea
            rows={2}
            className="mt-1 w-full border rounded px-2 py-1.5"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            Target value
            <input
              type="number"
              className="mt-1 w-full border rounded px-2 py-1.5"
              value={targetValue}
              onChange={(e) => setTargetValue(+e.target.value)}
            />
          </label>
          <label className="text-sm">
            Default weightage % <span className="text-xs text-slate-400">(recipients can change)</span>
            <input
              type="number"
              min={10}
              className="mt-1 w-full border rounded px-2 py-1.5"
              value={weightage}
              onChange={(e) => setWeightage(+e.target.value)}
            />
          </label>
        </div>

        <fieldset className="border rounded-lg p-3">
          <legend className="text-sm font-medium px-2">
            Recipients ({selected.size} selected)
          </legend>
          <div className="grid grid-cols-2 gap-2 max-h-60 overflow-auto">
            {employees.map((e) => (
              <label key={e.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selected.has(e.id)}
                  onChange={() => toggle(e.id)}
                />
                {e.full_name}{" "}
                <span className="text-xs text-slate-400">({e.department ?? "—"})</span>
              </label>
            ))}
          </div>
        </fieldset>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && <p className="text-sm text-green-600">{success}</p>}

        <button
          type="submit"
          disabled={pushMut.isPending || !activeCycle?.id}
          className="px-5 py-2 bg-brand-600 text-white rounded-lg font-medium disabled:opacity-50"
        >
          {pushMut.isPending ? "Pushing…" : "Push shared goal"}
        </button>
      </form>
    </div>
  );
}
