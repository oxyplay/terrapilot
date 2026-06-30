import { NextRequest, NextResponse } from 'next/server';
import type { ApproveResponse } from '@/lib/types';
import { approveProposal, ProposalError } from '@/lib/proposals';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { token?: string; approvedBy?: string };
    const token = body.token;
    if (!token) {
      return NextResponse.json({ error: 'Missing approval token' }, { status: 400 });
    }

    const proposal = approveProposal(token, body.approvedBy || 'operator');
    const response: ApproveResponse = {
      token: proposal.token,
      proposalId: proposal.proposalId,
      status: proposal.status,
      approvedAt: proposal.approvedAt!,
      approvedBy: proposal.approvedBy!,
      expiresAt: proposal.expiresAt,
    };
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof ProposalError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Error in /api/approve route:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json(
    { error: 'Use POST with an approval token.' },
    { status: 405 },
  );
}
