import { createApplication } from '../server.js';

const app = createApplication();
let initialization;

export default async function handler(req, res) {
  try {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required on Vercel');
    if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'local-development-secret-change-before-deploy') throw new Error('SESSION_SECRET must be configured on Vercel');
    initialization ||= app.locals.init();
    await initialization;
    return app(req, res);
  } catch (error) {
    console.error('A Little startup error:', error);
    return res.status(500).json({ error: 'Không thể kết nối cơ sở dữ liệu. Kiểm tra cấu hình DATABASE_URL trên Vercel.' });
  }
}
