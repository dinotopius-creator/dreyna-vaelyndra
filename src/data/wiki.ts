import { GRADES } from "./grades";
import { LIVE_CATEGORIES } from "./liveCategories";

export type WikiStatus = "available" | "evolving" | "coming-soon";

export interface WikiArticle {
  slug: string;
  title: string;
  category: string;
  audience: "Nouveaux" | "Membres" | "Streamers" | "Createurs" | "Tous";
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
  return `${grade.emoji} ${grade.name} [${grade.short}] : ${grade.motto}. Theme : ${grade.theme}. Seuil : ${threshold}.`;
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
      "Le parcours rapide pour creer un compte, comprendre la navigation et rejoindre les espaces principaux.",
    steps: [
      "Ouvrez l'accueil avec Royaume pour decouvrir les zones importantes.",
      "Utilisez Inscription pour creer un compte, puis Connexion pour revenir plus tard.",
      "Apres connexion, ouvrez Moi pour retrouver votre profil, votre avatar, votre familier et vos monnaies.",
      "Explorez Boutique, Live, Mondes et Communaute depuis la barre de navigation.",
      "Sur mobile, ouvrez le menu rond pour acceder aux memes espaces sans perdre de place.",
    ],
    tips: [
      "Ajoutez rapidement une photo de profil : les autres membres vous reconnaitront plus facilement.",
      "Choisissez votre creature et votre familier tot : plusieurs effets du site utilisent ces donnees.",
      "Gardez un oeil sur les notifications pour les likes, commentaires, mentions et offrandes.",
    ],
    commonIssues: [
      "Si une page protegee vous renvoie vers Connexion, reconnectez-vous puis revenez sur la page.",
      "Si le site semble hors ligne, la banniere hors connexion apparait automatiquement.",
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
      "Votre profil regroupe votre identite, votre avatar, votre familier, vos monnaies, votre wishlist et ce que les autres membres voient.",
    steps: [
      "Ouvrez Moi pour consulter votre espace personnel.",
      "Utilisez Modifier mon avatar pour acceder a l'atelier avatar.",
      "Pour la photo de profil, importez une photo depuis votre telephone sur mobile ou une image depuis votre ordinateur sur desktop.",
      "Ouvrez Compte pour les reglages de compte, le handle public et la securite.",
      "Votre profil public est accessible via /u/:userId et affiche votre presence, vos abonnements, votre grade et vos elements visibles.",
    ],
    tips: [
      "Utilisez une image nette et centree pour votre photo de profil.",
      "Le @handle est l'identifiant public ; il peut etre soumis a un delai avant modification.",
      "La wishlist permet aux autres membres de vous offrir des cosmetiques precis.",
    ],
    commonIssues: [
      "Si une ancienne image reste visible, rechargez la page apres sauvegarde.",
      "Si un handle est refuse, il est probablement deja pris ou ne respecte pas le format attendu.",
    ],
    related: ["avatar-personnalisation", "dons-offrandes", "securite-regles"],
  },
  {
    slug: "avatar-personnalisation",
    title: "Avatar, tenues, accessoires, parures et scenes",
    category: "Avatar",
    audience: "Membres",
    status: "available",
    route: "/avatar",
    summary:
      "L'atelier avatar gere votre apparence 3D, les styles visuels, les tenues, les accessoires, les parures et les scenes de profil.",
    steps: [
      "Ouvrez Avatar depuis votre espace Moi.",
      "Choisissez le corps, le visage, les cheveux, les couleurs et l'aperçu 360 degres.",
      "Dans la boutique avatar, debloquez des styles, fonds, scenes, tenues 3D, accessoires 3D et parures.",
      "Les items peuvent etre payes en Lueurs ou en Sylvins selon leur rarete.",
      "Equipez un item possede pour l'appliquer au profil ; un seul item actif est garde par slot.",
      "Dans le monde 3D, les tenues, accessoires et parures 3D peuvent apparaitre ; les scenes restent reservees au profil.",
    ],
    tips: [
      "Lueurs = monnaie gratuite/non premium, utile pour beaucoup d'achats cosmetiques.",
      "Sylvins = monnaie premium, utilisee pour les cadeaux live et certains items plus rares.",
      "Verifiez le rendu en mobile : le portrait est souvent vu dans le chat, les lives et la communaute.",
    ],
    commonIssues: [
      "Si un item n'apparait pas, verifiez qu'il est bien possede puis equipe.",
      "Si une scene n'apparait pas dans le monde 3D, c'est normal : les scenes de profil ne sont pas importees dans le monde partage.",
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
      "Le familier est un compagnon de compte : il a un niveau, de l'XP, des statistiques cosmetiques et peut recevoir des offrandes.",
    steps: [
      "Ouvrez Familier depuis Moi ou allez sur /familier.",
      "Choisissez votre premier familier si l'eveil est demande.",
      "Consultez son niveau, son palier d'evolution, sa progression XP et ses statistiques.",
      "Changez de familier depuis votre collection ; le premier changement est gratuit, les suivants peuvent couter des Sylvins.",
      "Donnez un surnom a votre familier si vous voulez le personnaliser.",
      "La boutique /familiers/boutique permet d'obtenir d'autres familiers quand ils sont disponibles.",
    ],
    tips: [
      "Les stats Aura, Energie Live, Recolte, Affinite et Charisme sont des effets sociaux et cosmetiques.",
      "Le familier gagne de l'XP avec l'activite sociale, les lives et certaines offrandes.",
      "Dans le monde 3D, le familier actif peut apparaitre au sol et suivre le joueur quand la synchronisation est disponible.",
    ],
    commonIssues: [
      "Si aucun familier n'apparait, reconnectez-vous ou laissez la fenetre d'eveil se charger.",
      "Si un modele 3D manque encore, le site garde un fallback visible le temps que l'asset final soit ajoute.",
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
      "Le monde 3D est l'espace social immersif : avatars 3D, deplacements temps reel, salon vocal, familiers et interactions entre membres.",
    steps: [
      "Ouvrez Mondes pour entrer dans l'espace 3D.",
      "Sur mobile, utilisez le joystick en bas a droite pour avancer, reculer, aller a gauche, a droite et vous deplacer en diagonale.",
      "Sur mobile, glissez sur la zone gauche de l'ecran pour orienter la camera.",
      "Sur desktop, utilisez les controles clavier/souris prevus par le monde.",
      "Le salon vocal est affiche dans l'interface du monde ; activez votre micro pour parler, coupez-le pour rester en ecoute.",
      "Cliquez ou touchez un autre joueur pour ouvrir les interactions disponibles.",
      "Utilisez le bouton de retour pour quitter proprement le monde.",
    ],
    tips: [
      "Pour une meilleure experience telephone, tournez l'appareil en paysage si l'interface vous le demande.",
      "Votre avatar du monde reprend les equipements 3D du profil quand les donnees sont disponibles.",
      "Le monde garde des fallbacks visibles pour eviter qu'un joueur disparaisse pendant une mise a jour reseau.",
    ],
    commonIssues: [
      "Si vous ne vous entendez pas, verifiez l'autorisation micro du navigateur ou de l'APK.",
      "Si un joueur semble immobile, sa connexion peut etre temporairement instable ; la derniere position valide est conservee autant que possible.",
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
      "La salle des lives affiche les directs actifs, leurs categories, le chat, les coeurs, les offrandes et les classements.",
    steps: [
      "Ouvrez Live pour voir les directs en cours.",
      "Selectionnez un live depuis la mise en avant, les categories ou la liste complete.",
      "Passez en plein ecran avec le bouton dedie si vous voulez une experience immersive.",
      "Lisez le chat et envoyez un message depuis le champ integre.",
      "Utilisez les coeurs et les offrandes pour interagir avec le streamer.",
      "Quittez le live avec le bouton de retour ou en changeant de page.",
    ],
    tips: [
      "Les categories de live disponibles sont : " + liveCategorySteps.join(" "),
      "Les cadeaux live coutent des Sylvins et declenchent des effets visibles pour la communaute.",
      "Sur mobile, gardez le clavier ferme quand vous regardez une scene plein ecran pour profiter de toute la hauteur.",
    ],
    commonIssues: [
      "Si le son ne demarre pas, touchez l'ecran : certains navigateurs bloquent l'audio avant interaction.",
      "Si la camera ou le partage d'ecran ne fonctionne pas, le navigateur peut limiter la fonctionnalite.",
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
      "Le guide createur pour preparer un direct, gerer le chat, recevoir des offrandes et construire une communaute reguliere.",
    steps: [
      "Connectez-vous puis ouvrez Mon live ou /live/studio.",
      "Choisissez un titre clair et une categorie adaptee : Just Chatting, Gaming, Live invite, Communaute, Musique, Creatif, Evenement ou Autre.",
      "Verifiez vos permissions camera, micro ou partage d'ecran avant de lancer.",
      "Demarrez le live et gardez le chat visible pour repondre rapidement.",
      "Remerciez les membres qui envoient des cadeaux ou soutiennent votre familier.",
      "Mettez fin au live proprement pour liberer la scene et les flux.",
    ],
    tips: [
      "Un bon titre explique ce que les spectateurs vont vivre, pas seulement que vous etes en live.",
      "Parlez regulierement aux nouveaux arrivants : le chat est le coeur du live.",
      "Preparez votre profil, votre avatar et votre familier avant un rendez-vous important.",
      "Les cadeaux en Sylvins contribuent au classement streamer et a l'XP de grade selon les regles serveur.",
    ],
    commonIssues: [
      "Si le live coupe en changeant de source, relancez les permissions et evitez d'ouvrir deux captures en meme temps.",
      "Si le micro est refuse, corrigez l'autorisation navigateur/appareil puis rechargez le studio.",
    ],
    related: ["lives-regarder", "dons-offrandes", "grades-roles"],
  },
  {
    slug: "communautes",
    title: "Communautes et publications",
    category: "Communautes",
    audience: "Tous",
    status: "available",
    route: "/communaute",
    summary:
      "La communaute regroupe le fil social : posts, images, videos, reactions, commentaires, reponses et identifications.",
    steps: [
      "Ouvrez Communaute depuis la navigation.",
      "Publiez un message, une image ou une video si l'interface vous le propose.",
      "Reagissez aux posts avec les boutons disponibles.",
      "Commentez un post ou repondez a un commentaire precis.",
      "Utilisez les mentions @ quand vous voulez identifier un membre dans une discussion.",
      "Consultez les profils depuis les noms, avatars ou handles cliquables.",
    ],
    tips: [
      "Les commentaires et reactions alimentent l'activite communautaire.",
      "Le classement d'activite hebdomadaire utilise les posts, commentaires et reactions visibles dans le code.",
      "Gardez des posts courts et lisibles sur mobile.",
    ],
    commonIssues: [
      "Si une image ne s'affiche pas, verifiez le format et la taille avant renvoi.",
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
      "Vaelyndra affiche plusieurs classements : streamers par Sylvins recus, duos BFF et activite communautaire.",
    steps: [
      "Ouvrez Live pour voir le classement live et le module BFF.",
      "Le classement streamer hebdomadaire est base sur les Sylvins recus pendant la semaine.",
      "Le module BFF associe chaque streamer a son plus gros soutien selon les donnees disponibles.",
      "Dans Communaute, le classement d'activite utilise posts, commentaires et reactions.",
      "Les recompenses communautaires peuvent accorder des Lueurs quand la synchronisation serveur est declenchee.",
    ],
    tips: [
      "Recevoir des Sylvins en cadeau augmente la visibilite streamer et l'XP de grade.",
      "Poster et commenter regulierement aide dans l'activite communautaire.",
      "Les classements affichent les donnees renvoyees par le backend, pas des valeurs inventees cote front.",
    ],
    commonIssues: [
      "Si un classement semble vide, il peut ne pas encore y avoir assez d'activite pour la periode.",
      "Si un classement ne se met pas a jour instantanement, attendez la prochaine synchronisation ou rechargez.",
    ],
    related: ["guide-streamer", "communautes", "grades-roles"],
  },
  {
    slug: "grades-roles",
    title: "Grades et roles",
    category: "Grades",
    audience: "Tous",
    status: "available",
    route: "/communaute",
    summary:
      "Les grades spirituels affichent la progression publique. Les roles techniques gerent les permissions d'administration et d'animation.",
    steps: [
      ...gradeSteps,
      "Role user : role normal d'un membre connecte.",
      "Role animator : acces d'animation/admin limite selon la configuration actuelle.",
      "Role admin : acces aux outils d'administration, moderation, utilisateurs et ajustements.",
      "Role queen existe dans certains anciens types front ; l'acces admin moderne s'appuie surtout sur admin, animator et queen quand le backend le renvoie.",
    ],
    tips: [
      "Les grades automatiques viennent de l'XP streamer calculee par le backend.",
      "Légende de Vaelyndra est indique comme admin-only dans le code : ce n'est pas un grade obtenu automatiquement par XP.",
      "Un admin peut forcer un grade ; dans ce cas la progression naturelle est marquee comme override.",
    ],
    commonIssues: [
      "Si aucun grade n'apparait, le profil peut venir d'une ancienne reponse backend ou le membre n'a pas encore de donnees de grade.",
      "Un role donne des permissions seulement si le backend et les routes protegees le reconnaissent.",
    ],
    related: ["classements", "guide-streamer", "securite-regles"],
  },
  {
    slug: "dons-offrandes",
    title: "Dons, offrandes, Lueurs et Sylvins",
    category: "Economie",
    audience: "Tous",
    status: "available",
    route: "/boutique",
    summary:
      "Lueurs et Sylvins servent a acheter, offrir et soutenir. Les Lueurs sont la monnaie gratuite/non premium ; les Sylvins sont la monnaie premium.",
    steps: [
      "Achetez ou obtenez des Lueurs selon les offres disponibles dans la boutique et les recompenses quotidiennes.",
      "Achetez des Sylvins en euros via la boutique quand vous voulez offrir des cadeaux live ou certains items premium.",
      "Dans un live, ouvrez les offrandes pour envoyer un cadeau anime au streamer.",
      "Sur un profil membre, utilisez les offrandes au familier si le panneau est visible.",
      "Depuis une wishlist, vous pouvez offrir un item cosmetique que le membre souhaite recevoir.",
      "Le backend debite les monnaies et met a jour l'inventaire ou les gains de maniere atomique quand l'endpoint est utilise.",
    ],
    tips: [
      "Les achats en Lueurs ne donnent pas d'XP streamer lorsqu'ils sont offerts en item ; le code evite les abus entre comptes.",
      "Les cadeaux en Sylvins peuvent contribuer a l'XP streamer et a certains classements.",
      "Les Sylvins recus par un streamer sont separes entre pots promo et payes pour limiter les abus.",
    ],
    commonIssues: [
      "Si le solde est insuffisant, rechargez la boutique ou verifiez votre portefeuille dans Moi.",
      "Si un cadeau echoue, ne relancez pas plusieurs fois : attendez la confirmation ou l'erreur affichee.",
    ],
    related: ["lives-regarder", "familiers", "avatar-personnalisation"],
  },
  {
    slug: "messages-notifications",
    title: "Messages prives et notifications",
    category: "Communication",
    audience: "Membres",
    status: "available",
    route: "/messages",
    summary:
      "Les messages prives, les notifications, les mentions et les pieces jointes gardent le lien entre membres hors live.",
    steps: [
      "Ouvrez Messages pour voir vos conversations.",
      "Entrez dans un fil pour lire les derniers messages et repondre.",
      "Envoyez une piece jointe lorsque le champ de message le permet.",
      "Ouvrez Notifs dans la barre du haut pour suivre likes, commentaires, mentions et offrandes familier.",
      "Dans les reglages de notifications, choisissez les alertes que vous voulez garder.",
    ],
    tips: [
      "Les images envoyees en prive doivent s'afficher directement quand elles sont reconnues comme pieces jointes.",
      "Gardez les notifications navigateur activees seulement si vous voulez recevoir des alertes hors page.",
      "Les mentions @ dans la communaute aident a repondre a une personne precise.",
    ],
    commonIssues: [
      "Si une image apparait comme lien brut, il faut verifier le format et le rendu piece jointe.",
      "Si les notifications navigateur ne s'activent pas, le navigateur ou l'APK peut demander une permission systeme.",
    ],
    related: ["communautes", "securite-regles", "profil-membre"],
  },
  {
    slug: "securite-regles",
    title: "Securite, regles et bonnes pratiques",
    category: "Securite",
    audience: "Tous",
    status: "available",
    route: "/compte",
    summary:
      "Les regles essentielles pour utiliser Vaelyndra proprement : respect, confidentialite, moderation et protection du compte.",
    steps: [
      "Respectez les autres membres dans les lives, le monde 3D, les messages et la communaute.",
      "Ne partagez pas d'informations sensibles dans le chat ou les messages.",
      "Activez les protections de compte disponibles dans Compte, notamment la double authentification si elle est proposee.",
      "Utilisez les signalements quand un contenu ou un comportement pose probleme.",
      "Dans les lives, gardez une moderation claire et evitez d'exposer des donnees personnelles.",
    ],
    tips: [
      "Un bon profil public ne contient pas d'adresse, de telephone ou de donnees privees.",
      "Sur mobile, refusez camera ou micro si vous n'en avez pas besoin.",
      "Les admins disposent d'outils de moderation et de journalisation selon les routes protegees.",
    ],
    commonIssues: [
      "Si vous perdez l'acces a votre compte, utilisez Mot de passe oublie si disponible.",
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
      "Les reponses courtes aux questions les plus frequentes des nouveaux membres et streamers.",
    steps: [
      "Modifier ma photo : ouvrez Moi, puis le profil/avatar, et importez une photo depuis mobile ou ordinateur selon votre appareil.",
      "Choisir un familier : ouvrez /familier et suivez l'eveil ou choisissez un familier possede.",
      "Acceder au monde 3D : ouvrez Mondes, puis utilisez joystick mobile ou controles desktop.",
      "Je ne vois pas mon avatar : verifiez que l'avatar est sauvegarde et que les assets 3D sont disponibles.",
      "Regarder un live : ouvrez Live puis selectionnez un direct actif.",
      "Envoyer une offrande : ouvrez les cadeaux dans un live ou le panneau d'offrande familier sur un profil.",
      "Devenir streamer : connectez-vous, ouvrez Mon live, choisissez titre/categorie et autorisez camera/micro si besoin.",
      "Rejoindre la communaute : ouvrez Communaute, publiez, commentez ou repondez aux membres.",
      "Comprendre le classement : les streamers sont classes par Sylvins recus ; l'activite communaute depend des posts, commentaires et reactions.",
      "Page qui ne charge pas : verifiez la connexion, rechargez, puis reconnectez-vous si la page est protegee.",
    ],
    tips: [
      "Utilisez la recherche du Wiki pour retrouver une section precise.",
      "Les liens de chaque article renvoient vers les pages reelles du site quand elles existent.",
      "Les fonctionnalites marquees En evolution existent dans le code mais peuvent encore evoluer visuellement ou techniquement.",
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
    eyebrow: "Identite",
    description: "Avatar, photo, tenues 3D, accessoires, parures et scenes.",
    icon: "Sparkles",
    articleSlugs: ["profil-membre", "avatar-personnalisation", "familiers"],
  },
  {
    id: "social",
    title: "Social et monde 3D",
    eyebrow: "Interactions",
    description: "Mondes, communaute, messages, vocal et autres joueurs.",
    icon: "Users",
    articleSlugs: ["monde-3d", "communautes", "messages-notifications"],
  },
  {
    id: "live",
    title: "Lives et streamers",
    eyebrow: "Creation",
    description: "Regarder, streamer, chatter, offrir et progresser.",
    icon: "Radio",
    articleSlugs: ["lives-regarder", "guide-streamer", "dons-offrandes"],
  },
  {
    id: "progression",
    title: "Progression",
    eyebrow: "Grades et classements",
    description: "XP, grades spirituels, classements streamers et activite.",
    icon: "Trophy",
    articleSlugs: ["classements", "grades-roles", "dons-offrandes"],
  },
  {
    id: "safety",
    title: "Aide et securite",
    eyebrow: "Bonnes pratiques",
    description: "Regles, compte, notifications, moderation et FAQ.",
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
