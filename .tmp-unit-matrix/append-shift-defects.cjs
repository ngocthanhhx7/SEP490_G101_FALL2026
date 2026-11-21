const fs = require('fs');
const JSZip = require('jszip');

const [sourcePath, outputPath] = process.argv.slice(2);
const escapeXml = value => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

function cellStyle(sheet, reference) {
  return sheet.match(new RegExp(`<c r="${reference}"([^>]*?)(?:/>|>[\\s\\S]*?</c>)`))?.[1]
    .match(/ s="(\d+)"/)?.[1];
}

function put(sheet, reference, sourceReference, value) {
  const style = cellStyle(sheet, sourceReference);
  const content = typeof value === 'number'
    ? `<v>${value}</v>`
    : `<is><t xml:space="preserve">${escapeXml(value)}</t></is>`;
  const next = `<c r="${reference}"${style ? ` s="${style}"` : ''}${typeof value === 'number' ? '' : ' t="inlineStr"'}>${content}</c>`;
  const matcher = new RegExp(`<c r="${reference}"[^>]*?(?:/>|>[\\s\\S]*?</c>)`);
  if (matcher.test(sheet)) return sheet.replace(matcher, next);
  const row = reference.match(/\d+/)[0];
  return sheet.replace(new RegExp(`(<row r="${row}"[^>]*>)`), `$1${next}`);
}

function columnName(index) {
  let name = '';
  for (let current = index; current >= 0; current = Math.floor(current / 26) - 1) {
    name = String.fromCharCode(65 + current % 26) + name;
  }
  return name;
}

function fillSections(source, spec) {
  let sheet = source;
  const columns = Array.from({ length: spec.results.length }, (_, index) => columnName(index + 4));

  spec.conditions.forEach((condition, index) => {
    sheet = put(sheet, `B${11 + index}`, `B${11 + index}`, condition);
  });
  for (let index = spec.conditions.length; index < 14; index += 1) {
    sheet = put(sheet, `B${11 + index}`, `B${11 + index}`, '');
  }
  for (let row = 11; row <= 24; row += 1) {
    columns.forEach(column => { sheet = put(sheet, `${column}${row}`, `${column}${row}`, ''); });
  }
  spec.conditionMap.forEach((ids, index) => ids.forEach(id => {
    sheet = put(sheet, `${columns[id - 1]}${11 + index}`, `${columns[id - 1]}${11 + index}`, 'O');
  }));

  [
    [26, spec.confirm.accepted],
    [27, spec.confirm.rejected],
    [28, spec.confirm.unexpectedReturn],
    [30, 'No exception.'],
    [31, spec.confirm.exception],
    [33, 'No log message.'],
  ].forEach(([row, text]) => { sheet = put(sheet, `B${row}`, `B${row}`, text); });

  for (let row = 26; row <= 34; row += 1) {
    columns.forEach(column => { sheet = put(sheet, `${column}${row}`, `${column}${row}`, ''); });
  }
  spec.results.forEach((result, index) => {
    const column = columns[index];
    if (spec.accepted.includes(index + 1)) {
      sheet = put(sheet, `${column}26`, `${column}26`, 'O');
      sheet = put(sheet, `${column}30`, `${column}30`, 'O');
    } else if (result === 'Passed') {
      sheet = put(sheet, `${column}27`, `${column}27`, 'O');
      sheet = put(sheet, `${column}31`, `${column}31`, 'O');
    } else {
      sheet = put(sheet, `${column}28`, `${column}28`, 'O');
      sheet = put(sheet, `${column}30`, `${column}30`, 'O');
    }
    sheet = put(sheet, `${column}33`, `${column}33`, 'O');
    sheet = put(sheet, `${column}38`, `${column}38`, spec.defectIds?.[index] ?? '');
  });
  return sheet;
}

(async () => {
  const zip = await JSZip.loadAsync(fs.readFileSync(sourcePath));
  const matrices = [
    {
      sheet: 11, results: ['Passed', 'Passed', 'Passed', 'Passed', 'Passed'], accepted: [1, 2],
      conditions: ['position object hợp lệ.', 'context/scope hợp lệ.', 'secret < 32 bytes.', 'namespace rỗng.', 'namespace null.', 'Token là base64url.', 'Payload chứa position và expiry.', 'Signature HMAC-SHA256 theo namespace.'],
      conditionMap: [[1, 2], [1, 2], [3], [4], [5], [1], [1], [1]],
      confirm: { accepted: 'Opaque base64url token.', rejected: 'No return value.', unexpectedReturn: 'N/A.', exception: 'TypeError: Cursor signing configuration required.' },
    },
    {
      sheet: 10, results: Array(10).fill('Passed'), accepted: [1],
      conditions: ['Token hợp lệ và context gốc.', 'actorId trong context khác.', 'state trong context khác.', 'Signature bị sửa.', 'Token đúng expiry boundary.', 'Token undefined.', 'Token null.', 'Token rỗng.', 'Token chứa ký tự không hợp lệ.', 'Token dài hơn 512 ký tự.', 'Không có log message.'],
      conditionMap: [[1], [2], [3], [4], [5], [6], [7], [8], [9], [10], [1,2,3,4,5,6,7,8,9,10]],
      confirm: { accepted: 'Decoded position object.', rejected: 'No return value.', unexpectedReturn: 'N/A.', exception: 'AppError: status 422, code VALIDATION_FAILED.' },
    },
    {
      sheet: 9, results: ['Passed','Passed','Passed','Passed','Failed','Failed','Failed','Failed','Passed', ...Array(16).fill('Failed'),'Passed'], accepted: [1,2,26],
      defectIds: ['', '', '', '', ...Array(4).fill('DEF-SHIFT-IN-01-01'), '', ...Array(16).fill('DEF-SHIFT-IN-01-01'), ''],
      conditions: ['DTO availability hợp lệ.', 'workingWindows overnight hợp lệ.', 'DTO null.', 'DTO array.', 'zone missing/undefined.', 'workingWindows missing/undefined.', 'effectiveFrom missing/undefined.', 'expectedVersion missing/undefined.', 'Trường không được phép.', 'zone rỗng, null, number hoặc unsupported.', 'workingWindows null, object, string hoặc weekday ngoài miền.', 'effectiveFrom null, number hoặc date không hợp lệ.', 'expectedVersion null, âm, decimal hoặc string.', 'expectedVersion = Number.MAX_SAFE_INTEGER.'],
      conditionMap: [[1],[2],[3],[4],[5],[6],[7],[8],[9],[10,11,12,13],[14,15,16,17],[18,19,20,21],[22,23,24,25],[26]],
      confirm: { accepted: 'Input DTO is returned unchanged.', rejected: 'No return value.', unexpectedReturn: 'Invalid input DTO is returned unchanged.', exception: 'AppError: status 422, code VALIDATION_FAILED.' },
    },
    {
      sheet: 8, results: [...Array(8).fill('Passed'), ...Array(9).fill('Failed'), 'Passed'], accepted: [1,2,3,18],
      defectIds: [...Array(8).fill(''), ...Array(9).fill('DEF-SHIFT-IN-02-01'), ''],
      conditions: ['DTO work areas hợp lệ.', 'areas là empty array.', 'areas có mã trùng (behavior hiện tại).', 'DTO null hoặc array.', 'areas missing/undefined.', 'expectedVersion missing/undefined.', 'Trường không được phép.', 'areas null.', 'areas object.', 'areas string.', 'Phần tử area là number.', 'Phần tử area rỗng.', 'expectedVersion null, âm, decimal hoặc string.', 'expectedVersion = Number.MAX_SAFE_INTEGER.'],
      conditionMap: [[1],[2],[3],[4,5],[6],[7],[8],[9],[10],[11],[12],[13],[14,15,16,17],[18]],
      confirm: { accepted: 'Input DTO is returned unchanged.', rejected: 'No return value.', unexpectedReturn: 'Invalid input DTO is returned unchanged.', exception: 'AppError: status 422, code VALIDATION_FAILED.' },
    },
    {
      sheet: 7, results: Array(15).fill('Passed'), accepted: [1,2],
      conditions: ['DTO chỉ có expectedVersion = 0.', 'sitterId ObjectId hợp lệ; expectedVersion = 1000000.', 'DTO null hoặc array.', 'expectedVersion missing/undefined.', 'Trường không được phép.', 'expectedVersion null.', 'expectedVersion âm, decimal, string hoặc > 1000000.', 'sitterId null.', 'sitterId rỗng, sai định dạng hoặc number.', 'Không có log message.'],
      conditionMap: [[1],[2],[3,4],[5],[6],[7],[8,9,10,11],[12],[13,14,15],[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15]],
      confirm: { accepted: 'Input DTO is returned unchanged.', rejected: 'No return value.', unexpectedReturn: 'N/A.', exception: 'AppError: status 422, code VALIDATION_FAILED.' },
    },
  ];
  for (const matrix of matrices) {
    const path = `xl/worksheets/sheet${matrix.sheet}.xml`;
    zip.file(path, fillSections(await zip.file(path).async('string'), matrix));
  }
  fs.writeFileSync(outputPath, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
})();
