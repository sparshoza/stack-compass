const FALLBACK_REPO = 'https://github.com/sparshoza/stack-compass'

export const REPO_URL = (import.meta.env.VITE_REPO_URL || FALLBACK_REPO).replace(/\/+$/, '')

export const WHICHDB_URL = 'https://whichdb.dev'

/** A pre-filled GitHub new-issue link. Nothing the visitor typed is added. */
export function newIssueUrl(title = 'Catalog correction', body = ''): string {
  const params = new URLSearchParams({ title })
  if (body) params.set('body', body)
  return `${REPO_URL}/issues/new?${params.toString()}`
}

export const REPORT_ISSUE_BODY = [
  'Which tool or screen is wrong?',
  '',
  'What should it say, and where is that stated (official site or docs link)?',
].join('\n')
