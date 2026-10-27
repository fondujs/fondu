import { desc, eq } from 'drizzle-orm'
import { back, defineHandler, flash, render } from 'fondu'
import { href, useForm, useNavigation, usePage } from 'fondu/client'
import { Trash2Icon } from 'lucide-react'
import * as z from 'zod/mini'

import { DemoCard, SignInFirst, SubmitButton, TextField, Title } from '#/components/demo.tsx'
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '#/components/ui/alert-dialog.tsx'
import { Button } from '#/components/ui/button.tsx'
import { db } from '#/db/index.server.ts'
import { contacts } from '#/db/schema/index.ts'
import { requireUser } from '#/modules/auth/auth.server.ts'
import { newContactSchema } from '#/modules/contacts/contacts.server.ts'
import { contactSchema } from '#/modules/contacts/schemas.ts'

export const loader = defineHandler(async (c) =>
  render(c, Contacts, {
    contacts: await db.select().from(contacts).orderBy(desc(contacts.id)),
  }),
)

// two forms, an action each (`actions`: posted to ?create, ?delete)
export const actions = {
  // POST /contacts?create — signed in only; invalid: 303 back with the errors
  create: defineHandler.withValidator({ body: newContactSchema })(
    requireUser,
    async (c, { body }) => {
      await db.insert(contacts).values(body)
      flash(c, { message: `Added ${body.name}` })
      return back(c)
    },
  ),
  // POST /contacts?delete — signed in only
  delete: defineHandler.withValidator({ body: z.object({ id: z.coerce.number().check(z.int()) }) })(
    requireUser,
    async (c, { body }) => {
      await db.delete(contacts).where(eq(contacts.id, body.id))
      flash(c, { message: 'Contact deleted' })
      return back(c)
    },
  ),
}

type Contact = { id: number; name: string; email: string }

export default function Contacts({ contacts }: { contacts: Contact[] }) {
  const { auth } = usePage().props
  // the action's schema, in the browser too: an invalid form isn't sent; the server checks again (and what only it
  // can, an address already taken)
  const { form, field, errors } = useForm(contactSchema)
  // a contact being deleted: the form being sent is its form, the trash button shows it
  const sending = useNavigation().form
  return (
    <>
      <Title>Forms & validation</Title>
      <h1>Forms & validation</h1>
      <p className="lede">
        A plain form, checked in the browser by the action&apos;s own schema before it is sent, then
        on the server: invalid input there is answered with a 303 back to this page and the errors
        in its <code>errors</code> prop, what was typed still there. Contacts are stored in D1.
      </p>
      {/* adding, changing and deleting are for signed-in users (the actions use requireUser) */}
      {auth.user ? (
        <div className="mb-4 sm:max-w-md">
          <DemoCard title="Add a contact" tag="one schema, browser and server">
            <form
              action={href('/contacts?create')}
              method="post"
              className="grid gap-4"
              data-testid="add-contact"
              {...form}
            >
              <TextField label="Name" {...field('name')} error={errors.name} testid="err-name" />
              <TextField
                label="Email"
                {...field('email')}
                error={errors.email}
                testid="err-email"
              />
              <SubmitButton>Add contact</SubmitButton>
            </form>
          </DemoCard>
        </div>
      ) : (
        <div className="mb-4">
          <SignInFirst>to add, change or delete contacts.</SignInFirst>
        </div>
      )}
      <DemoCard title="Contacts" tag="a confirmed delete">
        <ul className="divide-y" data-testid="contacts">
          {contacts.map((contact) => (
            <li key={contact.id} className="flex items-center gap-3 py-2">
              <a
                href={href('/contacts/:id', { id: contact.id })}
                className="font-medium hover:underline"
              >
                {contact.name}
              </a>
              <span className="truncate text-muted-foreground">{contact.email}</span>
              {/* POST /contacts?delete once confirmed. Without JavaScript, the button deletes at once. */}
              {auth.user && (
                <form
                  id={`delete-${contact.id}`}
                  action={href('/contacts?delete')}
                  method="post"
                  className="ml-auto"
                >
                  <input type="hidden" name="id" value={contact.id} />
                  <AlertDialog>
                    <AlertDialogTrigger
                      type="submit"
                      onClick={(e) => e.preventDefault()}
                      render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Delete ${contact.name}`}
                          loading={sending?.id === `delete-${contact.id}`}
                        />
                      }
                    >
                      <Trash2Icon />
                    </AlertDialogTrigger>
                    <AlertDialogPopup>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete {contact.name}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This removes {contact.email} from the contacts.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogClose render={<Button variant="ghost" />}>
                          Cancel
                        </AlertDialogClose>
                        {/* the form sent from here: the dialog is outside it (a portal), and closes */}
                        <AlertDialogClose
                          onClick={() =>
                            document
                              .querySelector<HTMLFormElement>(`#delete-${contact.id}`)
                              ?.requestSubmit()
                          }
                          render={<Button variant="destructive" data-testid="confirm-delete" />}
                        >
                          Delete
                        </AlertDialogClose>
                      </AlertDialogFooter>
                    </AlertDialogPopup>
                  </AlertDialog>
                </form>
              )}
            </li>
          ))}
        </ul>
      </DemoCard>
    </>
  )
}
