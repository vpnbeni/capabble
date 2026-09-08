import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  collectSampleSchool,
  configureAndMigrate,
  fetchSetupStatus,
  resetDatabasePassword,
  testDatabaseConnection,
} from '@/services/api'
import { ForgotPostgresPasswordHelp } from '@/components/setup/ForgotPostgresPasswordHelp'
import { DEFAULT_DATABASE_CONFIG, type DatabaseConfig } from '@/types/setup'
import { CheckCircle2, Database, KeyRound, Loader2, Server } from 'lucide-react'

export function SetupPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [config, setConfig] = useState<DatabaseConfig>(DEFAULT_DATABASE_CONFIG)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [showForgotHelp, setShowForgotHelp] = useState(false)
  const [showResetSection, setShowResetSection] = useState(false)

  const { data: status, refetch } = useQuery({
    queryKey: ['setup-status'],
    queryFn: fetchSetupStatus,
    retry: false,
  })

  useEffect(() => {
    if (location.hash === '#reset-password') {
      setShowResetSection(true)
      setShowForgotHelp(true)
    }
  }, [location.hash])

  const testMutation = useMutation({
    mutationFn: () => testDatabaseConnection(config),
    onSuccess: (result) => {
      setTestResult(result.message)
      if (result.ok) toast.success(result.message)
      else toast.error(result.message)
    },
  })

  const migrateMutation = useMutation({
    mutationFn: () => configureAndMigrate(config),
    onSuccess: (result) => {
      if (result.migration.ok) {
        toast.success('Database configured and migrated')
        refetch()
      } else {
        toast.error(result.migration.message)
      }
    },
    onError: (error: { response?: { data?: { detail?: string } } }) => {
      toast.error(error.response?.data?.detail || 'Setup failed')
    },
  })

  const resetMutation = useMutation({
    mutationFn: () => resetDatabasePassword(config),
    onSuccess: (result) => {
      toast.success(result.message)
      setTestResult(result.message)
      refetch()
    },
    onError: (error: { response?: { data?: { detail?: string } } }) => {
      toast.error(error.response?.data?.detail || 'Password reset failed')
    },
  })

  const collectMutation = useMutation({
    mutationFn: collectSampleSchool,
    onSuccess: (result) => {
      if (result.collection.ok) {
        toast.success(`Collected ${result.collection.school_name}`)
        refetch()
      } else {
        toast.error(`Collection status: ${result.collection.overall_status}`)
      }
    },
    onError: (error: { response?: { data?: { detail?: string } } }) => {
      toast.error(error.response?.data?.detail || 'Collection failed')
    },
  })

  const readyForDirectory = Boolean(
    status?.connection.ok && status?.migrations_ok && (status?.school_count ?? 0) > 0,
  )

  const needsPasswordReset = Boolean(status?.env_file_exists && !status?.connection.ok)

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Developer Setup</h1>
        <p className="mt-1 text-slate-600">
          One-time configuration for the School Intelligence PostgreSQL database.
        </p>
      </div>

      {status && (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatusCard
            label="Connection"
            ok={status.connection.ok}
            detail={status.connection.ok ? 'Connected' : 'Not connected'}
          />
          <StatusCard
            label="Migrations"
            ok={status.migrations_ok}
            detail={status.migrations_ok ? 'Applied' : 'Pending'}
          />
          <StatusCard
            label="Schools"
            ok={(status.school_count ?? 0) > 0}
            detail={`${status.school_count ?? 0} in database`}
          />
        </div>
      )}

      {needsPasswordReset && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          The saved database password is no longer valid. Use{' '}
          <button
            type="button"
            onClick={() => {
              setShowResetSection(true)
              setShowForgotHelp(true)
            }}
            className="font-medium text-primary-700 underline"
          >
            Reset password
          </button>{' '}
          after updating PostgreSQL.
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2 text-slate-900">
          <Database className="h-5 w-5 text-primary-600" />
          <h2 className="text-lg font-semibold">PostgreSQL connection</h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Host" value={config.host} onChange={(v) => setConfig({ ...config, host: v })} />
          <Field
            label="Port"
            value={String(config.port)}
            onChange={(v) => setConfig({ ...config, port: Number(v) || 5432 })}
          />
          <Field label="Username" value={config.username} onChange={(v) => setConfig({ ...config, username: v })} />
          <div>
            <Field
              label="Password"
              type="password"
              value={config.password}
              onChange={(v) => setConfig({ ...config, password: v })}
            />
            <button
              type="button"
              onClick={() => setShowForgotHelp((open) => !open)}
              className="mt-1 text-xs font-medium text-primary-700 hover:underline"
            >
              Forgot password?
            </button>
          </div>
          <Field
            label="Database"
            value={config.database}
            onChange={(v) => setConfig({ ...config, database: v })}
            className="sm:col-span-2"
          />
        </div>

        {showForgotHelp && (
          <div className="mt-4">
            <ForgotPostgresPasswordHelp />
          </div>
        )}

        {status?.database_url_masked && (
          <p className="mt-4 text-xs text-slate-500">
            Current URL: <code>{status.database_url_masked}</code>
          </p>
        )}

        {testResult && (
          <p className={`mt-3 text-sm ${
            testResult.toLowerCase().includes('valid') || testResult.toLowerCase().includes('successful')
              ? 'text-emerald-700'
              : 'text-red-700'
          }`}>
            {testResult}
          </p>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium hover:bg-slate-50"
          >
            {testMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Test connection
          </button>
          <button
            type="button"
            onClick={() => migrateMutation.mutate()}
            disabled={migrateMutation.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            {migrateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save &amp; run migrations
          </button>
        </div>

        <p className="mt-3 text-xs text-slate-500">
          Test connection checks your PostgreSQL credentials. If the database does not exist yet, click{' '}
          <strong>Save &amp; run migrations</strong> to create it automatically.
        </p>
      </div>

      <div
        id="reset-password"
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-slate-900">
            <KeyRound className="h-5 w-5 text-primary-600" />
            <h2 className="text-lg font-semibold">Reset database password</h2>
          </div>
          {!showResetSection && (
            <button
              type="button"
              onClick={() => setShowResetSection(true)}
              className="text-sm font-medium text-primary-700 hover:underline"
            >
              Show
            </button>
          )}
        </div>

        {(showResetSection || needsPasswordReset) && (
          <>
            <p className="text-sm text-slate-600">
              Already configured but changed your PostgreSQL password? Enter the new password above and update
              SCHOL without re-running migrations.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => resetMutation.mutate()}
                disabled={resetMutation.isPending || !config.password}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {resetMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Update password
              </button>
              <button
                type="button"
                onClick={() => setShowForgotHelp(true)}
                className="text-sm font-medium text-primary-700 hover:underline"
              >
                Forgot password?
              </button>
            </div>
          </>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2 text-slate-900">
          <Server className="h-5 w-5 text-primary-600" />
          <h2 className="text-lg font-semibold">Sample school (optional)</h2>
        </div>
        <p className="text-sm text-slate-600">
          Collect the Himalyan golden record from live KYS to populate the directory for development.
        </p>
        <button
          type="button"
          onClick={() => collectMutation.mutate()}
          disabled={collectMutation.isPending || !status?.migrations_ok}
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
        >
          {collectMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Collect Himalyan Public School
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          to="/schools"
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${
            readyForDirectory
              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
              : 'border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          {readyForDirectory && <CheckCircle2 className="h-4 w-4" />}
          Go to School Directory
        </Link>
        <button
          type="button"
          onClick={() => refetch()}
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium hover:bg-slate-50"
        >
          Refresh status
        </button>
        {readyForDirectory && (
          <button
            type="button"
            onClick={() => navigate('/schools')}
            className="text-sm text-primary-700 hover:underline"
          >
            Continue
          </button>
        )}
      </div>
    </div>
  )
}

function StatusCard({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div className={`rounded-lg border p-4 ${ok ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 font-medium ${ok ? 'text-emerald-800' : 'text-slate-800'}`}>{detail}</div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  className = '',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  className?: string
}) {
  return (
    <label className={`block text-sm ${className}`}>
      <span className="mb-1 block text-slate-600">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-200 px-3 py-2"
      />
    </label>
  )
}
