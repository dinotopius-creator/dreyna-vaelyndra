import { Link } from "react-router-dom";
import { LegalLayout } from "../components/LegalLayout";

export function CGV() {
  return (
    <LegalLayout
      eyebrow="Édit de commerce"
      title="Conditions Générales de Vente"
      lastUpdated="18 avril 2026"
    >
      <p>
        Les présentes Conditions Générales de Vente (« CGV ») régissent les
        ventes réalisées sur le site <strong>Vaelyndra</strong> entre la
        directrice de la publication (ci-après <em>« le Vendeur »</em>) et
        tout visiteur majeur, ou membre âgé de 16 ans au minimum avec
        l'autorisation de son représentant légal (ci-après{" "}
        <em>« le Client »</em>).
      </p>

      <h2>1. Produits proposés</h2>
      <p>Le Royaume propose deux catégories de produits :</p>
      <ol>
        <li>
          <strong>Biens numériques — Gemmes de Vaelyndra</strong> : monnaie
          virtuelle interne utilisable pour offrir des cadeaux animés pendant
          les lives, débloquer des badges ou des accès VIP. Les Gemmes sont
          créditées au compte du Client immédiatement après validation du
          paiement.
        </li>
        <li>
          <strong>Biens physiques</strong> : textiles (t-shirts, sweats) et
          goodies officiels de Vaelyndra, expédiés à l'adresse communiquée
          par le Client.
        </li>
      </ol>
      <p>
        Chaque produit est présenté avec ses caractéristiques essentielles et
        son prix toutes taxes comprises (TTC) lorsque la franchise en base de
        TVA ne s'applique plus, ou hors taxes (HT) avec la mention{" "}
        <em>« TVA non applicable, art. 293 B du CGI »</em> tant que le
        Vendeur bénéficie du régime de la micro-entreprise.
      </p>

      <h2>2. Prix</h2>
      <p>
        Les prix sont indiqués en euros (€). Ils sont susceptibles d'évoluer à
        tout moment ; le prix applicable est celui affiché au moment de la
        validation de la commande. Les frais de livraison éventuels des biens
        physiques sont indiqués avant la validation finale du panier.
      </p>

      <h2>3. Commande</h2>
      <p>
        La commande se déroule en quatre étapes :
      </p>
      <ol>
        <li>sélection du produit,</li>
        <li>
          récapitulatif du panier avec le total, les taxes éventuelles et les
          frais de livraison,
        </li>
        <li>
          acceptation expresse des présentes CGV et validation via un bouton
          explicite <em>« Commander avec obligation de paiement »</em>,
        </li>
        <li>paiement sécurisé.</li>
      </ol>
      <p>
        La confirmation de la commande entraîne la conclusion du contrat de
        vente. Un e-mail récapitulatif est adressé au Client à l'issue du
        paiement.
      </p>

      <h2>4. Paiement</h2>
      <p>
        Les paiements sont traités par notre prestataire{" "}
        <a href="https://stripe.com/fr" target="_blank" rel="noopener noreferrer">
          Stripe
        </a>{" "}
        (carte bancaire, Apple Pay, Google Pay, selon les options disponibles).
        Le Vendeur ne stocke aucune coordonnée bancaire. Le paiement est
        protégé par le protocole 3-D Secure.
      </p>
      <p>
        En cas de refus de paiement par la banque, la commande est
        automatiquement annulée.
      </p>

      <h2>5. Livraison des Gemmes (bien numérique)</h2>
      <p>
        Les Gemmes sont créditées sur le compte du Client{" "}
        <strong>immédiatement après validation du paiement</strong>,
        généralement en moins de quelques secondes. En cas d'incident
        technique retardant la livraison au-delà de 24 heures, le Client est
        invité à contacter le support à{" "}
        <a href="mailto:support@vaelyndra.com">support@vaelyndra.com</a>.
      </p>

      <h2>6. Livraison des biens physiques</h2>
      <p>
        Les produits physiques sont expédiés en France métropolitaine et en
        Europe sous 3 à 10 jours ouvrés après validation du paiement. Les
        délais peuvent varier selon le transporteur et la saison. En cas de
        retard supérieur à 30 jours, le Client peut annuler la commande et
        obtenir son remboursement intégral.
      </p>
      <p>
        Le Client est tenu de fournir une adresse de livraison exacte. Toute
        erreur d'adresse entraînant un retour à l'expéditeur pourra donner
        lieu à la facturation d'un nouvel envoi.
      </p>

      <h2>7. Droit de rétractation (biens physiques)</h2>
      <p>
        Conformément aux articles L221-18 et suivants du Code de la
        consommation, le Client dispose d'un délai de <strong>14 jours</strong>{" "}
        à compter de la réception du bien physique pour exercer son droit de
        rétractation, sans avoir à motiver sa décision. Pour l'exercer, le
        Client notifie sa décision par e-mail à{" "}
        <a href="mailto:support@vaelyndra.com">support@vaelyndra.com</a> ou via
        le formulaire-type de rétractation annexé au Code de la consommation.
        Les frais de retour sont à la charge du Client. Le produit doit être
        renvoyé neuf, dans son emballage d'origine, dans un délai de 14 jours
        après la notification. Le remboursement intervient sous 14 jours à
        compter de la réception du bien.
      </p>

      <h2>8. Absence de droit de rétractation (Gemmes)</h2>
      <p>
        Conformément à l'article L221-28 13° du Code de la consommation, la
        fourniture de contenus numériques non fournis sur un support matériel
        dont l'exécution a commencé après accord préalable exprès du
        consommateur et renoncement exprès à son droit de rétractation n'ouvre
        pas droit à rétractation. En validant l'achat de Gemmes, le Client :
      </p>
      <ul>
        <li>
          accepte expressément que l'exécution commence immédiatement (crédit
          des Gemmes sur son compte),
        </li>
        <li>renonce expressément à son droit de rétractation.</li>
      </ul>
      <p>
        Cette renonciation est matérialisée par une case à cocher dédiée lors
        du paiement.
      </p>

      <h2>9. Garanties</h2>
      <p>
        Indépendamment des garanties commerciales éventuelles, le Vendeur
        reste tenu des garanties légales de conformité (articles L217-3 et
        suivants du Code de la consommation) et des vices cachés (articles
        1641 et suivants du Code civil), pour les biens physiques.
      </p>
      <blockquote>
        <strong>Rappel légal.</strong> En cas de défaut de conformité, le
        Client peut choisir entre la réparation ou le remplacement du bien,
        sous réserve des conditions de coût prévues à l'article L217-12 du
        Code de la consommation. Le Client est dispensé de rapporter la preuve
        de l'existence du défaut de conformité pendant les 24 mois suivant la
        délivrance du bien neuf.
      </blockquote>

      <h2>10. Remboursement des Gemmes</h2>
      <p>
        En cas d'erreur technique (double débit, Gemmes non créditées, cadeau
        envoyé involontairement), le Client peut demander un remboursement ou
        un nouvel avoir en contactant le support sous 30 jours. Hors ces cas,
        les Gemmes ne sont ni remboursables, ni échangeables, ni transférables.
      </p>

      <h2>11. Réclamations et médiation</h2>
      <p>
        Toute réclamation peut être adressée à{" "}
        <a href="mailto:support@vaelyndra.com">support@vaelyndra.com</a>. En
        cas de litige n'ayant pu être résolu amiablement dans un délai de 60
        jours, le Client consommateur a la possibilité de recourir
        gratuitement à un médiateur de la consommation ou à la plateforme
        européenne de règlement en ligne des litiges :{" "}
        <a
          href="https://ec.europa.eu/consumers/odr"
          target="_blank"
          rel="noopener noreferrer"
        >
          ec.europa.eu/consumers/odr
        </a>
        .
      </p>

      <h2>12. Protection des données</h2>
      <p>
        Les données personnelles collectées dans le cadre d'une commande
        (facturation, livraison, historique) sont traitées conformément à
        notre <Link to="/confidentialite">politique de confidentialité</Link>.
      </p>

      <h2>13. Droit applicable</h2>
      <p>
        Les présentes CGV sont soumises au droit français. Tout litige sera
        porté, à défaut de résolution amiable, devant les tribunaux français
        compétents, sans préjudice des dispositions impératives applicables
        aux consommateurs.
      </p>
    </LegalLayout>
  );
}
