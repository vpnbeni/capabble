import { useNavigate } from 'react-router-dom';
import { ClipboardList } from 'lucide-react';
import { useValidationReport } from '@/hooks/useOnboarding';
import { Badge, Banner, Button, Card, EmptyState, MetricTile, MetricTiles, Page } from '@/components/ui';
import './onboarding.css';

const STATUS = {
  valid: { tone: 'success', label: 'Everything matches', body: 'The candidate lists, Form 66 and attendance sheets agree with each other.' },
  warnings: { tone: 'warning', label: 'Needs review', body: 'Some candidates don’t match between files. Check them before exam day.' },
  errors: { tone: 'danger', label: 'Has errors', body: 'Some files don’t match. Fix the records below, or import the files again.' },
} as const;

interface ClassReport {
  candidateCount: number;
  candidateCompleteness: { totalIssues: number };
  form66Validation: { totalMismatches: number; summary: { rollNumberIssues: number; subjectIssues: number; classIssues: number } };
  attendanceValidation: { totalMismatches: number };
}

function ClassCard({ title, report }: { title: string; report: ClassReport }) {
  const issues = report.candidateCompleteness.totalIssues
    + report.form66Validation.totalMismatches
    + report.attendanceValidation.totalMismatches;
  const f66 = report.form66Validation;
  return (
    <Card title={title}>
      <div className="cb-stack">
        <MetricTiles>
          <MetricTile label="Candidates" value={report.candidateCount.toLocaleString('en-IN')} />
          <MetricTile label="Issues" value={issues.toLocaleString('en-IN')} tone={issues ? 'warning' : 'neutral'} />
        </MetricTiles>
        {f66.totalMismatches > 0 ? (
          <Banner tone="warning" title="Form 66 doesn’t match the candidate list">
            <ul className="ob-list">
              <li>Roll no. mismatches: {f66.summary.rollNumberIssues}</li>
              <li>Subject mismatches: {f66.summary.subjectIssues}</li>
              <li>Class mismatches: {f66.summary.classIssues}</li>
            </ul>
          </Banner>
        ) : null}
      </div>
    </Card>
  );
}

export function ValidationReport() {
  const navigate = useNavigate();
  const { data, isFetching, refetch } = useValidationReport();
  const back = <Button key="back" variant="tertiary" onClick={() => navigate('/onboarding')}>Back to setup</Button>;

  if (!data?.report) {
    return (
      <Page>
        <Card>
          <EmptyState
            icon={ClipboardList}
            title="No import check yet"
            body="Run the check to compare your candidate lists, Form 66 and attendance sheets."
            action={[
              <Button key="run" variant="primary" loading={isFetching} onClick={() => refetch()}>Run import check</Button>,
              back,
            ]}
          />
        </Card>
      </Page>
    );
  }

  const { overallStatus, classX, classXII, summary } = data.report;
  const status = STATUS[overallStatus as keyof typeof STATUS] ?? STATUS.warnings;

  return (
    <Page>
      <div className="cb-stack">
        <Card
          title="Import check"
          subtitle={`${summary.totalCandidates.toLocaleString('en-IN')} candidates, ${summary.totalIssues.toLocaleString('en-IN')} issues`}
          action={<Badge tone={status.tone}>{status.label}</Badge>}
        >
          <div className="cb-stack">
            <p className="cb-muted">{status.body}</p>
            <div className="cb-card-actions">
              <Button variant="secondary" loading={isFetching} onClick={() => refetch()}>Run check again</Button>
              {back}
            </div>
          </div>
        </Card>
        <div className="cb-grid-6-6">
          <ClassCard title="Class 10" report={classX} />
          <ClassCard title="Class 12" report={classXII} />
        </div>
      </div>
    </Page>
  );
}
