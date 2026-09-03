"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import AppIcon from "@/components/global/AppIcon";
import { useAuth } from "@/context/AuthContext";
import { useOverlay } from "@/context/ui/OverlayContext";

/* ==========================================================================
   DEVTOOLS CONFIG
   ==========================================================================
   Isi email dan password akun demo di sini.

   Catatan:
   File ini adalah client component.
   Credential di bawah hanya cocok untuk development / demo skripsi.
   Jangan gunakan credential sensitif untuk aplikasi production.
   ========================================================================== */

const DEVTOOLS_CONFIG = {
  enabled: true,

  pembina: {
    email: "liasyalika75@gmail.com",
    password: "mutiara2",

    // Opsional.
    // Isi jika ingin langsung pindah halaman setelah login.
    // Contoh: "/pembina/dashboard"
    redirect: "/pembina/dashboard",
  },

  anggota: {
    email: "haykalm56@gmail.com",
    password: "kaka2003",

    // Contoh: "/anggota/dashboard"
    redirect: "/anggota/dashboard",
  },
};

/* ==========================================================================
   FLOATING DEVTOOLS BUTTON
   ========================================================================== */

export default function DevTools() {
  const { openOverlay } = useOverlay();

  if (!DEVTOOLS_CONFIG.enabled) {
    return null;
  }

  const handleOpen = () => {
    openOverlay({
      closeOnBackdrop: true,
      content: <DevToolsPanel />,
    });
  };

  return (
    <button
      type="button"
      onClick={handleOpen}
      title="Developer Tools"
      className="
        fixed bottom-5 right-5 z-[90]
        flex min-h-11 items-center gap-2
        rounded-2xl border border-border
        bg-card px-4 py-3
        text-xs font-bold text-text
        shadow-xl
        transition
        hover:-translate-y-0.5
        hover:border-primary/40
        hover:text-primary
        hover:shadow-2xl
        focus-visible:outline-none
        focus-visible:ring-2
        focus-visible:ring-primary
        focus-visible:ring-offset-2
      "
    >
      <AppIcon name="developer_mode" size={19} />

      <span>DEV</span>

      <span className="h-2 w-2 rounded-full bg-emerald-500" />
    </button>
  );
}

/* ==========================================================================
   DEVTOOLS OVERLAY
   ========================================================================== */

function DevToolsPanel() {
  const router = useRouter();

  const { closeOverlay } = useOverlay();

  const {
    user,
    role,
    authLoading,
    profileLoading,
    login,
    logout,
    clearError,
    error: authError,
  } = useAuth();

  const [activeAction, setActiveAction] = useState(null);
  const [localError, setLocalError] = useState("");
  const [message, setMessage] = useState("");

  const busy = authLoading || Boolean(activeAction);

  const resetFeedback = () => {
    setLocalError("");
    setMessage("");
    clearError?.();
  };

  /* ------------------------------------------------------------------------
     LOGIN
     ------------------------------------------------------------------------ */

  const handleLogin = async (accountType) => {
    if (busy) return;

    const account = DEVTOOLS_CONFIG[accountType];

    resetFeedback();

    if (!account?.email?.trim()) {
      setLocalError(`Email ${accountType} belum diisi pada DEVTOOLS_CONFIG.`);
      return;
    }

    if (!account?.password) {
      setLocalError(
        `Password ${accountType} belum diisi pada DEVTOOLS_CONFIG.`,
      );
      return;
    }

    setActiveAction(accountType);

    try {
      await login(account.email, account.password);

      setMessage(
        accountType === "pembina"
          ? "Login Pembina berhasil."
          : "Login Anggota berhasil.",
      );

      closeOverlay();

      if (account.redirect) {
        router.replace(account.redirect);
        return;
      }

      router.refresh();
    } catch (loginError) {
      console.error(
        `DEVTOOLS LOGIN ${accountType.toUpperCase()} ERROR:`,
        loginError,
      );

      setLocalError(
        `Login sebagai ${
          accountType === "pembina" ? "Pembina" : "Anggota"
        } gagal.`,
      );
    } finally {
      setActiveAction(null);
    }
  };

  /* ------------------------------------------------------------------------
     LOGOUT
     ------------------------------------------------------------------------ */

  const handleLogout = async () => {
    if (busy || !user) return;

    resetFeedback();
    setActiveAction("logout");

    try {
      await logout();

      closeOverlay();
      router.refresh();
    } catch (logoutError) {
      console.error("DEVTOOLS LOGOUT ERROR:", logoutError);

      setLocalError("Logout gagal.");
    } finally {
      setActiveAction(null);
    }
  };

  /* ------------------------------------------------------------------------
     UI
     ------------------------------------------------------------------------ */

  return (
    <section
      className="
        w-[min(94vw,460px)]
        overflow-hidden
        rounded-3xl
        border border-border
        bg-card
        shadow-2xl
      "
    >
      {/* Header */}

      <header
        className="
          flex items-start justify-between gap-5
          border-b border-border
          bg-surface
          px-5 py-5
          sm:px-6
        "
      >
        <div className="flex min-w-0 items-start gap-4">
          <div
            className="
              flex h-11 w-11 shrink-0
              items-center justify-center
              rounded-2xl
              bg-primary/10
              text-primary
            "
          >
            <AppIcon name="developer_mode" size={23} />
          </div>

          <div className="min-w-0">
            <p
              className="
                text-[10px] font-bold uppercase
                tracking-[0.16em]
                text-primary
              "
            >
              Development Utility
            </p>

            <h2 className="mt-1 text-xl font-bold text-text">
              Developer Tools
            </h2>

            <p className="mt-1 text-xs leading-5 text-text-muted">
              Berpindah akun demo tanpa melalui halaman login.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => closeOverlay()}
          className="
            flex h-10 w-10 shrink-0
            items-center justify-center
            rounded-xl
            text-text-muted
            transition
            hover:bg-input
            hover:text-text
          "
          aria-label="Tutup Developer Tools"
        >
          <AppIcon name="close" size={21} />
        </button>
      </header>

      <div className="p-5 sm:p-6">
        {/* Current Session */}

        <section
          className="
            rounded-2xl
            border border-border
            bg-surface
            p-4
          "
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <p
                className="
                  text-[10px] font-bold uppercase
                  tracking-[0.14em]
                  text-text-muted
                "
              >
                Current Session
              </p>

              {user ? (
                <>
                  <p className="mt-2 break-all text-sm font-bold text-text">
                    {user.email || "User aktif"}
                  </p>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span
                      className="
                        rounded-full
                        bg-primary/10
                        px-2.5 py-1
                        text-[10px] font-bold
                        uppercase
                        text-primary
                      "
                    >
                      {profileLoading
                        ? "Memuat role..."
                        : role || "Role belum tersedia"}
                    </span>

                    <span
                      className="
                        rounded-full
                        bg-emerald-50
                        px-2.5 py-1
                        text-[10px] font-bold
                        text-emerald-700
                      "
                    >
                      Authenticated
                    </span>
                  </div>
                </>
              ) : (
                <p className="mt-2 text-sm font-semibold text-text-muted">
                  Belum ada akun yang login.
                </p>
              )}
            </div>

            <div
              className="
                flex h-10 w-10 shrink-0
                items-center justify-center
                rounded-xl
                bg-card
                text-text-muted
              "
            >
              <AppIcon name={user ? "verified_user" : "person_off"} size={20} />
            </div>
          </div>
        </section>

        {/* Feedback */}

        {(localError || authError) && (
          <div
            role="alert"
            className="
              mt-4 rounded-xl
              bg-red-50
              px-4 py-3
              text-xs font-semibold
              text-red-700
            "
          >
            {localError || authError}
          </div>
        )}

        {message && !localError && !authError && (
          <div
            className="
              mt-4 rounded-xl
              bg-emerald-50
              px-4 py-3
              text-xs font-semibold
              text-emerald-700
            "
          >
            {message}
          </div>
        )}

        {/* Actions */}

        <div className="mt-5 space-y-3">
          <DevActionButton
            icon="admin_panel_settings"
            title="Login sebagai Pembina"
            description={
              DEVTOOLS_CONFIG.pembina.email ||
              "Email Pembina belum dikonfigurasi"
            }
            loading={activeAction === "pembina"}
            disabled={busy}
            onClick={() => handleLogin("pembina")}
            primary
          />

          <DevActionButton
            icon="person"
            title="Login sebagai Anggota"
            description={
              DEVTOOLS_CONFIG.anggota.email ||
              "Email Anggota belum dikonfigurasi"
            }
            loading={activeAction === "anggota"}
            disabled={busy}
            onClick={() => handleLogin("anggota")}
          />

          <button
            type="button"
            disabled={!user || busy}
            onClick={handleLogout}
            className="
              flex min-h-14 w-full
              items-center gap-4
              rounded-2xl
              border border-red-200
              bg-red-50
              px-4 py-3
              text-left
              transition
              hover:bg-red-100
              disabled:cursor-not-allowed
              disabled:opacity-40
            "
          >
            <div
              className="
                flex h-10 w-10 shrink-0
                items-center justify-center
                rounded-xl
                bg-white
                text-red-600
              "
            >
              <AppIcon name="logout" size={20} />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-red-700">
                {activeAction === "logout" ? "Sedang logout..." : "Log Out"}
              </p>

              <p className="mt-0.5 text-[11px] text-red-600/80">
                Hapus sesi akun yang sedang aktif.
              </p>
            </div>

            <AppIcon name="chevron_right" size={20} />
          </button>
        </div>

        <p
          className="
            mt-5 text-center
            text-[10px] leading-4
            text-text-muted
          "
        >
          Utility ini hanya digunakan untuk development dan demo aplikasi.
        </p>
      </div>
    </section>
  );
}

/* ==========================================================================
   ACTION BUTTON
   ========================================================================== */

function DevActionButton({
  icon,
  title,
  description,
  loading,
  disabled,
  onClick,
  primary = false,
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`
        flex min-h-14 w-full
        items-center gap-4
        rounded-2xl
        border
        px-4 py-3
        text-left
        transition
        disabled:cursor-not-allowed
        disabled:opacity-50
        ${
          primary
            ? "border-primary bg-primary text-white hover:bg-primary-hover"
            : "border-border bg-card text-text hover:border-primary/40 hover:bg-surface"
        }
      `}
    >
      <div
        className={`
          flex h-10 w-10 shrink-0
          items-center justify-center
          rounded-xl
          ${primary ? "bg-white/15 text-white" : "bg-primary/10 text-primary"}
        `}
      >
        <AppIcon name={icon} size={20} />
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">
          {loading ? "Sedang login..." : title}
        </p>

        <p
          className={`
            mt-0.5 truncate text-[11px]
            ${primary ? "text-white/75" : "text-text-muted"}
          `}
        >
          {description}
        </p>
      </div>

      <AppIcon name="chevron_right" size={20} />
    </button>
  );
}
