/**
 * Gate global (PR familiers#3) qui déclenche la modal d'onboarding du
 * familier dès qu'un membre connecté n'a pas encore de familier actif.
 *
 * Monté une seule fois dans `App.tsx`. Tant que `backendMe` est `null` ou
 * que l'utilisateur a déjà un familier, ne rend rien.
 *
 * Détection du "pas de familier" :
 *  - on appelle `/users/{id}/familiers`,
 *  - si `activeFamiliarId` est `null`, on ouvre la modal,
 *  - sinon on ne fait rien (et on cache le futur résultat dans un
 *    state local pour ne pas re-fetch à chaque navigation).
 *
 * On ne fetche pas en boucle : un membre déjà onboardé ne déclenchera
 * qu'un seul GET au montage de l'app.
 */
import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { fetchUserFamiliars } from "../lib/familiarsApi";
import { FamiliarOnboardingModal } from "./FamiliarOnboardingModal";

export function FamiliarOnboardingGate() {
  const { user, initializing } = useAuth();
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [checkedFor, setCheckedFor] = useState<string | null>(null);

  useEffect(() => {
    if (initializing) return;
    if (!user?.id) {
      // Reset quand on déconnecte pour qu'à la prochaine connexion la
      // vérification reparte de zéro.
      setNeedsOnboarding(false);
      setCheckedFor(null);
      return;
    }
    if (checkedFor === user.id) return;
    let alive = true;
    fetchUserFamiliars(user.id)
      .then((collection) => {
        if (!alive) return;
        setCheckedFor(user.id ?? null);
        setNeedsOnboarding(collection.activeFamiliarId === null);
      })
      .catch(() => {
        // En cas d'erreur réseau, on n'affiche pas la modal pour éviter
        // de bloquer un utilisateur sur un faux-positif. Le check ré-essaiera
        // au prochain login.
        if (!alive) return;
        setCheckedFor(user.id ?? null);
      });
    return () => {
      alive = false;
    };
  }, [user?.id, initializing, checkedFor]);

  if (!user?.id) return null;

  return (
    <FamiliarOnboardingModal
      userId={user.id}
      open={needsOnboarding}
      onChosen={() => setNeedsOnboarding(false)}
    />
  );
}
