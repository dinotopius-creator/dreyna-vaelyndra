import { LegalLayout } from "../components/LegalLayout";

export function MentionsLegales() {
  return (
    <LegalLayout
      eyebrow="Parchemin officiel"
      title="Mentions légales"
      lastUpdated={new Date().toLocaleDateString("fr-FR", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })}
    >
      <p>
        Conformément aux dispositions de l'article 6 de la loi n° 2004-575 du 21
        juin 2004 pour la confiance dans l'économie numérique (LCEN), les
        présentes mentions légales sont portées à la connaissance des visiteurs
        du site <strong>Vaelyndra</strong>.
      </p>

      <h2>1. Éditeur du site</h2>
      <p>
        Le site Vaelyndra (ci-après <em>« le Site »</em> ou <em>« le Royaume »</em>)
        est édité par la créatrice de contenu connue sous le pseudonyme
        <strong> Dreyna </strong> (<em>@dreynakame</em> sur ZEPETO).
      </p>
      <ul>
        <li>
          <strong>Nom de l'éditeur :</strong> à compléter par la reine (identité
          civile ou raison sociale) dès la publication de la première transaction
          payante.
        </li>
        <li>
          <strong>Statut juridique :</strong> à compléter (entreprise individuelle
          / micro-entrepreneur / société).
        </li>
        <li>
          <strong>Adresse du siège :</strong> à compléter (adresse postale ou
          société de domiciliation).
        </li>
        <li>
          <strong>SIRET :</strong> à compléter dès l'obtention auprès de
          l'URSSAF.
        </li>
        <li>
          <strong>Contact :</strong>{" "}
          <a href="mailto:support@vaelyndra.com">support@vaelyndra.com</a>
        </li>
        <li>
          <strong>Directrice de la publication :</strong> Dreyna, fondatrice du
          Royaume.
        </li>
      </ul>
      <blockquote>
        Les champs « à compléter » doivent être remplis avant toute mise en
        ligne commerciale (ventes de gemmes ou de produits physiques). Ils sont
        obligatoires selon l'article 6-III LCEN dès qu'une activité commerciale
        est exercée.
      </blockquote>

      <h2>2. Hébergeur du site</h2>
      <p>
        Le Site est hébergé par un prestataire technique dont les coordonnées
        sont :
      </p>
      <ul>
        <li>
          <strong>Raison sociale :</strong> IONOS SARL
        </li>
        <li>
          <strong>Adresse :</strong> 7 place de la Gare, 57200 Sarreguemines,
          France
        </li>
        <li>
          <strong>Téléphone :</strong> 0 970 808 911
        </li>
        <li>
          <strong>Site web :</strong>{" "}
          <a
            href="https://www.ionos.fr"
            target="_blank"
            rel="noopener noreferrer"
          >
            www.ionos.fr
          </a>
        </li>
      </ul>
      <p>
        Pendant la phase de déploiement initial, le Site peut être
        temporairement servi depuis la plateforme de prévisualisation{" "}
        <em>devinapps.com</em>. Cette information sera mise à jour dès la
        bascule définitive sur les serveurs IONOS.
      </p>

      <h2>3. Propriété intellectuelle</h2>
      <p>
        L'ensemble des éléments du Site (textes, illustrations, code source,
        identité graphique, univers narratif de Vaelyndra, logos, marques et
        nom « Dreyna, reine des elfes ») est la propriété exclusive de la
        directrice de la publication, sauf mentions contraires précisées dans
        le contenu. Toute reproduction, représentation, adaptation ou
        diffusion, totale ou partielle, est interdite sans autorisation écrite
        préalable.
      </p>
      <p>
        Les captures d'écran de l'avatar de Dreyna proviennent de l'application{" "}
        <strong>ZEPETO</strong>, éditée par Naver Z Corp. Le Site est un site de
        fan entièrement indépendant et n'est{" "}
        <strong>pas affilié à, ni sponsorisé par, Naver Z Corp ou ZEPETO</strong>.
        Toutes les marques citées restent la propriété de leurs détenteurs
        respectifs.
      </p>

      <h2>4. Liens hypertextes</h2>
      <p>
        Le Site peut contenir des liens vers d'autres sites (ZEPETO, YouTube,
        Twitch, etc.). Vaelyndra n'exerce aucun contrôle sur ces sites tiers et
        décline toute responsabilité quant à leur contenu.
      </p>

      <h2>5. Droit applicable</h2>
      <p>
        Les présentes mentions sont régies par le droit français. Tout litige
        relatif à l'utilisation du Site sera de la compétence exclusive des
        tribunaux français, sauf disposition légale impérative contraire
        applicable aux consommateurs.
      </p>

      <h2>6. Contact</h2>
      <p>
        Pour toute question ou signalement :{" "}
        <a href="mailto:support@vaelyndra.com">support@vaelyndra.com</a>.
      </p>
    </LegalLayout>
  );
}
