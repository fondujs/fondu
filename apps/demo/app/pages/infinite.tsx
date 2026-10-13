import { Head, InfiniteScroll } from '@inertiajs/react'
import type { Paginated } from 'fondu'

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
      <InfiniteScroll
        data="people"
        className="card p-0"
        loading={
          <div className="grid gap-2 p-4">
            <div className="skeleton w-4/5" />
            <div className="skeleton w-3/5" />
          </div>
        }
      >
        <ul className="rows" data-testid="people">
          {people.data.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-[12px] font-medium text-accent">
                {p.id}
              </span>
              <span>
                <span className="block text-[13px] font-medium">{p.name}</span>
                <span className="note text-[12px]">{p.email}</span>
              </span>
            </li>
          ))}
        </ul>
      </InfiniteScroll>
      <p className="note mt-4 text-center" data-testid="showing">
        Showing {people.data.length} of {total}
      </p>
    </>
  )
}
