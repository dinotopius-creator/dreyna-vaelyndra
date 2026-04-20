"""Envoi d'emails transactionnels via Resend.

En prod, la clé API est chargée depuis `RESEND_API_KEY` (fly secrets).
En dev, si la clé n'est pas définie, les emails sont loggés dans la console
au lieu d'être envoyés (utile pour debug sans polluer les boîtes).

Le domaine d'envoi est configurable via `VAELYNDRA_EMAIL_FROM` (par défaut
`Vaelyndra <onboarding@resend.dev>` — domaine de test de Resend qui marche
sans vérification DNS). Quand le domaine `vaelyndra.com` sera vérifié chez
Resend, on passera la var à `noreply@vaelyndra.com`.
"""
from __future__ import annotations

import logging
import os
from typing import Optional


logger = logging.getLogger("vaelyndra.emailer")


def _from_address() -> str:
    return os.environ.get(
        "VAELYNDRA_EMAIL_FROM",
        "Vaelyndra <onboarding@resend.dev>",
    )


def _public_site_url() -> str:
    return os.environ.get("VAELYNDRA_PUBLIC_URL", "https://www.vaelyndra.com")


def _send_via_resend(to: str, subject: str, html: str, text: str) -> bool:
    """Envoie un email via l'API Resend. Retourne True si OK."""
    api_key = os.environ.get("RESEND_API_KEY")
    if not api_key:
        logger.warning(
            "RESEND_API_KEY absent — email NON envoyé. "
            "Destinataire=%s, sujet=%r.\nHTML:\n%s",
            to,
            subject,
            html,
        )
        return False

    try:
        import resend

        resend.api_key = api_key
        resend.Emails.send(
            {
                "from": _from_address(),
                "to": [to],
                "subject": subject,
                "html": html,
                "text": text,
            }
        )
        logger.info("Email envoyé à %s (sujet=%r)", to, subject)
        return True
    except Exception as exc:  # pragma: no cover (réseau / API tiers)
        logger.exception("Échec envoi email via Resend : %s", exc)
        return False


# --- Templates ------------------------------------------------------------

_HTML_WRAPPER = """\
<!DOCTYPE html>
<html lang="fr">
  <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:#0f0b1e;color:#e9e4ff;margin:0;padding:32px;">
    <div style="max-width:560px;margin:0 auto;background:#1a1430;border:1px solid #3d2d6b;border-radius:16px;padding:32px;">
      <div style="text-align:center;margin-bottom:24px;">
        <span style="font-size:32px;">👑</span>
        <h1 style="margin:8px 0 0;color:#e9e4ff;font-size:22px;">Vaelyndra</h1>
      </div>
      {content}
      <hr style="border:none;border-top:1px solid #3d2d6b;margin:32px 0;" />
      <p style="font-size:12px;color:#8878b8;text-align:center;margin:0;">
        Cet email vous a été envoyé par la plateforme Vaelyndra.<br/>
        Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.
      </p>
    </div>
  </body>
</html>
"""


def send_verification_email(to: str, username: str, token: str) -> bool:
    url = f"{_public_site_url()}/verifier-email?token={token}"
    content = f"""
    <h2 style="color:#e9e4ff;font-size:18px;margin:0 0 16px;">Bienvenue, {username} ✨</h2>
    <p style="color:#c4b6e8;line-height:1.6;">
      Pour finaliser la création de ton compte sur Vaelyndra, confirme ton
      adresse email en cliquant sur le bouton ci-dessous (valide 24 h).
    </p>
    <p style="text-align:center;margin:32px 0;">
      <a href="{url}" style="background:linear-gradient(135deg,#8b5cf6,#d946ef);color:#fff;padding:14px 32px;border-radius:12px;text-decoration:none;font-weight:600;display:inline-block;">
        Valider mon email
      </a>
    </p>
    <p style="color:#8878b8;font-size:13px;line-height:1.6;">
      Si le bouton ne fonctionne pas, copie-colle ce lien dans ton navigateur :<br/>
      <span style="color:#c4b6e8;word-break:break-all;">{url}</span>
    </p>
    """
    text = (
        f"Bienvenue sur Vaelyndra, {username} !\n\n"
        f"Confirme ton email (valide 24 h) : {url}\n\n"
        "Si tu n'es pas à l'origine de cette demande, ignore ce message."
    )
    return _send_via_resend(
        to,
        "Confirme ton email — Vaelyndra 👑",
        _HTML_WRAPPER.format(content=content),
        text,
    )


def send_password_reset_email(to: str, username: str, token: str) -> bool:
    url = f"{_public_site_url()}/reinitialiser-mot-de-passe?token={token}"
    content = f"""
    <h2 style="color:#e9e4ff;font-size:18px;margin:0 0 16px;">Réinitialisation — {username}</h2>
    <p style="color:#c4b6e8;line-height:1.6;">
      Tu as demandé à réinitialiser ton mot de passe Vaelyndra. Clique sur
      le bouton ci-dessous (valide 1 h). Si ce n'est pas toi, tu peux ignorer
      ce message : ton mot de passe reste inchangé.
    </p>
    <p style="text-align:center;margin:32px 0;">
      <a href="{url}" style="background:linear-gradient(135deg,#8b5cf6,#d946ef);color:#fff;padding:14px 32px;border-radius:12px;text-decoration:none;font-weight:600;display:inline-block;">
        Choisir un nouveau mot de passe
      </a>
    </p>
    <p style="color:#8878b8;font-size:13px;line-height:1.6;">
      Lien direct : <span style="color:#c4b6e8;word-break:break-all;">{url}</span>
    </p>
    """
    text = (
        f"Réinitialisation de ton mot de passe Vaelyndra ({username}).\n\n"
        f"Lien valide 1 h : {url}\n\n"
        "Si ce n'est pas toi, ignore ce message."
    )
    return _send_via_resend(
        to,
        "Réinitialise ton mot de passe — Vaelyndra",
        _HTML_WRAPPER.format(content=content),
        text,
    )


def send_email_change_notice(to: str, username: str, new_email: str) -> bool:
    """Envoyé à l'ANCIEN email quand un changement est demandé, pour
    permettre de révoquer la demande si c'est frauduleux."""
    url = f"{_public_site_url()}/compte?revoke=email"
    content = f"""
    <h2 style="color:#e9e4ff;font-size:18px;margin:0 0 16px;">Changement d'email demandé</h2>
    <p style="color:#c4b6e8;line-height:1.6;">
      {username}, une demande de changement d'email a été faite sur ton
      compte Vaelyndra. La nouvelle adresse sera :
    </p>
    <p style="text-align:center;background:#241a44;padding:12px;border-radius:8px;color:#e9e4ff;font-weight:600;">
      {new_email}
    </p>
    <p style="color:#c4b6e8;line-height:1.6;">
      Si tu es à l'origine de cette demande, clique sur le lien envoyé à ta
      nouvelle adresse pour confirmer.<br/>
      <strong>Si ce n'est pas toi, change ton mot de passe immédiatement :</strong>
    </p>
    <p style="text-align:center;margin:24px 0;">
      <a href="{url}" style="background:#dc2626;color:#fff;padding:12px 28px;border-radius:12px;text-decoration:none;font-weight:600;display:inline-block;">
        Sécuriser mon compte
      </a>
    </p>
    """
    text = (
        f"Demande de changement d'email vers {new_email} sur ton compte Vaelyndra.\n\n"
        f"Si ce n'est pas toi : {url}"
    )
    return _send_via_resend(
        to,
        "Changement d'email demandé — Vaelyndra",
        _HTML_WRAPPER.format(content=content),
        text,
    )


def send_security_alert(to: str, username: str, event: str, ip: Optional[str]) -> bool:
    """Alerte sur un événement sensible : changement de mot de passe,
    activation 2FA, nouvelle session depuis IP inhabituelle, etc."""
    ip_line = f"<p style='color:#8878b8;font-size:13px;'>IP : {ip}</p>" if ip else ""
    content = f"""
    <h2 style="color:#e9e4ff;font-size:18px;margin:0 0 16px;">Activité de sécurité</h2>
    <p style="color:#c4b6e8;line-height:1.6;">
      {username}, un événement sensible a eu lieu sur ton compte Vaelyndra :
    </p>
    <p style="text-align:center;background:#241a44;padding:12px;border-radius:8px;color:#e9e4ff;font-weight:600;">
      {event}
    </p>
    {ip_line}
    <p style="color:#c4b6e8;line-height:1.6;">
      Si ce n'est pas toi, <strong>change immédiatement ton mot de passe</strong>
      et révoque toutes les sessions depuis <a href="{_public_site_url()}/compte" style="color:#d946ef;">ton espace</a>.
    </p>
    """
    text = (
        f"Activité de sécurité sur ton compte Vaelyndra ({username}) : {event}\n"
        f"{'IP: ' + ip if ip else ''}\n\n"
        f"Si ce n'est pas toi : {_public_site_url()}/compte"
    )
    return _send_via_resend(
        to,
        f"Activité de sécurité — {event}",
        _HTML_WRAPPER.format(content=content),
        text,
    )
