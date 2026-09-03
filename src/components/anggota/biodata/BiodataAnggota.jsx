"use client";

import { useMemo, useState } from "react";

import AppIcon from "@/components/global/AppIcon";
import { useDb } from "@/context/DbContext";
import { useCollection } from "@/hooks/useCollection";
import { useCurrentMember } from "@/components/anggota/_shared/useCurrentMember";
import {
  formatDate,
  formatPhone,
  getInitials,
} from "@/components/anggota/_shared/formatters";
import {
  PageError,
  PageHeading,
  PageLoading,
  SectionTitle,
} from "@/components/anggota/_shared/Ui";

const LABEL_STATUS_KEANGGOTAAN = Object.freeze({
  menunggu_review: "Menunggu Review",
  aktif: "Aktif",
  nonaktif: "Tidak Aktif",
  ditangguhkan: "Ditangguhkan",
  ditolak: "Ditolak",
});

function rowsOf(result) {
  return Array.isArray(result?.rows) ? result.rows : [];
}

function labelStatus(status) {
  return LABEL_STATUS_KEANGGOTAAN[status] || status || "-";
}

function labelDivisi(divisi) {
  return divisi?.namaSingkat || divisi?.nama || "Belum ditentukan";
}

function labelJenisKelamin(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (["laki-laki", "laki_laki", "male", "l"].includes(normalized)) {
    return "Laki-laki";
  }

  if (["perempuan", "female", "p"].includes(normalized)) {
    return "Perempuan";
  }

  return value || "-";
}

export default function BiodataAnggota() {
  const {
    member,
    loading: memberLoading,
    error: memberError,
  } = useCurrentMember();

  const { colRef } = useDb();

  const divisions = useCollection(() => colRef("Divisi"), [], {
    enabled: true,
  });

  const periods = useCollection(() => colRef("Periode"), [], {
    enabled: true,
  });

  const loading = memberLoading || divisions.loading || periods.loading;
  const error = memberError || divisions.error || periods.error;
  const { updateDoc, serverTimestamp } = useDb();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [formMessage, setFormMessage] = useState("");
  const [form, setForm] = useState({});

  const data = useMemo(() => {
    const divisionMap = new Map(
      rowsOf(divisions).map((item) => [item.id, item])
    );
    const periodMap = new Map(rowsOf(periods).map((item) => [item.id, item]));

    return {
      division: member?.idDivisi
        ? divisionMap.get(member.idDivisi) || null
        : null,
      period: member?.idPeriode ? periodMap.get(member.idPeriode) || null : null,
    };
  }, [divisions, periods, member]);

  if (loading) {
    return <PageLoading message="Memuat biodata anggota..." />;
  }

  if (error) {
    return <PageError message={error.message} />;
  }

  if (!member) {
    return (
      <PageError
        title="Biodata anggota tidak ditemukan"
        message="Pastikan dokumen Anggota terhubung dengan akun login melalui field idPengguna."
      />
    );
  }

  const startEditing = () => {
    setForm({
      namaLengkap: member.namaLengkap || "",
      nis: member.nis || "",
      namaKelas: member.namaKelas || "",
      jenisKelamin: member.jenisKelamin || "",
      nomorTelepon: member.nomorTelepon || "",
      alamat: member.alamat || "",
      motivasi: member.motivasi || "",
      pengalamanOrganisasi: member.pengalamanOrganisasi || "",
    });
    setFormError("");
    setFormMessage("");
    setEditing(true);
  };

  const updateForm = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setFormError("");
    setFormMessage("");
  };

  const handleSave = async (event) => {
    event.preventDefault();

    if (!form.namaLengkap.trim() || !form.nis.trim() || !form.namaKelas) {
      setFormError("Nama lengkap, NIS, dan kelas wajib diisi.");
      return;
    }

    if (!form.nomorTelepon.trim() || !form.alamat.trim()) {
      setFormError("Nomor telepon dan alamat wajib diisi.");
      return;
    }

    setSaving(true);
    setFormError("");
    setFormMessage("");

    try {
      await updateDoc("Anggota", member.id, {
        namaLengkap: form.namaLengkap.trim(),
        nis: form.nis.trim(),
        namaKelas: form.namaKelas,
        jenisKelamin: form.jenisKelamin,
        nomorTelepon: form.nomorTelepon.trim(),
        alamat: form.alamat.trim(),
        motivasi: form.motivasi.trim(),
        pengalamanOrganisasi: form.pengalamanOrganisasi.trim() || null,
        diperbaruiPada: serverTimestamp(),
      });
      setEditing(false);
      setFormMessage("Data biodata berhasil diperbarui.");
    } catch (saveError) {
      console.error("UPDATE BIODATA ANGGOTA ERROR:", saveError);
      setFormError("Data biodata belum berhasil disimpan. Periksa koneksi dan izin akses.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeading
        eyebrow="Profil Anggota"
        title="Biodata Anggota"
        description="Informasi pribadi, kontak, dan posisi organisasi yang tersimpan di Firestore."
        action={
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-primary px-4 text-sm font-semibold text-primary hover:bg-primary/5"
            >
              <AppIcon name="arrow_back" size={18} />
              Kembali
            </button>
            <button
              type="button"
              onClick={startEditing}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover"
            >
              <AppIcon name="edit" size={18} />
              Edit Data
            </button>
          </div>
        }
      />

      <section className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-primary/5" />

        <div className="relative flex flex-col items-center gap-6 md:flex-row">
          <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-3xl bg-primary/10 text-3xl font-bold text-primary">
            {getInitials(member.namaLengkap)}
          </div>

          <div className="flex-1 text-center md:text-left">
            <div className="flex flex-col items-center gap-3 md:flex-row md:flex-wrap">
              <h1 className="text-2xl font-bold text-text">
                {member.namaLengkap || "Anggota"}
              </h1>

              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                NIS: {member.nis || "-"}
              </span>

              {member.kodeAnggota && (
                <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-bold text-text-muted">
                  {member.kodeAnggota}
                </span>
              )}
            </div>

            <p className="mt-2 text-base font-semibold text-primary">
              {member.jabatanOrganisasi || "Anggota"}
              {data.division ? ` · ${labelDivisi(data.division)}` : ""}
            </p>

            <div className="mt-4 flex flex-wrap justify-center gap-3 md:justify-start">
              <ProfileChip icon="school" label={member.namaKelas || "-"} />
              <ProfileChip
                icon="verified"
                label={labelStatus(member.statusKeanggotaan)}
              />
              <ProfileChip
                icon="calendar_month"
                label={`Periode ${data.period?.namaPeriode || "-"}`}
              />
            </div>
          </div>
        </div>
      </section>

      {formMessage && (
        <div className="mt-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {formMessage}
        </div>
      )}

      {editing && (
        <form
          onSubmit={handleSave}
          className="mt-6 rounded-2xl border border-primary/20 bg-card p-6 shadow-sm"
        >
          <SectionTitle
            icon="edit"
            title="Edit Biodata"
            description="Perbarui data pribadi dan kontakmu. Data organisasi dikelola oleh pembina."
          />

          <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
            <EditField name="namaLengkap" label="Nama Lengkap" value={form.namaLengkap} onChange={updateForm} required />
            <EditField name="nis" label="NIS" value={form.nis} onChange={updateForm} required />
            <EditField name="namaKelas" label="Kelas" type="select" value={form.namaKelas} onChange={updateForm} options={["X", "XI", "XII"]} required />
            <EditField name="jenisKelamin" label="Jenis Kelamin" type="select" value={form.jenisKelamin} onChange={updateForm} options={["laki-laki", "perempuan"]} required />
            <EditField name="nomorTelepon" label="Nomor Telepon" value={form.nomorTelepon} onChange={updateForm} required />
            <EditField name="alamat" label="Alamat Lengkap" value={form.alamat} onChange={updateForm} required />
            <EditField name="motivasi" label="Motivasi Bergabung" type="textarea" value={form.motivasi} onChange={updateForm} />
            <EditField name="pengalamanOrganisasi" label="Pengalaman Organisasi" type="textarea" value={form.pengalamanOrganisasi} onChange={updateForm} />
          </div>

          {formError && (
            <p className="mt-5 rounded-xl bg-error-bg px-4 py-3 text-sm font-medium text-error-text">
              {formError}
            </p>
          )}

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setEditing(false)} disabled={saving} className="min-h-11 rounded-xl border border-border px-5 text-sm font-bold text-text hover:bg-surface disabled:opacity-60">
              Batal
            </button>
            <button type="submit" disabled={saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-white hover:bg-primary-hover disabled:opacity-60">
              <AppIcon name="save" size={18} />
              {saving ? "Menyimpan..." : "Simpan Perubahan"}
            </button>
          </div>
        </form>
      )}

      <section className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-5">
        <div className="space-y-6 xl:col-span-3">
          <InfoCard icon="person" title="Informasi Pribadi">
            <div className="grid grid-cols-1 gap-x-10 gap-y-6 md:grid-cols-2">
              <InfoItem label="Nama Lengkap" value={member.namaLengkap || "-"} />
              <InfoItem label="NIS" value={member.nis || "-"} />
              <InfoItem label="Kelas" value={member.namaKelas || "-"} />
              <InfoItem
                label="Jenis Kelamin"
                value={labelJenisKelamin(member.jenisKelamin)}
              />
              <InfoItem
                label="Alamat Lengkap"
                value={member.alamat || "-"}
                full
              />
            </div>
          </InfoCard>

          <InfoCard icon="mail" title="Informasi Kontak">
            <div className="space-y-4">
              <ContactItem
                icon="mail"
                label="Email"
                value={member.email || "-"}
              />
              <ContactItem
                icon="phone"
                label="Nomor Telepon"
                value={formatPhone(member.nomorTelepon)}
              />
            </div>
          </InfoCard>

          <InfoCard icon="description" title="Informasi Pendaftaran">
            <div className="space-y-5">
              <InfoItem
                label="Motivasi Bergabung"
                value={member.motivasi || "-"}
              />
              <InfoItem
                label="Pengalaman Organisasi"
                value={member.pengalamanOrganisasi || "Belum ada"}
              />
            </div>
          </InfoCard>
        </div>

        <div className="space-y-6 xl:col-span-2">
          <InfoCard icon="groups" title="Informasi Organisasi">
            <div className="space-y-5">
              <InfoItem
                label="Kode Anggota"
                value={member.kodeAnggota || "-"}
              />
              <InfoItem
                label="Jabatan"
                value={member.jabatanOrganisasi || "Anggota"}
              />
              <InfoItem
                label="Divisi / Sekbid"
                value={labelDivisi(data.division)}
              />
              <InfoItem
                label="Periode"
                value={data.period?.namaPeriode || "-"}
              />

              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl border border-border bg-surface p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
                    Status
                  </p>
                  <p className="mt-2 text-sm font-bold text-primary">
                    {labelStatus(member.statusKeanggotaan)}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-surface p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
                    Bergabung
                  </p>
                  <p className="mt-2 text-sm font-semibold text-text">
                    {formatDate(member.bergabungPada)}
                  </p>
                </div>
              </div>
            </div>
          </InfoCard>

          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <SectionTitle
              icon="history"
              title="Riwayat Data"
              description="Waktu pendaftaran dan pembaruan data anggota."
            />

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <InfoItem
                label="Diajukan"
                value={formatDate(member.diajukanPada)}
              />
              <InfoItem
                label="Ditinjau"
                value={formatDate(member.ditinjauPada)}
              />
              <InfoItem
                label="Terakhir Diperbarui"
                value={formatDate(member.diperbaruiPada)}
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function EditField({ name, label, type = "text", value, onChange, options, required }) {
  const className = "min-h-11 w-full rounded-xl border border-border bg-input px-4 text-sm text-text outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

  return (
    <label className={type === "textarea" ? "md:col-span-2" : ""}>
      <span className="mb-2 block text-xs font-bold text-text-muted">
        {label}{required && <span className="ml-1 text-error-text">*</span>}
      </span>
      {type === "textarea" ? (
        <textarea name={name} value={value} onChange={onChange} rows={3} className={`${className} py-3`} />
      ) : type === "select" ? (
        <select name={name} value={value} onChange={onChange} className={className} required={required}>
          <option value="">Pilih {label.toLowerCase()}</option>
          {options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      ) : (
        <input name={name} value={value} onChange={onChange} className={className} required={required} />
      )}
    </label>
  );
}

function ProfileChip({ icon, label }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm font-medium text-text">
      <span className="text-primary">
        <AppIcon name={icon} size={18} />
      </span>
      {label}
    </span>
  );
}

function InfoCard({ icon, title, children }) {
  return (
    <article className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <SectionTitle icon={icon} title={title} />
      <div className="mt-6">{children}</div>
    </article>
  );
}

function InfoItem({ label, value, full = false }) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-semibold leading-6 text-text">
        {value || "-"}
      </p>
    </div>
  );
}

function ContactItem({ icon, label, value }) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-surface p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <AppIcon name={icon} size={20} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
          {label}
        </p>
        <p className="mt-1 break-all text-sm font-semibold text-text">
          {value || "-"}
        </p>
      </div>
    </div>
  );
}
