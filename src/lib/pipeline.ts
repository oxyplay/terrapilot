import { parseTerraform } from '@/mcp/tools';
import type { DiffResult } from './types';

export interface AttributeChange {
  key: string;
  from: string;
  to: string;
}

export interface ResourceChange {
  address: string;
  action: 'create' | 'update' | 'destroy';
  attributes: AttributeChange[];
}

const ACTION_SYMBOLS = {
  create: '+ create',
  update: '~ update in-place',
  destroy: '- destroy',
} as const;

export function computeChangeset(original: string, optimized: string): ResourceChange[] {
  const a = parseTerraform(original);
  const b = parseTerraform(optimized);
  const mapA = new Map(a.map((r) => [`${r.type}.${r.name}`, r]));
  const mapB = new Map(b.map((r) => [`${r.type}.${r.name}`, r]));
  const changes: ResourceChange[] = [];

  for (const [addr, rb] of mapB) {
    const ra = mapA.get(addr);
    if (!ra) {
      changes.push({ address: addr, action: 'create', attributes: [] });
      continue;
    }
    const keys = new Set([...Object.keys(ra.attributes), ...Object.keys(rb.attributes)]);
    const attrs: AttributeChange[] = [];
    for (const key of keys) {
      const from = ra.attributes[key];
      const to = rb.attributes[key];
      if (from === to) continue;
      attrs.push({ key, from: from ?? '<removed>', to: to ?? '<added>' });
    }
    if (attrs.length) changes.push({ address: addr, action: 'update', attributes: attrs });
  }

  for (const [addr] of mapA) {
    if (!mapB.has(addr)) changes.push({ address: addr, action: 'destroy', attributes: [] });
  }
  return changes;
}

export function generatePlanLogs(original: string, optimized: string): string[] {
  const cs = computeChangeset(original, optimized);
  const add = cs.filter((c) => c.action === 'create').length;
  const update = cs.filter((c) => c.action === 'update').length;
  const destroy = cs.filter((c) => c.action === 'destroy').length;
  const logs: string[] = [];

  logs.push('Terraform used the selected providers to generate the following execution plan.');
  logs.push('Resource actions are indicated with the following symbols:');
  if (update) logs.push(`  ${ACTION_SYMBOLS.update}`);
  if (add) logs.push(`  ${ACTION_SYMBOLS.create}`);
  if (destroy) logs.push(`  ${ACTION_SYMBOLS.destroy}`);
  logs.push('');

  for (const c of cs) {
    logs.push(`  ${ACTION_SYMBOLS[c.action]} ${c.address}`);
    for (const at of c.attributes) logs.push(`      ${at.key}: "${at.from}" -> "${at.to}"`);
  }

  logs.push('');
  logs.push(`Plan: ${add} to add, ${update} to change, ${destroy} to destroy.`);
  return logs;
}

export function generateApplyLogs(original: string, optimized: string): string[] {
  const cs = computeChangeset(original, optimized);
  const add = cs.filter((c) => c.action === 'create').length;
  const update = cs.filter((c) => c.action === 'update').length;
  const destroy = cs.filter((c) => c.action === 'destroy').length;
  const logs: string[] = [''];

  for (const c of cs) {
    const outcome =
      c.action === 'create'
        ? 'Creation complete after 0s'
        : c.action === 'destroy'
          ? 'Destruction complete after 0s'
          : 'Modifications complete after 0s';
    logs.push(`${c.address}: ${outcome} (sandbox simulation)`);
  }

  logs.push('');
  logs.push(`Apply complete! Resources: ${add} added, ${update} changed, ${destroy} destroyed.`);
  return logs;
}

export function summarizeDiff(diff: DiffResult): string {
  return `${diff.added} addition(s), ${diff.removed} removal(s)`;
}
