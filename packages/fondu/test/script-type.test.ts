import { expect, test } from 'vitest'

import { runsAsScript } from '../src/script-type.js'

test('the scripts the browser runs: no type, JavaScript, module, importmap, speculationrules (#268)', () => {
  for (const attrs of [
    '',
    ' defer',
    ' type=""',
    ' type="text/javascript"',
    " type='application/javascript'",
    ' type=TEXT/JavaScript',
    ' type=" module "',
    ' type="MODULE"',
    ' type="importmap"',
    ' type="speculationrules"',
    ' data-type="application/ld+json"', // another attribute
    ' data-x="type=json"',
  ])
    expect(runsAsScript(attrs), attrs).toBe(true)
})

test('a data block is not run: any other type', () => {
  for (const attrs of [
    ' type="application/ld+json"',
    " type='application/json'",
    ' type=application/ld+json',
    ' type = "text/template"',
    ' id="x" type="application/ld+json" data-a="b"',
    ' type="text/plain"',
  ])
    expect(runsAsScript(attrs), attrs).toBe(false)
})
