import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DataTable, type Column } from './data';
import type { Id } from '@/lib/ids';

type Row = { id: Id; name: string; city: string };
const columns: Column<Row>[] = [
  { key: 'name', header: 'Name', sort: 'name', primary: true, cell: (r) => r.name },
  { key: 'city', header: 'City', cell: (r) => r.city },
];
const rows = [{ id: 1, name: 'Acme', city: 'Pune' }];

describe('DataTable', () => {
  it('renders the empty state when there are no rows', () => {
    render(<DataTable columns={columns} rows={[]} empty={<p>No customers</p>} />);
    expect(screen.getByText('No customers')).toBeInTheDocument();
  });

  it('opens table rows by click, Enter and Space', () => {
    const onRowClick = vi.fn();
    render(<DataTable columns={columns} rows={rows} onRowClick={onRowClick} rowLabel={(r) => `Open ${r.name}`} />);
    const row = screen.getAllByText('Acme').map((el) => el.closest('tr')).find(Boolean)!;
    fireEvent.click(row);
    fireEvent.keyDown(row, { key: 'Enter' });
    fireEvent.keyDown(row, { key: ' ' });
    expect(onRowClick).toHaveBeenCalledTimes(3);
    expect(row).toHaveAttribute('tabindex', '0');
    expect(row).toHaveAttribute('aria-label', 'Open Acme');
  });

  it('renders a mobile card with labelled secondary fields', () => {
    render(<DataTable columns={columns} rows={rows} />);
    const card = screen.getAllByText('Acme').map((el) => el.closest('li')).find(Boolean)!;
    expect(card).toHaveTextContent('City');
    expect(card).toHaveTextContent('Pune');
  });

  it('exposes sort state and toggles via the header button', () => {
    const onSort = vi.fn();
    render(<DataTable columns={columns} rows={rows} sort={{ field: 'name', dir: 'asc' }} onSort={onSort} />);
    const th = screen.getByRole('columnheader', { name: /name/i });
    expect(th).toHaveAttribute('aria-sort', 'ascending');
    fireEvent.click(screen.getByRole('button', { name: /name/i }));
    expect(onSort).toHaveBeenCalledWith('name');
    expect(screen.getByRole('columnheader', { name: 'City' })).not.toHaveAttribute('aria-sort');
  });
});
