import { beforeAll } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SitterPublicProfilePage } from '../../src/pages/sitter/SitterPublicProfilePage.jsx';
import { SitterProfileReviewsPage } from '../../src/pages/staff/SitterProfileReviewsPage.jsx';

test('sitter sends a separate public bio and retries an uncertain submission using its original key', async () => {
  const calls = [];
  const api = { own: async () => ({ profile: null }), submit: async (...args) => {
    calls.push(args);
    if (calls.length === 1) throw { code: 'TIMEOUT' };
    return { ...args[0], state: 'SUBMITTED', version: 1 };
  } };
  render(<SitterPublicProfilePage api={api} />);
  fireEvent.change(await screen.findByLabelText('Giới thiệu'), { target: { value: 'Public synthetic bio' } });
  fireEvent.change(screen.getByLabelText('Khu vực phục vụ'), { target: { value: 'HN-01\nHN-02' } });
  fireEvent.click(screen.getByRole('button', { name: 'Gửi duyệt' }));
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Gửi duyệt' }));
  await screen.findByText('Đã gửi hồ sơ chờ duyệt.');
  expect(calls[0]).toEqual(calls[1]);
  expect(calls[0][0]).toEqual({ bio: 'Public synthetic bio', areas: ['HN-01', 'HN-02'], expectedVersion: 0 });
});

test('an approved profile requires a meaningful edit and confirmation before going back to review', async () => {
  const profile = { bio: 'Giới thiệu hiện tại', areas: ['Hà Nội'], state: 'APPROVED', version: 3 };
  const submit = jest.fn(async body => ({ ...body, state: 'SUBMITTED', version: 4 }));
  const confirm = jest.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
  try {
    render(<MemoryRouter><SitterPublicProfilePage api={{ own: async () => ({ profile }), submit }} /></MemoryRouter>);
    const bio = await screen.findByLabelText('Giới thiệu');
    fireEvent.change(bio, { target: { value: ' Giới thiệu hiện tại ' } });
    expect(screen.queryByRole('button', { name: /Gửi duyệt/ })).not.toBeInTheDocument();
    fireEvent.change(bio, { target: { value: 'Giới thiệu mới' } });
    expect(screen.getByText('Hồ sơ sẽ tạm ngừng công bố')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Gửi duyệt lại' }));
    expect(submit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Gửi duyệt lại' }));
    await screen.findByText('Đang chờ duyệt');
    expect(submit).toHaveBeenCalledWith({ bio: 'Giới thiệu mới', areas: ['Hà Nội'], expectedVersion: 3 }, expect.any(String));
    expect(screen.queryByRole('button', { name: /Gửi duyệt/ })).not.toBeInTheDocument();
  } finally {
    confirm.mockRestore();
  }
});

test('review queue has empty/error states and sends versioned reviewer decision', async () => {
  const review = jest.fn(async () => { throw { code: 'VERSION_CONFLICT' }; });
  const api = { list: async () => ({ items: [{ userId: 'a'.repeat(24), bio: 'Synthetic submitted bio', areas: ['HN-01'], state:'SUBMITTED', version: 3 }], nextCursor: null }), review };
  const { unmount } = render(<SitterProfileReviewsPage api={api} />);
  fireEvent.click(await screen.findByRole('button', {name:'Xem và duyệt'}));
  fireEvent.change(await screen.findByLabelText('Lý do'), { target: { value: 'Reviewed content' } });
  fireEvent.click(screen.getByRole('button', { name: 'Lưu quyết định' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('VERSION_CONFLICT');
  expect(review).toHaveBeenCalledWith('a'.repeat(24), { reason: 'Reviewed content', decision: 'APPROVE', expectedVersion: 3 }, expect.any(String));
  unmount();
  render(<SitterProfileReviewsPage api={{ list: async () => ({ items: [], nextCursor: null }) }} />);
  await waitFor(() => expect(screen.getByText('Không có hồ sơ chờ duyệt.')).toBeInTheDocument());
});

beforeAll(() => {
  window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});

test('unknown review freezes decision and keeps its original key until acknowledged', async () => {
  const row = {userId:'a'.repeat(24),bio:'Synthetic public bio',areas:[],version:1,state:'SUBMITTED'};
  const api = {list:jest.fn().mockResolvedValue({items:[row]}),review:jest.fn().mockRejectedValue({code:'TIMEOUT'})};
  render(<SitterProfileReviewsPage api={api}/>);
  fireEvent.click(await screen.findByRole('button',{name:'Xem và duyệt'}));
  fireEvent.change(screen.getByLabelText('Lý do'),{target:{value:'Synthetic review reason'}});
  fireEvent.click(screen.getByRole('button',{name:'Lưu quyết định'}));
  await screen.findByRole('alert');
  expect(screen.getByLabelText('Lý do')).toBeDisabled();
  expect(screen.queryByRole('button',{name:'Đóng'})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Kiểm tra lại cùng quyết định'}));
  await waitFor(()=>expect(api.review).toHaveBeenCalledTimes(2));
  expect(api.review.mock.calls[0]).toEqual(api.review.mock.calls[1]);
});
