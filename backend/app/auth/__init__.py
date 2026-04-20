"""Module d'authentification serveur pour Vaelyndra.

Fonctionnalités :
- Inscription avec vérification email (via Resend)
- Connexion (argon2id + JWT en cookie HttpOnly)
- Changement mot de passe / email
- Reset mot de passe par email
- Sessions multi-device + révocation
- 2FA TOTP (Google Authenticator compatible)
- Rate limiting contre la force brute
- Historique des connexions
"""
