// Navbar.jsx
import { useState, useCallback } from "react";
import Auth from "./Auth";
import AuthModal from "./AuthModal";
import { useAgent } from "../context/AgentContext"; // adjust path as needed

// `showAuth = false` on pages with a Sidebar -- Auth lives at the bottom of
// Sidebar there instead, so it isn't shown in both places.
export default function Navbar({ showAuth = true }) {
  const { verifySession } = useAgent();
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState("login");

  const openLogin = useCallback(() => {
    setModalTab("login");
    setModalOpen(true);
  }, []);

  const openRegister = useCallback(() => {
    setModalTab("register");
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => setModalOpen(false), []);

  const handleAuthSuccess = useCallback(async () => {
    await verifySession();
  }, [verifySession]);

  const handleLogout = useCallback(() => {}, []);

  if (!showAuth) return null;

  return (
    <>
      {/* Sidebar owns navigation (desktop rail + mobile drawer). Only the
          account control remains here, on pages without a Sidebar. Plain
          <div>, not <nav> -- there are no navigation links in it. */}
      <div className="relative z-20 flex items-center justify-end px-4 sm:px-6 pt-4 font-sans">
        <Auth
          onLoginClick={openLogin}
          onRegisterClick={openRegister}
          onLogout={handleLogout}
        />
      </div>

      <AuthModal
        isOpen={modalOpen}
        defaultTab={modalTab}
        onClose={closeModal}
        onSuccess={handleAuthSuccess}
      />
    </>
  );
}