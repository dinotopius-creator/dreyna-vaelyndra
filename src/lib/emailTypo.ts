/**
 * Détection de fautes de frappe dans les domaines email courants.
 *
 * Mirroir frontend de `backend/app/auth/email_typo.py` — les deux listes
 * doivent rester synchronisées. Le backend reste l'autorité (rejette
 * définitivement les inscriptions avec un domaine corrigeable), le
 * frontend ne fait que rattraper l'utilisateur **avant** la requête
 * pour offrir un feedback instantané et une suggestion cliquable.
 */

const KNOWN_DOMAINS: ReadonlySet<string> = new Set([
  // Internationaux
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "outlook.fr",
  "hotmail.com",
  "hotmail.fr",
  "hotmail.co.uk",
  "live.com",
  "live.fr",
  "msn.com",
  "yahoo.com",
  "yahoo.fr",
  "yahoo.co.uk",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "protonmail.com",
  "proton.me",
  "pm.me",
  "tutanota.com",
  "tuta.io",
  "zoho.com",
  "fastmail.com",
  "mail.com",
  "gmx.com",
  "gmx.fr",
  // FAI français
  "free.fr",
  "orange.fr",
  "wanadoo.fr",
  "sfr.fr",
  "neuf.fr",
  "laposte.net",
  "bbox.fr",
  "numericable.fr",
  "club-internet.fr",
  "aliceadsl.fr",
  // Belgique / Suisse / Canada
  "skynet.be",
  "telenet.be",
  "bluewin.ch",
  "videotron.ca",
  "sympatico.ca",
]);

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  if (a.length > b.length) {
    [a, b] = [b, a];
  }
  let prev = new Array<number>(a.length + 1);
  for (let i = 0; i <= a.length; i++) prev[i] = i;
  for (let j = 1; j <= b.length; j++) {
    const curr = new Array<number>(a.length + 1);
    curr[0] = j;
    const cb = b.charCodeAt(j - 1);
    for (let i = 1; i <= a.length; i++) {
      const cost = a.charCodeAt(i - 1) === cb ? 0 : 1;
      curr[i] = Math.min(curr[i - 1] + 1, prev[i] + 1, prev[i - 1] + cost);
    }
    prev = curr;
  }
  return prev[a.length];
}

/**
 * Renvoie un domaine corrigé si `domain` est très proche d'un domaine
 * email populaire connu (distance Levenshtein ≤ 2, candidat unique).
 * Sinon renvoie `null`.
 */
export function suggestDomainCorrection(domain: string): string | null {
  const d = domain.trim().toLowerCase();
  if (!d || !d.includes(".")) return null;
  if (KNOWN_DOMAINS.has(d)) return null;

  let best: string | null = null;
  let bestDistance = 3;
  let tied = false;
  for (const candidate of KNOWN_DOMAINS) {
    if (Math.abs(candidate.length - d.length) > 2) continue;
    const dist = levenshtein(d, candidate);
    if (dist < bestDistance) {
      bestDistance = dist;
      best = candidate;
      tied = false;
    } else if (dist === bestDistance) {
      tied = true;
    }
  }
  if (tied || best === null || bestDistance > 2) return null;
  return best;
}

/**
 * Si l'email entier (`local@domain`) contient une faute de frappe sur
 * le domaine, renvoie l'email corrigé. Sinon `null`.
 */
export function suggestEmailCorrection(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 1 || at === email.length - 1) return null;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const suggestion = suggestDomainCorrection(domain);
  return suggestion ? `${local}@${suggestion}` : null;
}
