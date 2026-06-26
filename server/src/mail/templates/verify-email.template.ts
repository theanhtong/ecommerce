export const verifyEmailTemplate = (
  name: string,
  verifyUrl: string,
): string => `
  <h2>Xin chào ${name},</h2>
  <p>Click vào link bên dưới để xác thực email:</p>
  <a href="${verifyUrl}" style="
    background: #4F46E5;
    color: white;
    padding: 12px 24px;
    border-radius: 6px;
    text-decoration: none;
  ">Xác thực email</a>
  <p>Link hết hạn sau 24 giờ.</p>
  <p>Nếu bạn không đăng ký, hãy bỏ qua email này.</p>
`;
