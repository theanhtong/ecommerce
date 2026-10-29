import { paymentState } from './order-view.js';

const order = (
  method: 'cod' | 'online',
  extra: Partial<Parameters<typeof paymentState>[0]> = {},
) =>
  paymentState({
    checkout: { paymentMethod: method, payment: null },
    refund: null,
    shipment: null,
    status: 'to_ship',
    ...extra,
  });

describe('paymentState', () => {
  it('follows the transfer for online orders', () => {
    expect(order('online')).toBe('pending');
    expect(
      order('online', {
        checkout: { paymentMethod: 'online', payment: { status: 'paid' } },
      }),
    ).toBe('paid');
  });

  it('counts cash on delivery as collected once delivered', () => {
    expect(order('cod')).toBe('cod_due');
    expect(order('cod', { status: 'cancelled' })).toBe('none');
    expect(
      order('cod', {
        shipment: { deliveredAt: new Date() } as never,
      }),
    ).toBe('cod_collected');
  });

  it('puts a refund first', () => {
    expect(order('cod', { refund: { status: 'pending' } })).toBe(
      'refund_pending',
    );
    expect(order('online', { refund: { status: 'paid' } })).toBe('refunded');
  });
});
