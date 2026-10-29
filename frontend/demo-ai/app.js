/* Standalone local-demo UI; never bundled into the public application. */
const el = (id) => document.getElementById(id);
let state, csrfToken;
async function request(path, body, method = body ? 'POST' : 'GET') {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      `${response.status} ${result.error?.code ?? ''}: ${result.error?.message ?? JSON.stringify(result)}`
    );
  return result;
}
function node(tag, text, className) {
  const n = document.createElement(tag);
  n.textContent = text;
  if (className) n.className = className;
  return n;
}
function showRaw(path, body, result) {
  el('raw').textContent = JSON.stringify(
    { request: { path, body }, response: result },
    null,
    2
  );
}
async function action(fn) {
  document.querySelectorAll('button').forEach((b) => {
    b.disabled = true;
  });
  el('status').textContent = 'Đang xử lý…';
  el('status').className = '';
  try {
    await fn();
  } catch (error) {
    el('status').textContent = error.message;
    el('status').className = 'error';
  } finally {
    document.querySelectorAll('button').forEach((b) => {
      b.disabled = false;
    });
  }
}
function selected() {
  return state.scenarios.find((s) => s.key === el('scenario').value);
}
function bodyForMatch(s) {
  const { key: _key, label: _label, ownerId: _owner, ...body } = s;
  return body;
}
el('login').addEventListener('click', () =>
  action(async () => {
    const a = state.accounts.find((a) => a.key === el('account').value);
    if (csrfToken) {
      await request('/api/v1/sessions/current', null, 'DELETE');
      csrfToken = null;
    }
    const payload = { channel: 'EMAIL', contact: a.email, purpose: 'LOGIN' };
    const challenge = await request('/api/v1/otp-challenges', payload);
    const mail = await request('/demo/inbox/' + a.key);
    el('mail').textContent =
      `Chỉ hộp thư demo · ${a.email}\nOTP: ${mail.code}\nHết hạn: ${mail.expiresAt}`;
    const login = await request('/api/v1/sessions', {
      ...payload,
      challengeId: challenge.data.challengeId,
      code: mail.code,
      rememberDevice: false
    });
    if (!login.data.authenticated)
      throw new Error('Chưa xác thực được account demo');
    csrfToken = login.data.csrfToken;
    el('identity').textContent =
      `${login.data.user.displayName} · ${login.data.user.roles.join(', ')}`;
    el('status').textContent =
      'Đăng nhập thành công qua API OTP/session thật (delivery demo).';
  })
);
el('logout').addEventListener('click', () =>
  action(async () => {
    await request('/api/v1/sessions/current', null, 'DELETE');
    csrfToken = null;
    el('identity').textContent = 'Đã đăng xuất';
    el('mail').textContent = 'Đã đóng phiên.';
    el('status').textContent = 'Đã đăng xuất.';
  })
);
el('me').addEventListener('click', () =>
  action(async () => {
    const result = await request('/api/v1/me');
    // Do not display the CSRF token in the raw viewer.
    const { csrfToken: token, ...data } = result.data;
    csrfToken = token;
    showRaw('/api/v1/me', null, { ...result, data });
    el('status').textContent = 'Đã tải phiên và quyền hiện tại.';
  })
);
async function quote(tier, owned = false) {
  const s = selected(),
    body = {
      serviceId: s.serviceId,
      petIds: s.petIds,
      durationMinutes: tier ? 60 : 30,
      visitCount: tier ? (s.key === 'vet' ? 40 : 32) : 1
    };
  if (owned) {
    const pets = await request('/api/v1/pet-care/pets');
    const pet = pets.data.find((p) => p.species === 'DOG');
    if (!pet)
      throw new Error('Tài khoản chưa có pet chó để thử cả ba dịch vụ.');
    body.petIds = [pet._id];
  }
  const path = '/api/v1/pricing/quotes',
    result = await request(path, body);
  showRaw(path, body, result);
  const box = el('quote-result');
  box.replaceChildren(
    node('h3', `Giá dự kiến: ${result.data.totalVnd.toLocaleString('vi-VN')} đ`)
  );
  for (const line of result.data.lines)
    box.append(
      node(
        'p',
        `${line.code}: ${line.amountVnd.toLocaleString('vi-VN')} đ · ${line.explanation}`,
        'muted'
      )
    );
  el('status').textContent =
    'Báo giá thành công. Không tạo booking hoặc thu tiền.';
}
el('quote').addEventListener('click', () => action(() => quote(false)));
el('own').addEventListener('click', () => action(() => quote(false, true)));
el('tier').addEventListener('click', () => action(() => quote(true)));
el('match').addEventListener('click', () =>
  action(async () => {
    const path = '/api/v1/ai/recommendations',
      body = bodyForMatch(selected()),
      result = await request(path, body),
      d = result.data;
    showRaw(path, body, result);
    el('status').textContent =
      `${d.status} · ${d.returned} sitter · thiếu ${d.shortfall} so với mục tiêu 5`;
    const tbody = el('ranking');
    tbody.replaceChildren();
    for (const sitter of d.candidates) {
      const tr = node('tr', '');
      tr.append(
        node('td', `#${sitter.rank} ${sitter.displayName}`),
        node('td', sitter.score.toFixed(1))
      );
      for (const feature of [
        'fit',
        'travel',
        'quality',
        'reliability',
        'workload'
      ]) {
        const b = sitter.breakdown.find((b) => b.key === feature),
          td = node('td', `${b.points.toFixed(2)}/${b.weight}`);
        td.title = b.explanation;
        tr.append(td);
      }
      tr.append(
        node(
          'td',
          `${sitter.plan.extraTravelMinutes} / ${sitter.plan.busyMinutes}`
        )
      );
      tbody.append(tr);
    }
    if (!d.candidates.length) {
      const tr = node('tr', '');
      const td = node('td', 'Không có sitter đủ điều kiện.');
      td.colSpan = 8;
      tr.append(td);
      tbody.append(tr);
    }
    el('exclusions').replaceChildren(
      node(
        'p',
        `Số người bị loại theo lý do: ${JSON.stringify(d.exclusions)}. Rê chuột lên điểm để xem giải thích.`,
        'notice'
      )
    );
  })
);
async function init() {
  state = await request('/demo/state');
  el('db').textContent =
    `Database: ${state.database} · Ngày lịch demo: ${state.date} · ETA MÔ PHỎNG`;
  for (const a of state.accounts) {
    const option = node('option', `${a.role} · ${a.name}`);
    option.value = a.key;
    el('account').append(option);
  }
  el('account').value = 'customer-an';
  for (const s of state.scenarios) {
    const option = node('option', s.label);
    option.value = s.key;
    el('scenario').append(option);
  }
  for (const s of state.sitters) {
    const card = node('article', '', 'tile');
    card.append(
      node('h3', s.name),
      node(
        'p',
        `${s.status} · ${s.species.join('/')} · ${s.visits} lượt hoàn thành`
      ),
      node(
        'p',
        `${s.rating} sao/lượt mẫu · ${s.faults} lỗi đã đối soát`,
        'muted'
      )
    );
    el('sitters').append(card);
  }
  for (const a of state.accounts.filter((a) => a.role === 'CUSTOMER')) {
    const card = node('article', '', 'tile');
    card.append(node('h3', a.name), node('p', a.email));
    for (const p of state.pets.filter((p) => p.ownerId === a.id))
      card.append(node('p', `${p.name} · ${p.species}`));
    for (const address of state.addresses.filter((p) => p.ownerId === a.id))
      card.append(node('p', `${address.label} · ${address.areaCode}`, 'muted'));
    el('pets').append(card);
  }
  try {
    const me = await request('/api/v1/me');
    csrfToken = me.data.csrfToken;
    el('identity').textContent =
      `${me.data.user.displayName} · ${me.data.user.roles.join(', ')}`;
  } catch {
    /* New demo browser has no authenticated session. */
  }
}
init().catch((error) => {
  el('status').textContent = error.message;
});
