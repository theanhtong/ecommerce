import { findPaymentCode, paymentCode } from './payment-code.js';

describe('payment codes', () => {
  it('finds a generated code inside a reflowed transfer note', () => {
    const code = paymentCode();
    expect(code).toMatch(/^MKP[A-Z2-9]{8}$/);
    expect(findPaymentCode(`ck ${code.toLowerCase()}-chuyen tien`)).toBe(code);
    expect(findPaymentCode('chuyen tien an trua')).toBeNull();
  });
});
