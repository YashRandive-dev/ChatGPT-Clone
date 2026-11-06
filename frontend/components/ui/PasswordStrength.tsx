import { passwordStrength } from '@/lib/validation';
import { cn } from '@/lib/utils';

export function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const { score, label } = passwordStrength(password);
  const colors = ['bg-danger', 'bg-danger', 'bg-warning', 'bg-accent', 'bg-success'];
  return (
    <div className="mt-2 flex items-center gap-2" aria-live="polite">
      <div className="flex flex-1 gap-1">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cn('h-1 flex-1 rounded-full', i < score ? colors[score] : 'bg-border')} />
        ))}
      </div>
      <span className="w-16 text-right text-xs text-muted">{label}</span>
    </div>
  );
}
