"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  collection,
  doc,
  writeBatch,
} from "firebase/firestore";

import AppIcon from "@/components/global/AppIcon";
import { useDb } from "@/context/DbContext";
import { useCollection } from "@/hooks/useCollection";

import {
  firstError,
  formatDateTime,
  formatLongDate,
  isLoading,
  rowsOf,
  sortDateDesc,
} from "@/components/pembina/_shared/firestoreHelpers";

import {
  Avatar,
  DisabledAction,
  EmptyState,
  MemberStatusBadge,
  PageError,
  PageHeading,
  PageLoading,
  SectionHeader,
  StatCard,
} from "@/components/pembina/_shared/PembinaUi";

import { useOverlay } from "@/context/ui/OverlayContext";

/*
 * Replace this later with the currently logged-in
 * pembina UID from your authentication context.
 */
const REVIEWER_ID = "user-pembina-001";

function normalizeRegistration(item) {
  const status = item.statusKeanggotaan || item.membershipStatus || "";
  const normalizedStatus = {
    menunggu_review: "pending_review",
    aktif: "active",
    nonaktif: "inactive",
    ditangguhkan: "suspended",
    ditolak: "rejected",
  }[status] || status;

  return {
    ...item,
    fullName: item.fullName || item.namaLengkap || "",
    className: item.className || item.namaKelas || "",
    divisionInterest: item.divisionInterest || item.idDivisi || "",
    divisionId: item.divisionId || item.idDivisi || "",
    userId: item.userId || item.idPengguna || null,
    membershipStatus: normalizedStatus,
    submittedAt: item.submittedAt || item.diajukanPada || null,
    reviewedAt: item.reviewedAt || item.ditinjauPada || null,
    reviewNote: item.reviewNote || item.catatanReview || null,
  };
}

export default function PendaftaranAnggotaPembina() {
  const {
    db,
    colRef,
    serverTimestamp,
  } = useDb();

  const {
    openOverlay,
    closeOverlay,
    closeAllOverlays,
  } = useOverlay();

  const members = useCollection(
    () => colRef("Anggota"),
    [],
    {
      enabled: true,
    }
  );

  const divisions = useCollection(
    () => colRef("Divisi"),
    [],
    {
      enabled: true,
    }
  );

  const reviewLogs = useCollection(
    () => colRef("ReviewPendaftaran"),
    [],
    {
      enabled: true,
    }
  );

  const [search, setSearch] = useState("");

  const [statusFilter, setStatusFilter] =
    useState("pending_review");

  const [
    divisionFilter,
    setDivisionFilter,
  ] = useState("all");

  const [selectedId, setSelectedId] =
    useState("");

  const [feedback, setFeedback] =
    useState(null);

  const loading = isLoading(
    members,
    divisions,
    reviewLogs
  );

  const error = firstError(
    members,
    divisions,
    reviewLogs
  );

  const data = useMemo(() => {
    const divisionRows = rowsOf(divisions);

    const divisionMap = new Map(
      divisionRows.map((item) => [
        item.id,
        item,
      ])
    );

    const logs = rowsOf(reviewLogs);

    const registrations = sortDateDesc(
      rowsOf(members).map(normalizeRegistration).filter(
        (item) =>
          [
            "pending_review",
            "rejected",
          ].includes(
            item.membershipStatus
          ) ||
          (item.membershipStatus ===
            "active" &&
            item.submittedAt)
      ),
      "submittedAt"
    ).map((item) => ({
      ...item,

      division: divisionMap.get(
        item.divisionInterest ||
          item.divisionId
      ),

      logs: sortDateDesc(
        logs.filter(
          (log) =>
            log.memberId === item.id
        ),
        "createdAt"
      ),
    }));

    const keyword =
      search.trim().toLowerCase();

    const filtered =
      registrations.filter((item) => {
        const matchesKeyword =
          !keyword ||
          item.fullName
            ?.toLowerCase()
            .includes(keyword) ||
          item.nis
            ?.toLowerCase()
            .includes(keyword) ||
          item.className
            ?.toLowerCase()
            .includes(keyword);

        const matchesStatus =
          statusFilter === "all" ||
          item.membershipStatus ===
            statusFilter;

        const matchesDivision =
          divisionFilter === "all" ||
          item.divisionInterest ===
            divisionFilter ||
          item.divisionId ===
            divisionFilter;

        return (
          matchesKeyword &&
          matchesStatus &&
          matchesDivision
        );
      });

    return {
      registrations,
      filtered,
      divisionRows,

      pending: registrations.filter(
        (item) =>
          item.membershipStatus ===
          "pending_review"
      ).length,

      rejected: registrations.filter(
        (item) =>
          item.membershipStatus ===
          "rejected"
      ).length,

      accepted: registrations.filter(
        (item) =>
          item.membershipStatus ===
          "active"
      ).length,

      resubmitted: registrations.filter(
        (item) =>
          Number(
            item.resubmissionCount || 0
          ) > 0
      ).length,
    };
  }, [
    members,
    divisions,
    reviewLogs,
    search,
    statusFilter,
    divisionFilter,
  ]);

  const selectedRegistrationId = data.filtered.some(
    (item) => item.id === selectedId
  )
    ? selectedId
    : data.filtered[0]?.id || "";

  useEffect(() => {
    if (!feedback) {
      return undefined;
    }

    const timer = window.setTimeout(
      () => {
        setFeedback(null);
      },
      5000
    );

    return () =>
      window.clearTimeout(timer);
  }, [feedback]);

  const commitRegistrationDecision =
    async ({
      member,
      decision,
      reason = "",
    }) => {
      const isApproved =
        decision === "approved";

      const cleanReason =
        reason.trim();

      if (!member?.id) {
        throw new Error(
          "ID pendaftar tidak tersedia."
        );
      }

      if (
        !isApproved &&
        cleanReason.length < 5
      ) {
        throw new Error(
          "Alasan penolakan minimal 5 karakter."
        );
      }

      const applicantUserId =
        member.userId ||
        member.uid ||
        null;

      if (isApproved && !applicantUserId) {
        throw new Error(
          "Pendaftaran tidak memiliki relasi idPengguna ke akun pengguna."
        );
      }

      const batch = writeBatch(db);
      const now = serverTimestamp();

      const memberRef = doc(
        db,
        "Anggota",
        member.id
      );

      const reviewRef = doc(
        collection(
          db,
          "ReviewPendaftaran"
        )
      );

      batch.update(memberRef, {
        membershipStatus: isApproved
          ? "active"
          : "rejected",
        statusKeanggotaan: isApproved ? "aktif" : "ditolak",

        reviewedBy: REVIEWER_ID,
        reviewedAt: now,

        reviewNote: isApproved
          ? "Pendaftaran disetujui oleh pembina."
          : cleanReason,
        catatanReview: isApproved
          ? "Pendaftaran disetujui oleh pembina."
          : cleanReason,

        updatedAt: now,
        diperbaruiPada: now,
        ditinjauPada: now,

        ...(isApproved
          ? {
              joinedAt: now,
              bergabungPada: now,

              organisationPosition:
                member.organisationPosition ||
                "Anggota",
            }
          : {
              joinedAt: null,
            }),
      });

      batch.set(reviewRef, {
        memberId: member.id,
        applicantUserId,
        action: decision,

        note: isApproved
          ? "Pendaftaran anggota disetujui oleh pembina."
          : cleanReason,

        actedBy: REVIEWER_ID,
        createdAt: now,
      });

      /*
       * When accepted, update the user's
       * system role to anggota.
       */
      if (
        isApproved &&
        applicantUserId
      ) {
        const userRef = doc(
          db,
          "Users",
          applicantUserId
        );

        batch.set(
          userRef,
          {
            role: "anggota",
            isActive: true,
            updatedAt: now,
          },
          {
            merge: true,
          }
        );
      }

      await batch.commit();
    };

  const handleAcceptRegistration =
    async (member) => {
      await commitRegistrationDecision({
        member,
        decision: "approved",
      });

      closeAllOverlays();

      setFeedback({
        type: "success",

        message: `${member.fullName} berhasil diterima sebagai anggota.`,
      });
    };

  const handleRejectRegistration =
    async (member, reason) => {
      await commitRegistrationDecision({
        member,
        decision: "rejected",
        reason,
      });

      closeAllOverlays();

      setFeedback({
        type: "success",

        message: `Pendaftaran ${member.fullName} berhasil ditolak.`,
      });
    };

  const handleOpenRejectOverlay = (
    member
  ) => {
    openOverlay({
      closeOnBackdrop: true,

      content: (
        <article className="mx-auto max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto overscroll-contain rounded-2xl border border-border bg-card p-5 shadow-2xl sm:max-h-[calc(100dvh-3rem)] sm:p-6">
          <RejectRegistrationForm
            member={member}
            onCancel={() =>
              closeOverlay()
            }
            onSubmit={(reason) =>
              handleRejectRegistration(
                member,
                reason
              )
            }
          />
        </article>
      ),
    });
  };

  const handleOpenRegistration = (
    member
  ) => {
    setSelectedId(member.id);

    openOverlay({
      closeOnBackdrop: true,

      content: (
        <article className="mx-auto max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto overscroll-contain rounded-2xl border border-border bg-card p-5 shadow-xl sm:max-h-[calc(100dvh-3rem)] sm:p-6">
          <RegistrationDetail
            member={member}
            onClose={() =>
              closeOverlay()
            }
            onAccept={() =>
              handleAcceptRegistration(
                member
              )
            }
            onReject={() =>
              handleOpenRejectOverlay(
                member
              )
            }
          />
        </article>
      ),
    });
  };

  if (loading) {
    return (
      <PageLoading message="Memuat pendaftaran anggota..." />
    );
  }

  if (error) {
    return (
      <PageError
        message={error.message}
      />
    );
  }

  return (
    <div>
      <PageHeading
        eyebrow="Perekrutan Anggota"
        title="Pendaftaran Anggota"
        description="Tinjau biodata, pilihan sekbid, motivasi, dan status calon anggota OSIS."
        action={
          <DisabledAction
            icon="download"
            variant="outline"
          >
            Export Pendaftar
          </DisabledAction>
        }
      />

      {feedback && (
        <div
          role="status"
          className={`mb-6 flex items-start gap-3 rounded-2xl border p-4 text-sm ${
            feedback.type === "success"
              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700"
              : "border-red-500/20 bg-red-500/10 text-red-700"
          }`}
        >
          <AppIcon
            name={
              feedback.type ===
              "success"
                ? "check_circle"
                : "error"
            }
            size={20}
          />

          <p className="flex-1 font-medium">
            {feedback.message}
          </p>

          <button
            type="button"
            aria-label="Tutup pemberitahuan"
            onClick={() =>
              setFeedback(null)
            }
          >
            <AppIcon
              name="close"
              size={18}
            />
          </button>
        </div>
      )}

      <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon="person_add"
          label="Menunggu Review"
          value={data.pending}
          helper="Belum mendapat keputusan"
          accent="amber"
        />

        <StatCard
          icon="close"
          label="Ditolak"
          value={data.rejected}
          helper="Pendaftaran ditolak"
          accent="red"
        />

        <StatCard
          icon="verified_user"
          label="Diterima"
          value={data.accepted}
          helper="Sudah menjadi anggota"
          accent="green"
        />

        <StatCard
          icon="edit"
          label="Daftar Ulang"
          value={data.resubmitted}
          helper="Pendaftar yang pernah memperbaiki data"
          accent="blue"
        />
      </section>

      <section className="mt-6">
        <article className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="border-b border-border p-5">
            <SectionHeader
              icon="person_add"
              title="Daftar Pendaftar"
              description={`${data.filtered.length} data ditampilkan.`}
            />

            <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
              <input
                value={search}
                onChange={(event) =>
                  setSearch(
                    event.target.value
                  )
                }
                placeholder="Cari nama atau NIS"
                className="min-h-11 rounded-xl border border-border bg-input px-4 text-sm outline-none focus:border-primary"
              />

              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(
                    event.target.value
                  )
                }
                className="min-h-11 rounded-xl border border-border bg-input px-4 text-sm outline-none focus:border-primary"
              >
                <option value="all">
                  Semua Status
                </option>

                <option value="pending_review">
                  Menunggu Review
                </option>

                <option value="rejected">
                  Ditolak
                </option>

                <option value="active">
                  Diterima
                </option>
              </select>

              <select
                value={divisionFilter}
                onChange={(event) =>
                  setDivisionFilter(
                    event.target.value
                  )
                }
                className="min-h-11 rounded-xl border border-border bg-input px-4 text-sm outline-none focus:border-primary"
              >
                <option value="all">
                  Semua Sekbid
                </option>

                {data.divisionRows.map(
                  (division) => (
                    <option
                      key={division.id}
                      value={division.id}
                    >
                      Sekbid{" "}
                      {division.code}
                    </option>
                  )
                )}
              </select>
            </div>
          </div>

          {data.filtered.length > 0 ? (
            <div className="divide-y divide-border">
              {data.filtered.map(
                (member) => (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() =>
                      handleOpenRegistration(
                        member
                      )
                    }
                    className={`flex w-full items-center gap-4 p-5 text-left transition ${
                      selectedRegistrationId ===
                      member.id
                        ? "bg-primary/5"
                        : "hover:bg-input/40"
                    }`}
                  >
                    <Avatar
                      name={
                        member.fullName
                      }
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-text">
                          {
                            member.fullName
                          }
                        </p>

                        <MemberStatusBadge
                          status={
                            member.membershipStatus
                          }
                        />
                      </div>

                      <p className="mt-1 text-xs text-text-muted">
                        {member.nis} ·{" "}
                        {
                          member.className
                        }{" "}
                        ·{" "}
                        {member.division
                          ? `Sekbid ${member.division.code}`
                          : "Belum memilih sekbid"}
                      </p>

                      <p className="mt-2 text-[11px] text-text-muted">
                        Diajukan{" "}
                        {formatDateTime(
                          member.submittedAt
                        )}
                      </p>
                    </div>

                    <AppIcon
                      name="chevron_right"
                      size={20}
                      className="text-text-muted"
                    />
                  </button>
                )
              )}
            </div>
          ) : (
            <div className="p-5">
              <EmptyState
                icon="person_add"
                title="Pendaftar tidak ditemukan"
              />
            </div>
          )}
        </article>
      </section>
    </div>
  );
}

function RegistrationDetail({
  member,
  onClose,
  onAccept,
  onReject,
}) {
  const [
    isAccepting,
    setIsAccepting,
  ] = useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const canReview =
    member.membershipStatus ===
    "pending_review";

  const handleAccept = async () => {
    setIsAccepting(true);
    setErrorMessage("");

    try {
      await onAccept();
    } catch (error) {
      console.error(
        "Accept registration error:",
        error
      );

      setErrorMessage(
        error?.message ||
          "Pendaftaran gagal disetujui."
      );

      setIsAccepting(false);
    }
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <Avatar
            name={member.fullName}
            size="lg"
          />

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-text">
                {member.fullName}
              </h2>

              <MemberStatusBadge
                status={
                  member.membershipStatus
                }
              />
            </div>

            <p className="mt-1 text-sm text-text-muted">
              {member.nis} ·{" "}
              {member.className}
            </p>
          </div>
        </div>

        <button
          type="button"
          aria-label="Tutup detail pendaftaran"
          onClick={onClose}
          disabled={isAccepting}
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-text-muted transition hover:bg-input hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
        >
          <AppIcon
            name="close"
            size={20}
          />
        </button>
      </div>

      <div className="mt-6 space-y-5">
        <DetailItem
          label="Tempat, Tanggal Lahir"
          value={`${
            member.placeOfBirth || "-"
          }, ${formatLongDate(
            member.dateOfBirth
          )}`}
        />

        <DetailItem
          label="Sekbid yang Diminati"
          value={
            member.division
              ? `Sekbid ${member.division.code}: ${member.division.name}`
              : "-"
          }
        />

        <DetailItem
          label="Motivasi"
          value={
            member.motivation || "-"
          }
        />

        <DetailItem
          label="Pengalaman Organisasi"
          value={
            member.organizationExperience ||
            "-"
          }
        />

        <DetailItem
          label="Kontak"
          value={`${
            member.email || "-"
          } · ${
            member.whatsapp || "-"
          }`}
        />

        <DetailItem
          label="Jumlah Daftar Ulang"
          value={String(
            member.resubmissionCount ||
              0
          )}
        />

        {member.reviewNote && (
          <DetailItem
            label="Catatan Review Terakhir"
            value={member.reviewNote}
          />
        )}
      </div>

      {member.logs?.length > 0 && (
        <div className="mt-6">
          <p className="text-xs font-bold uppercase tracking-wider text-text-muted">
            Histori Review
          </p>

          <div className="mt-3 space-y-3">
            {member.logs.map((log) => (
              <div
                key={log.id}
                className="rounded-xl bg-surface p-4"
              >
                <p className="text-sm font-semibold capitalize text-text">
                  {log.action}
                </p>

                <p className="mt-1 text-xs leading-5 text-text-muted">
                  {log.note ||
                    "Tidak ada catatan."}
                </p>

                <p className="mt-2 text-[10px] text-primary">
                  {formatDateTime(
                    log.createdAt
                  )}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="mt-6 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm font-medium text-red-700"
        >
          {errorMessage}
        </div>
      )}

      {canReview ? (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ActionButton
            icon="check"
            loading={isAccepting}
            disabled={isAccepting}
            onClick={handleAccept}
          >
            Setujui Pendaftaran
          </ActionButton>

          <ActionButton
            icon="close"
            variant="danger"
            disabled={isAccepting}
            onClick={onReject}
          >
            Tolak Pendaftaran
          </ActionButton>
        </div>
      ) : (
        <div className="mt-6 rounded-xl bg-surface p-4 text-sm leading-6 text-text-muted">
          Pendaftaran ini sudah
          mendapatkan keputusan dan tidak
          dapat direview kembali dari
          tampilan ini.
        </div>
      )}
    </div>
  );
}

function RejectRegistrationForm({
  member,
  onCancel,
  onSubmit,
}) {
  const [reason, setReason] =
    useState("");

  const [
    isSubmitting,
    setIsSubmitting,
  ] = useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const cleanReason = reason.trim();

  const isValid =
    cleanReason.length >= 5;

  const handleSubmit = async (
    event
  ) => {
    event.preventDefault();

    if (!isValid) {
      setErrorMessage(
        "Alasan penolakan minimal 5 karakter."
      );

      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");

    try {
      await onSubmit(cleanReason);
    } catch (error) {
      console.error(
        "Reject registration error:",
        error
      );

      setErrorMessage(
        error?.message ||
          "Pendaftaran gagal ditolak."
      );

      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-red-600">
            Tolak Pendaftaran
          </p>

          <h2 className="mt-1 text-xl font-bold text-text">
            Masukkan alasan penolakan
          </h2>

          <p className="mt-2 text-sm leading-6 text-text-muted">
            Jelaskan alasan penolakan
            untuk{" "}
            <span className="font-semibold text-text">
              {member.fullName}
            </span>
            . Alasan ini akan tersimpan
            dalam histori review.
          </p>
        </div>

        <button
          type="button"
          aria-label="Tutup formulir penolakan"
          onClick={onCancel}
          disabled={isSubmitting}
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-text-muted transition hover:bg-input hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
        >
          <AppIcon
            name="close"
            size={20}
          />
        </button>
      </div>

      <div className="mt-6">
        <label
          htmlFor="reject-reason"
          className="text-sm font-semibold text-text"
        >
          Alasan penolakan
        </label>

        <textarea
          id="reject-reason"
          value={reason}
          onChange={(event) => {
            setReason(
              event.target.value
            );

            if (errorMessage) {
              setErrorMessage("");
            }
          }}
          disabled={isSubmitting}
          rows={6}
          minLength={5}
          maxLength={500}
          autoFocus
          placeholder="Contoh: Data kontak belum dapat diverifikasi..."
          className="mt-2 w-full resize-none rounded-xl border border-border bg-input p-4 text-sm leading-6 text-text outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
        />

        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-xs text-text-muted">
            Minimal 5 karakter.
          </p>

          <p className="text-xs text-text-muted">
            {reason.length}/500
          </p>
        </div>
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm font-medium text-red-700"
        >
          {errorMessage}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ActionButton
          type="button"
          variant="secondary"
          disabled={isSubmitting}
          onClick={onCancel}
        >
          Batal
        </ActionButton>

        <ActionButton
          type="submit"
          icon="close"
          variant="danger"
          loading={isSubmitting}
          disabled={
            isSubmitting || !isValid
          }
        >
          Konfirmasi Penolakan
        </ActionButton>
      </div>
    </form>
  );
}

function ActionButton({
  children,
  icon,
  variant = "primary",
  loading = false,
  disabled = false,
  type = "button",
  onClick,
}) {
  const variantClasses = {
    primary:
      "bg-primary text-white hover:bg-primary/90",

    danger:
      "border border-red-500/30 bg-red-500/10 text-red-700 hover:bg-red-500/20",

    secondary:
      "border border-border bg-card text-text hover:bg-input",
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
        variantClasses[variant] ||
        variantClasses.primary
      }`}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
        />
      ) : (
        icon && (
          <AppIcon
            name={icon}
            size={18}
          />
        )
      )}

      <span>{children}</span>
    </button>
  );
}

function DetailItem({
  label,
  value,
}) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
        {label}
      </p>

      <p className="mt-1 break-words text-sm font-semibold leading-6 text-text">
        {value}
      </p>
    </div>
  );
}