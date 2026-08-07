R├®sum├® des am├®liorations apport├®es ├á la page /mondes

Objectif : rendre les Mondes plus vivants et mobiles, sp├®cialement sur mobile.

Principales modifications :
- D├®placements en temps r├®el : envoi imm├®diat (throttled 200ms) d'un heartbeat au serveur lors du d├®placement.
- Polling des pr├®sences : fr├®quence r├®duite ├á 1.2s pour une r├®activit├® accrue.
- Controles mobile : tap-to-move, drag-to-move, et floating pad pour faciliter la navigation tactile.
- Adaptations clavier/unifi├®es : moveBy utilis├® pour toutes les entr├®es clavier.
- D├®cors par district : ajout d'herbe/foregrounds, lune pour l'observatoire, et blocs d├®coratifs th├®m├®s.
- UI mobile : r├®duction du texte affich├® sur la carte, avatars redimensionn├®s, tailles et hit targets am├®lior├®es.

Notes techniques :
- Throttle client = 200ms; ajustable en fonction de la charge serveur.
- Recommandation : pour du vrai temps r├®el, envisager WebSocket/SSE c├┤t├® backend + client.

Fichiers modifi├®s (principaux) :
- src/pages/Worlds.tsx (mouvements, pointer handlers, heartbeat, d├®cor)

Tester : valider sur mobile r├®el / ├®mulateur et surveiller la charge du serveur. Merge si ok.
