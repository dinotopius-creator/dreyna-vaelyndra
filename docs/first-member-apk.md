# Première APK membres

Cette PR prépare la première diffusion Android de Vaelyndra Créature.

## Prérequis

- Node.js et npm installés.
- Dépendances installées avec `npm install`.
- Android Studio ou Android SDK disponible.
- JDK compatible Gradle Android.
- Variables d'environnement Android configurées si nécessaire (`ANDROID_HOME` / `ANDROID_SDK_ROOT`).

## Générer une APK de test installable

```powershell
npm run android:build:debug
```

Sur cette machine, la commande validée est :

```powershell
$env:JAVA_HOME='C:\Program Files\Java\jdk-21.0.10'; $env:ANDROID_HOME='C:\Users\Kraam\Android\Sdk'; $env:ANDROID_SDK_ROOT='C:\Users\Kraam\Android\Sdk'; $env:Path="$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"; npm run android:build:debug
```

APK générée :

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Cette APK debug peut être envoyée à un petit groupe de testeurs internes Android qui autorisent l'installation depuis une source externe.

## Générer une APK release

```powershell
npm run android:build:release
```

APK générée :

```text
android/app/build/outputs/apk/release/app-release-unsigned.apk
```

Pour une diffusion plus large, la release doit être signée avec un keystore Android avant distribution.

## Assets APK

Les icônes Android, les icônes web et le splash screen sont générés par :

```powershell
py -c "exec(open('scripts/generate_creature_assets.py', encoding='utf-8').read())"
```

Le script produit les variantes `mipmap-*`, `app-icon-192.png`, `app-icon-512.png`, `apple-touch-icon.png` et `splash.png`.
