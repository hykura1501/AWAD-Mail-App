# Hướng dẫn cấu hình Google OAuth

## Lỗi "no registered origin" và "invalid_client"

Lỗi này xảy ra khi Google Cloud Console chưa được cấu hình đúng. Làm theo các bước sau:

## Bước 1: Vào Google Cloud Console

1. Truy cập: https://console.cloud.google.com/
2. Chọn project của bạn (hoặc tạo project mới)

## Bước 2: Bật Google+ API

1. Vào **APIs & Services** > **Library**
2. Tìm "Google+ API" hoặc "People API"
3. Click **Enable**

## Bước 3: Tạo OAuth 2.0 Credentials

1. Vào **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **OAuth client ID**
3. Nếu chưa có OAuth consent screen, bạn sẽ được yêu cầu cấu hình:
   - Chọn **External** (hoặc Internal nếu dùng Google Workspace)
   - Điền App name, User support email
   - Thêm email của bạn vào Test users (nếu ở chế độ Testing)
   - Click **Save and Continue** qua các bước

## Bước 4: Cấu hình OAuth Client ID

1. **Application type**: Chọn **Web application**
2. **Name**: Đặt tên (ví dụ: "Email App Frontend")
3. **Authorized JavaScript origins**: 
   - Thêm: `http://localhost:5173` (cho development)
   - Nếu deploy, thêm URL production (ví dụ: `https://your-app.netlify.app`)
4. **Authorized redirect URIs**: 
   - Với @react-oauth/google, bạn có thể để trống hoặc thêm:
   - `http://localhost:5173` (cho development)
   - `https://your-app.netlify.app` (cho production)

## Bước 5: Copy Client ID

1. Sau khi tạo xong, copy **Client ID**
2. Dán vào file `.env` của frontend:
   ```
   VITE_GOOGLE_CLIENT_ID=paste-your-client-id-here
   ```

## Bước 6: Restart dev server

```bash
# Dừng server (Ctrl+C) và chạy lại
npm run dev
```

## Lưu ý quan trọng:

- **Authorized JavaScript origins** PHẢI khớp chính xác với URL bạn đang chạy
- Nếu chạy trên `http://localhost:5173`, phải thêm chính xác `http://localhost:5173` (không có dấu `/` ở cuối)
- Nếu chạy trên port khác, phải thêm đúng port đó
- Sau khi thay đổi trong Google Cloud Console, có thể mất vài phút để có hiệu lực

## Kiểm tra lại:

1. Đảm bảo file `.env` có `VITE_GOOGLE_CLIENT_ID` đúng
2. Đảm bảo đã restart dev server sau khi thay đổi `.env`
3. Đảm bảo Authorized JavaScript origins trong Google Console khớp với URL bạn đang dùng
4. Clear cache trình duyệt nếu vẫn lỗi

