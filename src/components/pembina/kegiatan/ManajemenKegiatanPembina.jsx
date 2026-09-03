"use client";

import { useMemo, useState } from "react";
import { doc, writeBatch } from "firebase/firestore";

import AppIcon from "@/components/global/AppIcon";
import { useDb } from "@/context/DbContext";
import { useCollection } from "@/hooks/useCollection";
import {
  firstError,
  formatBytes,
  formatDate,
  isLoading,
  rowsOf,
  sortDateDesc,
} from "@/components/pembina/_shared/firestoreHelpers";
import {
  Avatar,
  DisabledAction,
  EmptyState,
  PageError,
  PageHeading,
  PageLoading,
  Tabs,
} from "@/components/pembina/_shared/PembinaUi";
import ProgramKerjaSection from "./sub-components/ProgramKerjaSection";
import RapatSection from "./sub-components/RapatSection";
import { BadgeStatus } from "./sub-components/KegiatanSectionUi";
import { useSeleksiKegiatanOverlay } from "./sub-components/SeleksiKegiatanOverlay";
import PengajuanKegiatanCollapsible, {
  adalahDrafPengajuanAnggota,
  ambilPengajuanKegiatan,
} from "./sub-components/PengajuanKegiatanCollapsible";
import { useKegiatanDetailsOverlay } from "./sub-components/KegiatanDetailsOverlay";
import { usePengajuanKegiatanReviewOverlay } from "./sub-components/PengajuanKegiatanReviewOverlay";
import {
  FIELD,
  JENIS_KEGIATAN,
  KOLEKSI,
  OPSI_STATUS_LAPORAN,
  OPSI_STATUS_PROPOSAL,
  STATUS_KEANGGOTAAN,
  STATUS_LAPORAN,
  STATUS_PROPOSAL,
} from "./konfigurasiManajemenKegiatan";

export default function ManajemenKegiatanPembina() {
  const { db, colRef, serverTimestamp } = useDb();
  const { openKegiatanDetails } = useKegiatanDetailsOverlay();
  const { openReviewPengajuanKegiatan } = usePengajuanKegiatanReviewOverlay();

  // Semua nama collection dipusatkan di konfigurasi modul.
  const kegiatan = useCollection(() => colRef(KOLEKSI.KEGIATAN), [], {
    enabled: true,
  });
  const proposal = useCollection(() => colRef(KOLEKSI.PROPOSAL), [], {
    enabled: true,
  });
  const anggota = useCollection(() => colRef(KOLEKSI.ANGGOTA), [], {
    enabled: true,
  });
  const divisi = useCollection(() => colRef(KOLEKSI.DIVISI), [], {
    enabled: true,
  });

  const [tab, setTab] = useState("kegiatan");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("semua");
  const [jenisKegiatan, setJenisKegiatan] = useState(JENIS_KEGIATAN.PROGRAM_KERJA);
  const [proposalActionId, setProposalActionId] = useState(null);
  const [proposalFeedback, setProposalFeedback] = useState(null);

  const loading = isLoading(kegiatan, proposal, anggota, divisi);
  const error = firstError(kegiatan, proposal, anggota, divisi);

  const handleProposalDecision = async (proposalRow, status) => {
    if (!proposalRow?.id || proposalActionId) return;
    if (status === STATUS_PROPOSAL.DITOLAK &&
      !window.confirm(`Tolak proposal ${proposalRow.namaFile || "ini"}?`)) {
      return;
    }

    setProposalActionId(proposalRow.id);
    setProposalFeedback(null);

    try {
      const waktu = serverTimestamp();
      const activity = proposalRow.kegiatan;
      const pengajuanKey = activity?.pengajuanProgramKerja
        ? "pengajuanProgramKerja"
        : activity?.pengajuanRapat
          ? "pengajuanRapat"
          : activity?.pengajuanKegiatan
            ? "pengajuanKegiatan"
            : null;
      const batch = writeBatch(db);
      const proposalRef = doc(db, KOLEKSI.PROPOSAL, proposalRow.id);
      const activityRef = activity?.id
        ? doc(db, KOLEKSI.KEGIATAN, activity.id)
        : null;

      batch.update(proposalRef, {
        status,
        diperbaruiPada: waktu,
        ...(status === STATUS_PROPOSAL.PERLU_REVISI
          ? { catatanReview: "Proposal perlu diperbaiki oleh anggota." }
          : {}),
      });

      if (activityRef) {
        batch.update(activityRef, {
          statusProposal: status,
          ...(pengajuanKey
            ? { [pengajuanKey]: { ...activity[pengajuanKey], status } }
            : {}),
          diperbaruiPada: waktu,
        });
      }
      await batch.commit();
      setProposalFeedback({
        type: "success",
        message: `Proposal berhasil diubah menjadi ${status === STATUS_PROPOSAL.DISETUJUI ? "disetujui" : status === STATUS_PROPOSAL.PERLU_REVISI ? "perlu revisi" : "ditolak"}.`,
      });
    } catch (decisionError) {
      console.error("REVIEW PROPOSAL ERROR:", decisionError);
      setProposalFeedback({
        type: "error",
        message: decisionError?.message || "Proposal belum berhasil diproses.",
      });
    } finally {
      setProposalActionId(null);
    }
  };

  const data = useMemo(() => {
    const barisKegiatan = rowsOf(kegiatan);
    const barisProposal = rowsOf(proposal);
    const barisAnggota = rowsOf(anggota);
    const barisDivisi = rowsOf(divisi);

    const petaAnggota = new Map(barisAnggota.map((item) => [item.id, item]));
    const petaDivisi = new Map(barisDivisi.map((item) => [item.id, item]));
    const petaKegiatan = new Map(barisKegiatan.map((item) => [item.id, item]));
    const petaProposal = new Map(barisProposal.map((item) => [item.id, item]));
    const petaProposalKegiatan = new Map();

    barisProposal.forEach((item) => {
      if (!item?.idKegiatan) return;
      const current = petaProposalKegiatan.get(item.idKegiatan);
      if (!current || Number(item.versi || 0) >= Number(current.versi || 0)) {
        petaProposalKegiatan.set(item.idKegiatan, item);
      }
    });

    return {
      barisAnggota: barisAnggota.filter((item) =>
        [
          STATUS_KEANGGOTAAN.AKTIF,
          STATUS_KEANGGOTAAN.NONAKTIF,
          STATUS_KEANGGOTAAN.DITANGGUHKAN,
        ].includes(item[FIELD.ANGGOTA.STATUS_KEANGGOTAAN])
      ),

      barisDivisi,

      barisKegiatan: sortDateDesc(
        barisKegiatan,
        FIELD.KEGIATAN.WAKTU_MULAI
      ).map((item) => ({
        ...item,
        // Data baru wajib memakai enum Indonesia. Jika kosong, dianggap Program Kerja.
        jenisKegiatan:
          item[FIELD.KEGIATAN.JENIS] === JENIS_KEGIATAN.RAPAT
            ? JENIS_KEGIATAN.RAPAT
            : JENIS_KEGIATAN.PROGRAM_KERJA,
        divisi: petaDivisi.get(item[FIELD.KEGIATAN.ID_DIVISI]) || null,
        penanggungJawab:
          petaAnggota.get(item[FIELD.KEGIATAN.ID_PENANGGUNG_JAWAB]) || null,
        proposal: item[FIELD.KEGIATAN.ID_PROPOSAL]
          ? petaProposal.get(item[FIELD.KEGIATAN.ID_PROPOSAL]) ||
            petaProposalKegiatan.get(item.id) ||
            null
          : petaProposalKegiatan.get(item.id) || null,
        pengaju: (() => {
          const metadataPengajuan = ambilPengajuanKegiatan(item);
          return metadataPengajuan?.idPengaju
            ? petaAnggota.get(metadataPengajuan.idPengaju) || null
            : null;
        })(),
      })),

      barisProposal: sortDateDesc(
        barisProposal,
        FIELD.PROPOSAL.DIAJUKAN_PADA
      ).map((item) => {
        const pengunggah =
          petaAnggota.get(item[FIELD.PROPOSAL.ID_PENGUNGGAH]) || null;

        return {
          ...item,
          kegiatan: petaKegiatan.get(item[FIELD.PROPOSAL.ID_KEGIATAN]) || null,
          pengunggah,
          divisi: petaDivisi.get(pengunggah?.[FIELD.ANGGOTA.ID_DIVISI]) || null,
        };
      }),
    };
  }, [kegiatan, proposal, anggota, divisi]);

  const { openSeleksiKegiatan } = useSeleksiKegiatanOverlay({
    proposals: data.barisProposal,
    divisions: data.barisDivisi,
    members: data.barisAnggota,
    onCreated: (selectedType) => {
      setTab("kegiatan");
      setJenisKegiatan(selectedType);
      setSearch("");
      setStatusFilter("semua");
    },
  });

  if (loading) return <PageLoading message="Memuat manajemen kegiatan..." />;
  if (error) return <PageError message={error.message} />;

  return (
    <div>
      <PageHeading
        eyebrow="Program Kerja OSIS"
        title="Manajemen Kegiatan"
        description="Kelola program kerja, review pengajuan rapat, proposal, finalisasi, dan laporan pelaksanaan dalam satu menu."
        action={
          <button
            type="button"
            onClick={openSeleksiKegiatan}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white shadow-sm transition duration-300 ease-out hover:-translate-y-0.5 hover:bg-primary-hover hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:translate-y-0"
          >
            <AppIcon name="add" size={19} />
            Tambah Kegiatan
          </button>
        }
      />

      <Tabs
        value={tab}
        onChange={(value) => {
          setTab(value);
          setStatusFilter("semua");
        }}
        items={[
          { value: "kegiatan", label: "Kegiatan" },
          { value: "proposal", label: "Proposal" },
          { value: "laporan", label: "Laporan" },
        ]}
      />

      {proposalFeedback && (
        <div className={`mt-5 rounded-xl px-4 py-3 text-sm font-medium ${proposalFeedback.type === "error" ? "bg-error-bg text-error-text" : "bg-emerald-50 text-emerald-800"}`}>
          {proposalFeedback.message}
        </div>
      )}

      {tab === "kegiatan" && (
        <ActivitiesTab
          rows={data.barisKegiatan}
          search={search}
          setSearch={setSearch}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          activityType={jenisKegiatan}
          setActivityType={setJenisKegiatan}
          onOpenDetail={openKegiatanDetails}
          onReviewPengajuan={openReviewPengajuanKegiatan}
        />
      )}

      {tab === "proposal" && (
        <ProposalsTab
          rows={data.barisProposal}
          search={search}
          setSearch={setSearch}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          onDecision={handleProposalDecision}
          proposalActionId={proposalActionId}
        />
      )}

      {tab === "laporan" && (
        <ReportsTab
          rows={data.barisKegiatan}
          search={search}
          setSearch={setSearch}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
        />
      )}
    </div>
  );
}

function ActivitiesTab({
  rows,
  search,
  setSearch,
  statusFilter,
  setStatusFilter,
  activityType,
  setActivityType,
  onOpenDetail,
  onReviewPengajuan,
}) {
  // Draf yang berasal dari pengajuan Anggota dipisahkan dari daftar kegiatan resmi.
  // Dokumen tetap berada di collection Kegiatan; komponen collapsible hanya
  // mengatur cara penampilannya di sisi Pembina.
  const officialRows = rows.filter((item) => !adalahDrafPengajuanAnggota(item));

  const workProgramRows = officialRows.filter(
    (item) => item.jenisKegiatan === JENIS_KEGIATAN.PROGRAM_KERJA
  );
  const meetingRows = officialRows.filter(
    (item) => item.jenisKegiatan === JENIS_KEGIATAN.RAPAT
  );

  const handleTypeChange = (value) => {
    setActivityType(value);
    setSearch("");
    setStatusFilter("semua");
  };

  const typeSelector = (
    <section className="mt-6 flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">
          Tipe Kegiatan
        </p>
        <h2 className="mt-1 font-bold text-text">Pilih Program Kerja atau Rapat</h2>
        <p className="mt-1 text-xs leading-5 text-text-muted">
          Setiap tipe ditampilkan dan dikelola melalui komponen terpisah.
        </p>
      </div>

      <Tabs
        value={activityType}
        onChange={handleTypeChange}
        items={[
          {
            value: JENIS_KEGIATAN.PROGRAM_KERJA,
            label: `Program Kerja (${workProgramRows.length})`,
          },
          {
            value: JENIS_KEGIATAN.RAPAT,
            label: `Rapat (${meetingRows.length})`,
          },
        ]}
      />
    </section>
  );

  return (
    <div className="mt-6">
      {typeSelector}

      <PengajuanKegiatanCollapsible
        rows={rows}
        jenisKegiatan={activityType}
        onOpenReview={onReviewPengajuan}
      />

      <div className="mt-7">
        {activityType === JENIS_KEGIATAN.PROGRAM_KERJA && (
          <ProgramKerjaSection
            rows={workProgramRows}
            search={search}
            setSearch={setSearch}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            onOpenDetail={onOpenDetail}
          />
        )}

        {activityType === JENIS_KEGIATAN.RAPAT && (
          <RapatSection
            rows={meetingRows}
            search={search}
            setSearch={setSearch}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            onOpenDetail={onOpenDetail}
          />
        )}
      </div>
    </div>
  );
}

function ProposalsTab({
  rows,
  search,
  setSearch,
  statusFilter,
  setStatusFilter,
  onDecision,
  proposalActionId,
}) {
  const keyword = search.trim().toLowerCase();
  const filtered = rows.filter((item) => {
    return (
      (!keyword ||
        item.namaKegiatan?.toLowerCase().includes(keyword) ||
        item.pengunggah?.namaLengkap?.toLowerCase().includes(keyword) ||
        item.kegiatan?.namaKegiatan?.toLowerCase().includes(keyword) ||
        item.kegiatan?.idReferensi?.toLowerCase().includes(keyword)) &&
      (statusFilter === "semua" || item.status === statusFilter)
    );
  });

  return (
    <div className="mt-6">
      <ProposalSummary rows={rows} />

      <FilterBar
        title="Daftar Proposal"
        count={filtered.length}
        search={search}
        setSearch={setSearch}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        options={OPSI_STATUS_PROPOSAL}
      />

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {filtered.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-left">
              <thead className="bg-input text-xs uppercase tracking-wider text-text-muted">
                <tr>
                  <th className="px-5 py-4">Nama Kegiatan</th>
                  <th className="px-5 py-4">Pengaju</th>
                  <th className="px-5 py-4">File</th>
                  <th className="px-5 py-4">Tanggal</th>
                  <th className="px-5 py-4 text-center">Status</th>
                  <th className="px-5 py-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((proposal) => (
                  <tr key={proposal.id}>
                    <td className="px-5 py-4">
                      <p className="text-sm font-semibold text-text">
                        {proposal.kegiatan?.namaKegiatan || proposal.namaKegiatan || "-"}
                      </p>
                      <p className="mt-1 text-xs text-text-muted">
                        Versi {proposal.versi || 1}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <Avatar name={proposal.pengunggah?.namaLengkap} size="sm" />
                        <div>
                          <p className="text-sm font-semibold text-text">
                            {proposal.pengunggah?.namaLengkap || "-"}
                          </p>
                          <p className="text-xs text-text-muted">
                            {proposal.divisi
                              ? `Sekbid ${proposal.divisi.kode || "-"}`
                              : "Pengurus Inti"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <p className="max-w-48 truncate text-sm text-text">
                        {proposal.namaFile || "-"}
                      </p>
                      <p className="mt-1 text-xs text-text-muted">
                        {formatBytes(proposal.ukuranFileByte)}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-sm text-text-muted">
                      {formatDate(proposal.diajukanPada)}
                    </td>
                    <td className="px-5 py-4 text-center">
                      <BadgeStatus status={proposal.status} jenis="proposal" />
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-1">
                        <a
                          href={proposal.urlFile || "#"}
                          target="_blank"
                          rel="noreferrer"
                          aria-label="Lihat File"
                          className="rounded-lg p-2 text-primary hover:bg-primary/10"
                        >
                          <AppIcon name="visibility" size={18} />
                        </a>
                        <IconAction
                          icon="check"
                          label="Setujui"
                          disabled={proposalActionId === proposal.id}
                          onClick={() => onDecision?.(proposal, STATUS_PROPOSAL.DISETUJUI)}
                        />
                        <IconAction
                          icon="edit"
                          label="Revisi"
                          disabled={proposalActionId === proposal.id}
                          onClick={() => onDecision?.(proposal, STATUS_PROPOSAL.PERLU_REVISI)}
                        />
                        <IconAction
                          icon="close"
                          label="Tolak"
                          danger
                          disabled={proposalActionId === proposal.id}
                          onClick={() => onDecision?.(proposal, STATUS_PROPOSAL.DITOLAK)}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5">
            <EmptyState icon="receipt" title="Proposal tidak ditemukan" />
          </div>
        )}
      </section>
    </div>
  );
}

function ReportsTab({ rows, search, setSearch, statusFilter, setStatusFilter }) {
  const keyword = search.trim().toLowerCase();
  const filtered = rows.filter((item) => {
    return (
      (!keyword ||
        item.namaKegiatan?.toLowerCase().includes(keyword) ||
        item.idReferensi?.toLowerCase().includes(keyword) ||
        item.lokasi?.toLowerCase().includes(keyword)) &&
      (statusFilter === "semua" || item.statusLaporan === statusFilter)
    );
  });

  return (
    <div className="mt-6">
      <ReportSummary rows={rows} />

      <FilterBar
        title="Laporan Pelaksanaan"
        count={filtered.length}
        search={search}
        setSearch={setSearch}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        options={OPSI_STATUS_LAPORAN}
      />

      <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {filtered.length ? (
          filtered.map((activity) => (
            <article
              key={activity.id}
              className="rounded-2xl border border-border bg-card p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-[10px] font-bold text-primary">
                    {activity.idReferensi || "-"}
                  </p>
                  <h2 className="mt-1 font-bold text-text">{activity.namaKegiatan}</h2>
                  <p className="mt-2 text-sm text-text-muted">
                    {formatDate(activity.waktuMulai)} · {activity.lokasi}
                  </p>
                </div>
                <BadgeStatus status={activity.statusLaporan} jenis="laporan" />
              </div>

              <div className="mt-5 rounded-xl bg-surface p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-text-muted">
                  File Laporan
                </p>
                <p className="mt-2 break-all text-sm font-semibold text-text">
                  {activity.urlFileLaporan || "Belum ada file laporan"}
                </p>
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <DisabledAction icon="visibility" variant="outline">Lihat Laporan</DisabledAction>
                <DisabledAction icon="check">Validasi</DisabledAction>
              </div>
            </article>
          ))
        ) : (
          <div className="lg:col-span-2">
            <EmptyState icon="receipt" title="Laporan tidak ditemukan" />
          </div>
        )}
      </section>
    </div>
  );
}

function ProposalSummary({ rows }) {
  const menunggu = rows.filter(
    (item) => item.status === STATUS_PROPOSAL.MENUNGGU_REVIEW
  ).length;
  const disetujui = rows.filter(
    (item) => item.status === STATUS_PROPOSAL.DISETUJUI
  ).length;
  const revisi = rows.filter(
    (item) => item.status === STATUS_PROPOSAL.PERLU_REVISI
  ).length;

  return (
    <section className="grid grid-cols-1 gap-5 lg:grid-cols-[1.15fr_1.85fr]">
      <div className="relative overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/70 p-6 shadow-sm">
        <div className="absolute -right-12 -top-14 h-36 w-36 rounded-full bg-amber-200/30" />
        <div className="relative flex items-start justify-between gap-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-700">
              Perlu Perhatian
            </p>
            <p className="mt-3 text-4xl font-bold tracking-tight text-text">
              {menunggu}
            </p>
            <h2 className="mt-1 font-bold text-text">Proposal menunggu review</h2>
            <p className="mt-2 max-w-sm text-xs leading-5 text-text-muted">
              Proposal yang belum memperoleh keputusan pembina.
            </p>
          </div>

          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/80 text-amber-700 shadow-sm">
            <AppIcon name="rate_review" size={24} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryTile
          icon="receipt_long"
          label="Total Proposal"
          value={rows.length}
          helper="Seluruh pengajuan"
        />
        <SummaryTile
          icon="verified"
          label="Disetujui"
          value={disetujui}
          helper="Siap ditindaklanjuti"
          tone="green"
        />
        <SummaryTile
          icon="edit_note"
          label="Perlu Revisi"
          value={revisi}
          helper="Dikembalikan untuk diperbaiki"
          tone="red"
        />
      </div>
    </section>
  );
}

function ReportSummary({ rows }) {
  const menunggu = rows.filter(
    (item) => item.statusLaporan === STATUS_LAPORAN.MENUNGGU
  ).length;
  const diajukan = rows.filter(
    (item) => item.statusLaporan === STATUS_LAPORAN.DIAJUKAN
  ).length;
  const selesai = rows.filter(
    (item) => item.statusLaporan === STATUS_LAPORAN.SELESAI
  ).length;
  const progress = rows.length
    ? Math.round((selesai / rows.length) * 100)
    : 0;

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1.8fr]">
        <div className="border-b border-border p-6 lg:border-b-0 lg:border-r">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">
                Penyelesaian Laporan
              </p>
              <div className="mt-3 flex items-end gap-3">
                <span className="text-4xl font-bold tracking-tight text-text">
                  {progress}%
                </span>
                <span className="pb-1 text-xs font-semibold text-text-muted">
                  selesai
                </span>
              </div>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <AppIcon name="assignment_turned_in" size={22} />
            </div>
          </div>

          <div className="mt-5 h-2 overflow-hidden rounded-full bg-input">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-3 text-xs leading-5 text-text-muted">
            {selesai} dari {rows.length} kegiatan telah menyelesaikan laporan.
          </p>
        </div>

        <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <InlineMetric
            icon="schedule"
            label="Menunggu Laporan"
            value={menunggu}
            helper="Belum dikirim"
          />
          <InlineMetric
            icon="upload_file"
            label="Sudah Dikirim"
            value={diajukan}
            helper="Menunggu validasi"
          />
          <InlineMetric
            icon="task_alt"
            label="Selesai"
            value={selesai}
            helper="Laporan lengkap"
          />
        </div>
      </div>
    </section>
  );
}

function SummaryTile({ icon, label, value, helper, tone = "default" }) {
  const toneClass = {
    default: "bg-primary/10 text-primary",
    green: "bg-emerald-50 text-emerald-700",
    red: "bg-red-50 text-red-700",
  }[tone];

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${toneClass}`}>
        <AppIcon name={icon} size={20} />
      </div>
      <p className="mt-5 text-3xl font-bold tracking-tight text-text">{value}</p>
      <p className="mt-1 text-sm font-bold text-text">{label}</p>
      <p className="mt-1 text-xs leading-5 text-text-muted">{helper}</p>
    </div>
  );
}

function InlineMetric({ icon, label, value, helper }) {
  return (
    <div className="flex items-center gap-4 p-5 lg:p-6">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface text-text-muted">
        <AppIcon name={icon} size={20} />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold tracking-tight text-text">{value}</p>
        <p className="text-xs font-bold text-text">{label}</p>
        <p className="mt-0.5 text-[11px] text-text-muted">{helper}</p>
      </div>
    </div>
  );
}

function FilterBar({
  title,
  count,
  search,
  setSearch,
  statusFilter,
  setStatusFilter,
  options,
}) {
  return (
    <section className="my-6 flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
      <div>
        <h2 className="font-bold text-text">{title}</h2>
        <p className="mt-1 text-xs text-text-muted">{count} data ditampilkan.</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Cari data"
          className="min-h-11 rounded-xl border border-border bg-input px-4 text-sm outline-none focus:border-primary"
        />
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="min-h-11 rounded-xl border border-border bg-input px-4 text-sm outline-none focus:border-primary"
        >
          <option value="semua">Semua Status</option>
          {options.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>
    </section>
  );
}

function IconAction({ icon, label, danger = false, disabled = false, onClick }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={label}
      className={`rounded-lg p-2 transition hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50 ${danger ? "text-error-text" : "text-primary"}`}
    >
      <AppIcon name={icon} size={18} />
    </button>
  );
}
