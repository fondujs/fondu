/**
 * Form fields as one object, the same in the server (`readBody`, `withValidator`) and in the browser (`useForm`): a
 * schema checked in the browser sees what the server's will.
 */

/** how deep form field names nest (`a[b][c]`: 3) */
const DEPTH = 32

/** a body that can't be one object: a 400 on the server */
export class MalformedForm extends Error {}

type Entry = [string, FormDataEntryValue]

/**
 * Form fields with PHP-style names, as forms write them (`notify[]`, `user[name]`); files are `File`s, empty file
 * inputs are left out. A name given again is a list (`a=1&a=2`, `a[b]=1&a[b]=2`); `[]` is the index after the
 * highest one so far. Names that would change the object itself (`__proto__`…) are ignored. Throws `MalformedForm`
 * for fields that can't be one object (`a=1&a[b]=2`, names nested deeper than 32).
 */
export function formObject(entries: Iterable<Entry>): Record<string, unknown> {
  const body: Record<string, unknown> = Object.create(null)
  // `a[]`: each object's next index, the highest one so far + 1 (counted, not looked for: a body of many is linear)
  const next = new WeakMap<object, number>()
  const isObject = (v: unknown) => typeof v === 'object' && !isFile(v) && !Array.isArray(v)
  for (const [key, value] of entries) {
    if (typeof value !== 'string' && value.size === 0 && value.name === '') continue
    const path = key.replace(/\]/g, '').split('[')
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
        target[name] = has ? [target[name], value].flat() : value // given again: a list
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

/** objects whose keys are 0..n-1 become arrays */
const arrays = (value: unknown): unknown => {
  if (typeof value !== 'object' || value === null || isFile(value) || Array.isArray(value))
    return value
  const entries = Object.entries(value).map(([k, v]) => [k, arrays(v)] as const)
  const isList = entries.length > 0 && entries.every(([k], i) => k === String(i))
  return isList ? entries.map(([, v]) => v) : Object.fromEntries(entries)
}

/** A Standard Schema's issue, the part used here */
export interface Issue {
  readonly message: string
  readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }> | undefined
}

/** an issue's field: its path joined with dots (`user.name`, `tags.0`); the form's own issues are `''` */
export const issueKey = (path: Issue['path']) =>
  (path ?? []).map((p) => String(typeof p === 'object' ? p.key : p)).join('.')

/** a field name's key in the errors: `user[name]` → `user.name`, `tags[]` → `tags` */
export const fieldKey = (name: string) =>
  name.replace(/\]/g, '').split('[').filter(Boolean).join('.')

/** each field's first message (no prototype: a field named `toString` is a field like any other) */
export function issueErrors(issues: ReadonlyArray<Issue>): Record<string, string> {
  const errors: Record<string, string> = Object.create(null)
  for (const issue of issues) errors[issueKey(issue.path)] ??= issue.message
  return errors
}
