"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import AppIcon from "@/components/global/AppIcon";
import { useAuth } from "@/context/AuthContext";

function isActiveRoute(pathname, href) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AppSidebar({
  open,
  onClose,
  menuItems,
  profile,
}) {
  const pathname = usePathname();
  const { logout, authLoading } = useAuth();
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  useEffect(() => {
    setProfileMenuOpen(false);
  }, [pathname]);

  const handleLogout = async () => {
    setProfileMenuOpen(false);
    try {
      await logout();
      onClose?.();
    } catch {
      // ignored; auth context already exposes the error state.
    }
  };

  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Tutup sidebar"
          onClick={onClose}
          className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden"
        />
      )}

      <aside
        className={`
          fixed inset-y-0 left-0 z-50
          flex w-[260px] flex-col
          border-r border-border
          bg-card py-6
          transition-transform duration-200
          lg:translate-x-0
          ${open ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        <div className="mb-10 flex items-center justify-between px-6">
          <Link
            href={menuItems?.[0]?.href || "/"}
            onClick={onClose}
            className="flex items-center gap-3"
          >
            <div className="h-10 w-10 overflow-hidden rounded-xl border border-border bg-white shadow-sm">
              <img
                src="/images/logo-osis-mutiara.jpeg"
                alt="Logo OSIS SMA Mutiara"
                className="h-full w-full object-contain"
              />
            </div>

            <div>
              <h1 className="text-lg font-bold tracking-tight text-primary">
                SIM OSIS
              </h1>

              <p className="text-[11px] font-medium text-text-muted">
                SMA Mutiara 2
              </p>
            </div>
          </Link>

          <button
            type="button"
            aria-label="Tutup sidebar"
            onClick={onClose}
            className="rounded-lg p-2 text-text-muted transition hover:bg-input hover:text-text lg:hidden"
          >
            <AppIcon name="close" size={20} />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3">
          {menuItems.map((item) => {
            const active = isActiveRoute(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`
                  flex items-center gap-3
                  rounded-xl border-l-4
                  px-4 py-3
                  text-sm transition-colors
                  ${
                    active
                      ? "border-primary bg-primary/10 font-semibold text-primary"
                      : "border-transparent font-medium text-text-muted hover:bg-input hover:text-text"
                  }
                `}
              >
                <AppIcon
                  name={item.icon}
                  size={22}
                  className="shrink-0"
                />

                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-border px-6 pt-6">
          <div className="relative">
            <button
              type="button"
              onClick={() => setProfileMenuOpen((current) => !current)}
              className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-input"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                {profile.initials}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-text">
                  {profile.name}
                </p>

                <p className="truncate text-[11px] text-text-muted">
                  {profile.roleLabel}
                </p>
              </div>

              <AppIcon name="expand_more" size={18} className="text-text-muted" />
            </button>

            {profileMenuOpen && (
              <div className="absolute bottom-full left-0 right-0 z-10 mb-2 overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
                <button
                  type="button"
                  disabled={authLoading}
                  onClick={handleLogout}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold text-text transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="flex items-center gap-3">
                    <AppIcon name="logout" size={18} className="text-red-500" />
                    <span>{authLoading ? "Sedang logout..." : "Log Out"}</span>
                  </span>
                  <AppIcon name="chevron_right" size={16} className="text-text-muted" />
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}