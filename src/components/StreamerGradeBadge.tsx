/**
 * Badge de grade spirituel — affiché sur les profils, cartes de streamer,
 * entrées du classement et aperçus de live.
 *
 * Trois tailles :
 *  - `sm` : pill compacte (emoji + nom) pour listes denses
 *  - `md` : par défaut, avec barre de progression vers le grade suivant
 *  - `lg` : bloc complet avec devise + thème (profils)
 */
import type { StreamerGrade } from "../data/grades";
import { formatXp } from "../data/grades";

export interface StreamerGradeBadgeProps {
  grade: StreamerGrade;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export default function StreamerGradeBadge({
  grade,
  size = "md",
  className = "",
}: StreamerGradeBadgeProps) {
  const progressRatio =
    grade.nextXp && grade.nextXp > 0
      ? Math.min(1, grade.progressXp / grade.nextXp)
      : 1;
  const percent = Math.round(progressRatio * 100);

  if (size === "sm") {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${className}`}
        style={{
          borderColor: `${grade.color}55`,
          backgroundColor: `${grade.color}1a`,
          color: grade.color,
        }}
        title={`${grade.name} · ${formatXp(grade.xp)} XP`}
      >
        <span aria-hidden>{grade.emoji}</span>
        <span>{grade.name}</span>
        {grade.override && <span aria-hidden>✦</span>}
      </span>
    );
  }

  if (size === "lg") {
    return (
      <div
        className={`rounded-xl border p-3 ${className}`}
        style={{
          borderColor: `${grade.color}55`,
          background: `linear-gradient(135deg, ${grade.color}12 0%, transparent 80%)`,
        }}
      >
        <div className="flex items-center gap-2">
          <span className="text-2xl" aria-hidden>
            {grade.emoji}
          </span>
          <div>
            <div className="font-semibold" style={{ color: grade.color }}>
              {grade.name}
              {grade.override && (
                <span
                  className="ml-1 text-xs align-middle"
                  title="Grade attribué par la cour"
                  aria-label="Grade attribué par la cour"
                >
                  ✦
                </span>
              )}
            </div>
            <div className="text-xs italic opacity-80">« {grade.motto} »</div>
          </div>
        </div>
        <div className="mt-2 text-xs opacity-70">{grade.theme}</div>
        <div className="mt-3">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/10">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${percent}%`,
                backgroundColor: grade.color,
              }}
            />
          </div>
          <div className="mt-1 flex justify-between text-[11px] opacity-70">
            <span>{formatXp(grade.xp)} XP</span>
            {grade.nextXp !== null ? (
              <span>
                {formatXp(grade.minXp + grade.nextXp)} XP au prochain
              </span>
            ) : (
              <span>Grade maximal atteint</span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // md (default)
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-lg border px-2 py-1 text-xs ${className}`}
      style={{
        borderColor: `${grade.color}55`,
        backgroundColor: `${grade.color}1a`,
        color: grade.color,
      }}
      title={
        grade.nextXp !== null
          ? `${formatXp(grade.xp)} XP · ${formatXp(
              grade.nextXp - grade.progressXp,
            )} XP pour le grade suivant`
          : `${formatXp(grade.xp)} XP · Grade maximal`
      }
    >
      <span aria-hidden>{grade.emoji}</span>
      <span className="font-medium">{grade.name}</span>
      {grade.override && <span aria-hidden>✦</span>}
    </div>
  );
}
