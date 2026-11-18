import { demoServiceCatalog } from './demo-service-catalog.js';

const activities = {
  'hair-trimming': [
    'Đọc kiểu tỉa và phạm vi đã thống nhất',
    'Kiểm tra dụng cụ và sự hợp tác của thú cưng',
    'Cắt tỉa theo phạm vi đã được cho phép'
  ],
  'nail-trimming': [
    'Quan sát móng và kiểm tra dụng cụ',
    'Cắt trong phạm vi an toàn đã được hướng dẫn',
    'Kiểm tra và báo ngay nếu có bất thường'
  ],
  'ear-eye-cleaning': [
    'Đọc hướng dẫn và quan sát bên ngoài tai mắt',
    'Vệ sinh bên ngoài bằng dụng cụ phù hợp',
    'Dừng và báo điều phối nếu khó chịu hoặc bất thường'
  ],
  'coat-brushing': [
    'Kiểm tra lông rối và hướng dẫn chủ nuôi',
    'Chải và gỡ rối thông thường trong phạm vi',
    'Dừng nếu đau hoặc không thể gỡ an toàn'
  ],
  'pet-massage': [
    'Đọc hướng dẫn và kiểm tra khả năng tiếp nhận',
    'Thực hiện thao tác thư giãn nhẹ được cho phép',
    'Dừng khi thú cưng khó chịu'
  ],
  'basic-health-check': [
    'Đọc nội dung quan sát đã được cho phép',
    'Ghi nhận tình trạng bên ngoài, không chẩn đoán',
    'Báo điều phối khi cần bác sĩ thú y, không tự điều trị'
  ],
  'basic-training': [
    'Đối chiếu các lệnh và mục tiêu đã thống nhất',
    'Thực hành phù hợp khả năng tiếp nhận',
    'Ghi nhận kết quả và hướng dẫn chủ nuôi'
  ],
  'pet-bathing': ['Chuẩn bị dụng cụ theo hướng dẫn', 'Tắm phù hợp hướng dẫn chủ nuôi', 'Sấy và vệ sinh theo phạm vi'],
  'dog-walking': ['Kiểm tra dây dắt và đai yếm', 'Xác nhận bắt đầu đi dạo', 'Ghi nhận hoạt động trong buổi'],
  'home-care': ['Đọc hướng dẫn ăn uống', 'Thực hiện công việc chăm sóc đã giao', 'Vệ sinh trong phạm vi dịch vụ'],
  'pet-boarding': [
    'Tiếp nhận hướng dẫn cho ca này',
    'Ghi nhận ăn uống và điều kiện sinh hoạt trong ca',
    'Bàn giao giữa các ca theo phân công'
  ],
  'pet-transport': [
    'Kiểm tra dụng cụ giữ an toàn',
    'Xác nhận tiếp nhận và điểm xuất phát',
    'Bàn giao tại điểm đến được xác nhận'
  ],
  'post-operative-care': [
    'Xác nhận hướng dẫn cụ thể của bác sĩ và chủ nuôi',
    'Chỉ thực hiện hỗ trợ được cho phép',
    'Ghi nhận bất thường và báo điều phối'
  ]
};
const step = (stepId, title, phase, photo = false) => ({
  stepId,
  title,
  instructions:
    'Đối chiếu hướng dẫn của chủ nuôi; dừng và báo điều phối nếu không thể thực hiện an toàn. Không chẩn đoán, kê đơn hoặc tự điều trị.',
  phase,
  scope: 'PER_PET',
  inputType: photo ? 'PHOTO' : 'CONFIRMATION',
  required: true,
  canSkip: false,
  safetyCritical: true,
  customerVisible: true,
  species: [],
  locations: [],
  fields: [],
  photoSlots: photo
    ? [
        {
          photoSlotId: 'condition',
          title: 'Tình trạng thú cưng',
          instructions: 'Chụp rõ tình trạng tại bước này.',
          minPhotos: 1,
          maxPhotos: 2
        }
      ]
    : []
});
export const serviceWorkflowDrafts = demoServiceCatalog.map((service) => ({
  code: service.code,
  definition: {
    title: `${service.name} — đề xuất cần rà soát`,
    steps: [
      step('arrival', 'Tiếp nhận và quan sát tình trạng ban đầu', 'CHECK_IN', true),
      ...(
        activities[service.code] ?? [
          `Đọc phạm vi ${service.name}`,
          'Thực hiện công việc được cho phép',
          'Ghi nhận kết quả và báo bất thường'
        ]
      ).map((title, i) => step(`care-${i + 1}`, title, 'EXECUTION')),
      step(
        'handover',
        service.code === 'pet-boarding'
          ? 'Bàn giao kết thúc ca chăm sóc (không phải kết thúc toàn bộ lưu trú)'
          : 'Kiểm tra cuối buổi và bàn giao',
        'CHECK_OUT',
        true
      )
    ]
  }
}));
