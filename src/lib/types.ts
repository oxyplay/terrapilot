export type Severity = 'critical' | 'warning' | 'info';

export type PricingConfidence = 'verified' | 'estimated' | 'unknown';

export interface ToolCallTrace {
  id: string;
  timestamp: number;
  name: string;
  arguments: Record<string, unknown>;
  result: unknown;
  durationMs: number;
}

export interface FindingEvidence {
  type: 'pricing' | 'recommendation' | 'security' | 'cost-baseline';
  description: string;
  callIds: string[];
  data?: Record<string, unknown>;
}

export interface Finding {
  resource: string;
  issue: string;
  severity: Severity;
  current: string;
  recommended: string;
  costSavings: number;
  rationale: string;
  evidence?: FindingEvidence[];
  evidenceCallIds?: string[];
}

export interface AnalysisResult {
  summary: string;
  estimatedSavings: number;
  findings: Finding[];
  optimized_terraform: string;
  trace: ToolCallTrace[];
  _debug?: string;
}

export interface AnalyzeRequest {
  terraformCode?: string;
}

export interface ParsedResource {
  type: string;
  name: string;
  kind: ResourceKind;
  attributes: Record<string, string>;
}

export type ResourceKind = 'compute' | 'database' | 'storage' | 'network' | 'other';

export interface PriceEntry {
  instanceType: string;
  cloud: Cloud;
  monthlyUsd: number;
  category: string;
}

export type Cloud = 'alicloud' | 'aws' | 'azure' | 'gcp' | 'unknown';

export interface PricingResult {
  instanceType: string;
  cloud: Cloud;
  monthlyUsd: number | null;
  category: string;
  estimated: boolean;
  confidence: PricingConfidence;
  source: string;
}

export interface Recommendation {
  current: string;
  recommended: string;
  environment: string;
  currentMonthlyUsd: number | null;
  recommendedMonthlyUsd: number | null;
  monthlySavings: number | null;
  reason: string;
}

export interface SecurityViolation {
  resource: string;
  ruleId: string;
  severity: Severity;
  detail: string;
  recommendation: string;
}

export interface CostBreakdown {
  resources: Array<{ resource: string; instanceType: string | null; monthlyUsd: number | null }>;
  totalMonthlyUsd: number;
}

export type DiffLineType = 'context' | 'add' | 'del';

export interface DiffLine {
  type: DiffLineType;
  oldNo: number | null;
  newNo: number | null;
  text: string;
}

export interface DiffHunk {
  oldStart: number;
  oldLen: number;
  newStart: number;
  newLen: number;
  lines: DiffLine[];
}

export interface DiffResult {
  hunks: DiffHunk[];
  added: number;
  removed: number;
}

export type PipelineStatus =
  | 'idle'
  | 'analyzing'
  | 'proposed'
  | 'approved'
  | 'applying'
  | 'applied'
  | 'failed';

export type ProposalStatus = 'proposed' | 'approved' | 'applied';

export interface Proposal {
  proposalId: string;
  token: string;
  contentHash: string;
  originalHash: string;
  optimizedHash: string;
  original: string;
  optimized: string;
  diff: DiffResult;
  planLogs: string[];
  findings: Finding[];
  estimatedSavings: number;
  status: ProposalStatus;
  createdAt: number;
  expiresAt: number;
  approvedAt?: number;
  approvedBy?: string;
  appliedAt?: number;
  applyLogs?: string[];
  prUrl?: string;
  prNumber?: number;
}

export interface AnalyzeResponse extends AnalysisResult {
  diff: DiffResult;
  proposalToken: string;
  contentHash: string;
  originalHash: string;
  optimizedHash: string;
  pipelineStatus: PipelineStatus;
  planLogs: string[];
  expiresAt: number;
}

export interface ApproveResponse {
  token: string;
  proposalId: string;
  status: ProposalStatus;
  approvedAt: number;
  approvedBy: string;
  expiresAt: number;
}

export interface ApplyResponse {
  token: string;
  proposalId: string;
  status: ProposalStatus;
  appliedAt: number;
  logs: string[];
  prUrl?: string;
  prNumber?: number;
}
