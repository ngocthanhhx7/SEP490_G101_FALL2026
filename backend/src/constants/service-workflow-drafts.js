import { demoServiceCatalog } from './demo-service-catalog.js';
import { initialServiceCatalog } from './initial-service-catalog.js';

// Keep provenance inside immutable snapshots without another collection or DTO shape.
export const workflowSources = Object.freeze({
  dogCoat: 'https://vcahospitals.com/know-your-pet/grooming-and-coat-care-for-your-dog',
  catCoat: 'https://vcahospitals.com/know-your-pet/grooming-and-coat-care-for-your-cat',
  grooming: 'https://vcahospitals.com/resources/adult/four-grooming-habits-to-start-now',
  nails: 'https://vcahospitals.com/know-your-pet/handling-exercises-for-trimming-nails-and-brushing-teeth',
  dogEars: 'https://vcahospitals.com/know-your-pet/instructions-for-ear-cleaning-in-dogs',
  catEars: 'https://vcahospitals.com/know-your-pet/instructions-for-ear-cleaning-in-cats',
  observation: 'https://vcahospitals.com/know-your-pet/giving-your-dog-a-thorough-home-check-up',
  rehab: 'https://vcahospitals.com/know-your-pet/rehabilitation-modalities',
  postCat: 'https://vcahospitals.com/know-your-pet/post-operative-instructions-in-cats',
  postDog: 'https://vcahospitals.com/know-your-pet/post-operative-instructions-in-dogs',
  boardingDog:
    'https://www.gov.uk/government/publications/animal-activities-licensing-guidance-for-local-authorities/dog-kennel-boarding-licensing-statutory-guidance-for-local-authorities',
  boardingCat:
    'https://www.gov.uk/government/publications/animal-activities-licensing-guidance-for-local-authorities/cat-boarding-licensing-statutory-guidance-for-local-authorities',
  travel:
    'https://www.avma.org/resources-tools/pet-owners/petcare/animal-travel-certificates-regulations-requirements/traveling-your-dog-cat',
  training: 'https://www.avsab.org/wp-content/uploads/2021/08/AVSAB-Humane-Dog-Training-Position-Statement-2021.pdf'
});
const task = (stepId, title, instructions, sources, extra = {}) => ({
  stepId,
  title,
  instructions: `${instructions} Nguồn: ${sources.map((key) => workflowSources[key]).join(' ; ')}`,
  phase: 'EXECUTION',
  scope: 'PER_PET',
  inputType: 'CONFIRMATION',
  required: true,
  canSkip: false,
  safetyCritical: true,
  customerVisible: true,
  species: [],
  locations: [],
  fields: [],
  photoSlots: [],
  ...extra
});
const note = { inputType: 'NOTE' };
const photo = {
  inputType: 'PHOTO',
  photoSlots: [
    {
      photoSlotId: 'condition',
      title: 'Tình trạng thú cưng',
      instructions:
        'Chỉ chụp khi an toàn; ưu tiên xử lý nguy hiểm trước ảnh. Tránh thông tin riêng tư không liên quan.',
      minPhotos: 1,
      maxPhotos: 2
    }
  ]
};
const intake = () =>
  task(
    'arrival',
    'Tiếp nhận, đồng ý và kiểm tra an toàn',
    'Đối chiếu đúng thú cưng, phạm vi chủ nuôi đồng ý, dị ứng, hạn chế bác sĩ và liên hệ khẩn cấp. Quan sát trước tiếp xúc. Đau, khó thở, chảy máu hoặc hoảng sợ: dừng, giữ an toàn và liên hệ điều phối/bác sĩ ngay; không cưỡng ép, chẩn đoán, tự dùng thuốc. Ảnh là kiểm soát nội bộ PWC, không chứng nhận sức khỏe.',
    ['grooming'],
    { phase: 'CHECK_IN', ...photo }
  );
const finish = (code) =>
  task(
    'handover',
    code === 'pet-boarding' ? 'Bàn giao ca chăm sóc và việc tiếp theo' : 'Kiểm tra cuối buổi và bàn giao',
    'Ghi việc thực tế đã làm, thay đổi tình trạng, vấn đề còn lại và liên hệ đã thực hiện; bàn giao đúng người. Không xác nhận việc chưa làm. Lưu trú chỉ kết thúc ca được phân công, không kết thúc toàn bộ kỳ lưu trú. Ảnh/báo cáo và cổng hoàn tất là kiểm soát nội bộ PWC.',
    ['grooming'],
    { phase: 'CHECK_OUT', ...photo }
  );
const coat = [
  task(
    'inspect-coat',
    'Quan sát da và chọn dụng cụ',
    'Quan sát nhẹ da/lông và vùng nhạy cảm; chọn lược phù hợp. Da đỏ, vết thương, ký sinh hoặc đau: ghi nhận và hỏi bác sĩ, không tự điều trị.',
    ['dogCoat', 'catCoat']
  ),
  task(
    'brush-gently',
    'Chải nhẹ và gỡ rối nhỏ',
    'Chải từng vùng nhỏ theo chiều lông, tránh kéo da; chỉ gỡ rối nhỏ khi hợp tác. Cho nghỉ và thưởng phù hợp dị ứng; không kéo mảng rối sát da.',
    ['dogCoat', 'catCoat']
  ),
  task(
    'refer-mats',
    'Xác nhận giới hạn xử lý lông bết',
    'Không dùng kéo cắt mảng rối sát da. Bết lớn hoặc da kích ứng phải chuyển groomer có năng lực/bác sĩ; không cố hoàn tất khi không an toàn.',
    ['dogCoat', 'catCoat']
  )
];
const daily = [
  task(
    'dog-environment',
    'Chỗ nghỉ và chống thoát cho chó',
    'Kiểm tra cửa, hàng rào, thông gió, chỗ nằm khô sạch; tách cá thể không tương thích, theo dõi nóng/lạnh và hành vi; vệ sinh dụng cụ, thu chất thải. Tham chiếu England, không chứng nhận giấy phép Việt Nam.',
    ['boardingDog'],
    { species: ['DOG'] }
  ),
  task(
    'cat-environment',
    'Không gian riêng và khay cát cho mèo',
    'Có nơi ẩn/nghỉ yên tĩnh, chống thoát, tách mèo lạ và chó; bát ăn, nước và khay cát tách biệt. Dọn khay, vệ sinh dụng cụ, theo dõi nóng/lạnh và căng thẳng.',
    ['boardingCat'],
    { species: ['CAT'] }
  ),
  task(
    'feeding',
    'Thức ăn, nước và theo dõi lượng dùng',
    'Đúng khẩu phần, loại và giờ đã bàn giao; không tự đổi thực đơn. Nước sạch luôn sẵn, bát sạch riêng; tách khi ăn. Ghi lượng ăn/uống, bài tiết và bất thường; liên hệ sớm nếu bỏ ăn, nôn hoặc không uống, không chờ hết ca.',
    ['boardingDog', 'boardingCat'],
    note
  ),
  task(
    'enrichment',
    'Hoạt động phù hợp và bàn giao theo ca',
    'Vận động/chơi theo loài, tuổi và hạn chế bác sĩ; không ép giao tiếp. Chó vận động an toàn, mèo có nơi ẩn và hoạt động tự chọn. Ghi hành vi và bàn giao việc đến hạn ca sau; không xác nhận việc chưa làm.',
    ['boardingDog', 'boardingCat'],
    note
  )
];
const activities = {
  'pet-bathing': [
    task(
      'bath-readiness',
      'Nhu cầu tắm, da và sản phẩm',
      'Mèo khỏe thường ít cần tắm. Xác nhận nhu cầu, sản phẩm đúng loài và nhãn; da bệnh/vừa mổ cần chỉ dẫn bác sĩ. Chải rối nhỏ trước làm ướt; bết lớn phải chuyển người có năng lực.',
      ['dogCoat', 'catCoat']
    ),
    task(
      'wash-rinse',
      'Tắm nhẹ và xả sạch',
      'Nước ấm dễ chịu, nền chống trượt, thao tác nhẹ; tránh nước/sản phẩm vào mắt, tai, mũi. Dùng đúng nhãn, không tự dùng dầu gội trị bệnh hoặc sản phẩm người. Xả sạch; dừng khi hoảng, khó thở hoặc kích ứng.',
      ['dogCoat', 'catCoat']
    ),
    task(
      'dry-observe',
      'Lau khô và quan sát',
      'Lau khăn và giám sát liên tục; PWC không cho nhiệt nóng hoặc nhốt sấy không giám sát. Kiểm tra da/sự thoải mái, báo nếu đỏ/ngứa/khó chịu. Cách lau và giám sát là giới hạn an toàn nội bộ.',
      ['dogCoat', 'catCoat']
    )
  ],
  'coat-brushing': coat,
  'hair-trimming': [
    coat[0],
    task(
      'agree-trim',
      'Xác nhận kiểu tỉa và năng lực',
      'Thống nhất vùng/độ dài, dụng cụ sạch và người đã được đào tạo. Chỉ tỉa khi hợp tác; không ép giữ hoặc tự an thần. Thiếu năng lực/dụng cụ: báo điều phối. Đây không phải giáo trình đào tạo groomer.',
      ['dogCoat', 'catCoat']
    ),
    coat[2],
    task(
      'trim-check',
      'Tỉa trong phạm vi và kiểm tra da',
      'Tỉa từng vùng được đồng ý, tránh da/mắt/vùng nhạy cảm; dừng nếu dụng cụ nóng, thú cưng giật mình hoặc không giữ khoảng cách an toàn. Ghi vùng chưa làm, tổn thương và chuyển người có chuyên môn khi cần.',
      ['dogCoat', 'catCoat']
    )
  ],
  'nail-trimming': [
    task(
      'nail-readiness',
      'Quan sát móng và sự hợp tác',
      'Chỉ người được hướng dẫn kỹ thuật mới thực hiện; dụng cụ đúng cỡ, tập chạm chân với thưởng. Móng gãy/viêm/đau hoặc không xác định phần an toàn: dừng và chuyển bác sĩ/người có năng lực.',
      ['nails']
    ),
    task(
      'clip-tip',
      'Cắt rất ít đầu móng, tránh tủy',
      'Chỉ bỏ phần đầu nhọn an toàn; móng tối màu hoặc thú cưng chống cự thì không đoán hay cố cắt. Cho nghỉ/thưởng; không buộc cắt hết mọi móng trong một lần.',
      ['nails']
    ),
    task(
      'nail-record',
      'Kiểm tra sau cắt và ghi nhận',
      'Quan sát đau/chảy máu/tổn thương; nếu có thì dừng và báo điều phối/bác sĩ theo mức khẩn cấp. Ghi móng đã làm/chưa làm và lý do, không xác nhận việc chưa thực hiện.',
      ['nails'],
      note
    )
  ],
  'ear-eye-cleaning': [
    task(
      'ear-eye-observe',
      'Quan sát ngoài tai và mắt',
      'Tai đỏ/đau/mùi/dịch bất thường: hỏi bác sĩ trước vệ sinh. Không làm sạch quá mức tai khỏe. Mắt nheo/đục/đỏ/chảy dịch phải chuyển bác sĩ; không chẩn đoán.',
      ['dogEars', 'catEars']
    ),
    task(
      'outer-ear',
      'Chỉ lau phần tai nhìn thấy',
      'Bông/gạc với dung dịch bác sĩ chấp thuận, lau nhẹ vành tai nhìn rõ; PWC không đổ vào ống tai. Không tăm bông, cồn, peroxide, đưa sâu hay tự nhỏ thuốc. Dừng khi đau. Phạm vi sitter hẹp hơn kỹ thuật trong nguồn.',
      ['dogEars', 'catEars']
    ),
    task(
      'outer-eye',
      'Chỉ vệ sinh lông ngoài mắt',
      'PWC chỉ cho lau bụi nhẹ trên lông ngoài mắt bằng gạc ẩm riêng từng bên; không chạm giác mạc, cạy ghèn hay nhỏ thuốc. Đau/đỏ/nheo/dịch bất thường: dừng, chuyển bác sĩ. Nguồn quan sát chó không chứng minh kỹ thuật điều trị mắt mèo.',
      ['observation']
    )
  ],
  'pet-boarding': [
    task(
      'boarding-admission',
      'Đối chiếu hồ sơ tiếp nhận và kế hoạch khi có bệnh',
      'Đọc hồ sơ tiếp nhận đã được cơ sở phê duyệt, thông tin tiêm chủng/kiểm soát ký sinh và liên hệ bác sĩ ngoài giờ. Không tự chứng nhận vaccine hoặc nhập lịch vaccine England thành quy định Việt Nam. Thiếu tiêu chí tiếp nhận/hồ sơ hoặc nghi bệnh truyền nhiễm: chặn, tách an toàn và liên hệ điều phối/bác sĩ; không cho vào khu chung. Ca sau kiểm tra bàn giao và thay đổi từ ca trước.',
      ['boardingDog', 'boardingCat'],
      { phase: 'CHECK_IN' }
    ),
    ...daily,
    task(
      'boarding-hygiene',
      'Vệ sinh, cách ly và sẵn sàng khẩn cấp',
      'Theo quy trình vệ sinh của cơ sở và nhãn sản phẩm an toàn đúng loài: tách thú cưng khỏi hóa chất, vệ sinh/khử khuẩn dụng cụ và để khô trước dùng lại; thu chất thải riêng. Nghi truyền nhiễm dùng khu/dụng cụ riêng và hỏi bác sĩ, không tự điều trị. Kiểm tra lối thoát, kế hoạch thoát/đám cháy và người tiếp nhận khẩn cấp; thiếu điều kiện an toàn thì chặn và báo ngay.',
      ['boardingDog', 'boardingCat']
    )
  ],
  'home-care': daily,
  'dog-walking': [
    task(
      'walk-plan',
      'Kiểm tra tuyến, thời tiết và hạn chế',
      'Đối chiếu sức khỏe, tuổi, hạn chế bác sĩ và tuyến đồng ý; kiểm tra nền nóng, bóng râm, nước, giao thông. PWC hoãn/đổi hoạt động khi nguy hiểm; không áp cùng cường độ cho mọi chó.',
      ['boardingDog']
    ),
    task(
      'leash-secure',
      'Kiểm tra dây và chống thoát',
      'Khóa/đai vừa, gắn dây trước mở cửa. PWC giữ dây toàn buổi; không trộn chó khác hộ thiếu đồng ý/đánh giá tương thích. Không giật dây hay dùng vòng gây đau.',
      ['boardingDog', 'training']
    ),
    task(
      'walk-monitor',
      'Đi theo khả năng và theo dõi',
      'Có nghỉ/nước, tránh xung đột, thu gom phân. Thở bất thường, yếu, đau hoặc sợ: dừng, giữ an toàn và liên hệ điều phối/bác sĩ; không cố đủ thời lượng khi nguy hiểm.',
      ['boardingDog']
    ),
    task(
      'walk-record',
      'Ghi hoạt động và trở về',
      'Ghi thời gian, nghỉ, nước, bài tiết và bất thường; kiểm tra cửa trước tháo dây. Không suy diễn GPS/quãng đường nếu không có dữ liệu đo.',
      ['boardingDog'],
      note
    )
  ],
  'pet-transport': [
    task(
      'travel-plan',
      'Kế hoạch đường bộ và điều kiện di chuyển',
      'Chỉ hỗ trợ đường bộ: xác nhận điểm đến/người nhận, định danh và liên hệ bác sĩ. Bệnh, chấn thương, khó thở hoặc quá căng thẳng cần bác sĩ đánh giá trước đi; không tự an thần/cấp chứng nhận.',
      ['travel']
    ),
    task(
      'secure-carrier',
      'Cố định trước xe chạy',
      'Mèo trong lồng khóa chắc; chó có lồng hoặc đai giữ phù hợp. Kiểm tra thông gió, không gian, cố định và chống thoát; không ngồi lòng tài xế hay thò đầu ra cửa sổ.',
      ['travel']
    ),
    task(
      'travel-monitor',
      'Theo dõi, nước và điểm nghỉ',
      'Không để thú cưng một mình trong xe; giữ nhiệt/thông gió dễ chịu. Theo dõi quá nóng, nôn, khó thở; nghỉ theo nhu cầu. Chuyến dài lên kế hoạch cho chó nghỉ khoảng mỗi hai giờ theo AVMA, sớm hơn nếu cần.',
      ['travel']
    ),
    task(
      'travel-receipt',
      'Bàn giao đúng người tại nơi an toàn',
      'Dừng xe an toàn, giữ dây/lồng kín khi chuyển, đối chiếu người nhận chủ nuôi đã xác nhận; bàn giao đồ, tình trạng và hành trình. Xác nhận người nhận là kiểm soát nội bộ PWC.',
      ['travel'],
      note
    )
  ],
  'post-operative-care': [
    task(
      'discharge-plan',
      'Chỉ dẫn xuất viện riêng của bác sĩ',
      'Chỉ hỗ trợ khi có chỉ dẫn hiện hành cho đúng thú cưng: liên hệ bệnh viện, vận động, ăn uống, bảo vệ vết mổ và dấu hiệu cần báo. Thiếu/không rõ: chặn và hỏi bệnh viện; không áp thời gian/liều chung từ mẫu.',
      ['postDog', 'postCat']
    ),
    task(
      'recovery-environment',
      'Chỗ nghỉ và hạn chế theo chỉ định',
      'Nơi yên tĩnh, sạch, dễ chịu; ngăn chạy nhảy theo chỉ dẫn riêng. Giữ vòng/áo chống liếm nếu bác sĩ yêu cầu. Không tự tắm, tháo chỉ, thay băng, làm sạch vết mổ hoặc tập phục hồi.',
      ['postDog', 'postCat']
    ),
    task(
      'recovery-observation',
      'Quan sát và liên hệ khi bất thường',
      'Ghi tỉnh táo, ăn/uống và ngoài vết mổ nhìn thấy, không tháo băng. Chảy máu nhiều, vết hở, sưng đỏ tăng, mùi/dịch, khó thở hoặc suy sụp: liên hệ bệnh viện ngay; không coi đau là lý do tiếp tục.',
      ['postDog', 'postCat'],
      note
    ),
    task(
      'recovery-boundary',
      'Bàn giao, không tự điều trị',
      'Ghi quan sát và liên hệ. Mẫu sitter không cấp quyền tiêm, kê/đổi liều, tự cho thuốc, điều trị hoặc xác nhận hồi phục; việc y tế cần luồng người có chuyên môn được phê duyệt riêng.',
      ['postDog', 'postCat'],
      note
    )
  ],
  'basic-health-check': [
    task(
      'observe-only',
      'Xác nhận quan sát không lâm sàng',
      'Chỉ ghi nhận chăm sóc, không khám/chẩn đoán/chứng nhận sức khỏe hay tiêm chủng. Không ép mở miệng, đo xâm lấn hoặc giữ cưỡng bức. Home check-up chó không phải tiêu chuẩn khám cho mèo.',
      ['observation']
    ),
    task(
      'visible-condition',
      'Ghi thay đổi nhìn thấy',
      'Ghi khách quan tỉnh táo, đi lại, thở, ăn/uống, bài tiết và ngoài da/lông/mắt so với bàn giao; không gán tên bệnh hay kết luận khỏe. Mèo chỉ quan sát tự nhiên, không áp kỹ thuật sờ khám chó.',
      ['observation'],
      note
    ),
    task(
      'refer-concern',
      'Chuyển bác sĩ khi có lo ngại',
      'Khó thở, suy sụp, chảy máu hoặc đau rõ: giữ an toàn, liên hệ cấp cứu thú y ngay. Thay đổi khác báo chủ nuôi/điều phối để bác sĩ đánh giá; không thay chẩn đoán, thuốc hoặc eligibility lâm sàng.',
      ['observation'],
      note
    )
  ],
  'pet-massage': [
    task(
      'comfort-consent',
      'Chỉ thư giãn nhẹ khi tự nguyện',
      'Chủ nuôi đồng ý và thú cưng tự nguyện. Đau, chấn thương, mới mổ hoặc bệnh chưa rõ: không massage, hỏi bác sĩ. Điều trị/phục hồi cần chuyên viên đánh giá; không hứa giảm đau/chữa bệnh.',
      ['rehab']
    ),
    task(
      'gentle-contact',
      'Vuốt nhẹ, cho quyền rời đi',
      'PWC chỉ cho chạm nhẹ vùng được chấp nhận; không ấn sâu, kéo giãn, bẻ khớp, tác động vết thương/vùng đau, dùng máy/nhiệt/dầu điều trị. Né, cứng người, kêu hoặc rời đi: dừng. Đây không phải phác đồ massage trị liệu.',
      ['rehab']
    ),
    task(
      'comfort-record',
      'Ghi phản ứng quan sát',
      'Ghi vùng, thời gian và phản ứng; nhạy đau thì báo để hỏi bác sĩ. Không suy diễn cải thiện lâm sàng từ việc nằm yên.',
      ['rehab'],
      note
    )
  ],
  'basic-training': [
    task(
      'training-goal',
      'Mục tiêu và phần thưởng phù hợp',
      'Thống nhất lệnh đơn giản, thưởng phù hợp sức khỏe/dị ứng, môi trường an toàn ít xao nhãng. Lo âu, sợ hoặc hung hăng cần chuyên môn, không ép tập cơ bản.',
      ['training']
    ),
    task(
      'reward-practice',
      'Tập ngắn bằng phần thưởng',
      'Tín hiệu rõ, đánh dấu và thưởng hành vi mong muốn; nghỉ và quyền dừng. Không đánh, giật dây, dọa, đè giữ, vòng siết/gai/điện hoặc phơi nhiễm cưỡng ép.',
      ['training']
    ),
    task(
      'training-record',
      'Ghi kết quả thực tế và bàn giao',
      'Ghi tín hiệu, số lượt thử/thành công thực tế, thưởng và phản ứng; hướng dẫn chủ nuôi nhất quán. Không cam kết học xong một buổi; chuyển chuyên gia/bác sĩ hành vi khi khó khăn/mất an toàn.',
      ['training'],
      note
    )
  ]
};
activities['home-visit'] = [
  task(
    'home-access',
    'Vào nhà và tương tác theo bàn giao',
    'Đối chiếu cách ra/vào, khóa cửa chống thoát và đồ chơi an toàn của chủ nuôi. Cho thú cưng chủ động tiếp cận; không ép giao tiếp, không mở rộng sang grooming hoặc dịch vụ thú y.',
    ['boardingDog', 'boardingCat']
  ),
  task(
    'home-play',
    'Chơi phù hợp và quan sát',
    'Chơi theo tuổi, loài và hạn chế bác sĩ; chó có tương tác phù hợp, mèo có quyền ẩn/nghỉ. Dừng khi mệt, đau hoặc sợ; ghi hành vi và tình trạng, bàn giao cửa/khóa theo hướng dẫn.',
    ['boardingDog', 'boardingCat'],
    note
  )
];
activities['vet-escort'] = [
  task(
    'appointment',
    'Đối chiếu lịch hẹn và người tiếp nhận',
    'Xác nhận cơ sở, giờ hẹn, liên hệ, hồ sơ được phép bàn giao và người nhận. Đây không phải cấp cứu hay quyền quyết định điều trị thay chủ; có dấu hiệu khẩn cấp phải liên hệ bệnh viện ngay.',
    ['travel']
  ),
  ...activities['pet-transport'],
  task(
    'clinic-handover',
    'Bàn giao cơ sở thú y và báo chủ nuôi',
    'Bàn giao đúng người tại cơ sở, chuyển thông tin được đồng ý và báo chủ nuôi. Không khám, kê đơn, tự đồng ý điều trị hoặc tự xác nhận chi phí/phát sinh; hướng dẫn y tế do cơ sở thú y cung cấp.',
    ['travel'],
    note
  )
];
const catalog = [
  ...demoServiceCatalog,
  ...initialServiceCatalog.filter((item) => !demoServiceCatalog.some((row) => row.code === item.code))
];
export const serviceWorkflowDrafts = catalog.map((service) => ({
  code: service.code,
  definition: {
    title: `${service.name} — SOP tham chiếu 2026-11-18`,
    steps: [intake(), ...activities[service.code], finish(service.code)]
  }
}));
