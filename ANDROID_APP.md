# Vaelyndra Android

Cette app Android est une enveloppe Capacitor du site React/Vite Vaelyndra.

## Construire l'APK debug

```powershell
npm run android:build:debug
```

APK généré :

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Installer sur un téléphone Android

Option simple :

1. Transférer `app-debug.apk` sur le téléphone.
2. Ouvrir le fichier depuis le téléphone.
3. Autoriser l'installation depuis cette source si Android le demande.
4. Lancer Vaelyndra.

Option développeur avec câble USB :

```powershell
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

## Après une modification du site

```powershell
npm run android:sync
```

Cette commande rebuild le site puis copie `dist/` dans le projet Android.

## Limite actuelle

Cette première version Android ouvre Vaelyndra comme une vraie app et prépare les permissions caméra/micro. Le partage d'écran mobile natif Roblox/jeux demandera l'étape suivante : un module Android `MediaProjection` branché au live WebRTC.
