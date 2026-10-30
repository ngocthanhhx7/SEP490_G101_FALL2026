import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AddressSearch } from '../../src/components/common/AddressSearch.jsx';
import { googleMapsDirections } from '../../src/utils/maps.js';

describe('address maps', () => {
  it('resolves only the selected Vietmap result before updating the address', async () => {
    const item = { label: 'Synthetic Hanoi', provider: 'VIETMAP', refId: 'geocode:synthetic' }, onSelect = jest.fn();
    const selected = { label: item.label, coordinates: [105.85, 21.01] }, resolve = jest.fn(async () => ({ data: selected }));
    render(<AddressSearch search={async () => ({ data: { provider: 'VIETMAP', items: [item] } })} resolve={resolve} onSelect={onSelect} />);
    fireEvent.change(screen.getByLabelText('Tìm địa chỉ'), { target: { value: 'Hanoi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tìm địa chỉ' }));
    const button = await screen.findByRole('button', { name: item.label });
    expect(resolve).not.toHaveBeenCalled(); fireEvent.click(button);
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(selected));
    expect(resolve).toHaveBeenCalledWith({ provider: 'VIETMAP', refId: item.refId });
  });
  it('selects a coordinate suggestion explicitly', async () => {
    const item = { label: 'Synthetic Hanoi address', coordinates: [105.85, 21.01] }, onSelect = jest.fn();
    render(<AddressSearch search={jest.fn(async () => ({ data: { items: [item] } }))} onSelect={onSelect} />);
    fireEvent.change(screen.getByLabelText('Tìm địa chỉ'), { target: { value: 'Hanoi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tìm địa chỉ' }));
    fireEvent.click(await screen.findByRole('button', { name: item.label }));
    expect(onSelect).toHaveBeenCalledWith(item);
  });
  it('reports missing provider and keeps manual entry available', async () => {
    render(<AddressSearch search={async () => { throw new Error('disabled'); }} onSelect={jest.fn()} />);
    fireEvent.change(screen.getByLabelText('Tìm địa chỉ'), { target: { value: 'Hanoi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tìm địa chỉ' }));
    expect(await screen.findByText(/Chưa tìm được địa chỉ/)).toBeInTheDocument();
  });
  it('opens only the fixed Google Maps destination URL with safely encoded address', () => {
    const url = new URL(googleMapsDirections('Hanoi & api_key=fake'));
    expect(url.origin).toBe('https://www.google.com');
    expect(url.searchParams.get('destination')).toBe('Hanoi & api_key=fake');
    expect(url.searchParams.has('api_key')).toBe(false);
    expect(googleMapsDirections('')).toBeNull();
  });
});
