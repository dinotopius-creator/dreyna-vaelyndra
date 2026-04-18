import { LegalLayout } from "../components/LegalLayout";

export function Confidentialite() {
  return (
    <LegalLayout
      eyebrow="Serment de la cour"
      title="Politique de confidentialité"
      lastUpdated={new Date().toLocaleDateString("fr-FR", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })}
    >
      <p>
        La présente politique décrit la manière dont le Royaume de Vaelyndra
        (ci-après <em>« Vaelyndra »</em>, <em>« nous »</em>) collecte et
        traite les données personnelles de ses membres, dans le respect du
        Règlement général sur la protection des données (règlement UE
        2016/679, <strong>RGPD</strong>) et de la loi « Informatique et
        Libertés ».
      </p>

      <h2>1. Responsable du traitement</h2>
      <p>
        Le responsable du traitement est la directrice de la publication du
        Site, joignable à{" "}
        <a href="mailto:support@vaelyndra.com">support@vaelyndra.com</a>.
      </p>

      <h2>2. Données collectées et finalités</h2>
      <ol>
        <li>
          <strong>Création de compte</strong> — pseudonyme, adresse e-mail, mot
          de passe (stocké sous forme hachée via argon2/bcrypt).{" "}
          <em>Finalité : permettre l'accès à ton espace personnel et la
          participation à la vie du Royaume.</em> Base légale : exécution du
          contrat (CGU).
        </li>
        <li>
          <strong>Profil facultatif</strong> — avatar, bio, préférences
          d'affichage. <em>Finalité : personnalisation du compte.</em> Base
          légale : consentement.
        </li>
        <li>
          <strong>Contributions publiques</strong> — posts, commentaires,
          réactions, messages de chat, historique des lives.{" "}
          <em>Finalité : animation de la communauté.</em> Base légale :
          exécution du contrat.
        </li>
        <li>
          <strong>Achats (gemmes et biens physiques)</strong> — identité de
          facturation, adresse de livraison (pour les produits physiques),
          historique des commandes. <em>Finalité : exécution de la commande,
          facturation, obligations comptables.</em> Base légale : exécution du
          contrat et obligation légale.
        </li>
        <li>
          <strong>Paiements</strong> — les coordonnées bancaires{" "}
          <strong>ne sont jamais stockées sur nos serveurs</strong>. Elles sont
          traitées directement par notre prestataire{" "}
          <a href="https://stripe.com/fr" target="_blank" rel="noopener noreferrer">
            Stripe
          </a>
          , conforme à la norme PCI-DSS.
        </li>
        <li>
          <strong>Données techniques</strong> — adresse IP, type de navigateur,
          horodatage. <em>Finalité : sécurité du Site (anti-fraude,
          anti-spam), diagnostic technique.</em> Base légale : intérêt
          légitime.
        </li>
        <li>
          <strong>Contenus des lives (partage d'écran et flux vidéo)</strong> —
          transitent en pair à pair via WebRTC et{" "}
          <strong>ne sont ni stockés, ni enregistrés par défaut</strong> sur
          nos serveurs. Si une fonctionnalité de replay est activée par la
          reine pour son propre live, tu en seras informé(e) explicitement
          avant de rejoindre.
        </li>
      </ol>

      <h2>3. Durées de conservation</h2>
      <ul>
        <li>
          <strong>Compte actif :</strong> aussi longtemps que tu restes membre.
        </li>
        <li>
          <strong>Compte supprimé :</strong> les données sont effacées sous 30
          jours, à l'exception des données comptables (factures, historique
          d'achats) conservées 10 ans conformément au Code de commerce.
        </li>
        <li>
          <strong>Logs techniques :</strong> 12 mois maximum.
        </li>
        <li>
          <strong>Données de paiement chez Stripe :</strong> selon les durées
          de rétention propres à Stripe, accessibles dans leur politique de
          confidentialité.
        </li>
      </ul>

      <h2>4. Destinataires</h2>
      <p>
        Tes données personnelles sont traitées par la directrice de la
        publication et, le cas échéant, par des prestataires strictement
        nécessaires (hébergeur IONOS en France/Allemagne, Stripe pour les
        paiements, service d'e-mailing le cas échéant). Aucune donnée n'est
        revendue à des tiers.
      </p>

      <h2>5. Transferts hors Union Européenne</h2>
      <p>
        Par défaut, toutes les données sont hébergées en Union Européenne
        (IONOS, Allemagne/France). Si un transfert hors UE devenait nécessaire
        (ex. Stripe vers les États-Unis), il s'effectuerait exclusivement
        via des clauses contractuelles types validées par la Commission
        européenne.
      </p>

      <h2>6. Tes droits</h2>
      <p>
        Conformément aux articles 15 à 22 du RGPD, tu disposes d'un droit :
      </p>
      <ul>
        <li>d'accès à tes données,</li>
        <li>de rectification,</li>
        <li>d'effacement (« droit à l'oubli »),</li>
        <li>d'opposition au traitement,</li>
        <li>de limitation du traitement,</li>
        <li>à la portabilité de tes données,</li>
        <li>
          de définir des directives post-mortem sur le sort de tes données.
        </li>
      </ul>
      <p>
        Pour exercer ces droits, écris-nous à{" "}
        <a href="mailto:support@vaelyndra.com">support@vaelyndra.com</a>. Une
        réponse te sera apportée sous un délai maximum d'un mois. Tu peux
        également introduire une réclamation auprès de la{" "}
        <a
          href="https://www.cnil.fr"
          target="_blank"
          rel="noopener noreferrer"
        >
          CNIL
        </a>
        .
      </p>

      <h2>7. Sécurité</h2>
      <p>
        Nous mettons en œuvre les mesures techniques et organisationnelles
        appropriées pour protéger tes données : chiffrement TLS (HTTPS),
        hachage des mots de passe, pare-feu, limitation des tentatives de
        connexion, sauvegardes chiffrées. En cas de violation susceptible
        d'engendrer un risque pour tes droits et libertés, nous notifierons la
        CNIL dans les 72 heures conformément à l'article 33 du RGPD.
      </p>

      <h2>8. Protection des mineurs</h2>
      <p>
        L'inscription au Royaume est réservée aux personnes âgées de{" "}
        <strong>16 ans ou plus</strong>. Si tu as moins de 16 ans, tu ne peux
        pas créer de compte ni effectuer d'achat. Si nous constations qu'un
        compte a été créé par un mineur de moins de 16 ans, il sera supprimé
        sans délai.
      </p>

      <h2>9. Modification de la présente politique</h2>
      <p>
        Nous pouvons faire évoluer cette politique pour refléter des
        changements techniques, fonctionnels ou légaux. Toute modification
        substantielle te sera notifiée par e-mail ou par un bandeau visible sur
        le Site.
      </p>
    </LegalLayout>
  );
}
