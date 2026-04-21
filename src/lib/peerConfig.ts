/**
 * Configuration commune pour toutes les instances PeerJS (broadcaster,
 * viewer, mesh audio).
 *
 * Pourquoi ce fichier existe :
 *
 * Par défaut, `new Peer()` utilise uniquement les serveurs STUN publics
 * de Google pour la négociation ICE. Ça suffit pour deux utilisateurs
 * sur le même réseau WiFi ou derrière un NAT standard "full cone" :
 * chaque client découvre son IP publique via STUN, puis les pairs
 * s'échangent directement les paquets RTP.
 *
 * **MAIS** : la majorité des réseaux mobiles (4G/5G/LTE, opérateurs
 * français et internationaux) et certains WiFi d'entreprise utilisent
 * un NAT **symétrique** ou un CG-NAT qui réécrit le port source pour
 * chaque destination. Dans ce cas STUN ne suffit pas : le handshake
 * ICE échoue et le viewer reste bloqué sur "Connexion au flux de la
 * Cour…" sans jamais recevoir le MediaStream, même si le broadcaster
 * est bien en ligne. Ce symptôme exact a été signalé par Alexandre
 * (broadcaster PC, viewers téléphone/tablette bloqués).
 *
 * Solution : ajouter des serveurs TURN qui servent de relais de
 * secours. Quand le P2P direct échoue, les pairs passent par le TURN
 * (transport via TCP 443 TLS pour traverser même les firewalls
 * restrictifs).
 *
 * On utilise les serveurs TURN publics gratuits OpenRelay (Metered.ca)
 * par défaut, avec la possibilité de surcharger par variables
 * d'environnement Vite pour passer à un TURN dédié (Twilio, Xirsys,
 * Coturn auto-hébergé…) en production si le trafic le justifie.
 *
 * Comme `config.iceServers` passé à `new Peer(id, { config })` est
 * propagé par PeerJS à chaque `RTCPeerConnection` qu'il crée en
 * interne (host/viewer vidéo et mesh audio), il suffit de l'injecter
 * au moment de la construction du `Peer` : pas besoin de le
 * redupliquer sur chaque `.call()` / `.answer()`.
 */
import type { PeerOptions } from "peerjs";

type IceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

function readEnv(name: string): string | undefined {
  try {
    const env = (import.meta as { env?: Record<string, string | undefined> })
      .env;
    const v = env?.[name];
    return typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Liste des `iceServers` utilisée par toutes les `RTCPeerConnection`
 * créées en interne par PeerJS. On combine :
 *  - les STUN Google (découverte IP publique, rapide et gratuit) ;
 *  - les TURN OpenRelay (relais UDP/TCP de secours, gratuit — voir
 *    https://www.metered.ca/tools/openrelay/ pour les quotas) ;
 *  - optionnellement, un TURN custom via `VITE_TURN_URL`
 *    (+ `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL`) pour pouvoir
 *    basculer vers un TURN dédié sans redéployer le frontend.
 */
export function getIceServers(): IceServer[] {
  const servers: IceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    // OpenRelay public (credentials volontairement hardcodées par
    // Metered : c'est le pattern d'usage documenté pour leur free
    // tier, ce ne sont pas de vrais secrets).
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    // TCP 443 : crucial pour les réseaux d'entreprise / hotspots qui
    // bloquent tout sauf HTTPS.
    {
      urls: "turn:openrelay.metered.ca:443?transport=tcp",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ];

  const customUrl = readEnv("VITE_TURN_URL");
  if (customUrl) {
    servers.push({
      urls: customUrl,
      username: readEnv("VITE_TURN_USERNAME"),
      credential: readEnv("VITE_TURN_CREDENTIAL"),
    });
  }

  return servers;
}

/**
 * Options PeerJS communes à passer à `new Peer(id, getPeerOptions())`.
 * Centralise aussi le niveau de debug et laisse la place à une
 * surcharge de host/port du broker si on quitte `free.peerjs.com` à
 * l'avenir (variables `VITE_PEERJS_HOST` / `VITE_PEERJS_PORT` /
 * `VITE_PEERJS_PATH` / `VITE_PEERJS_SECURE`).
 */
export function getPeerOptions(): PeerOptions {
  const opts: PeerOptions = {
    debug: 1,
    config: {
      iceServers: getIceServers(),
      // "all" autorise le fallback sur les relais TURN.
      iceTransportPolicy: "all",
    },
  };
  const host = readEnv("VITE_PEERJS_HOST");
  if (host) {
    opts.host = host;
    const port = readEnv("VITE_PEERJS_PORT");
    if (port) opts.port = Number.parseInt(port, 10);
    const path = readEnv("VITE_PEERJS_PATH");
    if (path) opts.path = path;
    const secure = readEnv("VITE_PEERJS_SECURE");
    if (secure) opts.secure = secure === "true" || secure === "1";
  }
  return opts;
}
