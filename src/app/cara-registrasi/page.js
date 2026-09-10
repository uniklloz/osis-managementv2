import Link from "next/link";

const registrationSteps = [
  {
    number: "1",
    title: "Pilih menu registrasi akun",
    description: "Buka portal dan pilih opsi pendaftaran akun pengurus baru.",
  },
  {
    number: "2",
    title: "Isi lengkap formulir biodata",
    description: "Masukkan NIS, nama lengkap, kelas, divisi, dan email sekolah.",
  },
  {
    number: "3",
    title: "Submit biodata pendaftaran",
    description: "Data akan diverifikasi oleh sistem dan pembina OSIS.",
  },
];

export default function RegistrationGuidePage() {
  return (
    <main className="min-h-screen bg-surface text-text">
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
          <span className="hidden text-sm font-medium text-primary sm:block">
            Cara Registrasi
          </span>
          <Link
            href="/login"
            className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-hover"
          >
            Login
          </Link>
        </nav>
      </header>

      <section className="mx-auto max-w-5xl px-6 py-8 sm:px-10 sm:py-12">
        <div className="text-center">
          <p className="text-sm font-bold uppercase tracking-wide text-primary">
            Panduan Pendaftaran
          </p>
          <h1 className="mt-3 text-3xl font-bold leading-tight text-text sm:text-4xl">
            Tata Cara Registrasi Akun Pengurus OSIS
          </h1>
          <p className="mt-4 text-base text-text-muted sm:text-lg">
            Ikuti 3 langkah mudah berikut.
          </p>
        </div>

        <div className="mt-14 rounded-3xl border border-text bg-card px-7 py-5 shadow-sm sm:px-8 sm:py-6">
          {registrationSteps.map((step, index) => (
            <div key={step.number}>
              <div className="flex gap-4 py-3 sm:gap-5 sm:py-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
                  {step.number}
                </span>
                <div>
                  <h2 className="text-base font-bold text-text">{step.title}</h2>
                  <p className="mt-1 text-sm leading-6 text-text-muted sm:text-base">
                    {step.description}
                  </p>
                </div>
              </div>

              {index < registrationSteps.length - 1 && (
                <div className="border-t border-border" />
              )}
            </div>
          ))}
        </div>

        <div className="mt-8 text-center">
          <Link
            href="/register"
            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-hover"
          >
            Mulai Registrasi
          </Link>
        </div>
      </section>
    </main>
  );
}