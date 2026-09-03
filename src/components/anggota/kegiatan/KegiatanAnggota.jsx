"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import AppIcon from "@/components/global/AppIcon";
import { useDb } from "@/context/DbContext";
import { useCollection } from "@/hooks/useCollection";
import { useCurrentMember } from "@/components/anggota/_shared/useCurrentMember";
import AksesOrganisasi, {
  ATURAN_AKSES_ORGANISASI,
  isBadanPengurusHarian,
} from "@/components/anggota/_shared/AksesOrganisasi";
import {
  useAjukanRapatOverlay,
} from "./sub-components/AjukanRapatOverlay";
import {
  useKegiatanDetailsOverlay,
} from "./sub-components/KegiatanDetailsOverlay";
import {
  formatDateTime,
  toDate,
} from "@/components/anggota/_shared/formatters";
import {
  EmptyState,
  PageError,
  PageHeading,
  PageLoading,
  StatCard,
} from "@/components/anggota/_shared/Ui";

const STATUS_KEGIATAN = Object.freeze({
  DRAF: "draf",
  TERENCANA: "terencana",
  AKAN_DATANG: "akan_datang",
  BERLANGSUNG: "berlangsung",
  SELESAI: "selesai",
  DIBATALKAN: "dibatalkan",
});

function rowsOf(result) {
  return Array.isArray(result?.rows) ? result.rows : [];
}

function sortKegiatanTerbaru(rows) {
  return [...rows].sort((a, b) => {
    const waktuA = toDate(a?.waktuMulai)?.getTime() || 0;
    const waktuB = toDate(b?.waktuMulai)?.getTime() || 0;
    return waktuB - waktuA;
  });
}

function labelDivisi(divisi) {
  return divisi?.namaSingkat || divisi?.nama || "Pengurus OSIS";
}

function labelJenisKegiatan(value) {
  return (
    {
      program_kerja: "Program Kerja",
      rapat: "Rapat",
    }[value] ||
    value ||
    "-"
  );
}

function labelStatusJadwal(status) {
  return (
    {
      direncanakan: "Direncanakan",
      difinalisasi: "Sudah Ditetapkan",
    }[status] || "Belum ditetapkan"
  );
}

function labelStatusPengajuan(status) {
  return {
    menunggu_review: "Menunggu Review",
    perlu_revisi: "Perlu Revisi",
    disetujui: "Disetujui",
    ditolak: "Ditolak",
  }[status] || "Menunggu Review";
}

function statusPengajuanClass(status) {
  return {
    menunggu_review: "bg-amber-50 text-amber-700",
    perlu_revisi: "bg-orange-50 text-orange-700",
    disetujui: "bg-emerald-50 text-emerald-700",
    ditolak: "bg-red-50 text-red-700",
  }[status] || "bg-slate-100 text-slate-700";
}

function formatDuration(activity) {
  const storedMinutes = Number(activity?.durasiMenit);
  let minutes = Number.isFinite(storedMinutes) && storedMinutes > 0
    ? storedMinutes
    : 0;

  if (!minutes) {
    const start = toDate(activity?.waktuMulai);
    const end = toDate(activity?.waktuSelesai);

    if (start && end) {
      const diff = Math.round((end.getTime() - start.getTime()) / 60000);
      minutes = diff > 0 ? diff : 0;
    }
  }

  if (!minutes) return "Belum tersedia";

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const parts = [];

  if (hours) parts.push(`${hours} jam`);
  if (rest) parts.push(`${rest} menit`);

  return parts.join(" ");
}

export default function KegiatanAnggota() {
  const {
    member,
    memberId,
    loading: memberLoading,
    error: memberError,
  } = useCurrentMember();
  const { colRef } = useDb();
  const { openAjukanRapat } = useAjukanRapatOverlay();
  const { openKegiatanDetails } = useKegiatanDetailsOverlay();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const activities = useCollection(() => colRef("Kegiatan"), [], {
    enabled: true,
  });

  const divisions = useCollection(() => colRef("Divisi"), [], {
    enabled: true,
  });

  const proposals = useCollection(() => colRef("Proposal"), [], {
    enabled: true,
  });

  const loading =
    memberLoading || activities.loading || divisions.loading || proposals.loading;

  const error =
    memberError || activities.error || divisions.error || proposals.error;

  function sortByNearestStart(rows) {
    const now = Date.now();
    return [...rows].sort((a, b) => {
      const aDone = a?.status === STATUS_KEGIATAN.SELESAI ? 1 : 0;
      const bDone = b?.status === STATUS_KEGIATAN.SELESAI ? 1 : 0;

      if (aDone !== bDone) return aDone - bDone;

      const aStamp = a?.waktuMulai ? new Date(a.waktuMulai).getTime() : Number.MAX_SAFE_INTEGER;
      const bStamp = b?.waktuMulai ? new Date(b.waktuMulai).getTime() : Number.MAX_SAFE_INTEGER;
      return Math.abs(aStamp - now) - Math.abs(bStamp - now);
    });
  }

  const data = useMemo(() => {
    const divisionMap = new Map(
      rowsOf(divisions).map((item) => [item.id, item])
    );

    const proposalRows = rowsOf(proposals);
    const proposalMap = new Map(
      proposalRows.map((item) => [item.id, item])
    );
    // Proposal yang sudah ditolak tidak lagi dianggap proposal aktif ketika
    // relasinya sudah dilepas dari dokumen Kegiatan. Pilih versi terbaru yang
    // masih relevan untuk kegiatan tersebut.
    const proposalByKegiatanMap = new Map();
    proposalRows
      .filter((item) => item?.idKegiatan && item?.status !== "ditolak")
      .forEach((item) => {
        const current = proposalByKegiatanMap.get(item.idKegiatan);
        if (!current || Number(item.versi || 0) >= Number(current.versi || 0)) {
          proposalByKegiatanMap.set(item.idKegiatan, item);
        }
      });

    const pengajuanSaya = sortKegiatanTerbaru(rowsOf(activities))
      .filter((activity) => {
        const pengajuan = activity?.pengajuanKegiatan ||
          activity?.pengajuanRapat ||
          activity?.pengajuanProgramKerja;
        return pengajuan?.sumber === "anggota" && pengajuan?.idPengaju === memberId;
      })
      .map((activity) => ({
        ...activity,
        divisi: activity.idDivisi ? divisionMap.get(activity.idDivisi) || null : null,
        proposal: activity.idProposal
          ? proposalMap.get(activity.idProposal) || proposalByKegiatanMap.get(activity.id) || null
          : proposalByKegiatanMap.get(activity.id) || null,
        pengajuan: activity.pengajuanKegiatan ||
          activity.pengajuanRapat ||
          activity.pengajuanProgramKerja,
      }));

    // Draf pengajuan ditampilkan di section progres terpisah.
    // Pengajuan rapat/program kerja tetap tersimpan di collection Kegiatan,
    // tetapi baru muncul di daftar ini setelah menjadi kegiatan resmi.
    const all = sortKegiatanTerbaru(rowsOf(activities))
      .filter((activity) => activity.status !== STATUS_KEGIATAN.DRAF)
      .filter((activity) => {
        if (!memberId) return false;

        const pesertaFinal = Array.isArray(activity?.pesertaFinal?.idAnggota)
          ? activity.pesertaFinal.idAnggota
          : [];
        const panitia = Array.isArray(activity?.idAnggotaPanitia)
          ? activity.idAnggotaPanitia
          : [];

        const isResponsible = activity?.idPenanggungJawab === memberId;
        const isCommittee = panitia.includes(memberId);
        const isFinalParticipant = pesertaFinal.includes(memberId);

        /**
         * ================================================================
         * AKSES PROGRAM KERJA YANG MASIH TERENCANA
         * ================================================================
         *
         * Program Kerja yang masih Terencana dapat dilihat oleh:
         * 1. seluruh anggota Sekbid penyelenggara, termasuk Ketua Sekbid;
         * 2. seluruh anggota Badan Pengurus Harian (BPH).
         *
         * Hak untuk mengunggah Proposal tetap dibatasi di KegiatanDetailsOverlay
         * hanya untuk Ketua Sekbid penyelenggara dan BPH.
         */
        if (activity.status === STATUS_KEGIATAN.TERENCANA) {
          const memberDivisionId =
            member?.idDivisi || member?.divisionId || null;
          const activityDivisionId =
            activity?.idDivisi || activity?.divisionId || null;
          const memberDivision = memberDivisionId
            ? divisionMap.get(memberDivisionId) || null
            : null;

          const isBph = isBadanPengurusHarian(memberDivision);
          const isSameDivision =
            Boolean(memberDivisionId) &&
            Boolean(activityDivisionId) &&
            memberDivisionId === activityDivisionId;

          return isBph || isSameDivision;
        }

        /**
         * Setelah kegiatan difinalisasi, visibility kembali mengikuti peserta
         * yang benar-benar terlibat pada kegiatan.
         */
        return isResponsible || isCommittee || isFinalParticipant;
      })
      .map((activity) => ({
      ...activity,
      divisi: activity.idDivisi
        ? divisionMap.get(activity.idDivisi) || null
        : null,
      proposal: activity.idProposal
        ? proposalMap.get(activity.idProposal) ||
          proposalByKegiatanMap.get(activity.id) ||
          null
        : proposalByKegiatanMap.get(activity.id) || null,
    }));

    const keyword = search.trim().toLowerCase();

    const filtered = all.filter((activity) => {
      const matchesSearch =
        !keyword ||
        String(activity.namaKegiatan || "").toLowerCase().includes(keyword) ||
        String(activity.lokasi || "").toLowerCase().includes(keyword) ||
        String(activity.deskripsi || "").toLowerCase().includes(keyword);

      const matchesStatus =
        statusFilter === "all" || activity.status === statusFilter;

      return matchesSearch && matchesStatus;
    });

    return {
      all,
      filtered,
      pengajuanSaya,
      upcoming: all.filter(
        (item) => item.status === STATUS_KEGIATAN.AKAN_DATANG
      ).length,
      ongoing: all.filter(
        (item) => item.status === STATUS_KEGIATAN.BERLANGSUNG
      ).length,
      completed: all.filter(
        (item) => item.status === STATUS_KEGIATAN.SELESAI
      ).length,
    };
  }, [
    activities,
    divisions,
    proposals,
    memberId,
    member?.idDivisi,
    member?.divisionId,
    search,
    statusFilter,
  ]);

  if (loading) {
    return <PageLoading message="Memuat kegiatan OSIS..." />;
  }

  if (error) {
    return <PageError message={error.message} />;
  }

  return (
    <div>
      <PageHeading
        eyebrow="Agenda Organisasi"
        title="Kegiatan OSIS"
        description="Daftar program kerja dan rapat OSIS berdasarkan jadwal yang tersimpan."
        action={
          <AksesOrganisasi
            aturan={ATURAN_AKSES_ORGANISASI.PIMPINAN_ORGANISASI}
          >
            {(akses) => (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() =>
                    openAjukanRapat({
                      member: akses.member,
                      divisi: akses.divisi,
                      jenisKegiatan: "program_kerja",
                    })
                  }
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                >
                  <AppIcon name="add" size={19} />
                  Ajukan Program Kerja
                </button>

                <button
                  type="button"
                  onClick={() =>
                    openAjukanRapat({
                      member: akses.member,
                      divisi: akses.divisi,
                      jenisKegiatan: "rapat",
                    })
                  }
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-text transition hover:bg-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                >
                  <AppIcon name="groups" size={18} />
                  Ajukan Rapat
                </button>
              </div>
            )}
          </AksesOrganisasi>
        }
      />

      <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon="calendar_month"
          label="Total Kegiatan"
          value={data.all.length}
          helper="Seluruh agenda OSIS yang tercatat."
        />
        <StatCard
          icon="event_available"
          label="Akan Datang"
          value={data.upcoming}
          helper="Kegiatan yang belum dimulai."
          accent="blue"
        />
        <StatCard
          icon="calendar_month"
          label="Berlangsung"
          value={data.ongoing}
          helper="Kegiatan yang sedang berjalan."
          accent="amber"
        />
        <StatCard
          icon="check"
          label="Selesai"
          value={data.completed}
          helper="Kegiatan yang telah selesai."
          accent="green"
        />
      </section>

      <SubmissionProgressSection rows={data.pengajuanSaya} />

      <section className="mt-7 space-y-8">
        <div className="mb-5 flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-bold text-text">Daftar Kegiatan</h2>
            <p className="mt-1 text-xs text-text-muted">
              {data.filtered.length} kegiatan ditampilkan.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative">
              <AppIcon
                name="search"
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
              />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari kegiatan atau lokasi"
                className="min-h-11 w-full rounded-xl border border-border bg-input pl-10 pr-4 text-sm text-text outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 sm:w-72"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="min-h-11 rounded-xl border border-border bg-input px-4 text-sm text-text outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="all">Semua Status</option>
              <option value={STATUS_KEGIATAN.TERENCANA}>Terencana</option>
              <option value={STATUS_KEGIATAN.AKAN_DATANG}>Akan Datang</option>
              <option value={STATUS_KEGIATAN.BERLANGSUNG}>Berlangsung</option>
              <option value={STATUS_KEGIATAN.SELESAI}>Selesai</option>
              <option value={STATUS_KEGIATAN.DIBATALKAN}>Dibatalkan</option>
            </select>
          </div>
        </div>

        <KegiatanListSection
          title="Daftar Program Kerja"
          icon="campaign"
          rows={sortByNearestStart(
            data.filtered.filter((item) => item.jenisKegiatan !== "rapat")
          )}
          onDetail={openKegiatanDetails}
          tone="primary"
        />

        <KegiatanListSection
          title="Daftar Rapat"
          icon="groups"
          rows={sortByNearestStart(
            data.filtered.filter((item) => item.jenisKegiatan === "rapat")
          )}
          onDetail={openKegiatanDetails}
          tone="blue"
        />
      </section>
    </div>
  );
}

function SubmissionProgressSection({ rows }) {
  return (
    <section className="mt-7 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <AppIcon name="track_changes" size={21} />
        </span>
        <div>
          <h2 className="font-bold text-text">Progres Pengajuan Saya</h2>
          <p className="mt-1 text-xs leading-5 text-text-muted">
            Pantau keputusan Pembina atas program kerja atau rapat yang kamu ajukan.
          </p>
        </div>
      </div>

      {rows.length ? (
        <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {rows.map((activity) => {
            const proposalStatus = activity.proposal?.status;
            const status = proposalStatus === "perlu_revisi"
              ? proposalStatus
              : activity.pengajuan?.status || "menunggu_review";
            return (
              <article key={activity.id} className="rounded-xl border border-border bg-surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-primary">
                      {labelJenisKegiatan(activity.jenisKegiatan)}
                    </p>
                    <h3 className="mt-1 truncate text-sm font-bold text-text">
                      {activity.namaKegiatan || "Pengajuan tanpa judul"}
                    </h3>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${statusPengajuanClass(status)}`}>
                    {labelStatusPengajuan(status)}
                  </span>
                </div>
                {activity.pengajuan?.catatanReview && (
                  <p className="mt-3 rounded-lg bg-card px-3 py-2 text-xs leading-5 text-text-muted">
                    Catatan Pembina: {activity.pengajuan.catatanReview}
                  </p>
                )}
                {status === "perlu_revisi" && activity.proposal?.id && (
                  <Link
                    href="/anggota/upload-proposal"
                    className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-3 text-xs font-bold text-white hover:bg-primary-hover"
                  >
                    <AppIcon name="upload_file" size={16} />
                    Upload Ulang Proposal
                  </Link>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <p className="mt-5 rounded-xl bg-surface px-4 py-3 text-sm text-text-muted">
          Belum ada pengajuan kegiatan.
        </p>
      )}
    </section>
  );
}

function KegiatanListSection({ title, icon, rows, onDetail, tone = "primary" }) {
  const toneClass =
    tone === "blue"
      ? "bg-blue-50 text-blue-700"
      : "bg-primary/10 text-primary";

  if (!rows.length) {
    return null;
  }

  return (
    <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-4 border-b border-border bg-surface px-5 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${toneClass}`}>
            <AppIcon name={icon} size={22} />
          </span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-text-muted">
              Kegiatan
            </p>
            <h3 className="font-bold text-text">{title}</h3>
          </div>
        </div>
        <span className="rounded-full bg-surface px-3 py-1 text-[10px] font-bold text-text-muted ring-1 ring-inset ring-border">
          {rows.length} item
        </span>
      </div>

      <div className="grid grid-cols-1 gap-5 p-5 lg:grid-cols-2">
        {rows.map((activity) => (
          <ActivityCard
            key={activity.id}
            activity={activity}
            onDetail={() => onDetail?.(activity)}
          />
        ))}
      </div>
    </section>
  );
}

function ActivityCard({ activity, onDetail }) {
  const startDate = toDate(activity.waktuMulai);
  const isMeeting = activity.jenisKegiatan === "rapat";
  const proposal = activity.proposal || null;

  return (
    <button
      type="button"
      onClick={onDetail}
      className="w-full overflow-hidden rounded-2xl border border-border bg-card text-left shadow-sm transition duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      aria-label={`Buka detail ${activity.namaKegiatan || "kegiatan"}`}
    >
      <div className="border-b border-border p-5">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-primary text-white">
            <span className="text-[10px] font-semibold uppercase">
              {startDate
                ? new Intl.DateTimeFormat("id-ID", { month: "short" }).format(
                    startDate
                  )
                : "-"}
            </span>
            <span className="text-xl font-bold leading-none">
              {startDate
                ? new Intl.DateTimeFormat("id-ID", { day: "2-digit" }).format(
                    startDate
                  )
                : "-"}
            </span>
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-bold text-text">
                {activity.namaKegiatan || "Kegiatan tanpa nama"}
              </h2>
              <KegiatanStatusBadge status={activity.status} />
            </div>

            <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-wider text-text-muted">
              <span>{labelJenisKegiatan(activity.jenisKegiatan)}</span>
            </div>

            <p className="mt-2 line-clamp-2 text-sm leading-6 text-text-muted">
              {activity.deskripsi || "Tidak ada deskripsi."}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
        <MetaItem
          label={isMeeting ? "Waktu Rapat" : "Waktu Pelaksanaan"}
          value={formatDateTime(activity.waktuMulai)}
        />
        <MetaItem label="Lokasi" value={activity.lokasi || "-"} />
        <MetaItem label="Penyelenggara" value={labelDivisi(activity.divisi)} />
        {isMeeting ? (
          <MetaItem label="Durasi" value={formatDuration(activity)} />
        ) : (
          <MetaItem label="Jadwal" value={labelStatusJadwal(activity.statusJadwal)} />
        )}
      </div>

      {!isMeeting && (
        <div className="border-t border-border bg-surface px-5 py-4">
          <p className="min-w-0 text-xs text-text-muted">
            Proposal:{" "}
            {proposal ? (
              <span
                className="inline-block max-w-[260px] truncate align-bottom font-semibold text-text"
                title={proposal.namaFile || "File proposal"}
              >
                {proposal.namaFile || "File proposal"}
              </span>
            ) : (
              <span className="font-bold text-red-600">Belum ada Proposal</span>
            )}
          </p>
        </div>
      )}
    </button>
  );
}

function KegiatanStatusBadge({ status }) {
  const config = {
    draf: ["Draf", "bg-slate-100 text-slate-700"],
    terencana: ["Terencana", "bg-blue-50 text-blue-700"],
    akan_datang: ["Akan Datang", "bg-sky-50 text-sky-700"],
    berlangsung: ["Berlangsung", "bg-amber-50 text-amber-700"],
    selesai: ["Selesai", "bg-emerald-50 text-emerald-700"],
    dibatalkan: ["Dibatalkan", "bg-red-50 text-red-700"],
  }[status] || [status || "-", "bg-slate-100 text-slate-700"];

  return (
    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${config[1]}`}>
      {config[0]}
    </span>
  );
}

function MetaItem({ label, value }) {
  return (
    <div className="rounded-xl bg-surface p-4">
      <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold leading-6 text-text">
        {value || "-"}
      </p>
    </div>
  );
}
