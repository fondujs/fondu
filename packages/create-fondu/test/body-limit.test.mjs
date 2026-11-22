import assert from 'node:assert/strict'
import { test } from 'node:test'

import { knownProxyFailure, received, uploadEvidence } from './body-limit.mjs'

const refusal = 'fondu:upload big worker 413\n'
const pipe = 'fondu:upload big proxy write EPIPE\n'
const client = { status: 500 }

test('only a complete client 500 with both records for that POST is the known proxy failure', () => {
  const evidence = uploadEvidence(pipe + refusal, 'big')
  assert.ok(knownProxyFailure(client, evidence))
  for (const other of [{}, { status: 502 }, { status: 500, error: 'body interrupted' }])
    assert.ok(!knownProxyFailure(other, evidence))

  for (const log of [
    refusal,
    pipe,
    pipe + 'POST /upload 413\n',
    pipe + refusal.replace('big', 'old'),
    refusal + pipe.replace('big', 'small'),
    pipe + refusal.replace('413', '500'),
    pipe + refusal.trimEnd(),
    pipe + refusal + refusal.replace('413', '500'),
  ])
    assert.ok(!knownProxyFailure(client, uploadEvidence(log, 'big')), log)
})

test('the control must have reached the upload handler and returned 200', () => {
  assert.ok(received({ status: 200, text: 'received' }))
  for (const other of [
    { status: 200, text: '' },
    { status: 404 },
    { status: 500, text: 'received' },
  ])
    assert.ok(!received(other))
})
