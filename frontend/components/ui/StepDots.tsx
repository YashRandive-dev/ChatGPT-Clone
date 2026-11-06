/** Progress indicator for the 3-step password recovery flow. */
export function StepDots({ step }: { step: 1 | 2 | 3 }) {
  const labels = ['Email', 'Verify code', 'New password'];
  return (
    <ol className="mb-6 flex items-center gap-2" aria-label="Progress">
      {labels.map((label, i) => (
        <li key={label} className="flex flex-1 flex-col gap-1.5" aria-current={i + 1 === step ? 'step' : undefined}>
          <span className={`h-1 rounded-full ${i + 1 <= step ? 'bg-accent' : 'bg-border'}`} />
          <span className={`text-xs ${i + 1 === step ? 'font-medium text-fg' : 'text-muted'}`}>{label}</span>
        </li>
      ))}
    </ol>
  );
}
