import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApplication } from '../server.js';

let folder, store, server, base;

test.beforeEach(async () => {
  folder = await mkdtemp(path.join(tmpdir(), 'alittle-web-'));
  store = path.join(folder, 'store.json');
  const app = createApplication({ storePath: store, sessionSecret: 'test-session-secret' });
  await app.locals.init();
  server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.afterEach(async () => {
  await new Promise(resolve => server.close(resolve));
  await rm(folder, { recursive: true, force: true });
});

async function loginReference(username = 'admin', password = 'Admin@123') {
  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie, `Login failed (${response.status}): ${await response.clone().text()}`);
  return { response, cookie };
}

async function loginLegacy(username = 'trang', password = 'Demo123!') {
  const response = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie, `Login failed (${response.status}): ${await response.clone().text()}`);
  return { response, cookie };
}

const call = (cookie, route, method = 'GET', body) => fetch(`${base}${route}`, {
  method,
  headers: { cookie, 'content-type': 'application/json' },
  ...(body === undefined ? {} : { body: JSON.stringify(body) })
});

async function createOrder(cookie, supplier_id, lines) {
  const response = await call(cookie, '/api/orders', 'POST', { supplier_id, lines });
  const body = await response.json();
  assert.equal(response.status, 201, JSON.stringify(body));
  return body;
}

async function approveAndDeliver(orderId, ownerCookie, employeeCookie) {
  const approved = await call(ownerCookie, `/api/orders/${orderId}/approve`, 'POST', {});
  assert.equal(approved.status, 200, await approved.text());
  const delivered = await call(employeeCookie, `/api/orders/${orderId}/delivery-status`, 'POST', { delivery_status: 'Đã giao' });
  assert.equal(delivered.status, 200, await delivered.text());
}

test('three seeded roles authenticate and warehouse access is restricted', async () => {
  for (const [username, password, role] of [
    ['admin', 'Admin@123', 'admin'],
    ['hoaithuong', 'HoaiThuong@123', 'employee'],
    ['nhanvienkho', 'Kho@12345', 'warehouse']
  ]) {
    const { response, cookie } = await loginReference(username, password);
    assert.equal(response.status, 200);
    const user = await call(cookie, '/api/auth/me').then(result => result.json());
    assert.equal(user.role, role);
  }
  const warehouse = (await loginReference('nhanvienkho', 'Kho@12345')).cookie;
  assert.equal((await call(warehouse, '/api/batches')).status, 200);
  assert.equal((await call(warehouse, '/api/orders')).status, 403);
});

test('employee order waits for approval while owner order is sent directly', async () => {
  const employee = (await loginReference('hoaithuong', 'HoaiThuong@123')).cookie;
  const owner = (await loginReference()).cookie;

  const employeeOrder = await createOrder(employee, 1, [{ material_id: 1, quantity: 2 }]);
  assert.equal(employeeOrder.order_status, 'Draft');

  const ownerOrder = await createOrder(owner, 1, [{ material_id: 1, quantity: 3 }]);
  assert.equal(ownerOrder.order_status, 'Sent');
  assert.equal(ownerOrder.send.sent, true);
  const outbox = await call(owner, '/api/emails').then(result => result.json());
  assert.equal(outbox[0].status, 'outbox');
});

test('unauthenticated requests are rejected and logout revokes the session', async () => {
  assert.equal((await fetch(`${base}/api/materials`)).status, 401);
  const { cookie } = await loginReference();
  assert.equal((await call(cookie, '/api/auth/logout', 'POST', {})).status, 200);
  assert.equal((await call(cookie, '/api/auth/me')).status, 401);
});

test('only the owner can approve and an approved order cannot be decided twice', async () => {
  const employee = (await loginReference('hoaithuong', 'HoaiThuong@123')).cookie;
  const owner = (await loginReference()).cookie;
  const order = await createOrder(employee, 1, [{ material_id: 1, quantity: 4 }]);

  assert.equal((await call(employee, `/api/orders/${order.order_id}/approve`, 'POST', {})).status, 403);
  assert.equal((await call(owner, `/api/orders/${order.order_id}/approve`, 'POST', {})).status, 200);
  assert.equal((await call(owner, `/api/orders/${order.order_id}/reject`, 'POST', { reason: 'Đổi quyết định' })).status, 400);
  const saved = await call(owner, `/api/orders/${order.order_id}`).then(result => result.json());
  assert.equal(saved.order_status, 'Sent');
});

test('receipt records accepted and rejected lines and prevents receiving a completed order twice', async () => {
  const owner = (await loginReference()).cookie;
  const employee = (await loginReference('hoaithuong', 'HoaiThuong@123')).cookie;
  const order = await createOrder(employee, 1, [
    { material_id: 1, quantity: 4 },
    { material_id: 2, quantity: 2 }
  ]);
  await approveAndDeliver(order.order_id, owner, employee);
  const before = await call(employee, '/api/materials').then(result => result.json());
  const beforeById = new Map(before.map(item => [item.material_id, item.current_quantity]));

  const first = await call(employee, '/api/receipts', 'POST', {
    order_id: order.order_id,
    lines: [
      { material_id: 1, actual_quantity: 2, quality_status: 'Đạt' },
      { material_id: 2, actual_quantity: 1, quality_status: 'Không đạt' }
    ]
  });
  assert.equal(first.status, 201, await first.text());
  const partial = await call(owner, `/api/orders/${order.order_id}`).then(result => result.json());
  assert.equal(partial.order_status, 'Partially Received');
  let inventory = await call(employee, '/api/materials').then(result => result.json());
  assert.equal(inventory.find(item => item.material_id === 1).current_quantity, beforeById.get(1) + 2);
  assert.equal(inventory.find(item => item.material_id === 2).current_quantity, beforeById.get(2));

  const final = await call(employee, '/api/receipts', 'POST', {
    order_id: order.order_id,
    lines: [
      { material_id: 1, actual_quantity: 2, quality_status: 'Đạt' },
      { material_id: 2, actual_quantity: 2, quality_status: 'Đạt' }
    ]
  });
  assert.equal(final.status, 201, await final.text());
  inventory = await call(employee, '/api/materials').then(result => result.json());
  assert.equal(inventory.find(item => item.material_id === 1).current_quantity, beforeById.get(1) + 4);
  assert.equal(inventory.find(item => item.material_id === 2).current_quantity, beforeById.get(2) + 2);
  assert.equal((await call(employee, '/api/receipts', 'POST', { order_id: order.order_id, lines: [{ material_id: 1, actual_quantity: 1, quality_status: 'Đạt' }] })).status, 400);
});

test('payment supports repeated half-payments, debt, and final settlement', async () => {
  const owner = (await loginReference()).cookie;
  const employee = (await loginReference('hoaithuong', 'HoaiThuong@123')).cookie;
  const order = await createOrder(employee, 1, [{ material_id: 1, quantity: 10 }]);
  await approveAndDeliver(order.order_id, owner, employee);
  const received = await call(employee, '/api/receipts', 'POST', {
    order_id: order.order_id,
    lines: [{ material_id: 1, actual_quantity: 10, quality_status: 'Đạt' }]
  });
  assert.equal(received.status, 201, await received.text());

  const firstHalf = await call(owner, '/api/payments', 'POST', { order_id: order.order_id, mode: 'half', payment_method: 'Tiền mặt' });
  assert.equal(firstHalf.status, 201);
  assert.deepEqual(await firstHalf.json(), { payment_id: 1, amount: 600000, payment_status: 'Còn nợ', debt_remaining: 600000 });

  const secondHalf = await call(owner, '/api/payments', 'POST', { order_id: order.order_id, mode: 'half', payment_method: 'Tiền mặt' });
  assert.equal(secondHalf.status, 201);
  assert.deepEqual(await secondHalf.json(), { payment_id: 2, amount: 300000, payment_status: 'Còn nợ', debt_remaining: 300000 });

  const debt = await call(owner, '/api/payments', 'POST', { order_id: order.order_id, mode: 'debt' });
  assert.equal(debt.status, 201);
  assert.deepEqual(await debt.json(), { payment_id: 3, amount: 0, payment_status: 'Ghi nợ', debt_remaining: 300000 });

  const final = await call(owner, '/api/payments', 'POST', { order_id: order.order_id, mode: 'full', payment_method: 'Chuyển khoản' });
  assert.equal(final.status, 201);
  assert.deepEqual(await final.json(), { payment_id: 4, amount: 300000, payment_status: 'Đã thanh toán', debt_remaining: 0 });
});

test('business data persists and passwords are stored as hashes', async () => {
  const employee = (await loginReference('hoaithuong', 'HoaiThuong@123')).cookie;
  const order = await createOrder(employee, 2, [{ material_id: 3, quantity: 1 }]);
  const saved = JSON.parse(await readFile(store, 'utf8'));

  assert.ok(saved.reference.orders.some(item => item.order_id === order.order_id && item.order_status === 'Draft'));
  assert.ok(saved.reference.details.some(item => item.order_id === order.order_id && item.material_id === 3));
  assert.ok(saved.reference.users.every(user => !user.passwordHash.includes('HoaiThuong@123')));
  assert.equal(saved.reference.smtpConfig, undefined);
});

test('AI diary stores prompt, outcome, evaluation, and adjustment', async () => {
  const { cookie } = await loginLegacy();
  const payload = {
    prompt: 'Thêm lọc dữ liệu tồn kho theo tên mặt hàng.',
    result: 'AI thêm ô tìm kiếm vào danh sách nguyên liệu.',
    evaluation: 'Tìm kiếm chạy phía trình duyệt và không làm thay đổi dữ liệu.',
    adjustment: 'Kiểm tra tìm kiếm không dấu và bổ sung kiểm thử giao diện.',
    outcome: 'failed',
    failurePattern: 'Thiếu kiểm thử trường hợp tiếng Việt không dấu.'
  };
  const saved = await call(cookie, '/api/ai-diary', 'POST', payload);
  assert.equal(saved.status, 201);
  const diary = await call(cookie, '/api/ai-diary').then(result => result.json());
  assert.equal(diary.entries[0].prompt, payload.prompt);
  assert.equal(diary.entries[0].outcome, 'failed');
  assert.equal((await call(cookie, '/api/ai-diary', 'POST', { prompt: 'x', result: 'y', evaluation: 'z', adjustment: 'q' })).status, 400);
});
