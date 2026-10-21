import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, CheckCircle2, ClipboardList } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  useOnboardingStatus,
  useStartOnboarding,
  useCompleteStep,
  useCompleteOnboarding,
  useQueueAttendanceUpload,
} from '@/hooks/useOnboarding';
import type { OnboardingSession } from '@/services/onboardingService';
import {
  Badge,
  Banner,
  Button,
  Card,
  Dialog,
  EmptyState,
  FileField,
  MetricTile,
  MetricTiles,
  Page,
  cx,
} from '@/components/ui';
import './onboarding.css';

// localStorage key for persisting the queued job ID across navigation
const ATTENDANCE_JOB_KEY = 'cntr_attendance_job';

type StepKey = keyof OnboardingSession['steps'];

interface StepConfig {
  number: number;
  title: string;
  description: string;
  fileType: 'pdf' | 'txt';
  stepKey: StepKey;
  /** What one record is called, for "1,240 candidates" */
  noun: string;
  /** If true this step takes two files (Class 10 and Class 12 together) */
  isCombined?: boolean;
}

const STEPS: StepConfig[] = [
  {
    number: 1,
    title: 'Class 10 candidate list',
    description: 'The candidate list PDF CBSE issued for your centre’s Class 10 candidates.',
    fileType: 'pdf',
    stepKey: 'candidateImportX',
    noun: 'candidates',
  },
  {
    number: 2,
    title: 'Class 12 candidate list',
    description: 'The candidate list PDF CBSE issued for your centre’s Class 12 candidates.',
    fileType: 'pdf',
    stepKey: 'candidateImportXII',
    noun: 'candidates',
  },
  {
    number: 3,
    title: 'Form 66, Class 10',
    description: 'The Form 66 text file for Class 10. It lists each candidate’s subjects.',
    fileType: 'txt',
    stepKey: 'form66UploadX',
    noun: 'records',
  },
  {
    number: 4,
    title: 'Form 66, Class 12',
    description: 'The Form 66 text file for Class 12. It lists each candidate’s subjects.',
    fileType: 'txt',
    stepKey: 'form66UploadXII',
    noun: 'records',
  },
  {
    number: 5,
    title: 'Attendance sheets',
    description: 'The attendance sheet PDFs for Class 10 and Class 12. Candidate photos are taken from them.',
    fileType: 'pdf',
    stepKey: 'attendanceUploadX', // used only for completion-check; worker sets both
    noun: 'sheets',
    isCombined: true,
  },
];

const fileKind = (step: StepConfig) => (step.fileType === 'pdf' ? 'PDF' : 'text file');

export function OnboardingWizard() {
  const navigate = useNavigate();
  const { data: statusData, isLoading } = useOnboardingStatus();
  const startOnboarding = useStartOnboarding();
  const completeStep = useCompleteStep();
  const completeOnboarding = useCompleteOnboarding();
  const queueAttendanceUpload = useQueueAttendanceUpload();

  const [currentStep, setCurrentStep] = useState(1);
  // Single-file steps (1–4)
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  // Combined attendance step (step 5)
  const [selectedFileX, setSelectedFileX] = useState<File | null>(null);
  const [selectedFileXII, setSelectedFileXII] = useState<File | null>(null);
  const [isReportOpen, setIsReportOpen] = useState(false);

  const session = statusData?.session;

  // Sync to first incomplete step when session loads
  useEffect(() => {
    if (!session?.steps) return;
    const firstIncomplete = STEPS.findIndex((step) => session.steps[step.stepKey]?.status !== 'completed');
    setCurrentStep(firstIncomplete === -1 ? STEPS.length : firstIncomplete + 1);
  }, [session?.steps]);

  const handleStartOnboarding = useCallback(() => {
    startOnboarding.mutate('initial');
  }, [startOnboarding]);

  // ── Steps 1–4 upload ──────────────────────────────────────────────────────
  const handleUpload = useCallback(() => {
    if (!selectedFile) return;

    const formData = new FormData();
    const step = STEPS[currentStep - 1];
    formData.append(step.fileType === 'pdf' ? 'pdf' : 'txt', selectedFile);

    completeStep.mutate(
      { stepNumber: currentStep, formData },
      {
        onSuccess: () => {
          setSelectedFile(null);
          setCurrentStep(currentStep + 1);
        },
      }
    );
  }, [currentStep, selectedFile, completeStep]);

  // ── Step 5: combined attendance queue ────────────────────────────────────
  const handleQueueAttendance = useCallback(() => {
    if (!selectedFileX || !selectedFileXII) return;

    const formData = new FormData();
    formData.append('pdfX', selectedFileX);
    formData.append('pdfXII', selectedFileXII);

    queueAttendanceUpload.mutate(formData, {
      onSuccess: (data) => {
        // Persist the job ID so Dashboard can show the progress widget
        localStorage.setItem(
          ATTENDANCE_JOB_KEY,
          JSON.stringify({ jobId: data.jobId, enqueuedAt: Date.now() })
        );

        // Mark session complete even though photo processing is still running
        completeOnboarding.mutate(undefined, {
          onSuccess: () => {
            toast.success('Attendance sheets uploaded. Photos are being added in the background.', { duration: 5000 });
            navigate('/dashboard');
          },
        });
      },
    });
  }, [selectedFileX, selectedFileXII, queueAttendanceUpload, completeOnboarding, navigate]);

  const handlePrevious = useCallback(() => {
    setSelectedFile(null);
    setCurrentStep(Math.max(1, currentStep - 1));
  }, [currentStep]);

  const isStepDone = (step: StepConfig) => {
    if (!session?.steps) return false;
    const done = session.steps[step.stepKey]?.status === 'completed';
    return done && (!step.isCombined || session.steps.attendanceUploadXII?.status === 'completed');
  };

  if (isLoading) {
    return (
      <Page>
        <Card>
          <div className="cb-table-state" role="status">
            <span className="cb-spinner" aria-hidden="true" />
            Loading exam centre setup
          </div>
        </Card>
      </Page>
    );
  }

  // ── Not started ──────────────────────────────────────────────────────────
  if (!statusData?.hasSession) {
    return (
      <Page>
        <div className="cb-grid-8-4">
          <Card
            title="Set up your exam centre"
            subtitle="Import the files CBSE sends your centre. You do it once a session, and it takes about ten minutes."
          >
            <div className="cb-stack">
              <ol className="ob-steps">
                {STEPS.map((step) => (
                  <li key={step.stepKey} className="ob-step">
                    <span className="ob-step__mark">{step.number}</span>
                    <div className="ob-step__body">
                      <span className="ob-step__title">{step.title}</span>
                      <span className="ob-step__caption">{step.description}</span>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="cb-card-actions">
                <Button variant="primary" loading={startOnboarding.isPending} onClick={handleStartOnboarding}>
                  Start setup
                </Button>
                <Button variant="tertiary" onClick={() => navigate('/home')}>
                  Not now
                </Button>
              </div>
            </div>
          </Card>
          <Card title="Before you start">
            <div className="cb-stack ob-aside">
              <p className="cb-muted">Keep these files from the CBSE portal ready:</p>
              <ul className="ob-list">
                <li>Candidate list PDFs for Class 10 and Class 12</li>
                <li>Form 66 text files for Class 10 and Class 12</li>
                <li>Attendance sheet PDFs for Class 10 and Class 12</li>
              </ul>
              <p className="cb-subtle">You can stop after any step and pick up where you left off.</p>
            </div>
          </Card>
        </div>
      </Page>
    );
  }

  // ── Done ─────────────────────────────────────────────────────────────────
  if (statusData?.isComplete) {
    return (
      <Page>
        <Card>
          <EmptyState
            icon={CheckCircle2}
            title="Your exam centre is set up"
            body="Candidates, Form 66 and attendance sheets are imported. Next, plan rooms and seating for your exam days."
            action={[
              <Button key="dash" variant="primary" onClick={() => navigate('/dashboard')}>Open exam centre</Button>,
              ...(session?.validationReport
                ? [<Button key="report" variant="secondary" onClick={() => setIsReportOpen(true)}>View import check</Button>]
                : []),
            ]}
          />
        </Card>
        <ImportCheckDialog session={session} open={isReportOpen} onClose={() => setIsReportOpen(false)} />
      </Page>
    );
  }

  // ── In progress ──────────────────────────────────────────────────────────
  const step = STEPS[currentStep - 1];
  const warnings = session?.steps[step.stepKey]?.validationWarnings ?? [];
  const isCombinedStep = step.isCombined === true;
  const isBusy = completeStep.isPending || queueAttendanceUpload.isPending || completeOnboarding.isPending;
  const doneCount = STEPS.filter(isStepDone).length;

  return (
    <Page>
      <div className="cb-grid-8-4">
        <Card
          title={step.title}
          subtitle={`Step ${step.number} of ${STEPS.length}. ${step.description}`}
          footer={(
            <div className="ob-actions">
              <div className="ob-actions__left">
                {currentStep > 1 ? (
                  <Button variant="secondary" onClick={handlePrevious} disabled={isBusy}>Back</Button>
                ) : null}
                <Button variant="tertiary" onClick={() => navigate('/home')}>Finish later</Button>
              </div>
              {isCombinedStep ? (
                <Button
                  variant="primary"
                  loading={isBusy}
                  disabled={!selectedFileX || !selectedFileXII}
                  onClick={handleQueueAttendance}
                >
                  Upload and finish setup
                </Button>
              ) : (
                <Button variant="primary" loading={isBusy} disabled={!selectedFile} onClick={handleUpload}>
                  Upload and continue
                </Button>
              )}
            </div>
          )}
        >
          <div className="cb-stack">
            {warnings.length > 0 ? (
              <Banner tone="warning" title="Check these before you continue">
                <ul className="ob-list">
                  {warnings.map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
              </Banner>
            ) : null}

            {isCombinedStep ? (
              <>
                <FileField
                  label="Class 10 attendance sheets"
                  required
                  accept=".pdf"
                  file={selectedFileX}
                  onChange={setSelectedFileX}
                  placeholder="Drop the Class 10 PDF here or choose it"
                  disabled={isBusy}
                />
                <FileField
                  label="Class 12 attendance sheets"
                  required
                  accept=".pdf"
                  file={selectedFileXII}
                  onChange={setSelectedFileXII}
                  placeholder="Drop the Class 12 PDF here or choose it"
                  disabled={isBusy}
                />
                <Banner tone="info" title="Photos are added in the background">
                  You can keep working once both files are uploaded. A progress card on the exam centre dashboard shows when the photos are ready.
                </Banner>
              </>
            ) : (
              <FileField
                key={step.stepKey}
                label={step.title}
                required
                accept={step.fileType === 'pdf' ? '.pdf' : '.txt'}
                file={selectedFile}
                onChange={setSelectedFile}
                placeholder={`Drop the ${fileKind(step)} here or choose it`}
                hint={step.fileType === 'pdf' ? 'PDF, up to 10 MB' : 'Text file (.txt), up to 10 MB'}
                disabled={isBusy}
              />
            )}
          </div>
        </Card>

        <Card
          title="Setup steps"
          subtitle={`${doneCount} of ${STEPS.length} done`}
          footer={session?.validationReport ? (
            <Button variant="tertiary" size="sm" icon={ClipboardList} onClick={() => setIsReportOpen(true)}>
              View import check
            </Button>
          ) : undefined}
        >
          <ol className="ob-steps">
            {STEPS.map((item) => {
              const done = isStepDone(item);
              const current = item.number === currentStep;
              const count = session?.steps[item.stepKey]?.recordCount;
              return (
                <li key={item.stepKey} className={cx('ob-step', done && 'is-done', current && 'is-current')} aria-current={current ? 'step' : undefined}>
                  <span className="ob-step__mark">{done ? <Check size={14} strokeWidth={2} aria-hidden /> : item.number}</span>
                  <div className="ob-step__body">
                    <span className="ob-step__title">{item.title}</span>
                    {done && typeof count === 'number' ? (
                      <span className="ob-step__caption">{count.toLocaleString('en-IN')} {item.noun}</span>
                    ) : null}
                  </div>
                  {done ? <Badge tone="success">Done</Badge> : current ? <Badge tone="info">Now</Badge> : null}
                </li>
              );
            })}
          </ol>
        </Card>
      </div>

      <ImportCheckDialog session={session} open={isReportOpen} onClose={() => setIsReportOpen(false)} />
    </Page>
  );
}

const REPORT_TONE = { valid: 'success', warnings: 'warning', errors: 'danger' } as const;
const REPORT_LABEL = { valid: 'Everything matches', warnings: 'Needs review', errors: 'Has errors' } as const;

/** What the import found: candidate counts, and the rows that don't match across files. */
function ImportCheckDialog({ session, open, onClose }: { session?: OnboardingSession; open: boolean; onClose: () => void }) {
  const report = session?.validationReport;
  if (!report) return null;
  const sections = [
    { title: 'Form 66 mismatches, Class 10', items: report.form66MismatchesX },
    { title: 'Form 66 mismatches, Class 12', items: report.form66MismatchesXII },
    { title: 'Attendance mismatches, Class 10', items: report.attendanceMismatchesX },
    { title: 'Attendance mismatches, Class 12', items: report.attendanceMismatchesXII },
  ].filter((section) => (section.items?.length ?? 0) > 0);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Import check"
      description="Candidates in each file, and anything that doesn’t match between them."
      size="lg"
      footer={<Button variant="secondary" onClick={onClose}>Close</Button>}
    >
      <div className="cb-stack">
        <div>
          <Badge tone={REPORT_TONE[report.overallStatus]}>{REPORT_LABEL[report.overallStatus]}</Badge>
        </div>
        <MetricTiles>
          <MetricTile label="Class 10 candidates" value={report.candidateCountX?.toLocaleString('en-IN') ?? '—'} />
          <MetricTile label="Class 12 candidates" value={report.candidateCountXII?.toLocaleString('en-IN') ?? '—'} />
        </MetricTiles>
        {sections.length ? sections.map((section) => (
          <MismatchSection key={section.title} title={section.title} items={section.items!} />
        )) : <p className="cb-muted">No mismatches. The imported files agree with each other.</p>}
      </div>
    </Dialog>
  );
}

function MismatchSection({ title, items }: { title: string; items: unknown[] }) {
  return (
    <div className="ob-mismatch">
      <h3 className="cb-form-section__title">{title} ({items.length})</h3>
      <ul className="ob-mismatch__list">
        {items.map((item, i) => (
          <li key={i}>
            {item && typeof item === 'object'
              ? Object.entries(item as Record<string, unknown>).map(([k, v]) => (
                <span key={k} className="ob-mismatch__pair"><span className="cb-subtle">{k}</span> {String(v)}</span>
              ))
              : String(item)}
          </li>
        ))}
      </ul>
    </div>
  );
}
