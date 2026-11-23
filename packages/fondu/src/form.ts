// The same in the server and the browser, so a schema checked in the browser sees what the server's will.

const DEPTH = 32

const ENTRIES = 10_000

// a 400 on the server
export class MalformedForm extends Error {}

type Entry = [string, FormDataEntryValue]

// line breaks as CRLF, as the browser sends a <textarea>
export const crlf = (text: string) => text.replace(/\r\n|\r|\n/g, '\r\n')

/**
 * Form fields with PHP-style names (`notify[]`, `user[name]`) as one object. Throws `MalformedForm` for fields that can't be
 * one (`a=1&a[b]=2`) and past the depth and entry limits.
 */
export function formObject(entries: Iterable<Entry>): Record<string, unknown> {
  const body: Record<string, unknown> = Object.create(null)
  // `a[]`: each object's next index, the highest one so far + 1 (counted, not looked for: a body of many is linear)
  const next = new WeakMap<object, number>()
  const isObject = (v: unknown) => typeof v === 'object' && !isFile(v) && !Array.isArray(v)
  let count = 0
  for (const [key, value] of entries) {
    if (++count > ENTRIES) throw new MalformedForm(`more than ${ENTRIES} fields`)
    if (typeof value !== 'string' && value.size === 0 && value.name === '') continue
    // a limit: a name that is too deep is known from its first parts, the rest is not split
    const path = key.replace(/\]/g, '').split('[', DEPTH + 1)
    if (path.length > DEPTH) throw new MalformedForm(`a field name nests deeper than ${DEPTH}`)
    if (path.some((p) => p === '__proto__' || p === 'constructor' || p === 'prototype')) continue
    let target = body
    path.forEach((segment, i) => {
      const name = segment === '' ? String(next.get(target) ?? 0) : segment
      if (/^\d+$/.test(name)) next.set(target, Math.max(next.get(target) ?? 0, Number(name) + 1))
      const has = Object.hasOwn(target, name)
      if (i === path.length - 1) {
        if (has && isObject(target[name]))
          throw new MalformedForm(`\`${key}\` is both a value and an object`)
        // given again: a list, added to in place (a copy for each value is quadratic: a small body, much work)
        const previous = target[name]
        if (Array.isArray(previous)) previous.push(value)
        else target[name] = has ? [previous, value] : value
      } else {
        if (!has) target[name] = Object.create(null)
        else if (!isObject(target[name]))
          throw new MalformedForm(`\`${key}\` is both a value and an object`)
        target = target[name] as Record<string, unknown>
      }
    })
  }
  return arrays(body) as Record<string, unknown>
}

const isFile = (v: unknown) => typeof File !== 'undefined' && v instanceof File

const arrays = (value: unknown): unknown => {
  if (typeof value !== 'object' || value === null || isFile(value) || Array.isArray(value))
    return value
  const entries = Object.entries(value).map(([k, v]) => [k, arrays(v)] as const)
  const isList = entries.length > 0 && entries.every(([k], i) => k === String(i))
  return isList ? entries.map(([, v]) => v) : Object.fromEntries(entries)
}

export interface Issue {
  readonly message: string
  readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }> | undefined
}

// the form's own issues are `''`
const issueKey = (path: Issue['path']) =>
  (path ?? []).map((p) => String(typeof p === 'object' ? p.key : p)).join('.')

export const fieldKey = (name: string) =>
  name.replace(/\]/g, '').split('[').filter(Boolean).join('.')

/** each field's first message (no prototype: a field named `toString` is a field like any other) */
export function issueErrors(issues: ReadonlyArray<Issue>): Record<string, string> {
  const errors: Record<string, string> = Object.create(null)
  for (const issue of issues) errors[issueKey(issue.path)] ??= issue.message
  return errors
}
