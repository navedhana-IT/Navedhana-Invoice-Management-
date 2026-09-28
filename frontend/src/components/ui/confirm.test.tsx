import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ConfirmProvider, useConfirm, usePrompt } from './confirm';

let confirm: ReturnType<typeof useConfirm>;
let prompt: ReturnType<typeof usePrompt>;
function Grab() {
  confirm = useConfirm();
  prompt = usePrompt();
  return null;
}
const setup = () => render(<ConfirmProvider><Grab /></ConfirmProvider>);

describe('useConfirm / usePrompt', () => {
  it('resolves true on confirm and false on cancel', async () => {
    setup();
    let result: Promise<boolean>;
    act(() => { result = confirm({ title: 'Delete draft?', confirmLabel: 'Delete', tone: 'danger' }); });
    expect(await screen.findByRole('dialog', { name: 'Delete draft?' })).toBeInTheDocument();
    expect(screen.getByText('This action cannot be undone.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await expect(result!).resolves.toBe(true);

    act(() => { result = confirm({ title: 'Leave?' }); });
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    await expect(result!).resolves.toBe(false);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('requires the minimum length before resolving a prompt', async () => {
    setup();
    let result: Promise<string | null>;
    act(() => { result = prompt({ title: 'Reverse payment', label: 'Reason', minLength: 5, confirmLabel: 'Reverse' }); });
    const box = await screen.findByRole('textbox', { name: /reason/i });
    fireEvent.change(box, { target: { value: 'no' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reverse' }));
    expect(await screen.findByText('Please enter at least 5 characters.')).toBeInTheDocument();

    fireEvent.change(box, { target: { value: '  Duplicate entry  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reverse' }));
    await expect(result!).resolves.toBe('Duplicate entry');
  });

  it('throws outside the provider', () => {
    const Bad = () => { useConfirm(); return null; };
    expect(() => render(<Bad />)).toThrow(/outside ConfirmProvider/);
  });
});
