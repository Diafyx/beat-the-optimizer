// The pull request rules from CONTRIBUTING.md, checked by the pr-hygiene
// workflow. Each check returns the problems it found, phrased as what to fix.
import type { Issue, PullRequest } from './github.ts';
import { headings, stripComments } from './markdown.ts';

export const TYPES = [
  'feat',
  'fix',
  'perf',
  'refactor',
  'test',
  'docs',
  'ci',
  'build',
  'chore',
  'revert',
] as const;
export type CommitType = (typeof TYPES)[number];

/** Title scopes: the area/* label names, plus `deps` for dependency updates. */
export const SCOPES = [
  'engine',
  'levels',
  'authoring',
  'ui',
  'share',
  'analytics',
  'deploy',
  'ci',
  'docs',
  'release',
  'deps',
] as const;

const ANY_TYPE_LABEL = [
  'type/feature',
  'type/bug',
  'type/perf',
  'type/refactor',
  'type/test',
  'type/docs',
  'type/ci',
  'type/build',
  'type/chore',
  'type/security',
];

/** The type/* labels each title type accepts. A revert takes the label of what it reverts. */
export const TYPE_LABELS: Readonly<Record<CommitType, readonly string[]>> = {
  feat: ['type/feature'],
  fix: ['type/bug', 'type/security'],
  perf: ['type/perf'],
  refactor: ['type/refactor'],
  test: ['type/test'],
  docs: ['type/docs'],
  ci: ['type/ci'],
  build: ['type/build'],
  chore: ['type/chore'],
  revert: ANY_TYPE_LABEL,
};

export interface Title {
  type: string;
  scope: string;
  breaking: boolean;
}

const isType = (type: string): type is CommitType => (TYPES as readonly string[]).includes(type);

export function parseTitle(title: string): Title | null {
  const match = /^([a-z]+)\(([a-z-]+)\)(!?): \S/.exec(title);
  if (!match) return null;
  // Every group takes part in a match, so all three are strings.
  const [type, scope, bang] = match.slice(1) as [string, string, string];
  return { type, scope, breaking: bang === '!' };
}

export function checkTitle(title: string): string[] {
  const parsed = parseTitle(title);
  if (!parsed) {
    return [
      `The title "${title}" is not "type(scope): summary", for example "feat(share): add the share card".`,
    ];
  }
  const problems: string[] = [];
  if (!isType(parsed.type)) {
    problems.push(`The title type "${parsed.type}" is not one of: ${TYPES.join(', ')}.`);
  }
  if (!(SCOPES as readonly string[]).includes(parsed.scope)) {
    problems.push(`The title scope "${parsed.scope}" is not one of: ${SCOPES.join(', ')}.`);
  }
  return problems;
}

const BRANCH = new RegExp(`^(?:${TYPES.join('|')})/[1-9][0-9]*-[a-z0-9]+(?:-[a-z0-9]+)*$`);

export function checkBranch(branch: string): string[] {
  if (BRANCH.test(branch)) return [];
  return [
    `The branch "${branch}" is not "<type>/<issue>-<slug>", for example "feat/12-share-card". Open a new pull request from a renamed branch.`,
  ];
}

/** Issues the description closes with Closes, Fixes or Resolves #N, in order. */
export function linkedIssues(body: string): number[] {
  const pattern = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?):?\s+#([0-9]+)\b/gi;
  const numbers = [...stripComments(body).matchAll(pattern)].map((match) => Number(match[1]));
  return [...new Set(numbers)];
}

export type IssueLookup = ReadonlyMap<number, Issue | null>;

export function checkIssues(linked: readonly number[], issues: IssueLookup): string[] {
  if (linked.length === 0) {
    return [
      'The description does not link an issue. Add a line "Closes #N" (or "Fixes #N" or "Resolves #N") naming the open issue this pull request resolves.',
    ];
  }
  return linked.flatMap((number) => {
    const issue = issues.get(number);
    if (!issue) return [`#${String(number)} does not exist. Link an open issue.`];
    if (issue.isPullRequest) return [`#${String(number)} is a pull request. Link an issue.`];
    if (!issue.open) return [`#${String(number)} is closed. Link an open issue.`];
    return [];
  });
}

export function checkMilestone(
  milestone: string | null,
  linked: readonly number[],
  issues: IssueLookup,
): string[] {
  return linked.flatMap((number) => {
    const issue = issues.get(number);
    if (!issue || issue.isPullRequest) return []; // reported by checkIssues
    const ref = `#${String(number)}`;
    if (issue.milestone === null) return [`${ref} has no milestone. Set one on the issue first.`];
    if (milestone === null)
      return [`Set the milestone to "${issue.milestone}", the milestone of ${ref}.`];
    if (milestone !== issue.milestone) {
      return [`The milestone is "${milestone}", but ${ref} is in "${issue.milestone}".`];
    }
    return [];
  });
}

export function checkLabels(labels: readonly string[], title: Title | null): string[] {
  const problems: string[] = [];
  const types = labels.filter((label) => label.startsWith('type/'));
  const expected = title && isType(title.type) ? TYPE_LABELS[title.type] : null;
  const hint =
    expected && title ? ` The title type "${title.type}" takes ${expected.join(' or ')}.` : '';
  const [only] = types;
  if (types.length !== 1 || only === undefined) {
    const found = types.length === 0 ? 'none' : types.join(', ');
    problems.push(`Set exactly one type/* label (found: ${found}).${hint}`);
  } else if (expected && !expected.includes(only)) {
    problems.push(`The label ${only} does not match the title.${hint}`);
  }
  if (!labels.some((label) => label.startsWith('area/'))) {
    problems.push('Add at least one area/* label.');
  }
  const breakingLabel = labels.includes('breaking-change');
  if (title?.breaking && !breakingLabel) {
    problems.push('The title marks a breaking change with "!". Add the breaking-change label.');
  } else if (title && !title.breaking && breakingLabel) {
    problems.push(
      'The breaking-change label is set, but the title has no "!" after the type or scope.',
    );
  }
  return problems;
}

export function checkTemplate(body: string, template: string): string[] {
  const present = new Set(headings(body));
  return headings(template)
    .filter((heading) => !present.has(heading))
    .map(
      (heading) =>
        `Keep the template heading "${heading}". Write "N/A" under it rather than deleting it.`,
    );
}

export interface Check {
  rule: string;
  /** The problems found; null if the rule does not apply (bot pull requests). */
  problems: readonly string[] | null;
}

/**
 * Every rule pr-hygiene checks. `sizeResult` is the result of the pr-size job,
 * which computes the size, sets the label and applies the size/XXL rule.
 */
export function evaluate(
  pr: PullRequest,
  issues: IssueLookup,
  template: string,
  sizeResult: string,
): Check[] {
  const linked = linkedIssues(pr.body);
  const human = !pr.isBot;
  return [
    { rule: 'title', problems: checkTitle(pr.title) },
    { rule: 'branch', problems: human ? checkBranch(pr.branch) : null },
    { rule: 'issue link', problems: human ? checkIssues(linked, issues) : null },
    { rule: 'labels', problems: checkLabels(pr.labels, parseTitle(pr.title)) },
    { rule: 'milestone', problems: human ? checkMilestone(pr.milestone, linked, issues) : null },
    { rule: 'template', problems: human ? checkTemplate(pr.body, template) : null },
    {
      rule: 'size',
      problems:
        sizeResult === 'success'
          ? []
          : [`The pr-size job ended with "${sizeResult}". See its log.`],
    },
  ];
}

/** A Markdown table of the checks, for the job summary. */
export function summary(checks: readonly Check[]): string {
  const rows = checks.map(({ rule, problems }) => {
    if (problems === null) return `| ${rule} | skipped (bot) | |`;
    if (problems.length === 0) return `| ${rule} | pass | |`;
    return `| ${rule} | **fail** | ${problems.join('<br>').replaceAll('|', '\\|')} |`;
  });
  return [
    '### PR hygiene',
    '',
    '| Rule | Result | What to fix |',
    '|---|---|---|',
    ...rows,
    '',
  ].join('\n');
}
