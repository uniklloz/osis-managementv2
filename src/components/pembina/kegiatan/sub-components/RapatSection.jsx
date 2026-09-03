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
  OPSI_STATUS_RAPAT,
  STATUS_KEGIATAN,
} from "../konfigurasiManajemenKegiatan";

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

export default function RapatSection({
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

  const terjadwal = rows.filter(
    (item) => item.status === STATUS_KEGIATAN.AKAN_DATANG
  ).length;
  const berlangsung = rows.filter(
    (item) => item.status === STATUS_KEGIATAN.BERLANGSUNG
  ).length;
  const selesai = rows.filter(
    (item) => item.status === STATUS_KEGIATAN.SELESAI
  ).length;

  return (
    <div>
      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-col gap-5 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
              <AppIcon name="groups" size={24} />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">Agenda Rapat</p>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-3xl font-bold tracking-tight text-text">{rows.length}</span>
                <span className="text-sm font-semibold text-text-muted">rapat tercatat</span>
              </div>
            </div>
          </div>
          <p className="max-w-md text-xs leading-5 text-text-muted sm:text-right">Ringkasan jadwal dan progres rapat OSIS pada periode berjalan.</p>
        </div>

        <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <RapatMetric icon="event_upcoming" label="Terjadwal" value={terjadwal} helper="Sudah difinalisasi" />
          <RapatMetric icon="meeting_room" label="Berlangsung" value={berlangsung} helper="Sedang berjalan" />
          <RapatMetric icon="task_alt" label="Selesai" value={selesai} helper="Rapat telah ditutup" />
        </div>
      </section>

      {typeSelector}

      <KegiatanFilterBar
        eyebrow="Agenda Organisasi"
        title="Daftar Rapat"
        count={filtered.length}
        search={search}
        setSearch={setSearch}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        searchPlaceholder="Cari nama rapat atau lokasi"
        options={OPSI_STATUS_RAPAT}
      />

      {filtered.length ? (
        <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {filtered.map((activity) => {
            const participantCount = Number(
              activity?.pesertaFinal?.jumlahPeserta ||
                activity?.kapasitasPeserta ||
                0
            );

            return (
              <button
                key={activity.id}
                type="button"
                onClick={() => onOpenDetail?.(activity)}
                className="w-full overflow-hidden rounded-2xl border border-border bg-card text-left shadow-sm transition duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                aria-label={`Buka detail ${activity.namaKegiatan || "rapat"}`}
              >
                <div className="border-b border-border p-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-blue-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-700">
                        Rapat
                      </span>
                      <BadgeStatus status={activity.status} />
                    </div>
                    <h2 className="mt-3 font-bold text-text">
                      {activity.namaKegiatan || "Rapat tanpa judul"}
                    </h2>
                    <p className="mt-2 max-h-12 overflow-hidden text-sm leading-6 text-text-muted">
                      {activity.deskripsi || "Tidak ada agenda atau deskripsi."}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
                  <KegiatanMeta
                    label="Waktu Rapat"
                    value={formatDateTime(activity.waktuMulai)}
                  />
                  <KegiatanMeta label="Lokasi" value={activity.lokasi || "-"} />
                  <KegiatanMeta
                    label="Penyelenggara"
                    value={labelPenyelenggara(activity)}
                  />
                  <KegiatanMeta
                    label="Sesi Absensi"
                    value={`${activity.jumlahSesiAbsensi || 0} sesi`}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-border bg-surface p-4">
                  {participantCount > 0 && (
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-700 ring-1 ring-inset ring-blue-200">
                      {participantCount} peserta final
                    </span>
                  )}
                  {activity.status !== STATUS_KEGIATAN.DRAF &&
                    activity.statusJadwal === "difinalisasi" && (
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                        Jadwal ditetapkan
                      </span>
                    )}
                  {activity?.pengajuanRapat?.sumber === "anggota" && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-bold text-violet-700 ring-1 ring-inset ring-violet-200">
                      <AppIcon name="assignment_turned_in" size={13} />
                      Dari Pengajuan Anggota
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </section>
      ) : (
        <EmptyState
          icon="groups"
          title="Rapat tidak ditemukan"
          description="Coba ubah pencarian atau filter status."
        />
      )}
    </div>
  );
}

function RapatMetric({ icon, label, value, helper }) {
  return (
    <div className="flex items-center gap-4 p-5 sm:p-6">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface text-text-muted">
        <AppIcon name={icon} size={20} />
      </div>
      <div>
        <p className="text-2xl font-bold tracking-tight text-text">{value}</p>
        <p className="text-xs font-bold text-text">{label}</p>
        <p className="mt-0.5 text-[11px] text-text-muted">{helper}</p>
      </div>
    </div>
  );
}
