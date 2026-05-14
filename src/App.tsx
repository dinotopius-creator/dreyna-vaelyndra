import { lazy, Suspense } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Navbar } from "./components/Navbar";
import { OfflineBanner } from "./components/OfflineBanner";
import { Footer } from "./components/Footer";
import { MagicBackground } from "./components/MagicBackground";
import { Home } from "./pages/Home";
import { Guarded } from "./components/Guarded";
import { EasterEggs } from "./components/EasterEggs";
import { CookieBanner } from "./components/CookieBanner";
import { FloatingLiveChat } from "./components/FloatingLiveChat";
import { FamiliarOnboardingGate } from "./components/FamiliarOnboardingGate";

const BlogList = lazy(async () => {
  const mod = await import("./pages/BlogList");
  return { default: mod.BlogList };
});
const BlogArticle = lazy(async () => {
  const mod = await import("./pages/BlogArticle");
  return { default: mod.BlogArticle };
});
const Shop = lazy(async () => {
  const mod = await import("./pages/Shop");
  return { default: mod.Shop };
});
const Cart = lazy(async () => {
  const mod = await import("./pages/Cart");
  return { default: mod.Cart };
});
const LiveHub = lazy(async () => {
  const mod = await import("./pages/LiveHub");
  return { default: mod.LiveHub };
});
const Live = lazy(async () => {
  const mod = await import("./pages/Live");
  return { default: mod.Live };
});
const LiveObsChatOverlay = lazy(async () => {
  const mod = await import("./pages/LiveObsChatOverlay");
  return { default: mod.LiveObsChatOverlay };
});
const LiveDesktopChatPopout = lazy(async () => {
  const mod = await import("./pages/LiveDesktopChatPopout");
  return { default: mod.LiveDesktopChatPopout };
});
const Community = lazy(async () => {
  const mod = await import("./pages/Community");
  return { default: mod.Community };
});
const Oracle = lazy(async () => {
  const mod = await import("./pages/Oracle");
  return { default: mod.Oracle };
});
const Login = lazy(async () => {
  const mod = await import("./pages/Login");
  return { default: mod.Login };
});
const Register = lazy(async () => {
  const mod = await import("./pages/Register");
  return { default: mod.Register };
});
const Me = lazy(async () => {
  const mod = await import("./pages/Me");
  return { default: mod.Me };
});
const Compte = lazy(async () => {
  const mod = await import("./pages/Compte");
  return { default: mod.Compte };
});
const Connexions = lazy(async () => {
  const mod = await import("./pages/Connexions");
  return { default: mod.Connexions };
});
const VerifyEmail = lazy(async () => {
  const mod = await import("./pages/VerifyEmail");
  return { default: mod.VerifyEmail };
});
const ForgotPassword = lazy(async () => {
  const mod = await import("./pages/ForgotPassword");
  return { default: mod.ForgotPassword };
});
const ResetPassword = lazy(async () => {
  const mod = await import("./pages/ResetPassword");
  return { default: mod.ResetPassword };
});
const Admin = lazy(async () => {
  const mod = await import("./pages/Admin");
  return { default: mod.Admin };
});
const NotFound = lazy(async () => {
  const mod = await import("./pages/NotFound");
  return { default: mod.NotFound };
});
const MentionsLegales = lazy(async () => {
  const mod = await import("./pages/MentionsLegales");
  return { default: mod.MentionsLegales };
});
const Confidentialite = lazy(async () => {
  const mod = await import("./pages/Confidentialite");
  return { default: mod.Confidentialite };
});
const CGU = lazy(async () => {
  const mod = await import("./pages/CGU");
  return { default: mod.CGU };
});
const CGV = lazy(async () => {
  const mod = await import("./pages/CGV");
  return { default: mod.CGV };
});
const Cookies = lazy(async () => {
  const mod = await import("./pages/Cookies");
  return { default: mod.Cookies };
});
const UserProfile = lazy(async () => {
  const mod = await import("./pages/UserProfile");
  return { default: mod.UserProfile };
});
const Avatar = lazy(async () => {
  const mod = await import("./pages/Avatar");
  return { default: mod.Avatar };
});
const MyFamiliar = lazy(async () => {
  const mod = await import("./pages/MyFamiliar");
  return { default: mod.MyFamiliar };
});
const BoutiqueFamiliars = lazy(async () => {
  const mod = await import("./pages/BoutiqueFamiliars");
  return { default: mod.BoutiqueFamiliars };
});
const Messages = lazy(async () => {
  const mod = await import("./pages/Messages");
  return { default: mod.Messages };
});
const MessageThread = lazy(async () => {
  const mod = await import("./pages/MessageThread");
  return { default: mod.MessageThread };
});

function RouteFallback() {
  return (
    <div className="mx-auto flex min-h-[45vh] w-full max-w-7xl items-center justify-center px-6">
      <div className="card-royal w-full max-w-md px-6 py-10 text-center">
        <div className="mx-auto h-12 w-12 animate-pulse rounded-full border border-gold-400/40 bg-gold-500/10 shadow-glow-gold" />
        <p className="mt-4 font-display text-2xl text-gold-200">
          Le voile se lève...
        </p>
        <p className="mt-2 text-sm text-ivory/70">
          Chargement de cette page de Vaelyndra.
        </p>
      </div>
    </div>
  );
}

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.35 }}
      >
        <Suspense fallback={<RouteFallback />}>
          <Routes location={location}>
            <Route path="/" element={<Home />} />
            <Route path="/blog" element={<BlogList />} />
            <Route path="/blog/:slug" element={<BlogArticle />} />
            <Route path="/boutique" element={<Shop />} />
            <Route path="/panier" element={<Cart />} />
            <Route path="/live" element={<LiveHub />} />
            <Route
              path="/live/studio"
              element={
                <Guarded>
                  <Live />
                </Guarded>
              }
            />
            <Route path="/live/:broadcasterId" element={<Live />} />
            <Route path="/communaute" element={<Community />} />
            <Route path="/oracle" element={<Oracle />} />
            <Route path="/u/:userId" element={<UserProfile />} />
            <Route path="/connexion" element={<Login />} />
            <Route path="/inscription" element={<Register />} />
            <Route
              path="/moi"
              element={
                <Guarded>
                  <Me />
                </Guarded>
              }
            />
            <Route
              path="/compte"
              element={
                <Guarded>
                  <Compte />
                </Guarded>
              }
            />
            <Route
              path="/connexions"
              element={
                <Guarded>
                  <Connexions />
                </Guarded>
              }
            />
            <Route
              path="/avatar"
              element={
                <Guarded>
                  <Avatar />
                </Guarded>
              }
            />
            <Route
              path="/familier"
              element={
                <Guarded>
                  <MyFamiliar />
                </Guarded>
              }
            />
            <Route
              path="/familiers/boutique"
              element={
                <Guarded>
                  <BoutiqueFamiliars />
                </Guarded>
              }
            />
            <Route
              path="/messages"
              element={
                <Guarded>
                  <Messages />
                </Guarded>
              }
            />
            <Route
              path="/messages/:userId"
              element={
                <Guarded>
                  <MessageThread />
                </Guarded>
              }
            />
            <Route path="/verifier-email" element={<VerifyEmail />} />
            <Route path="/mot-de-passe-oublie" element={<ForgotPassword />} />
            <Route
              path="/reinitialiser-mot-de-passe"
              element={<ResetPassword />}
            />
            <Route
              path="/admin"
              element={
                <Guarded allowBackendRoles={["admin", "animator"]}>
                  <Admin />
                </Guarded>
              }
            />
            <Route path="/mentions-legales" element={<MentionsLegales />} />
            <Route path="/confidentialite" element={<Confidentialite />} />
            <Route path="/cgu" element={<CGU />} />
            <Route path="/cgv" element={<CGV />} />
            <Route path="/cookies" element={<Cookies />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </motion.div>
    </AnimatePresence>
  );
}

function App() {
  const location = useLocation();
  if (location.pathname.startsWith("/live/overlay/chat/")) {
    return (
      <Routes>
        <Route
          path="/live/overlay/chat/:broadcasterId"
          element={<LiveObsChatOverlay />}
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
    );
  }

  if (location.pathname.startsWith("/live/popout/chat/")) {
    return (
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route
            path="/live/popout/chat/:broadcasterId"
            element={<LiveDesktopChatPopout />}
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col">
      <MagicBackground />
      <EasterEggs />
      <Navbar />
      <OfflineBanner />
      <main className="flex-1">
        <AnimatedRoutes />
      </main>
      <Footer />
      <CookieBanner />
      <FloatingLiveChat />
      <FamiliarOnboardingGate />
    </div>
  );
}

export default App;
