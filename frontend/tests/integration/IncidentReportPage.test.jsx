import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { IncidentReportPage } from '../../src/pages/incidents/IncidentReportPage.jsx';

function renderReport(props = {}) {
  return render(
    <MemoryRouter initialEntries={['/visits/visit-1/incidents/new']}>
      <Routes>
        <Route
          path="/visits/:visitId/incidents/new"
          element={<IncidentReportPage {...props} />}
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('IncidentReportPage (ST-CAS-01, UC-47)', () => {
  beforeEach(() => {
    window.HTMLDialogElement.prototype.showModal = jest.fn(function () {
      this.setAttribute('open', '');
    });
    window.HTMLDialogElement.prototype.close = jest.fn(function () {
      this.removeAttribute('open');
    });
  });

  test('shows MSG43 popup with configured hotline when selecting Thú cưng ốm hoặc bị thương', async () => {
    const api = {
      config: jest.fn().mockResolvedValue({ hotline: '1900 1234' }),
      report: jest.fn()
    };

    renderReport({ api });

    await waitFor(() => expect(api.config).toHaveBeenCalledTimes(1));

    const category = screen.getByLabelText('Loại sự cố');
    const optionTexts = Array.from(category.querySelectorAll('option')).map((o) => o.textContent);
    expect(optionTexts).toEqual([
      'Chọn loại sự cố',
      'Thú cưng ốm hoặc bị thương',
      'Không vào được nhà',
      'Hư hỏng đồ đạc',
      'Thú cưng bị lạc',
      'Khác'
    ]);

    fireEvent.change(category, { target: { value: 'HEALTH_OBSERVATION' } });

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(
      'Nếu thú cưng cần chăm sóc khẩn cấp, hãy gọi ngay cho Paw World theo số 1900 1234.'
    );
  });

  test('shows MSG01 when required fields are empty and MSG93 after submitting without photo', async () => {
    const api = {
      config: jest.fn().mockResolvedValue({ hotline: null }),
      report: jest.fn().mockResolvedValue({
        data: { id: 'case-1', incident: { id: 'case-1', kind: 'INCIDENT', visitId: 'visit-1', state: 'OPEN' } }
      })
    };

    renderReport({ api });

    fireEvent.click(screen.getByRole('button', { name: 'Gửi báo cáo sự cố' }));
    expect(await screen.findAllByText('Trường này là bắt buộc.')).toHaveLength(2);
    expect(api.report).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Loại sự cố'), { target: { value: 'ACCESS' } });
    fireEvent.change(screen.getByPlaceholderText(/Điều gì đã xảy ra/i), {
      target: { value: 'Cửa cổng khóa ngoài, gọi khách chưa nghe máy.' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi báo cáo sự cố' }));

    await waitFor(() => expect(api.report).toHaveBeenCalledTimes(1));
    expect(api.report).toHaveBeenCalledWith(
      expect.objectContaining({
        visitId: 'visit-1',
        category: 'ACCESS',
        evidenceRefs: []
      })
    );
    expect(await screen.findByText('Đã gửi báo cáo. Nhân viên đã được thông báo.')).toBeInTheDocument();
  });

  test('uploads selected photo via private image API and includes mediaId in report', async () => {
    const mediaId = 'a'.repeat(64);
    const api = {
      config: jest.fn().mockResolvedValue({ hotline: '0900 000 000' }),
      report: jest.fn().mockResolvedValue({
        data: { id: 'case-2', incident: { id: 'case-2', kind: 'INCIDENT', visitId: 'visit-1', state: 'OPEN' } }
      })
    };
    const imageApi = {
      upload: jest.fn().mockResolvedValue({ id: mediaId, state: 'READY' })
    };

    renderReport({ api, imageApi });

    fireEvent.change(screen.getByLabelText('Loại sự cố'), { target: { value: 'PROPERTY' } });
    fireEvent.change(screen.getByPlaceholderText(/Điều gì đã xảy ra/i), {
      target: { value: 'Làm vỡ bát ăn của thú cưng.' }
    });

    const file = new window.File(['fake-png'], 'broken-bowl.png', { type: 'image/png' });
    const input = screen.getByLabelText('Chọn ảnh sự cố');
    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.getByText('broken-bowl.png')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Gửi báo cáo sự cố' }));

    await waitFor(() => expect(imageApi.upload).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(api.report).toHaveBeenCalledTimes(1));
    expect(api.report).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'PROPERTY',
        evidenceRefs: [mediaId]
      })
    );
    expect(await screen.findByText('Đã gửi báo cáo. Nhân viên đã được thông báo.')).toBeInTheDocument();
  });

  test('lets the reporter remove a failed optional photo without uploading successful photos again', async () => {
    const api = { report: jest.fn().mockResolvedValue({ data: { id: 'case-3' } }) };
    const mediaId = 'a'.repeat(64);
    const imageApi = {
      upload: jest.fn()
        .mockResolvedValueOnce({ id: mediaId, state: 'READY' })
        .mockRejectedValueOnce(Object.assign(new Error('busy'), { code: 'MEDIA_BUSY', status: 503 }))
    };
    renderReport({ api, imageApi });
    fireEvent.change(screen.getByLabelText('Loại sự cố'), { target: { value: 'PROPERTY' } });
    fireEvent.change(screen.getByPlaceholderText(/Điều gì đã xảy ra/i), {
      target: { value: 'Làm vỡ bát ăn của thú cưng.' }
    });
    const files = ['bowl.png', 'broken.png'].map((name) => new window.File(['img'], name, { type: 'image/png' }));
    fireEvent.change(screen.getByLabelText('Chọn ảnh sự cố'), { target: { files } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi báo cáo sự cố' }));
    expect(await screen.findByText(/Chưa thể tải ảnh/)).toBeInTheDocument();
    expect(api.report).not.toHaveBeenCalled();
    expect(screen.queryByText('Đang chờ máy chủ')).not.toBeInTheDocument();
    const removeFailed = screen.getAllByRole('button', { name: 'Bỏ ảnh' })[1];
    expect(removeFailed).toBeEnabled();
    fireEvent.click(removeFailed);
    fireEvent.click(screen.getByRole('button', { name: 'Gửi báo cáo sự cố' }));
    await waitFor(() => expect(api.report).toHaveBeenCalledWith(expect.objectContaining({ evidenceRefs: [mediaId] })));
    expect(imageApi.upload).toHaveBeenCalledTimes(2);
  });
});
