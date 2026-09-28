import { deriveInvoiceStatus, stageStatus, type StageState } from './invoice-status';

const today = new Date('2026-10-15T10:00:00Z');
const stage = (amount: string, paid: string, dueDate: string | null, dueType: StageState['dueType'] = 'FIXED'): StageState => ({
  amount, paidAmount: paid, dueType, dueDate: dueDate ? new Date(dueDate) : null,
});

describe('invoice status', () => {
  const schedule = [stage('100000', '0', '2026-10-10'), stage('200000', '0', '2026-11-10')];

  it('keeps explicit lifecycle states', () => {
    for (const s of ['DRAFT', 'CANCELLED', 'VOID'] as const) {
      expect(deriveInvoiceStatus(s, 'RECEIVABLE', '300000', schedule, today)).toBe(s);
    }
  });

  it('marks overdue when a FIXED stage is past due and unpaid', () => {
    expect(deriveInvoiceStatus('ISSUED', 'RECEIVABLE', '300000', schedule, today)).toBe('OVERDUE');
    expect(deriveInvoiceStatus('ISSUED', 'RECEIVABLE', '300000', schedule, today, false)).toBe('ISSUED');
  });

  it('is partially paid once stage 1 is settled and stage 2 is not yet due', () => {
    const s = [stage('100000', '100000', '2026-10-10'), stage('200000', '0', '2026-11-10')];
    expect(deriveInvoiceStatus('OVERDUE', 'RECEIVABLE', '300000', s, today)).toBe('PARTIALLY_PAID');
  });

  it('is paid when all stages are settled', () => {
    const s = [stage('100000', '100000', '2026-10-10'), stage('200000', '200000', '2026-11-10')];
    expect(deriveInvoiceStatus('PARTIALLY_PAID', 'RECEIVABLE', '300000', s, today)).toBe('PAID');
  });

  it('uses RECEIVED for unpaid payables and ignores OPTIONAL/NONE dates for overdue', () => {
    const s = [stage('500', '0', '2026-01-01', 'OPTIONAL'), stage('500', '0', null, 'NONE')];
    expect(deriveInvoiceStatus('RECEIVED', 'PAYABLE', '1000', s, today)).toBe('RECEIVED');
  });

  it('stage is not overdue on its due date', () => {
    expect(stageStatus(stage('10', '0', '2026-10-15'), today)).toBe('PENDING');
    expect(stageStatus(stage('10', '4', '2026-10-15'), today)).toBe('PARTIALLY_PAID');
  });
});
