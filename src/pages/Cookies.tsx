import { LegalLayout } from "../components/LegalLayout";

export function Cookies() {
  return (
    <LegalLayout
      eyebrow="Grimoire des traces"
      title="Politique de cookies"
      lastUpdated={new Date().toLocaleDateString("fr-FR", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })}
    >
      <p>
        Le Royaume utilise des technologies de stockage local
        (<em>localStorage</em>, <em>sessionStorage</em>) et, à terme,
        certains cookies pour assurer son fonctionnement. La présente
        politique précise lesquelles et pourquoi, conformément à l'article
        82 de la loi Informatique et Libertés et aux recommandations de la
        CNIL.
      </p>

      <h2>1. Qu'est-ce qu'un cookie ?</h2>
      <p>
        Un cookie est un petit fichier déposé sur ton terminal par le site
        que tu visites. Il sert à mémoriser des informations (préférences,
        session de connexion, panier) ou à mesurer l'audience.
      </p>

      <h2>2. Cookies strictement nécessaires — exemptés de consentement</h2>
      <p>
        Ces éléments sont indispensables au fonctionnement du Site. Tu ne
        peux pas les refuser, sauf à ne plus utiliser le Royaume. Ils ne
        servent jamais à te tracer à des fins publicitaires :
      </p>
      <ul>
        <li>
          <strong>Session de connexion</strong> (clé{" "}
          <code>vaelyndra_user_v1</code> dans le localStorage) — conserve ton
          pseudo, ton avatar et tes préférences d'affichage.
        </li>
        <li>
          <strong>État de la cour</strong> (clés{" "}
          <code>vaelyndra_store_v1</code>, <code>vaelyndra_live_config_v1</code>,
          <code>vaelyndra_live_on</code>) — mémorise ton panier, tes posts, les
          réglages du live.
        </li>
        <li>
          <strong>Consentement cookies</strong> (clé{" "}
          <code>vaelyndra_cookie_consent_v1</code>) — mémorise ta décision pour
          ne pas te redemander à chaque visite.
        </li>
      </ul>

      <h2>3. Cookies de mesure d'audience exemptés</h2>
      <p>
        Aucun outil d'analytique tiers (Google Analytics, Meta Pixel,
        Matomo…) n'est actuellement installé sur le Site. Si cela devait
        changer, un consentement explicite te serait demandé via un bandeau
        avant tout dépôt.
      </p>

      <h2>4. Cookies tiers</h2>
      <p>
        Certains services tiers peuvent déposer leurs propres cookies lorsque
        tu interagis avec eux :
      </p>
      <ul>
        <li>
          <strong>Twitch</strong> — si Dreyna diffuse via Twitch et que tu
          regardes le lecteur embarqué, Twitch peut déposer ses cookies. Voir{" "}
          <a
            href="https://www.twitch.tv/p/legal/privacy-notice/"
            target="_blank"
            rel="noopener noreferrer"
          >
            la politique de Twitch
          </a>
          .
        </li>
        <li>
          <strong>YouTube</strong> — lecture des vidéos embarquées, voir{" "}
          <a
            href="https://policies.google.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
          >
            la politique de Google
          </a>
          .
        </li>
        <li>
          <strong>Stripe</strong> — paiement sécurisé, voir{" "}
          <a
            href="https://stripe.com/fr/privacy"
            target="_blank"
            rel="noopener noreferrer"
          >
            la politique de Stripe
          </a>
          .
        </li>
        <li>
          <strong>PeerJS</strong> — serveur de signalisation WebRTC utilisé
          pour le partage d'écran. Aucun cookie n'est déposé par le broker,
          seules des requêtes HTTPS temporaires sont échangées.
        </li>
      </ul>

      <h2>5. Gérer ton consentement</h2>
      <p>
        Tu peux à tout moment :
      </p>
      <ul>
        <li>
          révoquer ton consentement en effaçant la clé{" "}
          <code>vaelyndra_cookie_consent_v1</code> via les outils de ton
          navigateur,
        </li>
        <li>
          configurer ton navigateur pour bloquer les cookies (voir les pages
          d'aide{" "}
          <a
            href="https://support.mozilla.org/fr/kb/activer-desactiver-cookies-preferences"
            target="_blank"
            rel="noopener noreferrer"
          >
            Firefox
          </a>
          ,{" "}
          <a
            href="https://support.google.com/chrome/answer/95647"
            target="_blank"
            rel="noopener noreferrer"
          >
            Chrome
          </a>
          ,{" "}
          <a
            href="https://support.apple.com/fr-fr/guide/safari/sfri11471/mac"
            target="_blank"
            rel="noopener noreferrer"
          >
            Safari
          </a>
          ).
        </li>
      </ul>

      <h2>6. Durée de conservation</h2>
      <p>
        Les éléments de stockage local listés ci-dessus sont conservés au
        maximum <strong>13 mois</strong>. Au-delà, un nouveau consentement
        serait nécessaire pour ceux qui en requièrent un.
      </p>

      <h2>7. Contact</h2>
      <p>
        Toute question relative à cette politique peut être adressée à{" "}
        <a href="mailto:support@vaelyndra.com">support@vaelyndra.com</a>.
      </p>
    </LegalLayout>
  );
}
