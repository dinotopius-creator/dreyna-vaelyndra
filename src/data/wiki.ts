import { GRADES } from "./grades";
import { LIVE_CATEGORIES } from "./liveCategories";

export type WikiStatus = "available" | "evolving" | "coming-soon";

export interface WikiArticle {
  slug: string;
  title: string;
  category: string;
  audience: "Nouveaux" | "Membres" | "Streamers" | "Créateurs" | "Tous";
  status: WikiStatus;
  summary: string;
  route?: string;
  steps: string[];
  tips: string[];
  commonIssues?: string[];
  related: string[];
}

export interface WikiCategory {
  id: string;
  title: string;
  eyebrow: string;
  description: string;
  icon: string;
  articleSlugs: string[];
}

const gradeSteps = GRADES.map((grade) => {
  const threshold = grade.adminOnly
    ? "sacre manuel par l'administration"
    : `${grade.minXp.toLocaleString("fr-FR")} XP minimum`;
  return `${grade.emoji} ${grade.name} [${grade.short}] : ${grade.motto}. Thème : ${grade.theme}. Seuil : ${threshold}.`;
});

const liveCategorySteps = LIVE_CATEGORIES.map(
  (category) => `${category.label} : ${category.description}`,
);

export const WIKI_ARTICLES: WikiArticle[] = [
  {
    slug: "bien-commencer",
    title: "Bien commencer sur Vaelyndra",
    category: "Premiers pas",
    audience: "Nouveaux",
    status: "available",
    route: "/",
    summary:
      "Le parcours rapide pour créer un compte, comprendre la navigation et rejoindre les espaces principaux.",
    steps: [
      "Ouvrez l'accueil avec Royaume pour découvrir les zones importantes.",
      "Utilisez Inscription pour créer un compte, puis Connexion pour revenir plus tard.",
      "Après connexion, ouvrez Moi pour retrouver votre profil, votre avatar, votre familier et vos monnaies.",
      "Explorez Boutique, Live, Mondes et Communauté depuis la barre de navigation.",
      "Sur mobile, ouvrez le menu rond pour accéder aux mêmes espaces sans perdre de place.",
    ],
    tips: [
      "Ajoutez rapidement une photo de profil : les autres membres vous reconnaîtront plus facilement.",
      "Choisissez votre créature et votre familier tôt : plusieurs effets du site utilisent ces données.",
      "Gardez un œil sur les notifications pour les likes, commentaires, mentions et offrandes.",
    ],
    commonIssues: [
      "Si une page protégée vous renvoie vers Connexion, reconnectez-vous puis revenez sur la page.",
      "Si le site semble hors ligne, la bannière hors connexion apparaît automatiquement.",
    ],
    related: ["profil-membre", "avatar-personnalisation", "familiers"],
  },
  {
    slug: "profil-membre",
    title: "Profil membre et photo de profil",
    category: "Profil",
    audience: "Membres",
    status: "available",
    route: "/moi",
    summary:
      "Votre profil regroupe votre identité, votre avatar, votre familier, vos monnaies, votre wishlist et ce que les autres membres voient.",
    steps: [
      "Ouvrez Moi pour consulter votre espace personnel.",
      "Utilisez Modifier mon avatar pour accéder à l'atelier avatar.",
      "Pour la photo de profil, importez une photo depuis votre téléphone sur mobile ou depuis votre ordinateur.",
      "Ouvrez Compte pour les réglages de compte, le handle public et la sécurité.",
      "Votre profil public est accessible via /u/:userId et affiche votre présence, vos abonnements, votre grade et vos éléments visibles.",
    ],
    tips: [
      "Utilisez une image nette et centrée pour votre photo de profil.",
      "Le @handle est l'identifiant public ; il peut être soumis à un délai avant modification.",
      "La wishlist permet aux autres membres de vous offrir des cosmétiques précis.",
    ],
    commonIssues: [
      "Si une ancienne image reste visible, rechargez la page après sauvegarde.",
      "Si un handle est refusé, il est probablement déjà pris ou ne respecte pas le format attendu.",
    ],
    related: ["avatar-personnalisation", "dons-offrandes", "securite-regles"],
  },
  {
    slug: "avatar-personnalisation",
    title: "Avatar, tenues, accessoires, parures et scènes",
    category: "Avatar",
    audience: "Membres",
    status: "available",
    route: "/avatar",
    summary:
      "L'atelier avatar gère votre apparence 3D, les styles visuels, les tenues, les accessoires, les parures et les scènes de profil.",
    steps: [
      "Ouvrez Avatar depuis votre espace Moi.",
      "Choisissez le corps, le visage, les cheveux, les couleurs et l'aperçu 360 degrés.",
      "Dans la boutique avatar, débloquez des styles, fonds, scènes, tenues 3D, accessoires 3D et parures.",
      "Les items peuvent être payés en Lueurs ou en Sylvins selon leur rareté.",
      "Équipez un item possédé pour l'appliquer au profil ; un seul item actif est gardé par slot.",
      "Dans le monde 3D, les tenues, accessoires et parures 3D peuvent apparaître ; les scènes restent réservées au profil.",
    ],
    tips: [
      "Lueurs = monnaie gratuite/non premium, utile pour beaucoup d'achats cosmétiques.",
      "Sylvins = monnaie premium, utilisée pour les cadeaux live et certains items plus rares.",
      "Vérifiez le rendu en mobile : le portrait est souvent vu dans le chat, les lives et la communauté.",
    ],
    commonIssues: [
      "Si un item n'apparaît pas, vérifiez qu'il est bien possédé puis équipé.",
      "Si une scène n'apparaît pas dans le monde 3D, c'est normal : les scènes de profil ne sont pas importées dans le monde partagé.",
    ],
    related: ["monde-3d", "profil-membre", "dons-offrandes"],
  },
  {
    slug: "familiers",
    title: "Familiers",
    category: "Familiers",
    audience: "Membres",
    status: "evolving",
    route: "/familier",
    summary:
      "Le familier est un compagnon de compte : il a un niveau, de l'XP, des statistiques cosmétiques et peut recevoir des offrandes.",
    steps: [
      "Ouvrez Familier depuis Moi ou allez sur /familier.",
      "Choisissez votre premier familier si l'éveil est demandé.",
      "Consultez son niveau, son palier d'évolution, sa progression XP et ses statistiques.",
      "Changez de familier depuis votre collection ; le premier changement est gratuit, les suivants peuvent coûter des Sylvins.",
      "Donnez un surnom à votre familier si vous voulez le personnaliser.",
      "La boutique /familiers/boutique permet d'obtenir d'autres familiers quand ils sont disponibles.",
    ],
    tips: [
      "Les stats Aura, Énergie Live, Récolte, Affinité et Charisme sont des effets sociaux et cosmétiques.",
      "Le familier gagne de l'XP avec l'activité sociale, les lives et certaines offrandes.",
      "Dans le monde 3D, le familier actif peut apparaître au sol et suivre le joueur quand la synchronisation est disponible.",
    ],
    commonIssues: [
      "Si aucun familier n'apparaît, reconnectez-vous ou laissez la fenêtre d'éveil se charger.",
      "Si un modèle 3D manque encore, le site garde un fallback visible le temps que l'asset final soit ajouté.",
    ],
    related: ["monde-3d", "dons-offrandes", "profil-membre"],
  },
  {
    slug: "monde-3d",
    title: "Monde 3D",
    category: "Mondes",
    audience: "Tous",
    status: "evolving",
    route: "/mondes",
    summary:
      "Le monde 3D est l'espace social immersif : avatars 3D, déplacements temps réel, salon vocal, familiers et interactions entre membres.",
    steps: [
      "Ouvrez Mondes pour entrer dans l'espace 3D.",
      "Sur mobile, utilisez le joystick en bas à droite pour avancer, reculer, aller à gauche, à droite et vous déplacer en diagonale.",
      "Sur mobile, glissez sur la zone gauche de l'écran pour orienter la caméra.",
      "Sur desktop, utilisez les contrôles clavier/souris prévus par le monde.",
      "Le salon vocal est affiché dans l'interface du monde ; activez votre micro pour parler, coupez-le pour rester en écoute.",
      "Cliquez ou touchez un autre joueur pour ouvrir les interactions disponibles.",
      "Utilisez le bouton de retour pour quitter proprement le monde.",
    ],
    tips: [
      "Pour une meilleure expérience téléphone, tournez l'appareil en paysage si l'interface vous le demandé.",
      "Votre avatar du monde reprend les équipements 3D du profil quand les données sont disponibles.",
      "Le monde garde des fallbacks visibles pour éviter qu'un joueur disparaisse pendant une mise à jour réseau.",
    ],
    commonIssues: [
      "Si vous ne vous entendez pas, vérifiez l'autorisation micro du navigateur ou de l'APK.",
      "Si un joueur semble immobile, sa connexion peut être temporairement instable ; la dernière position valide est conservée autant que possible.",
    ],
    related: ["avatar-personnalisation", "familiers", "securite-regles"],
  },
  {
    slug: "lives-regarder",
    title: "Regarder un live",
    category: "Lives",
    audience: "Tous",
    status: "available",
    route: "/live",
    summary:
      "La salle des lives affiché les directs actifs, leurs catégories, le chat, les cœurs, les offrandes et les classements.",
    steps: [
      "Ouvrez Live pour voir les directs en cours.",
      "Sélectionnez un live depuis la mise en avant, les catégories ou la liste complète.",
      "Passez en plein écran avec le bouton dédié si vous voulez une expérience immersive.",
      "Lisez le chat et envoyez un message depuis le champ intégré.",
      "Utilisez les cœurs et les offrandes pour interagir avec le streamer.",
      "Quittez le live avec le bouton de retour ou en changeant de page.",
    ],
    tips: [
      "Les catégories de live disponibles sont : " + liveCategorySteps.join(" "),
      "Les cadeaux live coûtent des Sylvins et déclenchent des effets visibles pour la communauté.",
      "Sur mobile, gardez le clavier fermé quand vous regardez une scène plein écran pour profiter de toute la hauteur.",
    ],
    commonIssues: [
      "Si le son ne démarre pas, touchez l'écran : certains navigateurs bloquent l'audio avant interaction.",
      "Si la caméra ou le partage d'écran ne fonctionne pas, le navigateur peut limiter la fonctionnalité.",
    ],
    related: ["guide-streamer", "dons-offrandes", "classements"],
  },
  {
    slug: "guide-streamer",
    title: "Guide Streamer",
    category: "Streamers",
    audience: "Streamers",
    status: "available",
    route: "/live/studio",
    summary:
      "Le guide créateur pour préparer un direct, gèrer le chat, recevoir des offrandes et construire une communauté régulière.",
    steps: [
      "Connectez-vous puis ouvrez Mon live ou /live/studio.",
      "Choisissez un titre clair et une catégorie adaptée : Just Chatting, Gaming, Live invité, Communauté, Musique, Créatif, Événement ou Autre.",
      "Vérifiez vos permissions caméra, micro ou partagé d'écran avant de lancer.",
      "Démarrez le live et gardez le chat visible pour répondre rapidement.",
      "Remerciez les membres qui envoient des cadeaux ou soutiennent votre familier.",
      "Mettez fin au live proprement pour libérer la scène et les flux.",
    ],
    tips: [
      "Un bon titre explique ce que les spectateurs vont vivre, pas seulement que vous êtes en live.",
      "Parlez régulièrement aux nouveaux arrivants : le chat est le cœur du live.",
      "Préparez votre profil, votre avatar et votre familier avant un rendez-vous important.",
      "Les cadeaux en Sylvins contribuent au classement streamer et à l'XP de grade selon les règles serveur.",
    ],
    commonIssues: [
      "Si le live coupe en changeant de source, relancez les permissions et évitez d'ouvrir deux captures en meme temps.",
      "Si le micro est refusé, corrigez l'autorisation navigateur/appareil puis rechargez le studio.",
    ],
    related: ["lives-regarder", "dons-offrandes", "grades-roles"],
  },
  {
    slug: "communautes",
    title: "Communautés et publications",
    category: "Communautés",
    audience: "Tous",
    status: "available",
    route: "/communaute",
    summary:
      "La communauté regroupe le fil social : posts, images, vidéos, réactions, commentaires, réponses et identifications.",
    steps: [
      "Ouvrez Communauté depuis la navigation.",
      "Publiez un message, une image ou une video si l'interface vous le propose.",
      "Réagissez aux posts avec les boutons disponibles.",
      "Commentez un post ou répondez à un commentaire précis.",
      "Utilisez les mentions @ quand vous voulez identifier un membre dans une discussion.",
      "Consultez les profils depuis les noms, avatars ou handles cliquables.",
    ],
    tips: [
      "Les commentaires et réactions alimentent l'activité communautaire.",
      "Le classement d'activité hebdomadaire utilise les posts, commentaires et réactions visibles dans le code.",
      "Gardez des posts courts et lisibles sur mobile.",
    ],
    commonIssues: [
      "Si une image ne s'affiche pas, vérifiez le format et la taille avant renvoi.",
      "Si une mention ne trouve pas la personne, essayez son @handle exact.",
    ],
    related: ["classements", "profil-membre", "securite-regles"],
  },
  {
    slug: "classements",
    title: "Classements",
    category: "Classements",
    audience: "Tous",
    status: "available",
    route: "/live",
    summary:
      "Vaelyndra affiche plusieurs classements : streamers par Sylvins reçus, duos BFF et activité communautaire.",
    steps: [
      "Ouvrez Live pour voir le classement live et le module BFF.",
      "Le classement streamer hebdomadaire est basé sur les Sylvins reçus pendant la semaine.",
      "Le module BFF associe chaque streamer à son plus gros soutien selon les données disponibles.",
      "Dans Communauté, le classement d'activité utilise posts, commentaires et réactions.",
      "Les récompenses communautaires peuvent accorder des Lueurs quand la synchronisation serveur est déclenchée.",
    ],
    tips: [
      "Recevoir des Sylvins en cadeau augmente la visibilité streamer et l'XP de grade.",
      "Poster et commenter régulièrement aide dans l'activité communautaire.",
      "Les classements affichent les données renvoyées par le backend, pas des valeurs inventées côté front.",
    ],
    commonIssues: [
      "Si un classement semble vide, il peut ne pas encore y avoir assez d'activité pour la période.",
      "Si un classement ne se met pas à jour instantanément, attendez la prochaine synchronisation ou rechargez.",
    ],
    related: ["guide-streamer", "communautes", "grades-roles"],
  },
  {
    slug: "grades-roles",
    title: "Grades et rôles",
    category: "Grades",
    audience: "Tous",
    status: "available",
    route: "/communaute",
    summary:
      "Les grades spirituels affichent la progression publique. Les rôles techniques gèrent les permissions d'administration et d'animation.",
    steps: [
      ...gradeSteps,
      "Rôle user : rôle normal d'un membre connecté.",
      "Rôle animator : accès d'animation/admin limité selon la configuration actuelle.",
      "Rôle admin : accès aux outils d'administration, modération, utilisateurs et ajustements.",
      "Rôle queen existe dans certains anciens types front ; l'accès admin moderne s'appuie surtout sur admin, animator et queen quand le backend le renvoie.",
    ],
    tips: [
      "Les grades automatiques viennent de l'XP streamer calculée par le backend.",
      "Légende de Vaelyndra est indiquée comme admin-only dans le code : ce n'est pas un grade obtenu automatiquement par XP.",
      "Un admin peut forcer un grade ; dans ce cas la progression naturelle est marquée comme override.",
    ],
    commonIssues: [
      "Si aucun grade n'apparaît, le profil peut venir d'une ancienne réponse backend ou le membre n'a pas encore de données de grade.",
      "Un rôle donne des permissions seulement si le backend et les routes protégées le reconnaissent.",
    ],
    related: ["classements", "guide-streamer", "securite-regles"],
  },
  {
    slug: "dons-offrandes",
    title: "Dons, offrandes, Lueurs et Sylvins",
    category: "Économie",
    audience: "Tous",
    status: "available",
    route: "/boutique",
    summary:
      "Lueurs et Sylvins servent à acheter, offrir et soutenir. Les Lueurs sont la monnaie gratuite/non premium ; les Sylvins sont la monnaie premium.",
    steps: [
      "Achetez ou obtenez des Lueurs selon les offres disponibles dans la boutique et les récompenses quotidiennes.",
      "Achetez des Sylvins en euros via la boutique quand vous voulez offrir des cadeaux live ou certains items premium.",
      "Dans un live, ouvrez les offrandes pour envoyer un cadeau animé au streamer.",
      "Sur un profil membre, utilisez les offrandes au familier si le panneau est visible.",
      "Depuis une wishlist, vous pouvez offrir un item cosmétique que le membre souhaite recevoir.",
      "Le backend débite les monnaies et met à jour l'inventaire ou les gains de manière atomique quand l'endpoint est utilisé.",
    ],
    tips: [
      "Les achats en Lueurs ne donnent pas d'XP streamer lorsqu'ils sont offerts en item ; le code évite les abus entre comptes.",
      "Les cadeaux en Sylvins peuvent contribuer à l'XP streamer et à certains classements.",
      "Les Sylvins reçus par un streamer sont séparés entre pots promotionnels et payants pour limiter les abus.",
    ],
    commonIssues: [
      "Si le solde est insuffisant, rechargez la boutique ou vérifiez votre portefeuille dans Moi.",
      "Si un cadeau échoue, ne relancez pas plusieurs fois : attendez la confirmation ou l'erreur affichée.",
    ],
    related: ["lives-regarder", "familiers", "avatar-personnalisation"],
  },
  {
    slug: "messages-notifications",
    title: "Messages privés et notifications",
    category: "Communication",
    audience: "Membres",
    status: "available",
    route: "/messages",
    summary:
      "Les messages privés, les notifications, les mentions et les pièces jointes gardent le lien entre membres hors live.",
    steps: [
      "Ouvrez Messages pour voir vos conversations.",
      "Entrez dans un fil pour lire les derniers messages et répondre.",
      "Envoyez une pièce jointe lorsque le champ de message le permet.",
      "Ouvrez Notifs dans la barre du haut pour suivre likes, commentaires, mentions et offrandes familier.",
      "Dans les réglages de notifications, choisissez les alertes que vous voulez garder.",
    ],
    tips: [
      "Les images envoyées en privé doivent s'afficher directement quand elles sont reconnues comme pièces jointes.",
      "Gardez les notifications du navigateur activées seulement si vous voulez recevoir des alertes hors page.",
      "Les mentions @ dans la communauté aident à répondre à une personne précise.",
    ],
    commonIssues: [
      "Si une image apparaît comme lien brut, il faut vérifier le format et le rendu pièce jointe.",
      "Si les notifications navigateur ne s'activent pas, le navigateur ou l'APK peut demander une permission système.",
    ],
    related: ["communautes", "securite-regles", "profil-membre"],
  },
  {
    slug: "securite-regles",
    title: "Sécurité, règles et bonnes pratiques",
    category: "Sécurité",
    audience: "Tous",
    status: "available",
    route: "/compte",
    summary:
      "Les règles essentielles pour utiliser Vaelyndra proprement : respect, confidentialité, modération et protection du compte.",
    steps: [
      "Respectez les autres membres dans les lives, le monde 3D, les messages et la communauté.",
      "Ne partagez pas d'informations sensibles dans le chat ou les messages.",
      "Activez les protections de compte disponibles dans Compte, notamment la double authentification si elle est proposée.",
      "Utilisez les signalements quand un contenu ou un comportement pose problème.",
      "Dans les lives, gardez une modération claire et évitez d'exposer des données personnelles.",
    ],
    tips: [
      "Un bon profil public ne contient pas d'adresse, de téléphone ou de données privées.",
      "Sur mobile, refusez caméra ou micro si vous n'en avez pas besoin.",
      "Les admins disposent d'outils de modération et de journalisation selon les routes protégées.",
    ],
    commonIssues: [
      "Si vous perdez l'accès à votre compte, utilisez Mot de passe oublié si disponible.",
      "Si une session vous semble suspecte, consultez Connexions pour l'historique et les appareils.",
    ],
    related: ["messages-notifications", "guide-streamer", "bien-commencer"],
  },
  {
    slug: "faq",
    title: "FAQ rapide",
    category: "FAQ",
    audience: "Tous",
    status: "available",
    route: "/wiki",
    summary:
      "Les réponses courtes aux questions les plus fréquentes des nouveaux membres et streamers.",
    steps: [
      "Modifier ma photo : ouvrez Moi, puis le profil/avatar, et importez une photo depuis mobile ou ordinateur selon votre appareil.",
      "Choisir un familier : ouvrez /familier et suivez l'éveil ou choisissez un familier possédé.",
      "Accéder au monde 3D : ouvrez Mondes, puis utilisez joystick mobile ou contrôles desktop.",
      "Je ne vois pas mon avatar : vérifiez que l'avatar est sauvegardé et que les assets 3D sont disponibles.",
      "Regarder un live : ouvrez Live puis sélectionnez un direct actif.",
      "Envoyer une offrande : ouvrez les cadeaux dans un live ou le panneau d'offrande familier sur un profil.",
      "Devenir streamer : connectez-vous, ouvrez Mon live, choisissez titre/catégorie et autorisez caméra/micro si besoin.",
      "Rejoindre la communauté : ouvrez Communauté, publiez, commentez ou répondez aux membres.",
      "Comprendre le classement : les streamers sont classés par Sylvins reçus ; l'activité communauté dépend des posts, commentaires et réactions.",
      "Page qui ne charge pas : vérifiez la connexion, rechargez, puis reconnectez-vous si la page est protégée.",
    ],
    tips: [
      "Utilisez la recherche du Wiki pour retrouver une section précise.",
      "Les liens de chaque article renvoient vers les pages réelles du site quand elles existent.",
      "Les fonctionnalités marquées En évolution existent dans le code mais peuvent encore évoluer visuellement ou techniquement.",
    ],
    related: ["bien-commencer", "guide-streamer", "monde-3d"],
  },
];

export const WIKI_CATEGORIES: WikiCategory[] = [
  {
    id: "start",
    title: "Guide utilisateur",
    eyebrow: "Nouveaux membres",
    description: "Premiers pas, navigation, profil et bases de la plateforme.",
    icon: "Compass",
    articleSlugs: ["bien-commencer", "profil-membre", "faq"],
  },
  {
    id: "identity",
    title: "Profil et personnalisation",
    eyebrow: "Identité",
    description: "Avatar, photo, tenues 3D, accessoires, parures et scènes.",
    icon: "Sparkles",
    articleSlugs: ["profil-membre", "avatar-personnalisation", "familiers"],
  },
  {
    id: "social",
    title: "Social et monde 3D",
    eyebrow: "Interactions",
    description: "Mondes, communauté, messages, vocal et autres joueurs.",
    icon: "Users",
    articleSlugs: ["monde-3d", "communautes", "messages-notifications"],
  },
  {
    id: "live",
    title: "Lives et streamers",
    eyebrow: "Création",
    description: "Regarder, streamer, chatter, offrir et progresser.",
    icon: "Radio",
    articleSlugs: ["lives-regarder", "guide-streamer", "dons-offrandes"],
  },
  {
    id: "progression",
    title: "Progression",
    eyebrow: "Grades et classements",
    description: "XP, grades spirituels, classements streamers et activité.",
    icon: "Trophy",
    articleSlugs: ["classements", "grades-roles", "dons-offrandes"],
  },
  {
    id: "safety",
    title: "Aide et sécurité",
    eyebrow: "Bonnes pratiques",
    description: "Règles, compte, notifications, modération et FAQ.",
    icon: "ShieldCheck",
    articleSlugs: ["securite-regles", "messages-notifications", "faq"],
  },
];

export const WIKI_ARTICLES_BY_SLUG: Record<string, WikiArticle> =
  Object.fromEntries(WIKI_ARTICLES.map((article) => [article.slug, article]));

export function getWikiArticle(slug: string | undefined): WikiArticle | null {
  if (!slug) return null;
  return WIKI_ARTICLES_BY_SLUG[slug] ?? null;
}
