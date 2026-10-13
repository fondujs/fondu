import { Head, InfiniteScroll } from '@inertiajs/react'
import type { Paginated } from 'fondu'

import { Loading } from '#/components/demo.tsx'
import { Avatar, AvatarFallback } from '#/components/ui/avatar.tsx'
import { Card } from '#/components/ui/card.tsx'

interface Props {
  total: number
  people: Paginated<{ id: number; name: string; email: string }>
}

export default function Infinite({ total, people }: Props) {
  return (
    <>
      <Head title="Infinite scroll" />
      <h1>Infinite scroll</h1>
      <p className="lede">
        <code>
          scroll(() =&gt; ({'{'} data, currentPage, previousPage, nextPage {'}'}))
        </code>{' '}
        sends the pagination metadata in <code>scrollProps</code>, and <code>&lt;InfiniteScroll&gt;</code> loads more
        pages as you scroll, appending to <code>people.data</code>. Watch the URL's <code>?page=</code> update.
      </p>
      <Card>
        <InfiniteScroll
          data="people"
          loading={
            <div className="p-4">
              <Loading />
            </div>
          }
        >
          <ul className="divide-y" data-testid="people">
            {people.data.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                <Avatar>
                  <AvatarFallback className="bg-secondary font-mono">{p.id}</AvatarFallback>
                </Avatar>
                <span className="min-w-0">
                  <span className="block font-medium">{p.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{p.email}</span>
                </span>
              </li>
            ))}
          </ul>
        </InfiniteScroll>
      </Card>
      <p className="mt-4 text-center text-muted-foreground" data-testid="showing">
        Showing {people.data.length} of {total}
      </p>
    </>
  )
}
