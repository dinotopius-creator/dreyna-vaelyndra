import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";

type AvatarProfileBannerProps = {
  title: string;
  subtitle: string;
  cta?: string;
  to?: string;
  compact?: boolean;
};

export function AvatarProfileBanner({
  title,
  subtitle,
  cta = "Voir l'espace Avatar",
  to = "/avatar",
  compact = false,
}: AvatarProfileBannerProps) {
  return (
    <Link
      to={to}
      className={[
        "group relative block overflow-hidden rounded-[1.75rem] border border-fuchsia-400/20 bg-[linear-gradient(135deg,rgba(80,20,120,0.92),rgba(18,10,35,0.96)_45%,rgba(8,8,20,0.98))] p-4 text-left shadow-[0_20px_60px_rgba(0,0,0,0.28)] transition hover:-translate-y-0.5 hover:border-fuchsia-200/35",
        compact ? "min-h-[8.75rem]" : "min-h-[11rem] sm:min-h-[12rem]",
      ].join(" ")}
      aria-label={cta}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_10%,rgba(255,255,255,0.16),transparent_24%),radial-gradient(circle_at_18%_30%,rgba(236,72,153,0.24),transparent_30%),radial-gradient(circle_at_55%_55%,rgba(168,85,247,0.2),transparent_38%)]" />
      <div className="absolute inset-0 opacity-60 [background-image:radial-gradient(rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:22px_22px]" />
      <div className="relative flex h-full flex-col justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.28em] text-gold-200/85">
            Avatar
          </p>
          <h2 className="mt-2 font-display text-2xl text-white sm:text-3xl">
            {title}
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-white/74">
            {subtitle}
          </p>
        </div>
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/12 bg-white/10 px-4 py-2 text-sm font-medium text-white backdrop-blur-md">
          <Sparkles className="h-4 w-4 text-fuchsia-200" />
          {cta}
        </div>
      </div>
    </Link>
  );
}
