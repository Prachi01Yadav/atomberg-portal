interface Props {
  total: number;
  count?: number;
}

export default function WeightageValidator({ total, count }: Props) {
  const remaining = 100 - total;
  const isComplete = Math.abs(remaining) < 0.01;

  return (
    <div
      className={`rounded-xl border p-4 flex justify-between items-center ${
        isComplete
          ? "bg-green-50 border-green-200 text-green-800"
          : remaining > 0
          ? "bg-amber-50 border-amber-200 text-amber-800"
          : "bg-red-50 border-red-200 text-red-800"
      }`}
    >
      <span>
        {isComplete ? (
          <p className="font-medium">100% — Ready to submit</p>
        ) : remaining > 0 ? (
          <p className="font-medium">
            {total}/100% — need {remaining.toFixed(1)}% more
          </p>
        ) : (
          <p className="font-medium">
            {total}/100% — reduce by {Math.abs(remaining).toFixed(1)}%
          </p>
        )}
      </span>
      {count !== undefined && (
        <span className="text-xs text-slate-500">
          {count}/8 goals
        </span>
      )}
    </div>
  );
}
