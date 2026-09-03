"use client";

import AppIcon from "@/components/global/AppIcon";
import { formatDateTime } from "@/components/pembina/_shared/firestoreHelpers";
import { EmptyState } from "@/components/pembina/_shared/PembinaUi";
import {
  KegiatanFilterBar,
  KegiatanMeta,
  BadgeStatus,
  kegiatanCocokPencarian,
  labelPenyelenggara,
} from "./KegiatanSectionUi";
import {
  OPSI_STATUS_PROGRAM_KERJA,
  STATUS_KEGIATAN,
  STATUS_PROPOSAL,
} from "../konfigurasiManajemenKegiatan";

function proposalMarker(activity) {
  const status = activity?.proposal?.status || activity?.statusProposal;

  if (!activity?.proposal && !activity?.idProposal) {
    return {
      label: "Belum ada proposal",
      className: "bg-red-50 text-red-700 ring-red-200",
      icon: "description",
    };
  }

  if (status === STATUS_PROPOSAL.MENUNGGU_REVIEW || status === STATUS_PROPOSAL.DIAJUKAN) {
    return {
      label: "Proposal diajukan · perlu direview",
      className: "bg-amber-50 text-amber-700 ring-amber-200",
      icon: "rate_review",
    };
  }

  if (status === STATUS_PROPOSAL.DISETUJUI) {
    return {
      label:
        activity?.status === STATUS_KEGIATAN.TERENCANA
          ? "Proposal disetujui · siap difinalisasi"
          : "Proposal disetujui",
      className: "bg-emerald-50 text-emerald-700 ring-emerald-200",
      icon: "verified",
    };
  }

  if (status === STATUS_PROPOSAL.PERLU_REVISI) {
    return {
      label: "Proposal perlu revisi",
      className: "bg-orange-50 text-orange-700 ring-orange-200",
      icon: "edit_note",
    };
  }

  if (status === STATUS_PROPOSAL.DITOLAK) {
    return {
      label: "Proposal ditolak",
      className: "bg-red-50 text-red-700 ring-red-200",
      icon: "cancel",
    };
  }

  return {
    label: "Proposal tersedia",
    className: "bg-blue-50 text-blue-700 ring-blue-200",
    icon: "description",
  };
}

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

export default function ProgramKerjaSection({
  rows,
  search,
  setSearch,
  statusFilter,
  setStatusFilter,
  typeSelector,
  onOpenDetail,
}) {
  const keyword = search.trim().toLowerCase();

  const filtered = sortByNearestStart(
    rows.filter(
      (item) =>
        kegiatanCocokPencarian(item, keyword) &&
        (statusFilter === "semua" || item.status === statusFilter)
    )
  );

  const akanDatang = rows.filter(
    (item) => item.status === STATUS_KEGIATAN.AKAN_DATANG
  ).length;
  const berlangsung = rows.filter(
    (item) => item.status === STATUS_KEGIATAN.BERLANGSUNG
  ).length;
  const selesai = rows.filter(
    (item) => item.status === STATUS_KEGIATAN.SELESAI
  ).length;
  const progress = rows.length ? Math.round((selesai / rows.length) * 100) : 0;

  return (
    <div>
      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1.45fr_1fr]">
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-primary/5" />
          <div className="relative">
            <div className="flex items-start justify-between gap-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Program Kerja OSIS</p>
                <div className="mt-3 flex items-end gap-3">
                  <span className="text-5xl font-bold tracking-tight text-text">{rows.length}</span>
                  <span className="pb-1 text-sm font-semibold text-text-muted">program kerja</span>
                </div>
                <p className="mt-2 text-xs leading-5 text-text-muted">Ringkasan program kerja pada periode berjalan.</p>
              </div>
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <AppIcon name="campaign" size={24} />
              </div>
            </div>
            <div className="mt-6 flex items-center justify-between gap-4 text-xs">
              <span className="font-semibold text-text-muted">Penyelesaian</span>
              <span className="font-bold text-text">{progress}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-input">
              <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 xl:grid-cols-1">
          <MiniStatus icon="calendar_month" label="Akan Datang" value={akanDatang} helper="Sudah difinalisasi" tone="blue" />
          <MiniStatus icon="fact_check" label="Berlangsung" value={berlangsung} helper="Sedang dilaksanakan" tone="amber" />
          <MiniStatus icon="task_alt" label="Selesai" value={selesai} helper="Sudah ditutup" tone="green" />
        </div>
      </section>

      {typeSelector}

      <KegiatanFilterBar
        eyebrow="Program Kerja OSIS"
        title="Daftar Program Kerja"
        count={filtered.length}
        search={search}
        setSearch={setSearch}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        searchPlaceholder="Cari nama program kerja atau lokasi"
        options={OPSI_STATUS_PROGRAM_KERJA}
      />

      {filtered.length ? (
        <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {filtered.map((activity) => {
            const marker = proposalMarker(activity);
            const participantSuggestionCount = Number(
              activity?.usulanPeserta?.jumlahPeserta || 0
            );

            return (
              <button
                key={activity.id}
                type="button"
                onClick={() => onOpenDetail?.(activity)}
                className="w-full overflow-hidden rounded-2xl border border-border bg-card text-left shadow-sm transition duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                aria-label={`Buka detail ${activity.namaKegiatan || "program kerja"}`}
              >
                <div className="border-b border-border p-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-primary/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
                        Program Kerja
                      </span>
                      <BadgeStatus status={activity.status} />
                    </div>

                    <h2 className="mt-3 font-bold text-text">
                      {activity.namaKegiatan || "Program kerja tanpa judul"}
                    </h2>
                    <p className="mt-2 max-h-12 overflow-hidden text-sm leading-6 text-text-muted">
                      {activity.deskripsi || "Tidak ada deskripsi."}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
                  <KegiatanMeta
                    label="Waktu Rencana"
                    value={formatDateTime(activity.waktuMulai)}
                  />
                  <KegiatanMeta label="Lokasi" value={activity.lokasi || "-"} />
                  <KegiatanMeta
                    label="Penyelenggara"
                    value={labelPenyelenggara(activity)}
                  />
                  <KegiatanMeta
                    label="Sesi Absensi"
                    value={`${
                      activity.jumlahSesiAbsensi ||
                      activity.jumlahSesiAbsensiRencana ||
                      0
                    } sesi`}
                  />
                </div>

                <div className="border-t border-border bg-surface p-4">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 ring-inset ${marker.className}`}
                    >
                      <AppIcon name={marker.icon} size={14} />
                      {marker.label}
                    </span>
                    {participantSuggestionCount > 0 &&
                      activity.status === STATUS_KEGIATAN.TERENCANA && (
                        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-700 ring-1 ring-inset ring-blue-200">
                          Usulan peserta · {participantSuggestionCount} anggota
                        </span>
                      )}
                  </div>
                </div>
              </button>
            );
          })}
        </section>
      ) : (
        <EmptyState
          icon="event_available"
          title="Program kerja tidak ditemukan"
          description="Coba ubah pencarian atau filter status."
        />
      )}
    </div>
  );
}

function MiniStatus({ icon, label, value, helper, tone }) {
  const toneClass = {
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    green: "bg-emerald-50 text-emerald-700",
  }[tone];

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${toneClass}`}>
        <AppIcon name={icon} size={20} />
      </div>
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold tracking-tight text-text">{value}</span>
          <span className="truncate text-xs font-bold text-text">{label}</span>
        </div>
        <p className="mt-0.5 text-[11px] text-text-muted">{helper}</p>
      </div>
    </div>
  );
}
