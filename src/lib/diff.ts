import type { DiffHunk, DiffLine, DiffResult } from './types';

const CONTEXT = 3;

export function computeUnifiedDiff(original: string, optimized: string): DiffResult {
  const a = original.split('\n');
  const b = optimized.split('\n');
  const n = a.length;
  const m = b.length;

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  type Op = { t: 'eq' | 'del' | 'add'; line: string };
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ t: 'eq', line: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ t: 'del', line: a[i] });
      i++;
    } else {
      ops.push({ t: 'add', line: b[j] });
      j++;
    }
  }
  while (i < n) {
    ops.push({ t: 'del', line: a[i] });
    i++;
  }
  while (j < m) {
    ops.push({ t: 'add', line: b[j] });
    j++;
  }

  const lines: DiffLine[] = [];
  let oldNo = 0;
  let newNo = 0;
  for (const op of ops) {
    if (op.t === 'eq') {
      lines.push({ type: 'context', oldNo: ++oldNo, newNo: ++newNo, text: op.line });
    } else if (op.t === 'del') {
      lines.push({ type: 'del', oldNo: ++oldNo, newNo: null, text: op.line });
    } else {
      lines.push({ type: 'add', oldNo: null, newNo: ++newNo, text: op.line });
    }
  }

  const isChange = lines.map((l) => l.type !== 'context');

  const blocks: Array<[number, number]> = [];
  let start = -1;
  for (let k = 0; k < lines.length; k++) {
    if (isChange[k]) {
      if (start < 0) start = k;
    } else if (start >= 0) {
      blocks.push([start, k - 1]);
      start = -1;
    }
  }
  if (start >= 0) blocks.push([start, lines.length - 1]);

  const regions: Array<[number, number]> = [];
  for (const [bs, be] of blocks) {
    const rs = Math.max(0, bs - CONTEXT);
    const re = Math.min(lines.length - 1, be + CONTEXT);
    const last = regions[regions.length - 1];
    if (last && rs <= last[1] + 1) {
      last[1] = Math.max(last[1], re);
    } else {
      regions.push([rs, re]);
    }
  }

  const hunks: DiffHunk[] = regions.map(([rs, re]) => {
    const slice = lines.slice(rs, re + 1);
    const firstOld = slice.find((l) => l.oldNo != null)?.oldNo ?? 0;
    const firstNew = slice.find((l) => l.newNo != null)?.newNo ?? 0;
    const oldLen = slice.filter((l) => l.oldNo != null).length;
    const newLen = slice.filter((l) => l.newNo != null).length;
    return { oldStart: firstOld, oldLen, newStart: firstNew, newLen, lines: slice };
  });

  return {
    hunks,
    added: lines.filter((l) => l.type === 'add').length,
    removed: lines.filter((l) => l.type === 'del').length,
  };
}

export function formatHunkHeader(hunk: DiffHunk): string {
  const oldPart = hunk.oldLen === 0 ? `${hunk.oldStart},0` : `${hunk.oldStart},${hunk.oldLen}`;
  const newPart = hunk.newLen === 0 ? `${hunk.newStart},0` : `${hunk.newStart},${hunk.newLen}`;
  return `@@ -${oldPart} +${newPart} @@`;
}
