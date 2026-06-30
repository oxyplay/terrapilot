import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AnalysisResult, Proposal } from './types';

const PROPOSAL_TTL_MS = Number(process.env.PROPOSAL_TTL_SECONDS || '3600') * 1000;
const STORE_PATH = process.env.PROPOSALS_STORE_PATH || /*turbopackIgnore: true*/ '.terrapilot/proposals.json';

function ensureStore() {
  if (!existsSync(dirname(STORE_PATH))) {
    mkdirSync(dirname(STORE_PATH), { recursive: true });
  }
}

function loadStore(): Map<string, Proposal> {
  ensureStore();
  if (!existsSync(STORE_PATH)) return new Map();
  try {
    const raw = JSON.parse(readFileSync(STORE_PATH, 'utf8')) as Proposal[];
    return new Map(raw.map((p) => [p.token, p]));
  } catch {
    return new Map();
  }
}

function saveStore(store: Map<string, Proposal>) {
  ensureStore();
  writeFileSync(STORE_PATH, JSON.stringify(Array.from(store.values()), null, 2));
}

function getStore(): Map<string, Proposal> {
  // Reload each time to keep durable across serverless invocations.
  return loadStore();
}

export function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export function createProposal(
  original: string,
  analysis: AnalysisResult,
  diff: Proposal['diff'],
  planLogs: string[],
): Proposal {
  const token = randomUUID();
  const proposalId = `TP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const createdAt = Date.now();
  const proposal: Proposal = {
    proposalId,
    token,
    contentHash: hashContent(analysis.optimized_terraform).slice(0, 12),
    originalHash: hashContent(original),
    optimizedHash: hashContent(analysis.optimized_terraform),
    original,
    optimized: analysis.optimized_terraform,
    diff,
    planLogs,
    findings: analysis.findings,
    estimatedSavings: analysis.estimatedSavings,
    status: 'proposed',
    createdAt,
    expiresAt: createdAt + PROPOSAL_TTL_MS,
  };
  const store = getStore();
  store.set(token, proposal);
  saveStore(store);
  return proposal;
}

export function getProposal(token: string): Proposal | undefined {
  const store = getStore();
  const proposal = store.get(token);
  if (!proposal) return undefined;
  if (Date.now() > proposal.expiresAt) {
    store.delete(token);
    saveStore(store);
    return undefined;
  }
  return proposal;
}

export function requireProposal(token: string): Proposal {
  const proposal = getProposal(token);
  if (!proposal) throw new ProposalError('Unknown or expired approval token.', 404);
  return proposal;
}

export function approveProposal(token: string, approvedBy = 'operator'): Proposal {
  const store = getStore();
  const proposal = store.get(token);
  if (!proposal || Date.now() > proposal.expiresAt) {
    throw new ProposalError('Unknown or expired approval token.', 404);
  }
  if (proposal.status === 'applied') {
    throw new ProposalError('Proposal already applied.', 409);
  }
  if (proposal.status === 'approved') {
    throw new ProposalError('Proposal already approved.', 409);
  }
  proposal.status = 'approved';
  proposal.approvedAt = Date.now();
  proposal.approvedBy = approvedBy;
  store.set(token, proposal);
  saveStore(store);
  return proposal;
}

export function applyProposal(token: string, applyLogs: string[], prUrl?: string, prNumber?: number): Proposal {
  const store = getStore();
  const proposal = store.get(token);
  if (!proposal || Date.now() > proposal.expiresAt) {
    throw new ProposalError('Unknown or expired approval token.', 404);
  }
  if (proposal.status !== 'approved') {
    throw new ProposalError('Proposal must be approved before applying.', 409);
  }
  proposal.status = 'applied';
  proposal.appliedAt = Date.now();
  proposal.applyLogs = applyLogs;
  if (prUrl) proposal.prUrl = prUrl;
  if (prNumber) proposal.prNumber = prNumber;
  store.set(token, proposal);
  saveStore(store);
  return proposal;
}

export function updateProposal(token: string, patch: Partial<Proposal>): Proposal {
  const store = getStore();
  const proposal = store.get(token);
  if (!proposal) throw new ProposalError('Unknown or expired approval token.', 404);
  Object.assign(proposal, patch);
  store.set(token, proposal);
  saveStore(store);
  return proposal;
}

export class ProposalError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
