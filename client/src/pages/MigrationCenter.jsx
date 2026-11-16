import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import Icon from '../theme/Icon';
import { migrationApi } from '../services/migrationApi';
import '../styles/migration-center.css';

const TABS = [
  { id: 'overview', label: 'Overview', icon: 'database' },
  { id: 'export', label: 'Export', icon: 'download' },
  { id: 'import', label: 'Import', icon: 'upload' },
  { id: 'backups', label: 'Backups & recovery', icon: 'shieldCheck' },
  { id: 'history', label: 'History', icon: 'history' },
  { id: 'audit', label: 'Audit log', icon: 'lock' },
];
const STRATEGIES = [
  {
    id: 'skip',
    title: 'Skip duplicates',
    text: 'Add records that are new. Anything that already exists stays exactly as it is.',
    icon: 'layers',
  },
  {
    id: 'merge',
    title: 'Merge records',
    text: 'Add new records and update existing ones with the version from the package.',
    icon: 'refresh',
  },
  {
    id: 'manual',
    title: 'Resolve conflicts manually',
    text: 'Add new records, and choose for each conflict which version to keep.',
    icon: 'check',
  },
  {
    id: 'replace',
    title: 'Replace existing data',
    text: 'Remove all current application data and load the package instead.',
    icon: 'delete',
  },
];
const STATUS = {
  completed: ['Completed', 'ok'],
  completed_with_issues: ['Completed with issues', 'warn'],
  running: ['Running', 'info'],
  analyzing: ['Analysing', 'info'],
  uploaded: ['Uploaded', 'muted'],
  ready: ['Ready to import', 'info'],
  failed: ['Failed', 'bad'],
  interrupted: ['Interrupted', 'warn'],
  discarded: ['Discarded', 'muted'],
};
const ACTIONS = {
  'access.denied': 'Access denied',
  'export.started': 'Export started',
  'export.completed': 'Export completed',
  'export.failed': 'Export failed',
  'export.downloaded': 'Package downloaded',
  'import.uploaded': 'Package uploaded',
  'import.analysis.started': 'Analysis started',
  'import.analysis.completed': 'Analysis completed',
  'import.analysis.failed': 'Analysis failed',
  'import.conflicts.resolved': 'Conflict decisions saved',
  'import.started': 'Import started',
  'import.destructive.confirmed': 'Destructive import confirmed',
  'import.resumed': 'Import resumed',
  'import.completed': 'Import completed',
  'import.failed': 'Import failed',
  'import.discarded': 'Upload discarded',
  'backup.created': 'Backup created and verified',
  'backup.verification_failed': 'Backup verification failed',
  'restore.confirmed': 'Recovery confirmed',
};

const fmt = (value) =>
  value ? new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const bytes = (n) => (n == null ? '—' : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);
const num = (n) => (n ?? 0).toLocaleString('en-IN');
const dbLabel = (db) => (db ? `${db.typeLabel || db.type}${db.database ? ` · ${db.database}` : ''}` : '—');

function StatusBadge({ status }) {
  const [label, tone] = STATUS[status] || [status, 'muted'];
  return <span className={`mc-badge mc-badge-${tone}`}>{label}</span>;
}

function Progress({ value, label }) {
  const pct = Math.max(0, Math.min(100, Math.round(value || 0)));
  return (
    <div className="mc-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="mc-progress-bar" style={{ width: `${pct}%` }} />
      <span>{pct}%</span>
    </div>
  );
}

function Alert({ tone = 'info', children, onClose }) {
  if (!children) return null;
  return (
    <div className={`mc-alert mc-alert-${tone}`} role={tone === 'bad' ? 'alert' : 'status'}>
      <Icon name={tone === 'bad' ? 'error' : tone === 'ok' ? 'success' : 'info'} />
      <div>{children}</div>
      {onClose && (
        <button type="button" className="icon-button" aria-label="Dismiss" onClick={onClose}>
          <Icon name="close" />
        </button>
      )}
    </div>
  );
}

function usePoll(callback, active, interval = 1000) {
  const saved = useRef(callback);
  saved.current = callback;
  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => saved.current(), interval);
    return () => clearInterval(timer);
  }, [active, interval]);
}

// ------------------------------------------------------------------ overview
function Overview({ overview, onRefresh }) {
  if (!overview) return <div className="text-center py-5"><div className="spinner-border" /></div>;
  const databases = overview.databases.filter((d) => d.connected);
  return (
    <>
      <div className="mc-db-grid">
        {overview.databases.map((db) => (
          <div key={db.key} className={`panel mc-db-card${db.connected ? '' : ' is-offline'}`}>
            <div className="mc-db-icon"><Icon name="database" /></div>
            <div>
              <span className="eyebrow">{db.role}</span>
              <h4>{db.typeLabel}</h4>
              <p className="muted mb-1">{db.connected ? `${db.database} · version ${db.version || 'unknown'}` : 'Not reachable right now'}</p>
              {db.connected && (
                <small className="muted">
                  {db.transactions ? 'Supports transactions' : 'Standalone server (single-document atomic writes)'}
                </small>
              )}
            </div>
            <span className={`mc-badge ${db.connected ? 'mc-badge-ok' : 'mc-badge-bad'}`}>{db.connected ? 'Connected' : 'Offline'}</span>
          </div>
        ))}
      </div>
      <section className="panel section-panel mc-section">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">WHAT IS STORED</span>
            <h4>Records by database</h4>
            <p className="muted mb-0">Everything an export includes, counted live.</p>
          </div>
          <button type="button" className="btn btn-light" onClick={onRefresh}>
            <Icon name="refresh" className="me-1" /> Refresh
          </button>
        </div>
        <div className="table-responsive mc-table-wrap">
          <table className="table align-middle mc-table">
            <thead>
              <tr>
                <th>Data</th>
                {databases.map((db) => <th key={db.key} className="text-end">{db.typeLabel}</th>)}
              </tr>
            </thead>
            <tbody>
              {overview.entities.map((entity) => (
                <tr key={entity.name}>
                  <td>{entity.label}</td>
                  {databases.map((db) => (
                    <td key={db.key} className="text-end">{db.counts?.[entity.name] == null ? <span className="muted">n/a</span> : num(db.counts[entity.name])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

// ------------------------------------------------------------------ export
function ExportPanel({ overview, minPassphrase, onDone }) {
  const databases = (overview?.databases || []).filter((d) => d.connected);
  const [source, setSource] = useState('application');
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [job, setJob] = useState(null);
  const tooShort = passphrase.length > 0 && passphrase.length < minPassphrase;
  const mismatch = confirm.length > 0 && confirm !== passphrase;
  const canExport = passphrase.length >= minPassphrase && confirm === passphrase && !busy;

  const run = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setJob(null);
    try {
      const result = await migrationApi.createExport(source, passphrase);
      setJob(result);
      setPassphrase('');
      setConfirm('');
      onDone?.();
    } catch (message) {
      setError(String(message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mc-two-col">
      <form className="panel section-panel mc-section" onSubmit={run}>
        <div className="panel-heading">
          <div>
            <span className="eyebrow">STEP 1</span>
            <h4>Choose what to export</h4>
            <p className="muted mb-0">The whole dataset is included: accounts with their password hashes, settings and every module's records.</p>
          </div>
        </div>
        <div className="mc-body">
          <div className="mc-choice-grid">
            {databases.map((db) => (
              <label key={db.key} className={`mc-choice${source === db.key ? ' is-active' : ''}`}>
                <input type="radio" name="export-source" value={db.key} checked={source === db.key} onChange={() => setSource(db.key)} />
                <Icon name="database" />
                <span>
                  <b>{db.typeLabel}</b>
                  <small>{db.role} · {db.database}</small>
                </span>
              </label>
            ))}
          </div>
          <span className="eyebrow d-block mt-4">STEP 2 · PROTECT THE PACKAGE</span>
          <p className="muted small mb-2">The package is encrypted with this passphrase. Store it somewhere safe: without it the package cannot be imported, and it cannot be recovered.</p>
          <label className="form-label" htmlFor="mc-export-pass">Package passphrase</label>
          <div className="mc-input-row">
            <input id="mc-export-pass" className="form-control" type={show ? 'text' : 'password'} autoComplete="new-password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
            <button type="button" className="icon-button" aria-label={show ? 'Hide passphrase' : 'Show passphrase'} onClick={() => setShow(!show)}>
              <Icon name={show ? 'hide' : 'show'} />
            </button>
          </div>
          {tooShort && <small className="text-danger">Use at least {minPassphrase} characters.</small>}
          <label className="form-label mt-3" htmlFor="mc-export-confirm">Confirm passphrase</label>
          <input id="mc-export-confirm" className="form-control" type={show ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          {mismatch && <small className="text-danger">The passphrases do not match.</small>}
          <Alert tone="bad">{error}</Alert>
          <button className="btn btn-primary mt-4" disabled={!canExport}>
            {busy ? <><span className="spinner-border spinner-border-sm me-2" />Creating package…</> : <><Icon name="download" className="me-1" /> Create export package</>}
          </button>
        </div>
      </form>
      <section className="panel section-panel mc-section">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">RESULT</span>
            <h4>Export package</h4>
          </div>
        </div>
        <div className="mc-body">
          {job ? (
            <>
              <Alert tone="ok">Package created and encrypted. Download it and keep it with its passphrase.</Alert>
              <dl className="mc-facts">
                <dt>File</dt><dd>{job.package?.filename}</dd>
                <dt>Source</dt><dd>{dbLabel(job.source)}</dd>
                <dt>Records</dt><dd>{num(job.totals?.records)}</dd>
                <dt>Size</dt><dd>{bytes(job.package?.bytes)}</dd>
                <dt>Package version</dt><dd>{job.package?.formatVersion}</dd>
                <dt>Package ID</dt><dd className="mc-mono">{job.package?.packageId}</dd>
              </dl>
              <div className="mc-actions">
                <button type="button" className="btn btn-primary" onClick={() => migrationApi.download(`/jobs/${job.id}/package`, job.package.filename).catch((m) => setError(String(m)))}>
                  <Icon name="download" className="me-1" /> Download package
                </button>
                <button type="button" className="btn btn-light" onClick={() => migrationApi.download(`/jobs/${job.id}/report`, `export-report-${job.id}.json`).catch((m) => setError(String(m)))}>
                  Download report
                </button>
              </div>
            </>
          ) : (
            <div className="mc-empty">
              <span><Icon name="download" /></span>
              <b>No package yet</b>
              <p className="muted mb-0">Choose a source, set a passphrase, and create the package. Earlier exports are listed under History.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

// ------------------------------------------------------------------ import wizard
const STEPS = ['Upload', 'Unlock & analyse', 'Review', 'Confirm', 'Progress'];
function stepFor(job) {
  if (!job) return 0;
  if (job.status === 'uploaded' || job.status === 'analyzing' || (job.status === 'failed' && !job.executedAt)) return 1;
  if (job.status === 'ready') return 2;
  return 4;
}

function ConflictList({ jobId, onChanged }) {
  const [entity, setEntity] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(
    () => migrationApi.conflicts(jobId, { entity: entity || undefined, page, pageSize: 10 }).then(setData),
    [jobId, entity, page],
  );
  useEffect(() => {
    load();
  }, [load]);
  if (!data) return <div className="text-center py-4"><div className="spinner-border spinner-border-sm" /></div>;
  if (!Object.keys(data.byEntity).length) return <Alert tone="ok">There are no conflicts to resolve.</Alert>;
  const decide = async (body) => {
    setBusy(true);
    try {
      await migrationApi.decide(jobId, body);
      await load();
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  return (
    <div className="mc-conflicts">
      <div className="mc-conflict-toolbar">
        <select className="form-select" value={entity} onChange={(e) => { setEntity(e.target.value); setPage(1); }} aria-label="Filter conflicts">
          <option value="">All data ({Object.values(data.byEntity).reduce((a, b) => a + b, 0)})</option>
          {Object.entries(data.byEntity).map(([name, count]) => (
            <option key={name} value={name}>{data.items.find((i) => i.entity === name)?.entityLabel || name} ({count})</option>
          ))}
        </select>
        <div className="mc-actions">
          <button type="button" className="btn btn-light" disabled={busy} onClick={() => decide({ bulk: { entity: entity || undefined, choice: 'existing' } })}>Keep all existing</button>
          <button type="button" className="btn btn-light" disabled={busy} onClick={() => decide({ bulk: { entity: entity || undefined, choice: 'incoming' } })}>Use all incoming</button>
        </div>
      </div>
      <p className="muted small">Using the incoming version for {num(data.keepIncoming)} conflict{data.keepIncoming === 1 ? '' : 's'}. Undecided conflicts keep the existing version.</p>
      {data.items.map((conflict) => (
        <article key={conflict.cid} className="mc-conflict">
          <header>
            <span className="mc-badge mc-badge-muted">{conflict.entityLabel}</span>
            {conflict.kind === 'unique' && (
              <span className="mc-badge mc-badge-warn">
                Same {conflict.uniqueFields?.join(' + ')} as a different record
              </span>
            )}
          </header>
          <div className="mc-conflict-sides">
            <label className={`mc-side${conflict.decision !== 'incoming' ? ' is-chosen' : ''}`}>
              <input type="radio" name={conflict.cid} checked={conflict.decision !== 'incoming'} disabled={busy} onChange={() => decide({ decisions: { [conflict.cid]: 'existing' } })} />
              <span><b>Keep existing</b><small>{conflict.existingLabel}</small></span>
            </label>
            <label className={`mc-side${conflict.decision === 'incoming' ? ' is-chosen' : ''}`}>
              <input type="radio" name={conflict.cid} checked={conflict.decision === 'incoming'} disabled={busy} onChange={() => decide({ decisions: { [conflict.cid]: 'incoming' } })} />
              <span><b>Use incoming</b><small>{conflict.incomingLabel}</small></span>
            </label>
          </div>
          {conflict.kind === 'unique' && conflict.entity === 'users' && (
            <p className="mc-note">Using the incoming account replaces the existing account with the same email address, including that account's records (a backup is taken first).</p>
          )}
          <table className="table table-sm mc-diff">
            <thead><tr><th>Field</th><th>Existing</th><th>Incoming</th></tr></thead>
            <tbody>
              {conflict.fields.map((f) => (
                <tr key={f.field}><td>{f.field}</td><td>{f.existing}</td><td>{f.incoming}</td></tr>
              ))}
            </tbody>
          </table>
        </article>
      ))}
      {pages > 1 && (
        <div className="mc-pager">
          <button type="button" className="btn btn-light" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span className="muted">Page {page} of {pages}</span>
          <button type="button" className="btn btn-light" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}

function PlanTable({ plan }) {
  return (
    <div className="table-responsive mc-table-wrap">
      <table className="table align-middle mc-table">
        <thead>
          <tr><th>Data</th><th className="text-end">Add</th><th className="text-end">Update</th><th className="text-end">Remove</th><th className="text-end">Skip</th><th className="text-end">Fail</th></tr>
        </thead>
        <tbody>
          {Object.entries(plan.entities).map(([name, s]) => (
            <tr key={name}>
              <td>{s.label}</td>
              <td className="text-end">{num(s.insert)}</td>
              <td className="text-end">{num(s.update)}</td>
              <td className={`text-end${s.remove ? ' text-danger' : ''}`}>{num(s.remove)}</td>
              <td className="text-end">{num(s.skip)}</td>
              <td className={`text-end${s.fail ? ' text-danger' : ''}`}>{num(s.fail)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ImportWizard({ overview, jobId, setJobId, onChanged }) {
  const { user } = useSelector((s) => s.auth);
  const [job, setJob] = useState(null);
  const [uploadPct, setUploadPct] = useState(null);
  const [error, setError] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [destination, setDestination] = useState('application');
  const [strategy, setStrategy] = useState('skip');
  const [plan, setPlan] = useState(null);
  const [planBusy, setPlanBusy] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const fileRef = useRef(null);
  const maxBytes = overview?.limits?.maxUploadBytes || 0;
  const databases = (overview?.databases || []).filter((d) => d.connected);

  const refresh = useCallback(async () => {
    if (!jobId) return setJob(null);
    const next = await migrationApi.job(jobId);
    setJob(next);
    return next;
  }, [jobId]);
  useEffect(() => {
    setPlan(null);
    setConfirmText('');
    setReviewed(false);
    refresh()
      .then((next) => setStep(stepFor(next)))
      .catch((m) => setError(String(m)));
  }, [jobId]);
  usePoll(
    async () => {
      const next = await refresh().catch(() => null);
      if (next && next.status !== job?.status) {
        setStep((current) => Math.max(current, stepFor(next)));
        onChanged?.();
      }
    },
    Boolean(job && ['analyzing', 'running'].includes(job.status)),
  );

  const loadPlan = useCallback(async () => {
    if (!job || job.status !== 'ready') return;
    setPlanBusy(true);
    try {
      setPlan(await migrationApi.preview(job.id, strategy));
    } catch (m) {
      setError(String(m));
    } finally {
      setPlanBusy(false);
    }
  }, [job?.id, job?.status, strategy]);
  useEffect(() => {
    if (step >= 2) loadPlan();
  }, [loadPlan, step]);

  const upload = async (file) => {
    if (!file) return;
    setError('');
    if (maxBytes && file.size > maxBytes) return setError(`The package is larger than the ${bytes(maxBytes)} upload limit.`);
    setUploadPct(0);
    try {
      const created = await migrationApi.upload(file, setUploadPct);
      setJobId(created.id);
      onChanged?.();
    } catch (m) {
      setError(String(m));
    } finally {
      setUploadPct(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };
  const analyze = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      setJob(await migrationApi.analyze(job.id, passphrase, destination));
      setPassphrase('');
    } catch (m) {
      setError(String(m));
    } finally {
      setBusy(false);
    }
  };
  const execute = async () => {
    setBusy(true);
    setError('');
    try {
      setJob(await migrationApi.execute(job.id, strategy, plan?.destructive ? confirmText : undefined));
      setStep(4);
      onChanged?.();
    } catch (m) {
      setError(String(m));
    } finally {
      setBusy(false);
    }
  };
  const act = (fn) => async () => {
    setBusy(true);
    setError('');
    try {
      setJob(await fn());
      onChanged?.();
    } catch (m) {
      setError(String(m));
    } finally {
      setBusy(false);
    }
  };
  const reset = () => {
    setJobId(null);
    setStep(0);
    setStrategy('skip');
    setError('');
  };

  const summary = job?.analysis?.summary;
  const progress = job?.progress || {};
  const pct = progress.total ? (progress.processed / progress.total) * 100 : job?.status?.startsWith('completed') ? 100 : 0;
  const isRestore = job?.type === 'restore';
  const canConfirm = plan && !plan.blocked && (!plan.destructive || (confirmText === plan.confirmationPhrase && reviewed));

  return (
    <section className="panel section-panel mc-section">
      <ol className="mc-stepper">
        {STEPS.map((label, index) => (
          <li key={label} className={index === step ? 'is-current' : index < step ? 'is-done' : ''}>
            <span>{index < step ? <Icon name="check" /> : index + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      <div className="mc-body">
        <Alert tone="bad" onClose={() => setError('')}>{error}</Alert>

        {step === 0 && (
          <div
            className="mc-drop"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              upload(e.dataTransfer.files?.[0]);
            }}
          >
            <span className="mc-drop-icon"><Icon name="upload" /></span>
            <b>Upload a migration package</b>
            <p className="muted">Drop a SpendWise package (.zip) here, or choose it from your computer. Up to {bytes(maxBytes)}.</p>
            {uploadPct != null ? (
              <div className="mc-drop-progress"><Progress value={uploadPct} label="Upload progress" /><small className="muted">Uploading…</small></div>
            ) : (
              <label className="btn btn-primary mb-0">
                <Icon name="upload" className="me-1" /> Choose package
                <input ref={fileRef} type="file" accept=".zip,application/zip" hidden onChange={(e) => upload(e.target.files?.[0])} />
              </label>
            )}
          </div>
        )}

        {job && step >= 1 && (
          <div className="mc-package">
            <div>
              <span className="eyebrow">{isRestore ? 'RECOVERY' : 'PACKAGE'}</span>
              <h5>{isRestore ? 'Restore from safety backup' : job.upload?.filename}</h5>
              <p className="muted mb-0">
                Source: <b>{dbLabel(job.source)}</b>
                {job.source?.version ? ` (version ${job.source.version})` : ''}
                {job.package ? ` · package v${job.package.formatVersion} · created ${fmt(job.package.createdAt)}` : ''}
                {job.destination ? <> · Destination: <b>{dbLabel(job.destination)}</b></> : null}
              </p>
            </div>
            <StatusBadge status={job.status} />
          </div>
        )}

        {step === 1 && job && (
          <>
            {job.status === 'analyzing' ? (
              <div className="mc-running">
                <b>{job.stage}…</b>
                <Progress value={progress.total ? (progress.processed / progress.total) * 100 : 5} label="Validation progress" />
                <small className="muted">{num(progress.processed)} of {num(progress.total)} records checked</small>
              </div>
            ) : (
              <form onSubmit={analyze} className="mc-form">
                {job.status === 'failed' && <Alert tone="bad">The last analysis failed: {job.error}</Alert>}
                <div className="mc-counts">
                  {Object.entries(job.package?.counts || {}).map(([name, count]) => (
                    <span key={name}><b>{num(count)}</b> {overview?.entities.find((e) => e.name === name)?.label || name}</span>
                  ))}
                </div>
                <label className="form-label" htmlFor="mc-dest">Import into</label>
                <select id="mc-dest" className="form-select" value={destination} onChange={(e) => setDestination(e.target.value)}>
                  {databases.map((db) => <option key={db.key} value={db.key}>{db.typeLabel} · {db.role} ({db.database})</option>)}
                </select>
                <label className="form-label mt-3" htmlFor="mc-import-pass">Package passphrase</label>
                <input id="mc-import-pass" className="form-control" type="password" autoComplete="off" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
                <p className="muted small mt-2">Nothing is changed yet. The package is decrypted on the server, checked record by record, and compared with the destination.</p>
                <div className="mc-actions">
                  <button className="btn btn-primary" disabled={!passphrase || busy}>
                    {busy ? 'Unlocking…' : 'Unlock and analyse'}
                  </button>
                  <button type="button" className="btn btn-light" disabled={busy} onClick={act(async () => { const r = await migrationApi.discard(job.id); reset(); return r; })}>Discard upload</button>
                </div>
              </form>
            )}
          </>
        )}

        {step >= 2 && step <= 3 && job?.status === 'ready' && (
          <>
            {summary && !isRestore && (
              <>
                <h5 className="mc-h">Dry-run analysis</h5>
                <div className="table-responsive mc-table-wrap">
                  <table className="table align-middle mc-table">
                    <thead>
                      <tr>
                        <th>Data</th><th className="text-end">In package</th><th className="text-end">New</th><th className="text-end">Identical</th>
                        <th className="text-end">Conflicts</th><th className="text-end">Invalid</th><th className="text-end">In destination</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(summary).map(([name, s]) => (
                        <tr key={name}>
                          <td>{s.label}{!s.supported && <small className="muted d-block">Not stored by this destination</small>}</td>
                          <td className="text-end">{num(s.inPackage)}</td>
                          <td className="text-end">{num(s.new)}</td>
                          <td className="text-end">{num(s.identical)}</td>
                          <td className={`text-end${s.conflicts ? ' mc-strong' : ''}`}>{num(s.conflicts)}</td>
                          <td className={`text-end${s.invalid ? ' text-danger' : ''}`}>{num(s.invalid)}</td>
                          <td className="text-end">{s.inDestination == null ? '—' : num(s.inDestination)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {job.analysis.invalidCount > 0 && (
                  <details className="mc-details">
                    <summary>{num(job.analysis.invalidCount)} invalid record{job.analysis.invalidCount === 1 ? '' : 's'} will not be imported</summary>
                    <ul>{job.analysis.invalid.map((i) => <li key={`${i.entity}:${i.key}`}><b>{i.entity}</b> {i.key}: {i.reason}</li>)}</ul>
                  </details>
                )}
              </>
            )}

            {step === 2 && (
              <>
                <h5 className="mc-h">How should the data be imported?</h5>
                <div className="mc-strategy-grid">
                  {(isRestore ? STRATEGIES.filter((s) => s.id === 'replace') : STRATEGIES).map((s) => (
                    <label key={s.id} className={`mc-choice mc-strategy${strategy === s.id ? ' is-active' : ''}${s.id === 'replace' ? ' is-danger' : ''}`}>
                      <input type="radio" name="strategy" value={s.id} checked={strategy === s.id} onChange={() => setStrategy(s.id)} />
                      <Icon name={s.icon} />
                      <span><b>{s.title}</b><small>{s.text}</small></span>
                    </label>
                  ))}
                </div>
                {strategy === 'manual' && (
                  <>
                    <h5 className="mc-h">Resolve conflicts</h5>
                    <ConflictList jobId={job.id} onChanged={loadPlan} />
                  </>
                )}
              </>
            )}

            <h5 className="mc-h">Preview: what will happen</h5>
            {planBusy && !plan ? (
              <div className="text-center py-3"><div className="spinner-border spinner-border-sm" /></div>
            ) : plan ? (
              <>
                <div className="mc-totals">
                  <span><b>{num(plan.totals.insert)}</b> to add</span>
                  <span><b>{num(plan.totals.update)}</b> to update</span>
                  <span className={plan.totals.remove ? 'is-danger' : ''}><b>{num(plan.totals.remove)}</b> to remove</span>
                  <span><b>{num(plan.totals.skip)}</b> to skip</span>
                  <span className={plan.totals.fail ? 'is-danger' : ''}><b>{num(plan.totals.fail)}</b> will fail</span>
                </div>
                <PlanTable plan={plan} />
                {plan.warnings.map((w) => <Alert key={w} tone="warn">{w}</Alert>)}
              </>
            ) : null}

            {step === 2 && plan && (
              <div className="mc-actions mt-3">
                <button type="button" className="btn btn-primary" disabled={!plan || plan.blocked || planBusy} onClick={() => setStep(3)}>
                  Continue to confirmation <Icon name="arrowRight" className="ms-1" />
                </button>
                {!isRestore && (
                  <button type="button" className="btn btn-light" disabled={busy} onClick={act(async () => { const r = await migrationApi.discard(job.id); reset(); return r; })}>Discard upload</button>
                )}
              </div>
            )}

            {step === 3 && plan && (
              <div className="mc-confirm">
                {plan.destructive ? (
                  <>
                    <Alert tone="warn">
                      This import changes or removes existing data in <b>{dbLabel(job.destination)}</b>
                      {overview?.environment === 'production' ? ', which is a production database' : ''}. A complete backup is
                      taken and verified automatically before anything changes, and you can restore it from Backups &amp; recovery.
                    </Alert>
                    <label className="form-label" htmlFor="mc-confirm">Type <b className="mc-mono">{plan.confirmationPhrase}</b> to confirm</label>
                    <input id="mc-confirm" className="form-control" autoComplete="off" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
                    <label className="mc-check">
                      <input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />
                      I have reviewed the preview above.
                    </label>
                  </>
                ) : (
                  <Alert tone="ok">This import only adds new records. Existing data is not changed or removed.</Alert>
                )}
                <div className="mc-actions">
                  <button type="button" className={`btn ${plan.destructive ? 'btn-danger' : 'btn-primary'}`} disabled={!canConfirm || busy} onClick={execute}>
                    {busy ? 'Starting…' : isRestore ? 'Start recovery' : 'Start import'}
                  </button>
                  <button type="button" className="btn btn-light" disabled={busy} onClick={() => setStep(2)}>Back</button>
                </div>
                <p className="muted small mt-2">Signed in as {user?.email}. Your decision is recorded in the audit log.</p>
              </div>
            )}
          </>
        )}

        {step === 4 && job && (
          <div className="mc-running">
            <div className="mc-running-head">
              <div>
                <b>{job.stage}</b>
                <small className="muted d-block">{isRestore ? 'Recovery' : `Strategy: ${STRATEGIES.find((s) => s.id === job.strategy)?.title || job.strategy}`}</small>
              </div>
              <StatusBadge status={job.status} />
            </div>
            <Progress value={pct} label="Import progress" />
            <div className="mc-totals">
              <span><b>{num(progress.processed)}</b> of {num(progress.total)} processed</span>
              <span><b>{num((progress.inserted || 0) + (progress.updated || 0))}</b> imported ({num(progress.inserted)} added, {num(progress.updated)} updated)</span>
              <span><b>{num(progress.removed)}</b> removed</span>
              <span><b>{num(progress.skipped)}</b> skipped</span>
              <span className={progress.failed ? 'is-danger' : ''}><b>{num(progress.failed)}</b> failed</span>
            </div>
            {job.status === 'interrupted' && (
              <Alert tone="warn">
                The import was interrupted (for example by a server restart). It saved a checkpoint at <b>{job.checkpoint?.stage}</b>; resuming
                continues from there without repeating completed work.
                <div className="mt-2"><button type="button" className="btn btn-primary" disabled={busy} onClick={act(() => migrationApi.resume(job.id))}>Resume import</button></div>
              </Alert>
            )}
            {job.status === 'failed' && (
              <Alert tone="bad">
                The import failed: {job.error}. {job.backupId ? 'A verified backup was taken before any change, so you can restore it from Backups & recovery.' : 'No changes were made.'}
              </Alert>
            )}
            {job.status?.startsWith('completed') && (
              <>
                <Alert tone={job.status === 'completed' ? 'ok' : 'warn'}>
                  {isRestore ? 'Recovery' : 'Import'} finished. {num(job.verification?.verified)} written record{job.verification?.verified === 1 ? ' was' : 's were'} read back and verified
                  {job.verification?.mismatched ? `; ${num(job.verification.mismatched)} did not match` : ''}.
                  {job.backupId ? ' The pre-import backup stays available under Backups & recovery.' : ''}
                </Alert>
                {job.warnings?.map((w) => <Alert key={w} tone="warn">{w}</Alert>)}
              </>
            )}
            <div className="mc-actions">
              {job.files?.report && (
                <button type="button" className="btn btn-light" onClick={() => migrationApi.download(`/jobs/${job.id}/report`, `${job.type}-report-${job.id}.json`).catch((m) => setError(String(m)))}>
                  <Icon name="download" className="me-1" /> Download report
                </button>
              )}
              {['completed', 'completed_with_issues', 'failed'].includes(job.status) && (
                <button type="button" className="btn btn-primary" onClick={reset}>Start another import</button>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ backups
function Backups({ onRestored }) {
  const [list, setList] = useState(null);
  const [target, setTarget] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = () => migrationApi.backups().then(setList).catch((m) => setError(String(m)));
  useEffect(() => {
    load();
  }, []);
  const phrase = target ? `RESTORE ${target.destination?.database || target.destination?.typeLabel}` : '';
  const restore = async () => {
    setBusy(true);
    setError('');
    try {
      const job = await migrationApi.restore(target.id, text);
      setTarget(null);
      setText('');
      onRestored(job.id);
    } catch (m) {
      setError(String(m));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel section-panel mc-section">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">AUTOMATIC SAFETY COPIES</span>
          <h4>Backups &amp; recovery</h4>
          <p className="muted mb-0">A complete, verified backup is taken before every import that changes or removes data. Restoring one puts the database back exactly as it was.</p>
        </div>
      </div>
      <div className="mc-body">
        <Alert tone="bad" onClose={() => setError('')}>{error}</Alert>
        {!list ? (
          <div className="text-center py-4"><div className="spinner-border spinner-border-sm" /></div>
        ) : list.length ? (
          <div className="table-responsive mc-table-wrap">
            <table className="table align-middle mc-table">
              <thead><tr><th>Taken</th><th>Database</th><th>Reason</th><th className="text-end">Records</th><th>Status</th><th /></tr></thead>
              <tbody>
                {list.map((b) => (
                  <tr key={b.id}>
                    <td>{fmt(b.createdAt)}</td>
                    <td>{dbLabel(b.destination)}</td>
                    <td>{b.reason}</td>
                    <td className="text-end">{num(b.totalRecords)}</td>
                    <td>{b.available ? <span className="mc-badge mc-badge-ok">Verified</span> : <span className="mc-badge mc-badge-bad">Unavailable</span>}</td>
                    <td className="text-end">
                      <button type="button" className="btn btn-light btn-sm" disabled={!b.available} onClick={() => { setTarget(b); setText(''); }}>
                        <Icon name="undo" className="me-1" /> Restore
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mc-empty"><span><Icon name="shieldCheck" /></span><b>No backups yet</b><p className="muted mb-0">They appear here automatically before imports that change existing data.</p></div>
        )}
        {target && (
          <div className="mc-confirm mt-3">
            <Alert tone="warn">
              Restoring replaces the current data in <b>{dbLabel(target.destination)}</b> with the backup from {fmt(target.createdAt)} ({num(target.totalRecords)} records).
              The current data is backed up first, so this can be undone too.
            </Alert>
            <label className="form-label" htmlFor="mc-restore">Type <b className="mc-mono">{phrase}</b> to confirm</label>
            <input id="mc-restore" className="form-control" autoComplete="off" value={text} onChange={(e) => setText(e.target.value)} />
            <div className="mc-actions">
              <button type="button" className="btn btn-danger" disabled={text !== phrase || busy} onClick={restore}>{busy ? 'Starting…' : 'Restore backup'}</button>
              <button type="button" className="btn btn-light" disabled={busy} onClick={() => setTarget(null)}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ history
function History({ jobs, onOpen }) {
  const [error, setError] = useState('');
  if (!jobs) return <div className="text-center py-5"><div className="spinner-border" /></div>;
  const records = (job) =>
    job.type === 'export' ? job.totals?.records : job.progress ? (job.progress.inserted || 0) + (job.progress.updated || 0) : job.package ? Object.values(job.package.counts || {}).reduce((a, b) => a + b, 0) : null;
  return (
    <section className="panel section-panel mc-section">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">EVERY EXPORT, IMPORT AND RECOVERY</span>
          <h4>Migration history</h4>
        </div>
      </div>
      <div className="mc-body">
        <Alert tone="bad" onClose={() => setError('')}>{error}</Alert>
        {jobs.length ? (
          <div className="table-responsive mc-table-wrap">
            <table className="table align-middle mc-table">
              <thead><tr><th>Date</th><th>Type</th><th>Source → destination</th><th>Administrator</th><th className="text-end">Records</th><th>Result</th><th /></tr></thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id}>
                    <td>{fmt(job.createdAt)}</td>
                    <td className="text-capitalize">{job.type}{job.strategy ? <small className="muted d-block">{STRATEGIES.find((s) => s.id === job.strategy)?.title}</small> : null}</td>
                    <td>{dbLabel(job.source)}{job.type !== 'export' && <> → {dbLabel(job.destination)}</>}</td>
                    <td>{job.executedBy?.email || job.createdBy?.email}</td>
                    <td className="text-end">{records(job) == null ? '—' : num(records(job))}</td>
                    <td><StatusBadge status={job.status} /></td>
                    <td className="text-end mc-row-actions">
                      {job.type === 'export' && job.status === 'completed' && (
                        <button type="button" className="icon-button" title="Download package" aria-label="Download package" onClick={() => migrationApi.download(`/jobs/${job.id}/package`, job.package?.filename || 'package.zip').catch((m) => setError(String(m)))}>
                          <Icon name="download" />
                        </button>
                      )}
                      {job.files?.report && (
                        <button type="button" className="icon-button" title="Download report" aria-label="Download report" onClick={() => migrationApi.download(`/jobs/${job.id}/report`, `${job.type}-report-${job.id}.json`).catch((m) => setError(String(m)))}>
                          <Icon name="reports" />
                        </button>
                      )}
                      {job.type !== 'export' && job.status !== 'discarded' && (
                        <button type="button" className="btn btn-light btn-sm" onClick={() => onOpen(job.id)}>Open</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mc-empty"><span><Icon name="history" /></span><b>No migrations yet</b><p className="muted mb-0">Exports and imports will be listed here.</p></div>
        )}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ audit
function AuditLog() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  useEffect(() => {
    migrationApi.audit(page).then(setData).catch(() => setData({ items: [], total: 0, pageSize: 50 }));
  }, [page]);
  if (!data) return <div className="text-center py-5"><div className="spinner-border" /></div>;
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const describe = (details) =>
    Object.entries(details || {})
      .filter(([, v]) => v !== null && v !== undefined && typeof v !== 'object')
      .map(([k, v]) => `${k}: ${v}`)
      .join(' · ');
  return (
    <section className="panel section-panel mc-section">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">ADMINISTRATIVE ACTIONS</span>
          <h4>Audit log</h4>
          <p className="muted mb-0">Every export, download, import decision, destructive confirmation, backup and denied access attempt.</p>
        </div>
      </div>
      <div className="mc-body">
        <ul className="mc-audit">
          {data.items.map((entry) => (
            <li key={entry.id} className={/denied|failed|destructive|restore/.test(entry.action) ? 'is-important' : ''}>
              <time>{fmt(entry.at)}</time>
              <div>
                <b>{ACTIONS[entry.action] || entry.action}</b>
                <small className="muted d-block">{entry.actor?.email} {describe(entry.details) && `· ${describe(entry.details)}`}</small>
              </div>
            </li>
          ))}
        </ul>
        {pages > 1 && (
          <div className="mc-pager">
            <button type="button" className="btn btn-light" disabled={page <= 1} onClick={() => setPage(page - 1)}>Newer</button>
            <span className="muted">Page {page} of {pages}</span>
            <button type="button" className="btn btn-light" disabled={page >= pages} onClick={() => setPage(page + 1)}>Older</button>
          </div>
        )}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ page
export default function MigrationCenter() {
  const [access, setAccess] = useState(null);
  const [tab, setTab] = useState('overview');
  const [overview, setOverview] = useState(null);
  const [jobs, setJobs] = useState(null);
  const [importJobId, setImportJobId] = useState(null);
  const [error, setError] = useState('');

  const loadOverview = useCallback(() => migrationApi.overview().then(setOverview).catch((m) => setError(String(m))), []);
  const loadJobs = useCallback(() => migrationApi.jobs().then(setJobs).catch(() => {}), []);
  useEffect(() => {
    migrationApi
      .access()
      .then((result) => {
        setAccess(result);
        if (result.isAdmin) {
          loadOverview();
          loadJobs();
        }
      })
      .catch((m) => setError(String(m)));
  }, []);
  // Pick up an import that is still in progress (or waiting for a decision) after a page reload.
  useEffect(() => {
    if (importJobId || !jobs) return;
    const open = jobs.find(
      (j) => ['import', 'restore'].includes(j.type) && ['uploaded', 'analyzing', 'ready', 'running', 'interrupted'].includes(j.status),
    );
    if (open) setImportJobId(open.id);
  }, [jobs]);
  const changed = () => {
    loadJobs();
    loadOverview();
  };
  const activeJobs = useMemo(() => (jobs || []).filter((j) => ['running', 'analyzing', 'interrupted'].includes(j.status)), [jobs]);

  if (!access) {
    return error ? <Alert tone="bad">{error}</Alert> : <div className="text-center py-5"><div className="spinner-border" /></div>;
  }
  if (!access.isAdmin) {
    return (
      <section className="panel section-panel mc-section mc-denied">
        <span className="mc-drop-icon"><Icon name="lock" /></span>
        <h4>Administrator access required</h4>
        <p className="muted mb-0">
          The Database Migration &amp; Portability Center is available to administrators only.
          {!access.configured && ' No administrators are configured on this server yet.'}
        </p>
      </section>
    );
  }

  return (
    <>
      <div className="page-heading section-hero mc-hero">
        <div>
          <span className="eyebrow">ADMINISTRATION</span>
          <h1>Database Migration &amp; Portability Center</h1>
          <p className="muted">Export, import and move the complete SpendWise dataset between databases, safely, from your browser.</p>
        </div>
        {overview && (
          <span className={`mc-badge ${overview.environment === 'production' ? 'mc-badge-bad' : 'mc-badge-muted'}`}>
            {overview.environment === 'production' ? 'Production' : 'Development'} environment
          </span>
        )}
      </div>

      <Alert tone="bad" onClose={() => setError('')}>{error}</Alert>
      {activeJobs.length > 0 && tab !== 'import' && (
        <Alert tone={activeJobs.some((j) => j.status === 'interrupted') ? 'warn' : 'info'}>
          {activeJobs.some((j) => j.status === 'interrupted') ? 'An import was interrupted and can be resumed.' : 'A migration is in progress.'}{' '}
          <button type="button" className="mc-link" onClick={() => { setImportJobId(activeJobs[0].id); setTab('import'); }}>Open it</button>
        </Alert>
      )}

      <div className="mc-tabs" role="tablist" aria-label="Migration center sections">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-label={t.label} title={t.label} aria-selected={tab === t.id} className={tab === t.id ? 'active' : ''} onClick={() => { setTab(t.id); if (t.id === 'history') loadJobs(); }}>
            <Icon name={t.icon} />
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {tab === 'overview' && <Overview overview={overview} onRefresh={loadOverview} />}
      {tab === 'export' && <ExportPanel overview={overview} minPassphrase={overview?.limits?.minPassphrase || 12} onDone={changed} />}
      {tab === 'import' && <ImportWizard overview={overview} jobId={importJobId} setJobId={setImportJobId} onChanged={changed} />}
      {tab === 'backups' && <Backups onRestored={(id) => { setImportJobId(id); setTab('import'); changed(); }} />}
      {tab === 'history' && <History jobs={jobs} onOpen={(id) => { setImportJobId(id); setTab('import'); }} />}
      {tab === 'audit' && <AuditLog />}
    </>
  );
}
