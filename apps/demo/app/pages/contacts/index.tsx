import { href, usePage, type Errors } from 'fondu/client'
import { Trash2Icon } from 'lucide-react'

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

type Contact = { id: number; name: string; email: string }

export default function Contacts({ contacts, errors }: { contacts: Contact[]; errors: Errors }) {
  const { auth } = usePage().props
  return (
    <>
      <Title>Forms & validation</Title>
      <h1>Forms & validation</h1>
      <p className="lede">
        A plain form, validated on the server by the action&apos;s schema; invalid input is answered
        with a 303 back to this page and the errors in its <code>errors</code> prop, what was typed
        still there. Contacts are stored in D1.
      </p>
      {/* adding, changing and deleting are for signed-in users (the actions use requireUser) */}
      {auth.user ? (
        <div className="mb-4 sm:max-w-md">
          <DemoCard title="Add a contact" tag="<form method=post> · errors prop">
            <form
              action={href('/contacts')}
              method="post"
              className="grid gap-4"
              data-testid="add-contact"
            >
              <TextField label="Name" name="name" error={errors.name} testid="err-name" />
              <TextField label="Email" name="email" error={errors.email} testid="err-email" />
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
