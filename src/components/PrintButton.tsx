interface PrintButtonProps {
  /** Optionaler eigener Handler; Standard: window.print() */
  onPrint?: () => void;
  label?: string;
  className?: string;
}

/**
 * Wiederverwendbarer "Drucken"-Button (gleiches Muster wie auf der Kundenseite).
 * Nutzt standardmäßig window.print(); per @media print werden Steuerelemente ausgeblendet.
 */
export default function PrintButton({
  onPrint,
  label = "Drucken",
  className = "",
}: PrintButtonProps) {
  return (
    <button
      type="button"
      className={`btn-secondary btn-print ${className}`.trim()}
      onClick={() => (onPrint ? onPrint() : window.print())}
      title="Liste drucken"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M4 6V2h8v4" />
        <path d="M4 12H3a1 1 0 01-1-1V8a1 1 0 011-1h10a1 1 0 011 1v3a1 1 0 01-1 1h-1" />
        <rect x="4" y="10" width="8" height="4" rx="0.5" />
      </svg>
      {label}
    </button>
  );
}
