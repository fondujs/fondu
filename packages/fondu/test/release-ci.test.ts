import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { waitForCI } from '../../../scripts/wait-for-ci.js'

const sha = 'a'.repeat(40)
const options = { repository: 'fondujs/fondu', sha, token: 'test-token', interval: 0 }
const ci = {
  id: 100,
  check_suite_id: 10,
  head_sha: sha,
  head_branch: 'main',
  event: 'push',
  status: 'completed',
  conclusion: 'success' as string | null,
}
const check = (name: string, conclusion: string | null = 'success', status = 'completed') => ({
  name,
  head_sha: sha,
  status,
  conclusion,
})
const green = [check('check'), check('windows'), check('conformance (webkit)'), check('size')]

// Each poll gets one state. Unknown endpoints fail rather than touching the network.
function respond(...states: Array<{ runs?: (typeof ci)[]; checks?: ReturnType<typeof check>[] }>) {
  let poll = 0
  let state = states[0]
  const api = vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input))
    if (url.pathname.endsWith('/actions/workflows/ci.yml/runs')) {
      state = states[Math.min(poll++, states.length - 1)]
      return Response.json({ workflow_runs: state.runs ?? [ci] })
    }
    if (url.pathname.endsWith('/check-runs')) {
      const checks = state.checks ?? green
      return Response.json({ total_count: checks.length, check_runs: checks })
    }
    throw new Error(`unexpected request: ${url}`)
  })
  vi.stubGlobal('fetch', api)
  return api
}

// Expire while polling, without sleeping or assuming how quickly the machine can run a request.
function expires() {
  const controller = new AbortController()
  vi.mocked(console.info).mockImplementation(() =>
    controller.abort(new DOMException('test deadline', 'TimeoutError')),
  )
  return { ...options, signal: controller.signal, interval: 60_000 }
}

beforeEach(() => vi.spyOn(console, 'info').mockImplementation(() => {}))
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('release waits for CI on the tagged commit', () => {
  test('all jobs and the workflow must succeed; scope checks to CI, not the Release suite', async () => {
    const api = respond({})
    const deadline = vi.spyOn(AbortSignal, 'timeout')
    await waitForCI(options)
    expect(deadline).toHaveBeenCalledExactlyOnceWith(20 * 60_000)
    const [url, init] = api.mock.calls[0]
    expect(String(url)).toContain('/actions/workflows/ci.yml/runs?')
    expect(new URL(String(url)).searchParams.get('head_sha')).toBe(sha)
    expect(new URL(String(url)).searchParams.get('event')).toBe('push')
    expect(new URL(String(url)).searchParams.get('branch')).toBe('main')
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer test-token')
    expect(new Headers(init?.headers).get('X-GitHub-Api-Version')).toBe('2022-11-28')
    expect(init?.signal).toBe(deadline.mock.results[0].value)
    expect(init?.redirect).toBe('error')
    expect(String(api.mock.calls[1][0])).toContain('/check-suites/10/check-runs?filter=latest')
  })

  test('empty or partially scheduled CI is not green just because visible checks succeeded', async () => {
    const api = respond(
      { runs: [] },
      { runs: [{ ...ci, status: 'queued', conclusion: null }], checks: [] },
      { runs: [{ ...ci, status: 'in_progress', conclusion: null }], checks: green },
      {},
    )
    await waitForCI(options)
    expect(api.mock.calls.filter(([url]) => String(url).includes('/workflows/'))).toHaveLength(4)
  })

  test('ignore PR runs, another commit and another branch, even if they passed', async () => {
    const api = respond(
      {
        runs: [
          { ...ci, event: 'pull_request' },
          { ...ci, head_sha: 'b'.repeat(40) },
          { ...ci, head_branch: 'other' },
        ],
      },
      {},
    )
    await waitForCI(options)
    expect(api.mock.calls.filter(([url]) => String(url).includes('/workflows/'))).toHaveLength(2)
  })

  test('a newer run cannot be bypassed with an older green run', async () => {
    const api = respond({
      runs: [ci, { ...ci, id: 101, check_suite_id: 11 }],
      checks: [check('windows', 'failure')],
    })
    await expect(waitForCI(options)).rejects.toThrow('windows (failure)')
    expect(String(api.mock.calls[1][0])).toContain('/check-suites/11/')
  })

  test.each([
    'failure',
    'cancelled',
    'timed_out',
    'skipped',
    'neutral',
    'action_required',
    'stale',
    null,
  ])(
    'reject a job with conclusion %s, naming it even if the workflow reports success',
    async (conclusion) => {
      respond({ checks: [...green, check('a new CI job', conclusion)] })
      await expect(waitForCI(options)).rejects.toThrow(
        `a new CI job (${conclusion ?? 'no conclusion'})`,
      )
    },
  )

  test('the non-gating size report still must succeed before a release', async () => {
    respond({ checks: [check('size', 'failure')] })
    await expect(waitForCI(options)).rejects.toThrow('size (failure)')
  })

  test('a cancelled workflow that never scheduled any jobs is a failure', async () => {
    respond({ runs: [{ ...ci, conclusion: 'cancelled' }], checks: [] })
    await expect(waitForCI(options)).rejects.toThrow('workflow cancelled; no CI check jobs started')
  })

  test('a workflow failure cannot be bypassed with green check runs', async () => {
    respond({ runs: [{ ...ci, conclusion: 'failure' }] })
    await expect(waitForCI(options)).rejects.toThrow('workflow failure')
  })

  test('a missing workflow times out instead of staging anything', async () => {
    respond({ runs: [] })
    await expect(waitForCI(expires())).rejects.toThrow('CI workflow never started')
  })

  test('a completed workflow without check jobs cannot pass', async () => {
    respond({ checks: [] })
    await expect(waitForCI(expires())).rejects.toThrow('no CI check jobs started')
  })

  test.each(['queued', 'in_progress', 'waiting'])(
    'name an unfinished %s job at the deadline',
    async (status) => {
      respond({ checks: [check('windows', null, status)] })
      await expect(waitForCI(expires())).rejects.toThrow(`unfinished CI jobs: windows (${status})`)
    },
  )

  test('paginate checks: a failed job beyond the first 100 still blocks release', async () => {
    const api = respond({})
    api.mockImplementation(async (input) => {
      const url = new URL(String(input))
      if (url.pathname.includes('/workflows/')) return Response.json({ workflow_runs: [ci] })
      const checks =
        url.searchParams.get('page') === '1'
          ? Array.from({ length: 100 }, (_, i) => check(`job ${i}`))
          : [check('windows', 'failure')]
      return Response.json({ total_count: 101, check_runs: checks })
    })
    await expect(waitForCI(options)).rejects.toThrow('windows (failure)')
    expect(api).toHaveBeenCalledTimes(3)
  })

  test('an incomplete page cannot silently drop a job', async () => {
    const api = respond({})
    api.mockImplementation(async (input) =>
      Response.json(
        String(input).includes('/workflows/')
          ? { workflow_runs: [ci] }
          : { total_count: 1, check_runs: [] },
      ),
    )
    await expect(waitForCI(options)).rejects.toThrow('incomplete CI check list')
  })

  test('checks from another commit cannot authorize the tag', async () => {
    respond({ checks: [{ ...check('windows'), head_sha: 'b'.repeat(40) }] })
    await expect(waitForCI(options)).rejects.toThrow('different commit')
  })

  test('API errors fail closed, without retrying to get green', async () => {
    const api = respond({})
    api.mockResolvedValue(new Response('Forbidden', { status: 403 }))
    await expect(waitForCI(options)).rejects.toThrow('GitHub API 403')
    expect(api).toHaveBeenCalledTimes(1)
  })

  test('the deadline also interrupts a stalled API request', async () => {
    const controller = new AbortController()
    const api = respond({})
    api.mockImplementation(async (_input, init) => {
      controller.abort(new DOMException('test deadline', 'TimeoutError'))
      init?.signal?.throwIfAborted()
      throw new Error('the request was not aborted')
    })
    await expect(waitForCI({ ...options, signal: controller.signal })).rejects.toThrow('deadline')
  })
})
