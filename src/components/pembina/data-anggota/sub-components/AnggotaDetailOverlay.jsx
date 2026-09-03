"use client";

import { useCallback, useMemo, useState } from "react";
import { collection, doc, getDocs, writeBatch } from "firebase/firestore";

import AppIcon from "@/components/global/AppIcon";
import {
  Avatar,
  MemberStatusBadge,
} from "../DataAnggotaUi";
import {
  formatDate,
  formatDateTime,
  percentage,
} from "../dataAnggotaHelpers";
import {
  KOLEKSI,
  OPSI_STATUS_ANGGOTA,
  STATUS_KEANGGOTAAN,
  STATUS_RESMI_ANGGOTA,
  buatPayloadReviewAnggota,
  buatPayloadStatusAnggota,
} from "../konfigurasiDataAnggota";
import { useDb } from "@/context/DbContext";
import { useOverlay } from "@/context/ui/OverlayContext";
import { useCollection } from "@/hooks/useCollection";

function divisionLabel(member) {
  const division = member?.divisi;

  if (!division) return "-";

  const name = String(division.namaSingkat || division.nama || "").trim();
  return name || "-";
}

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function collectionRows(result) {
  return Array.isArray(result?.rows) ? result.rows : [];
}

function isBadanPengurusHarian(divisi) {
  const kode = String(divisi?.kode || "").trim().toUpperCase();
  const nama = String(divisi?.namaSingkat || divisi?.nama || "")
    .trim()
    .toLowerCase();

  return (
    kode === "BPH" ||
    nama === "badan pengurus harian" ||
    nama === "badan pengurus harian osis"
  );
}

function labelDivisi(divisi) {
  return String(divisi?.namaSingkat || divisi?.nama || "-").trim() || "-";
}

const JABATAN_BPH = Object.freeze([
  "Ketua",
  "Wakil",
  "Sekretaris",
  "Bendahara",
]);

const JABATAN_SEKBID = Object.freeze([
  "Ketua",
  "Anggota",
]);

export function useAnggotaDetailOverlay() {
  const { openOverlay, closeOverlay } = useOverlay();

  const openAnggotaDetail = useCallback(
    (member) => {
      if (!member) return;

      openOverlay({
        closeOnBackdrop: true,
        content: (
          <AnggotaDetailModal
            member={member}
            onClose={() => closeOverlay()}
          />
        ),
      });
    },
    [openOverlay, closeOverlay]
  );

  return { openAnggotaDetail };
}

export default function AnggotaDetailModal({ member, onClose }) {
  const { db, updateDoc, serverTimestamp } = useDb();
  const { openOverlay, closeOverlay, closeAllOverlays } = useOverlay();

  const [savingDecision, setSavingDecision] = useState(null);
  const [deletingMember, setDeletingMember] = useState(false);
  const [decisionError, setDecisionError] = useState("");
  const [organisasiAktif, setOrganisasiAktif] = useState(() => ({
    idDivisi: member?.idDivisi || "",
    jabatanOrganisasi: member?.jabatanOrganisasi || "Anggota",
    divisi: member?.divisi || null,
  }));

  const attendance = percentage(member?.ringkasan?.persentaseKehadiran);
  const hasAttendance = Boolean(member?.ringkasan);
  const isPendingReview = member?.statusKeanggotaan === STATUS_KEANGGOTAAN.MENUNGGU_REVIEW;
  const canChangeOfficialStatus = STATUS_RESMI_ANGGOTA.includes(
    member?.statusKeanggotaan
  );

  const contactItems = [
    ["Email", member?.email],
    ["Nomor telepon", member?.nomorTelepon],
  ].filter(([, value]) => hasValue(value));

  const waktuPengajuan =
    member?.waktuPengajuanReview || member?.diajukanPada || null;

  const openStatusPicker = () => {
    setDecisionError("");

    openOverlay({
      closeOnBackdrop: true,
      content: (
        <StatusPickerModal
          member={member}
          onClose={() => closeOverlay()}
        />
      ),
    });
  };

  const openOrganisasiPicker = () => {
    setDecisionError("");

    openOverlay({
      closeOnBackdrop: true,
      content: (
        <OrganisasiPickerModal
          member={{
            ...member,
            idDivisi: organisasiAktif.idDivisi,
            jabatanOrganisasi: organisasiAktif.jabatanOrganisasi,
            divisi: organisasiAktif.divisi,
          }}
          onSaved={(nextValue) => setOrganisasiAktif(nextValue)}
          onClose={() => closeOverlay()}
        />
      ),
    });
  };

  const handleReviewDecision = async (nextStatus) => {
    if (!member?.id || savingDecision) return;

    setSavingDecision(nextStatus);
    setDecisionError("");

    try {
      const waktu = serverTimestamp();
      const payload = buatPayloadReviewAnggota({
        statusKeanggotaan: nextStatus,
        waktu,
        isiBergabungPada:
          nextStatus === STATUS_KEANGGOTAAN.AKTIF && !member?.bergabungPada,
      });

      if (nextStatus === STATUS_KEANGGOTAAN.AKTIF) {
        if (!member?.idPengguna) {
          throw new Error(
            "Pendaftaran tidak memiliki relasi idPengguna ke collection Users."
          );
        }

        // Approval harus konsisten: status Anggota dan role akun diubah
        // dalam satu batch Firestore. Jika salah satu gagal, keduanya batal.
        const batch = writeBatch(db);

        batch.update(
          doc(db, KOLEKSI.ANGGOTA, member.id),
          payload
        );

        batch.update(
          doc(db, "Users", member.idPengguna),
          {
            role: "anggota",
            updatedAt: waktu,
          }
        );

        await batch.commit();
      } else {
        // Penolakan hanya mengubah status pendaftaran. Role Users tetap
        // seperti sebelumnya dan tidak diberikan role anggota.
        await updateDoc(KOLEKSI.ANGGOTA, member.id, payload);
      }

      closeAllOverlays();
    } catch (error) {
      console.error("UPDATE MEMBER REVIEW ERROR:", error);
      setDecisionError(
        error?.message ===
          "Pendaftaran tidak memiliki relasi idPengguna ke collection Users."
          ? "Pendaftaran ini belum terhubung ke akun pengguna. Pastikan field idPengguna tersimpan sebelum menerima pendaftaran."
          : "Status pendaftaran belum berhasil diubah. Periksa koneksi dan izin Firestore."
      );
    } finally {
      setSavingDecision(null);
    }
  };

  const handleDeleteMember = async () => {
    if (!member?.id || deletingMember) return;

    const confirmed = window.confirm(
      `Hapus seluruh data anggota “${member?.namaLengkap || "anggota ini"}”? Tindakan ini akan menghapus data anggota, akun terkait, ringkasan absensi, dan referensi di kegiatan.`
    );

    if (!confirmed) return;

    setDeletingMember(true);
    setDecisionError("");

    try {
      const batch = writeBatch(db);

      if (member?.idPengguna) {
        batch.delete(doc(db, "Users", member.idPengguna));
      }

      batch.delete(doc(db, KOLEKSI.ANGGOTA, member.id));
      batch.delete(doc(db, KOLEKSI.RINGKASAN_ABSENSI, member.id));

      const kegiatanSnap = await getDocs(collection(db, "Kegiatan"));

      kegiatanSnap.forEach((activityDoc) => {
        const data = activityDoc.data() || {};
        const next = {};

        if (data.idPenanggungJawab === member.id) {
          next.idPenanggungJawab = null;
        }

        if (Array.isArray(data.idAnggotaPanitia)) {
          const nextPanitia = data.idAnggotaPanitia.filter((id) => id !== member.id);
          if (nextPanitia.length !== data.idAnggotaPanitia.length) {
            next.idAnggotaPanitia = nextPanitia;
          }
        }

        const cleanParticipantList = (list) =>
          Array.isArray(list) ? list.filter((id) => id !== member.id) : list;

        if (Array.isArray(data?.pesertaFinal?.idAnggota)) {
          const cleaned = cleanParticipantList(data.pesertaFinal.idAnggota);
          if (cleaned.length !== data.pesertaFinal.idAnggota.length) {
            next.pesertaFinal = {
              ...(data.pesertaFinal || {}),
              idAnggota: cleaned,
            };
          }
        }

        if (Array.isArray(data?.usulanPeserta?.idAnggota)) {
          const cleaned = cleanParticipantList(data.usulanPeserta.idAnggota);
          if (cleaned.length !== data.usulanPeserta.idAnggota.length) {
            next.usulanPeserta = {
              ...(data.usulanPeserta || {}),
              idAnggota: cleaned,
            };
          }
        }

        if (Object.keys(next).length) {
          batch.update(doc(db, "Kegiatan", activityDoc.id), next);
        }
      });

      await batch.commit();
      closeAllOverlays();
    } catch (error) {
      console.error("DELETE MEMBER CLEANUP ERROR:", error);
      setDecisionError(
        error?.message || "Data anggota belum berhasil dihapus. Periksa koneksi dan izin Firestore."
      );
    } finally {
      setDeletingMember(false);
    }
  };

  return (
    <section className="max-h-[calc(100dvh-2rem)] w-full max-w-3xl overflow-y-auto rounded-3xl border border-border bg-card shadow-2xl sm:max-h-[calc(100dvh-3rem)]">
      <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-card/95 p-5 backdrop-blur sm:p-6">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar name={member?.namaLengkap} size="lg" />

          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">
              Detail Anggota
            </p>
            <h2 className="mt-1 truncate text-xl font-bold text-text sm:text-2xl">
              {member?.namaLengkap || "-"}
            </h2>
            <p className="mt-1 text-sm text-text-muted">
              {organisasiAktif.jabatanOrganisasi || "Anggota"}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup detail anggota"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-input text-text-muted transition hover:bg-error-bg hover:text-error-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <AppIcon name="close" size={21} />
        </button>
      </header>

      <div className="space-y-6 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface p-4">
          <div>
            <p className="text-xs font-semibold text-text-muted">
              Status keanggotaan
            </p>
            <p className="mt-1 text-sm font-semibold text-text">
              Data anggota tersimpan pada periode {member?.periodeData?.namaPeriode || "-"}
            </p>
          </div>
          <MemberStatusBadge status={member?.statusKeanggotaan} />
        </div>

        <DetailSection title="Informasi Organisasi" icon="badge">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <DetailItem label="NIS" value={member?.nis || "-"} />
            <DetailItem label="Kelas" value={member?.namaKelas || "-"} />
            <DetailItem
              label="Jabatan"
              value={organisasiAktif.jabatanOrganisasi || "Anggota"}
            />
            <DetailItem
              label="Divisi / Sekbid"
              value={labelDivisi(organisasiAktif.divisi)}
            />
            <DetailItem label="Periode" value={member?.periodeData?.namaPeriode || "-"} />
            <DetailItem
              label="Tanggal bergabung"
              value={formatDate(member?.bergabungPada)}
            />
          </div>

          {canChangeOfficialStatus && (
            <button
              type="button"
              onClick={openOrganisasiPicker}
              className="mt-3 inline-flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 text-sm font-bold text-primary transition hover:border-primary/60 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <span className="inline-flex items-center gap-2">
                <AppIcon name="manage_accounts" size={20} />
                Ubah Sekbid / Jabatan
              </span>
              <AppIcon name="chevron_right" size={20} />
            </button>
          )}
        </DetailSection>

        {contactItems.length > 0 && (
          <DetailSection title="Kontak" icon="mail">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {contactItems.map(([label, value]) => (
                <DetailItem key={label} label={label} value={value} />
              ))}
            </div>
          </DetailSection>
        )}

        {hasAttendance && (
          <DetailSection title="Ringkasan Kehadiran" icon="event_available">
            <div className="rounded-2xl border border-border bg-surface p-4">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold text-text-muted">
                    Persentase kehadiran
                  </p>
                  <p className="mt-1 text-3xl font-bold text-text">
                    {attendance}%
                  </p>
                </div>

                <p className="text-right text-sm text-text-muted">
                  {member?.ringkasan?.jumlahKegiatan || 0} kegiatan
                </p>
              </div>

              <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-input">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-500"
                  style={{ width: `${attendance}%` }}
                />
              </div>
            </div>
          </DetailSection>
        )}

        <DetailSection title="Riwayat Data" icon="calendar_month">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {waktuPengajuan && (
              <DetailItem
                label="Tanggal pengajuan"
                value={formatDateTime(waktuPengajuan)}
              />
            )}
            <DetailItem
              label="Dibuat"
              value={formatDateTime(member?.dibuatPada)}
            />
            <DetailItem
              label="Terakhir diperbarui"
              value={formatDateTime(member?.diperbaruiPada)}
            />
          </div>
        </DetailSection>

        {(isPendingReview || canChangeOfficialStatus) && (
          <section className="border-t border-border pt-6">
            {decisionError && (
              <div
                role="alert"
                className="mb-4 rounded-2xl bg-error-bg px-4 py-3 text-sm font-medium text-error-text"
              >
                {decisionError}
              </div>
            )}

            {isPendingReview ? (
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  disabled={Boolean(savingDecision)}
                  onClick={() => handleReviewDecision(STATUS_KEANGGOTAAN.AKTIF)}
                  className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-white transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <AppIcon name="check" size={20} />
                  {savingDecision === STATUS_KEANGGOTAAN.AKTIF
                    ? "Menerima pendaftaran..."
                    : "Terima Pendaftaran"}
                </button>

                <button
                  type="button"
                  disabled={Boolean(savingDecision)}
                  onClick={() => handleReviewDecision(STATUS_KEANGGOTAAN.DITOLAK)}
                  className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-error-text px-5 text-sm font-bold text-error-text transition hover:bg-error-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error-text focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <AppIcon name="close" size={20} />
                  {savingDecision === STATUS_KEANGGOTAAN.DITOLAK
                    ? "Menolak pendaftaran..."
                    : "Tolak Pendaftaran"}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={openStatusPicker}
                className="inline-flex min-h-12 w-full items-center justify-between gap-3 rounded-xl bg-primary px-5 text-sm font-bold text-white transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                <span className="inline-flex items-center gap-2">
                  <AppIcon name="settings" size={20} />
                  Ubah Status Aktif
                </span>
                <AppIcon name="chevron_right" size={21} />
              </button>
            )}

            <button
              type="button"
              disabled={Boolean(deletingMember) || Boolean(savingDecision)}
              onClick={handleDeleteMember}
              className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-5 text-sm font-bold text-red-700 transition hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <AppIcon name="delete_forever" size={20} />
              {deletingMember ? "Menghapus data anggota..." : "Hapus Data Anggota"}
            </button>
          </section>
        )}
      </div>
    </section>
  );
}

function OrganisasiPickerModal({ member, onSaved, onClose }) {
  const { colRef, updateDoc, serverTimestamp } = useDb();

  const divisi = useCollection(() => colRef(KOLEKSI.DIVISI), [], {
    enabled: true,
  });

  const [idDivisi, setIdDivisi] = useState(member?.idDivisi || "");
  const [jabatan, setJabatan] = useState(
    member?.jabatanOrganisasi || "Anggota"
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const daftarDivisi = useMemo(
    () =>
      [...collectionRows(divisi)].sort((a, b) =>
        labelDivisi(a).localeCompare(labelDivisi(b), "id")
      ),
    [divisi]
  );

  const divisiTerpilih = useMemo(
    () => daftarDivisi.find((item) => item.id === idDivisi) || null,
    [daftarDivisi, idDivisi]
  );

  const opsiJabatan = isBadanPengurusHarian(divisiTerpilih)
    ? JABATAN_BPH
    : JABATAN_SEKBID;

  const handlePilihDivisi = (nextIdDivisi) => {
    const nextDivisi =
      daftarDivisi.find((item) => item.id === nextIdDivisi) || null;
    const nextOpsi = isBadanPengurusHarian(nextDivisi)
      ? JABATAN_BPH
      : JABATAN_SEKBID;

    setIdDivisi(nextIdDivisi);
    setJabatan((current) =>
      nextOpsi.includes(current)
        ? current
        : isBadanPengurusHarian(nextDivisi)
          ? "Ketua"
          : "Anggota"
    );
    setError("");
  };

  const handleSimpan = async () => {
    if (!member?.id || saving) return;

    if (!idDivisi || !divisiTerpilih) {
      setError("Pilih Sekbid atau Badan Pengurus Harian terlebih dahulu.");
      return;
    }

    if (!opsiJabatan.includes(jabatan)) {
      setError("Jabatan yang dipilih tidak sesuai dengan divisi.");
      return;
    }

    const tidakBerubah =
      idDivisi === member?.idDivisi &&
      jabatan === (member?.jabatanOrganisasi || "Anggota");

    if (tidakBerubah) {
      onClose?.();
      return;
    }

    setSaving(true);
    setError("");

    try {
      await updateDoc(KOLEKSI.ANGGOTA, member.id, {
        idDivisi,
        jabatanOrganisasi: jabatan,
        diperbaruiPada: serverTimestamp(),
      });

      onSaved?.({
        idDivisi,
        jabatanOrganisasi: jabatan,
        divisi: divisiTerpilih,
      });
      onClose?.();
    } catch (updateError) {
      console.error("UPDATE ORGANISASI ANGGOTA ERROR:", updateError);
      setError(
        "Sekbid atau jabatan belum berhasil diubah. Periksa koneksi dan izin Firestore."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="w-full max-w-lg overflow-hidden rounded-3xl border border-border bg-card shadow-2xl">
      <header className="flex items-start justify-between gap-4 border-b border-border p-5 sm:p-6">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">
            Organisasi Anggota
          </p>
          <h2 className="mt-1 text-xl font-bold text-text">
            Ubah Sekbid / Jabatan
          </h2>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            Atur penempatan organisasi untuk{" "}
            <span className="font-semibold text-text">
              {member?.namaLengkap || "anggota ini"}
            </span>
            .
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup pengaturan organisasi"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-input text-text-muted transition hover:bg-error-bg hover:text-error-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <AppIcon name="close" size={21} />
        </button>
      </header>

      <div className="space-y-5 p-5 sm:p-6">
        {error && (
          <div
            role="alert"
            className="rounded-2xl bg-error-bg px-4 py-3 text-sm font-medium text-error-text"
          >
            {error}
          </div>
        )}

        {divisi.error && (
          <div
            role="alert"
            className="rounded-2xl bg-error-bg px-4 py-3 text-sm font-medium text-error-text"
          >
            Data divisi tidak dapat dimuat.
          </div>
        )}

        <div>
          <label
            htmlFor="ubah-divisi-anggota"
            className="mb-2 block text-xs font-bold uppercase tracking-[0.08em] text-text-muted"
          >
            Sekbid / Divisi
          </label>

          <div className="relative">
            <select
              id="ubah-divisi-anggota"
              value={idDivisi}
              disabled={saving || divisi.loading}
              onChange={(event) => handlePilihDivisi(event.target.value)}
              className="min-h-12 w-full appearance-none rounded-xl border border-border bg-card px-4 pr-11 text-sm font-semibold text-text outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">
                {divisi.loading ? "Memuat divisi..." : "Pilih divisi"}
              </option>

              {daftarDivisi.map((item) => (
                <option key={item.id} value={item.id}>
                  {labelDivisi(item)}
                </option>
              ))}
            </select>

            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-text-muted">
              <AppIcon name="expand_more" size={21} />
            </span>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.08em] text-text-muted">
            Jabatan
          </p>

          <div className="grid grid-cols-2 gap-2">
            {opsiJabatan.map((item) => {
              const aktif = jabatan === item;

              return (
                <button
                  key={item}
                  type="button"
                  disabled={saving || !idDivisi}
                  onClick={() => {
                    setJabatan(item);
                    setError("");
                  }}
                  className={`min-h-11 rounded-xl border px-3 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50 ${
                    aktif
                      ? "border-primary bg-primary text-white"
                      : "border-border bg-card text-text hover:border-primary/50 hover:bg-surface"
                  }`}
                >
                  {item}
                </button>
              );
            })}
          </div>

          <p className="mt-2 text-xs leading-5 text-text-muted">
            {isBadanPengurusHarian(divisiTerpilih)
              ? "Badan Pengurus Harian menggunakan jabatan Ketua, Wakil, Sekretaris, atau Bendahara."
              : "Pada Sekbid, Ketua tetap ditulis sebagai “Ketua”. Identitas Sekbid ditentukan dari divisinya."}
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-xs font-semibold text-text-muted">
            Penempatan baru
          </p>
          <div className="mt-2 flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <AppIcon name="badge" size={20} />
            </span>
            <div className="min-w-0">
              <p className="font-bold text-text">{jabatan || "-"}</p>
              <p className="mt-0.5 break-words text-sm text-text-muted">
                {divisiTerpilih ? labelDivisi(divisiTerpilih) : "Belum memilih divisi"}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="min-h-11 rounded-xl border border-border px-5 text-sm font-bold text-text transition hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            Batal
          </button>

          <button
            type="button"
            disabled={
              saving ||
              divisi.loading ||
              Boolean(divisi.error) ||
              !idDivisi ||
              !divisiTerpilih
            }
            onClick={handleSimpan}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-white transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <AppIcon name={saving ? "hourglass_top" : "save"} size={19} />
            {saving ? "Menyimpan..." : "Simpan Perubahan"}
          </button>
        </div>
      </div>
    </section>
  );
}

function StatusPickerModal({ member, onClose }) {
  const { updateDoc, serverTimestamp } = useDb();
  const { closeAllOverlays } = useOverlay();

  const [savingStatus, setSavingStatus] = useState(null);
  const [error, setError] = useState("");

  const handleSelectStatus = async (nextStatus) => {
    if (
      !member?.id ||
      savingStatus ||
      nextStatus === member?.statusKeanggotaan
    ) {
      return;
    }

    setSavingStatus(nextStatus);
    setError("");

    try {
      await updateDoc(
        KOLEKSI.ANGGOTA,
        member.id,
        buatPayloadStatusAnggota({
          statusKeanggotaan: nextStatus,
          waktu: serverTimestamp(),
        })
      );

      closeAllOverlays();
    } catch (updateError) {
      console.error("UPDATE MEMBER STATUS ERROR:", updateError);
      setError(
        "Status anggota belum berhasil diubah. Periksa koneksi dan izin Firestore."
      );
    } finally {
      setSavingStatus(null);
    }
  };

  return (
    <section className="w-full max-w-md overflow-hidden rounded-3xl border border-border bg-card shadow-2xl">
      <header className="flex items-start justify-between gap-4 border-b border-border p-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">
            Status Anggota
          </p>
          <h2 className="mt-1 text-xl font-bold text-text">
            Ubah Status Aktif
          </h2>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            Pilih status baru untuk {member?.namaLengkap || "anggota ini"}.
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup pilihan status"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-input text-text-muted transition hover:bg-error-bg hover:text-error-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <AppIcon name="close" size={21} />
        </button>
      </header>

      <div className="space-y-3 p-5">
        {error && (
          <div
            role="alert"
            className="rounded-2xl bg-error-bg px-4 py-3 text-sm font-medium text-error-text"
          >
            {error}
          </div>
        )}

        {OPSI_STATUS_ANGGOTA.map((option) => {
          const isCurrent = option.value === member?.statusKeanggotaan;
          const isSaving = savingStatus === option.value;

          return (
            <button
              key={option.value}
              type="button"
              disabled={Boolean(savingStatus) || isCurrent}
              onClick={() => handleSelectStatus(option.value)}
              className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed ${
                isCurrent
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:border-primary/50 hover:bg-surface"
              } ${Boolean(savingStatus) && !isSaving ? "opacity-60" : ""}`}
            >
              <span
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${option.iconClassName}`}
              >
                <AppIcon name={option.icon} size={22} />
              </span>

              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-text">
                  {option.label}
                </span>
                <span className="mt-1 block text-xs leading-5 text-text-muted">
                  {option.description}
                </span>
              </span>

              <span className="shrink-0 text-primary">
                {isCurrent ? (
                  <AppIcon name="check" size={21} />
                ) : (
                  <AppIcon name="chevron_right" size={21} />
                )}
              </span>
            </button>
          );
        })}

        {savingStatus && (
          <p className="pt-1 text-center text-xs font-semibold text-text-muted">
            Menyimpan perubahan status...
          </p>
        )}
      </div>
    </section>
  );
}

function DetailSection({ title, icon, children }) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <AppIcon name={icon} size={18} />
        </span>
        <h3 className="font-bold text-text">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function DetailItem({ label, value }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs font-semibold text-text-muted">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-text">
        {value || "-"}
      </p>
    </div>
  );
}