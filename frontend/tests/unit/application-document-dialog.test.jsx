import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ApplicationDocumentDialog } from '../../src/pages/admin/ApplicationDocumentDialog.jsx';

beforeEach(() => {
  globalThis.HTMLDialogElement.prototype.showModal = jest.fn(function () { this.setAttribute('open', ''); });
  globalThis.HTMLDialogElement.prototype.close = jest.fn(function () { this.removeAttribute('open'); });
  URL.createObjectURL = jest.fn(() => 'blob:private-document-preview');
  URL.revokeObjectURL = jest.fn();
});
const document = { documentId: 'b'.repeat(64), documentType: 'IDENTITY' };
test('private preview stays in the dialog and revokes its blob when closed', async () => {
  const api = { readDocument: jest.fn(async () => ({ blob: new globalThis.Blob(['synthetic'], { type: 'image/png' }) })) };
  const close = jest.fn();
  const view = render(<ApplicationDocumentDialog api={api} applicationId={'a'.repeat(24)} document={document} onClose={close} />);
  expect(await screen.findByRole('img', { name: 'Giấy tờ định danh' })).toHaveAttribute('src', 'blob:private-document-preview');
  expect(api.readDocument).toHaveBeenCalledWith(expect.objectContaining({ applicationId: 'a'.repeat(24), documentId: document.documentId }));
  fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));
  expect(close).toHaveBeenCalled();
  view.unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:private-document-preview');
});
test('provider XML is replaced with a readable error and explicit retry', async () => {
  const api = { readDocument: jest.fn().mockRejectedValueOnce({ code: 'PROVIDER_UNAVAILABLE', message: '<Error>AccessDenied secret</Error>' })
    .mockResolvedValueOnce({ blob: new globalThis.Blob(['synthetic'], { type: 'image/png' }) }) };
  render(<ApplicationDocumentDialog api={api} applicationId={'a'.repeat(24)} document={document} onClose={() => {}} />);
  expect(await screen.findByText('Chưa mở được tài liệu')).toBeVisible();
  expect(screen.queryByText(/AccessDenied|secret/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Thử mở lại' }));
  await waitFor(() => expect(screen.getByRole('img', { name: 'Giấy tờ định danh' })).toBeVisible());
  expect(api.readDocument).toHaveBeenCalledTimes(2);
});
