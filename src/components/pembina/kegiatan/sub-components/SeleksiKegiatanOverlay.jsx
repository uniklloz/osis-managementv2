"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import AppIcon from "@/components/global/AppIcon";
import { collection, doc, writeBatch } from "firebase/firestore";
import { useDb } from "@/context/DbContext";
import { useOverlay } from "@/context/ui/OverlayContext";
import { buatIdReferensiKegiatan } from "@/lib/codefication";
import { validasiFileProposal, uploadProposalCloudinary } from "@/lib/uploadProposalCloudinary";
import { finalisasiKegiatan } from "./finalisasiKegiatan";
import {
  FREKUENSI_PENGULANGAN,
  JENIS_KEGIATAN,
  KOLEKSI,
  MODE_JADWAL,
  MODE_KEPANITIAAN_USULAN,
  STATUS_JADWAL,
  STATUS_KEGIATAN,
  STATUS_LAPORAN,
  STATUS_PELAKSANAAN,
  STATUS_PROPOSAL,
  STATUS_SESI_ABSENSI,
  STATUS_TIM,
  SUMBER_FINALISASI_JADWAL,
  buatDrafFormSeleksiKegiatan,
  buatPayloadKegiatan,
  buatPayloadPelaksanaan,
  buatPayloadSesiAbsensi,
  buatPayloadTautanProposal,
} from "../konfigurasiManajemenKegiatan";

const CATEGORY_OPTIONS = [
  {
    value: JENIS_KEGIATAN.PROGRAM_KERJA,
    label: "Program Kerja",
    description: "Rencana kegiatan yang dapat dihubungkan dengan proposal anggota.",
    icon: "campaign",
  },
  {
    value: JENIS_KEGIATAN.RAPAT,
    label: "Meeting",
    description: "Agenda rapat, koordinasi, atau pertemuan organisasi.",
    icon: "groups",
  },
];

const DEFAULT_SESSION_START = "08:00";
const DEFAULT_SESSION_END = "12:00";
const MAX_SERIES_OCCURRENCES = 500;


function combineDateAndTime(date, time) {
  if (!date || !time) return null;
  const value = new Date(`${date}T${time}`);
  return Number.isNaN(value.getTime()) ? null : value;
}

function calculateDurationMinutes(startAt, endAt) {
  if (!(startAt instanceof Date) || !(endAt instanceof Date)) return 0;
  const duration = Math.floor((endAt.getTime() - startAt.getTime()) / 60000);
  return duration > 0 ? duration : 0;
}

function formatDuration(minutes) {
  if (!minutes) return "0";

  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  const parts = [];

  if (hours) parts.push(`${hours} jam`);
  if (restMinutes) parts.push(`${restMinutes} menit`);

  return parts.join(" ") || "0";
}

function parseDateOnly(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toDateKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateOnly(value) {
  const date = typeof value === "string" ? parseDateOnly(value) : value;
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function listDateKeys(startDate, endDate, maxDays = 366) {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  if (!start || !end || end < start) return [];

  const dates = [];
  const cursor = new Date(start);
  while (cursor <= end && dates.length < maxDays) {
    dates.push(toDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function buildBaseSessions(form) {
  const dates = listDateKeys(form.startDate, form.endDate);

  return dates.map((date, index) => {
    const custom = form.dailySchedules?.[date] || {};
    const startTime = hasOwn(custom, "startTime")
      ? custom.startTime
      : DEFAULT_SESSION_START;
    const endTime = hasOwn(custom, "endTime")
      ? custom.endTime
      : DEFAULT_SESSION_END;
    const startAt = combineDateAndTime(date, startTime);
    const endAt = combineDateAndTime(date, endTime);
    const durationMinutes = calculateDurationMinutes(startAt, endAt);

    return {
      date,
      dayOffset: index,
      startTime,
      endTime,
      startAt,
      endAt,
      durationMinutes,
      valid: Boolean(startAt && endAt && durationMinutes > 0),
    };
  });
}

function buildOccurrenceStarts(form, maxItems = MAX_SERIES_OCCURRENCES) {
  const start = parseDateOnly(form.startDate);
  if (!start) return [];
  if (form.scheduleMode !== "recurring") return [start];

  const until = parseDateOnly(form.recurrenceUntil);
  if (!until || until < start) return [];

  const intervalWeeks = Math.max(1, Number(form.recurrenceInterval) || 1);
  const results = [];
  const cursor = new Date(start);

  while (cursor <= until && results.length < maxItems) {
    results.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + intervalWeeks * 7);
  }

  return results;
}

function buildOccurrences(form, baseSessions, maxItems = MAX_SERIES_OCCURRENCES) {
  if (!baseSessions.length) return [];

  const starts = buildOccurrenceStarts(form, maxItems);
  const recurrenceBoundary =
    form.scheduleMode === "recurring" ? parseDateOnly(form.recurrenceUntil) : null;
  const results = [];

  for (let occurrenceIndex = 0; occurrenceIndex < starts.length; occurrenceIndex += 1) {
    const occurrenceStart = starts[occurrenceIndex];
    const sessions = baseSessions.map((template, sessionIndex) => {
      const sessionDate = new Date(occurrenceStart);
      sessionDate.setDate(sessionDate.getDate() + template.dayOffset);
      const date = toDateKey(sessionDate);
      return {
        ...template,
        sessionIndex,
        date,
        startAt: combineDateAndTime(date, template.startTime),
        endAt: combineDateAndTime(date, template.endTime),
      };
    });

    const lastDate = parseDateOnly(sessions[sessions.length - 1]?.date);
    if (recurrenceBoundary && lastDate && lastDate > recurrenceBoundary) break;

    results.push({
      occurrenceIndex,
      startDate: sessions[0]?.date || toDateKey(occurrenceStart),
      endDate: sessions[sessions.length - 1]?.date || toDateKey(occurrenceStart),
      sessions,
    });
  }

  return results;
}

function buildOccurrencePreview(form, baseSessions, maxItems = MAX_SERIES_OCCURRENCES) {
  return buildOccurrences(form, baseSessions, maxItems);
}

function normalizeDateInput(value) {
  if (!value) return "";

  if (typeof value === "string") {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "" : toDateKey(parsed);
  }

  if (value instanceof Date) return toDateKey(value);

  if (typeof value?.toDate === "function") {
    const parsed = value.toDate();
    return parsed instanceof Date && !Number.isNaN(parsed.getTime())
      ? toDateKey(parsed)
      : "";
  }

  return "";
}

function extractProposalSchedule(proposal) {
  if (!proposal) return null;

  const source = proposal.jadwalUsulan || {};

  const startDate = normalizeDateInput(
    source.tanggalMulai || source.tanggalMulaiPertama || proposal.tanggalMulaiUsulan
  );

  const endDate =
    normalizeDateInput(
      source.tanggalSelesai ||
        source.tanggalSelesaiPertama ||
        proposal.tanggalSelesaiUsulan
    ) || startDate;

  if (!startDate || !endDate) return null;

  const scheduleMode =
    source.modeJadwal === MODE_JADWAL.BERULANG ||
    source.pengulangan?.aktif === true
      ? "recurring"
      : "once";

  const recurrenceInterval = String(
    source.intervalPengulangan || source.pengulangan?.interval || 1
  );

  const recurrenceUntil = normalizeDateInput(
    source.pengulanganSampai || source.pengulangan?.sampai
  );

  const dailySchedules = {};

  if (Array.isArray(source.templateSesi)) {
    const dates = listDateKeys(startDate, endDate);
    source.templateSesi.forEach((session, index) => {
      const date = dates[index];
      if (!date) return;
      dailySchedules[date] = {
        startTime: session?.jamMulai || DEFAULT_SESSION_START,
        endTime: session?.jamSelesai || DEFAULT_SESSION_END,
      };
    });
  }

  if (source.jadwalHarian && typeof source.jadwalHarian === "object") {
    Object.entries(source.jadwalHarian).forEach(([date, schedule]) => {
      if (!date) return;
      dailySchedules[date] = {
        startTime: schedule?.jamMulai || DEFAULT_SESSION_START,
        endTime: schedule?.jamSelesai || DEFAULT_SESSION_END,
      };
    });
  }

  return {
    scheduleMode,
    startDate,
    endDate,
    dailySchedules,
    recurrenceInterval,
    recurrenceUntil:
      scheduleMode === "recurring" ? recurrenceUntil || endDate : "",
  };
}

function extractProposedCommittee(proposal) {
  if (!proposal) {
    return {
      mode: MODE_KEPANITIAAN_USULAN.BELUM_DIATUR,
      organiserMemberId: "",
      memberIds: [],
    };
  }

  const source = proposal.kepanitiaanUsulan || {};

  const organiserMemberId = source.idPenanggungJawab || "";
  const rawMemberIds = source.idAnggotaPanitia || [];

  const memberIds = Array.from(
    new Set(
      (Array.isArray(rawMemberIds) ? rawMemberIds : [])
        .filter(Boolean)
        .map(String)
    )
  );

  const mode =
    source.mode === MODE_KEPANITIAAN_USULAN.DITENTUKAN_PEMBINA
      ? MODE_KEPANITIAAN_USULAN.DITENTUKAN_PEMBINA
      : organiserMemberId || memberIds.length
        ? MODE_KEPANITIAAN_USULAN.DIUSULKAN
        : MODE_KEPANITIAAN_USULAN.BELUM_DIATUR;

  return {
    mode,
    organiserMemberId: organiserMemberId ? String(organiserMemberId) : "",
    memberIds,
  };
}

function buildFinalScheduleForm(form) {
  return {
    scheduleMode: form.finalScheduleMode,
    startDate: form.finalStartDate,
    endDate: form.finalEndDate,
    dailySchedules: form.finalDailySchedules,
    recurrenceInterval: form.finalRecurrenceInterval,
    recurrenceUntil: form.finalRecurrenceUntil,
  };
}

function scheduleSummary(form, baseSessions) {
  if (!form?.startDate || !form?.endDate || !baseSessions?.length) return "-";

  const range =
    form.startDate === form.endDate
      ? formatDateOnly(form.startDate)
      : `${formatDateOnly(form.startDate)} - ${formatDateOnly(form.endDate)}`;

  if (form.scheduleMode !== "recurring") return range;

  return `${range} · setiap ${Math.max(
    1,
    Number(form.recurrenceInterval) || 1
  )} minggu${
    form.recurrenceUntil ? ` · s.d. ${formatDateOnly(form.recurrenceUntil)}` : ""
  }`;
}

function scheduleDiffers(a, b) {
  if (!a || !b) return false;

  return Boolean(
    a.startDate !== b.startDate ||
      a.endDate !== b.endDate ||
      a.scheduleMode !== b.scheduleMode ||
      (a.scheduleMode === "recurring" &&
        (String(a.recurrenceInterval || "1") !==
          String(b.recurrenceInterval || "1") ||
          a.recurrenceUntil !== b.recurrenceUntil))
  );
}

async function commitSetChunks(db, writes, chunkSize = 425) {
  const committedRefs = [];

  for (let index = 0; index < writes.length; index += chunkSize) {
    const chunk = writes.slice(index, index + chunkSize);
    const batch = writeBatch(db);
    chunk.forEach(({ ref, data }) => batch.set(ref, data));
    await batch.commit();
    committedRefs.push(...chunk.map(({ ref }) => ref));
  }

  return committedRefs;
}

async function deleteRefsInChunks(db, refs, chunkSize = 425) {
  for (let index = 0; index < refs.length; index += chunkSize) {
    const chunk = refs.slice(index, index + chunkSize);
    const batch = writeBatch(db);
    chunk.forEach((ref) => batch.delete(ref));
    await batch.commit().catch(() => {});
  }
}

function proposalTitle(proposal) {
  return (
    proposal?.kegiatan?.namaKegiatan ||
    proposal?.namaKegiatan ||
    proposal?.namaFile ||
    "Proposal tanpa judul"
  );
}

function resolveUploader(proposal, memberMap) {
  const uploaderId = proposal?.idPengunggah || null;

  const member =
    proposal?.pengunggah ||
    (uploaderId ? memberMap.get(String(uploaderId)) : null) ||
    null;

  return {
    id: uploaderId || "Unknown",
    name:
      member?.namaLengkap ||
      member?.nama ||
      member?.namaPengguna ||
      "Unknown",
    position:
      member?.jabatanOrganisasi ||
      member?.jabatan ||
      member?.peran ||
      "Unknown",
  };
}

export function useSeleksiKegiatanOverlay({
  proposals = [],
  divisions = [],
  members = [],
  periodId = null,
  periodEndDate = "",
  onCreated,
} = {}) {
  const { openOverlay, closeOverlay } = useOverlay();

  const openSeleksiKegiatan = useCallback(() => {
    openOverlay({
      closeOnBackdrop: true,
      content: (
        <SeleksiKegiatanModal
          proposals={proposals}
          divisions={divisions}
          members={members}
          periodId={periodId}
          periodEndDate={periodEndDate}
          onCreated={(selectedType) => {
            onCreated?.(selectedType);
            closeOverlay();
          }}
          onClose={() => closeOverlay()}
        />
      ),
    });
  }, [
    openOverlay,
    closeOverlay,
    proposals,
    divisions,
    members,
    periodId,
    periodEndDate,
    onCreated,
  ]);

  return { openSeleksiKegiatan };
}

export default function SeleksiKegiatanModal({
  proposals = [],
  divisions = [],
  members = [],
  periodId = null,
  periodEndDate = "",
  onCreated,
  onClose,
}) {
  const { db, addDoc, updateDoc, deleteDoc, serverTimestamp } = useDb();

  const [step, setStep] = useState("select");
  const [activityType, setActivityType] = useState(JENIS_KEGIATAN.PROGRAM_KERJA);
  const [form, setForm] = useState(() => buatDrafFormSeleksiKegiatan());
  const [committeeSearch, setCommitteeSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const memberMap = useMemo(() => {
    const map = new Map();

    members.forEach((member) => {
      [member?.id, member?.idPengguna, member?.idPengguna, member?.idAutentikasi]
        .filter(Boolean)
        .forEach((key) => map.set(String(key), member));
    });

    return map;
  }, [members]);

  const officialMembers = useMemo(
    () =>
      [...members].sort((a, b) =>
        String(a?.namaLengkap || a?.nama || "").localeCompare(
          String(b?.namaLengkap || b?.nama || ""),
          "id"
        )
      ),
    [members]
  );

  const filteredCommitteeMembers = useMemo(() => {
    const keyword = committeeSearch.trim().toLowerCase();

    if (!keyword) return officialMembers;

    return officialMembers.filter((member) =>
      [
        member?.namaLengkap,
        member?.nama,
        member?.jabatanOrganisasi,
        member?.jabatan,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword))
    );
  }, [officialMembers, committeeSearch]);

  // Rencana awal hasil pleno. Untuk Program Kerja, data ini belum membuat
  // PelaksanaanKegiatan/SesiAbsensi sebelum proposal dipilih dan jadwal difinalisasi.
  const baseSessions = useMemo(
    () => buildBaseSessions(form),
    [form.startDate, form.endDate, form.dailySchedules]
  );

  const dayCount = baseSessions.length;
  const validSessionCount = baseSessions.filter((session) => session.valid).length;
  const totalScheduledMinutes = baseSessions.reduce(
    (total, session) => total + (session.valid ? session.durationMinutes : 0),
    0
  );
  const startDateValue = parseDateOnly(form.startDate);
  const endDateValue = parseDateOnly(form.endDate);
  const hasValidDateRange = Boolean(
    startDateValue && endDateValue && endDateValue >= startDateValue
  );
  const hasValidAttendanceSchedule = Boolean(
    dayCount > 0 && validSessionCount === dayCount
  );
  const firstSession = baseSessions[0] || null;
  const lastSession = baseSessions[baseSessions.length - 1] || null;
  const occurrencePreview = useMemo(
    () => buildOccurrencePreview(form, baseSessions, MAX_SERIES_OCCURRENCES),
    [
      form.scheduleMode,
      form.recurrenceInterval,
      form.recurrenceUntil,
      form.startDate,
      form.endDate,
      form.dailySchedules,
    ]
  );

  const chooseCategory = (value) => {
    setActivityType(value);
    setForm(buatDrafFormSeleksiKegiatan());
    setCommitteeSearch("");
    setError("");
    setStep("form");
  };

  const changeType = (value) => {
    setActivityType(value);
    setForm((current) => ({
      ...buatDrafFormSeleksiKegiatan(),
      title: current.title,
      description: current.description,
      divisionId: current.divisionId,
      location: current.location,
      scheduleMode: current.scheduleMode,
      startDate: current.startDate,
      endDate: current.endDate,
      dailySchedules: current.dailySchedules,
      recurrenceInterval: current.recurrenceInterval,
      recurrenceUntil: current.recurrenceUntil,
    }));
    setCommitteeSearch("");
    setError("");
  };

  const updateField = (field) => (event) => {
    const value = event.target.value;
    setForm((current) => ({ ...current, [field]: value }));
    if (error) setError("");
  };

  const updateStartDate = (event) => {
    const value = event.target.value;
    setForm((current) => {
      const nextEndDate = !current.endDate || current.endDate < value ? value : current.endDate;
      return {
        ...current,
        startDate: value,
        endDate: nextEndDate,
      };
    });
    if (error) setError("");
  };

  const updateEndDate = (event) => {
    const value = event.target.value;
    setForm((current) => ({
      ...current,
      endDate: value,
    }));
    if (error) setError("");
  };

  const updateDailySchedule = (date, field) => (event) => {
    const value = event.target.value;
    setForm((current) => ({
      ...current,
      dailySchedules: {
        ...current.dailySchedules,
        [date]: {
          ...(current.dailySchedules?.[date] || {}),
          [field]: value,
        },
      },
    }));
    if (error) setError("");
  };

  const setScheduleMode = (mode) => {
    setForm((current) => ({
      ...current,
      scheduleMode: mode,
      recurrenceUntil:
        mode === "recurring"
          ? current.recurrenceUntil || periodEndDate || ""
          : current.recurrenceUntil,
    }));
    if (error) setError("");
  };

  const toggleCommitteeMember = (memberId) => {
    setForm((current) => {
      const exists = current.committeeMemberIds.includes(memberId);
      return {
        ...current,
        committeeMemberIds: exists
          ? current.committeeMemberIds.filter((id) => id !== memberId)
          : [...current.committeeMemberIds, memberId],
      };
    });
  };

  const updateFinalField = (field) => (event) => {
    const value = event.target.value;
    setForm((current) => ({
      ...current,
      [field]: value,
      finalScheduleSource: "manual",
    }));
    if (error) setError("");
  };

  const updateFinalStartDate = (event) => {
    const value = event.target.value;
    setForm((current) => {
      const nextEndDate =
        !current.finalEndDate || current.finalEndDate < value
          ? value
          : current.finalEndDate;

      return {
        ...current,
        finalStartDate: value,
        finalEndDate: nextEndDate,
        finalScheduleSource: "manual",
      };
    });
    if (error) setError("");
  };

  const updateFinalEndDate = (event) => {
    const value = event.target.value;
    setForm((current) => ({
      ...current,
      finalEndDate: value,
      finalScheduleSource: "manual",
    }));
    if (error) setError("");
  };

  const updateFinalDailySchedule = (date, field) => (event) => {
    const value = event.target.value;
    setForm((current) => ({
      ...current,
      finalScheduleSource: "manual",
      finalDailySchedules: {
        ...current.finalDailySchedules,
        [date]: {
          ...(current.finalDailySchedules?.[date] || {}),
          [field]: value,
        },
      },
    }));
    if (error) setError("");
  };

  const setFinalScheduleMode = (mode) => {
    setForm((current) => ({
      ...current,
      finalScheduleMode: mode,
      finalScheduleSource: "manual",
      finalRecurrenceUntil:
        mode === "recurring"
          ? current.finalRecurrenceUntil || periodEndDate || current.finalEndDate || ""
          : current.finalRecurrenceUntil,
    }));
    if (error) setError("");
  };

  const submitForm = async (event) => {
    event.preventDefault();

    const title = form.title.trim();
    const location = form.location.trim();

    if (!title || !location || !form.startDate || !form.endDate) {
      setError("Nama kegiatan, lokasi, tanggal mulai, dan tanggal selesai wajib diisi.");
      return;
    }

    if (!hasValidDateRange) {
      setError("Tanggal selesai tidak boleh sebelum tanggal mulai.");
      return;
    }

    if (!hasValidAttendanceSchedule) {
      setError("Setiap jadwal harian harus memiliki jam mulai dan selesai yang valid.");
      return;
    }

    if (form.scheduleMode === "recurring") {
      if (!form.recurrenceUntil) {
        setError("Tentukan sampai kapan kegiatan berulang.");
        return;
      }
      if (form.recurrenceUntil < form.endDate) {
        setError("Batas pengulangan harus mencakup seluruh rencana pelaksanaan pertama.");
        return;
      }
      if (periodEndDate && form.recurrenceUntil > periodEndDate) {
        setError("Rencana kegiatan berulang tidak boleh melewati akhir periode aktif.");
        return;
      }
    }

    const plannedOccurrences = buildOccurrences(
      form,
      baseSessions,
      MAX_SERIES_OCCURRENCES
    );

    if (!plannedOccurrences.length) {
      setError("Tidak ada rencana pelaksanaan valid yang dapat dibuat dari jadwal tersebut.");
      return;
    }

    // Program Kerja selalu disimpan dalam status Terencana dan menunggu
    // finalisasi dari detail kegiatan, bukan dari modal pembuatan.
    const effectiveScheduleForm = form;
    const effectiveBaseSessions = baseSessions;
    const occurrences = [];

    const plannedTotalSessionCount = plannedOccurrences.reduce(
      (total, occurrence) => total + occurrence.sessions.length,
      0
    );

    const totalSessionCount = occurrences.reduce(
      (total, occurrence) => total + occurrence.sessions.length,
      0
    );

    const plannedFirstOccurrence = plannedOccurrences[0];
    const plannedLastOccurrence =
      plannedOccurrences[plannedOccurrences.length - 1];
    const plannedFirstSession = plannedFirstOccurrence?.sessions?.[0] || null;
    const plannedFirstLastSession =
      plannedFirstOccurrence?.sessions?.[
        plannedFirstOccurrence.sessions.length - 1
      ] || null;
    const plannedSeriesLastSession =
      plannedLastOccurrence?.sessions?.[
        plannedLastOccurrence.sessions.length - 1
      ] || null;

    const firstOccurrence = occurrences[0] || null;
    const lastOccurrence = occurrences[occurrences.length - 1] || null;
    const firstOccurrenceFirstSession = firstOccurrence?.sessions?.[0] || null;
    const firstOccurrenceLastSession =
      firstOccurrence?.sessions?.[
        firstOccurrence.sessions.length - 1
      ] || null;
    const seriesLastSession =
      lastOccurrence?.sessions?.[lastOccurrence.sessions.length - 1] || null;

    const activeFirstSession =
      firstOccurrenceFirstSession || plannedFirstSession || null;
    const activeFirstLastSession =
      firstOccurrenceLastSession || plannedFirstLastSession || null;
    const activeSeriesLastSession =
      seriesLastSession || plannedSeriesLastSession || null;

    const makeSchedulePayload = (scheduleFormValue, sessions) => ({
      modeJadwal:
        scheduleFormValue.scheduleMode === "recurring"
          ? MODE_JADWAL.BERULANG
          : MODE_JADWAL.SEKALI,
      tanggalMulaiPertama: scheduleFormValue.startDate,
      tanggalSelesaiPertama: scheduleFormValue.endDate,
      jumlahHariPerPelaksanaan: sessions.length,
      jamMulaiDefault: DEFAULT_SESSION_START,
      jamSelesaiDefault: DEFAULT_SESSION_END,
      templateSesi: sessions.map((session) => ({
        selisihHari: session.dayOffset,
        jamMulai: session.startTime,
        jamSelesai: session.endTime,
        durasiMenit: session.durationMinutes,
      })),
    });

    const makeRecurrencePayload = (scheduleFormValue) => ({
      cakupan: "periode",
      aktif: scheduleFormValue.scheduleMode === "recurring",
      frekuensi:
        scheduleFormValue.scheduleMode === "recurring"
          ? FREKUENSI_PENGULANGAN.MINGGUAN
          : null,
      interval:
        scheduleFormValue.scheduleMode === "recurring"
          ? Math.max(1, Number(scheduleFormValue.recurrenceInterval) || 1)
          : null,
      sampai:
        scheduleFormValue.scheduleMode === "recurring" &&
        scheduleFormValue.recurrenceUntil
          ? new Date(`${scheduleFormValue.recurrenceUntil}T23:59:59`)
          : null,
    });

    const plannedSchedulePayload = makeSchedulePayload(form, baseSessions);
    const plannedRecurrencePayload = makeRecurrencePayload(form);

    const resolvedFinalSchedulePayload =
      activityType === JENIS_KEGIATAN.PROGRAM_KERJA
        ? null
        : makeSchedulePayload(form, baseSessions);

    const resolvedFinalRecurrencePayload =
      activityType === JENIS_KEGIATAN.PROGRAM_KERJA
        ? null
        : makeRecurrencePayload(form);

    setSaving(true);
    setError("");

    let createdActivity = null;
    let committedChildRefs = [];
    let proposalLinked = false;

    try {
      const referenceYear =
        Number(String(form.startDate || "").slice(0, 4)) ||
        new Date().getFullYear();

      const referenceId = await buatIdReferensiKegiatan(activityType, {
        tahun: referenceYear,
      });

      const payloadKegiatan = buatPayloadKegiatan({
        idReferensi: referenceId,
        namaKegiatan: title,
        deskripsi: form.description.trim(),
        jenisKegiatan: activityType,
        lokasi: location,
        idPeriode: periodId || null,

        waktuMulai: activeFirstSession?.startAt || null,
        waktuSelesai: activeFirstLastSession?.endAt || null,
        waktuSelesaiSeri: activeSeriesLastSession?.endAt || null,
        jumlahHariKalender: effectiveBaseSessions.length,
        jumlahPelaksanaan: occurrences.length,
        jumlahSesiAbsensi: totalSessionCount,
        durasiMenit: totalScheduledMinutes,

        jadwalRencana:
          activityType === JENIS_KEGIATAN.PROGRAM_KERJA
            ? plannedSchedulePayload
            : null,
        pengulanganRencana:
          activityType === JENIS_KEGIATAN.PROGRAM_KERJA
            ? plannedRecurrencePayload
            : null,
        jumlahPelaksanaanRencana:
          activityType === JENIS_KEGIATAN.PROGRAM_KERJA
            ? plannedOccurrences.length
            : null,
        jumlahSesiAbsensiRencana:
          activityType === JENIS_KEGIATAN.PROGRAM_KERJA
            ? plannedTotalSessionCount
            : null,

        jadwalFinal: resolvedFinalSchedulePayload,
        pengulanganFinal: resolvedFinalRecurrencePayload,
        statusJadwal: STATUS_JADWAL.DIRENCANAKAN,
        sumberFinalisasiJadwal: null,
        difinalisasiPada: null,

        idDivisi: form.divisionId || null,
        idPenanggungJawab: form.organiserMemberId || null,
        idAnggotaPanitia:
          activityType === JENIS_KEGIATAN.PROGRAM_KERJA
            ? [...form.committeeMemberIds]
            : [],

        idProposal: null,
        statusProposal: null,

        statusTim:
          activityType === JENIS_KEGIATAN.PROGRAM_KERJA
            ? STATUS_TIM.BELUM_DIAJUKAN
            : null,

        status:
          activityType === JENIS_KEGIATAN.PROGRAM_KERJA
            ? STATUS_KEGIATAN.TERENCANA
            : STATUS_KEGIATAN.DRAF,
        statusLaporan:
          activityType === JENIS_KEGIATAN.PROGRAM_KERJA
            ? STATUS_LAPORAN.BELUM_DIMULAI
            : null,

        dibuatPada: serverTimestamp(),
        diperbaruiPada: serverTimestamp(),
      });

      createdActivity = await addDoc(KOLEKSI.KEGIATAN, payloadKegiatan);

      const childWrites = [];

      if (false) {
        for (const occurrence of occurrences) {
          const first = occurrence.sessions[0];
          const last = occurrence.sessions[occurrence.sessions.length - 1];
          const pelaksanaanRef = doc(
            collection(db, KOLEKSI.PELAKSANAAN_KEGIATAN)
          );

          childWrites.push({
            ref: pelaksanaanRef,
            data: buatPayloadPelaksanaan({
              idKegiatan: createdActivity.id,
              idPeriode: periodId || null,
              indeksPelaksanaan: occurrence.occurrenceIndex,
              tanggalMulai: occurrence.startDate,
              tanggalSelesai: occurrence.endDate,
              waktuMulai: first?.startAt || null,
              waktuSelesai: last?.endAt || null,
              jumlahSesi: occurrence.sessions.length,
              status: STATUS_PELAKSANAAN.TERENCANA,
              dibatalkanPada: null,
              dibuatPada: serverTimestamp(),
              diperbaruiPada: serverTimestamp(),
            }),
          });

          for (const session of occurrence.sessions) {
            const sesiRef = doc(collection(db, KOLEKSI.SESI_ABSENSI));

            childWrites.push({
              ref: sesiRef,
              data: buatPayloadSesiAbsensi({
                idKegiatan: createdActivity.id,
                idPelaksanaan: pelaksanaanRef.id,
                idPeriode: periodId || null,
                indeksPelaksanaan: occurrence.occurrenceIndex,
                indeksSesi: session.sessionIndex,
                tanggal: session.date,
                waktuMulai: session.startAt,
                waktuSelesai: session.endAt,
                durasiMenit: session.durationMinutes,
                status: STATUS_SESI_ABSENSI.TERJADWAL,
                dibuatPada: serverTimestamp(),
                diperbaruiPada: serverTimestamp(),
              }),
            });
          }
        }
      }

      if (childWrites.length) {
        committedChildRefs = await commitSetChunks(db, childWrites);
      }

      onCreated?.(activityType);
    } catch (submitError) {
      console.error("CREATE ACTIVITY ERROR:", submitError);

      if (committedChildRefs.length) {
        await deleteRefsInChunks(db, [...committedChildRefs].reverse());
      }

      if (createdActivity?.id) {
        await deleteDoc(KOLEKSI.KEGIATAN, createdActivity.id).catch(() => {});
      }

      setError(
        submitError?.message ||
          "Kegiatan belum berhasil disimpan. Data parsial sudah dicoba dibersihkan."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      className={`flex w-full flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-2xl transition-[max-width] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        step === "select"
          ? "max-h-[calc(100dvh-2rem)] max-w-xl"
          : "h-[calc(100dvh-2rem)] max-h-[860px] max-w-5xl"
      }`}
    >
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border bg-card/95 px-5 py-5 backdrop-blur sm:px-6">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
            Tambah Kegiatan
          </p>

          <h2 className="mt-1 text-xl font-bold tracking-tight text-text sm:text-2xl">
            {step === "select"
              ? "Pilih Kategori Kegiatan"
              : activityType === JENIS_KEGIATAN.PROGRAM_KERJA
                ? "Tambah Program Kerja"
                : "Tambah Meeting"}
          </h2>

          <p className="mt-2 text-sm leading-6 text-text-muted">
            {step === "select"
              ? "Tentukan jenis kegiatan yang ingin dibuat."
              : activityType === JENIS_KEGIATAN.PROGRAM_KERJA
                ? "Buat rencana program kerja dan simpan sebagai status Terencana."
                : "Lengkapi informasi agenda meeting."}
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup form kegiatan"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-input text-text-muted transition duration-300 hover:rotate-90 hover:bg-error-bg hover:text-error-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <AppIcon name="close" size={21} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-hidden">
        {step === "select" ? (
          <div className="kegiatan-stage h-full overflow-y-auto overscroll-contain p-5 sm:p-6"><div className="grid grid-cols-2 gap-4 sm:gap-5">
            {CATEGORY_OPTIONS.map((option, index) => (
              <button
                key={option.value}
                type="button"
                onClick={() => chooseCategory(option.value)}
                className="group flex min-h-48 flex-col items-center justify-center rounded-3xl border border-border bg-surface px-4 py-6 text-center shadow-sm transition duration-300 ease-out hover:-translate-y-1 hover:border-primary/40 hover:bg-card hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:translate-y-0 active:scale-[0.98]"
                style={{ animationDelay: `${index * 70}ms` }}
              >
                <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary transition duration-300 ease-out group-hover:scale-110 group-hover:rotate-3 group-hover:bg-primary group-hover:text-white">
                  <AppIcon name={option.icon} size={31} />
                </span>

                <span className="mt-4 text-base font-bold text-text">
                  {option.label}
                </span>

                <span className="mt-2 max-w-44 text-xs leading-5 text-text-muted">
                  {option.description}
                </span>
              </button>
            ))}
            </div>
          </div>
        ) : (
          <form onSubmit={submitForm} className="h-full min-h-0">
            <div className="h-full min-h-0 overflow-hidden">
              <div className="flex h-full min-h-0 items-stretch">
                <div className="h-full min-h-0 w-full overflow-y-auto overscroll-contain p-5 [scrollbar-gutter:stable] sm:p-6">
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                    <FormField className="sm:col-span-2" label="Nama kegiatan" required>
                      <input
                        type="text"
                        value={form.title}
                        onChange={updateField("title")}
                        placeholder={
                          activityType === JENIS_KEGIATAN.PROGRAM_KERJA
                            ? "Contoh: Class Meeting 2026"
                            : "Contoh: Meeting Persiapan Class Meeting"
                        }
                        className={inputClass}
                      />
                    </FormField>

                    <FormField className="sm:col-span-2" label="Deskripsi">
                      <textarea
                        value={form.description}
                        onChange={updateField("description")}
                        placeholder="Tuliskan tujuan atau gambaran singkat kegiatan"
                        rows={4}
                        className={`${inputClass} resize-y py-3`}
                      />
                    </FormField>

                    <FormField className="sm:col-span-2" label="Divisi / Sekbid">
                      <select
                        value={form.divisionId}
                        onChange={updateField("divisionId")}
                        className={inputClass}
                      >
                        <option value="">Pengurus Inti / belum ditentukan</option>
                        {divisions.map((division) => (
                          <option key={division.id} value={division.id}>
                            {division.kode ? `Sekbid ${division.kode} - ` : ""}
                            {division.namaSingkat || division.nama || "Tanpa nama"}
                          </option>
                        ))}
                      </select>
                    </FormField>

                    <FormField className="sm:col-span-2" label="Lokasi" required>
                      <input
                        type="text"
                        value={form.location}
                        onChange={updateField("location")}
                        placeholder="Ruang OSIS atau Aula Sekolah"
                        className={inputClass}
                      />
                    </FormField>
                  </div>

                  <ProgressiveSection open={Boolean(form.location.trim())}>
                    <div className="mt-6 border-t border-border pt-6">
                      <div className="mb-4">
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">
                          Pola Pelaksanaan
                        </p>
                        <p className="mt-1 text-sm leading-6 text-text-muted">
                          Pilih satu kali atau berulang. Tanggal pertama selalu menjadi template blok pelaksanaan dan setiap harinya menjadi satu sesi absensi.
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <RecurrenceChoice
                          active={form.scheduleMode === "once"}
                          icon="event_available"
                          title="Sekali"
                          description="Satu blok pelaksanaan"
                          onClick={() => setScheduleMode("once")}
                        />
                        <RecurrenceChoice
                          active={form.scheduleMode === "recurring"}
                          icon="calendar_month"
                          title="Berulang"
                          description="Blok diulang dalam periode"
                          onClick={() => setScheduleMode("recurring")}
                        />
                      </div>

                      <div className="mt-6">
                        <div className="mb-4">
                          <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">
                            {activityType === JENIS_KEGIATAN.PROGRAM_KERJA
                              ? form.scheduleMode === "recurring"
                                ? "Rencana Pelaksanaan Pertama"
                                : "Rencana Pelaksanaan"
                              : form.scheduleMode === "recurring"
                                ? "Pelaksanaan Pertama"
                                : "Rentang Pelaksanaan"}
                          </p>
                          <p className="mt-1 text-sm text-text-muted">
                            {activityType === JENIS_KEGIATAN.PROGRAM_KERJA
                              ? "Jadwal ini adalah rencana awal hasil pleno dan menjadi dasar reminder proposal. Setiap tanggal tetap dapat diatur jamnya."
                              : "Setiap tanggal di dalam rentang akan otomatis dibuat dengan jam default 08:00–12:00 dan tetap dapat diedit."}
                          </p>
                        </div>

                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                          <ScheduleCard title="Mulai" tone="primary">
                            <FormField label="Tanggal mulai" required>
                              <input
                                type="date"
                                value={form.startDate}
                                onChange={updateStartDate}
                                className={inputClass}
                              />
                            </FormField>
                          </ScheduleCard>

                          <ScheduleCard title="Selesai">
                            <FormField label="Tanggal selesai" required>
                              <input
                                type="date"
                                min={form.startDate || undefined}
                                value={form.endDate}
                                onChange={updateEndDate}
                                className={inputClass}
                              />
                            </FormField>
                          </ScheduleCard>
                        </div>

                        <div
                          className={`mt-4 flex flex-col gap-2 rounded-2xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
                            hasValidDateRange
                              ? "border-primary/20 bg-primary/5"
                              : "border-border bg-surface"
                          }`}
                        >
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                              Deteksi otomatis
                            </p>
                            <p className="mt-1 text-base font-bold text-text">
                              {dayCount
                                ? activityType === JENIS_KEGIATAN.PROGRAM_KERJA
                                  ? `${dayCount} hari · ${dayCount} calon sesi absensi`
                                  : `${dayCount} hari · ${dayCount} sesi absensi`
                                : "0 hari"}
                            </p>
                          </div>
                          <p className="text-xs text-text-muted">
                            {dayCount
                              ? "Tanggal awal dan akhir bersifat inklusif."
                              : "Lengkapi tanggal mulai dan selesai."}
                          </p>
                        </div>
                      </div>

                      <ProgressiveSection open={hasValidDateRange}>
                        <div className="mt-6 border-t border-border pt-6">
                          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                            <div>
                              <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">
                                {activityType === JENIS_KEGIATAN.PROGRAM_KERJA
                                  ? "Rencana Harian"
                                  : "Pelaksanaan Harian & Sesi Absensi"}
                              </p>
                              <p className="mt-1 text-sm leading-6 text-text-muted">
                                {activityType === JENIS_KEGIATAN.PROGRAM_KERJA
                                  ? "Jam dibuat otomatis 08:00–12:00. Rencana ini belum membuat unit absensi sebelum jadwal difinalisasi."
                                  : "Jam dibuat otomatis 08:00–12:00. Ubah per tanggal jika jadwal berbeda."}
                              </p>
                            </div>
                            <span
                              className={`w-fit rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${
                                hasValidAttendanceSchedule
                                  ? "bg-primary/10 text-primary"
                                  : "bg-error-bg text-error-text"
                              }`}
                            >
                              {validSessionCount}/{dayCount} valid
                            </span>
                          </div>

                          <div className="max-h-80 space-y-3 overflow-y-auto rounded-2xl border border-border bg-surface p-3 overscroll-contain [scrollbar-gutter:stable] sm:p-4">
                            {baseSessions.map((session) => {
                              const hasCompleteTime = Boolean(session.startTime && session.endTime);
                              const invalid = hasCompleteTime && !session.valid;

                              return (
                                <div
                                  key={session.date}
                                  className={`rounded-2xl border bg-card p-4 transition ${
                                    invalid ? "border-error-text/40" : "border-border"
                                  }`}
                                >
                                  <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_160px_160px] md:items-end">
                                    <div className="min-w-0">
                                      <p className="text-[10px] font-bold uppercase tracking-wider text-primary">
                                        {activityType === JENIS_KEGIATAN.PROGRAM_KERJA
                                          ? `Rencana Hari ${session.dayOffset + 1}`
                                          : `Pelaksanaan Hari ${session.dayOffset + 1}`}
                                      </p>
                                      <p className="mt-1 text-sm font-bold text-text">
                                        {formatDateOnly(session.date)}
                                      </p>
                                      <p className="mt-1 text-xs text-text-muted">
                                        Sesi absensi {session.valid ? `· ${formatDuration(session.durationMinutes)}` : "· belum valid"}
                                      </p>
                                    </div>

                                    <FormField label="Mulai" required>
                                      <input
                                        type="time"
                                        value={session.startTime}
                                        onChange={updateDailySchedule(session.date, "startTime")}
                                        className={`${inputClass} ${invalid ? "border-error-text focus:border-error-text" : ""}`}
                                      />
                                    </FormField>

                                    <FormField label="Selesai" required>
                                      <input
                                        type="time"
                                        value={session.endTime}
                                        onChange={updateDailySchedule(session.date, "endTime")}
                                        className={`${inputClass} ${invalid ? "border-error-text focus:border-error-text" : ""}`}
                                      />
                                    </FormField>
                                  </div>

                                  {invalid && (
                                    <p className="mt-3 rounded-xl bg-error-bg px-3 py-2 text-xs font-semibold text-error-text">
                                      Jam selesai harus lebih akhir dari jam mulai.
                                    </p>
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          {form.scheduleMode === "recurring" && (
                            <div className="mt-6 rounded-2xl border border-border bg-surface p-4 sm:p-5">
                              <div className="mb-4">
                                <p className="text-sm font-bold text-text">Pengulangan</p>
                                <p className="mt-1 text-xs leading-5 text-text-muted">
                                  Seluruh blok pelaksanaan di atas akan diulang dengan interval mingguan sampai batas tanggal yang ditentukan.
                                </p>
                              </div>

                              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <FormField label="Ulangi setiap">
                                  <div className="relative">
                                    <input
                                      type="number"
                                      min="1"
                                      max="52"
                                      value={form.recurrenceInterval}
                                      onChange={updateField("recurrenceInterval")}
                                      className={`${inputClass} pr-20`}
                                    />
                                    <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-xs font-semibold text-text-muted">
                                      minggu
                                    </span>
                                  </div>
                                </FormField>

                                <FormField label="Berulang sampai" required>
                                  <input
                                    type="date"
                                    min={form.endDate || form.startDate || undefined}
                                    max={periodEndDate || undefined}
                                    value={form.recurrenceUntil}
                                    onChange={updateField("recurrenceUntil")}
                                    className={inputClass}
                                  />
                                </FormField>
                              </div>

                              <p className="mt-3 rounded-xl bg-card px-3 py-2 text-xs leading-5 text-text-muted">
                                Seluruh blok pelaksanaan akan diulang setiap {Math.max(1, Number(form.recurrenceInterval) || 1)} minggu. Batas “Berulang sampai” adalah tanggal akhir absolut, sehingga blok terakhir hanya dibuat jika seluruh sesinya selesai paling lambat pada tanggal tersebut.
                              </p>

                              {periodEndDate && (
                                <p className="mt-2 text-xs text-text-muted">
                                  Batas maksimal mengikuti akhir periode aktif: {periodEndDate}.
                                </p>
                              )}
                            </div>
                          )}

                          {hasValidAttendanceSchedule && occurrencePreview.length > 0 && (
                            <div className="mt-5 rounded-2xl border border-border bg-card p-4 sm:p-5">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm font-bold text-text">
                                    {activityType === JENIS_KEGIATAN.PROGRAM_KERJA
                                      ? "Preview Rencana"
                                      : "Preview Pelaksanaan"}
                                  </p>
                                  <p className="mt-1 text-xs text-text-muted">
                                    {form.scheduleMode === "recurring"
                                      ? `${occurrencePreview.length} pelaksanaan terdeteksi sampai batas pengulangan.`
                                      : "Satu blok pelaksanaan akan dibuat."}
                                  </p>
                                </div>
                                <span className="rounded-full bg-primary/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
                                  {form.scheduleMode === "recurring" ? "Series" : "Sekali"}
                                </span>
                              </div>

                              <div className="mt-4 grid max-h-96 grid-cols-1 gap-3 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable] sm:grid-cols-2">
                                {occurrencePreview.map((occurrence, index) => (
                                  <div
                                    key={`${occurrence.startDate}-${index}`}
                                    className="rounded-xl border border-border bg-surface px-3 py-3"
                                  >
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-primary">
                                      {form.scheduleMode === "recurring"
                                        ? `Minggu ${index + 1}`
                                        : `Pelaksanaan ${index + 1}`}
                                    </p>
                                    <p className="mt-1 text-xs font-semibold text-text">
                                      {occurrence.startDate === occurrence.endDate
                                        ? formatDateOnly(occurrence.startDate)
                                        : `${formatDateOnly(occurrence.startDate)} - ${formatDateOnly(occurrence.endDate)}`}
                                    </p>
                                    <p className="mt-1 text-[11px] text-text-muted">
                                      {occurrence.sessions.length} {activityType === JENIS_KEGIATAN.PROGRAM_KERJA ? "calon sesi absensi" : "sesi absensi"}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </ProgressiveSection>
                    </div>
                  </ProgressiveSection>

                  {activityType === JENIS_KEGIATAN.RAPAT && (
                            <div className="mt-6">
                              <FormField label="Penanggung Jawab">
                                <select
                                  value={form.organiserMemberId}
                                  onChange={updateField("organiserMemberId")}
                                  className={inputClass}
                                >
                                  <option value="">Belum ditentukan</option>
                                  {officialMembers.map((member) => (
                                    <option key={member.id} value={member.id}>
                                      {member.namaLengkap || member.nama || "Anggota tanpa nama"}
                                      {member.jabatanOrganisasi || member.jabatan
                                        ? ` — ${member.jabatanOrganisasi || member.jabatan}`
                                        : ""}
                                    </option>
                                  ))}
                                </select>
                              </FormField>
                            </div>
                          )}

                  {error && (
                    <div
                      role="alert"
                      className="mt-5 rounded-2xl border border-error-text/20 bg-error-bg px-4 py-3 text-sm text-error-text"
                    >
                      {error}
                    </div>
                  )}

                  <footer className="mt-7 flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
                    <button
                      type="button"
                      onClick={() => {
                        setStep("select");
                        setError("");
                      }}
                      disabled={saving}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold text-text-muted transition duration-300 hover:border-primary/40 hover:bg-primary/5 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <AppIcon name="arrow_back" size={18} />
                      Pilih ulang kategori
                    </button>

                    <button
                      type="submit"
                      disabled={saving || !hasValidAttendanceSchedule}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-white shadow-sm transition duration-300 ease-out hover:-translate-y-0.5 hover:bg-primary-hover hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                    >
                      <AppIcon name="check" size={18} />
                      {saving
                        ? "Menyimpan..."
                        : activityType === JENIS_KEGIATAN.PROGRAM_KERJA
                          ? "Simpan sebagai Terencana"
                          : "Simpan Meeting"}
                    </button>
                  </footer>
                </div>

              </div>
            </div>
          </form>
        )}
      </div>

      <style jsx>{`
        .kegiatan-stage {
          animation: kegiatanStageIn 420ms
            cubic-bezier(0.16, 1, 0.3, 1) both;
        }

        @keyframes kegiatanStageIn {
          from {
            opacity: 0;
            transform: translateY(14px) scale(0.985);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .kegiatan-stage {
            animation: none;
          }
        }
      `}</style>
    </section>
  );
}

const inputClass =
  "min-h-11 w-full rounded-xl border border-border bg-input px-4 text-sm text-text outline-none transition duration-300 placeholder:text-text-muted/70 focus:border-primary focus:bg-card focus:ring-2 focus:ring-primary/10";

function ProgressiveSection({ open, children }) {
  return (
    <div
      className={`grid transition-[grid-template-rows,opacity] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
      }`}
      aria-hidden={!open}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}

function ProposalMeta({ label, value, mono = false }) {
  return (
    <div className="rounded-xl bg-surface px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
        {label}
      </p>
      <p
        className={`mt-1 truncate text-xs font-semibold text-text ${
          mono ? "font-mono" : ""
        }`}
      >
        {value || "Unknown"}
      </p>
    </div>
  );
}

function ScheduleCard({ title, tone = "neutral", children }) {
  return (
    <section
      className={`rounded-2xl border p-4 sm:p-5 ${
        tone === "primary"
          ? "border-primary/20 bg-primary/5"
          : "border-border bg-surface"
      }`}
    >
      <div className="mb-4 flex items-center gap-2">
        <span
          className={`h-2.5 w-2.5 rounded-full ${
            tone === "primary" ? "bg-primary" : "bg-text-muted/40"
          }`}
        />
        <h3 className="text-sm font-bold text-text">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function RecurrenceChoice({ active, icon, title, description, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border p-4 text-left transition duration-300 ${
        active
          ? "border-primary bg-primary/5 shadow-sm"
          : "border-border bg-card hover:border-primary/30"
      }`}
    >
      <span
        className={`flex h-10 w-10 items-center justify-center rounded-xl ${
          active ? "bg-primary text-white" : "bg-input text-text-muted"
        }`}
      >
        <AppIcon name={icon} size={19} />
      </span>
      <p className="mt-3 text-sm font-bold text-text">{title}</p>
      <p className="mt-1 text-xs leading-5 text-text-muted">{description}</p>
    </button>
  );
}

function TypeTab({ active, icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition duration-300 sm:flex-none ${
        active
          ? "bg-card text-primary shadow-sm"
          : "text-text-muted hover:text-text"
      }`}
    >
      <AppIcon name={icon} size={18} />
      {label}
    </button>
  );
}

function FormField({ label, required = false, className = "", children }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-2 block text-sm font-semibold text-text">
        {label}
        {required && <span className="ml-1 text-error-text">*</span>}
      </span>
      {children}
    </label>
  );
}