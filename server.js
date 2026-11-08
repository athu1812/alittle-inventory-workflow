import express from 'express';
import nodemailer from 'nodemailer';
import pg from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createReferenceSeed, migrateReferenceState, registerReferenceApi } from './reference-api.js';

dotenv.config();
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const ROLES = { employee: 'Nhân viên', owner: 'Chủ quán', warehouse: 'Nhân viên kho' };
const DEMO_USERS = [
  ['linh', 'Linh Nguyễn', 'employee'], ['trang', 'Trang Trần', 'owner'], ['kho', 'Minh Lê', 'warehouse']
];
const hashPassword = (password, salt = randomBytes(16).toString('hex')) => `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
const checkPassword = (password, hashed) => { const [salt, key] = String(hashed).split(':'); if (!salt || !key) return false; const expected = Buffer.from(key, 'hex'); const actual = scryptSync(password, salt, expected.length); return expected.length === actual.length && timingSafeEqual(expected, actual); };
const seed = () => ({
  users: DEMO_USERS.map(([username, name, role]) => ({ id: `u_${username}`, username, name, role, passwordHash: hashPassword('Demo123!') })),
  aiDiary: [
    {id:'AI-0001',author:'Nhóm',prompt:'Chương 4. Xây dựng, kiểm thử và đánh giá: mô tả web, xác thực 3 vai trò, 3 luồng XOR, lưu bền vững, tích hợp ngoài, kiểm thử tự động, 15 commit; nhật ký AI tối thiểu 10 lượt; kiểm thử/bảo mật; so sánh AS-IS và TO-BE.',result:'AI nối Chương 4 vào bản sao báo cáo, tạo cấu trúc 4.1–4.4 và bảng điền bằng chứng. Các ô chưa có dữ liệu được đánh dấu thay vì khẳng định đã triển khai.',evaluation:'Bố cục theo đề cương nhưng dữ liệu kiểm thử, log AI, Git và thời gian TO-BE chưa có trong nguồn; bản Word không render được để kiểm tra bố cục do thiếu LibreOffice.',adjustment:'Yêu cầu xây dựng web chạy được và ghi nhật ký từ tương tác thực tế; kiểm tra lại trong một thư mục ứng dụng riêng.',outcome:'success',failurePattern:'',at:new Date(Date.now()-1800000).toISOString()},
    {id:'AI-0002',author:'Nhóm',prompt:'m có thể xây dựng web cho t luôn không, xây dựng web và làm nhật ký AI á, thành 1 cái web thiệt',result:'AI kiểm tra thư mục và phát hiện ứng dụng hiện hữu là web nhận diện té ngã, khác đề tài nhập nguyên liệu. Chọn xây ứng dụng quy trình kho độc lập và có nhật ký AI lưu trực tiếp trong web.',evaluation:'Phát hiện đúng sai khác chủ đề, nhưng cần giữ nguyên dự án cũ và triển khai riêng để tránh ghi đè.',adjustment:'Tạo ứng dụng trong thư mục mới hoàn toàn theo yêu cầu tiếp theo.',outcome:'success',failurePattern:'',at:new Date(Date.now()-1200000).toISOString()},
    {id:'AI-0003',author:'Nhóm',prompt:'tạo một thư mục mới hoàn toàn luônnnnn',result:'Tạo thư mục riêng inventory-procurement-web, chứa giao diện, backend, dữ liệu, kiểm thử và README; không sửa ứng dụng té ngã.',evaluation:'Đáp ứng yêu cầu tách biệt, đường dẫn nằm dưới thư mục dự án hiện có do quyền ghi chỉ cho phép trong workspace này.',adjustment:'Tiếp tục hoàn thiện luồng nghiệp vụ và chạy bộ kiểm thử trong thư mục mới.',outcome:'success',failurePattern:'',at:new Date(Date.now()-900000).toISOString()},
    {id:'AI-0004',author:'AI · phiên phát triển',prompt:'Đọc/chỉnh test tại inventory-procurement-web/test/workflow.test.js trong phiên PowerShell có working directory là inventory-procurement-web.',result:'Lệnh thất bại vì ghép tiền tố inventory-procurement-web thêm lần nữa; PowerShell không tìm thấy workflow.test.js.',evaluation:'Thất bại do không đối chiếu working directory hiện tại với đường dẫn tương đối. Đây là mẫu sai lệch ngữ cảnh đường dẫn (context/path mismatch), không phải lỗi của mã ứng dụng.',adjustment:'Dùng đường dẫn tương đối test/workflow.test.js tính từ working directory hiện tại rồi chạy lại.',outcome:'failed',failurePattern:'Sai lệch ngữ cảnh thực thi: đường dẫn tương đối bị giải theo sai thư mục gốc.',at:new Date(Date.now()-600000).toISOString()},
    {id:'AI-0005',author:'AI · phiên phát triển',prompt:'Chạy npm test -- --test-reporter=spec để xác minh các kịch bản của ứng dụng.',result:'Node test runner thất bại trước khi chạy test do spawn EPERM khi tạo tiến trình con.',evaluation:'Thất bại vì lệnh kiểm thử dùng worker process không được phép trong môi trường thực hiện. Đây là giới hạn môi trường/công cụ, không phải kết quả test thất bại.',adjustment:'Chạy node test/workflow.test.js trực tiếp (6/6 đạt), sau đó đổi script test trong package.json sang cách chạy trực tiếp.',outcome:'failed',failurePattern:'Không khớp khả năng môi trường: test runner cần spawn tiến trình con nhưng sandbox chặn.',at:new Date(Date.now()-300000).toISOString()},
    {id:'AI-0006',author:'AI · yêu cầu lập trình',prompt:'Triển khai backend Express cho web nhập nguyên liệu: đăng nhập, ba vai trò, API nghiệp vụ, cổng XOR và lưu dữ liệu.',result:'Tạo server.js với API đăng nhập, kho, đơn hàng, phê duyệt, nhận hàng, thanh toán và gửi email SMTP tùy chọn.',evaluation:'Các luồng chính có kiểm tra quyền và được bao phủ trong bộ kiểm thử tích hợp; chưa có SMTP credentials nên gửi mail thực chưa được xác minh.',adjustment:'Bổ sung nhật ký kiểm toán, nhật ký AI bền vững và chạy test các nhánh ngoại lệ.',outcome:'success',failurePattern:'',at:new Date(Date.now()-240000).toISOString()},
    {id:'AI-0007',author:'AI · yêu cầu lập trình',prompt:'Tạo giao diện tiếng Việt responsive cho dashboard, tồn kho, đơn hàng, hoạt động và nhật ký AI.',result:'Tạo giao diện đăng nhập, sidebar, dashboard, bảng dữ liệu và biểu mẫu xử lý đơn/nhật ký.',evaluation:'Trang login mở được trong trình duyệt; API xác nhận server hoạt động. Chưa có kiểm tra hiển thị trên nhiều kích thước màn hình.',adjustment:'Thêm CSS responsive và kiểm tra cú pháp JavaScript; ghi hạn chế QA giao diện vào README.',outcome:'success',failurePattern:'',at:new Date(Date.now()-180000).toISOString()},
    {id:'AI-0008',author:'AI · yêu cầu lập trình',prompt:'Thêm trang nhật ký AI có prompt, kết quả, đánh giá, điều chỉnh, kết quả đạt/thất bại và mẫu nguyên nhân.',result:'Tạo API lưu nhật ký trong JSON, biểu mẫu nhập và hiển thị danh sách; ghi lại ba prompt người dùng và hai lỗi công cụ thực tế.',evaluation:'Nhật ký hiện đủ 10 mục sau khi bổ sung năm lượt coding task đã thực hiện trong phiên; hai lỗi được phân tích là sai ngữ cảnh đường dẫn và giới hạn spawn.',adjustment:'Công khai phân loại các mục là yêu cầu người dùng, lỗi công cụ hoặc yêu cầu lập trình để tránh nhầm lẫn loại tương tác.',outcome:'success',failurePattern:'',at:new Date(Date.now()-120000).toISOString()},
    {id:'AI-0009',author:'AI · yêu cầu lập trình',prompt:'Viết bộ test tự động cho ba vai trò, quyền API, ba cổng XOR, lưu bền vững, email và nhật ký AI.',result:'Tạo 7 kiểm thử tích hợp; kết quả npm test hiện tại là 7 đạt, 0 lỗi.',evaluation:'Bao phủ API cốt lõi nhưng chưa kiểm thử browser end-to-end, tốc độ tải, kiểm thử tải hoặc SMTP với tài khoản thật.',adjustment:'Bổ sung các kiểm thử đó nếu có môi trường triển khai và cấu hình dịch vụ ngoài.',outcome:'success',failurePattern:'',at:new Date(Date.now()-60000).toISOString()},
    {id:'AI-0010',author:'AI · yêu cầu chạy ứng dụng',prompt:'Khởi động web và xác minh trang chủ, health check và mục nhật ký AI trên localhost.',result:'Ứng dụng trả HTTP 200 ở localhost:3001; /api/health trả ok và API nhật ký có dữ liệu.',evaluation:'Xác minh chạy được trong môi trường này, chưa phải bản deploy công khai. Email SMTP chưa cấu hình.',adjustment:'Ghi lệnh chạy, tài khoản demo và hạn chế deploy/SMTP vào README để nhóm tự chạy và cấu hình.',outcome:'success',failurePattern:'',at:new Date().toISOString()},
    {id:'AI-0011',author:'Nhóm',prompt:'Chủ quán không cần gửi đơn duyệt, chỉ có nhân viên mới cần gửi đơn duyệt, chủ quán tạo đơn là đi thẳng tới NCC luôn. Làm đẹp web và thu gọn nhật ký còn đơn nhập/đơn trả lại, hiện số lượng và mã đơn.',result:'Điều chỉnh backend để đơn nhân viên chờ duyệt, đơn chủ quán chuyển trực tiếp sang trạng thái gửi NCC; thêm ghi nhận phần nhận/nhập/trả và lọc nhật ký theo hai sự kiện. Làm mới giao diện với icon và tông màu cà phê.',evaluation:'Mã frontend và backend đã được cập nhật; chưa chạy lại bộ kiểm thử trong lượt chỉnh sửa này. SMTP chưa cấu hình nên gửi email NCC thật chưa xác minh.',adjustment:'Cập nhật hướng dẫn, kiểm tra mã cú pháp, khởi động lại web và nhờ nhóm cấu hình SMTP/review luồng thực tế.',outcome:'success',failurePattern:'',at:new Date().toISOString()},
    {id:'AI-0012',author:'Nhóm',prompt:'M có thể chỉnh lại web theo dạng như trang hethongcapbangdiem-due.vercel.app không, giữ nghiệp vụ nhưng build deploy công khai?',result:'Tổ chức lại trang đăng nhập thành cổng nghiệp vụ với header, điều hướng, form đăng nhập, thẻ truy cập nhanh cho ba vai trò; giữ nhận diện A Little màu nâu ấm. Xác định Vercel cần repo Git và PostgreSQL bền vững thay cho JSON cục bộ.',evaluation:'Giao diện local đã mở được. URL công khai chưa thể tạo khi repo chưa có source commit và database chưa kết nối.',adjustment:'Chuẩn bị adapter PostgreSQL cho serverless và cấu hình Vercel; xin người dùng tạo Supabase project để thêm bí mật qua dashboard.',outcome:'success',failurePattern:'',at:new Date().toISOString()},
    {id:'AI-0013',author:'Nhóm',prompt:'Kết nối repository athu1812/alittle-inventory-workflow với Vercel và Supabase để đưa ứng dụng lên địa chỉ công khai.',result:'Khởi tạo repository local, đặt origin GitHub; thêm backend PostgreSQL dùng transaction row lock và session lưu bền vững; export app Express theo preset Vercel. Thêm hướng dẫn DATABASE_URL và SESSION_SECRET.',evaluation:'Cú pháp entry point đã kiểm tra được; cần kết nối database thật và deploy. Chưa chạy bộ test trong lượt này.',adjustment:'Người dùng tạo Supabase project và lưu Transaction pooler URL; tiếp theo nhập URL cùng SESSION_SECRET vào Vercel, rồi deploy từ branch main.',outcome:'success',failurePattern:'',at:new Date().toISOString()},
    {id:'AI-0014',author:'Nhóm',prompt:'Lồng cấu hình SMTP vào trong web để cấu hình và gửi email cho nhà cung cấp.',result:'Thêm cấu hình SMTP dành cho Chủ quán ở trang Thông báo & email, endpoint lưu cấu hình mã hóa AES-256-GCM, gửi email thử và dùng SMTP đã lưu để gửi đơn hàng.',evaluation:'Đã kiểm tra cú pháp JavaScript frontend/backend. Chưa gửi email thực tế vì cần thông tin máy chủ, tài khoản SMTP và email nhận thử của nhóm.',adjustment:'Nhập cấu hình SMTP trong web sau khi deploy, gửi email thử để xác nhận kết nối, rồi thử tạo đơn để kiểm tra email NCC.',outcome:'success',failurePattern:'',at:new Date().toISOString()}
  ], sessions: {}, reference: createReferenceSeed(hashPassword),
  inventory: [
    { id: 'm_espresso', name: 'Hạt cà phê Espresso', unit: 'kg', current: 8, minimum: 12, supplier: 'Công ty Cà phê Tây Nguyên', price: 185000 },
    { id: 'm_milk', name: 'Sữa tươi thanh trùng', unit: 'lít', current: 22, minimum: 18, supplier: 'Trang trại Sữa Đà Lạt', price: 32000 },
    { id: 'm_matcha', name: 'Bột Matcha', unit: 'kg', current: 2, minimum: 4, supplier: 'Trà Việt', price: 420000 },
    { id: 'm_cup', name: 'Ly giấy 500ml', unit: 'cái', current: 650, minimum: 300, supplier: 'Bao bì Xanh', price: 1200 }
  ], orders: [], receipts: [], payments: [], audit: [], nextId: 1
});

export function createApplication({ storePath = process.env.STORE_PATH || path.join(ROOT, 'data', 'store.json'), sessionSecret = process.env.SESSION_SECRET || 'local-development-secret-change-before-deploy', emailTransport = null } = {}) {
  const app = express();
  app.disable('x-powered-by'); app.use(express.json({ limit: '250kb' }));
  const failures = new Map();
  let state;
  let initPromise;
  let persistQueue = Promise.resolve();
  const databaseUrl = process.env.DATABASE_URL;
  const pool = databaseUrl ? new pg.Pool({ connectionString: databaseUrl, max: 5, ssl: { rejectUnauthorized: false } }) : null;
  const currentState = () => requestContext.getStore()?.state ?? state;
  const requestContext = new AsyncLocalStorage();
  app.use((req, res, next) => {
    if (process.env.VERCEL === '1' && req.path.startsWith('/api/') && (!databaseUrl || !process.env.SESSION_SECRET || sessionSecret === 'local-development-secret-change-before-deploy')) {
      return res.status(503).json({ error: 'Thiếu DATABASE_URL hoặc SESSION_SECRET trong Environment Variables của Vercel.' });
    }
    next();
  });
  const persist = () => {
    const client = requestContext.getStore()?.client;
    if (client) return client.query('UPDATE alittle_app_state SET payload = $1::jsonb, updated_at = now() WHERE id = 1', [JSON.stringify(currentState())]);
    if (pool) return pool.query('INSERT INTO alittle_app_state (id, payload) VALUES (1, $1::jsonb) ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()', [JSON.stringify(currentState())]);
    persistQueue = persistQueue.then(async () => { await mkdir(path.dirname(storePath), { recursive: true }); const tmp = `${storePath}.${process.pid}.tmp`; await writeFile(tmp, JSON.stringify(state, null, 2), { mode: 0o600 }); await rename(tmp, storePath); }); return persistQueue;
  };
  const init = () => {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      let shouldPersist = false;
      if (pool) {
        await pool.query('CREATE TABLE IF NOT EXISTS alittle_app_state (id smallint PRIMARY KEY CHECK (id = 1), payload jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())');
        const result = await pool.query('SELECT payload FROM alittle_app_state WHERE id = 1');
        state = result.rows[0]?.payload || seed();
        shouldPersist = !result.rows[0]?.payload;
      } else {
        try { state = JSON.parse(await readFile(storePath, 'utf8')); }
        catch (e) { if (e.code !== 'ENOENT') throw e; state = seed(); shouldPersist = true; }
      }
      const stateBeforeMigration = JSON.stringify(state);
      state.sessions ||= {};
      state.reference = migrateReferenceState(state.reference || createReferenceSeed(hashPassword), hashPassword);
      delete state.reference.smtpConfig;
      state.reference.sessions ||= {};
      if (!Array.isArray(state.aiDiary)) state.aiDiary = [];
      const existingIds = new Set(state.aiDiary.map(x=>x.id));
      for (const entry of seed().aiDiary) if (!existingIds.has(entry.id)) state.aiDiary.push(entry);
      if (shouldPersist || JSON.stringify(state) !== stateBeforeMigration) await persist();
    })();
    return initPromise;
  };
  if (pool) app.use(async (req, res, next) => {
    if (!req.path.startsWith('/api/')) return next();
    if (req.method === 'GET' || req.method === 'HEAD') {
      try {
        await init();
        const result = await pool.query('SELECT payload FROM alittle_app_state WHERE id = 1');
        requestContext.run({ state: result.rows[0]?.payload || state }, () => next());
      } catch (error) { next(error); }
      return;
    }
    let client;
    try {
      await init();
      client = await pool.connect(); await client.query('BEGIN');
      const result = await client.query('SELECT payload FROM alittle_app_state WHERE id = 1 FOR UPDATE');
      state = result.rows[0].payload;
      state.sessions ||= {};
      const finish = async commit => {
        if (!client) return;
        const held = client; client = null;
        try { await held.query(commit ? 'COMMIT' : 'ROLLBACK'); } finally { held.release(); }
      };
      const originalJson = res.json.bind(res);
      res.json = body => {
        void (async () => {
          try { await finish(res.statusCode < 400); originalJson(body); }
          catch (error) { console.error(error); if (!res.headersSent) res.status(500).json({ error: 'Lỗi lưu dữ liệu. Thử lại sau.' }); }
        })();
        return res;
      };
      res.on('close', () => { if (client) void finish(false); });
      requestContext.run({ client: (() => { const captured = client; return captured; })(), state }, () => next());
    } catch (error) { if (client) { try { await client.query('ROLLBACK'); } catch {} client.release(); } next(error); }
  });
  app.use((req, res, next) => { if (pool && req.path.startsWith('/api/')) return next(); void init().then(() => next(), next); });
  registerReferenceApi(app, {
    getState: currentState,
    persist,
    hashPassword,
    checkPassword,
    sessionSecret,
    sendMail: async () => false
  });
  const audit = (actor, action, details = {}) => currentState().audit.unshift({ id: `a_${currentState().nextId++}`, actor: actor?.username || 'system', action, details, at: new Date().toISOString() });
  const cookieHash = token => createHash('sha256').update(`${sessionSecret}:${token}`).digest('hex');
  const auth = (req, res, next) => { const token = parseCookies(req.headers.cookie).alittle_session; const session = token && currentState().sessions?.[cookieHash(token)]; const user = session && session.expiresAt > Date.now() && currentState().users.find(u => u.id === session.userId); if (!user) return res.status(401).json({ error: 'Vui lòng đăng nhập.' }); req.user = user; next(); };
  const allow = (...roles) => (req,res,next) => roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Tài khoản không có quyền thực hiện thao tác này.' });
  app.get('/api/health', (_req,res) => res.json({ ok: true, app: 'A Little Inventory', persistence: pool ? 'PostgreSQL' : 'JSON file', externalEmail: Boolean(emailTransport || smtpReady()) }));
  app.post('/api/login', async (req,res) => {
    const username = String(req.body?.username || '').trim().toLowerCase(); const key = `${req.ip}:${username}`; const attempt = failures.get(key) || { count: 0, until: 0 };
    if (attempt.until > Date.now()) return res.status(429).json({ error: 'Đăng nhập tạm khóa. Thử lại sau một phút.' });
    const user = currentState().users.find(u => u.username === username);
    if (!user || !checkPassword(String(req.body?.password || ''), user.passwordHash)) { attempt.count++; if (attempt.count >= 5) { attempt.until = Date.now() + 60000; attempt.count = 0; } failures.set(key, attempt); return res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu chưa đúng.' }); }
    failures.delete(key); const token = randomBytes(32).toString('base64url'); currentState().sessions[cookieHash(token)] = { userId:user.id, expiresAt:Date.now()+8*60*60*1000 }; audit(user, 'login'); await persist();
    res.setHeader('Set-Cookie', `alittle_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
    res.json({ user: publicUser(user) });
  });
  app.post('/api/logout', auth, async (req,res) => { const token = parseCookies(req.headers.cookie).alittle_session; if (token) delete currentState().sessions[cookieHash(token)]; audit(req.user,'logout'); await persist(); res.setHeader('Set-Cookie','alittle_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'); res.json({ ok: true }); });
  app.get('/api/me', auth, (req,res) => res.json({ user: publicUser(req.user) }));
  app.get('/api/dashboard', auth, allow('employee','owner'), (req,res) => { const needs = currentState().inventory.filter(x => x.current <= x.minimum); const openOrders = currentState().orders.filter(o => !['received','rejected','cancelled'].includes(o.status)); res.json({ inventoryCount: currentState().inventory.length, lowStock: needs.length, openOrders: openOrders.length, pendingApproval: currentState().orders.filter(o=>o.status==='pending_approval').length, recent: currentState().audit.slice(0,8).map(({id,actor,action,at})=>({id,actor,action,at})) }); });
  app.get('/api/inventory', auth, (_req,res) => res.json({ items: currentState().inventory }));
  app.patch('/api/inventory/:id', auth, allow('owner','warehouse'), async (req,res) => { const item=currentState().inventory.find(x=>x.id===req.params.id); if(!item) return res.status(404).json({error:'Không tìm thấy nguyên liệu.'}); const current=Number(req.body?.current), minimum=req.user.role==='warehouse'?item.minimum:Number(req.body?.minimum); if(!Number.isFinite(current)||current<0||!Number.isFinite(minimum)||minimum<0) return res.status(400).json({error:'Số lượng và định mức phải là số không âm.'}); item.current=current; item.minimum=minimum; audit(req.user,'inventory_adjusted',{item:item.name,current,minimum}); await persist(); res.json({item}); });
  app.get('/api/orders', auth, allow('employee','owner'), (_req,res) => res.json({orders: [...currentState().orders].reverse()}));
  app.post('/api/orders', auth, allow('employee','owner'), async (req,res) => { const item=currentState().inventory.find(x=>x.id===req.body?.itemId); const quantity=Number(req.body?.quantity); if(!item||!Number.isFinite(quantity)||quantity<=0) return res.status(400).json({error:'Chọn nguyên liệu và số lượng hợp lệ.'}); const ownerDirect=req.user.role==='owner'; const order={id:`PO-${String(currentState().nextId++).padStart(4,'0')}`,itemId:item.id,itemName:item.name,supplier:item.supplier,quantity,unit:item.unit,unitPrice:item.price,total:quantity*item.price,status:ownerDirect?'sent':'pending_approval',decision:null,createdBy:req.user.name,createdAt:new Date().toISOString(),reminderCount:0,...(ownerDirect?{sentAt:new Date().toISOString(),sentBy:'manual'}:{})}; if(ownerDirect){const transport=emailTransport||makeSmtpTransport();if(transport&&process.env.ALERT_EMAIL_TO){try{await transport.sendMail({from:process.env.ALERT_EMAIL_FROM||process.env.SMTP_USER,to:process.env.ALERT_EMAIL_TO,subject:`Đơn nhập nguyên liệu ${order.id} · A Little Đà Nẵng`,text:`Nhà cung cấp: ${order.supplier}\nNguyên liệu: ${order.itemName}\nSố lượng: ${order.quantity} ${order.unit}\nTổng dự kiến: ${order.total} VND`});order.sentBy='email';}catch(e){return res.status(502).json({error:'Không gửi được email tới nhà cung cấp. Đơn chưa được tạo; hãy kiểm tra SMTP rồi thử lại.'});}}}currentState().orders.push(order);audit(req.user,ownerDirect?'owner_direct_order':'employee_order_submitted',{orderId:order.id,quantity,item:item.name});await persist();res.status(201).json({order,message:ownerDirect?(order.sentBy==='email'?'Đơn đã được tạo và gửi thẳng tới nhà cung cấp qua email.':'Đơn đã được tạo ở trạng thái gửi thẳng tới nhà cung cấp. SMTP chưa bật nên cần liên hệ NCC bằng kênh thường dùng.'):'Đơn đã gửi chủ quán chờ duyệt.'}); });
  app.patch('/api/orders/:id', auth, allow('employee'), async(req,res)=>{const order=currentState().orders.find(o=>o.id===req.params.id);if(!order)return res.status(404).json({error:'Không tìm thấy đơn.'});if(order.status!=='draft'||order.createdBy!==req.user.name)return res.status(409).json({error:'Chỉ sửa được đơn được chủ quán trả lại cho chính người tạo.'});const item=currentState().inventory.find(x=>x.id===req.body?.itemId);const quantity=Number(req.body?.quantity);if(!item||!Number.isFinite(quantity)||quantity<=0)return res.status(400).json({error:'Chọn nguyên liệu và số lượng hợp lệ.'});Object.assign(order,{itemId:item.id,itemName:item.name,supplier:item.supplier,quantity,unit:item.unit,unitPrice:item.price,total:quantity*item.price,status:'pending_approval',decision:null,resubmittedAt:new Date().toISOString()});audit(req.user,'employee_order_resubmitted',{orderId:order.id});await persist();res.json({order,message:'Đơn đã gửi lại chủ quán chờ duyệt.'});});
  app.post('/api/orders/:id/decision', auth, allow('owner'), async (req,res) => { const order=currentState().orders.find(o=>o.id===req.params.id);if(!order)return res.status(404).json({error:'Không tìm thấy đơn.'});if(order.status!=='pending_approval')return res.status(409).json({error:'Đơn này không còn chờ duyệt.'});const choice=req.body?.choice;if(!['approve','reject','revise'].includes(choice))return res.status(400).json({error:'Chọn một nhánh: duyệt, từ chối hoặc trả lại để sửa.'});const result={approve:['approved','Đã duyệt'],reject:['rejected','Từ chối đơn'],revise:['draft','Trả lại để chỉnh sửa']}[choice];order.status=result[0];order.decision={choice,label:result[1],by:req.user.name,at:new Date().toISOString(),note:String(req.body?.note||'').slice(0,300)};if(choice==='reject'||choice==='revise')audit(req.user,'order_returned',{orderId:order.id,itemName:order.itemName,supplier:order.supplier,quantity:order.quantity,unit:order.unit,orderQuantity:order.quantity,reason:choice==='revise'?'Chủ quán trả lại để nhân viên chỉnh sửa':'Chủ quán từ chối đơn',note:order.decision.note,createdBy:order.createdBy});audit(req.user,'order_xor_decision',{orderId:order.id,choice});await persist();res.json({order,message:choice==='revise'?'Đã trả đơn về nhân viên chỉnh sửa.':choice==='reject'?'Đã từ chối đơn.':'Đã duyệt đơn.'});});
  app.post('/api/orders/:id/send', auth, allow('owner'), async (req,res)=>{ const order=currentState().orders.find(o=>o.id===req.params.id); if(!order) return res.status(404).json({error:'Không tìm thấy đơn.'}); if(order.status!=='approved') return res.status(409).json({error:'Chỉ gửi được đơn đã được duyệt.'}); let emailSent=false; const transport=emailTransport||makeSmtpTransport(); if(transport&&process.env.ALERT_EMAIL_TO){try{await transport.sendMail({from:process.env.ALERT_EMAIL_FROM||process.env.SMTP_USER,to:process.env.ALERT_EMAIL_TO,subject:`Đơn nhập nguyên liệu ${order.id} · A Little Đà Nẵng`,text:`Nhà cung cấp: ${order.supplier}\nNguyên liệu: ${order.itemName}\nSố lượng: ${order.quantity} ${order.unit}\nTổng dự kiến: ${order.total} VND`});emailSent=true;}catch(e){return res.status(502).json({error:'Không gửi được email. Đơn vẫn ở trạng thái đã duyệt; kiểm tra cấu hình SMTP rồi thử lại.'});}} order.status='sent'; order.sentAt=new Date().toISOString(); order.sentBy=emailSent?'email':'manual'; audit(req.user,'order_sent',{orderId:order.id,channel:order.sentBy}); await persist(); res.json({order,message:emailSent?'Đã gửi đơn đặt hàng qua email.': 'Đơn được ghi nhận là đã gửi thủ công. Muốn gửi tự động, cấu hình SMTP và ALERT_EMAIL_TO.'}); });
  app.post('/api/orders/:id/receipt', auth, allow('employee','owner'), async(req,res)=>{const order=currentState().orders.find(o=>o.id===req.params.id);if(!order||!['sent','approved','partial'].includes(order.status))return res.status(409).json({error:'Đơn chưa sẵn sàng nhận hàng.'});const actual=Number(req.body?.quantity);const status=req.body?.quality;const accepted=status==='accepted'?actual:status==='partial'?Number(req.body?.acceptedQuantity):0;if(!Number.isFinite(actual)||actual<=0)return res.status(400).json({error:'Số lượng nhận phải lớn hơn 0.'});if(!['accepted','rejected','partial'].includes(status))return res.status(400).json({error:'Chọn một nhánh XOR: đạt, không đạt hoặc đạt một phần.'});if(status==='partial'&&(!Number.isFinite(accepted)||accepted<=0||accepted>=actual))return res.status(400).json({error:'Số lượng đạt phải lớn hơn 0 và nhỏ hơn số thực nhận.'});const returned=Math.max(0,actual-accepted);const receipt={id:`GR-${String(currentState().nextId++).padStart(4,'0')}`,orderId:order.id,quantity:actual,acceptedQuantity:accepted,returnedQuantity:returned,quality:status,note:String(req.body?.note||'').slice(0,300),checkedBy:req.user.name,at:new Date().toISOString()};currentState().receipts.push(receipt);order.receiptId=receipt.id;order.status=status==='rejected'?'quality_rejected':'received';order.receivedQuantity=actual;order.acceptedQuantity=accepted;order.qualityDecision=status;if(accepted>0){const item=currentState().inventory.find(x=>x.id===order.itemId);item.current+=accepted;receipt.stockedQuantity=accepted;audit(req.user,'order_received',{orderId:order.id,itemName:order.itemName,supplier:order.supplier,quantity:accepted,unit:order.unit,orderQuantity:order.quantity,actualQuantity:actual,acceptedQuantity:accepted,returnedQuantity:returned,receivedBy:req.user.name});}if(returned>0)audit(req.user,'order_returned',{orderId:order.id,itemName:order.itemName,supplier:order.supplier,quantity:returned,unit:order.unit,orderQuantity:order.quantity,actualQuantity:actual,acceptedQuantity:accepted,reason:status==='rejected'?'Lô hàng không đạt yêu cầu':'Một phần lô hàng không đạt yêu cầu',note:receipt.note,createdBy:order.createdBy});audit(req.user,'quality_xor_decision',{orderId:order.id,receiptId:receipt.id,choice:status});await persist();res.status(201).json({receipt,order,message:returned?`Đã nhập ${accepted} ${order.unit}; trả lại ${returned} ${order.unit}.`:`Đã nhập ${accepted} ${order.unit} vào kho.`});});
  app.post('/api/orders/:id/payment', auth, allow('owner'), async (req,res)=>{const order=currentState().orders.find(o=>o.id===req.params.id);if(!order||!['received','paid_partial','on_credit'].includes(order.status))return res.status(409).json({error:'Chỉ ghi nhận thanh toán sau khi nhận hàng.'});const choice=req.body?.choice;if(!['full','partial','debt'].includes(choice))return res.status(400).json({error:'Cổng XOR: chọn thanh toán đủ, một phần hoặc ghi nợ.'});const remaining=order.total-(order.paid||0);const amount=choice==='full'?remaining:choice==='partial'?Number(req.body?.amount):0;if(choice==='partial'&&(!Number.isFinite(amount)||amount<=0||amount>=remaining))return res.status(400).json({error:'Khoản trả một phần phải lớn hơn 0 và nhỏ hơn số còn lại.'});const payment={id:`PAY-${String(currentState().nextId++).padStart(4,'0')}`,orderId:order.id,choice,amount,method:['cash','transfer'].includes(req.body?.method)?req.body.method:'transfer',by:req.user.name,at:new Date().toISOString()};currentState().payments.push(payment);order.paid=(order.paid||0)+amount;order.balance=order.total-order.paid;order.status=order.balance<=0?'paid':choice==='debt'?'on_credit':'paid_partial';audit(req.user,'payment_xor_decision',{orderId:order.id,choice,amount});await persist();res.status(201).json({payment,order});});
  app.get('/api/activity', auth, allow('employee','owner'), (_req,res)=>res.json({events:currentState().audit.filter(e=>['order_received','order_returned'].includes(e.action)).slice(0,100)}));
  app.get('/api/ai-diary', auth, allow('employee','owner'), (_req,res)=>res.json({entries:[...(currentState().aiDiary||[])].reverse()}));
  app.post('/api/ai-diary', auth, allow('employee','owner'), async (req,res)=>{const {prompt,result,evaluation,adjustment}=req.body||{};if(![prompt,result,evaluation,adjustment].every(v=>typeof v==='string'&&v.trim().length>=8))return res.status(400).json({error:'Mỗi lượt cần prompt, kết quả, đánh giá và điều chỉnh (ít nhất 8 ký tự).'});const entry={id:`AI-${randomBytes(5).toString('hex')}`,author:req.user.name,prompt:prompt.trim().slice(0,3000),result:result.trim().slice(0,3000),evaluation:evaluation.trim().slice(0,2000),adjustment:adjustment.trim().slice(0,2000),outcome:req.body.outcome==='failed'?'failed':'success',failurePattern:String(req.body.failurePattern||'').slice(0,200),at:new Date().toISOString()};currentState().aiDiary=currentState().aiDiary||[];currentState().aiDiary.push(entry);audit(req.user,'ai_diary_added',{entryId:entry.id,outcome:entry.outcome});await persist();res.status(201).json({entry});});
  app.get('/api/integration', auth, allow('owner'), (_req,res)=>res.json({emailConfigured:Boolean(emailTransport||smtpReady()),provider:'SMTP email',externalEnabled:Boolean(emailTransport||smtpReady())}));
  app.post('/api/integration/email-test', auth, allow('owner'), async (_req,res)=>{try{const transport=emailTransport||makeSmtpTransport(); if(!transport) return res.status(503).json({error:'SMTP chưa cấu hình. Sao chép .env.example thành .env và điền thông tin SMTP.'}); const to=process.env.ALERT_EMAIL_TO;if(!to&&!emailTransport)return res.status(503).json({error:'Thiếu ALERT_EMAIL_TO trong .env.'});await transport.sendMail({from:process.env.ALERT_EMAIL_FROM||process.env.SMTP_USER,to:to||'test@example.invalid',subject:'A Little Inventory - kiểm tra tích hợp',text:'Email kiểm tra kết nối gửi thông báo nhà cung cấp.'});audit(_req.user,'email_integration_test',{to:to||'injected transport'});await persist();res.json({ok:true,message:'Đã gửi email kiểm tra.'});}catch(e){res.status(502).json({error:`Gửi email thất bại: ${e.message}`});}});
  app.use(express.static(path.join(ROOT,'public'),{index:'index.html',fallthrough:true}));
  app.use((err,_req,res,_next)=>{console.error(err);res.status(500).json({error:'Lỗi hệ thống. Thử lại sau.'});});
  app.locals.init=init; app.locals.state=()=>state; return app;
}
const app = createApplication();
export default app;
function parseCookies(header=''){return Object.fromEntries(header.split(';').map(c=>c.trim().split('=').map(decodeURIComponent)).filter(p=>p.length===2));}
function publicUser(u){return{id:u.id,username:u.username,name:u.name,role:u.role,roleLabel:ROLES[u.role]};}
function smtpReady(){return Boolean(process.env.SMTP_HOST&&process.env.SMTP_USER&&process.env.SMTP_PASS&&process.env.ALERT_EMAIL_TO);}
function makeSmtpTransport(){return smtpReady()?nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:String(process.env.SMTP_SECURE)==='true',auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}}):null;}

if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  await app.locals.init(); const port=Number(process.env.PORT||3001); app.listen(port,()=>console.log(`A Little Inventory chạy tại http://localhost:${port}`));
}
