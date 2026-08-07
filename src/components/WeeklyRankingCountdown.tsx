import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Clock3, Gift } from "lucide-react";
import {
  formatDurationCompact,
  formatWeekRange,
  getRemainingMsUntilWeekEnd,
} from "../lib/weeklyRanking";

interface WeeklyRankingCountdownProps {
  weekStartIso?: string | null;
  active: boolean;
  label?: string;
  completeLabel?: string;
  helper?: string;
  compact?: boolean;
  showWeekRange?: boolean;
}

export function WeeklyRankingCountdown({
  weekStartIso,
  active,
  label = "Fin de la semaine dans",
  completeLabel = "Classement terminé",
  helper,
  compact = false,
  showWeekRange = true,
}: WeeklyRankingCountdownProps) {
  const [nowTick, setNowTick] = useState(() => Date.now());
  const remainingMs = useMemo(
    () => getRemainingMsUntilWeekEnd(weekStartIso, new Date(nowTick)),
    [nowTick, weekStartIso],
  );
  const isActive = active && remainingMs > 0;

  useEffect(() => {
    if (!active) return undefined;
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);

  return (
    <div
      className={`rounded-2xl border ${
        isActive
          ? "border-cyan-300/25 bg-cyan-400/10"
          : "border-white/10 bg-night-900/55"
      } ${compact ? "p-3" : "p-4"}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-ivory/55">
            {isActive ? (
              <Clock3 className="h-3.5 w-3.5 text-cyan-200" />
            ) : (
              <Gift className="h-3.5 w-3.5 text-gold-200" />
            )}
            {isActive ? label : completeLabel}
          </p>
          <p className="mt-1 font-display text-xl text-gold-100">
            {isActive ? formatDurationCompact(remainingMs) : "Semaine clôturée"}
          </p>
        </div>
        {showWeekRange && (
          <div className="rounded-xl border border-white/10 bg-night-950/45 px-3 py-2 text-left sm:text-right">
            <p className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-ivory/45">
              <CalendarDays className="h-3.5 w-3.5" />
              Période
            </p>
            <p className="mt-1 text-xs text-ivory/75">{formatWeekRange(weekStartIso)}</p>
          </div>
        )}
      </div>
      {helper && <p className="mt-3 text-xs leading-5 text-ivory/58">{helper}</p>}
    </div>
  );
}
