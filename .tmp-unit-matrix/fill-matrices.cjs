const fs = require('fs');
const JSZip = require('jszip');

const workbookPath = process.argv[2];
const outputPath = process.argv[3];
const columns = Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index));
const cell = (column, row) => `${column}${row}`;
const xml = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function styleFor(sheet, reference) {
  const match = sheet.match(new RegExp(`<c r="${reference}"([^>]*?)(?:/>|>[\\s\\S]*?</c>)`));
  return match?.[1].match(/ s="(\d+)"/)?.[1];
}

function put(sheet, reference, value) {
  const style = styleFor(sheet, reference);
  const formatted = value === ''
    ? `<c r="${reference}"${style ? ` s="${style}"` : ''}/>`
    : `<c r="${reference}"${style ? ` s="${style}"` : ''} t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
  const matcher = new RegExp(`<c r="${reference}"[^>]*(?:/>|>[\\s\\S]*?</c>)`);
  if (matcher.test(sheet)) return sheet.replace(matcher, formatted);
  return sheet.replace(new RegExp(`(<row r="${reference.match(/\d+/)[0]}"[^>]*>)`), `$1${formatted}`);
}

function applySheet(source, spec) {
  let sheet = source;
  const total = spec.results.length;
  const passed = spec.results.filter(value => value === 'Passed').length;
  const failed = spec.results.filter(value => value === 'Failed').length;
  const normal = spec.types.filter(value => value === 'N').length;
  const abnormal = spec.types.filter(value => value === 'A').length;
  const boundary = spec.types.filter(value => value === 'B').length;
  const ids = spec.results.map((_, index) => `UTCID${String(index + 1).padStart(2, '0')}`);

  [['C2', spec.code], ['K2', spec.functionName], ['C4', spec.lines], ['K4', 0], ['C5', spec.requirement],
    ['A7', passed], ['C7', failed], ['E7', 0], ['K7', normal], ['L7', abnormal], ['M7', boundary], ['N7', total]].forEach(([reference, value]) => {
    sheet = put(sheet, reference, value);
  });

  for (let index = 0; index < 22; index += 1) {
    const column = columns[4 + index];
    ['8', '9', '35', '36', '37', '38'].forEach(row => { sheet = put(sheet, cell(column, row), ''); });
  }
  ids.forEach((id, index) => {
    const column = columns[4 + index];
    sheet = put(sheet, cell(column, 8), id);
    sheet = put(sheet, cell(column, 9), id);
    sheet = put(sheet, cell(column, 35), spec.types[index]);
    sheet = put(sheet, cell(column, 36), spec.results[index]);
    sheet = put(sheet, cell(column, 37), '11/17');
  });

  for (let row = 11; row <= 24; row += 1) {
    sheet = put(sheet, `B${row}`, spec.conditions[row - 11] || '');
    for (let index = 0; index < total; index += 1) {
      const applies = (spec.conditionMap[row - 11] || []).includes(index + 1);
      sheet = put(sheet, cell(columns[4 + index], row), applies ? 'O' : '');
    }
  }

  const returnRows = ['Return: valid value is returned.', 'Return: no value because validation throws.', 'Return: opaque signed token or decoded position.'];
  const exceptionRows = ['Exception: No exception.', "Exception: AppError('VALIDATION_FAILED', 422)."];
  const logRows = ['Log message: No log message.', ''];
  returnRows.forEach((value, index) => { sheet = put(sheet, `B${26 + index}`, value); });
  exceptionRows.forEach((value, index) => { sheet = put(sheet, `B${30 + index}`, value); });
  logRows.forEach((value, index) => { sheet = put(sheet, `B${33 + index}`, value); });
  spec.results.forEach((result, index) => {
    const column = columns[4 + index];
    const succeeds = result === 'Passed' && !spec.validationFailures.includes(index + 1);
    sheet = put(sheet, cell(column, succeeds ? 26 : 27), 'O');
    sheet = put(sheet, cell(column, succeeds ? 30 : 31), 'O');
    sheet = put(sheet, cell(column, 33), 'O');
  });
  return sheet;
}

const specs = [
  {
    sheet: 11, code: 'CURSOR-01', functionName: 'encode', lines: 4,
    requirement: 'Cursor có chữ ký và scope: mã hóa position cùng context thành token có chữ ký.',
    conditions: ['Position và context hợp lệ.', 'Namespace thay đổi.', 'Secret ngắn hơn 32 bytes.', 'Namespace rỗng.', 'Namespace null.', 'Token là base64url.', 'Payload giữ position và expiry.', 'Signature dùng HMAC-SHA256.', 'Không có log message.'],
    conditionMap: [[1, 2], [2], [3], [4], [5], [1], [1], [1], [1, 2, 3, 4, 5]],
    types: ['N', 'N', 'A', 'A', 'A'], results: Array(5).fill('Passed'), validationFailures: [3, 4, 5],
  },
  {
    sheet: 10, code: 'CURSOR-02', functionName: 'decode', lines: 13,
    requirement: 'Xác minh chữ ký, cấu trúc, expiry và context của scoped cursor.',
    conditions: ['Round-trip token và context gốc.', 'Context actor khác.', 'Context state khác.', 'Signature bị sửa.', 'Token đúng thời điểm hết hạn.', 'Token undefined.', 'Token null.', 'Token rỗng.', 'Token chứa ký tự không hợp lệ.', 'Token dài hơn 512 ký tự.', 'Không có log message.'],
    conditionMap: [[1], [2], [3], [4], [5], [6], [7], [8], [9], [10], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]],
    types: ['N', 'A', 'A', 'A', 'B', 'A', 'A', 'A', 'A', 'B'], results: Array(10).fill('Passed'), validationFailures: [2, 3, 4, 5, 6, 7, 8, 9, 10],
  },
  {
    sheet: 9, code: 'SHIFT-IN-01', functionName: 'availabilityInput', lines: 4,
    requirement: 'Kiểm tra zone, workingWindows, effectiveFrom và expectedVersion của DTO lịch.',
    conditions: ['DTO availability hợp lệ.', 'DTO null hoặc array.', 'Trường bắt buộc bị thiếu.', 'Trường không được phép.', 'zone rỗng, null, number hoặc unsupported.', 'workingWindows null, object, string hoặc weekday ngoài miền.', 'effectiveFrom null, number hoặc date không hợp lệ.', 'expectedVersion null, âm, decimal hoặc string.', 'expectedVersion safe integer lớn nhất.', 'Không có log message.'],
    conditionMap: [[1, 2], [3, 4], [5, 6, 7, 8], [9], [10, 11, 12, 13], [14, 15, 16, 17], [18, 19, 20, 21], [22, 23, 24, 25], [26], Array.from({ length: 26 }, (_, i) => i + 1)],
    types: ['N', 'N', ...Array(23).fill('A'), 'B'],
    results: ['Passed', 'Passed', 'Passed', 'Passed', 'Failed', 'Failed', 'Failed', 'Failed', 'Passed', ...Array(16).fill('Failed'), 'Passed'],
    validationFailures: Array.from({ length: 23 }, (_, i) => i + 3),
  },
  {
    sheet: 8, code: 'SHIFT-IN-02', functionName: 'workAreasInput', lines: 3,
    requirement: 'Kiểm tra cấu trúc danh sách khu vực và expectedVersion.',
    conditions: ['DTO work areas hợp lệ.', 'Danh sách areas rỗng hoặc trùng lặp theo behavior hiện có.', 'DTO null hoặc array.', 'Trường bắt buộc bị thiếu.', 'Trường không được phép.', 'areas null, object, string, number hoặc empty item.', 'expectedVersion null, âm, decimal hoặc string.', 'expectedVersion safe integer lớn nhất.', 'Không có log message.'],
    conditionMap: [[1], [2, 3], [4, 5], [6, 7], [8], [9, 10, 11, 12, 13], [14, 15, 16, 17], [18], Array.from({ length: 18 }, (_, i) => i + 1)],
    types: ['N', 'N', 'N', ...Array(14).fill('A'), 'B'],
    results: [...Array(8).fill('Passed'), ...Array(9).fill('Failed'), 'Passed'],
    validationFailures: Array.from({ length: 14 }, (_, i) => i + 4),
  },
  {
    sheet: 7, code: 'SHIFT-IN-03', functionName: 'invitationInput', lines: 5,
    requirement: 'Kiểm tra sitterId tùy chọn, expectedVersion và trường được phép.',
    conditions: ['expectedVersion = 0 hợp lệ.', 'sitterId ObjectId hợp lệ và expectedVersion = 1000000.', 'DTO null hoặc array.', 'expectedVersion bị thiếu.', 'Trường không được phép.', 'expectedVersion null, âm, decimal, string hoặc > 1000000.', 'sitterId null, rỗng, sai định dạng hoặc number.', 'Không có log message.'],
    conditionMap: [[1], [2], [3, 4], [5], [6], [7, 8, 9, 10, 11], [12, 13, 14, 15], Array.from({ length: 15 }, (_, i) => i + 1)],
    types: ['N', 'B', ...Array(12).fill('A'), 'A'], results: Array(15).fill('Passed'), validationFailures: Array.from({ length: 13 }, (_, i) => i + 3),
  },
];

(async () => {
  const zip = await JSZip.loadAsync(fs.readFileSync(workbookPath));
  for (const spec of specs) {
    const path = `xl/worksheets/sheet${spec.sheet}.xml`;
    zip.file(path, applySheet(await zip.file(path).async('string'), spec));
  }
  fs.writeFileSync(outputPath, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
})();
