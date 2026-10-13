/** Fondu's mark: a slab of cheese melting, an f on it */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <path
        fill="var(--brand)"
        d="M8 2H24A6 6 0 0 1 30 8V21Q30 24 27.6 24C26.7 24 26.6 24.4 26.6 25.2V27.2A1.5 1.5 0 0 1 23.6 27.2V25.2C23.6 24.4 23.4 24 22.4 24H19.2C18.2 24 18 24.5 18 25.6V28.6A2 2 0 0 1 14 28.6V25.6C14 24.5 13.8 24 12.8 24H10C9 24 8.8 24.4 8.8 25.1V25.8A1.3 1.3 0 0 1 6.2 25.8V25.1C6.2 24.4 6 24 5 24H4.4Q2 24 2 21V8A6 6 0 0 1 8 2Z"
      />
      <path
        d="M20.5 7.2C18.8 6.2 14.6 6.1 14.6 10.6V21M10.6 12.2H20"
        fill="none"
        stroke="var(--color-neutral-900)"
        strokeWidth="3.6"
        strokeLinecap="round"
      />
    </svg>
  )
}
