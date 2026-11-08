# A Little Inventory

Ứng dụng web tiếng Việt hỗ trợ quy trình nhập nguyên liệu của quán cà phê A Little Đà Nẵng. Dự án này độc lập với các ứng dụng khác trong thư mục cha. Có thể chạy cục bộ bằng JSON hoặc deploy Vercel với PostgreSQL trên Supabase.

## Chạy ứng dụng

Yêu cầu Node.js 20+. Từ thư mục `inventory-procurement-web`:

```powershell
npm install
Copy-Item .env.example .env
npm start
```

Mở `http://localhost:3001`. Không có `DATABASE_URL`, ứng dụng tạo `data/store.json`. Khi có `DATABASE_URL`, ứng dụng tự tạo bảng `alittle_app_state` trong PostgreSQL và lưu dữ liệu tại đó. Tệp dữ liệu và `.env` nằm trong `.gitignore`.

## Vai trò demo

- Chủ quán (Trang Thư): `admin` / `Admin@123` — duyệt đơn, tạo đơn gửi thẳng NCC, thanh toán, công nợ và quản lý tài khoản.
- Nhân viên (Hoài Thương): `hoaithuong` / `HoaiThuong@123` — lập đơn chờ chủ quán duyệt, nhận hàng và xuất kho.
- Nhân viên (Thuỳ Linh): `thuylinh` / `ThuyLinh@123` — lập đơn chờ chủ quán duyệt, nhận hàng và xuất kho.
- Nhân viên kho: `nhanvienkho` / `Kho@12345` — chỉ truy cập Nguyên liệu & tồn kho và Lô hàng FIFO; có thể xuất kho theo FIFO, không được tạo đơn, nhận hàng hay quản lý danh mục.

Mật khẩu được băm bằng scrypt trước khi lưu. Đổi các tài khoản demo trước khi dùng cho mục đích ngoài lớp học. `SESSION_SECRET` cần là giá trị ngẫu nhiên dài, riêng tư.

## Chức năng

- Dashboard: tồn dưới định mức, đơn theo trạng thái, đơn trễ, thông báo chưa đọc và công nợ.
- Danh mục nguyên liệu, nhà cung cấp và bảng giá/lead time theo từng cặp nguyên liệu–NCC. Bảng giá được nhóm theo NCC và có thể chỉnh sửa; nguyên liệu/NCC được xóa mềm để bảo toàn lịch sử đơn.
- Đơn nhiều dòng: nhân viên gửi chờ duyệt; đơn do chủ quán tạo đi thẳng tới NCC. Khi lập đơn, chọn NCC trước để lọc nguyên liệu và xác nhận trước khi tạo.
- Nhận hàng hiển thị ngay các đơn đang chờ; cập nhật “Đã giao” hoặc “Chờ nhận hàng” trước khi kiểm tra chất lượng.
- Kiểm kho tạo đơn nháp tự động theo NCC có giá tốt/lead time ngắn; nhắc giao hàng, email outbox và nhật ký gửi.
- Nhận hàng nhiều dòng, kiểm tra chất lượng/hạn dùng, ghi lô và biến động kho; xuất kho theo FIFO.
- Thanh toán đủ, một phần, ghi nợ; quản lý người dùng theo vai trò; thông báo theo vai trò.
- API kiểm tra vai trò ở server. Mật khẩu và session không lưu dạng rõ.
- Nhân viên kho chỉ được mở `/materials` và `/batches`; API phía máy chủ cũng chặn các trang và thao tác ngoài phạm vi này. Quyền sửa/xóa danh mục nguyên liệu và nhà cung cấp vẫn thuộc Chủ quán.

## Tích hợp email bên ngoài

Có thể bật SMTP qua `.env` (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`). Mỗi nhà cung cấp nhận mail theo email trong hồ sơ. Nếu SMTP chưa cấu hình, email được ghi vào outbox thay vì gửi ra ngoài; lỗi gửi được lưu để chủ quán thử lại. Không lưu bí mật trong mã nguồn.

## Kiểm thử

```powershell
npm test
```

Bộ kiểm thử hiện có là bộ kiểm thử workflow ban đầu; cần mở rộng thêm coverage cho các màn hình mới từ bản demo.

## Deploy lên Vercel

Repository root là thư mục này. Chọn Framework Preset `Express`; `server.js` export ứng dụng Express, còn `public/` chứa giao diện tĩnh. Giữ Build Command và Output Directory theo mặc định Vercel (không override). Tạo các biến môi trường Production (và Preview nếu cần):

- `DATABASE_URL`: connection string **Transaction pooler** lấy trong Supabase → Connect. Dùng URL đầy đủ, giữ bí mật.
- `SESSION_SECRET`: chuỗi ngẫu nhiên dài, riêng tư.
- SMTP variables tùy chọn như phần tích hợp email.

Vercel cần PostgreSQL qua transaction pooler; request đầu tự tạo bảng trạng thái, nạp tài khoản, nhà cung cấp, nguyên liệu, bảng giá, đơn mẫu và phiếu nhận mẫu khi database trống. Dữ liệu được khóa theo giao dịch PostgreSQL để hạn chế ghi đè giữa các request. Nếu thiếu biến môi trường, API trả lỗi cấu hình thay vì ghi vào filesystem tạm.

## Phạm vi và hạn chế

Bản cục bộ dùng tệp JSON; bản Vercel dùng Supabase PostgreSQL. Dữ liệu mẫu phản ánh quy trình minh họa, không phải dữ liệu vận hành thực. Email là outbox nếu chưa cấu hình SMTP; hệ thống chưa tích hợp thanh toán ngân hàng hoặc quy trình quên mật khẩu. Không dùng tài khoản demo hoặc dữ liệu demo để vận hành kinh doanh thật.

## Nhật ký làm việc với AI

Phiên bản tham khảo có màn hình thông báo và email outbox. Nhật ký AI của bản báo cáo trước vẫn còn ở API dữ liệu ban đầu; giao diện mới tập trung vào các chức năng vận hành trong file HTML tham khảo.

## Git

Thư mục này được nối với repository `athu1812/alittle-inventory-workflow`. Ghi commit theo các mốc chức năng thực tế; không tạo commit giả để tăng số đếm.

