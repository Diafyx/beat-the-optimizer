// A small GitHub REST client for the pr-hygiene workflow, the failure reports
// of the scheduled workflows and the preview comment. It reads pull requests
// and issues, sets labels, opens issues, and writes comments. The fetch function is injectable so
// the tests never touch the network.

export interface PullRequest {
  title: string;
  body: string;
  branch: string;
  labels: string[];
  milestone: string | null;
  /** True for app and bot accounts such as Dependabot and the release bot. */
  isBot: boolean;
  /** "owner/name" of the head repository; null if the fork was deleted. */
  headRepository: string | null;
}

export interface Issue {
  open: boolean;
  isPullRequest: boolean;
  milestone: string | null;
}

/** An open issue as the failure reports need it. */
export interface IssueSummary {
  number: number;
  body: string;
  url: string;
}

export interface NewIssue {
  title: string;
  body: string;
  labels: readonly string[];
}

/** A comment on an issue or a pull request. */
export interface Comment {
  id: number;
  body: string;
  /** True for app and bot accounts, such as github-actions. */
  isBot: boolean;
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

function object(value: unknown, what: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`GitHub API: ${what} is not an object`);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, what: string): string {
  if (typeof value !== 'string') throw new Error(`GitHub API: ${what} is not a string`);
  return value;
}

function milestoneTitle(value: unknown): string | null {
  return value === null ? null : string(object(value, 'milestone')['title'], 'milestone title');
}

/** Reads the fields the rules need from a GET /pulls/{n} response. */
export function toPullRequest(json: unknown): PullRequest {
  const pr = object(json, 'pull request');
  const head = object(pr['head'], 'head');
  const labels = pr['labels'];
  if (!Array.isArray(labels)) throw new Error('GitHub API: labels is not a list');
  return {
    title: string(pr['title'], 'title'),
    body: pr['body'] === null ? '' : string(pr['body'], 'body'),
    branch: string(head['ref'], 'head ref'),
    labels: labels.map((label: unknown) => string(object(label, 'label')['name'], 'label name')),
    milestone: milestoneTitle(pr['milestone']),
    isBot: object(pr['user'], 'user')['type'] === 'Bot',
    headRepository:
      head['repo'] === null ? null : string(object(head['repo'], 'repo')['full_name'], 'repo name'),
  };
}

/** Reads the fields the rules need from a GET /issues/{n} response. */
export function toIssue(json: unknown): Issue {
  const issue = object(json, 'issue');
  return {
    open: issue['state'] === 'open',
    isPullRequest: 'pull_request' in issue,
    milestone: milestoneTitle(issue['milestone']),
  };
}

/** Reads an issue from a list or create response. */
export function toIssueSummary(json: unknown): IssueSummary {
  const issue = object(json, 'issue');
  const number = issue['number'];
  if (typeof number !== 'number') throw new Error('GitHub API: issue number is not a number');
  return {
    number,
    body: issue['body'] === null ? '' : string(issue['body'], 'issue body'),
    url: string(issue['html_url'], 'issue URL'),
  };
}

/** Reads a comment from a list response. */
export function toComment(json: unknown): Comment {
  const comment = object(json, 'comment');
  const id = comment['id'];
  if (typeof id !== 'number') throw new Error('GitHub API: comment id is not a number');
  return {
    id,
    body: string(comment['body'], 'comment body'),
    isBot: object(comment['user'], 'user')['type'] === 'Bot',
  };
}

export type GitHub = ReturnType<typeof gitHub>;

export function gitHub(repository: string, token: string, fetchFn: FetchLike = fetch) {
  const call = (method: string, path: string, body?: unknown): Promise<Response> =>
    fetchFn(`https://api.github.com/repos/${repository}${path}`, {
      method,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'x-github-api-version': '2022-11-28',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

  const fail = async (what: string, response: Response): Promise<never> => {
    throw new Error(
      `GitHub API: ${what} failed: ${String(response.status)} ${await response.text()}`,
    );
  };

  return {
    async pull(number: number): Promise<PullRequest> {
      const response = await call('GET', `/pulls/${String(number)}`);
      if (!response.ok) return fail(`reading pull request #${String(number)}`, response);
      return toPullRequest(await response.json());
    },

    /** The issue, or null if it does not exist or was deleted. */
    async issue(number: number): Promise<Issue | null> {
      const response = await call('GET', `/issues/${String(number)}`);
      if (response.status === 404 || response.status === 410) return null;
      if (!response.ok) return fail(`reading issue #${String(number)}`, response);
      return toIssue(await response.json());
    },

    async addLabels(number: number, labels: readonly string[]): Promise<void> {
      const response = await call('POST', `/issues/${String(number)}/labels`, { labels });
      if (!response.ok) await fail(`adding labels to #${String(number)}`, response);
    },

    /** Removes a label; a label that is already gone is fine. */
    async removeLabel(number: number, label: string): Promise<void> {
      const path = `/issues/${String(number)}/labels/${encodeURIComponent(label)}`;
      const response = await call('DELETE', path);
      if (!response.ok && response.status !== 404) {
        await fail(`removing ${label} from #${String(number)}`, response);
      }
    },

    /** Open issues with the label, not pull requests; the first 100 only. */
    async openIssues(label: string): Promise<IssueSummary[]> {
      const query = `state=open&labels=${encodeURIComponent(label)}&per_page=100`;
      const response = await call('GET', `/issues?${query}`);
      if (!response.ok) return fail(`listing issues labelled ${label}`, response);
      const list: unknown = await response.json();
      if (!Array.isArray(list)) throw new Error('GitHub API: issues is not a list');
      return list
        .map((issue: unknown) => object(issue, 'issue'))
        .filter((issue) => !('pull_request' in issue))
        .map(toIssueSummary);
    },

    async createIssue(issue: NewIssue): Promise<IssueSummary> {
      const response = await call('POST', '/issues', issue);
      if (!response.ok) return fail('creating an issue', response);
      return toIssueSummary(await response.json());
    },

    async comment(number: number, body: string): Promise<void> {
      const response = await call('POST', `/issues/${String(number)}/comments`, { body });
      if (!response.ok) await fail(`commenting on #${String(number)}`, response);
    },

    /** The comments on an issue or pull request; the first 100 only. */
    async comments(number: number): Promise<Comment[]> {
      const response = await call('GET', `/issues/${String(number)}/comments?per_page=100`);
      if (!response.ok) return fail(`listing the comments on #${String(number)}`, response);
      const list: unknown = await response.json();
      if (!Array.isArray(list)) throw new Error('GitHub API: comments is not a list');
      return list.map(toComment);
    },

    async editComment(id: number, body: string): Promise<void> {
      const response = await call('PATCH', `/issues/comments/${String(id)}`, { body });
      if (!response.ok) await fail(`editing comment ${String(id)}`, response);
    },
  };
}

/** A GitHub Actions error annotation, escaped as the Actions runner expects. */
export function annotation(title: string, message: string): string {
  const data = (text: string): string =>
    text.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
  const property = (text: string): string =>
    data(text).replaceAll(':', '%3A').replaceAll(',', '%2C');
  return `::error title=${property(title)}::${data(message)}`;
}
