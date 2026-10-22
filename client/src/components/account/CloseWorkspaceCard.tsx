import React, { useEffect, useState } from "react";
import toast from "react-hot-toast";
import closureService, {
  type WorkspaceClosure,
} from "@/services/accountClosureService";
import {
  Banner,
  Button,
  Card,
  DetailList,
  Dialog,
  TextField,
  formatDate,
} from "@/components/ui";
import WorkspaceArchiveCard from "./WorkspaceArchiveCard";

const EXPORT_DAYS = 30;
const DELETE_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

const apiMessage = (error: unknown, fallback: string) => {
  const data = (error as { response?: { data?: { message?: string } } })
    ?.response?.data;
  return data?.message || fallback;
};

/** Settings → Account → Close workspace. Administrators only (the server checks too). */
const CloseWorkspaceCard: React.FC = () => {
  const [state, setState] = useState<WorkspaceClosure | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [canceling, setCanceling] = useState(false);

  useEffect(() => {
    let cancelled = false;
    closureService
      .getClosure()
      .then((data) => {
        if (!cancelled) setState(data);
      })
      .catch((error) => {
        if (!cancelled)
          setLoadError(
            apiMessage(
              error,
              "We couldn’t check the workspace status. Refresh the page to try again.",
            ),
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const slug = state?.slug || "";
  const matches =
    Boolean(slug) && typed.trim().toLowerCase() === slug.toLowerCase();
  const closure = state?.closure;
  const pending = closure?.status === "pending";

  const openDialog = () => {
    setTyped("");
    setFieldError(undefined);
    setOpen(true);
  };
  const closeDialog = () => {
    if (!submitting) setOpen(false);
  };

  const handleRequest = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!matches || submitting) return;
    setSubmitting(true);
    try {
      const updated = await closureService.requestClosure(
        typed.trim().toLowerCase(),
      );
      setState(updated);
      setOpen(false);
      toast.success("Closure requested. We’ve emailed you the dates.");
    } catch (error) {
      setFieldError(
        apiMessage(
          error,
          "We couldn’t send the request. Check your connection and try again.",
        ),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (canceling) return;
    setCanceling(true);
    try {
      const updated = await closureService.cancelClosure();
      setState(updated);
      toast.success("Closure cancelled. Your workspace stays open.");
    } catch (error) {
      toast.error(
        apiMessage(
          error,
          "We couldn’t cancel the closure. Check your connection and try again.",
        ),
      );
    } finally {
      setCanceling(false);
    }
  };

  if (loading || loadError) {
    return (
      <Card title="Close workspace">
        <div className="cb-table-state" role="status">
          {loading ? (
            <>
              <span className="cb-spinner" aria-hidden="true" />
              Checking workspace status…
            </>
          ) : (
            loadError
          )}
        </div>
      </Card>
    );
  }

  if (pending) {
    return (
      <>
        <Card
          title="Close workspace"
          subtitle="Your school has asked to close this workspace."
          footer={
            <div className="cb-card-actions">
              <Button
                type="button"
                variant="secondary"
                loading={canceling}
                onClick={handleCancel}
              >
                Cancel closure
              </Button>
            </div>
          }
        >
          <div className="cb-form-section">
            <Banner
              tone="warning"
              title={`Open until ${formatDate(closure?.exportUntil)}`}
            >
              Everyone can keep using Capabble until then. Download your
              workspace archive below, or what you need from the Export options
              on Students, Staff and other lists. After that the workspace
              closes, and its data is deleted by{" "}
              {formatDate(closure?.deleteAfter)}.
            </Banner>
            <DetailList
              columns={2}
              items={[
                { label: "Requested", value: formatDate(closure?.requestedAt) },
                {
                  label: "Requested by",
                  value:
                    closure?.requestedBy?.name ||
                    closure?.requestedBy?.email ||
                    "—",
                },
                {
                  label: "Open until",
                  value: formatDate(closure?.exportUntil),
                },
                {
                  label: "Data deleted by",
                  value: formatDate(closure?.deleteAfter),
                },
              ]}
            />
          </div>
        </Card>
        <WorkspaceArchiveCard />
      </>
    );
  }

  const now = Date.now();
  const exportUntil = new Date(now + EXPORT_DAYS * DAY_MS);
  const deleteBy = new Date(now + (EXPORT_DAYS + DELETE_DAYS) * DAY_MS);

  return (
    <>
      <Card
        title="Close workspace"
        subtitle="Close your school’s Capabble account."
        footer={
          <div className="cb-card-actions">
            <Button type="button" variant="secondary" onClick={openDialog}>
              Close workspace
            </Button>
          </div>
        }
      >
        <p className="cb-muted">
          The workspace stays open for {EXPORT_DAYS} days after you ask, so you
          can download your data. Then it closes and its data is deleted within
          a further {DELETE_DAYS} days. You can cancel any time in the first{" "}
          {EXPORT_DAYS} days.
        </p>
      </Card>

      <Dialog
        open={open}
        onClose={closeDialog}
        tone="danger"
        title="Close this workspace?"
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={closeDialog}
              disabled={submitting}
            >
              Keep workspace
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => handleRequest()}
              disabled={!matches}
              loading={submitting}
            >
              Close workspace
            </Button>
          </>
        }
      >
        <form className="cb-form-section" onSubmit={handleRequest} noValidate>
          <p>
            Everyone at {state?.name || "your school"} can keep using Capabble
            for {EXPORT_DAYS} days, until{" "}
            <span className="cb-strong">{formatDate(exportUntil)}</span>. We
            email you a workspace archive with all your school’s data, and you
            can make a new one from this page until then.
          </p>
          <p>
            After that the workspace closes. We delete its data within a further{" "}
            {DELETE_DAYS} days, by{" "}
            <span className="cb-strong">{formatDate(deleteBy)}</span>.
          </p>
          <p>Fees already paid are not refunded.</p>
          <p className="cb-muted">
            You can cancel the closure from this page any time before{" "}
            {formatDate(exportUntil)}.
          </p>
          <TextField
            id="close-workspace-confirm"
            label={
              <>
                Type <span className="cb-strong">{slug}</span> to confirm
              </>
            }
            hint="Your workspace code"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={typed}
            error={fieldError}
            onChange={(event) => {
              setTyped(event.target.value);
              if (fieldError) setFieldError(undefined);
            }}
          />
        </form>
      </Dialog>
    </>
  );
};

export default CloseWorkspaceCard;
