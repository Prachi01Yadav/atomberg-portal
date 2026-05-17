import { FormEvent, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface EditingGoal {
  id: string;
  title: string;
  description?: string;
  thrust_area: string;
  uom_type: string;
  target_value: number | null;
  target_date: string | null;
  weightage: number;
  is_shared: boolean;
}

interface Props {
  cycleId: string;
  initial?: EditingGoal | null;
  onClose: () => void;
  onSaved: () => void;
}

const THRUST_AREAS = ["Revenue", "Quality", "Delivery", "Customer", "Innovation", "People", "Safety"];
const UOM_TYPES = [
  { v: "numeric_min", l: "Numeric / % — higher is better (e.g. Revenue, NPS)" },
  { v: "numeric_max", l: "Numeric / % — lower is better (e.g. TAT, Cost)" },
  { v: "timeline", l: "Timeline — date-based completion" },
  { v: "zero", l: "Zero-based — 0 = success (e.g. Safety incidents)" },
];

export default function GoalForm({ cycleId, initial, onClose, onSaved }: Props) {
  const editing = !!initial;
  const sharedLock = !!initial?.is_shared;

  const [nl, setNl] = useState("");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [thrustArea, setThrustArea] = useState(initial?.thrust_area ?? THRUST_AREAS[0]);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [uomType, setUomType] = useState(initial?.uom_type ?? "numeric_min");
  const [targetValue, setTargetValue] = useState<number>(initial?.target_value ?? 10);
  const [targetDate, setTargetDate] = useState<string>(initial?.target_date ?? "");
  const [weightage, setWeightage] = useState<number>(initial?.weightage ?? 10);
  const [aiScore, setAiScore] = useState<number | null>(null);
  const [aiIssues, setAiIssues] = useState<string[]>([]);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [error, setError] = useState<string>("");
  const debounceRef = useRef<number | null>(null);

  const { data: systemInfo } = useQuery({
    queryKey: ["system-info"],
    queryFn: async () => (await api.get<{ ai_mode: string }>("/api/v1/system/info")).data,
    staleTime: 60_000,
  });
  const aiLive = systemInfo?.ai_mode === "live";

  const parseMut = useMutation({
    mutationFn: () => api.post("/api/v1/ai/parse-natural-language", { text: nl }),
    onSuccess: ({ data }) => {
      if (data.title) setTitle(data.title);
      if (data.uom_type) setUomType(data.uom_type);
      if (data.target_value != null) setTargetValue(data.target_value);
      if (data.thrust_area_suggestion) setThrustArea(data.thrust_area_suggestion);
    },
  });

  const scoreMut = useMutation({
    mutationFn: () =>
      api.post("/api/v1/ai/score-goal", {
        title,
        description,
        thrust_area: thrustArea,
        uom_type: uomType,
        target_value: uomType === "timeline" ? 0 : targetValue,
        weightage,
      }),
    onSuccess: ({ data }) => {
      setAiScore(data.score ?? null);
      setAiIssues(data.issues ?? []);
      setAiSuggestions(data.suggestions ?? []);
    },
  });

  useEffect(() => {
    if (!title) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => scoreMut.mutate(), 800);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [title, description, uomType, targetValue, weightage, thrustArea]);

  const saveMut = useMutation({
    mutationFn: () => {
      const body: any = sharedLock
        ? { weightage }
        : {
            cycle_id: cycleId,
            title,
            description,
            thrust_area: thrustArea,
            uom_type: uomType,
            target_value: uomType === "timeline" ? null : targetValue,
            target_date: uomType === "timeline" ? targetDate || null : null,
            weightage,
          };
      if (editing && initial) {
        return api.patch(`/api/v1/goals/${initial.id}`, body);
      }
      return api.post("/api/v1/goals", body);
    },
    onSuccess: () => onSaved(),
    onError: (e: any) => {
      setError(e?.response?.data?.detail ?? "Save failed");
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    saveMut.mutate();
  }

  const scoreColor =
    aiScore === null
      ? "bg-slate-100 text-slate-500"
      : aiScore < 5
      ? "bg-red-100 text-red-800"
      : aiScore < 8
      ? "bg-amber-100 text-amber-800"
      : "bg-green-100 text-green-800";

  return (
    <section className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6 space-y-4 max-h-[92vh] overflow-y-auto"
      >
        <header className="flex justify-between items-center">
          <h2 className="text-lg font-semibold">
            {editing ? "Edit Goal" : "Add Goal"}
            {sharedLock && (
              <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 uppercase tracking-wide">
                shared · weightage only
              </span>
            )}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-500 hover:text-slate-800 text-lg"
            aria-label="Close"
          >
            ×
          </button>
        </header>

        {!editing && (
          <section className="bg-gradient-to-br from-purple-50 to-blue-50 border border-purple-200 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-purple-900">
                AI Assistant — describe your goal in plain English
              </p>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  aiLive ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
                }`}
                title={aiLive ? "Anthropic Claude live" : "ANTHROPIC_API_KEY not set — using fallback heuristics"}
              >
                {aiLive ? "● live Claude" : "● demo (set ANTHROPIC_API_KEY for live)"}
              </span>
            </div>
            <div className="flex gap-2">
              <input
                className="flex-1 border rounded-lg px-3 py-2 text-sm"
                placeholder="e.g. reduce order TAT by 20% by end of Q2"
                value={nl}
                onChange={(e) => setNl(e.target.value)}
              />
              <button
                type="button"
                onClick={() => parseMut.mutate()}
                disabled={!nl || parseMut.isPending}
                className="px-3 py-2 bg-purple-700 text-white rounded-lg text-sm disabled:opacity-50"
              >
                {parseMut.isPending ? "Parsing…" : "AI Parse"}
              </button>
            </div>
            {parseMut.isSuccess && (
              <p className="text-xs text-green-700">
                AI pre-filled the form fields below — edit as needed.
              </p>
            )}
          </section>
        )}

        <label className="block text-sm">
          Thrust area
          <select
            disabled={sharedLock}
            className="mt-1 w-full border rounded-lg px-3 py-2 disabled:bg-slate-100"
            value={thrustArea}
            onChange={(e) => setThrustArea(e.target.value)}
          >
            {THRUST_AREAS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          Title
          <input
            disabled={sharedLock}
            className="mt-1 w-full border rounded-lg px-3 py-2 disabled:bg-slate-100"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </label>

        <label className="block text-sm">
          Description
          <textarea
            disabled={sharedLock}
            className="mt-1 w-full border rounded-lg px-3 py-2 disabled:bg-slate-100"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>

        <section className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            UoM
            <select
              disabled={sharedLock}
              className="mt-1 w-full border rounded-lg px-3 py-2 disabled:bg-slate-100"
              value={uomType}
              onChange={(e) => setUomType(e.target.value)}
            >
              {UOM_TYPES.map((u) => (
                <option key={u.v} value={u.v}>
                  {u.l}
                </option>
              ))}
            </select>
          </label>
          {uomType === "timeline" ? (
            <label className="text-sm">
              Target date
              <input
                disabled={sharedLock}
                type="date"
                className="mt-1 w-full border rounded-lg px-3 py-2 disabled:bg-slate-100"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
              />
            </label>
          ) : (
            <label className="text-sm">
              Target value
              <input
                disabled={sharedLock || uomType === "zero"}
                type="number"
                step="0.01"
                className="mt-1 w-full border rounded-lg px-3 py-2 disabled:bg-slate-100"
                value={uomType === "zero" ? 0 : targetValue}
                onChange={(e) => setTargetValue(+e.target.value)}
              />
            </label>
          )}
        </section>

        <label className="block text-sm">
          Weightage % <span className="text-xs text-slate-400">(min 10%)</span>
          <input
            type="number"
            min={10}
            max={100}
            className="mt-1 w-full border rounded-lg px-3 py-2"
            value={weightage}
            onChange={(e) => setWeightage(+e.target.value)}
          />
        </label>

        <section className="space-y-2 border-t pt-3">
          <div className="flex items-center gap-2">
            <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${scoreColor}`}>
              AI Quality Score: {aiScore === null ? (scoreMut.isPending ? "scoring…" : "—") : `${aiScore}/10`}
            </span>
            {!aiLive && (
              <span className="text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                demo fallback
              </span>
            )}
          </div>
          {aiIssues.length > 0 && (
            <ul className="text-xs text-red-700 list-disc pl-5">
              {aiIssues.map((i, k) => (
                <li key={k}>{i}</li>
              ))}
            </ul>
          )}
          {aiSuggestions.length > 0 && (
            <ul className="text-xs text-slate-600 list-disc pl-5">
              {aiSuggestions.map((s, k) => (
                <li key={k}>{s}</li>
              ))}
            </ul>
          )}
        </section>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 p-2 rounded">{error}</p>
        )}

        <button
          type="submit"
          disabled={saveMut.isPending}
          className="w-full bg-brand-600 text-white py-2.5 rounded-lg font-medium hover:bg-brand-700 disabled:opacity-50"
        >
          {saveMut.isPending ? "Saving…" : editing ? "Update goal" : "Save goal"}
        </button>
      </form>
    </section>
  );
}
