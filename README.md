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

## Tài khoản demo

Ba vai trò đăng nhập (mật khẩu demo cho cả ba tài khoản là `Demo123!`):

- Nhân viên: `linh` — tạo đơn và ghi nhận hàng.
- Chủ quán: `trang` — tạo đơn gửi thẳng NCC, duyệt đơn nhân viên và xác nhận thanh toán.
- Phụ trách kho: `kho` — điều chỉnh tồn kho và ghi nhận hàng.

Đây là tài khoản demo với mật khẩu dùng chung `Demo123!`; chỉ phù hợp cho bài tập/trình diễn, không dùng dữ liệu kinh doanh thật. `SESSION_SECRET` phải là chuỗi ngẫu nhiên dài, riêng tư.

## Các luồng XOR

1. Nhân viên tạo đơn và gửi chủ quán duyệt; chủ quán chọn duyệt, từ chối hoặc trả lại để chỉnh sửa. Đơn do chủ quán tạo đi thẳng sang trạng thái gửi NCC, không qua bước duyệt.
2. Người nhận hàng chọn đạt, đạt một phần hoặc không đạt; chỉ lượng đạt được cộng vào tồn kho.
3. Chủ quán chọn thanh toán đủ, thanh toán một phần hoặc ghi nợ.

Nhật ký quy trình chỉ hiển thị hai loại: đơn đã nhập kho và đơn bị trả lại. Mỗi dòng ghi mã đơn, mặt hàng, nhà cung cấp, số lượng nhập/trả và thời gian. Quyền được kiểm tra ở API, không chỉ ẩn nút trên giao diện.

## Tích hợp email bên ngoài

Có thể bật SMTP qua `.env` (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `ALERT_EMAIL_TO`). Chủ quán có thể gửi thư thử bằng nút “Kết nối email NCC”. Khi cấu hình SMTP và `ALERT_EMAIL_TO`, đơn do chủ quán tạo sẽ được gửi email ngay tới địa chỉ cấu hình; đơn nhân viên chỉ gửi email sau khi chủ quán duyệt và bấm gửi NCC. Hiện địa chỉ nhận dùng chung, chưa ánh xạ email riêng theo từng nhà cung cấp. Nếu chưa cấu hình SMTP, đơn chủ quán tạo chuyển sang trạng thái cần liên hệ NCC thủ công. Bí mật không lưu trong mã nguồn.

## Kiểm thử

```powershell
npm test
```

Bộ kiểm thử bao phủ đăng nhập ba vai trò, chặn truy cập không xác thực/sai vai trò, ba cổng XOR, ghi tồn kho, công nợ, lưu bền vững và connector email.

## Deploy lên Vercel

Repository root là thư mục này. Vercel tự nhận Node.js và dùng `api/index.js`; file `vercel.json` định tuyến API tới Express function, còn `public/` chứa giao diện. Tạo các biến môi trường Production (và Preview nếu cần):

- `DATABASE_URL`: connection string **Transaction pooler** lấy trong Supabase → Connect. Dùng URL đầy đủ, giữ bí mật.
- `SESSION_SECRET`: chuỗi ngẫu nhiên dài, riêng tư.
- SMTP variables tùy chọn như phần tích hợp email.

Vercel function cần PostgreSQL qua transaction pooler; khi request đầu chạy, ứng dụng tự tạo bảng trạng thái và nạp dữ liệu mẫu nếu database còn trống. Đơn hàng, kho, thanh toán, người dùng demo, sessions và nhật ký dùng chung một hàng JSONB, được khóa giao dịch để giữ nhất quán giữa các request.

## Phạm vi và hạn chế

Bản cục bộ dùng tệp JSON; bản Vercel yêu cầu Supabase PostgreSQL. Dữ liệu mẫu phản ánh quy trình minh họa, không phải dữ liệu vận hành thực. Chưa tích hợp thanh toán ngân hàng, quản lý người dùng từ giao diện hoặc quên mật khẩu. SMTP là tùy chọn. Không dùng tài khoản/mật khẩu demo hoặc dữ liệu demo để vận hành kinh doanh thật.

## Nhật ký làm việc với AI

Ứng dụng có mục “Nhật ký AI” để ghi prompt, kết quả, đánh giá, điều chỉnh và phân tích mẫu thất bại. Demo hiện có 11 mục được phân loại: 4 yêu cầu của người dùng, 2 lỗi công cụ có nguyên nhân/cách sửa, và 5 yêu cầu lập trình/chạy ứng dụng trong phiên này. Nhóm nên rà lại nội dung, thay tóm lược bằng prompt nguyên văn nếu giảng viên yêu cầu, và dùng thuật ngữ mẫu thất bại đúng theo tài liệu học phần.

## Git

Thư mục này được nối với repository `athu1812/alittle-inventory-workflow`. Ghi commit theo các mốc chức năng thực tế; không tạo commit giả để tăng số đếm.
