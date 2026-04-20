# 👑 Vaelyndra

**Mini-réseau social féerique** — plateforme communautaire où streamers, créateurs et âmes connectées peuvent percer, poster, streamer et gravir les grades de la cour.

> *"Par la Lumière d'Elennor, que le royaume s'éveille."*

🌐 **Site en ligne** : https://dist-tsbfgcct.devinapps.com

---

## ✨ Fonctionnalités

- 🏰 **Accueil immersif** — hero elfique, particules magiques, aurore dorée
- 📜 **Blog / Chroniques** — catégories Lore / Lifestyle / Annonces / Communauté, likes, commentaires
- 🛍️ **Boutique royale** — merch, tenues numériques, accès VIP, panier + checkout simulé
- 📡 **Lives** — direct simulé avec chat, cœurs animés, viewers en temps réel, archives
- 👥 **Communauté** — feed social, posts, images, réactions emojis, modération
- 👑 **Profil Dreyna** — bio royale, stats, galerie, badges & distinctions
- 🔐 **Authentification** — inscription/connexion persistée en localStorage
- ⚙️ **Dashboard admin (Salle du Trône)** — publier des chroniques, gérer la boutique, archiver des lives, modérer la communauté, lancer / terminer un direct
- 🎆 **Effets immersifs** — particules tsparticles, glows violet/doré, animations Framer Motion
- 🔮 **Easter egg** — tape le code Konami (↑↑↓↓←→←→BA) n'importe où sur le site

---

## 🧙 Comptes de démo

| Rôle | Email | Mot de passe | Accès |
| --- | --- | --- | --- |
| 👑 Reine (admin) | `dreyna@vaelyndra.realm` | `vaelyndra` | Salle du Trône |
| ✦ Elfe | `lyria@vaelyndra.realm` | `lumiere` | Cour |
| ✦ Elfe | `caelum@vaelyndra.realm` | `lumiere` | Cour |

Tu peux aussi créer ton propre compte via la page "Rejoindre la cour".

---

## 🛠️ Stack

- **Vite** + **React 19** + **TypeScript**
- **Tailwind CSS** (design system elfique custom : palette night/royal/gold/celeste/ivory)
- **Framer Motion** (animations)
- **@tsparticles** (particules magiques)
- **React Router** v7
- **Lucide** (icônes)
- État : **React Context** (Auth / Store / Toasts), persistance `localStorage`

> Pas de backend réel : toutes les données (articles, produits, commandes, messages, sessions) sont simulées et persistées côté navigateur. Prêt à brancher plus tard sur un vrai backend (Firebase / Supabase / Node + Stripe).

---

## 🚀 Installation locale

```bash
git clone https://github.com/dinotopius-creator/dreyna-vaelyndra.git
cd dreyna-vaelyndra
npm install
npm run dev
```

Le site sera disponible sur http://localhost:5173.

### Scripts

- `npm run dev` — serveur de développement
- `npm run build` — build de production (`dist/`)
- `npm run preview` — prévisualise le build
- `npm run lint` — ESLint

---

## 📂 Structure

```
src/
├── components/   # Navbar, Footer, MagicBackground, MagicParticles, EasterEggs, etc.
├── contexts/     # AuthContext, StoreContext, ToastContext
├── data/         # mock.ts (profil Dreyna, articles, produits, lives, fans, badges)
├── lib/          # helpers (format, slugify, markdown, id)
├── pages/        # Home, BlogList, BlogArticle, Shop, Cart, Live, Community,
│                 # DreynaProfile, Login, Register, Me, Admin, NotFound
├── App.tsx
├── main.tsx
├── index.css     # design system elfique (btn-royal, card-royal, heading-gold...)
└── types.ts
```

---

## 🔮 Prochaines étapes possibles

- Brancher **Stripe** (ou Lemon Squeezy) pour un vrai paiement
- Backend **Supabase** / **Firebase** pour persister users, articles, orders en cloud
- Intégrer **Twitch/YouTube embed** pour les vrais lives
- Uploads d'images depuis le dashboard
- Notifications push quand Dreyna lance un live

---

© Royaume de Vaelyndra
