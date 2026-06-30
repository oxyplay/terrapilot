import { NextRequest, NextResponse } from 'next/server';
import type { AnalyzeRequest, AnalyzeResponse } from '@/lib/types';
import { analyzeTerraform } from '@/lib/agent';
import { computeUnifiedDiff } from '@/lib/diff';
import { generatePlanLogs } from '@/lib/pipeline';
import { createProposal } from '@/lib/proposals';

export async function POST(req: NextRequest): Promise<NextResponse<AnalyzeResponse | { error: string }>> {
  try {
    const body = (await req.json().catch(() => ({}))) as AnalyzeRequest;
    const terraformCode = body.terraformCode ?? '';

    if (!terraformCode || typeof terraformCode !== 'string') {
      return NextResponse.json({ error: 'Invalid or missing terraformCode' }, { status: 400 });
    }

    const analysis = await analyzeTerraform(terraformCode);
    const diff = computeUnifiedDiff(terraformCode, analysis.optimized_terraform);
    const planLogs = generatePlanLogs(terraformCode, analysis.optimized_terraform);
    const proposal = createProposal(terraformCode, analysis, diff, planLogs);

    const response: AnalyzeResponse = {
      ...analysis,
      diff,
      proposalToken: proposal.token,
      contentHash: proposal.contentHash,
      pipelineStatus: 'proposed',
      planLogs,
    };
    return NextResponse.json(response);
  } catch (error: unknown) {
    console.error('Error in /api/analyze route:', error);
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
