import { Link } from "react-router-dom";
import { CheckCircle2, Crown, Heart, MessageSquare, Radio, Sparkles, Trophy } from "lucide-react";
import { SectionHeading } from "../components/SectionHeading";

type QuestStatus = "available" | "in_progress" | "done";

type Quest = {
  title: string;
  description: string;
  reward: string;
  status: QuestStatus;
  actionLabel: string;
  to: string;
  icon: typeof Sparkles;
  category: "Quotidiennes" | "Communautaires" | "Familiers & Monde";
};

const QUESTS: Quest[] = [
  {
    title: "Publier un post",
    description: "Partage une création ou une idée dans Social pour lancer ta journée.",
    reward: "+25 Lueurs",
    status: "available",
    actionLabel: "Aller au Social",
    to: "/social/play",
    icon: MessageSquare,
    category: "Communautaires",
  },
  {
    title: "Liker 3 posts",
    description: "Encourage la communauté en aimant trois publications.",
    reward: "+20 Lueurs",
    status: "available",
    actionLabel: "Voir Social",
    to: "/social/play",
    icon: Heart,
    category: "Communautaires",
  },
  {
    title: "Visiter le Monde",
    description: "Entre dans les Mondes pour découvrir la scène vivante.",
    reward: "+15 Lueurs",
    status: "available",
    actionLabel: "Entrer dans le Monde",
    to: "/mondes",
    icon: Sparkles,
    category: "Familiers & Monde",
  },
  {
    title: "Nourrir son familier",
    description: "Passe voir ton familier et prends soin de lui dans l’enclos.",
    reward: "+1 nourriture bonus",
    status: "available",
    actionLabel: "Aller au familier",
    to: "/familier",
    icon: Trophy,
    category: "Familiers & Monde",
  },
  {
    title: "Regarder un live",
    description: "Rejoins un live actif et découvre ce qui se passe en direct.",
    reward: "+20 Lueurs",
    status: "available",
    actionLabel: "Ouvrir les lives",
    to: "/live",
    icon: Radio,
    category: "Quotidiennes",
  },
  {
    title: "Personnaliser ton avatar",
    description: "Ouvre l’atelier pour ajuster ton style, tes tenues et ton look.",
    reward: "+10 Lueurs",
    status: "available",
    actionLabel: "Ouvrir l’atelier",
    to: "/avatar",
    icon: Crown,
    category: "Quotidiennes",
  },
];

export function Quests() {
  return (
    <div className="mx-auto min-h-[100dvh] max-w-7xl px-4 py-6 pb-28 sm:px-6 sm:py-10">
      <SectionHeading
        eyebrow="Quêtes"
        title={
          <>
            Petites missions,{" "}
            <span className="text-mystic">petites récompenses</span>
          </>
        }
        subtitle="Complète des actions simples dans l’application. Les récompenses sont indiquées pour préparer l’intégration serveur."
      />

      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {QUESTS.map((quest) => {
          const Icon = quest.icon;
          return (
            <article
              key={quest.title}
              className="card-royal flex flex-col gap-4 p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-gold-400/20 bg-gold-500/10 text-gold-200">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.24em] text-ivory/45">
                      {quest.category}
                    </p>
                    <h3 className="mt-1 font-display text-xl text-gold-100">
                      {quest.title}
                    </h3>
                  </div>
                </div>
                <span className="tag">{quest.reward}</span>
              </div>

              <p className="text-sm leading-6 text-ivory/75">{quest.description}</p>

              <div className="rounded-2xl border border-white/8 bg-night-950/45 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.2em] text-ivory/45">
                  État
                </p>
                <p className="mt-1 text-sm text-gold-100">
                  {quest.status === "available"
                    ? "Disponible"
                    : quest.status === "in_progress"
                      ? "En cours"
                      : "Terminée"}
                </p>
              </div>

              <div className="mt-auto flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Link to={quest.to} className="btn-gold w-full justify-center sm:w-auto">
                  {quest.actionLabel}
                </Link>
                <div className="inline-flex items-center gap-2 text-xs text-ivory/55">
                  <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                  Récompense à connecter côté serveur
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
