import { jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { BookingCareInstructionsPage } from '../../src/pages/customer/BookingCareInstructionsPage.jsx';
import { SitterVisitPage } from '../../src/pages/sitter/SitterVisitPage.jsx';
import { SessionProvider } from '../../src/contexts/SessionContext.jsx';

const BOOKING_ID = '66f111111111111111111111';
const VISIT_1 = '66f222222222222222222222';
const VISIT_2 = '66f333333333333333333333';
const VISIT_3 = '66f444444444444444444444';
const PET_ID = '66f555555555555555555555';

function withSession(ui, route = `/account/bookings/${BOOKING_ID}/care-instructions`) {
  return render(
    <SessionProvider adapter={{
      getCsrfToken: () => 'csrf-token',
      resolve: async () => ({
        status: 'authenticated',
        user: { id: '66f999999999999999999999', roles: ['CUSTOMER'] },
        csrfToken: 'csrf-token'
      })
    }}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/account/bookings/:bookingId/care-instructions" element={ui} />
          <Route path="/sitter/visits/:visitId" element={ui} />
        </Routes>
      </MemoryRouter>
    </SessionProvider>
  );
}

test('customer edits feeding instructions, adds task, confirms and sees MSG51 toast; under-2h visit explains next-visit rule', async () => {
  const initialData = {
    bookingId: BOOKING_ID,
    bookingCode: 'BK-001',
    bookingState: 'ASSIGNED',
    serverNow: '2026-11-27T03:00:00.000Z',
    visits: [
      {
        visitId: VISIT_1,
        version: 0,
        state: 'ASSIGNED',
        startAt: '2026-11-27T06:00:00.000Z',
        endAt: '2026-11-27T07:00:00.000Z',
        sitterAssigned: true,
        sitterName: 'Sitter 01',
        cancelled: false,
        locked: false,
        withinTwoHours: false,
        instructionVersion: 1,
        confirmedAt: '2026-11-27T01:00:00.000Z',
        acknowledgedAt: null,
        requiresAcknowledgement: false,
        pets: [{ petId: PET_ID, name: 'Milo', feeding: 'Ăn hạt', medicine: '', behavior: 'Hiền' }],
        tasks: [
          { itemId: 'service-scope', label: 'Cho ăn và vệ sinh', required: true, locked: true },
          { itemId: 'pet-condition', label: 'Ghi nhận tình trạng', required: true, locked: true }
        ],
        homeAccessNote: 'Chìa dưới thảm'
      },
      {
        visitId: VISIT_2,
        version: 0,
        state: 'ASSIGNED',
        startAt: '2026-11-27T04:00:00.000Z',
        endAt: '2026-11-27T05:00:00.000Z',
        sitterAssigned: true,
        sitterName: 'Sitter 01',
        cancelled: false,
        locked: false,
        withinTwoHours: true,
        instructionVersion: 1,
        confirmedAt: '2026-11-27T01:00:00.000Z',
        acknowledgedAt: null,
        requiresAcknowledgement: false,
        pets: [{ petId: PET_ID, name: 'Milo', feeding: 'Ăn hạt', medicine: '', behavior: 'Hiền' }],
        tasks: [
          { itemId: 'service-scope', label: 'Cho ăn và vệ sinh', required: true, locked: true },
          { itemId: 'pet-condition', label: 'Ghi nhận tình trạng', required: true, locked: true }
        ],
        homeAccessNote: ''
      },
      {
        visitId: VISIT_3,
        version: 0,
        state: 'CANCELLED',
        startAt: '2026-11-28T06:00:00.000Z',
        endAt: '2026-11-28T07:00:00.000Z',
        sitterAssigned: false,
        sitterName: null,
        cancelled: true,
        locked: false,
        withinTwoHours: false,
        instructionVersion: 1,
        confirmedAt: '2026-11-27T01:00:00.000Z',
        acknowledgedAt: null,
        requiresAcknowledgement: false,
        pets: [{ petId: PET_ID, name: 'Milo', feeding: 'Ăn hạt', medicine: '', behavior: 'Hiền' }],
        tasks: [
          { itemId: 'service-scope', label: 'Cho ăn và vệ sinh', required: true, locked: true },
          { itemId: 'pet-condition', label: 'Ghi nhận tình trạng', required: true, locked: true }
        ],
        homeAccessNote: ''
      }
    ]
  };

  const api = {
    getBookingCareInstructions: jest.fn().mockResolvedValue({ data: initialData }),
    confirmVisitCareInstructions: jest.fn().mockResolvedValue({
      data: {
        ...initialData,
        visits: initialData.visits.map(row =>
          row.visitId === VISIT_1
            ? { ...row, version: 1, instructionVersion: 2, requiresAcknowledgement: true, pets: [{ ...row.pets[0], feeding: 'Pate gà' }] }
            : row
        )
      }
    })
  };

  withSession(<BookingCareInstructionsPage api={api} bookingId={BOOKING_ID} />);
  const feedingBox = await screen.findByLabelText('Cho ăn (Milo)');
  expect(feedingBox).toHaveValue('Ăn hạt');
  expect(screen.getByText('Đã huỷ')).toBeInTheDocument();

  fireEvent.change(feedingBox, { target: { value: 'Pate gà' } });
  fireEvent.click(screen.getByRole('button', { name: /Thêm việc/i }));
  const newTaskInput = screen.getByLabelText('Việc cần làm 3');
  fireEvent.change(newTaskInput, { target: { value: 'Chải lông' } });

  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận hướng dẫn' }));
  await waitFor(() => expect(api.confirmVisitCareInstructions).toHaveBeenCalledTimes(1));
  expect(await screen.findByText('Đã lưu thay đổi.')).toBeInTheDocument();

  // Switch to under-2h visit and verify notice
  fireEvent.click(screen.getByRole('button', { name: /Buổi 2/i }));
  expect(await screen.findByText(/dưới 2 giờ trước giờ bắt đầu/i)).toBeInTheDocument();
});

test('sitter sees unread MSG80 and Check-in disabled until clicking Tôi đã đọc bản mới', async () => {
  let acked = false;
  const startAt = new Date(Date.now() + 20 * 60000).toISOString();
  const endAt = new Date(Date.now() + 80 * 60000).toISOString();
  const digestVersion = 'a'.repeat(64);

  const api = {
    assignedVisitSummary: jest.fn().mockResolvedValue({
      data: {
        visitId: VISIT_1,
        state: 'ASSIGNED',
        startAt,
        endAt,
        serviceName: 'Chăm sóc tại nhà',
        serviceAddress: '12 Bà Triệu',
        handoverPending: false
      }
    }),
    care: jest.fn().mockImplementation(async () => ({
      data: {
        visitId: VISIT_1,
        version: digestVersion,
        capturedAt: '2026-11-27T02:00:00.000Z',
        acknowledged: acked,
        careInstructions: {
          version: 2,
          confirmedAt: '2026-11-27T02:00:00.000Z',
          acknowledgedAt: acked ? '2026-11-27T02:30:00.000Z' : null,
          updatedAfterAssigned: true,
          requiresAcknowledgement: !acked,
          pets: [{ petId: PET_ID, name: 'Milo', feeding: 'Pate gà mới', medicine: '', behavior: 'Hiền' }],
          tasks: [
            { itemId: 'service-scope', label: 'Cho ăn và vệ sinh', required: true },
            { itemId: 'pet-condition', label: 'Ghi nhận tình trạng', required: true }
          ]
        },
        pets: [{ id: PET_ID, name: 'Milo', weightKg: 8, ageMonths: 24, sex: 'MALE', traits: [], careProfile: {} }],
        accessOpensAt: new Date(Date.now() - 10 * 60000).toISOString(),
        accessExpiresAt: endAt
      }
    })),
    acknowledgeCare: jest.fn().mockImplementation(async () => {
      acked = true;
      return { data: { acknowledged: true, version: digestVersion, instructionVersion: 2 } };
    }),
    execution: jest.fn().mockImplementation(async () => ({
      data: {
        visitId: VISIT_1,
        state: 'ASSIGNED',
        version: 1,
        startAt,
        endAt,
        serverNow: new Date().toISOString(),
        checkInOpensAt: new Date(Date.now() - 10 * 60000).toISOString(),
        checkInClosesAt: endAt,
        checkOutClosesAt: new Date(Date.now() + 200 * 60000).toISOString(),
        careInstructionsPendingAck: !acked,
        currentInstructionVersion: 2,
        acknowledgedInstructionVersion: acked ? 2 : 1,
        checklistItemIds: ['service-scope', 'pet-condition'],
        checklistItems: [
          { itemId: 'service-scope', label: 'Cho ăn và vệ sinh', required: true },
          { itemId: 'pet-condition', label: 'Ghi nhận tình trạng', required: true }
        ],
        checklist: [],
        evidence: []
      }
    })),
    uploadEvidence: jest.fn(),
    readEvidence: jest.fn(),
    getTravel: jest.fn().mockResolvedValue({ data: { available: false } })
  };

  withSession(<SitterVisitPage api={api} visitId={VISIT_1} />, `/sitter/visits/${VISIT_1}`);

  expect(await screen.findByText('chưa đọc')).toBeInTheDocument();
  expect(screen.getAllByText('Khách đã đổi hướng dẫn chăm sóc. Vui lòng đọc và xác nhận trước khi check-in.').length).toBeGreaterThan(0);
  expect(screen.getByText('Pate gà mới')).toBeInTheDocument();

  // Attach a valid photo: Check-in button MUST remain disabled while unread
  const fileInput = screen.getByLabelText(/Ảnh tại ca chăm sóc/i);
  const photo = new globalThis.File([new Uint8Array([0xff, 0xd8, 0xff])], 'checkin.jpg', { type: 'image/jpeg' });
  fireEvent.change(fileInput, { target: { files: [photo] } });
  const checkInBtn = screen.getByRole('button', { name: /Check-in bắt đầu ca/i });
  expect(checkInBtn).toBeDisabled();

  // Click "Tôi đã đọc bản mới" -> reloads execution & enables Check-in after photo is attached
  fireEvent.click(screen.getByRole('button', { name: 'Tôi đã đọc bản mới' }));
  await waitFor(() => expect(api.acknowledgeCare).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(screen.queryByText('chưa đọc')).not.toBeInTheDocument());

  // Re-attach photo on refreshed VisitExecution and verify Check-in button is now enabled
  const refreshedFileInput = screen.getByLabelText(/Ảnh tại ca chăm sóc/i);
  fireEvent.change(refreshedFileInput, { target: { files: [photo] } });
  expect(screen.getByRole('button', { name: /Check-in bắt đầu ca/i })).toBeEnabled();
});
