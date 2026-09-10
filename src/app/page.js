import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-surface text-text">
      <header className="flex items-center justify-between border-b border-border bg-card px-6 py-4 sm:px-10">
        <Link href="/" className="flex items-center gap-3">
          <div className="h-10 w-10 overflow-hidden rounded-xl border border-border bg-white shadow-sm">
            <img
              src="/images/logo-osis-mutiara.jpeg"
              alt="Logo OSIS SMA Mutiara"
              className="h-full w-full object-contain"
            />
          </div>

          <div>
            <p className="text-lg font-bold tracking-tight text-text">SIM OSIS</p>
            <p className="text-xs font-medium text-primary">SMA Mutiara 2 Bandung</p>
          </div>
        </Link>

        <nav className="flex items-center gap-4 sm:gap-8">
          <Link
            href="/cara-registrasi"
            className="hidden text-sm font-medium text-text-muted transition hover:text-primary sm:block"
          >
            Cara Registrasi
          </Link>
          <Link
            href="/login"
            className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-hover"
          >
            Login
          </Link>
        </nav>
      </header>

      <section className="relative flex min-h-[calc(100vh-73px)] items-center justify-center px-6 py-16 text-center sm:px-10 sm:py-20">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_70%,rgba(153,246,228,0.34),transparent_32%),radial-gradient(circle_at_82%_18%,rgba(15,118,110,0.18),transparent_36%)]" />

        <div className="relative z-10 w-full max-w-4xl">
          <h1 className="mx-auto max-w-3xl text-3xl font-medium leading-[1.15] tracking-normal text-text sm:text-5xl lg:text-6xl">
            <span className="block">Empowering Student Leadership at</span>
            <span className="mt-2 block text-primary">SMA Mutiara 2 Bandung</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-text-muted sm:mt-7 sm:text-lg">
            Digitalizing student government management for transparency,
            collaboration, and efficient workflow in every school event.
          </p>

          <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:mt-10 sm:flex-row sm:items-center sm:gap-4">
            <Link
              href="/login"
              className="inline-flex min-h-14 items-center justify-center rounded-xl bg-primary px-8 text-base font-semibold text-white shadow-lg transition hover:bg-primary-hover"
            >
              Login
            </Link>
            <Link
              href="/register"
              className="inline-flex min-h-14 items-center justify-center rounded-xl border-2 border-primary bg-card px-8 text-base font-semibold text-primary transition hover:bg-primary/5"
            >
              Registrasi Akun
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}