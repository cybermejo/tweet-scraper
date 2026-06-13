/* ============================================================
 * UI PRIMITIVES
 * ============================================================ */

export function Stat({ icon: Icon, label, value, sub, tone = "slate" }) {
  const tones = {
    slate: "bg-slate-50 text-slate-700",
    green: "bg-green-50 text-green-700",
    rose: "bg-rose-50 text-rose-700",
    sky: "bg-sky-50 text-sky-700",
    amber: "bg-amber-50 text-amber-700",
  };
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <div className="flex items-center gap-2">
        {Icon && (
          <div className={`p-1.5 rounded-lg ${tones[tone]}`}>
            <Icon className="w-4 h-4" />
          </div>
        )}
        <div className="text-xs uppercase tracking-wide text-slate-500 font-medium">
          {label}
        </div>
      </div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

export function Bar({ label, value, total, color = "bg-indigo-500" }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="text-slate-500 tabular-nums">
          {value} <span className="text-slate-400">({pct}%)</span>
        </span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`${color} h-full rounded-full transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function Chip({ children, color = "bg-slate-100 text-slate-700" }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}
    >
      {children}
    </span>
  );
}

export function SentimentChip({ label }) {
  const map = {
    positive: "bg-green-100 text-green-800",
    neutral: "bg-slate-100 text-slate-700",
    negative: "bg-rose-100 text-rose-800",
  };
  return <Chip color={map[label]}>{label}</Chip>;
}
