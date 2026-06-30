import { NextRequest, NextResponse } from 'next/server';
import type { ApplyResponse } from '@/lib/types';
import { generateApplyLogs } from '@/lib/pipeline';
import { applyProposal, ProposalError, requireProposal } from '@/lib/proposals';
import { createOptimizedTerraformPR, isGitHubConfigured } from '@/lib/github';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { token?: string };
    const token = body.token;
    if (!token) {
      return NextResponse.json({ error: 'Missing approval token' }, { status: 400 });
    }

    const proposal = requireProposal(token);
    const logs = generateApplyLogs(proposal.original, proposal.optimized);

    let prUrl: string | undefined;
    let prNumber: number | undefined;
    if (isGitHubConfigured()) {
      const pr = await createOptimizedTerraformPR(
        proposal.original,
        proposal.optimized,
        proposal.findings.map((f) => `- ${f.resource}: ${f.rationale}`).join('\n'),
        proposal.proposalId,
      );
      prUrl = pr.prUrl;
      prNumber = pr.prNumber;
      logs.push(`GitHub PR created: ${prUrl}`);
    } else {
      logs.push('GitHub integration not configured. Changes approved but no PR was created.');
    }

    const applied = applyProposal(token, logs, prUrl, prNumber);
    const response: ApplyResponse = {
      token: applied.token,
      proposalId: applied.proposalId,
      status: applied.status,
      appliedAt: applied.appliedAt!,
      logs,
      prUrl,
      prNumber,
    };
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof ProposalError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Error in /api/apply route:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal Server Error' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Use POST with an approval token.' }, { status: 405 });
}
