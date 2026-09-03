"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import AppIcon from "@/components/global/AppIcon";
import AksesOrganisasi, {
  ATURAN_AKSES_ORGANISASI,
  isBadanPengurusHarian,
} from "@/components/anggota/_shared/AksesOrganisasi";
import { useCurrentMember } from "@/components/anggota/_shared/useCurrentMember";
import { formatDateTime, toDate } from "@/components/anggota/_shared/formatters";
import {
  EmptyState,
  PageError,
  PageHeading,
  PageLoading,
  ProposalStatusBadge,
  StatCard,
} from "@/components/anggota/_shared/Ui";
import { useDb } from "@/context/DbContext";
import { useCollection } from "@/hooks/useCollection";
import { db } from "@/lib/firebase-config";
import {
  collection,
  doc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import {
  uploadProposalCloudinary,
  validasiFileProposal,
} from "@/lib/uploadProposalCloudinary";
import { useAjukanRapatOverlay } from "@/components/anggota/kegiatan/sub-components/AjukanRapatOverlay";

function rowsOf(result) {
  return Array.isArray(result?.rows) ? result.rows : [];
}

function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return null;
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 ** 2).toFixed(1)} MB`;
}

function proposalStatusValue(status) {
  const normalized = String(status || "").trim().toLowerCase();

  return (
    {
      "belum_diajukan": "belum_diajukan",
      diajukan: "diajukan",
      menunggu_review: "menunggu_review",
      pending_review: "menunggu_review",
      "perlu_revisi": "perlu_revisi",
      revision_required: "perlu_revisi",
      disetujui: "disetujui",
      approved: "disetujui",
      ditolak: "ditolak",
      rejected: "ditolak",
    }[normalized] || normalized || "menunggu_review"
  );
}

function sortNewest(rows, getValue) {
  return [...rows].sort((a, b) => {
    const timeA = toDate(getValue(a))?.getTime() || 0;
    const timeB = toDate(getValue(b))?.getTime() || 0;
    return timeB - timeA;
  });
}

export default function UploadProposalAnggota() {
  const { member, memberId, loading: memberLoading, error: memberError } =
    useCurrentMember();
  const { colRef } = useDb();
  const { openAjukanRapat } = useAjukanRapatOverlay();

  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedActivityId, setSelectedActivityId] = useState(null);
  const [selectedProposalFile, setSelectedProposalFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const proposalInputRef = useRef(null);

  const activities = useCollection(() => colRef("Kegiatan"), [], {
    enabled: true,
  });

  const proposals = useCollection(() => colRef("Proposal"), [], {
    enabled: true,
  });

  const divisions = useCollection(() => colRef("Divisi"), [], {
    enabled: true,
  });

  const loading = memberLoading || activities.loading || proposals.loading || divisions.loading;
  const dataError = memberError || activities.error || proposals.error || divisions.error;

  const proposalRows = useMemo(() => {
    const rows = rowsOf(proposals).filter(
      (item) =>
        item?.idPengunggah === memberId || item?.uploadedBy === memberId
    );

    return sortNewest(rows, (item) => item?.diajukanPada || item?.submittedAt || item?.diperbaruiPada || item?.dibuatPada)
      .map((proposal) => {
        const activity = rowsOf(activities).find((item) => item.id === proposal.idKegiatan) || null;
        return { ...proposal, activity };
      });
  }, [activities, memberId, proposals]);

  const eligibleActivities = useMemo(() => {
    if (!memberId) return [];

    const divisionMap = new Map(
      rowsOf(divisions).map((item) => [item.id, item])
    );

    const memberDivisionId = member?.idDivisi || member?.divisionId || null;
    const memberDivision = memberDivisionId
      ? divisionMap.get(memberDivisionId) || null
      : null;

    const isBph = isBadanPengurusHarian(memberDivision);
    const jabatan = String(
      member?.jabatanOrganisasi ||
        member?.organisationPosition ||
        member?.jabatan ||
        ""
    ).trim().toLowerCase();
    const isKetuaSekbid =
      !isBph &&
      (jabatan === "ketua" || jabatan.startsWith("ketua sekbid"));

    return rowsOf(activities)
      .filter((activity) => {
        const proposal = proposalRows.find((item) => item.idKegiatan === activity.id);
        const isProposalOwner = proposal?.idPengunggah === memberId || proposal?.uploadedBy === memberId;
        return (
          (activity?.status === "terencana" ||
            proposalStatusValue(proposal?.status) === "perlu_revisi") &&
          (isProposalOwner || isBph || isKetuaSekbid)
        );
      })
      .filter((activity) => {
        const activityDivisionId = activity?.idDivisi || activity?.divisionId || null;
        return (
          isBph ||
          proposalRows.some(
            (proposal) =>
              proposal.idKegiatan === activity.id &&
              (proposal.idPengunggah === memberId || proposal.uploadedBy === memberId)
          ) ||
          (isKetuaSekbid &&
            Boolean(memberDivisionId) &&
            Boolean(activityDivisionId) &&
            memberDivisionId === activityDivisionId)
        );
      })
      .map((activity) => {
        const linkedProposal = proposalRows.find((item) => item.idKegiatan === activity.id) || null;
        return { ...activity, proposal: linkedProposal || null };
      });
  }, [activities, divisions, member, memberId, proposalRows]);

  const selectedActivity = useMemo(() => {
    if (selectedActivityId) {
      return (
        eligibleActivities.find((item) => item.id === selectedActivityId) ||
        eligibleActivities[0] ||
        null
      );
    }

    return eligibleActivities[0] || null;
  }, [eligibleActivities, selectedActivityId]);

  const data = useMemo(() => {
    const all = sortNewest(proposalRows, (item) => item?.diajukanPada || item?.submittedAt || item?.diperbaruiPada || item?.dibuatPada);
    return {
      all,
      filtered:
        statusFilter === "all"
          ? all
          : all.filter((proposal) => proposalStatusValue(proposal.status) === statusFilter),
      approved: all.filter((item) => proposalStatusValue(item.status) === "disetujui").length,
      pending: all.filter((item) => proposalStatusValue(item.status) === "menunggu_review").length,
      revision: all.filter((item) => proposalStatusValue(item.status) === "perlu_revisi").length,
    };
  }, [proposalRows, statusFilter]);

  if (loading) {
    return <PageLoading message="Memuat proposal anggota..." />;
  }

  if (dataError) {
    return <PageError message={dataError.message || "Terjadi kesalahan saat memuat proposal."} />;
  }

  if (!member) {
    return (
      <PageError
        title="Profil anggota tidak ditemukan"
        message="Proposal hanya dapat ditampilkan setelah akun terhubung ke dokumen Anggota."
      />
    );
  }

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
    setMessage("");
    setError("");
  };

  const handleSaveProposal = async () => {
    if (!selectedActivity || !member?.id) {
      setError("Pilih kegiatan yang akan diajukan terlebih dahulu.");
      return;
    }

    if (!selectedProposalFile && !selectedActivity.proposal) {
      setError("Pilih file proposal sebelum disimpan.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const waktu = serverTimestamp();
      const uploadedFile = selectedProposalFile
        ? await uploadProposalCloudinary(selectedProposalFile)
        : null;

      const proposalPayload = {
        idKegiatan: selectedActivity.id,
        idPengunggah: member.id,
        uploadedBy: member.id,
        namaKegiatan: selectedActivity.namaKegiatan || "Program Kerja",
        namaFile:
          uploadedFile?.namaFile ||
          selectedActivity.proposal?.namaFile ||
          "proposal.pdf",
        ukuranFileByte:
          uploadedFile?.ukuranFileByte ||
          selectedActivity.proposal?.ukuranFileByte ||
          0,
        tipeFile: uploadedFile?.tipeFile || selectedActivity.proposal?.tipeFile || null,
        urlFile: uploadedFile?.urlFile || selectedActivity.proposal?.urlFile || null,
        publicIdFile:
          uploadedFile?.publicIdFile || selectedActivity.proposal?.publicIdFile || null,
        assetIdFile:
          uploadedFile?.assetIdFile || selectedActivity.proposal?.assetIdFile || null,
        resourceTypeFile:
          uploadedFile?.resourceTypeFile || selectedActivity.proposal?.resourceTypeFile || null,
        formatFile:
          uploadedFile?.formatFile || selectedActivity.proposal?.formatFile || null,
        versionCloudinary:
          uploadedFile?.versionCloudinary ?? selectedActivity.proposal?.versionCloudinary ?? null,
        versi: selectedProposalFile
          ? Number(selectedActivity.proposal?.versi || 0) + 1
          : Number(selectedActivity.proposal?.versi || 1),
        status: selectedProposalFile
        ? "menunggu_review"
        : proposalStatusValue(selectedActivity.proposal?.status),
        diajukanPada: selectedProposalFile
          ? waktu
          : selectedActivity.proposal?.diajukanPada || waktu,
        diperbaruiPada: waktu,
        submittedAt: selectedProposalFile
          ? waktu
          : selectedActivity.proposal?.submittedAt || waktu,
      };

      const proposalRef = selectedActivity.proposal?.id
        ? doc(db, "Proposal", selectedActivity.proposal.id)
        : doc(collection(db, "Proposal"));

      const proposalId = proposalRef.id;
      const batch = writeBatch(db);

      batch.set(proposalRef, proposalPayload, { merge: true });
      batch.update(doc(db, "Kegiatan", selectedActivity.id), {
        idProposal: proposalId,
        statusProposal: proposalPayload.status,
        diperbaruiPada: waktu,
      });

      await batch.commit();

      setSelectedProposalFile(null);
      if (proposalInputRef.current) proposalInputRef.current.value = "";
      setMessage("Proposal berhasil dikirim untuk ditinjau pembina.");
    } catch (saveError) {
      console.error("UPLOAD PROPOSAL ANGGOTA ERROR:", saveError);
      setError(saveError?.message || "Proposal gagal dikirim. Silakan coba lagi.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeading
        eyebrow="Dokumen Kegiatan"
        title="Upload Proposal"
        description="Ajukan proposal program kerja dari kegiatan yang Anda kelola, lalu pantau status review dari pembina."
        action={
          <AksesOrganisasi
            aturan={ATURAN_AKSES_ORGANISASI.PIMPINAN_ORGANISASI}
          >
            {(akses) => (
              <button
                type="button"
                onClick={() =>
                  openAjukanRapat({
                    member: akses.member,
                    divisi: akses.divisi,
                  })
                }
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white transition hover:bg-primary-hover"
              >
                <AppIcon name="add" size={18} />
                Ajukan Kegiatan Baru
              </button>
            )}
          </AksesOrganisasi>
        }
      />

      <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon="receipt"
          label="Total Proposal"
          value={data.all.length}
          helper="Semua proposal yang Anda unggah."
        />
        <StatCard
          icon="check"
          label="Disetujui"
          value={data.approved}
          helper="Proposal yang sudah disetujui."
          accent="green"
        />
        <StatCard
          icon="calendar_month"
          label="Menunggu Review"
          value={data.pending}
          helper="Sedang menunggu keputusan pembina."
          accent="amber"
        />
        <StatCard
          icon="edit"
          label="Perlu Revisi"
          value={data.revision}
          helper="Proposal perlu diperbaiki."
          accent="red"
        />
      </section>

      <section className="mt-7 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">
              Pengajuan Kegiatan
            </p>
            <h2 className="mt-1 text-lg font-bold text-text">Kegiatan yang dapat diusulkan</h2>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <AksesOrganisasi
              aturan={ATURAN_AKSES_ORGANISASI.PIMPINAN_ORGANISASI}
            >
              {(akses) => (
                <button
                  type="button"
                  onClick={() =>
                    openAjukanRapat({
                      member: akses.member,
                      divisi: akses.divisi,
                    })
                  }
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 text-sm font-bold text-primary transition hover:bg-primary/10"
                >
                  <AppIcon name="add" size={18} />
                  Ajukan Kegiatan Baru
                </button>
              )}
            </AksesOrganisasi>

            {eligibleActivities.length > 0 && (
              <select
                value={selectedActivity?.id || ""}
                onChange={(event) => setSelectedActivityId(event.target.value)}
                className="min-h-11 rounded-xl border border-border bg-input px-4 text-sm text-text outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              >
                {eligibleActivities.map((activity) => (
                  <option key={activity.id} value={activity.id}>
                    {activity.namaKegiatan || "Kegiatan tanpa nama"}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {eligibleActivities.length === 0 ? (
          <div className="mt-5">
            <EmptyState
              icon="upload_file"
              title="Belum ada kegiatan yang bisa diajukan"
              description="Hanya program kerja yang masih terencana dan berada di divisi Anda yang dapat menerima proposal."
            />
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-border bg-surface p-4 sm:p-5">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-text">
                  {selectedActivity?.namaKegiatan || "Kegiatan tanpa nama"}
                </h3>
                <p className="mt-2 text-sm leading-6 text-text-muted">
                  {selectedActivity?.deskripsi || "Deskripsi kegiatan belum tersedia."}
                </p>
                <div className="mt-4 flex flex-wrap gap-3 text-xs text-text-muted">
                  <span>Waktu: {formatDateTime(selectedActivity?.waktuMulai)}</span>
                  <span>Lokasi: {selectedActivity?.lokasi || "-"}</span>
                </div>
              </div>

              <div className="flex flex-col gap-3 lg:min-w-[260px]">
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
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white transition hover:bg-primary-hover"
                >
                  <AppIcon name="upload_file" size={18} />
                  {selectedActivity?.proposal ? "Ganti File Proposal" : "Pilih File Proposal"}
                </button>

                {selectedProposalFile && (
                  <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
                    <p className="truncate font-semibold text-text">{selectedProposalFile.name}</p>
                    <p className="mt-1 text-[11px] text-text-muted">
                      {formatBytes(selectedProposalFile.size) || "Ukuran file tidak diketahui"}
                    </p>
                  </div>
                )}

                <button
                  type="button"
                  disabled={saving || (!selectedProposalFile && !selectedActivity?.proposal)}
                  onClick={handleSaveProposal}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-primary bg-primary/5 px-4 text-sm font-bold text-primary transition hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <AppIcon name="send" size={18} />
                  {saving ? "Menyimpan..." : "Kirim Proposal"}
                </button>
              </div>
            </div>

            {(message || error) && (
              <div
                className={`mt-5 rounded-2xl px-4 py-3 text-sm font-medium ${
                  error ? "bg-error-bg text-error-text" : "bg-emerald-50 text-emerald-800"
                }`}
              >
                {error || message}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="mt-7 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-col gap-4 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-bold text-text">Riwayat Proposal</h2>
            <p className="mt-1 text-xs text-text-muted">{data.filtered.length} proposal ditampilkan.</p>
          </div>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="min-h-11 rounded-xl border border-border bg-input px-4 text-sm text-text outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          >
            <option value="all">Semua Status</option>
            <option value="menunggu_review">Menunggu Review</option>
            <option value="perlu_revisi">Perlu Revisi</option>
            <option value="disetujui">Disetujui</option>
            <option value="ditolak">Ditolak</option>
          </select>
        </div>

        {data.filtered.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon="upload_file"
              title="Belum ada proposal"
              description="Proposal yang sudah Anda kirim akan muncul di sini beserta status review dari pembina."
            />
          </div>
        ) : (
          <div className="divide-y divide-border">
            {data.filtered.map((proposal) => (
              <article key={proposal.id} className="p-5 hover:bg-input/40">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
                  <div className="flex min-w-0 flex-1 items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <AppIcon name="description" size={23} />
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-text">
                          {proposal.namaKegiatan || proposal.namaFile || "Proposal kegiatan"}
                        </h3>
                        <ProposalStatusBadge status={proposal.status} />
                      </div>
                      <p className="mt-1 text-sm text-text-muted">
                        {proposal.activity?.namaKegiatan || "Kegiatan tidak ditemukan"}
                      </p>
                      <p className="mt-2 text-xs text-text-muted">
                        {proposal.namaFile || "File proposal"} · {formatBytes(proposal.ukuranFileByte) || "-"}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm lg:w-[320px]">
                    <div>
                      <p className="text-xs text-text-muted">Diajukan</p>
                      <p className="mt-1 font-semibold text-text">
                        {formatDateTime(proposal.diajukanPada || proposal.submittedAt)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-text-muted">Status</p>
                      <p className="mt-1 font-semibold text-text">
                        {proposal.status || "Menunggu review"}
                      </p>
                    </div>
                  </div>

                  {proposal.urlFile ? (
                    <a
                      href={proposal.urlFile}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-primary text-primary px-4 text-sm font-semibold transition hover:bg-primary/5"
                    >
                      <AppIcon name="download" size={18} />
                      Lihat File
                    </a>
                  ) : (
                    <span className="inline-flex min-h-10 items-center justify-center rounded-xl border border-border px-4 text-sm font-medium text-text-muted">
                      Tidak ada file
                    </span>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
