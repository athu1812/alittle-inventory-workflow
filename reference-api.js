import { createHash, randomBytes } from 'node:crypto';

const roles = ['employee', 'admin'];
const activeOrderStates = ['Draft', 'Approved', 'Sent', 'Partially Received'];
const fail = (status, message) => Object.assign(new Error(message), { status });
const required = (value, label) => {
  if (value === undefined || value === null || String(value).trim() === '') throw fail(400, `${label} không được để trống`);
  return String(value).trim();
};
const number = (value, label, { min = -Infinity, integer = false } = {}) => {
  const result = Number(value);
  if (!Number.isFinite(result) || (integer && !Number.isInteger(result)) || result < min) throw fail(400, `${label} không hợp lệ`);
  return result;
};
const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function createReferenceSeed(hashPassword) {
  const ref = { seq: {}, account_profile_version:3, mailFail: false, users: [], suppliers: [], materials: [], ms: [], orders: [], details: [], receipts: [], rd: [], payments: [], txns: [], notifs: [], emails: [] };
  const next = type => (ref.seq[type] = (ref.seq[type] || 0) + 1);
  for (const [name, username, password, role] of [
    ['Trang Thư', 'admin', 'Admin@123', 'admin'],
    ['Hoài Thương', 'hoaithuong', 'HoaiThuong@123', 'employee'],
    ['Thuỳ Linh', 'thuylinh', 'ThuyLinh@123', 'employee']
  ]) ref.users.push({ user_id: next('u'), full_name: name, username, passwordHash: hashPassword(password), role, is_active: 1 });
  for (const [name, phone, email, address] of [
    ['Cà phê Tây Nguyên Phát', '0901000001', 'taynguyenphat@example.com', 'Buôn Ma Thuột, Đắk Lắk'],
    ['Sữa & Kem Việt Dairy', '0901000002', 'vietdairy@example.com', 'Hòa Cường, Đà Nẵng'],
    ['Tạp hóa Pha chế Miền Trung', '0901000003', 'phache@example.com', 'Hải Châu, Đà Nẵng']
  ]) ref.suppliers.push({ supplier_id: next('s'), supplier_name: name, phone, email, address, is_active:1 });
  for (const [name, unit, minimum, current] of [
    ['Cà phê hạt Robusta', 'kg', 10, 25], ['Cà phê hạt Arabica', 'kg', 8, 20], ['Sữa tươi', 'lít', 20, 45], ['Sữa đặc', 'lon', 24, 60],
    ['Kem béo', 'hộp', 6, 15], ['Đường cát', 'kg', 10, 30], ['Siro vani', 'chai', 4, 9], ['Ly nhựa 500ml', 'cái', 300, 800]
  ]) ref.materials.push({ material_id: next('m'), material_name: name, unit, min_quantity: minimum, current_quantity: current, last_updated: new Date().toISOString(), is_active:1 });
  for (const [material_id, supplier_id, unit_price, lead_time_hours] of [[1,1,120000,24],[2,1,220000,24],[3,2,28000,12],[4,2,26000,12],[5,2,95000,12],[3,3,30000,24],[6,3,22000,24],[7,3,85000,24],[8,3,600,24],[6,2,23500,12]]) ref.ms.push({ material_id, supplier_id, unit_price, lead_time_hours });
  seedReferenceSamples(ref);
  return ref;
}

function seedReferenceSamples(ref) {
  if (ref.orders?.length || !ref.users?.length) return ref;
  const now = Date.now(), stamp = hours => new Date(now - hours * 3600000).toISOString();
  const [admin, manager, employee] = ref.users;
  const next = type => (ref.seq[type] = (ref.seq[type] || 0) + 1);
  const addOrder = (supplier_id, user, order_status, delivery_status, lines, hoursAgo) => {
    const order_id = next('o');
    ref.orders.push({ order_id, supplier_id, created_by:user.user_id, approved_by:order_status === 'Draft' ? null : admin.user_id,
      order_date:stamp(hoursAgo), expected_delivery_at:stamp(Math.max(0,hoursAgo-12)), order_status, delivery_status,
      note:'Dữ liệu mẫu để bạn xem thử quy trình.', reminder_count:0, last_reminder_at:null, sent_at:order_status === 'Draft' ? null : stamp(Math.max(0,hoursAgo-6)), late_flag:0, send_failed:0, auto_created:0 });
    for (const [material_id, quantity] of lines) {
      const price = ref.ms.find(x => x.material_id === material_id && x.supplier_id === supplier_id);
      if (price) ref.details.push({ detail_id:next('d'), order_id, material_id, quantity, unit_price:price.unit_price });
    }
    return order_id;
  };
  addOrder(2, employee, 'Draft', 'Chờ nhận hàng', [[3,24],[4,12]], 7);
  addOrder(1, employee, 'Sent', 'Chờ nhận hàng', [[1,8],[2,4]], 30);
  const deliveredOrder = addOrder(3, admin, 'Sent', 'Đã giao', [[6,20],[7,4]], 20);
  const partialOrder = addOrder(2, manager, 'Partially Received', 'Đã giao', [[3,30]], 44);
  const receipt_id = next('r'), receipt_detail_id = next('rd');
  ref.receipts.push({ receipt_id, order_id:partialOrder, received_by:employee.user_id, received_date:stamp(8), invoice_number:'HD-MAU-004', receipt_status:'Accepted', note:'Phiếu nhận mẫu.' });
  ref.rd.push({ receipt_detail_id, receipt_id, material_id:3, actual_quantity:12, accepted_quantity:12, quality_status:'Đạt', check_note:'Mẫu đạt chất lượng', checked_by:employee.user_id, batch_no:'LOT-MAU-004', expiry_date:new Date(now + 90*86400000).toISOString().slice(0,10), remaining_quantity:12 });
  ref.txns.push({ transaction_id:next('t'), material_id:3, receipt_detail_id, transaction_type:'Nhập kho', quantity:12, transaction_date:stamp(8), created_by:employee.user_id });
  const milk = ref.materials.find(x=>x.material_id===3); milk.current_quantity += 12; milk.last_updated=stamp(8);
  ref.sample_data_version = 1;
  return { deliveredOrder, partialOrder };
}

export function migrateReferenceState(ref, hashPassword) {
  ref.users ||= []; ref.orders ||= []; ref.details ||= []; ref.receipts ||= []; ref.rd ||= []; ref.txns ||= []; ref.notifs ||= []; ref.sessions ||= {}; ref.seq ||= {};
  if (ref.account_profile_version !== 3) {
    const profiles = [
      { old:'chuquan', username:'hoaithuong', full_name:'Hoài Thương', role:'employee', password:'HoaiThuong@123' },
      { old:'nhanvien', username:'thuylinh', full_name:'Thuỳ Linh', role:'employee', password:'ThuyLinh@123' },
      { old:'admin', username:'admin', full_name:'Trang Thư', role:'admin', password:'Admin@123' }
    ];
    for (const profile of profiles) {
      let user = ref.users.find(x => x.username === profile.old) || ref.users.find(x => x.username === profile.username);
      if (!user) { user = { user_id:(ref.seq.u = (ref.seq.u || 0) + 1), is_active:1 }; ref.users.push(user); }
      Object.assign(user, { username:profile.username, full_name:profile.full_name, role:profile.role, passwordHash:hashPassword(profile.password), is_active:user.is_active ?? 1 });
    }
    for (const user of ref.users) if (user.role === 'manager' || user.role === 'owner') user.role = 'employee';
    ref.account_profile_version = 3;
  }
  for (const notification of ref.notifs) if (notification.target_role === 'owner') notification.target_role = 'admin';
  for (const notification of ref.notifs) if (notification.target_role === 'manager') notification.target_role = 'employee';
  for (const item of [...ref.materials,...ref.suppliers]) item.is_active ??= 1;
  for (const order of ref.orders) if (['Sent','Partially Received'].includes(order.order_status) && !order.delivery_status) order.delivery_status = ref.receipts.some(x=>x.order_id===order.order_id) ? 'Đã giao' : 'Chờ nhận hàng';
  if (!ref.orders.length) seedReferenceSamples(ref);
  return ref;
}

export function registerReferenceApi(app, { getState, persist, hashPassword, checkPassword, sessionSecret, sendMail }) {
  const loginAttempts = new Map();
  const db = () => getState().reference;
  const next = type => (db().seq[type] = (db().seq[type] || 0) + 1);
  const hashToken = token => createHash('sha256').update(`${sessionSecret}:${token}`).digest('hex');
  const safeUser = user => ({ user_id: user.user_id, full_name: user.full_name, username: user.username, role: user.role });
  const cookieOptions = `HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.NODE_ENV === 'production' || process.env.VERCEL === '1' ? '; Secure' : ''}`;
  const wrap = fn => async (req, res, nextHandler) => {
    try { await fn(req, res); }
    catch (error) {
      const status = Number(error.status) || 500;
      if (status >= 500) console.error('Reference API error:', error);
      if (!res.headersSent) res.status(status).json({ error: status >= 500 ? 'Lỗi hệ thống. Thử lại sau.' : error.message });
      else nextHandler(error);
    }
  };
  const auth = (req, res, nextHandler) => {
    const token = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('alittle_ref_session='))?.slice('alittle_ref_session='.length);
    const session = token && db().sessions?.[hashToken(decodeURIComponent(token))];
    const user = session && session.expiresAt > Date.now() && db().users.find(x => x.user_id === session.userId && x.is_active);
    if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' });
    req.refUser = user;
    nextHandler();
  };
  const route = (method, path, allowedRoles, fn) => app[method](`/api${path}`, auth, (req, res, nextHandler) => {
    if (allowedRoles && !allowedRoles.includes(req.refUser.role)) return res.status(403).json({ error: 'Bạn không có quyền thực hiện chức năng này' });
    return wrap(fn)(req, res, nextHandler);
  });
  const supplier = id => db().suppliers.find(x => x.supplier_id === Number(id));
  const material = id => db().materials.find(x => x.material_id === Number(id));
  const paidFor = id => db().payments.filter(x => x.order_id === Number(id)).reduce((sum, x) => sum + x.amount, 0);
  const getOrder = id => {
    const order = db().orders.find(x => x.order_id === Number(id));
    if (!order) throw fail(404, 'Không tìm thấy đơn hàng');
    const vendor = supplier(order.supplier_id);
    const lines = db().details.filter(x => x.order_id === order.order_id).map(x => ({ ...x, material_name: material(x.material_id)?.material_name || '', unit: material(x.material_id)?.unit || '' }));
    const total = lines.reduce((sum, x) => sum + x.quantity * x.unit_price, 0);
    const paid = paidFor(order.order_id);
    return { ...order, supplier_name: vendor?.supplier_name || '', supplier_email: vendor?.email || null, lines, total, paid, debt: Math.max(0, total - paid) };
  };
  const notify = (target_role, message, order_id = null) => db().notifs.unshift({ id: next('n'), target_role, message, order_id, is_read: 0, created_at: new Date().toISOString() });
  const addNote = (orderId, message) => { const order = db().orders.find(x => x.order_id === Number(orderId)); if (order) order.note = `${order.note || ''}\n[${new Date().toLocaleString('vi-VN')}] ${message}`.trim(); };
  const writeEmail = async ({ to, subject, text, order_id }) => {
    const record = { id: next('e'), to_email: to || null, subject, body: text, order_id, created_at: new Date().toISOString(), error: null };
    if (!to) { record.status = 'failed'; record.error = 'Nhà cung cấp chưa có địa chỉ email'; db().emails.unshift(record); throw new Error(record.error); }
    if (db().mailFail) { record.status = 'failed'; record.error = 'Mô phỏng lỗi gửi email'; db().emails.unshift(record); throw new Error(record.error); }
    try {
      const sent = await sendMail({ to, subject, text });
      record.status = sent ? 'sent' : 'outbox';
      db().emails.unshift(record);
      return record.status;
    } catch (error) { record.status = 'failed'; record.error = String(error.message || error); db().emails.unshift(record); throw error; }
  };
  const validateLines = (orderId, supplierId, lines) => {
    if (!Array.isArray(lines) || !lines.length) throw fail(400, 'Đơn hàng cần ít nhất một nguyên liệu');
    const seen = new Set();
    const result = [];
    for (const line of lines) {
      const materialId = number(line.material_id, 'Nguyên liệu', { min: 1, integer: true });
      const quantity = number(line.quantity, 'Số lượng', { min: 0.0001 });
    if (!material(materialId) || material(materialId).is_active === 0) throw fail(400, 'Không tìm thấy nguyên liệu đang hoạt động');
      if (seen.has(materialId)) throw fail(400, 'Một nguyên liệu chỉ xuất hiện một lần trong đơn');
      seen.add(materialId);
      const price = db().ms.find(x => x.material_id === materialId && x.supplier_id === supplierId);
      if (!price) throw fail(400, 'Nhà cung cấp được chọn chưa cung cấp một trong các nguyên liệu của đơn');
      result.push({ detail_id: next('d'), order_id: orderId, material_id: materialId, quantity, unit_price: price.unit_price });
    }
    db().details = db().details.filter(x => x.order_id !== orderId).concat(result);
  };
  const setLines = (orderId, supplierId, lines) => validateLines(orderId, supplierId, lines);
  const sendOrder = async orderId => {
    const order = getOrder(orderId);
    if (order.order_status !== 'Approved') throw fail(400, 'Chỉ gửi được đơn đã duyệt');
    const body = `Kính gửi ${order.supplier_name},\n\nQuán A Little Đà Nẵng đặt hàng (mã đơn #${order.order_id}):\n${order.lines.map(x => `- ${x.material_name}: ${x.quantity} ${x.unit} x ${x.unit_price.toLocaleString('vi-VN')}đ`).join('\n')}\n\nTổng giá trị: ${order.total.toLocaleString('vi-VN')}đ`;
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await writeEmail({ to: order.supplier_email, subject: `[A Little Đà Nẵng] Đơn đặt hàng #${order.order_id}`, text: body, order_id: order.order_id });
        const lead = Math.max(0, ...order.lines.map(x => db().ms.find(y => y.material_id === x.material_id && y.supplier_id === order.supplier_id)?.lead_time_hours ?? 24));
        Object.assign(db().orders.find(x => x.order_id === order.order_id), { order_status: 'Sent', delivery_status:'Chờ nhận hàng', sent_at: new Date().toISOString(), expected_delivery_at: new Date(Date.now() + (lead || 24) * 3600000).toISOString(), send_failed: 0, reminder_count: 0, late_flag: 0, last_reminder_at: null });
        return { sent: true, attempts: attempt, channel: db().emails[0]?.status };
      } catch (error) { lastError = error; }
    }
    const target = db().orders.find(x => x.order_id === order.order_id);
    target.send_failed = 1;
    addNote(orderId, `Gửi đơn thất bại sau 3 lần thử: ${lastError?.message || 'lỗi không xác định'}. Cần gửi thủ công.`);
    notify('admin', `Gửi đơn #${orderId} cho ${order.supplier_name} thất bại — vui lòng thử lại hoặc gửi thủ công`, orderId);
    return { sent: false, attempts: 3, error: lastError?.message || 'Gửi email thất bại' };
  };
  const orderStatusSet = (order, allowed, message) => { if (!allowed.includes(order.order_status)) throw fail(400, message || `Đơn đang ở trạng thái ${order.order_status}, không thể thực hiện thao tác này`); };
  const inventoryCheck = userId => {
    const low = db().materials.filter(x => x.is_active !== 0 && x.current_quantity <= x.min_quantity);
    const activeMaterials = new Set(db().details.filter(line => activeOrderStates.includes(db().orders.find(o => o.order_id === line.order_id)?.order_status)).map(x => x.material_id));
    const groups = new Map(); const skipped = [];
    for (const item of low) {
      if (activeMaterials.has(item.material_id)) { skipped.push({ material: item.material_name, reason: 'Đã có đơn đang xử lý' }); continue; }
      const best = db().ms.filter(x => x.material_id === item.material_id && supplier(x.supplier_id)?.is_active !== 0).sort((a,b) => a.unit_price - b.unit_price || a.lead_time_hours - b.lead_time_hours)[0];
      if (!best) { skipped.push({ material: item.material_name, reason: 'Chưa có nhà cung cấp' }); continue; }
      if (!groups.has(best.supplier_id)) groups.set(best.supplier_id, []);
      groups.get(best.supplier_id).push({ material_id: item.material_id, quantity: Math.round(Math.max(item.min_quantity * 2 - item.current_quantity, item.min_quantity) * 100) / 100, unit_price: best.unit_price });
    }
    const created = [];
    for (const [supplier_id, lines] of groups) {
      const order_id = next('o');
      db().orders.push({ order_id, supplier_id, created_by: userId, approved_by: null, order_date: new Date().toISOString(), expected_delivery_at: null, order_status: 'Draft', note: null, reminder_count: 0, last_reminder_at: null, sent_at: null, late_flag: 0, send_failed: 0, auto_created: 1 });
      db().details.push(...lines.map(line => ({ detail_id: next('d'), order_id, ...line })));
      created.push(order_id);
      notify('admin', `Đơn nháp #${order_id} được tạo tự động (${lines.length} nguyên liệu dưới định mức) — cần duyệt`, order_id);
    }
    return { created, skipped, low_count: low.length };
  };
  const reminders = async ahead => {
    const targetTime = Date.now() + ahead * 3600000, minimumAge = 120 * 60000, reminded = [];
    for (const order of db().orders.filter(x => x.order_status === 'Sent' && x.expected_delivery_at)) {
      if (targetTime - new Date(order.expected_delivery_at).getTime() < minimumAge || (order.last_reminder_at && targetTime - new Date(order.last_reminder_at).getTime() < minimumAge) || order.reminder_count >= 2) continue;
      try { await writeEmail({ to: supplier(order.supplier_id)?.email, subject: `[A Little Đà Nẵng] Nhắc giao hàng đơn #${order.order_id}`, text: `Đơn #${order.order_id} đã quá hạn giao dự kiến. Vui lòng cập nhật tình trạng.`, order_id: order.order_id }); }
      catch (error) { addNote(order.order_id, `Nhắc NCC thất bại: ${error.message}`); }
      order.reminder_count += 1; order.last_reminder_at = new Date().toISOString(); order.late_flag = +(order.reminder_count >= 2);
      if (order.reminder_count >= 2) notify('admin', `Đơn #${order.order_id} (${supplier(order.supplier_id)?.supplier_name}) giao chậm, đã nhắc 2 lần — chọn đổi nhà cung cấp hoặc hủy đơn`, order.order_id);
      reminded.push({ order_id: order.order_id, reminder_count: order.reminder_count, escalated: order.reminder_count >= 2 });
    }
    return { reminded };
  };
  const consume = (materialId, quantity, userId) => {
    const item = material(materialId);
    if (!item) throw fail(404, 'Không tìm thấy nguyên liệu');
    if (item.current_quantity < quantity) throw fail(400, `Tồn kho không đủ (còn ${item.current_quantity} ${item.unit})`);
    let remaining = quantity; const used = [];
    const batches = db().rd.filter(x => x.material_id === item.material_id && x.remaining_quantity > 0).sort((a,b) => (db().receipts.find(r => r.receipt_id === a.receipt_id)?.received_date || '').localeCompare(db().receipts.find(r => r.receipt_id === b.receipt_id)?.received_date || '') || a.receipt_detail_id - b.receipt_detail_id);
    for (const batch of batches) {
      if (remaining <= 0) break;
      const amount = Math.min(batch.remaining_quantity, remaining);
      batch.remaining_quantity -= amount; remaining -= amount;
      db().txns.unshift({ transaction_id: next('t'), material_id: item.material_id, receipt_detail_id: batch.receipt_detail_id, transaction_type: 'Xuất kho', quantity: -amount, transaction_date: new Date().toISOString(), created_by: userId });
      used.push({ receipt_detail_id: batch.receipt_detail_id, quantity: amount });
    }
    if (remaining > 0) db().txns.unshift({ transaction_id: next('t'), material_id: item.material_id, receipt_detail_id: null, transaction_type: 'Xuất kho', quantity: -remaining, transaction_date: new Date().toISOString(), created_by: userId });
    item.current_quantity -= quantity; item.last_updated = new Date().toISOString();
    return { consumed: quantity, batches: used, remaining: item.current_quantity };
  };
  const receive = (orderId, userId, payload) => {
    const order = getOrder(orderId);
    if (!['Sent', 'Partially Received'].includes(order.order_status)) throw fail(400, 'Chỉ nhận hàng cho đơn đã gửi nhà cung cấp');
    if (order.delivery_status !== 'Đã giao') throw fail(400, 'Hãy cập nhật trạng thái đơn thành “Đã giao” trước khi kiểm tra nhận hàng');
    if (!Array.isArray(payload.lines) || !payload.lines.length) throw fail(400, 'Cần ít nhất một dòng nhận hàng');
    const lines = new Map(order.lines.map(x => [x.material_id, x])); const seen = new Set();
    for (const line of payload.lines) {
      const id = Number(line.material_id);
      if (!lines.has(id)) throw fail(400, 'Nguyên liệu không thuộc đơn hàng');
      if (seen.has(id)) throw fail(400, 'Mỗi nguyên liệu chỉ một dòng trong phiếu nhận');
      seen.add(id);
      if (!Number.isFinite(Number(line.actual_quantity)) || Number(line.actual_quantity) < 0) throw fail(400, 'Số lượng thực nhận không hợp lệ');
      if (!['Đạt', 'Không đạt'].includes(line.quality_status)) throw fail(400, 'Kết quả kiểm tra phải là “Đạt” hoặc “Không đạt”');
    }
    const receiptId = next('r'), createdAt = new Date().toISOString();
    const acceptedAll = payload.lines.every(x => x.quality_status === 'Đạt');
    const receipt = { receipt_id: receiptId, order_id: order.order_id, received_by: userId, received_date: createdAt, invoice_number: payload.invoice_number || null, receipt_status: acceptedAll ? 'Accepted' : 'Returned', note: acceptedAll ? null : 'Trả hàng và yêu cầu đổi' };
    db().receipts.push(receipt);
    for (const input of payload.lines) {
      const id = Number(input.material_id), amount = Number(input.actual_quantity), accepted = input.quality_status === 'Đạt' ? amount : 0, detailId = next('rd');
      const detail = { receipt_detail_id: detailId, receipt_id: receiptId, material_id: id, actual_quantity: amount, accepted_quantity: accepted, quality_status: input.quality_status, check_note: input.check_note || null, checked_by: userId, batch_no: `LOT-${order.order_id}-${id}-${createdAt.slice(0,10).replaceAll('-','')}`, expiry_date: input.expiry_date || null, remaining_quantity: accepted };
      db().rd.push(detail);
      if (accepted > 0) {
        const item = material(id); item.current_quantity += accepted; item.last_updated = createdAt;
        db().txns.unshift({ transaction_id: next('t'), material_id: id, receipt_detail_id: detailId, transaction_type: 'Nhập kho', quantity: accepted, transaction_date: createdAt, created_by: userId });
      }
    }
    const totals = new Map();
    for (const detail of db().rd.filter(x => db().receipts.find(r => r.receipt_id === x.receipt_id)?.order_id === order.order_id)) totals.set(detail.material_id, (totals.get(detail.material_id) || 0) + detail.accepted_quantity);
    const complete = order.lines.every(line => (totals.get(line.material_id) || 0) >= line.quantity);
    const hasRejected = payload.lines.some(x => x.quality_status !== 'Đạt');
    const hasAccepted = [...totals.values()].some(quantity => quantity > 0);
    Object.assign(db().orders.find(x => x.order_id === order.order_id), { order_status:complete ? 'Received' : (hasAccepted ? 'Partially Received' : 'Sent'), delivery_status:'Đã giao' });
    if (hasRejected) notify('admin', `Phiếu nhận #${receiptId} của đơn #${order.order_id} có hàng không đạt — đã ghi nhận trả hàng và yêu cầu đổi`, order.order_id);
    else if (complete) notify('admin', `Đơn #${order.order_id} đã nhận đủ hàng — cần xác nhận thanh toán`, order.order_id);
    return { receipt, order: getOrder(order.order_id) };
  };
  const pay = (input, userId) => {
    const order = getOrder(number(input.order_id, 'Mã đơn', { min: 1, integer: true }));
    if (!['Received', 'Partially Received'].includes(order.order_status)) throw fail(400, 'Chỉ thanh toán cho đơn đã nhận hàng');
    if (order.debt <= 0) throw fail(400, 'Đơn hàng đã thanh toán đủ');
    let amount;
    if (input.mode === 'full') amount = order.debt;
    else if (input.mode === 'half') amount = Math.min(Math.round(order.total * 0.5), order.debt);
    else if (input.mode === 'debt') amount = 0;
    else if (input.mode === 'custom') amount = number(input.amount, 'Số tiền', { min: 0.01 });
    else throw fail(400, 'Hình thức thanh toán không hợp lệ');
    if (amount > order.debt + 0.0001) throw fail(400, `Số tiền vượt quá công nợ còn lại (${order.debt})`);
    if (amount > 0 && !['Chuyển khoản', 'Tiền mặt'].includes(input.payment_method)) throw fail(400, 'Phương thức phải là “Chuyển khoản” hoặc “Tiền mặt”');
    const debt = order.debt - amount;
    const status = input.mode === 'debt' ? 'Ghi nợ' : debt <= 0.0001 ? 'Đã thanh toán' : 'Còn nợ';
    const payment = { payment_id: next('p'), order_id: order.order_id, confirmed_by: userId, amount, payment_method: amount > 0 ? input.payment_method : null, payment_status: status, payment_date: new Date().toISOString(), note: null };
    db().payments.push(payment);
    return { payment_id: payment.payment_id, amount, payment_status: status, debt_remaining: debt };
  };
  const buildOrder = (order, role) => {
    const value = getOrder(order.order_id);
    value.receipts = db().receipts.filter(x => x.order_id === order.order_id);
    if (role === 'admin') value.payments = db().payments.filter(x => x.order_id === order.order_id);
    return value;
  };

  app.post('/api/auth/login', wrap(async (req, res) => {
    const username = required(req.body?.username, 'Tên đăng nhập').toLowerCase();
    const password = required(req.body?.password, 'Mật khẩu');
    const attempts = (loginAttempts.get(username) || []).filter(x => Date.now() - x < 300000);
    if (attempts.length >= 5) throw fail(429, 'Đăng nhập sai quá nhiều lần, vui lòng thử lại sau 5 phút');
    const user = db().users.find(x => x.username === username && x.is_active && checkPassword(password, x.passwordHash));
    if (!user) { loginAttempts.set(username, [...attempts, Date.now()]); throw fail(401, 'Sai tên đăng nhập hoặc mật khẩu'); }
    loginAttempts.delete(username);
    const token = randomBytes(32).toString('base64url');
    db().sessions ||= {};
    db().sessions[hashToken(token)] = { userId: user.user_id, expiresAt: Date.now() + 28800000 };
    await persist();
    res.setHeader('Set-Cookie', `alittle_ref_session=${encodeURIComponent(token)}; ${cookieOptions}`);
    res.json({ token: `server:${user.user_id}`, user: safeUser(user) });
  }));
  route('get', '/auth/me', null, (req,res) => res.json(safeUser(req.refUser)));
  route('post', '/auth/logout', null, async (req,res) => {
    const token = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('alittle_ref_session='))?.slice('alittle_ref_session='.length);
    if (token) delete db().sessions[hashToken(decodeURIComponent(token))];
    await persist(); res.setHeader('Set-Cookie', `alittle_ref_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${process.env.NODE_ENV === 'production' || process.env.VERCEL === '1' ? '; Secure' : ''}`); res.json({ ok: true });
  });
  route('post', '/demo/reset', ['admin'], async (req,res) => {
    const token = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('alittle_ref_session='))?.slice('alittle_ref_session='.length);
    const session = token && db().sessions?.[hashToken(decodeURIComponent(token))];
    const fresh = createReferenceSeed(hashPassword); fresh.sessions = session ? { [hashToken(decodeURIComponent(token))]: session } : {};
    Object.assign(db(), fresh); await persist(); res.json({ ok: true });
  });

  route('get', '/dashboard', null, (req,res) => {
    const result = {
      low_stock: db().materials.filter(x => x.is_active !== 0 && x.current_quantity <= x.min_quantity),
      orders_by_status: Object.entries(db().orders.reduce((out,x) => (out[x.order_status] = (out[x.order_status] || 0) + 1, out), {})).map(([status,n]) => ({ status,n })),
      overdue_orders: db().orders.filter(x => x.order_status === 'Sent' && x.expected_delivery_at < new Date().toISOString()),
      materials_total: db().materials.filter(x=>x.is_active !== 0).length,
      unread_notifications: db().notifs.filter(x => !x.is_read && x.target_role === req.refUser.role).length
    };
    if (req.refUser.role === 'admin') result.total_debt = db().orders.filter(x => ['Received','Partially Received'].includes(x.order_status)).reduce((sum,x) => sum + getOrder(x.order_id).debt, 0);
    res.json(result);
  });
  route('get', '/materials', null, (_req,res) => res.json([...db().materials].filter(x=>x.is_active!==0).sort((a,b) => a.material_name.localeCompare(b.material_name,'vi')).map(x => ({ ...x, supplier_ids:db().ms.filter(link=>link.material_id===x.material_id&&supplier(link.supplier_id)?.is_active!==0).map(link=>link.supplier_id), is_low: +(x.current_quantity <= x.min_quantity) }))));
  route('post', '/materials', ['admin'], async (req,res) => {
    const name = required(req.body?.material_name, 'Tên nguyên liệu');
    if (db().materials.some(x => x.is_active!==0 && x.material_name.toLocaleLowerCase('vi') === name.toLocaleLowerCase('vi'))) throw fail(409, 'Nguyên liệu đã tồn tại');
    const item = { material_id: next('m'), material_name: name, unit: required(req.body?.unit,'Đơn vị'), min_quantity: number(req.body?.min_quantity ?? 0,'Định mức tối thiểu',{min:0}), current_quantity: number(req.body?.current_quantity ?? 0,'Tồn hiện tại',{min:0}), last_updated: new Date().toISOString(), is_active:1 };
    db().materials.push(item); await persist(); res.status(201).json({ material_id: item.material_id });
  });
  route('put', '/materials/:id', ['admin'], async (req,res) => {
    const item = material(req.params.id); if (!item || item.is_active===0) throw fail(404,'Không tìm thấy nguyên liệu đang hoạt động');
    Object.assign(item, { material_name: required(req.body?.material_name ?? item.material_name,'Tên nguyên liệu'), unit: required(req.body?.unit ?? item.unit,'Đơn vị'), min_quantity: number(req.body?.min_quantity ?? item.min_quantity,'Định mức tối thiểu',{min:0}), last_updated: new Date().toISOString() });
    await persist(); res.json({ ok: true });
  });
  route('delete', '/materials/:id', ['admin'], async (req,res) => { const item=material(req.params.id); if(!item||item.is_active===0)throw fail(404,'Không tìm thấy nguyên liệu đang hoạt động'); item.is_active=0; item.last_updated=new Date().toISOString(); await persist(); res.json({ok:true}); });
  route('post', '/materials/:id/consume', ['employee','admin'], async (req,res) => { const result = consume(Number(req.params.id),number(req.body?.quantity,'Số lượng',{min:0.0001}),req.refUser.user_id); await persist(); res.json(result); });
  route('get', '/materials/:id/suppliers', null, (req,res) => res.json(db().ms.filter(x => x.material_id === Number(req.params.id)&&supplier(x.supplier_id)?.is_active!==0).map(x => ({ ...x, supplier_name: supplier(x.supplier_id)?.supplier_name || '' })).sort((a,b)=>a.supplier_name.localeCompare(b.supplier_name,'vi'))));
  route('get', '/material-suppliers', null, (_req,res) => res.json(db().ms.filter(x=>material(x.material_id)?.is_active!==0&&supplier(x.supplier_id)?.is_active!==0).map(x=>({...x,material_name:material(x.material_id)?.material_name||'',supplier_name:supplier(x.supplier_id)?.supplier_name||''})).sort((a,b)=>a.supplier_name.localeCompare(b.supplier_name,'vi')||a.material_name.localeCompare(b.material_name,'vi'))));
  route('put', '/material-suppliers', ['admin'], async (req,res) => {
    const material_id = number(req.body?.material_id,'Nguyên liệu',{min:1,integer:true}), supplier_id = number(req.body?.supplier_id,'Nhà cung cấp',{min:1,integer:true});
    if (!material(material_id) || material(material_id).is_active===0 || !supplier(supplier_id) || supplier(supplier_id).is_active===0) throw fail(400,'Nguyên liệu hoặc nhà cung cấp không tồn tại');
    const value = { material_id, supplier_id, unit_price: number(req.body?.unit_price,'Đơn giá',{min:0}), lead_time_hours: number(req.body?.lead_time_hours,'Thời gian giao',{min:0,integer:true}) };
    const index = db().ms.findIndex(x => x.material_id === material_id && x.supplier_id === supplier_id);
    if (index >= 0) db().ms[index] = value; else db().ms.push(value);
    await persist(); res.json({ ok: true });
  });
  route('get', '/suppliers', null, (_req,res) => res.json([...db().suppliers].filter(x=>x.is_active!==0).sort((a,b) => a.supplier_name.localeCompare(b.supplier_name,'vi'))));
  route('post', '/suppliers', ['admin'], async (req,res) => {
    const body = req.body || {}, email = body.email ? required(body.email,'Email') : null;
    if (email && !emailPattern.test(email)) throw fail(400,'Email không hợp lệ');
    const item = { supplier_id: next('s'), supplier_name: required(body.supplier_name,'Tên nhà cung cấp'), phone: body.phone || null, email, address: body.address || null, is_active:1 };
    db().suppliers.push(item); await persist(); res.status(201).json({ supplier_id: item.supplier_id });
  });
  route('put', '/suppliers/:id', ['admin'], async (req,res) => {
    const item = supplier(req.params.id); if (!item || item.is_active===0) throw fail(404,'Không tìm thấy nhà cung cấp đang hoạt động');
    const body = req.body || {}, email = body.email === undefined ? item.email : (body.email ? required(body.email,'Email') : null);
    if (email && !emailPattern.test(email)) throw fail(400,'Email không hợp lệ');
    Object.assign(item,{supplier_name:required(body.supplier_name ?? item.supplier_name,'Tên nhà cung cấp'),phone:body.phone ?? item.phone,email,address:body.address ?? item.address});
    await persist(); res.json({ ok:true });
  });
  route('delete', '/suppliers/:id', ['admin'], async (req,res) => { const item=supplier(req.params.id); if(!item||item.is_active===0)throw fail(404,'Không tìm thấy nhà cung cấp đang hoạt động'); item.is_active=0; await persist(); res.json({ok:true}); });
  route('get', '/batches', null, (_req,res) => res.json(db().rd.filter(x => x.accepted_quantity > 0).map(x => {
    const receipt = db().receipts.find(y => y.receipt_id === x.receipt_id), item = material(x.material_id);
    return { receipt_detail_id:x.receipt_detail_id,batch_no:x.batch_no,material_id:x.material_id,material_name:item?.material_name || '',unit:item?.unit || '',accepted_quantity:x.accepted_quantity,remaining_quantity:x.remaining_quantity,expiry_date:x.expiry_date,received_date:receipt?.received_date,order_id:receipt?.order_id };
  }).sort((a,b) => (a.remaining_quantity === 0) - (b.remaining_quantity === 0) || String(a.received_date).localeCompare(String(b.received_date)))));
  route('get', '/inventory-transactions', null, (_req,res) => res.json(db().txns.slice(0,200).map(x => ({ ...x, material_name: material(x.material_id)?.material_name || '' }))));
  route('get', '/orders', null, (req,res) => res.json(db().orders.filter(x => !req.query.status || x.order_status === req.query.status).sort((a,b) => b.order_id - a.order_id).map(x => ({ ...getOrder(x.order_id), supplier_name:supplier(x.supplier_id)?.supplier_name || '' }))));
  route('get', '/orders/:id', null, (req,res) => res.json(buildOrder(db().orders.find(x => x.order_id === Number(req.params.id)) || { order_id:Number(req.params.id) },req.refUser.role)));
  route('post', '/orders', ['admin','employee'], async (req,res) => {
    const supplier_id = number(req.body?.supplier_id,'Nhà cung cấp',{min:1,integer:true});
    if (!supplier(supplier_id) || supplier(supplier_id).is_active===0) throw fail(400,'Nhà cung cấp không tồn tại');
    const order_id = next('o');
    const created = { order_id,supplier_id,created_by:req.refUser.user_id,approved_by:null,order_date:new Date().toISOString(),expected_delivery_at:null,order_status:'Draft',delivery_status:null,note:req.body?.note || null,reminder_count:0,last_reminder_at:null,sent_at:null,late_flag:0,send_failed:0,auto_created:0 };
    db().orders.push(created);
    try { setLines(order_id,supplier_id,req.body?.lines); }
    catch (error) { db().orders = db().orders.filter(x => x.order_id !== order_id); throw error; }
    let send = null;
    if (req.refUser.role === 'admin') { created.order_status = 'Approved'; created.approved_by = req.refUser.user_id; send = await sendOrder(order_id); }
    else notify('admin',`Nhân viên ${req.refUser.full_name} gửi đơn #${order_id} chờ chủ quán duyệt`,order_id);
    await persist(); res.status(201).json({ ...getOrder(order_id), send });
  });
  route('put', '/orders/:id', ['admin'], async (req,res) => {
    const order = getOrder(req.params.id); orderStatusSet(order,['Draft'],'Chỉ được chỉnh sửa đơn nháp');
    const supplier_id = req.body?.supplier_id == null ? order.supplier_id : number(req.body.supplier_id,'Nhà cung cấp',{min:1,integer:true});
    if (!supplier(supplier_id) || supplier(supplier_id).is_active===0) throw fail(400,'Nhà cung cấp không tồn tại');
    const before = db().details.filter(x => x.order_id === order.order_id);
    try { setLines(order.order_id,supplier_id,req.body?.lines || order.lines); }
    catch (error) { db().details = db().details.filter(x => x.order_id !== order.order_id).concat(before); throw error; }
    db().orders.find(x => x.order_id === order.order_id).supplier_id = supplier_id;
    await persist(); res.json(getOrder(order.order_id));
  });
  route('post', '/orders/:id/delivery-status', ['employee','admin'], async (req,res) => {
    const order = db().orders.find(x => x.order_id === Number(req.params.id));
    if (!order || !['Sent','Partially Received'].includes(order.order_status)) throw fail(409,'Chỉ cập nhật trạng thái đơn đang chờ nhận hàng');
    const status = req.body?.delivery_status;
    if (!['Đã giao','Chờ nhận hàng'].includes(status)) throw fail(400,'Trạng thái giao hàng không hợp lệ');
    order.delivery_status = status;
    await persist();
    res.json({ ok:true, delivery_status:status });
  });
  route('post', '/orders/:id/approve', ['admin'], async (req,res) => {
    const order = getOrder(req.params.id); orderStatusSet(order,['Draft'],'Chỉ duyệt được đơn nháp');
    const raw = db().orders.find(x => x.order_id === order.order_id); raw.order_status = 'Approved'; raw.approved_by = req.refUser.user_id;
    const send = await sendOrder(order.order_id); await persist(); res.json({ order:getOrder(order.order_id),send });
  });
  route('post', '/orders/:id/reject', ['admin'], async (req,res) => {
    const order = getOrder(req.params.id); orderStatusSet(order,['Draft'],'Chỉ từ chối được đơn nháp');
    const reason = required(req.body?.reason,'Lý do'); db().orders.find(x => x.order_id === order.order_id).order_status = 'Cancelled'; addNote(order.order_id,`Chủ quán từ chối đơn: ${reason}`); await persist(); res.json(getOrder(order.order_id));
  });
  route('post', '/orders/:id/send', ['admin'], async (req,res) => { const result = await sendOrder(req.params.id); await persist(); res.json(result); });
  route('post', '/orders/:id/cancel', ['admin'], async (req,res) => {
    const order = getOrder(req.params.id); orderStatusSet(order,['Draft','Approved','Sent'],'Không thể hủy đơn ở trạng thái này');
    const reason = required(req.body?.reason,'Lý do'); db().orders.find(x => x.order_id === order.order_id).order_status = 'Cancelled'; addNote(order.order_id,`Hủy đơn (user ${req.refUser.user_id}): ${reason}`);
    let supplier_notified = false;
    if (order.order_status === 'Sent') { try { await writeEmail({to:order.supplier_email,subject:`[A Little Đà Nẵng] HỦY đơn đặt hàng #${order.order_id}`,text:`Quán xin hủy đơn #${order.order_id}. Lý do: ${reason}`,order_id:order.order_id}); supplier_notified = true; } catch {} }
    await persist(); res.json({order:getOrder(order.order_id),supplier_notified});
  });
  route('post', '/orders/:id/switch-supplier', ['admin'], async (req,res) => {
    const order = getOrder(req.params.id);
    if (!(order.order_status === 'Sent' && order.late_flag || order.order_status === 'Approved' && order.send_failed)) throw fail(400,'Chỉ đổi nhà cung cấp khi đơn giao chậm (đã nhắc ≥ 2 lần) hoặc gửi đơn thất bại');
    const nextSupplier = number(req.body?.supplier_id,'Nhà cung cấp',{min:1,integer:true});
    if (nextSupplier === order.supplier_id) throw fail(400,'Hãy chọn nhà cung cấp khác');
    if (!supplier(nextSupplier) || supplier(nextSupplier).is_active===0) throw fail(404,'Không tìm thấy nhà cung cấp');
    const old = db().details.filter(x => x.order_id === order.order_id);
    try { setLines(order.order_id,nextSupplier,order.lines.map(x => ({material_id:x.material_id,quantity:x.quantity}))); }
    catch (error) { db().details = db().details.filter(x => x.order_id !== order.order_id).concat(old); throw error; }
    const prior = order.order_status;
    Object.assign(db().orders.find(x => x.order_id === order.order_id),{supplier_id:nextSupplier,order_status:'Approved',send_failed:0,late_flag:0,reminder_count:0,last_reminder_at:null});
    addNote(order.order_id,`Đổi nhà cung cấp từ #${order.supplier_id} sang #${nextSupplier}`);
    if (prior === 'Sent') try { await writeEmail({to:order.supplier_email,subject:`[A Little Đà Nẵng] Hủy đơn #${order.order_id}`,text:'Quán xin hủy đơn do giao chậm.',order_id:order.order_id}); } catch {}
    const send = await sendOrder(order.order_id); await persist(); res.json({order:getOrder(order.order_id),send});
  });
  route('get', '/receipts', null, (_req,res) => res.json([...db().receipts].reverse()));
  route('post', '/receipts', ['employee','admin'], async (req,res) => { const result = receive(number(req.body?.order_id,'Mã đơn',{min:1,integer:true}),req.refUser.user_id,req.body || {}); await persist(); res.status(201).json(result); });
  route('post', '/payments', ['admin'], async (req,res) => { const result = pay(req.body || {},req.refUser.user_id); await persist(); res.status(201).json(result); });
  route('get', '/debts', ['admin'], (_req,res) => res.json(db().orders.filter(x => ['Received','Partially Received'].includes(x.order_status)).sort((a,b) => b.order_id - a.order_id).map(x => { const order=getOrder(x.order_id); return {order_id:x.order_id,supplier_name:order.supplier_name,order_status:x.order_status,total:order.total,paid:order.paid,debt:order.debt}; })));
  route('get', '/notifications', null, (req,res) => res.json(db().notifs.filter(x => x.target_role === req.refUser.role).sort((a,b) => b.id - a.id).slice(0,100)));
  route('post', '/notifications/:id/read', null, async (req,res) => { const item = db().notifs.find(x => x.id === Number(req.params.id) && x.target_role === req.refUser.role); if (item) item.is_read=1; await persist(); res.json({ok:true}); });
  route('get', '/emails', ['employee','admin'], (_req,res) => res.json(db().emails.slice(0,100)));
  route('post', '/jobs/inventory-check', ['employee','admin'], async (req,res) => { const result = inventoryCheck(req.refUser.user_id); await persist(); res.json(result); });
  route('post', '/jobs/reminders', ['employee','admin'], async (req,res) => { const result = await reminders(Number(req.body?.simulate_hours_ahead || 0)); await persist(); res.json(result); });
  route('post', '/dev/mail-failure', ['admin'], async (req,res) => { db().mailFail=!!req.body?.enabled; await persist(); res.json({forceFail:db().mailFail}); });
  route('get', '/users', ['admin'], (_req,res) => res.json(db().users.map(({passwordHash,...user}) => user)));
  route('post', '/users', ['admin'], async (req,res) => {
    const username=required(req.body?.username,'Tên đăng nhập'),password=required(req.body?.password,'Mật khẩu'),role=req.body?.role;
    if (password.length < 8) throw fail(400,'Mật khẩu tối thiểu 8 ký tự');
    if (!roles.includes(role)) throw fail(400,'Vai trò không hợp lệ');
    if (db().users.some(x => x.username === username)) throw fail(409,'Tên đăng nhập đã tồn tại');
    const user={user_id:next('u'),full_name:required(req.body?.full_name,'Họ tên'),username,passwordHash:hashPassword(password),role,is_active:1}; db().users.push(user); await persist(); res.status(201).json({user_id:user.user_id,full_name:user.full_name,username:user.username,role:user.role});
  });
  route('put', '/users/:id', ['admin'], async (req,res) => {
    const user=db().users.find(x=>x.user_id===Number(req.params.id)); if(!user)throw fail(404,'Không tìm thấy người dùng');
    const role=req.body?.role ?? user.role, active=req.body?.is_active==null?user.is_active:+!!req.body.is_active;
    if(!roles.includes(role))throw fail(400,'Vai trò không hợp lệ');
    if(user.user_id===req.refUser.user_id&&(!active||role!=='admin'))throw fail(400,'Không thể tự khóa hoặc hạ quyền chính mình');
    user.role=role;user.is_active=active;await persist();res.json({ok:true});
  });
}
