# Vaelyndra Android

Vaelyndra dispose maintenant d'une base APK Android `Capacitor` plus complete :

- shell natif Android conserve ;
- configuration mobile-first renforcee ;
- meta web app + manifest ajoutes ;
- ajustement clavier natif pour les formulaires et le chat ;
- status bar harmonisee avec le theme ;
- garde-fou wake lock pour eviter que l'ecran s'endorme pendant un live actif ;
- base propre pour continuer vers une app Android plus premium sans casser le site web.

## Commandes utiles

```powershell
npm install
npm run android:sync
npm run android:open
npm run android:run
npm run android:build:debug
npm run android:build:release
```

## APK genere

```text
android/app/build/outputs/apk/debug/app-debug.apk
android/app/build/outputs/apk/release/app-release.apk
```

## Ce que couvre cette PR

Cette etape ne recrit pas Vaelyndra en natif. Elle transforme la base existante en une vraie fondation mobile exploitable :

1. l'app Android embarque la version web build dans `dist/` ;
2. la navigation se comporte davantage comme une app sur Android ;
3. les ecrans tiennent mieux compte des safe areas et du clavier ;
4. le live mobile tient mieux la session allumee pendant un direct.

## Limites volontaires

- pas de service worker offline agressif : evite de casser les lives et les donnees fraiches ;
- pas de copie de design externe proprietaire ;
- le partage d'ecran mobile natif reste branche sur le module Android deja present ;
- la publication Play Store, la signature release et les assets finaux d'icones/splash restent des etapes separees.

## Suite logique

- finaliser les icones et splash natifs ;
- ajouter un packaging release signe ;
- continuer l'optimisation mobile page par page ;
- pousser plus loin les interactions live natives Android si besoin.
