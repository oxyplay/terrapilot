import * as z from 'zod/v4';
import type {
  Cloud,
  CostBreakdown,
  ParsedResource,
  PriceEntry,
  PricingResult,
  Recommendation,
  ResourceKind,
  SecurityViolation,
} from '@/lib/types';

const PRICING: PriceEntry[] = [
  { instanceType: 'ecs.r6.4xlarge', cloud: 'alicloud', monthlyUsd: 490, category: 'memory-optimized' },
  { instanceType: 'ecs.g7.large', cloud: 'alicloud', monthlyUsd: 68, category: 'general-purpose' },
  { instanceType: 'ecs.g7.xlarge', cloud: 'alicloud', monthlyUsd: 135, category: 'general-purpose' },
  { instanceType: 'ecs.t6.large', cloud: 'alicloud', monthlyUsd: 38, category: 'burstable' },
  { instanceType: 'pg.r6.4xlarge', cloud: 'alicloud', monthlyUsd: 580, category: 'memory-optimized-db' },
  { instanceType: 'pg.g7.large', cloud: 'alicloud', monthlyUsd: 75, category: 'general-purpose-db' },
  { instanceType: 'pg.g7.xlarge', cloud: 'alicloud', monthlyUsd: 150, category: 'general-purpose-db' },
  { instanceType: 'm5.2xlarge', cloud: 'aws', monthlyUsd: 140, category: 'general-purpose' },
  { instanceType: 'm5.xlarge', cloud: 'aws', monthlyUsd: 70, category: 'general-purpose' },
  { instanceType: 't3.medium', cloud: 'aws', monthlyUsd: 30, category: 'burstable' },
  { instanceType: 't3.small', cloud: 'aws', monthlyUsd: 15, category: 'burstable' },
  { instanceType: 'db.r6.4xlarge', cloud: 'aws', monthlyUsd: 720, category: 'memory-optimized-db' },
  { instanceType: 'db.m5.large', cloud: 'aws', monthlyUsd: 140, category: 'general-purpose-db' },
];

const STORAGE_USD_PER_GB_MONTH = 0.12;

function detectCloud(hcl: string): Cloud {
  const lower = hcl.toLowerCase();
  if (lower.includes('alicloud') || lower.includes('aliyun')) return 'alicloud';
  if (lower.includes('aws') || lower.includes('"aws_')) return 'aws';
  if (lower.includes('azurerm')) return 'azure';
  if (lower.includes('google_')) return 'gcp';
  return 'unknown';
}

function classifyResource(type: string): ResourceKind {
  if (/db_instance|database|rds|sqlserver|postgres|mysql|redis/.test(type)) return 'database';
  if (/disk|ebs|bucket|storage|oss/.test(type)) return 'storage';
  if (/security_group|firewall|network|route|subnet/.test(type)) return 'network';
  if (/instance|virtualmachine|compute|vm/.test(type)) return 'compute';
  return 'other';
}

export function parseTerraform(hcl: string): ParsedResource[] {
  const resources: ParsedResource[] = [];
  const resourceRegex = /resource\s+"([\w.]+)"\s+"([\w-]+)"\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = resourceRegex.exec(hcl)) !== null) {
    const type = match[1];
    const name = match[2];
    const bodyStart = match.index + match[0].length;
    const body = extractBlock(hcl, bodyStart);
    const attributes = parseAttributes(body);
    resources.push({ type, name, kind: classifyResource(type), attributes });
  }
  return resources;
}

function extractBlock(src: string, start: number): string {
  let depth = 1;
  let i = start;
  let inString: string | null = null;
  while (i < src.length && depth > 0) {
    const ch = src[i];
    const prev = src[i - 1];
    if (inString) {
      if (ch === inString && prev !== '\\') inString = null;
    } else if (ch === '"' || ch === '`') {
      inString = ch;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
    }
    i++;
  }
  return src.slice(start, i - 1);
}

function parseAttributes(block: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const lines = block.split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    const m = line.match(/^([\w-]+)\s*=\s*(.+)$/);
    if (!m) continue;
    const key = m[1];
    let value = m[2].trim();
    const commentIdx = value.search(/\s+(#|\/\/)/);
    if (commentIdx >= 0) value = value.slice(0, commentIdx).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    attrs[key] = value;
  }
  return attrs;
}

const PRICING_CATALOG_DATE = '2025-06-15';
const PRICING_SOURCE = 'TerraPilot internal on-demand catalog (Alibaba Cloud + AWS sample regions)';

export function getPricingCatalogMeta() {
  return {
    source: PRICING_SOURCE,
    updatedAt: PRICING_CATALOG_DATE,
    supportedClouds: ['alicloud', 'aws'] as Cloud[],
    supportedRegions: ['cn-hangzhou', 'cn-beijing', 'us-east-1', 'us-west-2'],
    formula: 'monthlyUsd = hourlyUsd × 730',
    confidenceLevels: {
      verified: 'Exact match in internal pricing catalog.',
      estimated: 'Derived from family-level heuristic; not a live API quote.',
      unknown: 'Resource type not supported by current catalog.',
    },
  };
}

export function getInstancePricing(args: { instanceType: string; cloud?: string }): PricingResult {
  const cloud = (args.cloud as Cloud) || 'unknown';
  const entry = PRICING.find(
    (p) => p.instanceType.toLowerCase() === args.instanceType.toLowerCase(),
  );
  if (entry) {
    return {
      instanceType: entry.instanceType,
      cloud: entry.cloud,
      monthlyUsd: entry.monthlyUsd,
      category: entry.category,
      estimated: false,
      confidence: 'verified',
      source: PRICING_SOURCE,
    };
  }
  const estimate = heuristicEstimate(args.instanceType);
  if (estimate == null) {
    return {
      instanceType: args.instanceType,
      cloud: cloud === 'unknown' ? 'unknown' : cloud,
      monthlyUsd: null,
      category: 'unknown',
      estimated: true,
      confidence: 'unknown',
      source: PRICING_SOURCE,
    };
  }
  return {
    instanceType: args.instanceType,
    cloud: cloud === 'unknown' ? 'unknown' : cloud,
    monthlyUsd: estimate,
    category: 'estimated',
    estimated: true,
    confidence: 'estimated',
    source: `${PRICING_SOURCE} (heuristic)`,
  };
}

function heuristicEstimate(instanceType: string): number | null {
  const m = instanceType.match(/(\d+)\.(\w+)/);
  if (!m) return null;
  const num = parseInt(m[1], 10);
  if (num <= 0) return null;
  const base = instanceType.includes('db') ? 70 : 34;
  const memFactor = /r\d/.test(instanceType) ? 2.2 : 1;
  return Math.round(base * num * memFactor);
}

const RECOMMEND_RULES: Array<{
  match: RegExp;
  env: string[];
  build: (current: string) => string;
  reason: string;
}> = [
  {
    match: /r6\.\d+xlarge/i,
    env: ['dev', 'test', 'staging'],
    build: (c) => c.replace(/r\d+/i, 'g7').replace(/\d+xlarge/i, 'large'),
    reason: 'Dev/test workloads do not need memory-optimized instances. General-purpose g7.large covers typical load at a fraction of the cost.',
  },
  {
    match: /m5\.2xlarge/i,
    env: ['dev', 'test', 'staging'],
    build: () => 't3.medium',
    reason: 'Non-prod m5.2xlarge is overprovisioned for low traffic. Burstable t3.medium is the standard dev baseline.',
  },
  {
    match: /m5\.xlarge/i,
    env: ['dev', 'test'],
    build: () => 't3.small',
    reason: 'Dev environments rarely sustain load; a burstable t3.small is sufficient and far cheaper.',
  },
];

export function recommendInstance(args: {
  currentInstance: string;
  environment: string;
}): Recommendation {
  const env = (args.environment || '').toLowerCase().trim();
  const current = args.currentInstance;
  let recommended = current;
  let reason = 'No rightsizing recommended for the given environment.';

  for (const rule of RECOMMEND_RULES) {
    if (rule.match.test(current) && rule.env.includes(env)) {
      recommended = rule.build(current);
      reason = rule.reason;
      break;
    }
  }

  const currentPrice = getInstancePricing({ instanceType: current }).monthlyUsd;
  const recommendedPrice = getInstancePricing({ instanceType: recommended }).monthlyUsd;
  const monthlySavings =
    currentPrice != null && recommendedPrice != null
      ? Math.max(0, currentPrice - recommendedPrice)
      : null;

  return {
    current,
    recommended,
    environment: env || 'unknown',
    currentMonthlyUsd: currentPrice,
    recommendedMonthlyUsd: recommendedPrice,
    monthlySavings,
    reason,
  };
}

const SENSITIVE_PORTS: Record<string, string> = {
  '22': 'SSH',
  '3389': 'RDP',
  '3306': 'MySQL',
  '5432': 'PostgreSQL',
  '6379': 'Redis',
  '27017': 'MongoDB',
};

export function checkSecurityRules(hcl: string): SecurityViolation[] {
  const violations: SecurityViolation[] = [];
  const resources = parseTerraform(hcl);

  for (const res of resources) {
    if (res.kind !== 'network') continue;
    const cidr = res.attributes.cidr_ip || res.attributes.cidr_blocks || res.attributes.source_cidr;
    const port = res.attributes.port_range || res.attributes.from_port || res.attributes.ports;
    const isPublic = /0\.0\.0\.0\/0|::\/0/.test(String(cidr));
    if (!isPublic) continue;

    const portStr = String(port);
    for (const [portNum, label] of Object.entries(SENSITIVE_PORTS)) {
      if (portStr.includes(portNum)) {
        violations.push({
          resource: `${res.type}.${res.name}`,
          ruleId: 'no-public-admin-port',
          severity: 'critical',
          detail: `Port ${portNum} (${label}) is open to 0.0.0.0/0 on ${res.type}.${res.name}.`,
          recommendation: 'Restrict ingress to a private CIDR (e.g. 10.0.0.0/8) or a VPN/office range. Use a bastion or SSM instead of direct SSH.',
        });
      }
    }

    if (isPublic && !portStr) {
      violations.push({
        resource: `${res.type}.${res.name}`,
        ruleId: 'public-ingress-no-port',
        severity: 'warning',
        detail: `${res.type}.${res.name} allows ingress from 0.0.0.0/0 without a clearly scoped port.`,
        recommendation: 'Scope ingress to specific ports and private CIDRs.',
      });
    }
  }
  return violations;
}

export function estimateMonthlyCost(hcl: string): CostBreakdown {
  const resources = parseTerraform(hcl);
  const cloud = detectCloud(hcl);
  const rows: CostBreakdown['resources'] = [];
  let total = 0;

  for (const res of resources) {
    if (res.kind === 'compute' || res.kind === 'database') {
      const it = res.attributes.instance_type || res.attributes.instance_class || null;
      if (!it) continue;
      const price = getInstancePricing({ instanceType: it, cloud }).monthlyUsd;
      rows.push({ resource: `${res.type}.${res.name}`, instanceType: it, monthlyUsd: price });
      if (price) total += price;
    } else if (res.kind === 'storage') {
      const sizeAttr = res.attributes.size || res.attributes.allocated_storage;
      const gb = parseInt(String(sizeAttr || '0'), 10);
      if (gb > 0) {
        const cost = Math.round(gb * STORAGE_USD_PER_GB_MONTH * 100) / 100;
        rows.push({ resource: `${res.type}.${res.name}`, instanceType: null, monthlyUsd: cost });
        total += cost;
      }
    }
  }

  return { resources: rows, totalMonthlyUsd: Math.round(total * 100) / 100 };
}

export const toolSchemas = {
  parseTerraform: {
    description:
      'Parse Terraform HCL source into a structured list of resources (type, name, kind, attributes). Use this first to understand the infrastructure before any analysis.',
    input: z.object({ hcl: z.string().describe('Raw Terraform HCL source code') }),
  },
  getInstancePricing: {
    description:
      'Look up the monthly on-demand price (USD) for a specific cloud instance type. Returns null when the type is unknown.',
    input: z.object({
      instanceType: z.string().describe('Instance class, e.g. ecs.r6.4xlarge, m5.2xlarge, pg.g7.large'),
      cloud: z.string().optional().describe('Cloud provider: alicloud | aws | azure | gcp'),
    }),
  },
  recommendInstance: {
    description:
      'Given the current instance type and environment (dev/staging/prod), return a rightsized recommendation with deterministic FinOps heuristics and estimated monthly savings.',
    input: z.object({
      currentInstance: z.string().describe('Current instance type, e.g. ecs.r6.4xlarge'),
      environment: z.string().describe('Environment tag value: dev | test | staging | prod'),
    }),
  },
  checkSecurityRules: {
    description:
      'Scan Terraform HCL for network-security anti-patterns (admin ports open to 0.0.0.0/0, unscoped public ingress). Returns concrete violations with remediation.',
    input: z.object({ hcl: z.string().describe('Raw Terraform HCL source code') }),
  },
  estimateMonthlyCost: {
    description:
      'Estimate the total monthly cost (USD) of all billable resources in the HCL (compute, databases, storage). Use as the cost baseline before optimization.',
    input: z.object({ hcl: z.string().describe('Raw Terraform HCL source code') }),
  },
} as const;

export const toolHandlers = {
  parseTerraform: ({ hcl }: { hcl: string }) => parseTerraform(hcl),
  getInstancePricing: ({ instanceType, cloud }: { instanceType: string; cloud?: string }) =>
    getInstancePricing({ instanceType, cloud }),
  recommendInstance: ({ currentInstance, environment }: { currentInstance: string; environment: string }) =>
    recommendInstance({ currentInstance, environment }),
  checkSecurityRules: ({ hcl }: { hcl: string }) => checkSecurityRules(hcl),
  estimateMonthlyCost: ({ hcl }: { hcl: string }) => estimateMonthlyCost(hcl),
} as const;

export type ToolName = keyof typeof toolHandlers;
