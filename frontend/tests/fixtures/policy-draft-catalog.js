// Review-only synthetic copy. Do not import this fixture from application code.
const draftMetadata = {
  version: '1.0-draft',
  versionPath: 'draft-v1',
  proposedAt: '14/10/2026',
  effectiveDate: 'Chưa có hiệu lực — chờ người có thẩm quyền phê duyệt',
  legalReview: 'Bản dự thảo; chưa được xác nhận về tính tuân thủ pháp luật.',
};

function article(slug, title, purpose, summary, keywords, sections, sources) {
  return {
    slug,
    title,
    purpose,
    summary,
    keywords,
    ...draftMetadata,
    sections,
    sources,
  };
}

export const draftPolicies = [
  article('terms', 'Điều khoản dịch vụ',
    'Giải thích phạm vi dịch vụ, vai trò các bên và cách hiểu trạng thái booking trước khi Customer sử dụng Paw World Care.',
    'Bản dự thảo về dịch vụ chăm sóc thú cưng tại nhà và trách nhiệm của các bên.',
    'điều khoản customer sitter booking quyền trách nhiệm', [
      { heading: 'Phạm vi dịch vụ', paragraphs: [
        'Paw World Care hỗ trợ Customer tìm và đặt dịch vụ chăm sóc chó, mèo tại nhà. Phạm vi dịch vụ cụ thể được hiển thị khi sản phẩm tương ứng được công bố.',
        'Customer cung cấp thông tin thú cưng, địa chỉ và hướng dẫn cần thiết một cách chính xác. Pet Sitter chỉ nhận công việc sau khi đã được gửi offer và chấp nhận offer đó.',
      ] },
      { heading: 'Trạng thái booking', paragraphs: [
        'Xác nhận lịch hoặc thanh toán thành công không tự có nghĩa là đã phân công Pet Sitter. Trạng thái thanh toán, offer được chấp nhận và assignment được hiển thị riêng.',
        'Các khoản giá, thuế, phụ thu, phạm vi địa lý và thời hạn xử lý chỉ có hiệu lực khi được hệ thống công bố rõ cho giao dịch cụ thể; bản dự thảo này không đặt ra giá hoặc thời hạn mới.',
      ] },
      { heading: 'Bản dự thảo', paragraphs: [
        'Điều khoản này cần được người có thẩm quyền rà soát và phê duyệt trước khi có hiệu lực. Nội dung hiện tại không phải ý kiến pháp lý và chưa được xác minh theo pháp luật.',
      ] },
    ], ['P45; hợp đồng/luồng hiện hành cần P01, P17 và P34 xác nhận trước khi công bố.']),

  article('privacy', 'Chính sách quyền riêng tư',
    'Thông báo loại thông tin có thể được dùng để đăng ký và tổ chức dịch vụ chăm sóc thú cưng.',
    'Bản dự thảo mô tả cách bảo vệ thông tin tài khoản, liên hệ, địa chỉ và hồ sơ chăm sóc.',
    'riêng tư bảo mật dữ liệu địa chỉ ảnh thú cưng hồ sơ', [
      { heading: 'Thông tin trong phạm vi dịch vụ', paragraphs: [
        'Tài khoản có thể chứa tên hiển thị và thông tin liên hệ được xác minh. Đặt dịch vụ có thể cần địa chỉ, thông tin thú cưng và hướng dẫn chăm sóc.',
        'Ảnh và ghi nhận chăm sóc có thể chứa thông tin riêng tư về Customer, nơi ở hoặc thú cưng. Chỉ người có quyền và có nhu cầu phục vụ công việc mới được xem dữ liệu tương ứng.',
      ] },
      { heading: 'Sử dụng và thời hạn lưu trữ', paragraphs: [
        'Thông tin chỉ nên được dùng cho xác minh liên hệ, cung cấp dịch vụ, hỗ trợ an toàn và xử lý yêu cầu liên quan. Thời hạn lưu trữ, căn cứ xử lý, đơn vị nhận dữ liệu và kênh yêu cầu quyền dữ liệu đang chờ phê duyệt; trang này không tự đặt thời hạn hoặc cam kết xóa dữ liệu.',
        'Không gửi mã OTP, mật khẩu thiết bị hoặc thông tin truy cập nhà qua nội dung công khai. Dùng kênh được xác nhận trong luồng dịch vụ khi cần chia sẻ hướng dẫn riêng.',
      ] },
      { heading: 'Bản dự thảo', paragraphs: [
        'Chính sách cần người có thẩm quyền rà soát về quyền riêng tư và pháp lý. Không coi bản này là xác nhận tuân thủ pháp luật.',
      ] },
    ], ['P45; P07 registration fields; P27 care evidence/privacy boundaries; retention and legal basis remain open.']),

  article('contact-verification', 'Xác minh email và số điện thoại bằng OTP',
    'Giải thích cách Paw World Care dùng mã OTP một lần để xác minh thông tin liên hệ.',
    'Mã OTP là bí mật dùng một lần; việc yêu cầu gửi mã chưa chứng minh email hoặc SMS đã được nhà cung cấp gửi.',
    'otp email sms số điện thoại liên hệ xác minh gửi lại', [
      { heading: 'Yêu cầu và thời hạn mã', paragraphs: [
        'Luồng đăng ký hiện dùng mã OTP gồm 6 chữ số. Mã có thời hạn tối đa 5 phút; giao diện giới hạn yêu cầu gửi tối đa 5 mã trong một giờ và yêu cầu chờ ít nhất 60 giây giữa hai lần gửi.',
        'Chỉ dùng mã cho yêu cầu do chính bạn bắt đầu. Không chia sẻ mã qua điện thoại, tin nhắn hoặc cho người tự nhận là nhân viên hỗ trợ.',
      ] },
      { heading: 'Trạng thái gửi', paragraphs: [
        'Yêu cầu được tiếp nhận không đồng nghĩa nhà cung cấp đã giao email/tin nhắn. Hãy dùng trạng thái từ hệ thống; không gửi lặp liên tục nếu chưa nhận được xác nhận.',
        'Kênh gửi OTP phụ thuộc cấu hình dịch vụ email/SMS. Phần tích hợp nhà cung cấp cần được xác minh riêng trước khi công bố là đang hoạt động.',
      ] },
    ], ['P07 customer registration; P11 email adapter; P12 SMS adapter. Provider integration is not established by this page.']),

  article('service-areas', 'Khu vực phục vụ',
    'Giúp Customer hiểu cách xác nhận địa chỉ có thể đặt dịch vụ hay không.',
    'Khu vực cụ thể chỉ được xác nhận bởi danh sách hoặc kết quả kiểm tra đang có hiệu lực trong sản phẩm.',
    'khu vực địa bàn địa chỉ phạm vi phục vụ', [
      { heading: 'Kiểm tra địa chỉ', paragraphs: [
        'Nhập địa chỉ đầy đủ tại bước kiểm tra dịch vụ khi chức năng này được cung cấp. Chỉ tiếp tục khi hệ thống xác nhận địa chỉ nằm trong khu vực nhận đặt.',
        'Danh sách khu vực, ranh giới phục vụ, điều kiện theo dịch vụ và thời điểm cập nhật chưa được chốt để công bố ở phiên bản này. Không suy ra rằng Paw World Care phục vụ mọi địa chỉ hoặc tỉnh thành.',
      ] },
      { heading: 'Khi chưa có kết quả', paragraphs: [
        'Nếu chưa thể xác nhận khu vực, không gửi booking như thể đã có sitter sẵn sàng. Hãy chờ thông tin chính thức trong sản phẩm.',
      ] },
    ], ['P17 service/system settings contract and P45. Geographic coverage is not configured in this branch.']),

  article('booking', 'Đặt dịch vụ và xác nhận lịch',
    'Mô tả các bước Customer cần kiểm tra trước khi gửi yêu cầu chăm sóc.',
    'Booking, lịch, thanh toán, offer và phân công sitter là các trạng thái riêng.',
    'đặt dịch vụ booking lịch pet sitter offer xác nhận', [
      { heading: 'Thông tin cần kiểm tra', paragraphs: [
        'Trước khi xác nhận, kiểm tra dịch vụ, thú cưng, địa chỉ, lịch dự kiến và hướng dẫn cần thiết. Chỉ gửi yêu cầu khi thông tin hiển thị phù hợp.',
        'Một booking có thể có nhiều visit. Mỗi visit có trạng thái và lịch sử riêng; hủy một visit không tự hủy các visit còn lại.',
      ] },
      { heading: 'Đề xuất sitter', paragraphs: [
        'Trong luồng chọn đích danh sitter, Customer xem lịch rảnh, đề xuất lịch và xác nhận trước khi hệ thống gửi offer. Customer xác nhận đề xuất không thay thế việc sitter chấp nhận offer.',
        'Booking chỉ được xem là đã phân công khi trạng thái assignment xác nhận. Thanh toán thành công riêng lẻ không xác nhận sitter đã nhận việc.',
      ] },
    ], ['P01 domain contracts; P19 booking; P21 dispatch; P24 offer; P42 directed sitter flow.']),

  article('payments', 'Thanh toán và đặt trước nhiều buổi',
    'Giải thích thời điểm thanh toán áp dụng cho booking một visit và nhiều visit.',
    'Một visit có thể trả sau; booking nhiều visit phải thanh toán trước khi gửi offer.',
    'thanh toán prepay trả trước trả sau payOS booking nhiều buổi', [
      { heading: 'Một visit và nhiều visit', paragraphs: [
        'Booking chỉ có một visit có thể thanh toán sau theo luồng được hỗ trợ. Booking từ hai visit trở lên phải thanh toán trước đầy đủ trước khi gửi offer.',
        'Số visit của booking gốc quyết định chế độ thanh toán. Hủy bớt visit không tự đổi booking nhiều visit sang chế độ trả sau.',
      ] },
      { heading: 'Xác nhận thanh toán', paragraphs: [
        'Chỉ trạng thái thanh toán được máy chủ xác nhận mới chứng minh khoản tiền đã được ghi nhận. Việc quay lại từ trang thanh toán hoặc nhìn thấy màn hình thành công ở nhà cung cấp không tự xác nhận booking đã trả.',
        'Giá và mọi khoản thu phải được hiển thị cho giao dịch cụ thể trước khi Customer thanh toán. Trang này không tự đặt giá, phụ thu, hạn thanh toán hoặc cam kết thời gian xử lý.',
      ] },
      { heading: 'Tích hợp', paragraphs: [
        'Thanh toán nhiều visit cần hợp đồng tài chính và tích hợp provider được xác minh. Bản thông tin tĩnh này không thực hiện thanh toán.',
      ] },
    ], ['P51 financial contract v1.0; payment provider and booking flow integration require P31/P34.']),

  article('cancellations-refunds', 'Hủy lịch, đổi lịch và hoàn tiền',
    'Tóm tắt điều kiện hủy tự phục vụ và nguyên tắc tiền đã được chốt cho booking nhiều visit.',
    'Ngưỡng hủy không tự quyết định ngưỡng đổi lịch; phí giữ 30% chỉ áp dụng trong trường hợp đã quy định.',
    'hủy hủy lịch đổi lịch reschedule refund hoàn tiền 60 phút 30%', [
      { heading: 'Hủy tự phục vụ', paragraphs: [
        'Customer và sitter có thể tự hủy/rút khỏi visit khi còn ít nhất 60 phút trước giờ bắt đầu theo đồng hồ máy chủ. Đúng 60 phút được phép; còn 59 phút 59 giây thì không đủ điều kiện tự xử lý. Visit đang diễn ra không thuộc luồng tự hủy.',
        'Một visit trả sau được hủy hợp lệ miễn phí. Nếu đã dưới ngưỡng tự hủy, cần luồng hỗ trợ ngoại lệ; trang này không tự cấp quyền hủy.',
      ] },
      { heading: 'Booking nhiều visit đã trả trước', paragraphs: [
        'Khi Customer hủy visit đã trả mà không chọn đổi lịch, chính sách đã chốt giữ lại 30% phần đủ điều kiện của các visit bị hủy. Cơ sở là tiền thực trả được phân bổ cho visit; không áp mức này lên toàn booking khi chỉ hủy một phần, không tính lại trên visit đã hoàn thành và không giữ hai lần cho cùng một phần tiền.',
        'Cách phân bổ discount/phụ phí, làm tròn VND và xử lý một số ngoại lệ vẫn cần quyết định trước khi tính tiền tự động. Không dùng ví dụ minh họa như báo giá hoặc xác nhận số tiền hoàn thực tế.',
      ] },
      { heading: 'Đổi lịch và hoàn tiền', paragraphs: [
        'Customer chọn visit cần xử lý và có thể chọn đề xuất lịch khác. Mốc 60 phút là mốc hủy, không phải hạn đổi lịch. Cutoff đổi lịch, thời gian hoàn tiền và một số quy tắc nguyên nhân hủy vẫn đang chờ chốt.',
        'Khi sự cố phía sitter/vận hành làm dịch vụ chưa được cung cấp, không tự áp khoản giữ 30% cho Customer. Phương án thay lịch hoặc hoàn khoản chưa cung cấp phụ thuộc phân loại nguyên nhân đã được duyệt; chưa có cam kết thời gian hoàn tiền.',
      ] },
    ], ['P51 financial contract v1.0 (EXT-01–06; FIN-02/03/04/06); P25 implementation remains dependent on open decisions.']),

  article('care-evidence', 'Ghi nhận và bằng chứng chăm sóc',
    'Cho Customer và sitter biết những ghi nhận nào gắn với một visit và cách giữ thông tin riêng tư.',
    'Ảnh check-in/check-out và trạng thái checklist là các loại bằng chứng khác nhau.',
    'chăm sóc bằng chứng check-in check-out ảnh checklist thú cưng', [
      { heading: 'Ghi nhận visit', paragraphs: [
        'Luồng chăm sóc yêu cầu ảnh check-in và check-out. Mỗi mục checklist được đánh dấu hoàn thành hoặc bỏ qua kèm lý do; bỏ qua một mục checklist không miễn yêu cầu ảnh check-in/check-out.',
        'Báo cáo gắn với visit và thú cưng liên quan. Nếu thiếu bước hoặc dữ liệu đang chờ đồng bộ, không coi đó là bằng chứng đã được ghi nhận đầy đủ.',
      ] },
      { heading: 'Quyền riêng tư', paragraphs: [
        'Ảnh, địa chỉ và hướng dẫn vào nhà là thông tin riêng tư. Quyền xem cần giới hạn theo booking/visit và vai trò đang được giao; không chia sẻ nội dung này trên trang công khai.',
      ] },
    ], ['P27 care evidence contract; P26 instructions/handover; scoped access still requires integrated API verification.']),

  article('safety-complaints', 'An toàn, sự cố và khiếu nại',
    'Hướng dẫn cách phản hồi khi có rủi ro an toàn, sự cố chăm sóc hoặc bất đồng về một visit.',
    'Khiếu nại cần gắn với sự việc và bằng chứng; trang công khai không hiển thị dữ liệu khách hàng.',
    'an toàn sự cố khẩn cấp khiếu nại complaint bằng chứng', [
      { heading: 'Tình huống khẩn cấp', paragraphs: [
        'Nếu người hoặc thú cưng đang có nguy hiểm tức thời, ưu tiên liên hệ dịch vụ khẩn cấp tại địa phương và bảo đảm an toàn tại chỗ. Không chờ phản hồi của ứng dụng để xử lý nguy hiểm trước mắt.',
        'Ghi lại mã booking/visit, thời điểm và những việc đã xảy ra khi việc đó an toàn. Chỉ gửi hình ảnh hoặc thông tin cần thiết qua kênh hỗ trợ đã được xác nhận trong sản phẩm.',
      ] },
      { heading: 'Báo cáo và xem xét', paragraphs: [
        'Báo cáo sự cố hoặc khiếu nại nên nêu sự kiện cụ thể và bằng chứng có liên quan. Việc gửi báo cáo chưa đồng nghĩa đã có kết luận, lỗi thuộc bên nào hoặc khoản hoàn tiền được duyệt.',
        'Quy trình tiếp nhận, thời hạn phản hồi và kênh liên hệ chính thức chưa được cung cấp cho phiên bản này; không dùng địa chỉ email hoặc số điện thoại giả định.',
      ] },
    ], ['P29 incident handling; P30/P47 complaint scope; support channel/SLA remain unconfigured.']),

  article('sitter-onboarding', 'Ứng tuyển Pet Sitter và nộp lại hồ sơ',
    'Giúp ứng viên hiểu trạng thái hồ sơ và mốc chờ khi hồ sơ bị từ chối.',
    'Ứng viên bị từ chối có thể nộp lại sau 30 ngày; nộp lại không bảo đảm được chấp thuận.',
    'pet sitter ứng tuyển hồ sơ onboarding 30 ngày từ chối', [
      { heading: 'Quy trình hồ sơ', paragraphs: [
        'Ứng viên cần gửi thông tin được yêu cầu trong biểu mẫu và theo dõi trạng thái bằng kênh xác minh được cung cấp. Đừng gửi giấy tờ hoặc thông tin nhạy cảm qua trang chính sách công khai.',
        'Phê duyệt phụ thuộc việc xem xét hồ sơ; gửi đầy đủ thông tin không bảo đảm được duyệt hoặc nhận booking.',
      ] },
      { heading: 'Nộp lại sau khi bị từ chối', paragraphs: [
        'Ứng viên bị từ chối được phép nộp lại hồ sơ sau 30 ngày kể từ quyết định từ chối. Hệ thống cần xác định đúng hồ sơ và trạng thái liên quan trước khi nhận lần nộp mới.',
        'Hình thức xác minh, nội dung lý do từ chối được phép xem và cách tính ngày chính xác cần được công bố theo luồng ứng tuyển đã tích hợp.',
      ] },
    ], ['P16 application lifecycle; P46 scoped status/verification. Candidate workflow integration is pending.']),

  article('settlement-and-ratings', 'Đối soát, tất toán và đánh giá',
    'Giải thích giới hạn yêu cầu tất toán của sitter và tách yêu cầu đánh giá khỏi kết luận về dịch vụ.',
    'Tối đa một yêu cầu tất toán mỗi tuần lịch Việt Nam; quyền, khoản đủ điều kiện và thời hạn xử lý còn cần chốt.',
    'tất toán settlement bảng lương earnings đánh giá review rating', [
      { heading: 'Yêu cầu tất toán', paragraphs: [
        'Sitter được gửi tối đa một yêu cầu tất toán trong mỗi tuần lịch từ thứ Hai đến hết Chủ nhật theo giờ Việt Nam. Đây là tuần lịch, không phải khoảng trượt 7 ngày.',
        'Admin xem xét yêu cầu và việc chuyển khoản được ghi nhận ngoài hệ thống. Khoản thu nhập đủ điều kiện, khoản đang bị giữ và điều kiện duyệt cần được thể hiện theo hợp đồng tích hợp; không cam kết ngày tiền về.',
      ] },
      { heading: 'Đánh giá', paragraphs: [
        'Đánh giá cần gắn với trải nghiệm dịch vụ thực tế và không thay thế quy trình xử lý sự cố/khiếu nại. Nội dung đánh giá của người khác và thông tin cá nhân cần được giới hạn theo quyền truy cập.',
        'Thời hạn gửi, cách hiển thị, tiêu chí ẩn/gỡ và quyền phản hồi của mỗi bên chưa được chốt để công bố trong bản này.',
      ] },
    ], ['P51 settlement contract; P41 settlement implementation; P30/P47 rating and complaint contracts.']),

  article('pwa', 'Cài đặt Paw World Care trên thiết bị',
    'Mô tả giới hạn an toàn dự kiến khi dùng Paw World Care như một ứng dụng web có thể cài đặt.',
    'Các thao tác booking, thanh toán và chăm sóc cần kết nối mạng; không coi dữ liệu ngoại tuyến là trạng thái mới nhất.',
    'pwa cài đặt offline ngoại tuyến cập nhật thông báo thiết bị', [
      { heading: 'Cài đặt và cập nhật', paragraphs: [
        'Khi trình duyệt và thiết bị hỗ trợ, người dùng có thể cài trang web từ tùy chọn do chính trình duyệt cung cấp. Tên và vị trí thao tác phụ thuộc hệ điều hành/trình duyệt.',
        'PWA, cập nhật nền, thông báo đẩy và màn hình cài đặt cần được xác minh trên từng nền tảng trước khi công bố là khả dụng. Phiên bản này không hứa có một nút cài đặt hoặc thông báo trên mọi thiết bị.',
      ] },
      { heading: 'Khi mất kết nối', paragraphs: [
        'Cần kết nối mạng để tạo hoặc thay đổi booking, xác nhận thanh toán, cập nhật bằng chứng chăm sóc và gửi khiếu nại. Màn hình đã mở có thể cũ; kiểm tra trạng thái trên máy chủ khi kết nối trở lại.',
        'Không dùng bộ nhớ ngoại tuyến dùng chung để lưu mã OTP, thông tin thanh toán, hướng dẫn vào nhà hoặc ảnh riêng tư. Phạm vi cache ngoại tuyến cần được kiểm tra trước khi phát hành PWA.',
      ] },
    ], ['P43 PWA scope. Installation, update and offline cache behavior have not been verified in this branch.']),
];
