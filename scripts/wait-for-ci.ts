// Release gate: only the CI workflow's main-branch push run on the tagged SHA counts, not PR or Release checks.
// Run with Node 24 (release.yml); no install or third-party action is needed. The wait includes API requests.
import { setTimeout as sleep } from 'node:timers/promises'

interface Run {
  id: number
  check_suite_id: number
  head_sha: string
  head_branch: string
  event: string
  status: string
  conclusion: string | null
}
interface Check {
  name: string
  head_sha: string
  status: string
  conclusion: string | null
}

export async function waitForCI({
  repository,
  sha,
  token,
  apiUrl = 'https://api.github.com',
  signal = AbortSignal.timeout(20 * 60_000),
  interval = 15_000,
}: {
  repository: string
  sha: string
  token: string
  apiUrl?: string
  signal?: AbortSignal
  interval?: number
}) {
  const get = async <T>(path: string): Promise<T> => {
    const response = await fetch(`${apiUrl}/repos/${repository}/${path}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'fondu-release-ci',
      },
      redirect: 'error',
      signal,
    })
    if (!response.ok) throw new Error(`GitHub API ${response.status}: ${path}`)
    return response.json() as Promise<T>
  }
  let waiting = 'CI workflow never started'
  try {
    for (;;) {
      signal.throwIfAborted()
      const { workflow_runs: runs } = await get<{ workflow_runs: Run[] }>(
        `actions/workflows/ci.yml/runs?head_sha=${sha}&branch=main&event=push&per_page=100`,
      )
      const run = runs
        .filter((r) => r.head_sha === sha && r.head_branch === 'main' && r.event === 'push')
        .sort((a, b) => b.id - a.id)[0]
      const checks: Check[] = []
      if (run?.check_suite_id) {
        // Scope checks to this CI suite: waiting on all checks of the SHA would wait on Release itself.
        // `latest` keeps reruns from being rejected for a job's older attempt. Read every page, not just the first 100.
        for (let page = 1; ; page++) {
          const data = await get<{ check_runs: Check[]; total_count: number }>(
            `check-suites/${run.check_suite_id}/check-runs?filter=latest&per_page=100&page=${page}`,
          )
          checks.push(...data.check_runs)
          if (checks.length >= data.total_count) break
          if (!data.check_runs.length)
            throw new Error('GitHub returned an incomplete CI check list')
        }
      }
      if (checks.some((check) => check.head_sha !== sha))
        throw new Error('CI check suite belongs to a different commit')
      const pending = checks.filter((check) => check.status !== 'completed')
      const failed = checks.filter(
        (check) => check.status === 'completed' && check.conclusion !== 'success',
      )
      const label = (check: Check) =>
        `${check.name} (${check.status === 'completed' ? (check.conclusion ?? 'no conclusion') : check.status})`
      waiting = !run
        ? 'CI workflow never started'
        : !checks.length
          ? 'no CI check jobs started'
          : pending.length
            ? `unfinished CI jobs: ${pending.map(label).join(', ')}`
            : `CI workflow is ${run.status}`
      if (failed.length || (run?.status === 'completed' && run.conclusion !== 'success'))
        throw new Error(
          `CI did not succeed for ${sha}: ${failed.map(label).join(', ') || `workflow ${run?.conclusion ?? 'has no conclusion'}`}; ${waiting}`,
        )
      // Successful visible jobs alone are not enough: the workflow must finish too, so unscheduled jobs cannot pass.
      if (run?.status === 'completed' && checks.length && !pending.length) {
        console.info(`CI succeeded for ${sha} (${checks.length} jobs, run ${run.id})`)
        return
      }
      console.info(`Waiting for CI on ${sha}: ${waiting}`)
      await sleep(interval, undefined, { signal })
    }
  } catch (error) {
    if (signal.aborted)
      throw new Error(`CI wait reached its deadline or was aborted for ${sha}: ${waiting}`, {
        cause: error,
      })
    throw error
  }
}

if (import.meta.main) {
  try {
    const { GITHUB_REPOSITORY, GITHUB_SHA, GITHUB_TOKEN, GITHUB_API_URL } = process.env
    if (!GITHUB_REPOSITORY || !GITHUB_SHA || !GITHUB_TOKEN)
      throw new Error('GITHUB_REPOSITORY, GITHUB_SHA and GITHUB_TOKEN are required')
    await waitForCI({
      repository: GITHUB_REPOSITORY,
      sha: GITHUB_SHA,
      token: GITHUB_TOKEN,
      apiUrl: GITHUB_API_URL,
    })
  } catch (error) {
    console.error((error as Error).message)
    process.exitCode = 1
  }
}
