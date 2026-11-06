import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Composer } from '@/components/chat/Composer';
import { Markdown } from '@/components/chat/Markdown';
import { MessageItem } from '@/components/chat/MessageItem';
import { ToastProvider } from '@/components/ui/Toast';
import { Input } from '@/components/ui/Input';
import type { Message } from '@/types';

const base: Message = {
  id: 'a1',
  conversationId: 'c1',
  role: 'assistant',
  content: 'Hello **world**',
  attachments: [],
  feedback: null,
  tokenUsage: null,
  model: 'gpt-x',
  status: 'complete',
  error: null,
  editedAt: null,
  createdAt: new Date().toISOString(),
};
const handlers = { onEdit: vi.fn(), onDelete: vi.fn(), onRegenerate: vi.fn(), onRate: vi.fn(), onShare: vi.fn() };

describe('Composer', () => {
  const setup = (props: Partial<React.ComponentProps<typeof Composer>> = {}) => {
    const onSend = vi.fn().mockResolvedValue(true);
    render(
      <ToastProvider>
        <Composer onSend={onSend} onStop={vi.fn()} streaming={false} sendOnEnter {...props} />
      </ToastProvider>,
    );
    return { onSend, textarea: screen.getByRole('textbox') as HTMLTextAreaElement };
  };

  it('sends on Enter and inserts a newline on Shift+Enter', async () => {
    const { onSend, textarea } = setup();
    await userEvent.type(textarea, 'Line one');
    await userEvent.type(textarea, '{Shift>}{Enter}{/Shift}');
    expect(onSend).not.toHaveBeenCalled();
    await userEvent.type(textarea, 'Line two{Enter}');
    expect(onSend).toHaveBeenCalledWith('Line one\nLine two', []);
    await waitFor(() => expect(textarea.value).toBe(''));
  });

  it('disables send for empty input and shows stop while streaming', async () => {
    setup();
    expect(screen.getByRole('button', { name: /send message/i })).toBeDisabled();
    render(
      <ToastProvider>
        <Composer onSend={vi.fn()} onStop={vi.fn()} streaming sendOnEnter />
      </ToastProvider>,
    );
    expect(screen.getByRole('button', { name: /stop generating/i })).toBeInTheDocument();
  });

  it('restores the draft when sending fails', async () => {
    const onSend = vi.fn().mockResolvedValue(false);
    render(
      <ToastProvider>
        <Composer onSend={onSend} onStop={vi.fn()} streaming={false} sendOnEnter />
      </ToastProvider>,
    );
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    await userEvent.type(textarea, 'Keep me{Enter}');
    await waitFor(() => expect(textarea.value).toBe('Keep me'));
  });
});

describe('Markdown rendering', () => {
  it('renders code blocks with a language label and copy button', () => {
    render(<Markdown content={'Text\n\n```python\nprint("hi")\n```'} />);
    expect(screen.getByText('python')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy code/i })).toBeInTheDocument();
  });

  it('does not render raw HTML from model output (XSS)', () => {
    const { container } = render(<Markdown content={'<img src=x onerror="alert(1)"><script>alert(1)</script>'} />);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });
});

describe('MessageItem', () => {
  it('shows assistant actions and wires regenerate / like', () => {
    render(<MessageItem message={base} isLast busy={false} showTimestamps {...handlers} />);
    fireEvent.click(screen.getByRole('button', { name: /regenerate/i }));
    expect(handlers.onRegenerate).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /good response/i }));
    expect(handlers.onRate).toHaveBeenCalledWith(base, 'like');
    expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument();
  });

  it('offers retry on failed responses', () => {
    render(<MessageItem message={{ ...base, status: 'error', error: 'Provider down' }} isLast busy={false} showTimestamps={false} {...handlers} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Provider down');
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(handlers.onRegenerate).toHaveBeenCalled();
  });

  it('lets the user edit their own message', async () => {
    const user: Message = { ...base, id: 'u1', role: 'user', content: 'Original' };
    render(<MessageItem message={user} isLast={false} busy={false} showTimestamps={false} {...handlers} />);
    fireEvent.click(screen.getByRole('button', { name: /edit/i }));
    const box = screen.getByRole('textbox', { name: /edit message/i });
    await userEvent.clear(box);
    await userEvent.type(box, 'Changed');
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(handlers.onEdit).toHaveBeenCalledWith(user, 'Changed');
  });
});

describe('Input', () => {
  it('toggles password visibility', () => {
    render(<Input label="Password" type="password" defaultValue="secret" />);
    const input = screen.getByLabelText('Password') as HTMLInputElement;
    expect(input.type).toBe('password');
    fireEvent.click(screen.getByRole('button', { name: /show password/i }));
    expect(input.type).toBe('text');
  });
});
