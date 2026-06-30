'use client';

import React, { useRef, useState } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Cpu,
  Database,
  Download,
  FileCode2,
  GitCompare,
  HardDrive,
  Info,
  Layers,
  LockKeyhole,
  Play,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  Upload,
} from 'lucide-react';
import type {
  DiffHunk,
  DiffResult,
  DiffLine,
  PipelineStatus,
} from '@/lib/types';

const SAMPLE_TERRAFORM = `# TerraPilot Hackathon Demo Manifest
# Provider configuration for Alibaba Cloud (Alicloud)
provider "alicloud" {
  region = "cn-hangzhou"
}

# Expensive high-memory DB Instance for Dev environment
resource "alicloud_db_instance" "postgres_db" {
  engine           = "PostgreSQL"
  engine_version   = "15.0"
  instance_class   = "pg.r6.4xlarge" # Extremely expensive high-memory class
  allocated_storage = 500
  instance_name    = "dev-pg-database"

  tags = {
    environment = "dev"
    owner       = "team-platform"
  }
}

# Expensive ECS instance for Dev environment
resource "alicloud_instance" "app_server" {
  availability_zone = "cn-hangzhou-i"
  instance_name     = "dev-app-server"
  instance_type     = "ecs.r6.4xlarge" # Overprovisioned instance type for Dev
  image_id          = "ubuntu_22_04_x64_20G_alibase_20230515.vhd"

  tags = {
    environment = "dev"
  }
}

# Disk without auto-cleanup/delete-with-instance flag
resource "alicloud_disk" "data_disk" {
  availability_zone = "cn-hangzhou-i"
  category          = "cloud_essd"
  size              = 1000 # 1 TB storage

  tags = {
    environment = "dev"
  }
}

# Security group opening port 22 to public internet
resource "alicloud_security_group_rule" "allow_ssh" {
  type              = "ingress"
  ip_protocol       = "tcp"
  nic_type          = "internet"
  policy            = "accept"
  port_range        = "22/22"
  priority          = 1
  security_group_id = "sg-12345"
  cidr_ip           = "0.0.0.0/0" # Security Risk: SSH open to world
}
`;

interface Finding {
  resource: string;
  issue: string;
  severity: 'critical' | 'warning' | 'info';
  current: string;
  recommended: string;
  costSavings: number;
  rationale: string;
}

interface AnalyzeResponse {
  summary: string;
  estimatedSavings: number;
  findings: Finding[];
  optimized_terraform: string;
  diff: DiffResult;
  proposalToken: string;
  contentHash: string;
  pipelineStatus: PipelineStatus;
  planLogs: string[];
  _debug?: string;
}

const ANALYSIS_STEPS = ['Parse HCL', 'Map resources', 'Reason with Qwen', 'Price deltas', 'Write optimized HCL'];

const PREVIEW_FINDINGS: Finding[] = [
  {
    resource: 'Compute rightsizing',
    issue: 'alicloud_instance / app_server',
    severity: 'warning',
    current: 'ecs.r6.4xlarge',
    recommended: 'ecs.g7.large',
    costSavings: 342,
    rationale: 'Run analysis to replace this preview with Qwen Cloud reasoning.',
  },
  {
    resource: 'Database class',
    issue: 'alicloud_db_instance / postgres_db',
    severity: 'warning',
    current: 'pg.r6.4xlarge',
    recommended: 'pg.g7.large',
    costSavings: 486,
    rationale: 'Run analysis to replace this preview with Qwen Cloud reasoning.',
  },
  {
    resource: 'SSH exposure',
    issue: 'security_group_rule / allow_ssh',
    severity: 'critical',
    current: '0.0.0.0/0',
    recommended: '10.0.0.0/8',
    costSavings: 0,
    rationale: 'Run analysis to replace this preview with Qwen Cloud reasoning.',
  },
];

export default function Dashboard() {
  const [terraformCode, setTerraformCode] = useState(SAMPLE_TERRAFORM);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'findings' | 'diff'>('findings');
  const [logs, setLogs] = useState<string[]>(['Ready for analysis.']);
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus>('idle');
  const [pipelineBusy, setPipelineBusy] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const findings = result?.findings ?? PREVIEW_FINDINGS;
  const progressPercent = result ? 100 : loading ? (loadingStep + 1) * 20 : 0;
  const criticalCount = result?.findings.filter((finding) => finding.severity === 'critical').length ?? 1;
  const warningCount = result?.findings.filter((finding) => finding.severity === 'warning').length ?? 2;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) setTerraformCode(event.target.result as string);
    };
    reader.readAsText(file);
  };

  const startAnalysis = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setActiveTab('findings');
    setLoadingStep(0);
    setPipelineStatus('analyzing');
    setPipelineBusy(false);
    setLogs(['Analysis queued from workspace: main.tf']);

    const timer = setInterval(() => {
      setLoadingStep((prev) => {
        if (prev < ANALYSIS_STEPS.length - 1) return prev + 1;
        clearInterval(timer);
        return prev;
      });
    }, 850);

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ terraformCode }),
      });
      const data = (await res.json()) as AnalyzeResponse;
      if (!res.ok) throw new Error(data._debug || (data as { error?: string }).error || 'Failed to analyze code');

      setResult(data);
      setPipelineStatus('proposed');
      setLogs(['Analysis complete.', `Optimization brief generated (token ${data.proposalToken.slice(0, 8)}…).`, ...data.planLogs, '', 'Awaiting human approval.']);
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'An unexpected error occurred during analysis.');
      setPipelineStatus('failed');
      setLogs((prev) => [...prev, 'Analysis interrupted. Check credentials or fallback mode.']);
    } finally {
      clearInterval(timer);
      setLoading(false);
    }
  };

  const approvePlan = async () => {
    if (!result?.proposalToken) return;
    setPipelineBusy(true);
    try {
      const res = await fetch('/api/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: result.proposalToken }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || 'Approval failed');
      }
      setPipelineStatus('approved');
      setLogs((prev) => [...prev, `[HITL] Plan approved by operator at ${new Date().toLocaleTimeString()}.`, 'Approved changes ready to apply.']);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approval failed');
    } finally {
      setPipelineBusy(false);
    }
  };

  const applyChanges = async () => {
    if (!result?.proposalToken) return;
    setPipelineBusy(true);
    setPipelineStatus('applying');
    setLogs((prev) => [...prev, '[HITL] Approval token verified. Launching apply simulation…']);
    try {
      const res = await fetch('/api/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: result.proposalToken }),
      });
      const body = (await res.json().catch(() => ({}))) as { logs?: string[]; error?: string };
      if (!res.ok) throw new Error(body.error || 'Apply failed');
      setPipelineStatus('applied');
      setLogs((prev) => [...prev, ...(body.logs ?? []), '', '[TerraPilot] Apply simulation verified. No production resources changed.']);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Apply failed');
      setPipelineStatus('approved');
    } finally {
      setPipelineBusy(false);
    }
  };

  const copyToClipboard = () => {
    if (!result?.optimized_terraform) return;
    navigator.clipboard.writeText(result.optimized_terraform);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="min-h-screen bg-[#fafafa] text-[#111318]">
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="rounded-3xl border border-[#e8e8ee] bg-white px-5 py-5 shadow-sm sm:px-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[#111318] text-white">
                  <Sparkles className="h-5 w-5" />
                </div>
                <span className="rounded-full bg-[#f4f0ff] px-3 py-1 text-xs font-bold text-[#5b2eea]">Qwen Cloud HITL</span>
              </div>
              <h1 className="text-4xl font-black tracking-[-0.055em] sm:text-5xl">TerraPilot</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#606571]">
                Paste Terraform, review FinOps and security recommendations, then approve and apply through a human-in-the-loop checkpoint.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-xl border border-[#dedee7] bg-white px-4 py-3 text-sm font-semibold transition hover:border-[#cacad6] hover:bg-[#fbfbfd]"
              >
                <Upload className="h-4 w-4" />
                Upload .tf
              </button>
              <input ref={fileInputRef} type="file" onChange={handleFileUpload} accept=".tf" className="hidden" />
              <button
                onClick={copyToClipboard}
                disabled={!result}
                className="inline-flex items-center gap-2 rounded-xl border border-[#6f3ff5] bg-white px-4 py-3 text-sm font-bold text-[#5b2eea] transition hover:bg-[#faf7ff] disabled:pointer-events-none disabled:opacity-40"
              >
                {copied ? <Check className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                {copied ? 'Copied' : 'Export'}
                <ChevronDown className="h-4 w-4" />
              </button>
              <button
                onClick={startAnalysis}
                disabled={loading || !terraformCode.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-[#7446f3] px-5 py-3 text-sm font-bold text-white shadow-[0_10px_22px_rgba(116,70,243,0.22)] transition hover:bg-[#6535e8] disabled:pointer-events-none disabled:opacity-55"
              >
                {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {loading ? ANALYSIS_STEPS[loadingStep] : 'Analyze'}
              </button>
            </div>
          </div>

          <div className="mt-6">
            <PipelineStepper status={pipelineStatus} />
            <div className="mt-5 h-7 overflow-hidden rounded-md bg-[#eee7ff]">
              <div className="h-full bg-[#7446f3] transition-all duration-700" style={{ width: `${Math.max(progressPercent, 8)}%` }} />
            </div>
            <div className="mt-3 flex flex-wrap gap-x-7 gap-y-2 text-sm text-[#606571]">
              <span><b className="mr-2 text-lg text-[#111318]">{result?.findings.length ?? 0}</b>findings</span>
              <span><b className="mr-2 text-lg text-[#7446f3]">{warningCount}</b>warnings</span>
              <span><b className="mr-2 text-lg text-[#d7522a]">{criticalCount}</b>critical</span>
              <span><b className="mr-2 text-lg text-[#159557]">${result?.estimatedSavings.toFixed(0) ?? 0}</b>/ mo savings</span>
            </div>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,0.94fr)_minmax(420px,1fr)]">
          <div className="rounded-3xl border border-[#e8e8ee] bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-[#ececf1] px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#f4f0ff] text-[#5b2eea]">
                  <FileCode2 className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-black tracking-[-0.025em]">main.tf</h2>
                  <p className="text-sm text-[#6f7480]">Terraform source</p>
                </div>
              </div>
              <button
                onClick={() => setTerraformCode(SAMPLE_TERRAFORM)}
                className="rounded-xl border border-[#dedee7] px-3 py-2 text-sm font-semibold text-[#606571] transition hover:bg-[#f7f7fa]"
              >
                Reset
              </button>
            </div>
            <textarea
              value={terraformCode}
              onChange={(e) => setTerraformCode(e.target.value)}
              className="h-[560px] w-full resize-none rounded-b-3xl border-0 bg-[#fbfcfe] p-5 font-mono text-[12px] leading-6 text-[#222733] outline-none focus:ring-0"
            />
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            {error && (
              <div className="rounded-2xl border border-[#ffd9d9] bg-[#fff4f4] p-4 text-sm text-[#b42318]">
                <ShieldAlert className="mr-2 inline h-4 w-4" />
                {error}
              </div>
            )}

            <div className="rounded-3xl border border-[#e8e8ee] bg-white shadow-sm">
              <div className="flex items-center justify-between gap-3 border-b border-[#ececf1] px-5 py-4">
                <div>
                  <h2 className="font-black tracking-[-0.025em]">Optimization brief</h2>
                  <p className="text-sm text-[#6f7480]">{result ? result.summary : 'Preview cards show what the agent will report.'}</p>
                </div>
                <div className="flex rounded-xl bg-[#f0f0f2] p-1">
                  <button
                    onClick={() => setActiveTab('findings')}
                    className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${activeTab === 'findings' ? 'bg-white text-[#5b2eea] shadow-sm' : 'text-[#606571]'}`}
                  >
                    Findings
                  </button>
                  <button
                    onClick={() => setActiveTab('diff')}
                    className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${activeTab === 'diff' ? 'bg-white text-[#5b2eea] shadow-sm' : 'text-[#606571]'}`}
                  >
                    Diff
                  </button>
                </div>
              </div>

              {activeTab === 'findings' ? (
                <div className="grid gap-3 p-4 xl:grid-cols-2">
                  {findings.map((finding, idx) => (
                    <FindingCard key={`${finding.resource}-${idx}`} finding={finding} />
                  ))}
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between border-b border-[#ececf1] px-5 py-3">
                    <div className="flex items-center gap-2 text-sm font-bold">
                      <GitCompare className="h-4 w-4 text-[#7446f3]" />
                      optimized_main.tf
                      {result && (
                        <span className="ml-2 rounded-full bg-[#eef6ee] px-2 py-0.5 text-[10px] font-bold text-[#159557]">
                          +{result.diff.added} −{result.diff.removed}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={copyToClipboard}
                      disabled={!result}
                      className="inline-flex items-center gap-2 rounded-lg border border-[#dedee7] px-3 py-2 text-sm font-semibold transition hover:bg-[#f7f7fa] disabled:pointer-events-none disabled:opacity-40"
                    >
                      {copied ? <Check className="h-4 w-4 text-[#159557]" /> : <Copy className="h-4 w-4" />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <div className="max-h-[430px] overflow-auto bg-[#fbfcfe] p-2">
                    {result ? (
                      <DiffView diff={result.diff} />
                    ) : (
                      <div className="p-4 font-mono text-[12px] text-[#818691]">Run analysis to generate the optimization diff.</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-[#e8e8ee] bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="font-black tracking-[-0.025em]">Execution pipeline</h2>
                  <p className="mt-1 text-sm text-[#6f7480]">{pipelineLabel(pipelineStatus)}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={approvePlan}
                    disabled={pipelineStatus !== 'proposed' || pipelineBusy}
                    className="rounded-xl border border-[#dedee7] bg-white px-4 py-3 text-sm font-bold text-[#111318] transition hover:bg-[#f7f7fa] disabled:pointer-events-none disabled:opacity-40"
                  >
                    <ShieldCheck className="mr-2 inline h-4 w-4" />
                    {pipelineStatus === 'approved' || pipelineStatus === 'applied' ? 'Approved' : 'Approve plan'}
                  </button>
                  <button
                    onClick={applyChanges}
                    disabled={pipelineStatus !== 'approved' || pipelineBusy}
                    className="rounded-xl bg-[#159557] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#128049] disabled:pointer-events-none disabled:opacity-40"
                  >
                    {pipelineBusy && pipelineStatus === 'applying' ? <RefreshCw className="mr-2 inline h-4 w-4 animate-spin" /> : <Play className="mr-2 inline h-4 w-4 fill-current" />}
                    {pipelineStatus === 'applied' ? 'Verified' : 'Apply changes'}
                  </button>
                </div>
              </div>

              <div className="mt-4 max-h-56 overflow-auto rounded-2xl border border-[#ececf1] bg-[#fbfcfe] p-4 font-mono text-[11px] leading-5">
                {logs.map((log, idx) => (
                  <div key={`${log.slice(0, 12)}-${idx}`} className={getLogClass(log)}>{log || '\u00a0'}</div>
                ))}
                {pipelineBusy && (
                  <div className="mt-1 flex items-center gap-2 font-bold text-[#7446f3]">
                    <span className="h-2 w-2 animate-ping rounded-full bg-[#7446f3]" />
                    Running…
                  </div>
                )}
                {pipelineStatus === 'applied' && (
                  <div className="mt-1 flex items-center gap-2 font-bold text-[#159557]">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Pipeline complete.
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function pipelineLabel(status: PipelineStatus): string {
  switch (status) {
    case 'analyzing':
      return 'Agent is analyzing infrastructure…';
    case 'proposed':
      return 'Plan proposed. A human must approve before apply.';
    case 'approved':
      return 'Plan approved. Ready to apply.';
    case 'applying':
      return 'Applying approved changes (sandbox simulation)…';
    case 'applied':
      return 'Apply complete. Changes verified in sandbox.';
    case 'failed':
      return 'Pipeline failed. See error above.';
    default:
      return 'Run analysis to start the pipeline.';
  }
}

function PipelineStepper({ status }: { status: PipelineStatus }) {
  const steps: Array<{ key: PipelineStatus | 'analyze'; label: string }> = [
    { key: 'analyze', label: 'Analyze' },
    { key: 'proposed', label: 'Propose' },
    { key: 'approved', label: 'Approve' },
    { key: 'applied', label: 'Apply' },
  ];
  const order: PipelineStatus[] = ['idle', 'analyzing', 'proposed', 'approved', 'applied'];
  const currentIndex = status === 'failed' ? -1 : order.indexOf(status);

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
      <div className="mr-1 flex items-center gap-2 text-sm font-black">
        Progress
        <Info className="h-4 w-4 text-[#8b909a]" />
      </div>
      {steps.map((step, idx) => {
        const stepReached = currentIndex >= idx || (idx === 0 && status !== 'idle');
        const isCurrent =
          (step.key === 'analyze' && status === 'analyzing') ||
          (step.key === 'proposed' && status === 'proposed') ||
          (step.key === 'approved' && status === 'approved') ||
          (step.key === 'applied' && (status === 'applying' || status === 'applied'));
        return (
          <React.Fragment key={step.key}>
            {idx > 0 && <span className={`h-px w-6 ${stepReached ? 'bg-[#7446f3]' : 'bg-[#d4d4df]'}`} />}
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 ${
                isCurrent
                  ? 'bg-[#7446f3] text-white'
                  : stepReached || status === 'applied'
                    ? 'bg-[#eef6ee] text-[#159557]'
                    : 'bg-[#f0f0f2] text-[#818691]'
              }`}
            >
              {stepReached && !isCurrent && status !== 'analyzing' ? <Check className="h-3 w-3" /> : null}
              {step.label}
            </span>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function DiffView({ diff }: { diff: DiffResult }) {
  if (diff.hunks.length === 0) {
    return <div className="p-4 font-mono text-[12px] text-[#818691]">No changes — the configuration is already optimal.</div>;
  }
  return (
    <div>
      {diff.hunks.map((hunk: DiffHunk, hi) => (
        <div key={hi} className="mb-3">
          <div className="px-3 py-1 font-mono text-[11px] font-bold text-[#8b5cf6]">{hunkHeader(hunk)}</div>
          {hunk.lines.map((line: DiffLine, li) => (
            <div key={li} className={`flex gap-2 px-3 font-mono text-[12px] leading-5 ${lineClass(line)}`}>
              <span className="w-7 shrink-0 select-none text-right text-[#aaaeb6]">{line.oldNo ?? ''}</span>
              <span className="w-7 shrink-0 select-none text-right text-[#aaaeb6]">{line.newNo ?? ''}</span>
              <span className="w-3 shrink-0 select-none font-bold">{line.type === 'add' ? '+' : line.type === 'del' ? '−' : ' '}</span>
              <span className="whitespace-pre-wrap break-all">{line.text || ' '}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function hunkHeader(hunk: DiffHunk): string {
  const oldPart = hunk.oldLen === 0 ? `${hunk.oldStart},0` : `${hunk.oldStart},${hunk.oldLen}`;
  const newPart = hunk.newLen === 0 ? `${hunk.newStart},0` : `${hunk.newStart},${hunk.newLen}`;
  return `@@ -${oldPart} +${newPart} @@`;
}

function lineClass(line: DiffLine): string {
  if (line.type === 'add') return 'bg-[#eef6ee] text-[#0f7a43]';
  if (line.type === 'del') return 'bg-[#fdecea] text-[#b42318]';
  return 'text-[#606571]';
}

function FindingCard({ finding }: { finding: Finding }) {
  return (
    <article className="rounded-2xl border border-[#e4e5ea] bg-white p-4 transition duration-200 hover:border-[#d4d4df] hover:shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#7446f3] text-white">
            {getResourceIcon(finding.resource)}
          </div>
          <div className="min-w-0">
            <h3 className="truncate font-black tracking-[-0.025em]">{finding.resource}</h3>
            <p className="truncate text-sm text-[#606571]">{finding.issue}</p>
          </div>
        </div>
        <SeverityBadge severity={finding.severity} />
      </div>

      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <Spec label="Current" value={finding.current} tone="bad" />
        <Spec label="Recommended" value={finding.recommended} tone="good" />
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-[#ececf1] pt-3 text-sm">
        <span className="font-semibold text-[#606571]">Impact</span>
        <span className={finding.costSavings > 0 ? 'font-black text-[#159557]' : 'font-black text-[#5b2eea]'}>
          {finding.costSavings > 0 ? `$${finding.costSavings.toFixed(2)}/mo` : 'Security hardening'}
        </span>
      </div>
    </article>
  );
}

function Spec({ label, value, tone }: { label: string; value: string; tone: 'bad' | 'good' }) {
  return (
    <div className="min-w-0 rounded-xl bg-[#f7f7fa] p-3">
      <div className="mb-1 text-[10px] font-black uppercase tracking-wide text-[#818691]">{label}</div>
      <code className={`block truncate font-mono text-xs font-bold ${tone === 'bad' ? 'text-[#d7522a]' : 'text-[#159557]'}`}>{value}</code>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: Finding['severity'] }) {
  const className = {
    critical: 'bg-[#fff1ed] text-[#d7522a]',
    warning: 'bg-[#fff7df] text-[#a86600]',
    info: 'bg-[#edf4ff] text-[#2477db]',
  }[severity];

  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${className}`}>{severity}</span>;
}

function getResourceIcon(resource: string) {
  const lowerResource = resource.toLowerCase();
  if (lowerResource.includes('instance') || lowerResource.includes('compute')) return <Cpu className="h-5 w-5" />;
  if (lowerResource.includes('db') || lowerResource.includes('database')) return <Database className="h-5 w-5" />;
  if (lowerResource.includes('disk') || lowerResource.includes('storage')) return <HardDrive className="h-5 w-5" />;
  if (lowerResource.includes('security') || lowerResource.includes('ssh')) return <LockKeyhole className="h-5 w-5" />;
  return <Layers className="h-5 w-5" />;
}

function getLogClass(log: string) {
  if (log.startsWith('$ ') || log.startsWith('Terraform used')) return 'font-bold text-[#5b2eea]';
  if (log.startsWith('[HITL]')) return 'font-bold text-[#a86600]';
  if (log.toLowerCase().includes('apply complete') || log.toLowerCase().includes('verified')) return 'font-semibold text-[#159557]';
  if (log.includes('Plan:')) return 'font-semibold text-[#a86600]';
  if (log.toLowerCase().includes('interrupted') || log.toLowerCase().includes('error')) return 'font-semibold text-[#d7522a]';
  return 'text-[#606571]';
}
