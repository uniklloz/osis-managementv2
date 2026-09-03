"use client";

import { useEffect, useMemo, useState } from "react";

import AppIcon from "@/components/global/AppIcon";
import { useAuth } from "@/context/AuthContext";
import { useDb } from "@/context/DbContext";
import { useCollection } from "@/hooks/useCollection";
import { buatKodeAnggota } from "@/lib/codefication";

// Skema yang dipakai halaman pendaftaran.
// Nilainya disamakan dengan modul Data Anggota terbaru.
const KOLEKSI = Object.freeze({
  ANGGOTA: "Anggota",
  DIVISI: "Divisi",
  PERIODE: "Periode",
});

const FIELD = Object.freeze({
  ANGGOTA: Object.freeze({
    KODE_ANGGOTA: "kodeAnggota",
    ID_PENGGUNA: "idPengguna",
    NAMA_LENGKAP: "namaLengkap",
    NIS: "nis",
    NAMA_KELAS: "namaKelas",
    JENIS_KELAMIN: "jenisKelamin",
    EMAIL: "email",
    NOMOR_TELEPON: "nomorTelepon",
    ALAMAT: "alamat",
    ID_DIVISI: "idDivisi",
    ID_PERIODE: "idPeriode",
    JABATAN_ORGANISASI: "jabatanOrganisasi",
    MOTIVASI: "motivasi",
    PENGALAMAN_ORGANISASI: "pengalamanOrganisasi",
    STATUS_KEANGGOTAAN: "statusKeanggotaan",
    CATATAN_REVIEW: "catatanReview",
    BERGABUNG_PADA: "bergabungPada",
    DIAJUKAN_PADA: "diajukanPada",
    DITINJAU_PADA: "ditinjauPada",
    DIBUAT_PADA: "dibuatPada",
    DIPERBARUI_PADA: "diperbaruiPada",
  }),

  DIVISI: Object.freeze({
    KODE: "kode",
    NAMA: "nama",
    NAMA_SINGKAT: "namaSingkat",
  }),

  PERIODE: Object.freeze({
    NAMA: "namaPeriode",
    AKTIF: "aktif",
  }),
});

const STATUS_KEANGGOTAAN = Object.freeze({
  MENUNGGU_REVIEW: "menunggu_review",
  AKTIF: "aktif",
  NONAKTIF: "nonaktif",
  DITANGGUHKAN: "ditangguhkan",
  DITOLAK: "ditolak",
});

const OPSI_KELAS = ["X", "XI", "XII"];

const DRAF_FORM_PENDAFTARAN = Object.freeze({
  namaLengkap: "",
  nis: "",
  namaKelas: "",
  jenisKelamin: "",
  nomorTelepon: "",
  alamat: "",
  idDivisi: "",
  motivasi: "",
  pengalamanOrganisasi: "",
});

function buatDrafFormPendaftaran() {
  return { ...DRAF_FORM_PENDAFTARAN };
}

function rowsOf(result) {
  return Array.isArray(result?.rows) ? result.rows : [];
}

function isBadanPengurusHarian(divisi) {
  const kode = String(divisi?.[FIELD.DIVISI.KODE] || "")
    .trim()
    .toUpperCase();

  const nama = String(
    divisi?.[FIELD.DIVISI.NAMA_SINGKAT] ||
      divisi?.[FIELD.DIVISI.NAMA] ||
      ""
  )
    .trim()
    .toLowerCase();

  return kode === "BPH" || nama === "badan pengurus harian";
}

function labelDivisi(divisi) {
  return (
    divisi?.[FIELD.DIVISI.NAMA_SINGKAT] ||
    divisi?.[FIELD.DIVISI.NAMA] ||
    "-"
  );
}

export default function PendaftaranPage() {
  const { user, userDoc, accessLoading } = useAuth();
  const {
    colRef,
    query,
    where,
    limit,
    addDoc,
    updateDoc,
    serverTimestamp,
  } = useDb();

  // document.id Anggota selalu Auto ID Firestore.
  // Relasi ke akun aplikasi memakai idPengguna (FK ke dokumen Users),
  // sedangkan identifier yang dibaca manusia adalah kodeAnggota.
  const idPengguna = userDoc?.id || null;

  const anggotaSaya = useCollection(
    () =>
      idPengguna
        ? query(
            colRef(KOLEKSI.ANGGOTA),
            where(FIELD.ANGGOTA.ID_PENGGUNA, "==", idPengguna),
            limit(2)
          )
        : null,
    [idPengguna],
    { enabled: Boolean(idPengguna) }
  );

  const divisi = useCollection(() => colRef(KOLEKSI.DIVISI), [], {
    enabled: true,
  });

  const periode = useCollection(() => colRef(KOLEKSI.PERIODE), [], {
    enabled: true,
  });

  const [form, setForm] = useState(() => buatDrafFormPendaftaran());
  const [formError, setFormError] = useState("");
  const [actionError, setActionError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [modePerbaikan, setModePerbaikan] = useState(false);

  const anggotaRows = rowsOf(anggotaSaya);
  const member = anggotaRows[0] || null;
  const adaDuplikasiAnggota = anggotaRows.length > 1;

  const email = useMemo(
    () => user?.email ?? userDoc?.email ?? "",
    [user?.email, userDoc?.email]
  );

  const periodeAktifRows = useMemo(
    () =>
      rowsOf(periode).filter(
        (item) => item?.[FIELD.PERIODE.AKTIF] === true
      ),
    [periode]
  );

  const periodeAktif =
    periodeAktifRows.length === 1 ? periodeAktifRows[0] : null;

  const sekbidRows = useMemo(
    () =>
      rowsOf(divisi)
        .filter((item) => !isBadanPengurusHarian(item))
        .sort((a, b) =>
          String(labelDivisi(a)).localeCompare(String(labelDivisi(b)), "id")
        ),
    [divisi]
  );

  const opsiDivisi = useMemo(
    () =>
      sekbidRows.map((item) => ({
        value: item.id,
        label: labelDivisi(item),
      })),
    [sekbidRows]
  );

  const petaDivisi = useMemo(
    () => new Map(rowsOf(divisi).map((item) => [item.id, item])),
    [divisi]
  );

  const konfigurasiError = useMemo(() => {
    if (!idPengguna) {
      return "Profil pengguna belum tersedia. Muat ulang halaman atau login kembali.";
    }

    if (periodeAktifRows.length === 0) {
      return "Belum ada periode kepengurusan aktif. Pendaftaran belum dapat dikirim.";
    }

    if (periodeAktifRows.length > 1) {
      return "Terdapat lebih dari satu periode aktif. Perbaiki data Periode sebelum membuka pendaftaran.";
    }

    if (sekbidRows.length === 0) {
      return "Belum ada Sekbid yang dapat dipilih. Segera Hubungi Pembina untuk menambahkan Sekbid sebelum membuka pendaftaran.";
    }

    return "";
  }, [idPengguna, periodeAktifRows.length, sekbidRows.length]);

  const membershipStatus =
    member?.[FIELD.ANGGOTA.STATUS_KEANGGOTAAN] || null;

  useEffect(() => {
    setForm({
      namaLengkap:
        member?.[FIELD.ANGGOTA.NAMA_LENGKAP] ??
        userDoc?.namaLengkap ??
        user?.displayName ??
        "",
      nis: member?.[FIELD.ANGGOTA.NIS] ?? userDoc?.nis ?? "",
      namaKelas:
        member?.[FIELD.ANGGOTA.NAMA_KELAS] ?? userDoc?.namaKelas ?? "",
      jenisKelamin:
        member?.[FIELD.ANGGOTA.JENIS_KELAMIN] ??
        userDoc?.jenisKelamin ??
        "",
      nomorTelepon:
        member?.[FIELD.ANGGOTA.NOMOR_TELEPON] ??
        userDoc?.nomorTelepon ??
        "",
      alamat:
        member?.[FIELD.ANGGOTA.ALAMAT] ?? userDoc?.alamat ?? "",
      idDivisi: member?.[FIELD.ANGGOTA.ID_DIVISI] ?? "",
      motivasi: member?.[FIELD.ANGGOTA.MOTIVASI] ?? "",
      pengalamanOrganisasi:
        member?.[FIELD.ANGGOTA.PENGALAMAN_ORGANISASI] ?? "",
    });
  }, [member, userDoc, user?.displayName]);

  useEffect(() => {
    if (membershipStatus !== STATUS_KEANGGOTAAN.DITOLAK) {
      setModePerbaikan(false);
    }
  }, [membershipStatus]);

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));

    setFormError("");
    setActionError("");
  }

  function validateForm() {
    if (konfigurasiError) {
      return konfigurasiError;
    }

    const requiredValues = [
      form.namaLengkap,
      form.nis,
      form.namaKelas,
      form.jenisKelamin,
      form.nomorTelepon,
      form.alamat,
      form.idDivisi,
      form.motivasi,
    ];

    if (requiredValues.some((value) => !String(value).trim())) {
      return "Lengkapi seluruh kolom wajib sebelum mengirim pendaftaran.";
    }

    if (form.namaLengkap.trim().length < 3) {
      return "Nama lengkap minimal 3 karakter.";
    }

    if (!/^\d{5,20}$/.test(form.nis.trim())) {
      return "NIS harus berisi 5 sampai 20 digit angka.";
    }

    const nomorTelepon = form.nomorTelepon.replace(/\D/g, "");

    if (nomorTelepon.length < 9 || nomorTelepon.length > 15) {
      return "Nomor WhatsApp harus berisi 9 sampai 15 digit.";
    }

    if (form.alamat.trim().length < 10) {
      return "Alamat lengkap minimal 10 karakter.";
    }

    if (form.motivasi.trim().length < 30) {
      return "Alasan bergabung minimal 30 karakter.";
    }

    if (!OPSI_KELAS.includes(form.namaKelas)) {
      return "Kelas yang dipilih tidak valid.";
    }

    if (!sekbidRows.some((item) => item.id === form.idDivisi)) {
      return "Sekbid yang dipilih tidak valid atau sudah tidak tersedia.";
    }

    if (!periodeAktif?.id) {
      return "Periode aktif tidak ditemukan.";
    }

    return "";
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!idPengguna) {
      setActionError("Profil pengguna tidak ditemukan. Silakan login kembali.");
      return;
    }

    if (adaDuplikasiAnggota) {
      setActionError(
        "Terdapat lebih dari satu data anggota untuk akun ini. Hubungi pembina sebelum mengirim ulang."
      );
      return;
    }

    const validationError = validateForm();

    if (validationError) {
      setFormError(validationError);
      return;
    }

    setSubmitting(true);
    setActionError("");

    try {
      const waktu = serverTimestamp();

      // Kode bisnis dibuat hanya saat dokumen belum memiliki kode.
      // Firestore document.id tetap sepenuhnya Auto ID.
      const tahunPeriode = Number(
        String(periodeAktif?.[FIELD.PERIODE.NAMA] || "").match(/\d{4}/)?.[0]
      ) || new Date().getFullYear();

      const kodeAnggota =
        member?.[FIELD.ANGGOTA.KODE_ANGGOTA] ||
        (await buatKodeAnggota({ tahun: tahunPeriode }));

      const payload = {
        [FIELD.ANGGOTA.KODE_ANGGOTA]: kodeAnggota,
        [FIELD.ANGGOTA.ID_PENGGUNA]: idPengguna,
        [FIELD.ANGGOTA.NAMA_LENGKAP]: form.namaLengkap.trim(),
        [FIELD.ANGGOTA.NIS]: form.nis.trim(),
        [FIELD.ANGGOTA.NAMA_KELAS]: form.namaKelas.trim(),
        [FIELD.ANGGOTA.JENIS_KELAMIN]: form.jenisKelamin,
        [FIELD.ANGGOTA.EMAIL]: email,
        [FIELD.ANGGOTA.NOMOR_TELEPON]:
          form.nomorTelepon.replace(/\D/g, ""),
        [FIELD.ANGGOTA.ALAMAT]: form.alamat.trim(),

        // Sekbid yang dipilih langsung disimpan sebagai relasi idDivisi.
        // Pending member belum dianggap anggota resmi sampai statusnya AKTIF.
        [FIELD.ANGGOTA.ID_DIVISI]: form.idDivisi,
        [FIELD.ANGGOTA.ID_PERIODE]: periodeAktif.id,
        [FIELD.ANGGOTA.JABATAN_ORGANISASI]: "Anggota",

        [FIELD.ANGGOTA.MOTIVASI]: form.motivasi.trim(),
        [FIELD.ANGGOTA.PENGALAMAN_ORGANISASI]:
          form.pengalamanOrganisasi.trim() || null,

        [FIELD.ANGGOTA.STATUS_KEANGGOTAAN]:
          STATUS_KEANGGOTAAN.MENUNGGU_REVIEW,
        [FIELD.ANGGOTA.CATATAN_REVIEW]: null,
        [FIELD.ANGGOTA.DITINJAU_PADA]: null,
        [FIELD.ANGGOTA.BERGABUNG_PADA]:
          member?.[FIELD.ANGGOTA.BERGABUNG_PADA] ?? null,
        [FIELD.ANGGOTA.DIAJUKAN_PADA]: waktu,
        [FIELD.ANGGOTA.DIPERBARUI_PADA]: waktu,
      };

      if (member?.id) {
        await updateDoc(KOLEKSI.ANGGOTA, member.id, payload);
      } else {
        await addDoc(KOLEKSI.ANGGOTA, {
          ...payload,
          [FIELD.ANGGOTA.DIBUAT_PADA]: waktu,
        });
      }

      setModePerbaikan(false);
    } catch (error) {
      console.error("PENDAFTARAN SUBMIT ERROR:", error);
      setActionError(
        "Pendaftaran belum berhasil dikirim. Periksa koneksi lalu coba kembali."
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleRestartRegistration() {
    setActionError("");
    setFormError("");
    setModePerbaikan(true);
  }

  const sedangMemuat =
    accessLoading || anggotaSaya.loading || divisi.loading || periode.loading;

  const readError =
    anggotaSaya.error || divisi.error || periode.error || null;

  if (sedangMemuat) {
    return <PageLoader />;
  }

  if (readError) {
    return (
      <CenteredStatus
        icon="close"
        title="Data tidak dapat dimuat"
        description="Muat ulang halaman atau periksa koneksi internet."
        tone="error"
      />
    );
  }

  if (adaDuplikasiAnggota) {
    return (
      <CenteredStatus
        icon="close"
        title="Data pendaftaran ganda"
        description="Ditemukan lebih dari satu dokumen Anggota untuk akun ini. Hubungi pembina agar data duplikat dibersihkan."
        tone="error"
      />
    );
  }

  if (
    membershipStatus === STATUS_KEANGGOTAAN.MENUNGGU_REVIEW &&
    !modePerbaikan
  ) {
    return (
      <PendingReviewView
        member={member}
        namaDivisi={labelDivisi(petaDivisi.get(member?.idDivisi))}
        actionError={actionError}
      />
    );
  }

  if (
    membershipStatus === STATUS_KEANGGOTAAN.DITOLAK &&
    !modePerbaikan
  ) {
    return (
      <RejectedView
        catatanReview={member?.[FIELD.ANGGOTA.CATATAN_REVIEW]}
        actionError={actionError}
        onRestart={handleRestartRegistration}
      />
    );
  }

  if (membershipStatus === STATUS_KEANGGOTAAN.AKTIF) {
    return (
      <CenteredStatus
        icon="verified_user"
        title="Pendaftaran disetujui"
        description="Pembina telah menyetujui pendaftaranmu. Akunmu sudah tercatat sebagai anggota aktif."
        tone="success"
      />
    );
  }

  if (membershipStatus === STATUS_KEANGGOTAAN.NONAKTIF) {
    return (
      <CenteredStatus
        icon="person"
        title="Keanggotaan tidak aktif"
        description="Data keanggotaanmu masih tercatat, tetapi statusnya saat ini tidak aktif."
      />
    );
  }

  if (membershipStatus === STATUS_KEANGGOTAAN.DITANGGUHKAN) {
    return (
      <CenteredStatus
        icon="block"
        title="Keanggotaan ditangguhkan"
        description="Status keanggotaanmu sedang ditangguhkan. Hubungi pembina untuk informasi lebih lanjut."
        tone="error"
      />
    );
  }

  return (
    <RegistrationForm
      form={form}
      email={email}
      submitting={submitting}
      formError={formError}
      actionError={actionError}
      opsiDivisi={opsiDivisi}
      namaPeriodeAktif={periodeAktif?.[FIELD.PERIODE.NAMA] || ""}
      konfigurasiError={konfigurasiError}
      onChange={handleChange}
      onSubmit={handleSubmit}
    />
  );
}

function RegistrationForm({
  form,
  email,
  submitting,
  formError,
  actionError,
  opsiDivisi,
  namaPeriodeAktif,
  konfigurasiError,
  onChange,
  onSubmit,
}) {
  return (
    <main className="min-h-screen bg-surface px-4 py-10 sm:px-6">
      <div className="mx-auto w-full max-w-4xl">
        <header className="mb-8 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-white shadow-sm">
            <AppIcon name="person_add" size={30} />
          </div>

          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
            Pendaftaran Anggota
          </p>

          <h1 className="mt-2 text-3xl font-bold text-text sm:text-4xl">
            Lengkapi biodata calon anggota
          </h1>

          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-text-muted sm:text-base">
            Data akan diperiksa oleh pembina. Status anggota aktif diberikan
            setelah pendaftaran disetujui.
          </p>
        </header>

        <form
          onSubmit={onSubmit}
          className="space-y-6 rounded-3xl border border-border bg-card p-5 shadow-lg sm:p-8"
          noValidate
        >
          <div className="rounded-2xl border border-border bg-input px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              Periode Pendaftaran
            </p>
            <p className="mt-1 font-semibold text-text">
              {namaPeriodeAktif || "Belum ada periode aktif"}
            </p>
          </div>

          {konfigurasiError && <AlertMessage message={konfigurasiError} />}
          <FormSection
            icon="person"
            title="Informasi pribadi"
            description="Masukkan identitas sesuai data sekolah."
          >
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <TextField
                id="namaLengkap"
                label="Nama Lengkap"
                value={form.namaLengkap}
                placeholder="Contoh: Muhammad Rizky"
                onChange={onChange}
                disabled={submitting || Boolean(konfigurasiError)}
                required
              />

              <TextField
                id="nis"
                label="Nomor Induk Siswa"
                value={form.nis}
                placeholder="Masukkan NIS"
                inputMode="numeric"
                onChange={onChange}
                disabled={submitting || Boolean(konfigurasiError)}
                required
              />

              <SelectField
                id="namaKelas"
                label="Kelas"
                value={form.namaKelas}
                options={OPSI_KELAS}
                placeholder="Pilih kelas"
                onChange={onChange}
                disabled={submitting || Boolean(konfigurasiError)}
                required
              />

              <div>
                <FieldLabel required>Jenis Kelamin</FieldLabel>

                <div className="flex min-h-12 items-center gap-6 rounded-xl border border-border bg-input px-4">
                  <RadioField
                    name="jenisKelamin"
                    value="laki-laki"
                    label="Laki-laki"
                    checked={form.jenisKelamin === "laki-laki"}
                    onChange={onChange}
                    disabled={submitting || Boolean(konfigurasiError)}
                  />

                  <RadioField
                    name="jenisKelamin"
                    value="perempuan"
                    label="Perempuan"
                    checked={form.jenisKelamin === "perempuan"}
                    onChange={onChange}
                    disabled={submitting || Boolean(konfigurasiError)}
                  />
                </div>
              </div>
            </div>
          </FormSection>

          <FormSection
            icon="mail"
            title="Informasi kontak"
            description="Gunakan kontak aktif yang dapat dihubungi pembina."
          >
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <TextField
                id="email"
                label="Email Akun"
                type="email"
                value={email}
                disabled
                readOnly
              />

              <TextField
                id="nomorTelepon"
                label="Nomor WhatsApp"
                type="tel"
                value={form.nomorTelepon}
                placeholder="Contoh: 081234567890"
                inputMode="tel"
                onChange={onChange}
                disabled={submitting || Boolean(konfigurasiError)}
                required
              />
            </div>

            <div className="mt-5">
              <TextareaField
                id="alamat"
                label="Alamat Lengkap"
                value={form.alamat}
                placeholder="Masukkan alamat tempat tinggal"
                rows={3}
                onChange={onChange}
                disabled={submitting || Boolean(konfigurasiError)}
                required
              />
            </div>
          </FormSection>

          <FormSection
            icon="receipt"
            title="Informasi organisasi"
            description="Jelaskan minat dan alasan mengikuti organisasi."
          >
            <SelectField
              id="idDivisi"
              label="Sekbid Pilihan"
              value={form.idDivisi}
              options={opsiDivisi}
              placeholder="Pilih sekbid"
              onChange={onChange}
              disabled={submitting || Boolean(konfigurasiError)}
              required
            />

            <div className="mt-5">
              <TextareaField
                id="motivasi"
                label="Alasan Bergabung"
                value={form.motivasi}
                placeholder="Jelaskan motivasi dan kontribusi yang ingin kamu berikan"
                rows={4}
                onChange={onChange}
                disabled={submitting || Boolean(konfigurasiError)}
                required
                hint="Minimal 30 karakter."
              />
            </div>

            <div className="mt-5">
              <TextareaField
                id="pengalamanOrganisasi"
                label="Pengalaman Organisasi"
                value={form.pengalamanOrganisasi}
                placeholder="Ceritakan pengalaman organisasi atau kepanitiaan sebelumnya"
                rows={4}
                onChange={onChange}
                disabled={submitting || Boolean(konfigurasiError)}
                hint="Opsional. Kosongkan jika belum memiliki pengalaman."
              />
            </div>
          </FormSection>

          {(formError || actionError) && (
            <AlertMessage message={formError || actionError} />
          )}

          <div className="flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-5 text-text-muted sm:max-w-md">
              Pastikan seluruh data benar. Pembina akan menggunakan informasi
              ini untuk meninjau pendaftaranmu.
            </p>

            <button
              type="submit"
              disabled={submitting || Boolean(konfigurasiError)}
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 font-semibold text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              <AppIcon name="arrow_forward" size={20} />
              {submitting ? "Mengirim..." : "Kirim Pendaftaran"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

function PendingReviewView({ member, namaDivisi, actionError }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4 py-10 sm:px-6">
      <section className="w-full max-w-xl rounded-3xl border border-border bg-card p-6 text-center shadow-lg sm:p-10">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/10 text-primary">
          <AppIcon name="verified" size={38} />
        </div>

        <p className="mt-6 text-sm font-semibold uppercase tracking-[0.18em] text-primary">
          Pendaftaran Terkirim
        </p>

        <h1 className="mt-2 text-3xl font-bold text-text">
          Sedang menunggu review
        </h1>

        <p className="mx-auto mt-4 max-w-md leading-7 text-text-muted">
          Data pendaftaranmu sudah diterima dan sedang diperiksa oleh pembina.
          Status anggota aktif diberikan setelah pendaftaran disetujui.
        </p>

        <div className="mt-7 rounded-2xl border border-border bg-input p-5 text-left">
          <StatusRow label="Kode Anggota" value={member?.kodeAnggota || "-"} />
          <StatusRow label="Nama" value={member?.namaLengkap || "-"} />
          <StatusRow label="NIS" value={member?.nis || "-"} />
          <StatusRow label="Kelas" value={member?.namaKelas || "-"} />
          <StatusRow label="Sekbid" value={namaDivisi || "-"} />
          <StatusRow
            label="Status"
            value="Menunggu pemeriksaan pembina"
            last
          />
        </div>

        <div className="mt-6 rounded-xl bg-primary/5 px-4 py-3 text-sm leading-6 text-text-muted">
          Kamu tidak perlu mengirim formulir lagi. Perubahan status akan tampil
          otomatis ketika pembina selesai melakukan review.
        </div>

        {actionError && (
          <div className="mt-5">
            <AlertMessage message={actionError} />
          </div>
        )}
      </section>
    </main>
  );
}

function RejectedView({
  catatanReview,
  actionError,
  onRestart,
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4 py-10 sm:px-6">
      <section className="w-full max-w-xl rounded-3xl border border-border bg-card p-6 text-center shadow-lg sm:p-10">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-error-bg text-error-text">
          <AppIcon name="close" size={38} />
        </div>

        <p className="mt-6 text-sm font-semibold uppercase tracking-[0.18em] text-error-text">
          Pendaftaran Ditolak
        </p>

        <h1 className="mt-2 text-3xl font-bold text-text">
          Data perlu didaftarkan ulang
        </h1>

        <p className="mx-auto mt-4 max-w-md leading-7 text-text-muted">
          Pembina belum dapat menyetujui pendaftaranmu. Baca catatan berikut,
          lalu perbaiki data dan kirim kembali pendaftaran.
        </p>

        <div className="mt-7 rounded-2xl bg-error-bg p-5 text-left">
          <p className="text-xs font-semibold uppercase tracking-wider text-error-text">
            Catatan Pembina
          </p>
          <p className="mt-2 leading-7 text-error-text">
            {catatanReview || "Pendaftaran ditolak tanpa catatan tambahan."}
          </p>
        </div>

        {actionError && (
          <div className="mt-5">
            <AlertMessage message={actionError} />
          </div>
        )}

        <button
          type="button"
          onClick={onRestart}
          
          className="mt-7 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 font-semibold text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          <AppIcon name="edit" size={20} />
          Perbaiki Pendaftaran
        </button>

        <p className="mt-3 text-xs leading-5 text-text-muted">
          Data sebelumnya tetap digunakan sebagai isian awal agar kamu hanya perlu
          memperbaiki bagian yang diperlukan.
        </p>
      </section>
    </main>
  );
}

function PageLoader() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-6">
      <div className="rounded-2xl border border-border bg-card px-6 py-5 text-sm text-text-muted shadow-sm">
        Memuat pendaftaran...
      </div>
    </main>
  );
}

function CenteredStatus({
  icon,
  title,
  description,
  tone = "success",
}) {
  const iconClass =
    tone === "error"
      ? "bg-error-bg text-error-text"
      : "bg-primary/10 text-primary";

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-6">
      <section className="w-full max-w-lg rounded-3xl border border-border bg-card p-8 text-center shadow-lg">
        <div
          className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl ${iconClass}`}
        >
          <AppIcon name={icon} size={32} />
        </div>

        <h1 className="mt-5 text-2xl font-bold text-text">{title}</h1>
        <p className="mt-3 leading-7 text-text-muted">{description}</p>
      </section>
    </main>
  );
}

function FormSection({ icon, title, description, children }) {
  return (
    <section>
      <div className="mb-5 flex items-start gap-3 border-b border-border pb-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <AppIcon name={icon} size={21} />
        </div>

        <div>
          <h2 className="font-semibold text-text">{title}</h2>
          <p className="mt-1 text-sm text-text-muted">{description}</p>
        </div>
      </div>

      {children}
    </section>
  );
}

function FieldLabel({ children, required }) {
  return (
    <span className="mb-2 block text-sm font-medium text-text">
      {children}
      {required && <span className="ml-1 text-error-text">*</span>}
    </span>
  );
}

function TextField({
  id,
  label,
  type = "text",
  value,
  placeholder,
  inputMode,
  onChange,
  disabled,
  readOnly,
  required,
}) {
  return (
    <div>
      <label htmlFor={id}>
        <FieldLabel required={required}>{label}</FieldLabel>
      </label>

      <input
        id={id}
        name={id}
        type={type}
        value={value}
        placeholder={placeholder}
        inputMode={inputMode}
        onChange={onChange}
        disabled={disabled}
        readOnly={readOnly}
        required={required}
        className="min-h-12 w-full rounded-xl border border-border bg-input px-4 text-text outline-none transition placeholder:text-text-muted/70 focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-70"
      />
    </div>
  );
}

function SelectField({
  id,
  label,
  value,
  options,
  placeholder,
  onChange,
  disabled,
  required,
}) {
  return (
    <div>
      <label htmlFor={id}>
        <FieldLabel required={required}>{label}</FieldLabel>
      </label>

      <select
        id={id}
        name={id}
        value={value}
        onChange={onChange}
        disabled={disabled}
        required={required}
        className="min-h-12 w-full rounded-xl border border-border bg-input px-4 text-text outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-70"
      >
        <option value="">{placeholder}</option>

        {options.map((option) => {
          const value =
            typeof option === "string" ? option : String(option.value ?? "");
          const label =
            typeof option === "string" ? option : option.label ?? value;

          return (
            <option key={value} value={value}>
              {label}
            </option>
          );
        })}
      </select>
    </div>
  );
}

function TextareaField({
  id,
  label,
  value,
  placeholder,
  rows,
  onChange,
  disabled,
  required,
  hint,
}) {
  return (
    <div>
      <label htmlFor={id}>
        <FieldLabel required={required}>{label}</FieldLabel>
      </label>

      <textarea
        id={id}
        name={id}
        value={value}
        placeholder={placeholder}
        rows={rows}
        onChange={onChange}
        disabled={disabled}
        required={required}
        className="w-full resize-y rounded-xl border border-border bg-input px-4 py-3 text-text outline-none transition placeholder:text-text-muted/70 focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-70"
      />

      {hint && <p className="mt-1.5 text-xs text-text-muted">{hint}</p>}
    </div>
  );
}

function RadioField({
  name,
  value,
  label,
  checked,
  onChange,
  disabled,
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-text">
      <input
        name={name}
        type="radio"
        value={value}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="h-4 w-4 accent-primary"
      />
      {label}
    </label>
  );
}

function StatusRow({ label, value, last = false }) {
  return (
    <div
      className={`flex items-start justify-between gap-4 py-3 ${
        last ? "" : "border-b border-border"
      }`}
    >
      <span className="text-sm text-text-muted">{label}</span>
      <span className="text-right text-sm font-medium text-text">{value}</span>
    </div>
  );
}

function AlertMessage({ message }) {
  return (
    <div
      className="rounded-xl bg-error-bg px-4 py-3 text-sm text-error-text"
      role="alert"
      aria-live="polite"
    >
      {message}
    </div>
  );
}
