// k6: every buyer hits "buy now" on the flash sale once, all at the same moment.
import { check } from 'k6';
import { SharedArray } from 'k6/data';
import exec from 'k6/execution';
import http from 'k6/http';

const buyers = new SharedArray('buyers', () =>
  JSON.parse(open('./out/buyers.json')),
);
const API = __ENV.API_URL || 'http://localhost:3100';

export const options = {
  scenarios: {
    rush: {
      executor: 'per-vu-iterations',
      vus: buyers.length,
      iterations: 1,
      maxDuration: '2m',
    },
  },
  thresholds: {
    checks: ['rate==1'],
    // All buyers queue on one quota row and one stock row; measured p95 is about 2s on a laptop.
    'http_req_duration{expected_response:true}': ['p(95)<5000'],
  },
};

// A sold-out answer is a correct outcome, not a failure.
http.setResponseCallback(http.expectedStatuses(201, 409));

export default function () {
  const b = buyers[exec.vu.idInTest - 1];
  const res = http.post(
    `${API}/checkout`,
    JSON.stringify({
      flashSale: { id: b.flashSaleId, quantity: 1 },
      addressId: b.addressId,
      paymentMethod: 'cod',
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${b.token}`,
        'Idempotency-Key': b.key,
        'X-Forwarded-For': b.ip,
      },
      tags: { outcome: 'checkout' },
    },
  );
  check(res, {
    'order placed or sold out': (r) => r.status === 201 || r.status === 409,
  });
}
