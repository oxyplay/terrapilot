import { createHash, randomUUID } from 'node:crypto';
import type { AnalysisResult, Proposal } from './types';

const store = new Map<string, Proposal>();

export function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 12);
}

export function createProposal(
  original: string,
  analysis: AnalysisResult,
  diff: Proposal['diff'],
  planLogs: string[],
): Proposal {
  const token = randomUUID();
  const proposal: Proposal = {
    token,
    contentHash: hashContent(analysis.optimized_terraform),
    original,
    optimized: analysis.optimized_terraform,
    diff,
    planLogs,
    findings: analysis.findings,
    estimatedSavings: analysis.estimatedSavings,
    status: 'proposed',
    createdAt: Date.now(),
  };
  store.set(token, proposal);
  return proposal;
}

export function getProposal(token: string): Proposal | undefined {
  return store.get(token);
}

export function requireProposal(token: string): Proposal {
  const proposal = store.get(token);
  if (!proposal) throw new ProposalError('Unknown or expired approval token.', 404);
  return proposal;
}

export function approveProposal(token: string): Proposal {
  const proposal = requireProposal(token);
  if (proposal.status === 'applied') {
    throw new ProposalError('Proposal already applied.', 409);
  }
  proposal.status = 'approved';
  proposal.approvedAt = Date.now();
  return proposal;
}

export function applyProposal(token: string, applyLogs: string[]): Proposal {
  const proposal = requireProposal(token);
  if (proposal.status !== 'approved') {
    throw new ProposalError('Proposal must be approved before applying.', 409);
  }
  proposal.status = 'applied';
  proposal.appliedAt = Date.now();
  proposal.applyLogs = applyLogs;
  return proposal;
}

export class ProposalError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
