import { back, defineHandler, flash, render } from 'fondu'
import * as z from 'zod/mini'

import { callAuth, requireUser } from '#/lib/auth.server.ts'
import { toDataUrl } from '#/lib/images.server.ts'

export const loader = defineHandler(requireUser, (c) => {
  const { name, email, image, role } = c.get('user')!
  // private: Inertia keeps it in the browser history encrypted; signing out makes it unreadable
  return render(
    c,
    'account',
    { account: { name, email, image: image ?? null, role: role ?? 'user' } },
    { encryptHistory: true },
  )
})

// multipart (the form has a file): `avatar` is a File
export const action = defineHandler.withValidator({
  body: z.object({
    name: z.string().check(z.trim(), z.minLength(2, 'At least 2 characters'), z.maxLength(40, 'At most 40 characters')),
    avatar: z.optional(z.instanceof(File).check(z.refine((f) => f.size <= 256 * 1024, 'At most 256 kB'))),
  }),
})(requireUser, async (c, { body }) => {
  // through Better Auth's handler: it also renews the session cookie, which holds the user (cookieCache)
  await callAuth(
    c,
    '/update-user',
    { name: body.name, ...(body.avatar && { image: await toDataUrl(body.avatar) }) },
    'name',
  )
  flash(c, { message: 'Profile saved' })
  return back(c)
})
