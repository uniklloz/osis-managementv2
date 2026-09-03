"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import AppIcon from "@/components/global/AppIcon";
import { useDb } from "@/context/DbContext";
import { useOverlay } from "@/context/ui/OverlayContext";
import { db } from "@/lib/firebase-config";
import { collection, doc, writeBatch } from "firebase/firestore";
import {
  uploadProposalCloudinary,
  validasiFileProposal,
} from "@/lib/uploadProposalCloudinary";
import { buatIdReferensiKegiatan } from "@/lib/codefication";
import {
  JENIS_KEGIATAN,
  KOLEKSI,
  MODE_JADWAL,
  STATUS_JADWAL,
  STATUS_KEGIATAN,
  buatPayloadKegiatan,
} from "@/components/pembina/kegiatan/konfigurasiManajemenKegiatan";
import PilihPesertaRapatOverlay from "./PilihPesertaRapatOverlay";

const DRAF_RAPAT = Object.freeze({
  namaRapat: "",
  agenda: "",
  tanggal: "",
  waktuMulai: "",
  waktuSelesai: "",
  lokasi: "",
  catatanTambahan: "",
});

function toDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function gabungkanTanggalWaktu(tanggal, waktu) {
  if (!tanggal || !waktu) return null;
  const value = new Date(`${tanggal}T${waktu}:00`);
  return Number.isNaN(value.getTime()) ? null : value;
}

function hitungDurasiMenit(mulai, selesai) {
  if (!(mulai instanceof Date) || !(selesai instanceof Date)) return 0;
  const durasi = Math.floor((selesai.getTime() - mulai.getTime()) / 60000);
  return durasi > 0 ? durasi : 0;
}

function labelDivisi(divisi) {
  return divisi?.namaSingkat || divisi?.nama || "-";
}

function buatJadwalRencana({ tanggal, waktuMulai, waktuSelesai, durasiMenit }) {
  return {
    modeJadwal: MODE_JADWAL.SEKALI,
    tanggalMulaiPertama: tanggal,
    tanggalSelesaiPertama: tanggal,
    jumlahHariPerPelaksanaan: 1,
    jamMulaiDefault: waktuMulai,
    jamSelesaiDefault: waktuSelesai,
    templateSesi: [
      {
        selisihHari: 0,
        jamMulai: waktuMulai,
        jamSelesai: waktuSelesai,
        durasiMenit,
      },
    ],
  };
}

function buatPengulanganRencana() {
  return {
    cakupan: "periode",
    aktif: false,
    frekuensi: null,
    interval: null,
    sampai: null,
  };
}

function participantFromMember(item) {
  return {
    id: item.id,
    namaLengkap: item.namaLengkap || "Anggota",
    nis: item.nis || null,
    idDivisi: item.idDivisi || null,
    jabatanOrganisasi: item.jabatanOrganisasi || "Anggota",
    labelDivisi: item.labelDivisi || labelDivisi(item.divisiData),
    terpilih: true,
  };
}

export function useAjukanRapatOverlay() {
  const { openOverlay, closeOverlay } = useOverlay();

  const openAjukanRapat = useCallback(
    ({ member, divisi, jenisKegiatan = JENIS_KEGIATAN.RAPAT }) => {
      if (!member?.id) return;

      openOverlay({
        closeOnBackdrop: true,
        content: (
          <AjukanRapatModal
            member={member}
            divisi={divisi}
            jenisKegiatan={jenisKegiatan}
            onClose={() => closeOverlay()}
          />
        ),
      });
    },
    [openOverlay, closeOverlay]
  );

  return { openAjukanRapat };
}

export default function AjukanRapatModal({
  member,
  divisi,
  jenisKegiatan = JENIS_KEGIATAN.RAPAT,
  onClose,
}) {
  const { serverTimestamp } = useDb();

  const [form, setForm] = useState(() => ({ ...DRAF_RAPAT }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null);
  const [selectedProposalFile, setSelectedProposalFile] = useState(null);
  const proposalInputRef = useRef(null);

  const [participantPickerMode, setParticipantPickerMode] = useState(null);
  const [participantSource, setParticipantSource] = useState(null);
  const [participants, setParticipants] = useState([]);

  const waktuMulai = useMemo(
    () => gabungkanTanggalWaktu(form.tanggal, form.waktuMulai),
    [form.tanggal, form.waktuMulai]
  );

  const waktuSelesai = useMemo(
    () => gabungkanTanggalWaktu(form.tanggal, form.waktuSelesai),
    [form.tanggal, form.waktuSelesai]
  );

  const durasiMenit = useMemo(
    () => hitungDurasiMenit(waktuMulai, waktuSelesai),
    [waktuMulai, waktuSelesai]
  );

  const selectedParticipants = useMemo(
    () => participants.filter((item) => item.terpilih),
    [participants]
  );

  const update = (field) => (event) => {
    setForm((current) => ({
      ...current,
      [field]: event.target.value,
    }));
  };

  const applyParticipantGroup = (rows, source) => {
    setParticipants(rows.map(participantFromMember));
    setParticipantSource(source || null);
    setError("");
  };

  const addManualParticipants = (rows) => {
    setParticipants((current) => {
      const map = new Map(current.map((item) => [item.id, item]));

      rows.forEach((row) => {
        const existing = map.get(row.id);
        map.set(row.id, {
          ...(existing || participantFromMember(row)),
          terpilih: true,
        });
      });

      return Array.from(map.values()).sort((a, b) =>
        String(a.namaLengkap || "").localeCompare(String(b.namaLengkap || ""), "id")
      );
    });

    setParticipantSource((current) => current || {
      tipe: "manual",
      key: "manual",
      label: "Dipilih Manual",
      idDivisi: null,
    });
    setError("");
  };

  const toggleParticipant = (id) => {
    setParticipants((current) =>
      current.map((item) =>
        item.id === id ? { ...item, terpilih: !item.terpilih } : item
      )
    );
  };

  const handleProposalFileChange = (event) => {
    const file = event.target.files?.[0] || null;
    if (!file) return;

    const validationError = validasiFileProposal(file);
    if (validationError) {
      setError(validationError);
      event.target.value = "";
      return;
    }

    setSelectedProposalFile(file);
    setError("");
  };

  const validate = () => {
    if (!member?.id) return "Data anggota tidak ditemukan.";
    if (!member?.idDivisi) return "Anggota belum memiliki relasi Divisi/Sekbid.";
    if (!member?.idPeriode) return "Anggota belum memiliki relasi periode aktif.";

    if (form.namaRapat.trim().length < 5) {
      return "Nama rapat minimal 5 karakter.";
    }

    if (form.agenda.trim().length < 10) {
      return "Agenda atau tujuan rapat minimal 10 karakter.";
    }

    if (!form.tanggal) return "Tanggal rapat wajib dipilih.";
    if (!form.waktuMulai || !form.waktuSelesai) {
      return "Waktu mulai dan selesai wajib diisi.";
    }

    if (!waktuMulai || !waktuSelesai || durasiMenit <= 0) {
      return "Waktu selesai harus lebih akhir daripada waktu mulai.";
    }

    if (form.lokasi.trim().length < 3) {
      return "Lokasi rapat minimal 3 karakter.";
    }

    if (!selectedParticipants.length) {
      return "Pilih minimal satu peserta rapat.";
    }

    if (!selectedProposalFile) {
      return "File proposal wajib diunggah sebelum mengirim pengajuan.";
    }

    return "";
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (saving) return;

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError("");

    try {
      const tahun = Number(String(form.tanggal).slice(0, 4));
      const idReferensi = await buatIdReferensiKegiatan(jenisKegiatan, {
        tahun,
      });

      const waktu = serverTimestamp();
      const uploadedFile = await uploadProposalCloudinary(selectedProposalFile);
      const jadwalRencana = buatJadwalRencana({
        tanggal: form.tanggal,
        waktuMulai: form.waktuMulai,
        waktuSelesai: form.waktuSelesai,
        durasiMenit,
      });

      const idPesertaRencana = selectedParticipants.map((item) => item.id);

      const pesertaRencana = {
        mode: "snapshot_pengajuan",
        sumberPemilihan: participantSource?.key || "manual",
        labelKelompok: participantSource?.label || "Dipilih Manual",
        idDivisiSumber: participantSource?.idDivisi || null,
        idAnggota: idPesertaRencana,
        jumlahPeserta: idPesertaRencana.length,
      };

      const kegiatanRef = doc(collection(db, KOLEKSI.KEGIATAN));
      const proposalRef = doc(collection(db, "Proposal"));

      const payload = buatPayloadKegiatan({
        idReferensi,
        namaKegiatan: form.namaRapat.trim(),
        deskripsi: form.agenda.trim(),
        jenisKegiatan,
        lokasi: form.lokasi.trim(),
        idPeriode: member.idPeriode,

        // Waktu ini masih merupakan usulan anggota, bukan jadwal final Pembina.
        waktuMulai,
        waktuSelesai,
        waktuSelesaiSeri: waktuSelesai,
        jumlahHariKalender: 1,
        jumlahPelaksanaan: 0,
        jumlahSesiAbsensi: 0,
        durasiMenit,

        jadwalRencana,
        pengulanganRencana: buatPengulanganRencana(),
        jumlahPelaksanaanRencana: 1,
        jumlahSesiAbsensiRencana: 1,

        jadwalFinal: null,
        pengulanganFinal: null,
        statusJadwal: STATUS_JADWAL.DIRENCANAKAN,
        sumberFinalisasiJadwal: null,
        difinalisasiPada: null,

        idDivisi: member.idDivisi,
        idPenanggungJawab: member.id,
        idAnggotaPanitia: [],
        idProposal: proposalRef.id,
        statusProposal: "menunggu_review",
        snapshotJadwalProposal: null,
        statusTim: null,

        // Pengajuan anggota masuk sebagai draf. Pembina yang memfinalisasi.
        status: STATUS_KEGIATAN.DRAF,
        statusLaporan: null,
        urlFileLaporan: null,

        // jumlahPeserta adalah realisasi/kehadiran. Kapasitas diisi dari peserta rencana.
        jumlahPeserta: 0,
        kapasitasPeserta: idPesertaRencana.length,
        pesertaRencana,

        [jenisKegiatan === JENIS_KEGIATAN.RAPAT
          ? "pengajuanRapat"
          : "pengajuanProgramKerja"]: {
          sumber: "anggota",
          status: "menunggu_review",
          jenisKegiatan,
          idPengaju: member.id,
          idPengguna: member.idPengguna || null,
          idDivisiPengaju: member.idDivisi,
          jabatanPengaju: member.jabatanOrganisasi || "Anggota",
          jumlahPesertaRencana: idPesertaRencana.length,
          catatanTambahan: form.catatanTambahan.trim() || null,
          diajukanPada: waktu,
        },

        dibuatPada: waktu,
        diperbaruiPada: waktu,
      });

      const proposalPayload = {
        idKegiatan: kegiatanRef.id,
        idPengunggah: member.id,
        uploadedBy: member.id,
        namaKegiatan: form.namaRapat.trim(),
        namaFile: uploadedFile.namaFile,
        ukuranFileByte: uploadedFile.ukuranFileByte,
        tipeFile: uploadedFile.tipeFile,
        urlFile: uploadedFile.urlFile,
        publicIdFile: uploadedFile.publicIdFile,
        assetIdFile: uploadedFile.assetIdFile,
        resourceTypeFile: uploadedFile.resourceTypeFile,
        formatFile: uploadedFile.formatFile,
        versionCloudinary: uploadedFile.versionCloudinary,
        status: "menunggu_review",
        diajukanPada: waktu,
        submittedAt: waktu,
        diperbaruiPada: waktu,
      };

      const batch = writeBatch(db);
      batch.set(kegiatanRef, payload);
      batch.set(proposalRef, proposalPayload);
      await batch.commit();

      setSuccess({
        id: kegiatanRef.id,
        idReferensi,
      });
    } catch (submitError) {
      console.error("AJUKAN RAPAT ERROR:", submitError);
      setError(
        "Pengajuan rapat belum berhasil dikirim. Periksa koneksi dan izin Firestore."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <section
        style={{
          animation:
            "ajukanRapatMasuk 220ms cubic-bezier(0.22, 1, 0.36, 1) both",
        }}
        className="max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-3xl border border-border bg-card shadow-2xl sm:max-h-[calc(100dvh-3rem)]"
      >
        <style jsx global>{`
          @keyframes ajukanRapatMasuk {
            from {
              opacity: 0;
              transform: translateY(18px) scale(0.975);
            }
            to {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }
        `}</style>

        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-card/95 p-5 backdrop-blur sm:p-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">
              {jenisKegiatan === JENIS_KEGIATAN.RAPAT
                ? "Pengajuan Rapat"
                : "Pengajuan Program Kerja"}
            </p>
            <h2 className="mt-1 text-xl font-bold text-text sm:text-2xl">
              Ajukan Kegiatan OSIS
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-text-muted">
              Kirim usulan agenda, jadwal, peserta, dan proposal kegiatan untuk ditinjau Pembina.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup pengajuan rapat"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-input text-text-muted transition hover:bg-error-bg hover:text-error-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <AppIcon name="close" size={21} />
          </button>
        </header>

        {success ? (
          <div className="p-5 sm:p-6">
            <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                <AppIcon name="check" size={28} />
              </div>
              <h3 className="mt-4 text-lg font-bold text-emerald-900">
                Pengajuan kegiatan terkirim
              </h3>
              <p className="mt-2 text-sm leading-6 text-emerald-800">
                Kode kegiatan <span className="font-bold">{success.idReferensi}</span>{" "}
                sudah dibuat dan menunggu review Pembina.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-bold text-white transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                Tutup
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6 p-5 sm:p-6">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <InfoRingkas
                icon="person"
                label="Pengaju"
                value={member?.namaLengkap || "-"}
              />
              <InfoRingkas
                icon="groups"
                label="Divisi / Sekbid"
                value={`${member?.jabatanOrganisasi || "Anggota"} · ${labelDivisi(
                  divisi
                )}`}
              />
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-2xl bg-error-bg px-4 py-3 text-sm font-medium text-error-text"
              >
                {error}
              </div>
            )}

            <FormSection
              icon="edit_calendar"
              title={jenisKegiatan === JENIS_KEGIATAN.RAPAT ? "Agenda Rapat" : "Program Kerja"}
              description={jenisKegiatan === JENIS_KEGIATAN.RAPAT
                ? "Isi identitas dan tujuan rapat yang ingin diajukan."
                : "Isi identitas dan tujuan program kerja yang ingin diajukan."}
            >
              <FormField label="Nama / Judul Rapat" required>
                <input
                  type="text"
                  value={form.namaRapat}
                  onChange={update("namaRapat")}
                  placeholder={jenisKegiatan === JENIS_KEGIATAN.RAPAT
                    ? "Contoh: Rapat Koordinasi Persiapan HUT RI"
                    : "Contoh: Bakti Sosial Sekolah"}
                  maxLength={120}
                  className={inputClass}
                />
              </FormField>

              <FormField label="Agenda / Tujuan Rapat" required>
                <textarea
                  value={form.agenda}
                  onChange={update("agenda")}
                  placeholder={jenisKegiatan === JENIS_KEGIATAN.RAPAT
                    ? "Jelaskan pokok bahasan dan hasil yang ingin dicapai dari rapat."
                    : "Jelaskan tujuan, sasaran, dan hasil yang ingin dicapai dari program kerja."}
                  rows={4}
                  maxLength={700}
                  className={`${inputClass} resize-y py-3`}
                />
              </FormField>
            </FormSection>

            <FormSection
              icon="upload_file"
              title="Proposal Kegiatan"
              description="Unggah proposal dalam format PDF, DOC, atau DOCX, maksimal 10 MB."
            >
              <input
                ref={proposalInputRef}
                type="file"
                accept=".pdf,.doc,.docx"
                className="hidden"
                onChange={handleProposalFileChange}
              />
              <button
                type="button"
                onClick={() => proposalInputRef.current?.click()}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 text-sm font-bold text-primary transition hover:bg-primary/10"
              >
                <AppIcon name="upload_file" size={19} />
                {selectedProposalFile ? "Ganti File Proposal" : "Pilih File Proposal"}
              </button>
              {selectedProposalFile && (
                <p className="truncate rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold text-text">
                  {selectedProposalFile.name}
                </p>
              )}
            </FormSection>

            <FormSection
              icon="calendar_month"
              title="Usulan Jadwal"
              description="Jadwal ini masih berupa usulan dan dapat difinalisasi kembali oleh Pembina."
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField label="Tanggal" required>
                  <input
                    type="date"
                    min={toDateInputValue()}
                    value={form.tanggal}
                    onChange={update("tanggal")}
                    className={inputClass}
                  />
                </FormField>

                <FormField label="Lokasi" required>
                  <input
                    type="text"
                    value={form.lokasi}
                    onChange={update("lokasi")}
                    placeholder="Contoh: Ruang OSIS"
                    maxLength={120}
                    className={inputClass}
                  />
                </FormField>

                <FormField label="Waktu Mulai" required>
                  <input
                    type="time"
                    value={form.waktuMulai}
                    onChange={update("waktuMulai")}
                    className={inputClass}
                  />
                </FormField>

                <FormField label="Waktu Selesai" required>
                  <input
                    type="time"
                    value={form.waktuSelesai}
                    onChange={update("waktuSelesai")}
                    className={inputClass}
                  />
                </FormField>
              </div>

              {durasiMenit > 0 && (
                <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3">
                  <p className="text-xs font-semibold text-text-muted">Durasi usulan</p>
                  <p className="mt-1 text-sm font-bold text-primary">
                    {formatDurasi(durasiMenit)}
                  </p>
                </div>
              )}
            </FormSection>

            <FormSection
              icon="groups"
                title={jenisKegiatan === JENIS_KEGIATAN.RAPAT ? "Peserta Rapat" : "Peserta Program Kerja"}
              description="Pilih kelompok peserta, lalu sesuaikan daftar dengan mencentang atau menghapus centang anggota tertentu. Anggota lain juga dapat ditambahkan secara manual."
            >
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => setParticipantPickerMode("kelompok")}
                  className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 text-sm font-bold text-primary transition hover:bg-primary/10"
                >
                  <AppIcon name="groups" size={19} />
                  {participants.length ? "Ganti Kelompok Peserta" : "Pilih Peserta"}
                </button>

                {participants.length > 0 && (
                  <div className="flex min-h-11 items-center justify-center rounded-xl bg-input px-4 text-xs font-bold text-text-muted">
                    {selectedParticipants.length} dari {participants.length} dipilih
                  </div>
                )}
              </div>

              {participantSource && (
                <div className="rounded-xl border border-border bg-card px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                    Kelompok Terpilih
                  </p>
                  <p className="mt-1 text-sm font-bold text-text">
                    {participantSource.label}
                  </p>
                </div>
              )}

              {participants.length > 0 ? (
                <div className="overflow-hidden rounded-2xl border border-border bg-card">
                  <div className="max-h-72 divide-y divide-border overflow-y-auto">
                    {participants.map((participant) => (
                      <label
                        key={participant.id}
                        className={`flex cursor-pointer items-center gap-3 px-4 py-3 transition ${
                          participant.terpilih ? "bg-card" : "bg-surface opacity-65"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={participant.terpilih}
                          onChange={() => toggleParticipant(participant.id)}
                          className="h-4 w-4 rounded border-border accent-primary"
                        />
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-xs font-bold text-primary">
                          {initials(participant.namaLengkap)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-text">
                            {participant.namaLengkap}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-text-muted">
                            {participant.jabatanOrganisasi} · {participant.labelDivisi}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>

                  <div className="border-t border-border bg-surface p-3">
                    <button
                      type="button"
                      onClick={() => setParticipantPickerMode("manual")}
                      className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-primary/40 bg-card px-4 text-sm font-bold text-primary transition hover:bg-primary/5"
                    >
                      <AppIcon name="person_add" size={18} />
                      Tambah Peserta
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border bg-card p-5 text-center">
                  <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <AppIcon name="group_add" size={22} />
                  </div>
                  <p className="mt-3 text-sm font-bold text-text">Belum ada peserta</p>
                  <p className="mt-1 text-xs leading-5 text-text-muted">
                    Klik Pilih Peserta untuk memilih BPH, sekbid, ketua sekbid, seluruh anggota OSIS, atau satu divisi tertentu.
                  </p>
                </div>
              )}

              <FormField label="Catatan Tambahan">
                <textarea
                  value={form.catatanTambahan}
                  onChange={update("catatanTambahan")}
                  placeholder="Opsional. Tambahkan kebutuhan khusus, perlengkapan, atau informasi lain untuk Pembina."
                  rows={3}
                  maxLength={500}
                  className={`${inputClass} resize-y py-3`}
                />
              </FormField>
            </FormSection>

            <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={saving}
                onClick={onClose}
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border bg-card px-5 text-sm font-bold text-text transition hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                Batal
              </button>

              <button
                type="submit"
                disabled={saving}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-white transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <AppIcon name="send" size={19} />
                {saving ? "Mengirim pengajuan..." : `Kirim Pengajuan ${jenisKegiatan === JENIS_KEGIATAN.RAPAT ? "Rapat" : "Program Kerja"}`}
              </button>
            </div>
          </form>
        )}
      </section>

      {participantPickerMode && (
        <PilihPesertaRapatOverlay
          mode={participantPickerMode}
          member={member}
          divisi={divisi}
          existingParticipantIds={participants.map((item) => item.id)}
          onApplyGroup={applyParticipantGroup}
          onAddMembers={addManualParticipants}
          onClose={() => setParticipantPickerMode(null)}
        />
      )}
    </>
  );
}

function formatDurasi(minutes) {
  const jam = Math.floor(minutes / 60);
  const menit = minutes % 60;
  const parts = [];

  if (jam) parts.push(`${jam} jam`);
  if (menit) parts.push(`${menit} menit`);

  return parts.join(" ") || "0 menit";
}

function initials(value) {
  return String(value || "A")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

const inputClass =
  "min-h-11 w-full rounded-xl border border-border bg-input px-4 text-sm text-text outline-none transition placeholder:text-text-muted/70 focus:border-primary focus:ring-2 focus:ring-primary/20";

function FormSection({ icon, title, description, children }) {
  return (
    <section className="rounded-2xl border border-border bg-surface/50 p-4 sm:p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <AppIcon name={icon} size={19} />
        </span>
        <div>
          <h3 className="font-bold text-text">{title}</h3>
          <p className="mt-1 text-xs leading-5 text-text-muted">{description}</p>
        </div>
      </div>

      <div className="space-y-4">{children}</div>
    </section>
  );
}

function FormField({ label, required = false, children }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold text-text-muted">
        {label}
        {required && <span className="ml-1 text-error-text">*</span>}
      </span>
      {children}
    </label>
  );
}

function InfoRingkas({ icon, label, value }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <AppIcon name={icon} size={20} />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
          {label}
        </p>
        <p className="mt-1 truncate text-sm font-semibold text-text">{value}</p>
      </div>
    </div>
  );
}
