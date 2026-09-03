"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

const PUBLIC_ROUTES = ["/login", "/register"];

const ROLE_HOME = {
  anggota: "/anggota/dashboard",
  pembina: "/pembina/dashboard",
};

function matchRoute(pathname, route) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

export default function Authenticator({ children }) {
  const router = useRouter();
  const pathname = usePathname();

  const {
    user,
    role,
    accessLoading,
  } = useAuth();

  const currentPath = pathname || "/";
  const normalizedRole = String(role || "").trim().toLowerCase();

  const isRootRoute = currentPath === "/";

  const isPublicRoute = PUBLIC_ROUTES.some((route) =>
    matchRoute(currentPath, route)
  );

  const isPendaftaranRoute = matchRoute(
    currentPath,
    "/pendaftaran"
  );

  const isAnggotaRoute = matchRoute(
    currentPath,
    "/anggota/dashboard"
  );

  const isPembinaRoute = matchRoute(
    currentPath,
    "/pembina/dashboard"
  );

  const hasValidRole =
    normalizedRole === "anggota" ||
    normalizedRole === "pembina";

  let redirectTo = null;

  if (!accessLoading) {
    /*
     * Belum login.
     * Hanya boleh membuka login dan register.
     */
    if (!user && !isPublicRoute) {
      redirectTo = "/login";
    }

    /*
     * Sudah login, tetapi belum mendapatkan role.
     * Berlaku untuk:
     * - belum mengisi formulir
     * - sedang menunggu review
     * - pendaftaran ditolak
     */
    if (
      user &&
      !hasValidRole &&
      !isPendaftaranRoute
    ) {
      redirectTo = "/pendaftaran";
    }

    /*
     * Anggota.
     */
    if (user && normalizedRole === "anggota") {
      const mustGoToAnggotaDashboard =
        isRootRoute ||
        isPublicRoute ||
        isPendaftaranRoute ||
        isPembinaRoute;

      if (mustGoToAnggotaDashboard) {
        redirectTo = ROLE_HOME.anggota;
      }
    }

    /*
     * Pembina.
     */
    if (user && normalizedRole === "pembina") {
      const mustGoToPembinaDashboard =
        isRootRoute ||
        isPublicRoute ||
        isPendaftaranRoute ||
        isAnggotaRoute;

      if (mustGoToPembinaDashboard) {
        redirectTo = ROLE_HOME.pembina;
      }
    }
  }

  useEffect(() => {
    if (redirectTo && redirectTo !== currentPath) {
      router.replace(redirectTo);
    }
  }, [redirectTo, currentPath, router]);

  if (accessLoading || redirectTo) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface">
        <div className="rounded-2xl border border-border bg-card px-6 py-4 text-sm text-text-muted shadow-sm">
          Memeriksa akses...
        </div>
      </main>
    );
  }

  return <>{children}</>;
}