/**
 * Original piece drawings, one stroke weight, white fill or dark fill.
 * Sized to the 45-unit box chess diagrams use, so a square scales them.
 */

const stroke = { strokeWidth: 1.6, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };

export function ChessPiece({ type, color }: { type: string; color: 'w' | 'b' }) {
  const fill = color === 'w' ? '#f8f8f8' : '#1c1c1c';
  const ink = color === 'w' ? '#1c1c1c' : '#f0f0f0';
  const common = { fill, stroke: ink, ...stroke };
  return (
    <svg viewBox="0 0 45 45" className="h-[78%] w-[78%]" aria-hidden="true">
      {type === 'k' && (
        <g {...common}>
          <path d="M22.5 8v7M19 11.5h7" fill="none" />
          <path d="M15 18h15l-2 6H17z" />
          <path d="M13 36h19l-2-8H15z" />
          <path d="M12 38h21v2H12z" />
        </g>
      )}
      {type === 'q' && (
        <g {...common}>
          <circle cx="12" cy="12" r="2.2" />
          <circle cx="22.5" cy="9" r="2.2" />
          <circle cx="33" cy="12" r="2.2" />
          <path d="M14 16l8.5 6L31 16l-2 12H16z" />
          <path d="M13 36h19l-1.5-6h-16z" />
          <path d="M12 38h21v2H12z" />
        </g>
      )}
      {type === 'r' && (
        <g {...common}>
          <path d="M13 10h5v4h3v-4h3v4h5v4H13z" />
          <path d="M16 18h13v8H16z" />
          <path d="M13 36h19l-1-8H14z" />
          <path d="M12 38h21v2H12z" />
        </g>
      )}
      {type === 'b' && (
        <g {...common}>
          <path d="M22.5 8l6 8h-12z" />
          <path d="M22.5 12v5" fill="none" />
          <path d="M16 22c0 5 2.5 8 6.5 8s6.5-3 6.5-8h-13z" />
          <path d="M14 36h17l-1.5-6h-14z" />
          <path d="M12 38h21v2H12z" />
        </g>
      )}
      {type === 'n' && (
        <g {...common}>
          <path d="M14 36l4-14 2 2 3-10 4 3-2 6 6 3-3 10z" />
          <circle cx="24" cy="16" r="1.1" fill={ink} stroke="none" />
          <path d="M12 38h21v2H12z" />
        </g>
      )}
      {type === 'p' && (
        <g {...common}>
          <circle cx="22.5" cy="16" r="5" />
          <path d="M17 26h11l-2 10H19z" />
          <path d="M14 38h17v2H14z" />
        </g>
      )}
    </svg>
  );
}
