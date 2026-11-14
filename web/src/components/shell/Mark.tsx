/** Placeholder mark until the owner confirms a logo: a ring with a needle. */
export function Mark() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true" focusable="false">
      <circle cx="11" cy="11" r="9.5" fill="none" stroke="var(--line-strong)" strokeWidth="1.5" />
      <path d="M11 11 L15.5 6.5 L12.4 12.4 Z" fill="var(--accent)" />
      <path d="M11 11 L6.5 15.5 L9.6 9.6 Z" fill="var(--text-faint)" />
    </svg>
  )
}
