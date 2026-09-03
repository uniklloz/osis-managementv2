"use client";

import { useId, useMemo, useState } from "react";

import AppIcon from "@/components/global/AppIcon";
import { Avatar, EmptyState } from "@/components/pembina/_shared/PembinaUi";
import { JENIS_KEGIATAN } from "../konfigurasiManajemenKegiatan";

const STATUS_PENGAJUAN = Object.freeze({
  MENUNGGU_REVIEW: "menunggu_review",
  PERLU_REVISI: "perlu_revisi",
  DISETUJUI: "disetujui",
  DITOLAK: "ditolak",
});

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === "function") return value.toDate();

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value) {
  const date = toDate(value);
  if (!date) return "-";

  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value) {
  const date = toDate(value);
  if (!date) return "-";

  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function labelJenisKegiatan(value) {
  if (value === JENIS_KEGIATAN.RAPAT) return "Rapat";
  if (value === JENIS_KEGIATAN.PROGRAM_KERJA) return "Program Kerja";
  return "Kegiatan";
}

function labelDivisi(divisi) {
  return divisi?.namaSingkat || divisi?.nama || "Pengurus OSIS";
}

function labelPengaju(row) {
  return (
    row?.pengaju?.namaLengkap ||
    row?.pengaju?.nama ||
    row?.penanggungJawab?.namaLengkap ||
    row?.penanggungJawab?.nama ||
    "Anggota OSIS"
  );
}

function statusConfig(status) {
  return (
    {
      [STATUS_PENGAJUAN.MENUNGGU_REVIEW]: {
        label: "Menunggu Review",
        className: "bg-amber-50 text-amber-700 ring-amber-200",
      },
      [STATUS_PENGAJUAN.PERLU_REVISI]: {
        label: "Perlu Revisi",
        className: "bg-orange-50 text-orange-700 ring-orange-200",
      },
      [STATUS_PENGAJUAN.DISETUJUI]: {
        label: "Disetujui",
        className: "bg-emerald-50 text-emerald-700 ring-emerald-200",
      },
      [STATUS_PENGAJUAN.DITOLAK]: {
        label: "Ditolak",
        className: "bg-red-50 text-red-700 ring-red-200",
      },
    }[status] || {
      label: status || "Belum diketahui",
      className: "bg-slate-100 text-slate-700 ring-slate-200",
    }
  );
}

/**
 * Mengambil metadata pengajuan dari dokumen Kegiatan.
 * Mendukung rapat sekarang dan bentuk generik/program kerja untuk tahap berikutnya.
 */
export function ambilPengajuanKegiatan(kegiatan) {
  if (!kegiatan) return null;

  const kandidat = [
    kegiatan.pengajuanKegiatan,
    kegiatan.pengajuanRapat,
    kegiatan.pengajuanProgramKerja,
  ].find((item) => item && typeof item === "object");

  if (!kandidat) return null;

  return {
    ...kandidat,
    jenisKegiatan:
      kandidat.jenisKegiatan ||
      kegiatan.jenisKegiatan ||
      (kegiatan.pengajuanRapat ? JENIS_KEGIATAN.RAPAT : null),
  };
}

export function adalahPengajuanKegiatanAnggota(kegiatan) {
  const pengajuan = ambilPengajuanKegiatan(kegiatan);
  if (!pengajuan) return false;

  return String(pengajuan.sumber || "").trim().toLowerCase() === "anggota";
}

export function adalahDrafPengajuanAnggota(kegiatan) {
  return adalahPengajuanKegiatanAnggota(kegiatan) && kegiatan?.status === "draf";
}

export default function PengajuanKegiatanCollapsible({
  rows = [],
  jenisKegiatan = null,
  onOpenReview,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const contentId = useId();

  const pengajuanRows = useMemo(
    () =>
      rows
        .filter(adalahDrafPengajuanAnggota)
        .filter((item) => !jenisKegiatan || item.jenisKegiatan === jenisKegiatan)
        .map((item) => ({
          ...item,
          metadataPengajuan: ambilPengajuanKegiatan(item),
        }))
        .sort((a, b) => {
          const waktuA =
            toDate(a.metadataPengajuan?.diajukanPada)?.getTime() ||
            toDate(a.dibuatPada)?.getTime() ||
            0;
          const waktuB =
            toDate(b.metadataPengajuan?.diajukanPada)?.getTime() ||
            toDate(b.dibuatPada)?.getTime() ||
            0;
          return waktuB - waktuA;
        }),
    [rows, jenisKegiatan]
  );

  const menungguReview = pengajuanRows.filter(
    (item) =>
      item.metadataPengajuan?.status === STATUS_PENGAJUAN.MENUNGGU_REVIEW
  ).length;

  return (
    <section className="mt-7 min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={contentId}
        onClick={() => setIsOpen((current) => !current)}
        className="group flex w-full flex-col gap-3 p-5 text-left outline-none transition-colors hover:bg-input/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
            <AppIcon name="assignment_turned_in" size={23} />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-bold text-text">
                {jenisKegiatan === JENIS_KEGIATAN.RAPAT
                  ? "Pengajuan Rapat Anggota"
                  : "Pengajuan Kegiatan"}
              </h2>

              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                {menungguReview} menunggu review
              </span>

              {pengajuanRows.length > menungguReview && (
                <span className="rounded-full bg-input px-3 py-1 text-xs font-semibold text-text-muted">
                  {pengajuanRows.length} total
                </span>
              )}
            </div>

            <p className="mt-1 text-xs leading-5 text-text-muted">
              {jenisKegiatan === JENIS_KEGIATAN.RAPAT
                ? "Rapat yang diajukan anggota menunggu keputusan dan finalisasi Pembina. Rapat tidak membutuhkan proposal."
                : "Daftar pengajuan dari anggota yang belum menjadi kegiatan resmi."}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
          <span className="text-xs font-semibold text-text-muted">
            {isOpen ? "Tutup daftar" : "Lihat daftar"}
          </span>

          <span
            className={`flex h-9 w-9 items-center justify-center rounded-xl bg-input text-text-muted transition duration-300 group-hover:bg-primary/10 group-hover:text-primary ${
              isOpen ? "rotate-180 bg-primary/10 text-primary" : ""
            }`}
          >
            <AppIcon name="expand_more" size={23} />
          </span>
        </div>
      </button>

      <div
        id={contentId}
        aria-hidden={!isOpen}
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
          isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="border-t border-border">
            {pengajuanRows.length ? (
              <div className="w-full min-w-0 overflow-x-auto">
                <table className="w-full min-w-[1180px] text-left">
                  <thead className="bg-input text-xs uppercase tracking-wider text-text-muted">
                    <tr>
                      <th className="px-5 py-4">Jenis</th>
                      <th className="px-5 py-4">Nama Kegiatan</th>
                      <th className="px-5 py-4">Pengaju</th>
                      <th className="px-5 py-4">Divisi / Sekbid</th>
                      <th className="px-5 py-4">Rencana Pelaksanaan</th>
                      <th className="px-5 py-4">Peserta</th>
                      <th className="px-5 py-4">Proposal</th>
                      <th className="px-5 py-4 text-center">Status</th>
                      <th className="px-5 py-4 text-right">Aksi</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-border">
                    {pengajuanRows.map((activity) => (
                      <PengajuanRow
                        key={activity.id}
                        activity={activity}
                        onOpenReview={onOpenReview}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-5">
                <EmptyState
                  icon="assignment_turned_in"
                  title={
                    jenisKegiatan === JENIS_KEGIATAN.RAPAT
                      ? "Belum ada pengajuan rapat"
                      : "Belum ada pengajuan kegiatan"
                  }
                  description={
                    jenisKegiatan === JENIS_KEGIATAN.RAPAT
                      ? "Pengajuan rapat dari anggota akan tampil di bagian ini."
                      : "Pengajuan kegiatan dari anggota akan tampil di bagian ini."
                  }
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function PengajuanRow({ activity, onOpenReview }) {
  const pengajuan =
    activity.metadataPengajuan || ambilPengajuanKegiatan(activity);
  const status = statusConfig(pengajuan?.status);
  const jumlahPeserta =
    activity?.pesertaRencana?.jumlahPeserta ??
    pengajuan?.jumlahPesertaRencana ??
    activity?.kapasitasPeserta ??
    0;

  return (
    <tr className="group transition-colors hover:bg-input/60">
      <td className="px-5 py-4">
        <span
          className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
            activity.jenisKegiatan === JENIS_KEGIATAN.RAPAT
              ? "bg-blue-50 text-blue-700"
              : "bg-primary/10 text-primary"
          }`}
        >
          <AppIcon
            name={
              activity.jenisKegiatan === JENIS_KEGIATAN.RAPAT
                ? "groups"
                : "campaign"
            }
            size={14}
          />
          {labelJenisKegiatan(activity.jenisKegiatan)}
        </span>
      </td>

      <td className="px-5 py-4">
        <p className="max-w-64 truncate text-sm font-semibold text-text">
          {activity.namaKegiatan || "Pengajuan kegiatan tanpa nama"}
        </p>
        <p className="mt-1 font-mono text-[10px] font-bold text-primary">
          {activity.idReferensi || "Belum memiliki kode"}
        </p>
      </td>

      <td className="px-5 py-4">
        <div className="flex items-center gap-3">
          <Avatar name={labelPengaju(activity)} size="sm" />
          <div className="min-w-0">
            <p className="max-w-48 truncate text-sm font-semibold text-text">
              {labelPengaju(activity)}
            </p>
            <p className="mt-1 text-xs text-text-muted">
              Diajukan {formatDate(pengajuan?.diajukanPada || activity.dibuatPada)}
            </p>
          </div>
        </div>
      </td>

      <td className="px-5 py-4">
        <p className="text-sm font-semibold text-text">
          {labelDivisi(activity.divisi)}
        </p>
        <p className="mt-1 text-xs text-text-muted">
          {pengajuan?.jabatanPengaju || "Anggota OSIS"}
        </p>
      </td>

      <td className="px-5 py-4">
        <p className="text-sm text-text-muted">
          {formatDateTime(activity.waktuMulai)}
        </p>
        <p className="mt-1 max-w-48 truncate text-xs text-text-muted">
          {activity.lokasi || "Lokasi belum ditentukan"}
        </p>
      </td>

      <td className="px-5 py-4 text-sm font-semibold text-text">
        {jumlahPeserta} anggota
      </td>

      <td className="px-5 py-4">
        {activity?.proposal?.urlFile ? (
          <a
            href={activity.proposal.urlFile}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs font-bold text-primary hover:bg-primary/10"
          >
            <AppIcon name="description" size={15} />
            Lihat Proposal
          </a>
        ) : (
          <span className="text-xs text-text-muted">Belum tersedia</span>
        )}
      </td>

      <td className="px-5 py-4 text-center">
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 ring-inset ${status.className}`}
        >
          {status.label}
        </span>
      </td>

      <td className="px-5 py-4 text-right">
        <button
          type="button"
          onClick={() => onOpenReview?.(activity)}
          className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-primary/20 bg-primary/5 px-3 text-xs font-bold text-primary transition hover:border-primary/40 hover:bg-primary/10"
        >
          Review
          <AppIcon name="chevron_right" size={17} />
        </button>
      </td>
    </tr>
  );
}
