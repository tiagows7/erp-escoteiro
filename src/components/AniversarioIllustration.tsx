/** Ilustração decorativa do card de aniversariantes. */
export function AniversarioIllustration({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 320 200"
      fill="none"
      role="img"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="aniv-sky" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#e8f1fc" />
          <stop offset="100%" stopColor="#cfe0f6" />
        </linearGradient>
        <linearGradient id="aniv-cake" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff7ed" />
          <stop offset="100%" stopColor="#fde68a" />
        </linearGradient>
      </defs>
      <rect width="320" height="200" rx="20" fill="url(#aniv-sky)" />
      <ellipse cx="58" cy="62" rx="22" ry="28" fill="#1a56b0" />
      <path d="M58 90 v42" stroke="#64748b" strokeWidth="1.5" />
      <ellipse cx="92" cy="48" rx="18" ry="24" fill="#f59e0b" />
      <path d="M92 72 v48" stroke="#64748b" strokeWidth="1.5" />
      <ellipse cx="262" cy="54" rx="20" ry="26" fill="#0ea5e9" />
      <path d="M262 80 v46" stroke="#64748b" strokeWidth="1.5" />
      <rect
        x="110"
        y="108"
        width="100"
        height="52"
        rx="10"
        fill="url(#aniv-cake)"
        stroke="#d97706"
        strokeWidth="2"
      />
      <rect
        x="118"
        y="88"
        width="84"
        height="28"
        rx="8"
        fill="#fff"
        stroke="#f59e0b"
        strokeWidth="2"
      />
      <path
        d="M118 102c7 8 14 8 21 0s14-8 21 0 14 8 21 0 14-8 21 0"
        stroke="#f59e0b"
        strokeWidth="2"
        fill="none"
      />
      <rect x="140" y="68" width="5" height="22" rx="2" fill="#1a56b0" />
      <rect x="158" y="64" width="5" height="26" rx="2" fill="#0ea5e9" />
      <rect x="176" y="68" width="5" height="22" rx="2" fill="#f59e0b" />
      <ellipse cx="142.5" cy="64" rx="3" ry="5" fill="#fb923c" />
      <ellipse cx="160.5" cy="60" rx="3" ry="5" fill="#fb923c" />
      <ellipse cx="178.5" cy="64" rx="3" ry="5" fill="#fb923c" />
      <circle cx="40" cy="120" r="3" fill="#1a56b0" />
      <circle cx="280" cy="110" r="3" fill="#f59e0b" />
      <rect
        x="48"
        y="148"
        width="8"
        height="3"
        rx="1"
        fill="#0ea5e9"
        transform="rotate(20 48 148)"
      />
      <rect
        x="270"
        y="140"
        width="8"
        height="3"
        rx="1"
        fill="#1a56b0"
        transform="rotate(-25 270 140)"
      />
    </svg>
  )
}
