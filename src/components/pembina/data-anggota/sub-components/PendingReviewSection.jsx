"use client";

import { useId, useState } from "react";

import AppIcon from "@/components/global/AppIcon";
import {
  Avatar,
  EmptyState,
  MemberStatusBadge,
} from "../DataAnggotaUi";
import {
  formatDate,
  formatDateTime,
} from "../dataAnggotaHelpers";
import { useAnggotaDetailOverlay } from "./AnggotaDetailOverlay";

export default function PendingReviewSection({ members = [] }) {
  const [isOpen, setIsOpen] = useState(false);
  const contentId = useId();
  const { openAnggotaDetail } = useAnggotaDetailOverlay();

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
            <AppIcon name="person_add" size={23} />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-bold text-text">Calon Anggota</h2>

              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                {members.length} menunggu review
              </span>
            </div>

            <p className="mt-1 text-xs leading-5 text-text-muted">
              Daftar calon anggota yang masih menunggu pemeriksaan pembina.
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
          <span className="text-xs font-semibold text-text-muted">
            {isOpen ? "Tutup daftar" : "Lihat daftar"}
          </span>

          <span
            className={`pending-review-chevron flex h-9 w-9 items-center justify-center rounded-xl bg-input text-text-muted group-hover:bg-primary/10 group-hover:text-primary ${
              isOpen ? "is-open bg-primary/10 text-primary" : ""
            }`}
          >
            <AppIcon name="expand_more" size={23} />
          </span>
        </div>
      </button>

      <div
        id={contentId}
        aria-hidden={!isOpen}
        data-open={isOpen ? "true" : "false"}
        className="pending-review-collapse"
      >
        <div className="pending-review-collapse-inner">
          <div className="border-t border-border">
            {members.length ? (
              <div className="w-full min-w-0 overflow-x-auto">
                <table className="w-full min-w-[1100px] text-left">
                  <thead className="bg-input text-xs uppercase tracking-wider text-text-muted">
                    <tr>
                      <th className="px-5 py-4">NIS</th>
                      <th className="px-5 py-4">Nama Lengkap</th>
                      <th className="px-5 py-4">Kelas</th>
                      <th className="px-5 py-4">Jabatan / Sekbid</th>
                      <th className="px-5 py-4">Periode</th>
                      <th className="px-5 py-4">Tanggal Pengajuan</th>
                      <th className="px-5 py-4 text-center">Status</th>
                      <th className="w-14 px-5 py-4" aria-label="Buka detail" />
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-border">
                    {members.map((member) => (
                      <tr
                        key={member.id}
                        role="button"
                        tabIndex={0}
                        title={`Lihat detail ${member.namaLengkap || "anggota"}`}
                        onClick={() => openAnggotaDetail(member)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openAnggotaDetail(member);
                          }
                        }}
                        className="group cursor-pointer transition-colors hover:bg-input/60 focus-visible:bg-input/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                      >
                        <td className="px-5 py-4 text-sm font-medium text-text">
                          {member.nis || "-"}
                        </td>

                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <Avatar name={member.namaLengkap} size="sm" />

                            <div className="min-w-0">
                              <p className="max-w-56 truncate text-sm font-semibold text-text">
                                {member.namaLengkap || "-"}
                              </p>
                              <p className="mt-1 text-xs text-text-muted">
                                Diperbarui {formatDate(member.diperbaruiPada)}
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="px-5 py-4 text-sm text-text-muted">
                          {member.namaKelas || "-"}
                        </td>

                        <td className="px-5 py-4">
                          <p className="text-sm font-semibold text-text">
                            {member.jabatanOrganisasi || "Anggota"}
                          </p>
                          <p className="mt-1 text-xs text-text-muted">
                            {member.divisi
                              ? (member.divisi.namaSingkat || member.divisi.nama || "-")
                              : "Belum memilih sekbid"}
                          </p>
                        </td>

                        <td className="px-5 py-4 text-sm text-text-muted">
                          {member.periodeData?.namaPeriode || "-"}
                        </td>

                        <td className="px-5 py-4 text-sm text-text-muted">
                          {formatDateTime(member.waktuPengajuanReview)}
                        </td>

                        <td className="px-5 py-4 text-center">
                          <MemberStatusBadge
                            status={member.statusKeanggotaan}
                          />
                        </td>

                        <td className="w-14 px-5 py-4 text-right">
                          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-text-muted transition group-hover:translate-x-0.5 group-hover:bg-primary/10 group-hover:text-primary">
                            <AppIcon name="chevron_right" size={21} />
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-5">
                <EmptyState
                  icon="person_add"
                  title="Belum ada pengajuan anggota"
                  description="Data calon anggota berstatus menunggu review akan tampil di bagian ini."
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}