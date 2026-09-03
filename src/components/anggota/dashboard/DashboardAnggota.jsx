"use client";

import Link from "next/link";
import { useMemo } from "react";

import AppIcon from "@/components/global/AppIcon";
import { useDb } from "@/context/DbContext";
import { useCollection } from "@/hooks/useCollection";
import { useCurrentMember } from "@/components/anggota/_shared/useCurrentMember";
import {
  formatShortDate,
  formatTime,
  toDate,
} from "@/components/anggota/_shared/formatters";
import {
  EmptyState,
  PageError,
  PageHeading,
  PageLoading,
  SectionTitle,
  StatCard,
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

function labelStatusKeanggotaan(status) {
  return LABEL_STATUS_KEANGGOTAAN[status] || status || "-";
}

function labelDivisi(divisi) {
  return divisi?.namaSingkat || divisi?.nama || "Divisi belum ditentukan";
}

function normalisasiStatusKehadiran(value) {
  const status = String(value || "").trim().toLowerCase();

  return (
    {
      hadir: "hadir",
      present: "hadir",
      terlambat: "terlambat",
      late: "terlambat",
      izin: "izin",
      excused: "izin",
      sakit: "sakit",
      sick: "sakit",
      alpa: "alpa",
      absent: "alpa",
    }[status] ||
    status ||
    "-"
  );
}

function statusAbsensi(record) {
  return normalisasiStatusKehadiran(
    record?.statusKehadiran ?? record?.status
  );
}

function waktuCheckIn(record) {
  return (
    record?.waktuCheckIn ??
    record?.checkInPada ??
    record?.checkInAt ??
    null
  );
}

function waktuRecord(record) {
  return (
    waktuCheckIn(record) ??
    record?.dibuatPada ??
    record?.createdAt ??
    null
  );
}

function sortTerbaru(rows, getValue) {
  return [...rows].sort((a, b) => {
    const aTime = toDate(getValue(a))?.getTime() || 0;
    const bTime = toDate(getValue(b))?.getTime() || 0;
    return bTime - aTime;
  });
}

export default function DashboardAnggota() {
  const {
    member,
    memberId,
    loading: memberLoading,
    error: memberError,
  } = useCurrentMember();

  const { colRef, query, where, limit } = useDb();

  const attendance = useCollection(
    () =>
      memberId
        ? query(colRef("Absensi"), where("idAnggota", "==", memberId))
        : null,
    [memberId],
    { enabled: Boolean(memberId) }
  );

  const summaries = useCollection(
    () =>
      memberId
        ? query(
            colRef("RingkasanAbsensi"),
            where("idAnggota", "==", memberId),
            limit(1)
          )
        : null,
    [memberId],
    { enabled: Boolean(memberId) }
  );

  const proposals = useCollection(
    () =>
      memberId
        ? query(colRef("Proposal"), where("idPengunggah", "==", memberId))
        : null,
    [memberId],
    { enabled: Boolean(memberId) }
  );

  const activities = useCollection(() => colRef("Kegiatan"), [], {
    enabled: true,
  });

  const sessions = useCollection(() => colRef("SesiAbsensi"), [], {
    enabled: true,
  });

  const announcements = useCollection(() => colRef("Pengumuman"), [], {
    enabled: true,
  });

  const divisions = useCollection(() => colRef("Divisi"), [], {
    enabled: true,
  });

  const loading =
    memberLoading ||
    attendance.loading ||
    summaries.loading ||
    proposals.loading ||
    activities.loading ||
    sessions.loading ||
    announcements.loading ||
    divisions.loading;

  const error =
    memberError ||
    attendance.error ||
    summaries.error ||
    proposals.error ||
    activities.error ||
    sessions.error ||
    announcements.error ||
    divisions.error;

  const data = useMemo(() => {
    const activityRows = rowsOf(activities);
    const sessionRows = rowsOf(sessions);
    const attendanceRows = rowsOf(attendance);
    const divisionRows = rowsOf(divisions);

    const activityMap = new Map(activityRows.map((item) => [item.id, item]));
    const sessionMap = new Map(sessionRows.map((item) => [item.id, item]));

    const recentAttendance = sortTerbaru(attendanceRows, waktuRecord)
      .slice(0, 5)
      .map((record) => {
        const idSesi = record.idSesi ?? record.sessionId ?? null;
        const session = idSesi ? sessionMap.get(idSesi) || null : null;
        const idKegiatan =
          record.idKegiatan ??
          record.activityId ??
          session?.idKegiatan ??
          null;

        return {
          ...record,
          session,
          activity: idKegiatan ? activityMap.get(idKegiatan) || null : null,
          statusTampil: statusAbsensi(record),
        };
      });

    const isInvolved = (activity) => {
      const participants = Array.isArray(activity?.pesertaFinal?.idAnggota)
        ? activity.pesertaFinal.idAnggota
        : [];
      const committee = Array.isArray(activity?.idAnggotaPanitia)
        ? activity.idAnggotaPanitia
        : [];
      return (
        participants.includes(memberId) ||
        committee.includes(memberId) ||
        activity?.idPenanggungJawab === memberId
      );
    };

    const upcomingActivities = [...activityRows]
      .filter((activity) =>
        ["akan_datang", "berlangsung"].includes(activity.status) &&
        isInvolved(activity)
      )
      .sort((a, b) => {
        const dateA = toDate(a.waktuMulai)?.getTime() || 0;
        const dateB = toDate(b.waktuMulai)?.getTime() || 0;
        return dateA - dateB;
      })
      .slice(0, 4);

    const publishedAnnouncements = sortTerbaru(
      rowsOf(announcements).filter(
        (item) =>
          item.isPublished !== false &&
          (!Array.isArray(item.audienceRoles) ||
            item.audienceRoles.includes("anggota"))
      ),
      (item) => item.publishedAt ?? item.diterbitkanPada ?? item.dibuatPada
    ).slice(0, 4);

    const joinedActivities = activityRows.filter(isInvolved);

    const division = divisionRows.find((item) => item.id === member?.idDivisi);

    return {
      recentAttendance,
      upcomingActivities,
      publishedAnnouncements,
      joinedActivities,
      division,
      summary: rowsOf(summaries)[0] || null,
    };
  }, [
    activities,
    sessions,
    attendance,
    announcements,
    divisions,
    member?.idDivisi,
    memberId,
    summaries,
  ]);

  if (loading) {
    return <PageLoading message="Memuat dashboard anggota..." />;
  }

  if (error) {
    return <PageError message={error.message} />;
  }

  if (!member) {
    return (
      <PageError
        title="Profil anggota tidak ditemukan"
        message="Hubungkan dokumen Anggota dengan akun login melalui field idPengguna."
      />
    );
  }

  const attendancePercentage =
    data.summary?.persentaseKehadiran ??
    calculateAttendancePercentage(
      rowsOf(attendance).filter(
        (item) => !item?.statusVerifikasi || item.statusVerifikasi === "dikonfirmasi"
      )
    );

  const pendingProposalCount = rowsOf(proposals).filter((item) =>
    ["menunggu_review", "perlu_revisi"].includes(item.status)
  ).length;

  return (
    <div>
      <PageHeading
        eyebrow="Dashboard Anggota"
        title={`Halo, ${member.namaLengkap || "Anggota"}`}
        description="Pantau kehadiran, kegiatan, proposal, dan informasi organisasi dalam satu halaman."
      />

      <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon="verified_user"
          label="Total Kehadiran"
          value={`${attendancePercentage}%`}
          helper="Persentase kehadiran pada periode aktif."
        />

        <StatCard
          icon="event_available"
          label="Kegiatan Diikuti"
          value={data.joinedActivities.length}
          helper="Kegiatan saat kamu menjadi penanggung jawab atau panitia."
          accent="blue"
        />

        <StatCard
          icon="badge"
          label="Status Keanggotaan"
          value={labelStatusKeanggotaan(member.statusKeanggotaan)}
          helper={labelDivisi(data.division)}
          accent="green"
        />

      </section>

      <section className="mt-7 grid grid-cols-1 gap-6 xl:grid-cols-5">
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm xl:col-span-3">
          <div className="border-b border-border p-5">
            <SectionTitle
              icon="fact_check"
              title="Histori Kehadiran"
              description="Lima catatan kehadiran terakhir."
              action={
                <Link
                  href="/anggota/absensi"
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  Lihat Semua
                </Link>
              }
            />
          </div>

          {data.recentAttendance.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon="fact_check"
                title="Belum ada histori kehadiran"
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[650px] text-left">
                <thead className="bg-input text-xs uppercase tracking-wider text-text-muted">
                  <tr>
                    <th className="px-5 py-4 font-semibold">Nama Kegiatan</th>
                    <th className="px-5 py-4 font-semibold">Tanggal</th>
                    <th className="px-5 py-4 font-semibold">Jam Presensi</th>
                    <th className="px-5 py-4 text-center font-semibold">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.recentAttendance.map((record) => (
                    <tr key={record.id} className="hover:bg-input/60">
                      <td className="px-5 py-4">
                        <p className="font-semibold text-text">
                          {record.activity?.namaKegiatan ||
                            "Kegiatan tidak ditemukan"}
                        </p>
                        <p className="mt-1 text-xs text-text-muted">
                          {record.activity?.lokasi || "-"}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-sm text-text-muted">
                        {formatShortDate(
                          record.session?.tanggal ||
                            record.activity?.waktuMulai ||
                            waktuRecord(record)
                        )}
                      </td>
                      <td className="px-5 py-4 text-sm text-text-muted">
                        {formatTime(waktuCheckIn(record))}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <StatusKehadiranBadge status={record.statusTampil} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm xl:col-span-2">
          <SectionTitle
            icon="calendar_month"
            title="Kegiatan Mendatang"
            description="Agenda terdekat yang perlu diperhatikan."
            action={
              <Link
                href="/anggota/kegiatan"
                className="text-xs font-semibold text-primary hover:underline"
              >
                Lihat Semua
              </Link>
            }
          />

          <div className="mt-5 space-y-3">
            {data.upcomingActivities.length === 0 ? (
              <EmptyState
                icon="calendar_month"
                title="Tidak ada kegiatan mendatang"
              />
            ) : (
              data.upcomingActivities.map((activity) => {
                const startDate = toDate(activity.waktuMulai);

                return (
                  <article
                    key={activity.id}
                    className="flex items-start gap-4 rounded-xl border border-border bg-surface p-4"
                  >
                    <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-primary text-white">
                      <span className="text-[10px] font-semibold uppercase">
                        {startDate
                          ? new Intl.DateTimeFormat("id-ID", {
                              month: "short",
                            }).format(startDate)
                          : "-"}
                      </span>
                      <span className="text-base font-bold leading-none">
                        {startDate
                          ? new Intl.DateTimeFormat("id-ID", {
                              day: "2-digit",
                            }).format(startDate)
                          : "-"}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-text">
                        {activity.namaKegiatan || "Kegiatan"}
                      </h3>
                      <p className="mt-1 text-xs text-text-muted">
                        {formatTime(activity.waktuMulai)}
                      </p>
                      <p className="mt-1 truncate text-xs text-text-muted">
                        {activity.lokasi || "-"}
                      </p>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <SectionTitle
          icon="campaign"
          title="Pengumuman Terbaru"
          description="Informasi resmi untuk anggota OSIS."
          action={
            <Link
              href="/anggota/pengumuman"
              className="text-xs font-semibold text-primary hover:underline"
            >
              Buka Pengumuman
            </Link>
          }
        />

        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {data.publishedAnnouncements.map((announcement) => (
            <article
              key={announcement.id}
              className="rounded-xl border border-border bg-surface p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold text-text">
                  {announcement.title || announcement.judul || "Pengumuman"}
                </h3>
                {announcement.isPinned && (
                  <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary">
                    Disematkan
                  </span>
                )}
              </div>
              <p className="mt-2 line-clamp-2 text-xs leading-5 text-text-muted">
                {announcement.summary ||
                  announcement.ringkasan ||
                  announcement.content ||
                  announcement.isi ||
                  ""}
              </p>
              <p className="mt-3 text-[11px] font-medium text-primary">
                {formatShortDate(
                  announcement.publishedAt || announcement.diterbitkanPada
                )}
              </p>
            </article>
          ))}
        </div>

        {data.publishedAnnouncements.length === 0 && (
          <div className="mt-5">
            <EmptyState icon="campaign" title="Belum ada pengumuman terbaru" />
          </div>
        )}

        {pendingProposalCount > 0 && (
          <div className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Kamu memiliki {pendingProposalCount} proposal yang sedang menunggu
            review atau membutuhkan revisi.
          </div>
        )}
      </section>
    </div>
  );
}

function calculateAttendancePercentage(records) {
  if (!records.length) return 0;

  const attended = records.filter((item) =>
    ["hadir", "terlambat"].includes(statusAbsensi(item))
  ).length;

  return Math.round((attended / records.length) * 100);
}

function StatusKehadiranBadge({ status }) {
  const config = {
    hadir: ["Hadir", "bg-emerald-50 text-emerald-700"],
    terlambat: ["Terlambat", "bg-amber-50 text-amber-700"],
    izin: ["Izin", "bg-blue-50 text-blue-700"],
    sakit: ["Sakit", "bg-violet-50 text-violet-700"],
    alpa: ["Alpa", "bg-red-50 text-red-700"],
  }[status] || [status || "-", "bg-slate-100 text-slate-700"];

  return (
    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${config[1]}`}>
      {config[0]}
    </span>
  );
}
