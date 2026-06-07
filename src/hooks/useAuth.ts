/**
 * Re-Export ohne JSX — alle Komponenten importieren weiter aus hooks/useAuth.
 * Die Implementierung liegt in context/AuthContext.tsx (.tsx wegen JSX).
 */
export { AuthProvider, useAuth, type UseAuthReturn } from "../context/AuthContext.tsx";
