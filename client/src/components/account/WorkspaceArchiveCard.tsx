import React, { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  archiveService,
  type WorkspaceArchiveItem,
  type WorkspaceArchives,
} from "@/services/accountClosureService";
import {
  Badge,
  Banner,
  Button,
  Card,
  DataTable,
  type DataTableColumn,
  EmptyState,
  formatDate,
} from "@/components/ui";

const POLL_MS = 5000;

const apiMessage = (error: unknown, fallback: string) => {
  const data = (error as { response?: { data?: { message?: string } } })
    ?.response?.data;
  return data?.message || fallback;
};

const formatSize = (bytes: number) => {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const contents = (row: WorkspaceArchiveItem) => {
  if (row.status !== "ready") return "—";
  const records = `${row.documentCount.toLocaleString("en-IN")} records`;
  if (!row.fileCount) return records;
  const files = `${row.fileCount.toLocaleString("en-IN")} uploaded file${row.fileCount === 1 ? "" : "s"}`;
  return row.filesMode === "links" || row.filesMode === "partial"
    ? `${records}, ${files} (some as links)`
    : `${records}, ${files}`;
};

const STATUS: Record<
  WorkspaceArchiveItem["status"],
  { tone: "success" | "info" | "danger" | "neutral"; label: string }
> = {
  ready: { tone: "success", label: "Ready" },
  building: { tone: "info", label: "Being made" },
  failed: { tone: "danger", label: "Failed" },
  deleted: { tone: "neutral", label: "Deleted" },
};

/**
 * Settings → Account → Workspace archive, shown while a closure is pending: a .zip of all the school's
 * records and uploaded files that we can re-import if the school comes back.
 */
const WorkspaceArchiveCard: React.FC = () => {
  const [state, setState] = useState<WorkspaceArchives | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      setState(await archiveService.getArchives());
      setLoadError(null);
    } catch (error) {
      setLoadError(
        apiMessage(
          error,
          "We couldn’t load your archives. Refresh the page to try again.",
        ),
      );
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const building = Boolean(
    state?.archives.some((archive) => archive.status === "building"),
  );
  useEffect(() => {
    if (!building) return undefined;
    const timer = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(timer);
  }, [building, load]);

  const handleCreate = async () => {
    if (creating) return;
    setCreating(true);
    try {
      await archiveService.createArchive();
      toast.success(
        "We’re making your archive. We’ll email you when it’s ready.",
      );
      await load();
    } catch (error) {
      toast.error(
        apiMessage(
          error,
          "We couldn’t start the archive. Try again in a minute.",
        ),
      );
    } finally {
      setCreating(false);
    }
  };

  // Without archive storage on the server there is nothing to show; the Export options still work.
  if (state && !state.available) return null;

  const columns: DataTableColumn<WorkspaceArchiveItem>[] = [
    {
      key: "made",
      header: "Made",
      render: (row) => formatDate(row.createdAt),
      mobile: "title",
    },
    {
      key: "contents",
      header: "Contents",
      render: contents,
      mobile: "subtitle",
      wrap: true,
    },
    {
      key: "size",
      header: "Size",
      render: (row) => formatSize(row.bytes),
      numeric: true,
      mobile: "hidden",
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <Badge tone={STATUS[row.status].tone}>{STATUS[row.status].label}</Badge>
      ),
      mobile: "aside",
    },
    {
      key: "download",
      header: "",
      headerLabel: "Download",
      interactive: true,
      align: "right",
      render: (row) =>
        row.downloadUrl ? (
          <a className="cb-link" href={row.downloadUrl}>
            Download
          </a>
        ) : null,
    },
  ];

  return (
    <Card
      title="Workspace archive"
      subtitle="All your school’s records and uploaded files in one .zip file."
      action={
        state?.canRequest ? (
          <Button
            type="button"
            size="sm"
            variant="tertiary"
            loading={creating}
            disabled={building}
            onClick={handleCreate}
          >
            Make a new archive
          </Button>
        ) : undefined
      }
    >
      <div className="cb-form-section">
        <Banner tone="info" title="Keep this file somewhere safe">
          It is a full copy of your school’s data. If your school comes back to
          Capabble, we can bring your workspace back from it, with every record
          and file. We email a download link when each archive is ready; links
          work for 7 days.
        </Banner>
        {loadError ? (
          <div className="cb-table-state" role="status">
            {loadError}
          </div>
        ) : (
          <DataTable
            columns={columns}
            rows={state?.archives || []}
            getRowKey={(row) => row.id}
            loading={!state}
            loadingLabel="Loading archives…"
            empty={
              <EmptyState
                compact
                title="No archive yet"
                body="Make one to download all your school’s data."
              />
            }
          />
        )}
      </div>
    </Card>
  );
};

export default WorkspaceArchiveCard;
