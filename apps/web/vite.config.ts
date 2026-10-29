import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(
    mode,
    path.resolve(import.meta.dirname, '../..'),
    'DEMO_ADMIN_',
  );
  // Accounts created by apps/api/scripts/demo-seed.ts: on the dev server, or in a build with
  // DEMO_LOGIN=true. Such a build carries the admin password, so it is for local demos only.
  const password = 'demo password 123';
  const demoAccounts =
    command === 'serve' || process.env.DEMO_LOGIN === 'true'
      ? [
          ...(
            [
              ['buyer@demo.vn', 'Nguyễn Văn Demo'],
              ['buyer2@demo.vn', 'Trần Thị Demo'],
            ] as const
          ).map(([email, label]) => ({
            group: 'buyer',
            label,
            email,
            password,
          })),
          ...(
            [
              ['seller@demo.vn', 'Thời Trang Basic'],
              ['seller2@demo.vn', 'Nhà Gỗ Mộc An'],
              ['gom@demo.vn', 'Gốm Sứ Bát Tràng'],
              ['caphe@demo.vn', 'Cà Phê Cầu Đất Farm'],
              ['phukien@demo.vn', 'Phụ Kiện Số Sài Gòn'],
              ['mypham@demo.vn', 'Mỹ Phẩm Lá Xanh'],
              ['giay@demo.vn', 'Giày Chạy Bộ Runner'],
              ['tra@demo.vn', 'Trà Thái Nguyên Xanh'],
              ['dochoi@demo.vn', 'Đồ Chơi Gỗ Bé Xinh'],
              ['sotay@demo.vn', 'Sổ Tay Handmade'],
              ['dolen@demo.vn', 'Đồ Len Handmade'],
            ] as const
          ).map(([email, label]) => ({
            group: 'seller',
            label,
            email,
            password,
          })),
          ...(env.DEMO_ADMIN_EMAIL && env.DEMO_ADMIN_PASSWORD
            ? [
                {
                  group: 'admin',
                  label: 'Quản trị',
                  email: env.DEMO_ADMIN_EMAIL,
                  password: env.DEMO_ADMIN_PASSWORD,
                },
              ]
            : []),
        ]
      : [];

  return {
    define: { __DEMO_ACCOUNTS__: JSON.stringify(demoAccounts) },
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
    server: {
      proxy: {
        '/api': {
          target: process.env.API_URL ?? 'http://localhost:3000',
          rewrite: (p) => p.replace(/^\/api/, ''),
          // The API scopes the refresh cookie to /auth; behind the proxy that path is /api/auth.
          cookiePathRewrite: { '/auth': '/api/auth' },
        },
      },
    },
  };
});
