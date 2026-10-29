import { errorCode } from './http-error.js';

describe('errorCode', () => {
  it('slugs fixed messages and groups validation errors', () => {
    expect(errorCode('Shop not found')).toBe('shop_not_found');
    expect(errorCode('Idempotency-Key header is required')).toBe(
      'idempotency_key_header_is_required',
    );
    expect(errorCode(['code must be a string'])).toBe('validation_failed');
    expect(errorCode(undefined)).toBeUndefined();
  });
});
