import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Invoice } from './types';

const apiMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ api: apiMock }));
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));

const { ScheduleEditor } = await import('./schedule-editor');

const invoice = { id: 'inv-1', total: '1000.00', dueDate: '2099-01-10T00:00:00.000Z', schedule: [] } as unknown as Invoice;
const onDone = vi.fn();

const setup = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ScheduleEditor invoice={invoice} onDone={onDone} />
    </QueryClientProvider>,
  );
const amount = (i: number) => screen.getByLabelText(`Stage ${i} amount`);
const save = () => screen.getByRole('button', { name: /save schedule/i });

beforeEach(() => {
  apiMock.mockReset().mockResolvedValue({});
  onDone.mockReset();
});

describe('ScheduleEditor', () => {
  it('starts with one full-payment stage on the invoice due date', () => {
    setup();
    expect(amount(1)).toHaveValue('1000.00');
    expect(screen.getByLabelText('Stage 1 due date')).toHaveValue('2099-01-10');
    expect(screen.getByText('Stages match the invoice total')).toBeInTheDocument();
    expect(save()).toBeEnabled();
  });

  it('tracks the unallocated amount and blocks saving until it is zero', async () => {
    setup();
    fireEvent.change(amount(1), { target: { value: '400' } });
    expect(await screen.findByText(/Still to allocate/)).toHaveTextContent('600');
    expect(save()).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /add stage/i }));
    expect(amount(2)).toHaveValue('600.00');
    expect(save()).toBeEnabled();

    fireEvent.change(amount(2), { target: { value: '700' } });
    expect(await screen.findByText(/Over the total/)).toHaveTextContent('100');
    expect(save()).toBeDisabled();
  });

  it('requires a due date for fixed stages and valid amounts', async () => {
    setup();
    fireEvent.change(screen.getByLabelText('Stage 1 due date'), { target: { value: '' } });
    fireEvent.click(save());
    expect(await screen.findByText('Stage 1: Fixed stages need a due date')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Stage 1 due type'), { target: { value: 'NONE' } });
    fireEvent.change(amount(1), { target: { value: '1000.555' } });
    fireEvent.click(save());
    expect(await screen.findByText('Stage 1: Use a number with up to 2 decimals')).toBeInTheDocument();
    expect(apiMock).not.toHaveBeenCalled();
  });

  it('saves the stages and drops dates for undated stages', async () => {
    setup();
    fireEvent.change(amount(1), { target: { value: '400' } });
    fireEvent.click(screen.getByRole('button', { name: /add stage/i }));
    fireEvent.change(screen.getByLabelText('Stage 2 due type'), { target: { value: 'NONE' } });
    fireEvent.click(save());
    await waitFor(() => expect(apiMock).toHaveBeenCalled());
    expect(apiMock).toHaveBeenCalledWith('/invoices/inv-1/payment-schedule', {
      method: 'PUT',
      body: { items: [
        { description: 'Full payment', amount: '400', dueType: 'FIXED', dueDate: '2099-01-10' },
        { description: undefined, amount: '600.00', dueType: 'NONE', dueDate: undefined },
      ] },
    });
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });
});
