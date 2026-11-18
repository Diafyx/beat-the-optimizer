import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import type { Issue, PullRequest } from '../../scripts/lib/github.ts';
import {
  SCOPES,
  TYPE_LABELS,
  checkBranch,
  checkIssues,
  checkLabels,
  checkMilestone,
  checkTemplate,
  evaluate,
  linkedIssues,
  parseTitle,
  summary,
} from '../../scripts/lib/pr-rules.ts';

const template = readFileSync('.github/PULL_REQUEST_TEMPLATE.md', 'utf8');
const labelNames = (parse(readFileSync('.github/labels.yml', 'utf8')) as { name: string }[]).map(
  (label) => label.name,
);

/** The template filled in the way a contributor would. */
const filled = template.replace('Closes #', 'Closes #5').replace(/<!--[\s\S]*?-->/g, 'Done.');

const open: Issue = { open: true, isPullRequest: false, milestone: 'bootstrap' };
const issues = (entries: [number, Issue | null][]): Map<number, Issue | null> => new Map(entries);

describe('the rule tables', () => {
  it('match the labels in .github/labels.yml', () => {
    const areas = labelNames
      .filter((name) => name.startsWith('area/'))
      .map((name) => name.slice(5));
    expect([...SCOPES].sort()).toEqual([...areas, 'deps'].sort());
    const types = labelNames.filter((name) => name.startsWith('type/'));
    expect([...new Set(Object.values(TYPE_LABELS).flat())].sort()).toEqual(types.sort());
  });
});

describe('checkTitle (via evaluate)', () => {
  const title = (text: string): readonly string[] | null =>
    evaluate(pr({ title: text }), issues([[5, open]]), template, 'success')[0]?.problems ?? null;

  it('accepts type(scope): summary, with "!" for a breaking change', () => {
    expect(title('feat(share): add the share card')).toEqual([]);
    expect(title('build(deps): Bump vite from 8.3.7 to 8.3.8')).toEqual([]);
    expect(title('feat(engine)!: change the cost model')).toEqual([]);
  });

  it('rejects a missing scope or summary, an unknown type and an unknown scope', () => {
    expect(title('feat: add the share card')?.[0]).toMatch(/is not "type\(scope\): summary"/);
    expect(title('feat(share):')?.[0]).toMatch(/is not "type\(scope\): summary"/);
    expect(title('Feature(share): x')?.[0]).toMatch(/is not "type\(scope\): summary"/);
    expect(title('feature(share): x')).toEqual([
      'The title type "feature" is not one of: feat, fix, perf, refactor, test, docs, ci, build, chore, revert.',
    ]);
    expect(title('feat(main): x')?.[0]).toMatch(/^The title scope "main" is not one of: engine,/);
  });
});

describe('parseTitle', () => {
  it('returns the type, scope and breaking flag', () => {
    expect(parseTitle('fix(ui)!: x')).toEqual({ type: 'fix', scope: 'ui', breaking: true });
    expect(parseTitle('fix ui')).toBeNull();
  });
});

describe('checkBranch', () => {
  it('accepts <type>/<issue>-<slug>', () => {
    expect(checkBranch('feat/12-share-card')).toEqual([]);
    expect(checkBranch('ci/5-pr-hygiene')).toEqual([]);
  });

  it.each([
    'main',
    'feat/share-card',
    'feature/12-x',
    'feat/012-x',
    'feat/12-Share',
    'feat/12-a--b',
  ])('rejects %s', (branch) => {
    expect(checkBranch(branch)).toEqual([
      `The branch "${branch}" is not "<type>/<issue>-<slug>", for example "feat/12-share-card". Open a new pull request from a renamed branch.`,
    ]);
  });
});

describe('linkedIssues', () => {
  it('finds Closes, Fixes and Resolves in any case and form, once each', () => {
    expect(linkedIssues('Closes #5\nfixes #6, RESOLVED: #7\nresolves #5')).toEqual([5, 6, 7]);
  });

  it('ignores the empty template line, other references and HTML comments', () => {
    expect(linkedIssues(template)).toEqual([]);
    expect(linkedIssues('Refs #4. See #5. Closes#6 <!-- Closes #7 -->')).toEqual([]);
    expect(linkedIssues('Closes #8 <!-- unterminated Closes #9')).toEqual([8]);
  });
});

describe('checkIssues', () => {
  it('passes for open issues', () => {
    expect(checkIssues([5], issues([[5, open]]))).toEqual([]);
  });

  it('says what to add when no issue is linked', () => {
    expect(checkIssues([], issues([]))).toEqual([
      'The description does not link an issue. Add a line "Closes #N" (or "Fixes #N" or "Resolves #N") naming the open issue this pull request resolves.',
    ]);
  });

  it('rejects missing, closed and pull request links', () => {
    const lookup = issues([
      [1, null],
      [2, { ...open, open: false }],
      [3, { ...open, isPullRequest: true }],
    ]);
    expect(checkIssues([1, 2, 3, 4], lookup)).toEqual([
      '#1 does not exist. Link an open issue.',
      '#2 is closed. Link an open issue.',
      '#3 is a pull request. Link an issue.',
      '#4 does not exist. Link an open issue.',
    ]);
  });
});

describe('checkMilestone', () => {
  it("passes when the milestone is every linked issue's milestone", () => {
    expect(
      checkMilestone(
        'bootstrap',
        [5, 6],
        issues([
          [5, open],
          [6, open],
        ]),
      ),
    ).toEqual([]);
  });

  it('names the milestone to set, or the mismatch', () => {
    const lookup = issues([
      [5, open],
      [6, { ...open, milestone: 'v0.1.0' }],
      [7, { ...open, milestone: null }],
      [8, { ...open, isPullRequest: true }],
      [9, null],
    ]);
    expect(checkMilestone(null, [5], lookup)).toEqual([
      'Set the milestone to "bootstrap", the milestone of #5.',
    ]);
    expect(checkMilestone('bootstrap', [5, 6, 7, 8, 9], lookup)).toEqual([
      'The milestone is "bootstrap", but #6 is in "v0.1.0".',
      '#7 has no milestone. Set one on the issue first.',
    ]);
  });
});

describe('checkLabels', () => {
  const ci = parseTitle('ci(ci): x');

  it('passes with one matching type label and an area label', () => {
    expect(checkLabels(['type/ci', 'area/ci', 'size/M'], ci)).toEqual([]);
    expect(checkLabels(['type/security', 'area/ui'], parseTitle('fix(ui): x'))).toEqual([]);
    expect(checkLabels(['type/docs', 'area/docs'], parseTitle('revert(docs): x'))).toEqual([]);
  });

  it('asks for exactly one type label that matches the title', () => {
    expect(checkLabels(['area/ci'], ci)).toEqual([
      'Set exactly one type/* label (found: none). The title type "ci" takes type/ci.',
    ]);
    expect(checkLabels(['type/ci', 'type/build', 'area/ci'], ci)).toEqual([
      'Set exactly one type/* label (found: type/ci, type/build). The title type "ci" takes type/ci.',
    ]);
    expect(checkLabels(['type/build', 'area/ci'], parseTitle('fix(ci): x'))).toEqual([
      'The label type/build does not match the title. The title type "fix" takes type/bug or type/security.',
    ]);
  });

  it('gives no type hint when the title cannot be read', () => {
    expect(checkLabels(['area/ci'], null)).toEqual(['Set exactly one type/* label (found: none).']);
    expect(checkLabels(['type/ci', 'area/ci'], parseTitle('nope(ci): x'))).toEqual([]);
  });

  it('asks for an area label', () => {
    expect(checkLabels(['type/ci'], ci)).toEqual(['Add at least one area/* label.']);
  });

  it('keeps "!" and the breaking-change label together', () => {
    const labels = ['type/feature', 'area/engine'];
    expect(checkLabels(labels, parseTitle('feat(engine)!: x'))).toEqual([
      'The title marks a breaking change with "!". Add the breaking-change label.',
    ]);
    expect(checkLabels([...labels, 'breaking-change'], parseTitle('feat(engine): x'))).toEqual([
      'The breaking-change label is set, but the title has no "!" after the type or scope.',
    ]);
    expect(checkLabels([...labels, 'breaking-change'], parseTitle('feat(engine)!: x'))).toEqual([]);
  });
});

describe('checkTemplate', () => {
  it('passes when every heading is kept', () => {
    expect(checkTemplate(filled, template)).toEqual([]);
  });

  it('names each deleted heading, ignoring headings inside comments', () => {
    const body = filled.replace('### Why is this PR large?\n', '').replace('### Checklist\n', '');
    expect(checkTemplate(body, template)).toEqual([
      'Keep the template heading "### Why is this PR large?". Write "N/A" under it rather than deleting it.',
      'Keep the template heading "### Checklist". Write "N/A" under it rather than deleting it.',
    ]);
    expect(checkTemplate('### A', '### A\n<!--\n### B\n-->')).toEqual([]);
  });
});

function pr(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    title: 'ci(ci): add the pr-hygiene workflow',
    body: filled,
    branch: 'ci/5-pr-hygiene',
    labels: ['type/ci', 'area/ci', 'size/L'],
    milestone: 'bootstrap',
    isBot: false,
    headRepository: 'o/r',
    ...overrides,
  };
}

describe('evaluate', () => {
  it('passes a pull request that follows every rule', () => {
    const checks = evaluate(pr(), issues([[5, open]]), template, 'success');
    expect(checks.map((check) => check.rule)).toEqual([
      'title',
      'branch',
      'issue link',
      'labels',
      'milestone',
      'template',
      'size',
    ]);
    expect(checks.every((check) => check.problems?.length === 0)).toBe(true);
  });

  it('fails a pull request without "Closes #N"', () => {
    const body = filled.replace('Closes #5', 'Closes #');
    const checks = evaluate(pr({ body }), issues([]), template, 'success');
    expect(checks.find((check) => check.rule === 'issue link')?.problems?.[0]).toMatch(
      /Add a line "Closes #N"/,
    );
  });

  it('skips the issue, milestone, branch and template rules for a bot', () => {
    const bot = pr({
      isBot: true,
      body: 'Bumps vite.',
      branch: 'dependabot/npm_and_yarn/vite-8.3.8',
      milestone: null,
    });
    const checks = evaluate(bot, issues([]), template, 'success');
    expect(checks.filter((check) => check.problems === null).map((check) => check.rule)).toEqual([
      'branch',
      'issue link',
      'milestone',
      'template',
    ]);
    expect(checks.flatMap((check) => check.problems ?? [])).toEqual([]);
  });

  it('fails when the pr-size job did not succeed', () => {
    const checks = evaluate(pr(), issues([[5, open]]), template, 'failure');
    expect(checks.at(-1)).toEqual({
      rule: 'size',
      problems: ['The pr-size job ended with "failure". See its log.'],
    });
  });
});

describe('summary', () => {
  it('renders a table with pass, fail and skipped rows', () => {
    expect(
      summary([
        { rule: 'title', problems: [] },
        { rule: 'labels', problems: ['Add a | b.', 'Second.'] },
        { rule: 'branch', problems: null },
      ]),
    ).toBe(
      [
        '### PR hygiene',
        '',
        '| Rule | Result | What to fix |',
        '|---|---|---|',
        '| title | pass | |',
        '| labels | **fail** | Add a \\| b.<br>Second. |',
        '| branch | skipped (bot) | |',
        '',
      ].join('\n'),
    );
  });
});
