import { Route, Routes, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Navbar } from "./components/Navbar";
import { OfflineBanner } from "./components/OfflineBanner";
import { Footer } from "./components/Footer";
import { MagicBackground } from "./components/MagicBackground";
import { Home } from "./pages/Home";
import { BlogList } from "./pages/BlogList";
import { BlogArticle } from "./pages/BlogArticle";
import { Shop } from "./pages/Shop";
import { Cart } from "./pages/Cart";
import { LiveHub } from "./pages/LiveHub";
import { Live } from "./pages/Live";
import { Community } from "./pages/Community";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { Me } from "./pages/Me";
import { Compte } from "./pages/Compte";
import { Connexions } from "./pages/Connexions";
import { VerifyEmail } from "./pages/VerifyEmail";
import { ForgotPassword } from "./pages/ForgotPassword";
import { ResetPassword } from "./pages/ResetPassword";
import { Admin } from "./pages/Admin";
import { NotFound } from "./pages/NotFound";
import { MentionsLegales } from "./pages/MentionsLegales";
import { Confidentialite } from "./pages/Confidentialite";
import { CGU } from "./pages/CGU";
import { CGV } from "./pages/CGV";
import { Cookies } from "./pages/Cookies";
import { UserProfile } from "./pages/UserProfile";
import { Avatar } from "./pages/Avatar";
import { Messages } from "./pages/Messages";
import { MessageThread } from "./pages/MessageThread";
import { Guarded } from "./components/Guarded";
import { EasterEggs } from "./components/EasterEggs";
import { CookieBanner } from "./components/CookieBanner";
import { FloatingLiveChat } from "./components/FloatingLiveChat";

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
        <Routes location={location}>
          <Route path="/" element={<Home />} />
          <Route path="/blog" element={<BlogList />} />
          <Route path="/blog/:slug" element={<BlogArticle />} />
          <Route path="/boutique" element={<Shop />} />
          <Route path="/panier" element={<Cart />} />
          <Route path="/live" element={<LiveHub />} />
          <Route path="/live/studio" element={<Guarded><Live /></Guarded>} />
          <Route path="/live/:broadcasterId" element={<Live />} />
          <Route path="/communaute" element={<Community />} />
          <Route path="/u/:userId" element={<UserProfile />} />
          <Route path="/connexion" element={<Login />} />
          <Route path="/inscription" element={<Register />} />
          <Route path="/moi" element={<Guarded><Me /></Guarded>} />
          <Route path="/compte" element={<Guarded><Compte /></Guarded>} />
          <Route path="/connexions" element={<Guarded><Connexions /></Guarded>} />
          <Route path="/avatar" element={<Guarded><Avatar /></Guarded>} />
          <Route path="/messages" element={<Guarded><Messages /></Guarded>} />
          <Route path="/messages/:userId" element={<Guarded><MessageThread /></Guarded>} />
          <Route path="/verifier-email" element={<VerifyEmail />} />
          <Route path="/mot-de-passe-oublie" element={<ForgotPassword />} />
          <Route path="/reinitialiser-mot-de-passe" element={<ResetPassword />} />
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
      </motion.div>
    </AnimatePresence>
  );
}

function App() {
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
    </div>
  );
}

export default App;
