import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import type { ReactNode } from "react";

export function Guarded({
  children,
  queenOnly = false,
}: {
  children: ReactNode;
  queenOnly?: boolean;
}) {
  const { user, isQueen } = useAuth();
  const location = useLocation();
  if (!user)
    return <Navigate to="/connexion" replace state={{ from: location.pathname }} />;
  if (queenOnly && !isQueen)
    return <Navigate to="/" replace />;
  return <>{children}</>;
}
