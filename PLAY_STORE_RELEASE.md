## Vaelyndra Play Store

Base de publication preparee pour Android :

- nom conserve : `Vaelyndra`
- icone Android et splash natif conserves
- mode camera mobile priorise pour les lives
- partage d'ecran mobile desactive proprement pour eviter les coupures
- partage d'ecran ordinateur conserve
- base `Capacitor` Android synchronisee avec le site web

### Commandes

```powershell
npm install
npm run build
npm run android:sync
npm run android:build:debug
npm run android:build:release
npm run android:build:bundle
```

### Artefacts

```text
android/app/build/outputs/apk/debug/app-debug.apk
android/app/build/outputs/apk/release/app-release.apk
android/app/build/outputs/bundle/release/app-release.aab
```

### Etat produit vise par cette passe

- live mobile Android : camera uniquement
- live desktop : camera + partage d'ecran
- aucun faux mode beta Android propose dans l'interface
- fallback propre vers camera si un ancien mode mobile de partage d'ecran etait encore stocke

### Avant envoi Play Store

- signer la release avec le keystore final
- verifier la fiche Play Store et les captures
- tester camera, chat, communautes, profils, boutique et live viewer sur un vrai telephone Android
