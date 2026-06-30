import type OpenAI from 'openai';
import type { AnalysisResult } from './types';
import { getQwenClient, getQwenModel, isQwenConfigured } from './qwen';
import { callTool, getOpenAiTools } from '@/mcp/client';
import { generateFallbackAnalysis } from './fallback';

const MAX_TOOL_ROUNDS = 6;

const SYSTEM_PROMPT = `You are TerraPilot, an autonomous FinOps and Cloud Architecture agent.

You have access to a set of MCP tools. USE THEM before drawing conclusions:
1. Call "parse_terraform" to get a structured view of the resources.
2. Call "estimate_monthly_cost" to establish the current cost baseline.
3. For every compute/database instance, call "recommend_instance" (pass the instance type and the environment from its tags) to get a rightsized suggestion with deterministic savings.
4. Call "check_security_rules" to find public exposure of admin ports.
5. Call "getInstancePricing" only when you need to confirm a price that the other tools did not return.

After you have gathered enough evidence, produce the OPTIMIZED Terraform code by applying the recommended changes to the original, and return a FINAL answer that is a single valid JSON object (no markdown fences, no commentary) matching exactly this TypeScript type:

{
  "summary": "Concise overview of findings and total estimated monthly savings.",
  "estimatedSavings": 520.00,
  "findings": [
    {
      "resource": "alicloud_db_instance.postgres_db",
      "issue": "Short issue title",
      "severity": "critical",
      "current": "pg.r6.4xlarge",
      "recommended": "pg.g7.large",
      "costSavings": 505.00,
      "rationale": "Why this change is correct, grounded in the tool results and the environment tag."
    }
  ],
  "optimized_terraform": "The complete Terraform HCL with improvements applied. Raw HCL only — no backticks, no markdown."
}

Rules:
- Ground every cost figure in tool results; never invent prices.
- If a resource has no issue, do not invent one. Fewer accurate findings beat many fabricated ones.
- "optimized_terraform" must be valid HCL and preserve the structure of the input.
- The final message MUST be the JSON object only.`;

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

function stripJsonFences(content: string): string {
  return content
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
}

export async function analyzeTerraform(terraformCode: string): Promise<AnalysisResult> {
  if (!isQwenConfigured()) {
    return {
      ...generateFallbackAnalysis(terraformCode),
      _debug: 'Served by local FinOps analysis (QWEN_API_KEY not configured).',
    };
  }

  try {
    return await runAgent(terraformCode);
  } catch (error) {
    console.error('Agent run failed, falling back:', error);
    return {
      ...generateFallbackAnalysis(terraformCode),
      _debug:
        'Agent run failed (' +
        (error instanceof Error ? error.message : 'unknown') +
        '). Served by local fallback engine.',
    };
  }
}

async function runAgent(terraformCode: string): Promise<AnalysisResult> {
  const client = getQwenClient();
  const model = getQwenModel();
  const tools = await getOpenAiTools();

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Analyze this Terraform configuration using your tools, then return the final JSON payload:\n\n${terraformCode}`,
    },
  ];

  let lastContent = '';
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.chat.completions.create({
      model,
      messages,
      tools,
      tool_choice: 'auto',
      temperature: 0.1,
    });

    const message = response.choices[0]?.message;
    if (!message) throw new Error('Empty response from model.');

    messages.push(message);

    const toolCalls = message.tool_calls;
    if (!toolCalls || toolCalls.length === 0) {
      lastContent = message.content ?? '';
      break;
    }

    for (const call of toolCalls) {
      if (call.type !== 'function') continue;
      const name = call.function.name;
      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs = call.function.arguments ? JSON.parse(call.function.arguments) : {};
      } catch {
        parsedArgs = {};
      }
      let resultText = '';
      try {
        resultText = await callTool(name, parsedArgs);
      } catch (err) {
        resultText = `Tool error: ${err instanceof Error ? err.message : 'failed'}`;
      }
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: resultText || '(empty result)',
      });
    }

    if (round === MAX_TOOL_ROUNDS - 1) {
      messages.push({
        role: 'user',
        content: 'Tool budget reached. Return the final JSON payload now with the evidence gathered so far.',
      });
    }
  }

  return parseFinalAnswer(lastContent);
}

function parseFinalAnswer(content: string): AnalysisResult {
  if (!content) {
    throw new Error('Model returned no final content.');
  }
  const cleaned = stripJsonFences(content);
  const data = JSON.parse(cleaned) as AnalysisResult;

  if (typeof data.summary !== 'string' || typeof data.optimized_terraform !== 'string' || !Array.isArray(data.findings)) {
    throw new Error('Final JSON is missing required fields.');
  }
  return {
    summary: data.summary,
    estimatedSavings: typeof data.estimatedSavings === 'number' ? data.estimatedSavings : 0,
    findings: data.findings,
    optimized_terraform: data.optimized_terraform,
  };
}
