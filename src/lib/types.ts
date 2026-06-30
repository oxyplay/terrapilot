export type Severity = 'critical' | 'warning' | 'info';

export interface Finding {
  resource: string;
  issue: string;
  severity: Severity;
  current: string;
  recommended: string;
  costSavings: number;
  rationale: string;
}

export interface AnalysisResult {
  summary: string;
  estimatedSavings: number;
  findings: Finding[];
  optimized_terraform: string;
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
  token: string;
  contentHash: string;
  original: string;
  optimized: string;
  diff: DiffResult;
  planLogs: string[];
  findings: Finding[];
  estimatedSavings: number;
  status: ProposalStatus;
  createdAt: number;
  approvedAt?: number;
  appliedAt?: number;
  applyLogs?: string[];
}

export interface AnalyzeResponse extends AnalysisResult {
  diff: DiffResult;
  proposalToken: string;
  contentHash: string;
  pipelineStatus: PipelineStatus;
  planLogs: string[];
}

export interface ApproveResponse {
  token: string;
  status: ProposalStatus;
  approvedAt: number;
}

export interface ApplyResponse {
  token: string;
  status: ProposalStatus;
  appliedAt: number;
  logs: string[];
}
