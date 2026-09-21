export function ForgotPostgresPasswordHelp() {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
      <h3 className="font-semibold text-slate-900">Reset your local PostgreSQL password</h3>
      <p className="mt-2">
        SCHOL cannot recover your PostgreSQL password automatically. Reset it on your machine, then return here
        and use <strong>Update password</strong> with the new value.
      </p>

      <div className="mt-4 space-y-4">
        <div>
          <h4 className="font-medium text-slate-900">Option A — pgAdmin</h4>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>Open pgAdmin and connect to your local server.</li>
            <li>Right-click <strong>Login/Group Roles → postgres → Properties</strong>.</li>
            <li>Open the <strong>Definition</strong> tab, set a new password, and save.</li>
          </ol>
        </div>

        <div>
          <h4 className="font-medium text-slate-900">Option B — psql (command line)</h4>
          <pre className="mt-2 overflow-x-auto rounded bg-white p-3 text-xs text-slate-800">
{`psql -U postgres
ALTER USER postgres WITH PASSWORD 'your_new_password';
\\q`}
          </pre>
        </div>

        <div>
          <h4 className="font-medium text-slate-900">Option C — Windows service reinstall</h4>
          <p className="mt-2">
            If you cannot log in at all, reinstall PostgreSQL or reset the password using the installer&apos;s
            stack builder / service account tools, then update SCHOL with the new password below.
          </p>
        </div>
      </div>
    </div>
  )
}
