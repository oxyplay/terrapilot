import { NextRequest, NextResponse } from 'next/server';
import type { ApplyResponse } from '@/lib/types';
import { generateApplyLogs } from '@/lib/pipeline';
import { applyProposal, ProposalError, requireProposal } from '@/lib/proposals';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { token?: string };
    const token = body.token;
    if (!token) {
      return NextResponse.json({ error: 'Missing approval token' }, { status: 400 });
    }

    const proposal = requireProposal(token);
    const logs = generateApplyLogs(proposal.original, proposal.optimized);
    const applied = applyProposal(token, logs);
    const response: ApplyResponse = {
      token: applied.token,
      status: applied.status,
      appliedAt: applied.appliedAt!,
      logs,
    };
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof ProposalError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Error in /api/apply route:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Use POST with an approval token.' }, { status: 405 });
}
