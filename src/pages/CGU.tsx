import { Link } from "react-router-dom";
import { LegalLayout } from "../components/LegalLayout";

export function CGU() {
  return (
    <LegalLayout
      eyebrow="Code de la cour"
      title="Conditions Générales d'Utilisation"
      lastUpdated="18 avril 2026"
    >
      <p>
        Les présentes Conditions Générales d'Utilisation (« CGU ») régissent
        l'accès et l'usage du site <strong>Vaelyndra</strong> (ci-après
        <em> « le Royaume »</em>). En créant un compte ou en utilisant le
        Royaume, tu reconnais avoir lu, compris et accepté les présentes CGU
        sans réserve.
      </p>

      <h2>1. Objet du Royaume</h2>
      <p>
        Vaelyndra est une plateforme communautaire animée par{" "}
        <strong>Dreyna</strong>, créatrice ZEPETO (programme HOT), rassemblant
        ses fans autour d'un univers fantasy. Le Royaume permet notamment :
      </p>
      <ul>
        <li>la lecture de chroniques, la découverte du profil de Dreyna,</li>
        <li>la participation à une communauté (posts, commentaires, réactions),</li>
        <li>l'accès aux lives de Dreyna (partage d'écran ou flux Twitch),</li>
        <li>
          à terme, la réalisation de <strong>lives personnels</strong> par les
          membres autorisés, avec mise en avant graduelle des plus actifs dans
          la rubrique « Top lives »,
        </li>
        <li>
          l'achat de <strong>Sylvins de Vaelyndra</strong> (monnaie virtuelle
          interne) permettant d'offrir des cadeaux animés en direct,
        </li>
        <li>
          l'achat de <strong>produits dérivés physiques</strong> (textiles,
          goodies) via la boutique officielle.
        </li>
      </ul>

      <h2>2. Inscription et compte</h2>
      <p>
        L'inscription est gratuite et ouverte aux personnes âgées de{" "}
        <strong>16 ans minimum</strong>. Tu t'engages à fournir des
        informations exactes, à choisir un pseudonyme non offensant et à
        maintenir la confidentialité de ton mot de passe. Un compte = une
        personne physique.
      </p>
      <p>
        Tu es seul(e) responsable de toute activité effectuée depuis ton
        compte. En cas de suspicion de compromission, préviens-nous
        immédiatement à{" "}
        <a href="mailto:support@vaelyndra.com">support@vaelyndra.com</a>.
      </p>

      <h2>3. Règles de conduite</h2>
      <p>
        Pour préserver l'atmosphère du Royaume, sont strictement interdits :
      </p>
      <ul>
        <li>
          les propos haineux, discriminatoires, harcelants, sexuellement
          explicites ou violents ;
        </li>
        <li>le spam, la publicité non sollicitée, les arnaques, le phishing ;</li>
        <li>
          l'usurpation d'identité (notamment de Dreyna, de l'équipe ou d'un
          autre membre) ;
        </li>
        <li>la diffusion de contenus protégés par le droit d'auteur sans autorisation ;</li>
        <li>
          toute tentative d'atteinte à la sécurité du Site (injection, reverse
          engineering, scraping massif) ;
        </li>
        <li>
          la promotion ou la demande de contenus mettant en scène des mineurs
          de manière inappropriée.
        </li>
      </ul>

      <h2>4. Lives de Dreyna et lives des membres</h2>
      <p>
        Le Royaume propose deux types de lives :
      </p>
      <ol>
        <li>
          <strong>Les lives de Dreyna</strong> : partage d'écran WebRTC direct
          ou diffusion Twitch via OBS.
        </li>
        <li>
          <strong>Les lives de membres</strong> (progressivement activés) :
          les membres de confiance peuvent diffuser leurs propres lives sur
          leur profil, dans le respect des présentes règles. Dreyna se réserve
          le droit d'accorder, de suspendre ou de retirer l'accès à cette
          fonctionnalité à tout moment.
        </li>
      </ol>
      <p>
        <strong>Mise en avant éditoriale.</strong> Les membres les plus actifs
        peuvent être épinglés en « Top live » par Dreyna à sa seule discrétion.
        Cette mise en avant ne confère aucun droit acquis ni aucune garantie de
        durée.
      </p>

      <h2>5. Monnaie virtuelle « Sylvins de Vaelyndra »</h2>
      <p>
        Les Sylvins sont une monnaie <strong>strictement virtuelle</strong>,
        utilisable uniquement à l'intérieur du Royaume pour offrir des
        cadeaux animés pendant les lives, débloquer des badges ou des salons
        VIP. Ils :
      </p>
      <ul>
        <li>n'ont pas cours légal et ne peuvent pas être reconvertis en euros,</li>
        <li>ne peuvent pas être transférés à un autre membre,</li>
        <li>peuvent expirer 24 mois après leur dernier achat en cas de compte inactif,</li>
        <li>sont perdus en cas de fermeture volontaire du compte par le membre.</li>
      </ul>
      <p>
        Les modalités d'achat et de remboursement des Sylvins sont détaillées
        dans les <Link to="/cgv">Conditions Générales de Vente</Link>.
      </p>

      <h2>6. Modération, sanctions et bannissement</h2>
      <p>
        Dreyna et son équipe peuvent, à leur seule appréciation et sans délai,
        modérer, masquer ou supprimer tout contenu contrevenant aux présentes
        CGU, suspendre ou résilier un compte, couper un live, retirer la
        possibilité de diffuser, ou bannir définitivement un membre. Les
        Sylvins non consommés sont perdus en cas de bannissement pour faute
        grave (fraude, harcèlement, contenu illicite).
      </p>
      <p>
        Tout membre dispose d'un mécanisme de signalement accessible depuis
        chaque contenu (bouton « Signaler »), conformément à l'article 16 du
        règlement UE 2022/2065 (Digital Services Act).
      </p>

      <h2>7. Propriété intellectuelle des contenus</h2>
      <p>
        Tu conserves la propriété de tes contenus (posts, commentaires,
        lives). En les publiant sur Vaelyndra, tu accordes au Royaume une
        licence gratuite, mondiale et non exclusive pour les héberger, les
        afficher et les promouvoir dans le cadre du service, pendant toute la
        durée de ton compte et 30 jours au-delà.
      </p>

      <h2>8. Responsabilité</h2>
      <p>
        Vaelyndra met en œuvre ses meilleurs efforts pour assurer la
        continuité du service, sans toutefois garantir l'absence totale
        d'interruption (maintenance, incident réseau, faille tierce). Notre
        responsabilité ne saurait être engagée pour des dommages indirects.
      </p>

      <h2>9. Évolution des CGU</h2>
      <p>
        Les CGU peuvent évoluer. Les modifications substantielles te seront
        notifiées par e-mail ou par un bandeau sur le Site au moins 15 jours
        avant leur entrée en vigueur.
      </p>

      <h2>10. Droit applicable</h2>
      <p>
        Les présentes CGU sont soumises au droit français. En cas de litige, et
        après tentative de résolution amiable auprès de{" "}
        <a href="mailto:support@vaelyndra.com">support@vaelyndra.com</a>, les
        tribunaux français seront compétents, sans préjudice des dispositions
        impératives applicables aux consommateurs.
      </p>
    </LegalLayout>
  );
}
