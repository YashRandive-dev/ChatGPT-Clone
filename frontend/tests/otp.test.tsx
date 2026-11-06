import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OtpInput } from '@/components/ui/OtpInput';

function Harness({ onComplete }: { onComplete: (v: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <>
      <OtpInput value={value} onChange={setValue} onComplete={onComplete} />
      <output data-testid="value">{value}</output>
    </>
  );
}

describe('OtpInput', () => {
  it('auto-advances while typing and fires onComplete with the full code', async () => {
    const onComplete = vi.fn();
    render(<Harness onComplete={onComplete} />);
    await userEvent.keyboard('123456');
    expect(screen.getByTestId('value')).toHaveTextContent('123456');
    expect(onComplete).toHaveBeenCalledWith('123456');
  });

  it('accepts a pasted code and ignores non-digits', () => {
    const onComplete = vi.fn();
    render(<Harness onComplete={onComplete} />);
    fireEvent.paste(screen.getByLabelText('Digit 1'), { clipboardData: { getData: () => ' 98-76 54 ' } });
    expect(screen.getByTestId('value')).toHaveTextContent('987654');
    expect(onComplete).toHaveBeenCalledWith('987654');
  });

  it('moves back on Backspace', async () => {
    render(<Harness onComplete={vi.fn()} />);
    await userEvent.keyboard('12');
    await userEvent.keyboard('{Backspace}{Backspace}');
    expect(screen.getByTestId('value')).toHaveTextContent('');
    expect(screen.getByLabelText('Digit 1')).toHaveFocus();
  });
});
