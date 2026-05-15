Résumé des améliorations apportées à la page /mondes

Objectif : rendre les Mondes plus vivants et mobiles, spécialement sur mobile.

Principales modifications :
- Déplacements en temps réel : envoi immédiat (throttled 200ms) d'un heartbeat au serveur lors du déplacement.
- Polling des présences : fréquence réduite à 1.2s pour une réactivité accrue.
- Controles mobile : tap-to-move, drag-to-move, et floating pad pour faciliter la navigation tactile.
- Adaptations clavier/unifiées : moveBy utilisé pour toutes les entrées clavier.
- Décors par district : ajout d'herbe/foregrounds, lune pour l'observatoire, et blocs décoratifs thémés.
- UI mobile : réduction du texte affiché sur la carte, avatars redimensionnés, tailles et hit targets améliorées.

Notes techniques :
- Throttle client = 200ms; ajustable en fonction de la charge serveur.
- Recommandation : pour du vrai temps réel, envisager WebSocket/SSE côté backend + client.

Fichiers modifiés (principaux) :
- src/pages/Worlds.tsx (mouvements, pointer handlers, heartbeat, décor)

Tester : valider sur mobile réel / émulateur et surveiller la charge du serveur. Merge si ok.