import { LegalLayout } from "../components/LegalLayout";

export function MentionsLegales() {
  return (
    <LegalLayout
      eyebrow="Parchemin officiel"
      title="Mentions légales"
      lastUpdated="18 avril 2026"
    >
      <p>
        Conformément aux dispositions de l'article 6 de la loi n° 2004-575 du 21
        juin 2004 pour la confiance dans l'économie numérique (LCEN), les
        présentes mentions légales sont portées à la connaissance des visiteurs
        du site <strong>Vaelyndra</strong>.
      </p>

      <h2>1. Éditeur du site</h2>
      <p>
        Le site Vaelyndra (ci-après <em>« le Site »</em> ou{" "}
        <em>« le Royaume »</em>) est édité, à titre{" "}
        <strong>non-professionnel</strong>, par une personne physique connue sur
        le Site et sur ses réseaux sous le pseudonyme de{" "}
        <strong>Dreyna</strong> (<em>@dreynakame</em> sur ZEPETO).
      </p>
      <p>
        Conformément à l'article <strong>6-III-2° de la LCEN</strong>, et afin
        de préserver son anonymat, la directrice de la publication a communiqué
        ses coordonnées personnelles (identité civile, adresse postale,
        téléphone) à l'hébergeur du Site dont les coordonnées figurent{" "}
        <a href="#hebergeur">ci-dessous</a>. L'hébergeur est tenu de conserver
        ces informations et de les transmettre à toute autorité judiciaire qui
        en ferait la demande légitime.
      </p>
      <ul>
        <li>
          <strong>Directrice de la publication :</strong> Dreyna, fondatrice du
          Royaume
        </li>
        <li>
          <strong>Nature de la publication :</strong> site personnel de fan,
          non commercial, à visée artistique et communautaire
        </li>
        <li>
          <strong>Contact public :</strong>{" "}
          <a href="mailto:support@vaelyndra.com">support@vaelyndra.com</a>
        </li>
      </ul>
      <blockquote>
        Le présent régime d'anonymat ne s'applique qu'aussi longtemps que le
        Site reste exempt d'activité commerciale. Dès la mise en vente de
        Sylvins, de biens physiques ou de toute prestation rémunérée, une
        version professionnelle des présentes mentions (raison sociale,
        adresse du siège, SIRET, représentant légal) sera publiée conformément
        à l'article 6-III-1° LCEN.
      </blockquote>

      <h2 id="hebergeur">2. Hébergeur du site</h2>
      <p>
        Le Site est hébergé par le prestataire technique suivant :
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
        <em>devinapps.com</em> (opérée par Cognition AI, Inc.). Cette
        information sera actualisée lors de la bascule définitive sur les
        serveurs IONOS.
      </p>

      <h2>3. Propriété intellectuelle</h2>
      <p>
        L'ensemble des éléments du Site (textes, illustrations, code source,
        identité graphique, univers narratif de Vaelyndra, logos, nom{" "}
        <em>« Dreyna, reine des elfes »</em>) est la propriété exclusive de la
        directrice de la publication, sauf mentions contraires précisées dans
        le contenu. Toute reproduction, représentation, adaptation ou
        diffusion, totale ou partielle, est interdite sans autorisation écrite
        préalable.
      </p>
      <p>
        Les captures d'écran de l'avatar de Dreyna proviennent de l'application{" "}
        <strong>ZEPETO</strong>, éditée par Naver Z Corp. Le Site est un site
        de fan entièrement indépendant et n'est{" "}
        <strong>pas affilié à, ni sponsorisé par, Naver Z Corp ou ZEPETO</strong>.
        Toutes les marques citées restent la propriété de leurs détenteurs
        respectifs.
      </p>

      <h2>4. Liens hypertextes</h2>
      <p>
        Le Site peut contenir des liens vers d'autres sites (ZEPETO, YouTube,
        Twitch, etc.). Vaelyndra n'exerce aucun contrôle sur ces sites tiers
        et décline toute responsabilité quant à leur contenu.
      </p>

      <h2>5. Signalement de contenu</h2>
      <p>
        Conformément à l'article 16 du Règlement (UE) 2022/2065 (Digital
        Services Act), tout visiteur peut signaler un contenu qu'il
        estimerait illicite en écrivant à{" "}
        <a href="mailto:support@vaelyndra.com">support@vaelyndra.com</a>. Les
        signalements sont traités dans les meilleurs délais par la directrice
        de la publication.
      </p>

      <h2>6. Droit applicable</h2>
      <p>
        Les présentes mentions sont régies par le droit français. Tout litige
        relatif à l'utilisation du Site sera de la compétence exclusive des
        tribunaux français, sauf disposition légale impérative contraire
        applicable aux consommateurs.
      </p>

      <h2>7. Contact</h2>
      <p>
        Pour toute question, demande de rectification ou signalement :{" "}
        <a href="mailto:support@vaelyndra.com">support@vaelyndra.com</a>.
      </p>
    </LegalLayout>
  );
}
