import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import type { ReactNode } from "react";

export function Guarded({
  children,
  queenOnly = false,
  allowBackendRoles,
}: {
  children: ReactNode;
  queenOnly?: boolean;
  allowBackendRoles?: string[];
}) {
  const { user, isQueen, backendMe, initializing } = useAuth();
  const location = useLocation();
  if (!user)
    return <Navigate to="/connexion" replace state={{ from: location.pathname }} />;
  if (allowBackendRoles) {
    if (initializing) return null;
    if (!backendMe || !allowBackendRoles.includes(backendMe.role))
      return <Navigate to="/" replace />;
  }
  if (queenOnly && !isQueen)
    return <Navigate to="/" replace />;
  return <>{children}</>;
}
