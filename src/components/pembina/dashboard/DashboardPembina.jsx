"use client";

import Link from "next/link";
import { useMemo } from "react";

import AppIcon from "@/components/global/AppIcon";
import { useAuth } from "@/context/AuthContext";
import { useDb } from "@/context/DbContext";
import { useCollection } from "@/hooks/useCollection";
import {
  firstError,
  formatDate,
  formatDateTime,
  formatTime,
  isLoading,
  percentage,
  rowsOf,
  sortDateAsc,
  sortDateDesc,
  toDate,
} from "@/components/pembina/_shared/firestoreHelpers";
import {
  ActivityStatusBadge,
  Avatar,
  DisabledAction,
  EmptyState,
  MemberStatusBadge,
  PageError,
  PageHeading,
  PageLoading,
  ProposalStatusBadge,
  SectionHeader,
  StatCard,
} from "@/components/pembina/_shared/PembinaUi";

export default function DashboardPembina() {
  const { user, userDoc } = useAuth();
  const { colRef } = useDb();

  const members = useCollection(() => colRef("Anggota"), [], {
    enabled: true,
  });
  const divisions = useCollection(() => colRef("Divisi"), [], {
    enabled: true,
  });
  const activities = useCollection(() => colRef("Kegiatan"), [], {
    enabled: true,
  });
  const sessions = useCollection(() => colRef("SesiAbsensi"), [], {
    enabled: true,
  });
  const attendance = useCollection(() => colRef("Absensi"), [], {
    enabled: true,
  });
  const summaries = useCollection(
    () => colRef("RingkasanAbsensiOrganisasi"),
    [],
    { enabled: true }
  );
  const proposals = useCollection(() => colRef("Proposal"), [], {
    enabled: true,
  });
  const announcements = useCollection(
    () => colRef("Pengumuman"),
    [],
    { enabled: true }
  );

  const loading = isLoading(
    members,
    divisions,
    activities,
    sessions,
    attendance,
    summaries,
    proposals,
    announcements
  );

  const error = firstError(
    members,
    divisions,
    activities,
    sessions,
    attendance,
    summaries,
    proposals,
    announcements
  );

  const data = useMemo(() => {
    const memberRows = rowsOf(members);
    const divisionRows = rowsOf(divisions);
    const activityRows = rowsOf(activities);
    const sessionRows = rowsOf(sessions);
    const attendanceRows = rowsOf(attendance);
    const summaryRows = rowsOf(summaries);
    const proposalRows = rowsOf(proposals);
    const announcementRows = rowsOf(announcements);

    const divisionMap = new Map(
      divisionRows.map((item) => [item.id, item])
    );
    const memberMap = new Map(
      memberRows.map((item) => [item.id, item])
    );
    const activityMap = new Map(
      activityRows.map((item) => [item.id, item])
    );

    const statusMember = (item) =>
      item?.statusKeanggotaan || item?.membershipStatus || null;
    const official = memberRows.filter((item) =>
      ["aktif", "nonaktif", "ditangguhkan", "active", "inactive", "suspended"].includes(
        statusMember(item)
      )
    );
    const active = official.filter((item) =>
      ["aktif", "active"].includes(statusMember(item))
    );
    const pending = memberRows.filter((item) =>
      ["menunggu_review", "pending_review"].includes(statusMember(item))
    );
    const activeActivities = activityRows.filter((item) =>
      ["akan_datang", "berlangsung", "upcoming", "ongoing"].includes(item.status)
    );
    const proposalActions = proposalRows.filter((item) =>
      ["menunggu_review", "perlu_revisi", "pending_review", "revision_required"].includes(item.status)
    );

    const latestSummary = sortDateDesc(
      summaryRows,
      "diperbaruiPada"
    )[0] || sortDateDesc(summaryRows, "updatedAt")[0];
    const attendancePercentage =
      latestSummary?.persentaseKehadiran ??
      latestSummary?.attendancePercentage ??
      calculateAttendance(sessionRows, attendanceRows, activityMap);

    const openSessions = sortDateDesc(
      sessionRows.filter((item) => ["dibuka", "open"].includes(item.status)),
      "waktuMulai"
    ).map((item) => ({
      ...item,
      startAt: item.waktuMulai || item.startAt || null,
      activity:
        activityMap.get(item.idKegiatan || item.activityId) || null,
    }));

    const upcoming = sortDateAsc(
      activityRows.filter((item) =>
        ["akan_datang", "berlangsung", "upcoming", "ongoing"].includes(item.status)
      ),
      "waktuMulai"
    )
      .slice(0, 5)
      .map((item) => ({
        ...item,
        title: item.namaKegiatan || item.title || "Kegiatan",
        startAt: item.waktuMulai || item.startAt || null,
        location: item.lokasi || item.location || "-",
        division: divisionMap.get(item.idDivisi || item.divisionId) || null,
      }));

    const registrations = sortDateDesc(
      memberRows.filter((item) =>
        ["menunggu_review", "ditolak", "pending_review", "rejected"].includes(
          statusMember(item)
        )
      ),
      "diajukanPada"
    )
      .slice(0, 5)
      .map((item) => ({
        ...item,
        division: divisionMap.get(item.idDivisi || item.divisionId) || null,
      }));

    const latestProposals = sortDateDesc(
      proposalRows,
      "diajukanPada"
    )
      .slice(0, 5)
      .map((item) => ({
        ...item,
        title: item.namaKegiatan || "Proposal Kegiatan",
        submittedAt: item.diajukanPada || item.submittedAt || null,
        member: memberMap.get(item.idPengunggah || item.uploadedBy) || null,
        activity: activityMap.get(item.idKegiatan || item.activityId) || null,
      }));

    const latestAnnouncements = sortDateDesc(
      announcementRows,
      "updatedAt"
    ).slice(0, 4);

    return {
      official,
      active,
      pending,
      activeActivities,
      proposalActions,
      attendancePercentage: percentage(attendancePercentage),
      openSessions,
      upcoming,
      registrations,
      latestProposals,
      latestAnnouncements,
      trend: buildTrend(sessionRows, attendanceRows, activityMap),
      divisionCount: divisionRows.filter(
        (item) => item.isActive !== false
      ).length,
      inactiveCount: official.filter(
        (item) => !["aktif", "active"].includes(statusMember(item))
      ).length,
    };
  }, [
    members,
    divisions,
    activities,
    sessions,
    attendance,
    summaries,
    proposals,
    announcements,
  ]);

  if (loading) return <PageLoading message="Memuat dashboard pembina..." />;
  if (error) return <PageError message={error.message} />;

  const profileName =
    userDoc?.fullName ||
    userDoc?.name ||
    userDoc?.username ||
    user?.displayName ||
    "Pembina OSIS";

  return (
    <div>
      <PageHeading
        eyebrow="Dashboard Pembina"
        title={`Selamat datang, ${profileName}`}
        description="Pantau anggota, kehadiran, kegiatan, pendaftaran, dan informasi OSIS dalam satu halaman."
        action={
          <div className="flex flex-wrap gap-3">
            <Link
              href="/pembina/data-anggota"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white"
            >
              <AppIcon name="person_add" size={18} />
              Review Pendaftaran
            </Link>
          </div>
        }
      />

      <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon="groups"
          label="Total Anggota"
          value={data.official.length}
          helper={`${data.active.length} anggota aktif`}
          badge={`${data.divisionCount} sekbid`}
        />
        <StatCard
          icon="fact_check"
          label="Kehadiran Bulan Ini"
          value={`${data.attendancePercentage}%`}
          helper="Rata-rata kehadiran organisasi"
          badge="Terpantau"
          accent="green"
        />
        <StatCard
          icon="event_available"
          label="Kegiatan Aktif"
          value={data.activeActivities.length}
          helper="Berlangsung dan akan datang"
          badge={`${data.openSessions.length} sesi terbuka`}
          accent="blue"
        />
        <StatCard
          icon="person_add"
          label="Pendaftaran Baru"
          value={data.pending.length}
          helper="Menunggu pemeriksaan pembina"
          badge={data.pending.length ? "Perlu review" : "Sudah bersih"}
          accent="amber"
        />
      </section>

      <section className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <MiniCard
          icon="verified_user"
          label="Anggota Aktif"
          value={data.active.length}
          helper="Anggota resmi periode berjalan"
        />
        <MiniCard
          icon="person"
          label="Tidak Aktif"
          value={data.inactiveCount}
          helper="Tidak aktif atau ditangguhkan"
          accent="red"
        />
        <MiniCard
          icon="receipt"
          label="Proposal Perlu Tindakan"
          value={data.proposalActions.length}
          helper="Menunggu review atau revisi"
          accent="amber"
        />
      </section>

      {data.openSessions[0] && (
        <section className="mt-6">
          <ActiveSession session={data.openSessions[0]} />
        </section>
      )}

      <section className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-5">
        <article className="rounded-2xl border border-border bg-card p-6 shadow-sm xl:col-span-3">
          <SectionHeader
            icon="fact_check"
            title="Tren Kehadiran"
            description="Persentase kehadiran dari sesi absensi terakhir."
            action={
              <Link
                href="/pembina/absensi"
                className="text-xs font-semibold text-primary"
              >
                Buka Absensi
              </Link>
            }
          />
          <AttendanceChart rows={data.trend} />
        </article>

        <article className="rounded-2xl border border-border bg-card p-6 shadow-sm xl:col-span-2">
          <SectionHeader
            icon="event_available"
            title="Kegiatan Mendatang"
            description="Agenda terdekat organisasi."
            action={
              <Link
                href="/pembina/kegiatan"
                className="text-xs font-semibold text-primary"
              >
                Lihat Semua
              </Link>
            }
          />

          <div className="mt-5 space-y-3">
            {data.upcoming.length ? (
              data.upcoming.map((activity) => (
                <UpcomingActivity key={activity.id} activity={activity} />
              ))
            ) : (
              <EmptyState
                icon="event_available"
                title="Belum ada kegiatan aktif"
              />
            )}
          </div>
        </article>
      </section>

      <section className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <article className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="border-b border-border p-5">
            <SectionHeader
              icon="person_add"
              title="Pendaftaran Terbaru"
              description="Calon anggota yang perlu dipantau."
            />
          </div>

          {data.registrations.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-left">
                <thead className="bg-input text-xs uppercase tracking-wider text-text-muted">
                  <tr>
                    <th className="px-5 py-4">Pendaftar</th>
                    <th className="px-5 py-4">Sekbid</th>
                    <th className="px-5 py-4">Diajukan</th>
                    <th className="px-5 py-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.registrations.map((member) => (
                    <tr key={member.id}>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <Avatar name={member.fullName} size="sm" />
                          <div>
                            <p className="text-sm font-semibold text-text">
                              {member.fullName}
                            </p>
                            <p className="mt-1 text-xs text-text-muted">
                              {member.nis} · {member.className}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm text-text-muted">
                        {member.division
                          ? `Sekbid ${member.division.code}`
                          : "-"}
                      </td>
                      <td className="px-5 py-4 text-sm text-text-muted">
                        {formatDate(member.submittedAt || member.createdAt)}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <MemberStatusBadge
                          status={member.membershipStatus}
                        />
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
                title="Tidak ada pendaftaran baru"
              />
            </div>
          )}
        </article>

        <article className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="border-b border-border p-5">
            <SectionHeader
              icon="receipt"
              title="Proposal Terbaru"
              description="Status pengajuan kegiatan anggota."
            />
          </div>

          {data.latestProposals.length ? (
            <div className="divide-y divide-border">
              {data.latestProposals.map((proposal) => (
                <div key={proposal.id} className="p-5">
                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <AppIcon name="receipt" size={21} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-text">
                          {proposal.title}
                        </p>
                        <ProposalStatusBadge status={proposal.status} />
                      </div>
                      <p className="mt-1 text-xs text-text-muted">
                        {proposal.member?.fullName || "Pengaju tidak ditemukan"}
                      </p>
                      <p className="mt-2 text-[11px] text-text-muted">
                        {formatDate(proposal.submittedAt)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-5">
              <EmptyState icon="receipt" title="Belum ada proposal" />
            </div>
          )}
        </article>
      </section>

      <section className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-sm">
        <SectionHeader
          icon="campaign"
          title="Pengumuman Terbaru"
          description="Draf, jadwal, dan publikasi informasi OSIS."
        />

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {data.latestAnnouncements.length ? (
            data.latestAnnouncements.map((item) => (
              <article
                key={item.id}
                className="rounded-xl border border-border bg-surface p-4"
              >
                <p className="text-[10px] font-bold uppercase tracking-wider text-primary">
                  {item.publicationStatus ||
                    (item.isPublished ? "published" : "draft")}
                </p>
                <h3 className="mt-3 text-sm font-bold leading-6 text-text">
                  {item.title}
                </h3>
                <p className="mt-2 max-h-10 overflow-hidden text-xs leading-5 text-text-muted">
                  {item.summary || item.content}
                </p>
                <p className="mt-4 text-[11px] font-semibold text-primary">
                  {formatDate(
                    item.publishedAt || item.scheduledAt || item.updatedAt
                  )}
                </p>
              </article>
            ))
          ) : (
            <div className="md:col-span-2 xl:col-span-4">
              <EmptyState icon="campaign" title="Belum ada pengumuman" />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function expectedParticipantIds(activity) {
  const ids = new Set(
    Array.isArray(activity?.pesertaFinal?.idAnggota)
      ? activity.pesertaFinal.idAnggota
      : []
  );
  if (activity?.idPenanggungJawab) ids.add(activity.idPenanggungJawab);
  if (Array.isArray(activity?.idAnggotaPanitia)) {
    activity.idAnggotaPanitia.forEach((id) => id && ids.add(id));
  }
  return Array.from(ids);
}

function attendanceRecordStatus(record) {
  const value = String(record?.statusKehadiran ?? record?.status ?? "").toLowerCase();
  if (["hadir", "present"].includes(value)) return "hadir";
  if (["terlambat", "late"].includes(value)) return "terlambat";
  return value;
}

function calculateAttendance(sessions, records, activityMap) {
  const closed = sessions.filter((item) =>
    ["ditutup", "closed"].includes(item.status)
  );
  let expected = 0;
  let present = 0;

  closed.forEach((session) => {
    const activity = activityMap.get(session.idKegiatan || session.activityId);
    const expectedIds = expectedParticipantIds(activity);
    expected += expectedIds.length;

    const sessionRows = records.filter(
      (record) =>
        (record.idSesi || record.sessionId) === session.id &&
        (!record.statusVerifikasi || record.statusVerifikasi === "dikonfirmasi")
    );
    present += sessionRows.filter((record) =>
      ["hadir", "terlambat"].includes(attendanceRecordStatus(record))
    ).length;
  });

  return expected ? (present / expected) * 100 : 0;
}

function buildTrend(sessions, records, activityMap) {
  return sortDateDesc(
    sessions.filter((item) => ["ditutup", "closed"].includes(item.status)),
    "waktuMulai"
  )
    .slice(0, 6)
    .reverse()
    .map((session) => {
      const activity = activityMap.get(session.idKegiatan || session.activityId);
      const expected = expectedParticipantIds(activity).length;
      const sessionRows = records.filter(
        (record) =>
          (record.idSesi || record.sessionId) === session.id &&
          (!record.statusVerifikasi || record.statusVerifikasi === "dikonfirmasi")
      );
      const present = sessionRows.filter((record) =>
        ["hadir", "terlambat"].includes(attendanceRecordStatus(record))
      ).length;

      return {
        id: session.id,
        title: activity?.namaKegiatan || activity?.title || "Kegiatan",
        date: session.waktuMulai || session.startAt || session.tanggal,
        percentage: expected ? percentage((present / expected) * 100) : 0,
      };
    });
}

function MiniCard({ icon, label, value, helper, accent = "green" }) {
  const accents = {
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
  };

  return (
    <article className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
          accents[accent]
        }`}
      >
        <AppIcon name={icon} size={23} />
      </div>
      <div>
        <p className="text-xs text-text-muted">{label}</p>
        <p className="mt-1 text-2xl font-bold text-text">{value}</p>
        <p className="mt-1 text-xs text-text-muted">{helper}</p>
      </div>
    </article>
  );
}

function ActiveSession({ session }) {
  return (
    <article className="relative overflow-hidden rounded-2xl bg-primary p-6 text-white">
      <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] opacity-75">
            Sesi Absensi Sedang Dibuka
          </p>
          <h2 className="mt-2 text-xl font-bold">
            {session.activity?.namaKegiatan || session.activity?.title || session.title || "Kegiatan"}
          </h2>
          <p className="mt-2 text-sm opacity-80">
            {formatDateTime(session.waktuMulai || session.startAt)} ·{" "}
            {session.activity?.lokasi || session.activity?.location || "-"}
          </p>
        </div>

        <Link
          href="/pembina/absensi"
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-bold text-primary"
        >
          Buka Absensi
          <AppIcon name="arrow_forward" size={18} />
        </Link>
      </div>
    </article>
  );
}

function AttendanceChart({ rows }) {
  if (!rows.length) {
    return (
      <div className="mt-5">
        <EmptyState
          icon="fact_check"
          title="Belum ada tren kehadiran"
        />
      </div>
    );
  }

  return (
    <div className="mt-7 flex h-64 items-end gap-3 border-b border-border pb-3">
      {rows.map((row) => (
        <div
          key={row.id}
          className="flex h-full min-w-0 flex-1 flex-col justify-end"
        >
          <p className="mb-2 text-center text-xs font-bold text-primary">
            {row.percentage}%
          </p>
          <div className="flex h-[180px] items-end rounded-xl bg-input p-1">
            <div
              className="w-full rounded-lg bg-primary"
              style={{ height: `${Math.max(row.percentage, 4)}%` }}
            />
          </div>
          <p className="mt-2 truncate text-center text-[10px] font-semibold text-text">
            {row.title}
          </p>
          <p className="mt-1 text-center text-[10px] text-text-muted">
            {formatDate(row.date, { year: undefined })}
          </p>
        </div>
      ))}
    </div>
  );
}

function UpcomingActivity({ activity }) {
  const date = toDate(activity.startAt);

  return (
    <article className="flex items-start gap-4 rounded-xl border border-border bg-surface p-4">
      <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-primary text-white">
        <span className="text-[9px] uppercase">
          {date
            ? new Intl.DateTimeFormat("id-ID", {
                month: "short",
              }).format(date)
            : "-"}
        </span>
        <span className="text-lg font-bold leading-none">
          {date
            ? new Intl.DateTimeFormat("id-ID", {
                day: "2-digit",
              }).format(date)
            : "-"}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-text">
            {activity.title}
          </h3>
          <ActivityStatusBadge status={activity.status} />
        </div>
        <p className="mt-2 text-xs text-text-muted">
          {formatTime(activity.startAt)} · {activity.location || "-"}
        </p>
        <p className="mt-1 text-xs text-text-muted">
          {activity.division
            ? `Sekbid ${activity.division.code}`
            : "Pengurus Inti"}
        </p>
      </div>
    </article>
  );
}
