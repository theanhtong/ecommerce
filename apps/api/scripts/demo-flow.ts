// Resets the dev database and MinIO bucket (keeps admins and regions) and runs the marketplace flow through the API.
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';
import { Client } from 'minio';
import pg from 'pg';

if (existsSync('../../.env')) process.loadEnvFile('../../.env');

const API =
  process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
const PASSWORD = 'demo password 123';
const BUYER = { email: 'buyer@demo.vn', username: 'demo_buyer' };
const SELLER = { email: 'seller@demo.vn', username: 'demo_seller' };
const SELLER2 = { email: 'seller2@demo.vn', username: 'demo_seller2' };
const BUYER2 = { email: 'buyer2@demo.vn', username: 'demo_buyer2' };
const SAMPLE_CSV = 'scripts/sample-items.csv';

interface CallOptions {
  token?: string;
  body?: unknown;
  form?: FormData;
  headers?: Record<string, string>;
}

async function call(
  method: string,
  path: string,
  expected: number,
  { token, body, form, headers }: CallOptions = {},
) {
  const send = () =>
    fetch(`${API}${path}`, {
      method,
      headers: {
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...(token && { Authorization: `Bearer ${token}` }),
        ...headers,
      },
      body: form ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
  let res = await send();
  // The demo makes more requests a minute than the API's rate limit allows.
  while (res.status === 429 && expected !== 429) {
    const wait = Number(res.headers.get('retry-after')) || 5;
    console.log(`    rate limited, waiting ${wait}s`);
    await new Promise((resolve) => setTimeout(resolve, wait * 1000));
    res = await send();
  }
  const text = await res.text();
  const isJson = res.headers.get('content-type')?.includes('json');
  const json = isJson && text ? JSON.parse(text) : text;
  const ok = res.status === expected;
  console.log(
    `  ${ok ? '✓' : '✗'} ${method.padEnd(5)} ${path} → ${res.status}`,
  );
  if (!ok) {
    throw new Error(`Expected ${expected}, got ${res.status}: ${text}`);
  }
  return json;
}

const step = (title: string) => console.log(`\n${title}`);

async function resetDatabase() {
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    const { rows } = await db.query<{ wards: number }>(
      'SELECT count(*)::int AS wards FROM wards',
    );
    if (!rows[0].wards) {
      throw new Error('No wards loaded; run pnpm db:seed first');
    }
    await db.query('BEGIN');
    await db.query(
      'TRUNCATE ledger_lines, ledger_entries, ledger_accounts, refunds, bank_transfers, outbox_events',
    );
    // Orders go first: they reference models and shops.
    const orders = await db.query('DELETE FROM orders');
    await db.query('DELETE FROM checkouts');
    await db.query('DELETE FROM promotions');
    const items = await db.query('DELETE FROM items');
    const shops = await db.query('DELETE FROM shops');
    const users = await db.query("DELETE FROM users WHERE role <> 'admin'");
    await db.query('COMMIT');
    console.log(
      `  deleted ${orders.rowCount} orders, ${items.rowCount} items, ${shops.rowCount} shops, ${users.rowCount} non-admin users (and their sessions)`,
    );
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    await db.end();
  }
}

async function resetBucket() {
  const url = new URL(process.env.MINIO_ENDPOINT ?? '');
  const minio = new Client({
    endPoint: url.hostname,
    port: Number(url.port),
    useSSL: url.protocol === 'https:',
    region: 'us-east-1',
    accessKey: process.env.MINIO_ACCESS_KEY ?? '',
    secretKey: process.env.MINIO_SECRET_KEY ?? '',
  });
  const bucket = process.env.MINIO_BUCKET ?? '';
  if (!(await minio.bucketExists(bucket))) return;
  const keys: string[] = [];
  for await (const object of minio.listObjectsV2(bucket, '', true)) {
    if (object.name) keys.push(object.name);
  }
  for (let i = 0; i < keys.length; i += 1000) {
    await minio.removeObjects(bucket, keys.slice(i, i + 1000));
  }
  console.log(`  deleted ${keys.length} objects from ${bucket}`);
}

// A plain PNG: a vertical gradient from one colour to white, so each sample image looks different.
function samplePng([r, g, b]: [number, number, number], size = 480) {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const rows = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    const t = y / size;
    const pixel = [r, g, b].map((c) => Math.round(c + (255 - c) * t * 0.7));
    const row = y * (size * 3 + 1);
    for (let x = 0; x < size; x++) rows.set(pixel, row + 1 + x * 3);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Same path as the browser: signed form from the API, file straight to MinIO, then the API claims it.
async function addImage(token: string, itemId: string, png: Buffer) {
  const signed = await call('POST', '/uploads/images', 201, {
    token,
    body: { contentType: 'image/png' },
  });
  const form = new FormData();
  for (const [name, value] of Object.entries(
    signed.fields as Record<string, string>,
  )) {
    form.append(name, value);
  }
  form.append('file', new Blob([new Uint8Array(png)], { type: 'image/png' }));
  const res = await fetch(signed.url, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`MinIO upload failed: ${res.status}`);
  return call('POST', `/items/${itemId}/images`, 201, {
    token,
    body: { key: signed.key },
  });
}

async function main() {
  const adminEmail = process.env.DEMO_ADMIN_EMAIL;
  const adminPassword = process.env.DEMO_ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) {
    throw new Error('Set DEMO_ADMIN_EMAIL and DEMO_ADMIN_PASSWORD in .env');
  }
  try {
    await fetch(API);
  } catch {
    throw new Error(
      `API is not reachable at ${API}; start it with pnpm dev:api`,
    );
  }

  step('0. Reset dev database and bucket');
  await resetDatabase();
  await resetBucket();

  step('1. Buyer and seller register');
  const buyer = await call('POST', '/auth/register', 201, {
    body: { ...BUYER, password: PASSWORD },
  });
  const seller = await call('POST', '/auth/register', 201, {
    body: { ...SELLER, password: PASSWORD },
  });

  step('2. Seller opens a shop with its pickup address (pending review)');
  const shop = await call('POST', '/shops', 201, {
    token: seller.accessToken,
    body: {
      name: 'Cửa Hàng Demo',
      description: 'Áo thun cơ bản',
      contactName: 'Kho Cửa Hàng Demo',
      phone: '0901 234 567',
      wardCode: '00070',
      street: '12 Hàng Bài',
    },
  });
  await call('GET', `/shops/${shop.id}`, 404);
  console.log(
    `    pickup and return address: ${shop.street}, ${shop.ward.name}, ${shop.province.name}`,
  );

  step('3. Admin logs in and approves the shop');
  const admin = await call('POST', '/auth/login', 200, {
    body: { email: adminEmail, password: adminPassword },
  });
  await call('GET', '/admin/shops?status=pending', 200, {
    token: admin.accessToken,
  });
  await call('PATCH', `/admin/shops/${shop.id}/status`, 200, {
    token: admin.accessToken,
    body: { status: 'active' },
  });

  step('4. Buyer sees the shop but cannot touch admin endpoints');
  await call('GET', `/shops/${shop.id}`, 200);
  await call('GET', '/users/me', 200, { token: buyer.accessToken });
  await call('GET', '/admin/users', 403, { token: buyer.accessToken });
  await call('PATCH', `/admin/shops/${shop.id}/status`, 403, {
    token: buyer.accessToken,
    body: { status: 'banned' },
  });

  step('5. Seller updates their own shop');
  await call('PATCH', '/shops/me', 200, {
    token: seller.accessToken,
    body: { description: 'Áo thun cơ bản, giao toàn quốc' },
  });

  step('6. Seller lists one item with colour and size variations');
  const shirt = await call('POST', '/items', 201, {
    token: seller.accessToken,
    body: {
      name: 'Áo thun cotton',
      description: 'Cotton 100%, form rộng',
      weight: 300,
      tierVariations: [
        { name: 'Màu', options: ['Trắng', 'Đen'] },
        { name: 'Size', options: ['M', 'L'] },
      ],
      models: [
        { tierIndex: [0, 0], price: 2000, stock: 10, sku: 'AO-TRANG-M' },
        { tierIndex: [0, 1], price: 2000, stock: 8, sku: 'AO-TRANG-L' },
        { tierIndex: [1, 0], price: 3000, stock: 5, sku: 'AO-DEN-M' },
        { tierIndex: [1, 1], price: 3000, stock: 0, sku: 'AO-DEN-L' },
      ],
    },
  });

  step('7. Seller edits a model price and restocks the sold-out size');
  const blackL = shirt.models.find(
    (m: { tierIndex: number[] }) => m.tierIndex.join() === '1,1',
  );
  await call('PATCH', `/models/${blackL.id}`, 200, {
    token: seller.accessToken,
    body: { price: 2500 },
  });
  const restocked = await call(
    'POST',
    `/models/${blackL.id}/stock-adjustments`,
    201,
    {
      token: seller.accessToken,
      body: { delta: 12, reason: 'restock' },
    },
  );
  console.log(`    black/L stock: 0 → ${restocked.onHand}`);
  await call('POST', `/models/${blackL.id}/stock-adjustments`, 201, {
    token: seller.accessToken,
    body: { delta: -2, reason: 'adjust' },
  });
  await call('POST', `/models/${blackL.id}/stock-adjustments`, 409, {
    token: seller.accessToken,
    body: { delta: -100, reason: 'adjust' },
  });
  const history = await call(
    'GET',
    `/models/${blackL.id}/stock-movements`,
    200,
    {
      token: seller.accessToken,
    },
  );
  console.log(
    `    movements: ${history.items.map((m: { delta: number; reason: string }) => `${m.delta > 0 ? '+' : ''}${m.delta} ${m.reason}`).join(', ')}`,
  );

  step('8. Buyer browses the shop');
  const listing = await call('GET', `/shops/${shop.id}/items`, 200);
  console.log(
    `    public listing: ${listing.items.map((i: { name: string; priceMin: number; priceMax: number; stock: number }) => `${i.name} (${i.priceMin}-${i.priceMax}đ, ${i.stock} in stock)`).join('; ')}`,
  );
  await call('GET', `/items/${shirt.id}`, 200);
  await call('GET', '/items/mine', 200, { token: seller.accessToken });

  step("9. Buyer cannot edit the seller's catalog");
  await call('PATCH', `/items/${shirt.id}`, 404, {
    token: buyer.accessToken,
    body: { name: 'Hack' },
  });
  await call('POST', `/models/${blackL.id}/stock-adjustments`, 404, {
    token: buyer.accessToken,
    body: { delta: -1, reason: 'adjust' },
  });
  await call('POST', '/items', 403, {
    token: buyer.accessToken,
    body: {
      name: 'Không có shop',
      weight: 100,
      tierVariations: [],
      models: [{ tierIndex: [], price: 1000, stock: 1 }],
    },
  });

  step('10. A second seller opens a shop and imports its item from CSV');
  const seller2 = await call('POST', '/auth/register', 201, {
    body: { ...SELLER2, password: PASSWORD },
  });
  const shop2 = await call('POST', '/shops', 201, {
    token: seller2.accessToken,
    body: {
      name: 'Nhà Gỗ Demo',
      description: 'Đèn ngủ gỗ thủ công',
      contactName: 'Xưởng Nhà Gỗ Demo',
      phone: '0377 888 999',
      wardCode: '26740',
      street: '45 Nguyễn Huệ',
    },
  });
  await call('PATCH', `/admin/shops/${shop2.id}/status`, 200, {
    token: admin.accessToken,
    body: { status: 'active' },
  });
  const template = await call('GET', '/items/imports/template', 200, {
    token: seller2.accessToken,
  });
  console.log(
    `    template header: ${template.replace(/^\uFEFF/, '').split(/\r?\n/)[0]}`,
  );

  const csv = readFileSync(SAMPLE_CSV);
  const upload = () => {
    const form = new FormData();
    form.append(
      'file',
      new Blob([csv], { type: 'text/csv' }),
      'sample-items.csv',
    );
    return form;
  };
  const imported = await call('POST', '/items/imports', 200, {
    token: seller2.accessToken,
    form: upload(),
  });
  console.log(
    `    ${SAMPLE_CSV}: ${imported.created} created, ${imported.failed} failed`,
  );
  for (const r of imported.results) {
    console.log(
      `      rows ${r.rows.join(',').padEnd(10)} ${r.parentSku.padEnd(9)} ${r.status}`,
    );
  }

  const reimported = await call('POST', '/items/imports', 200, {
    token: seller2.accessToken,
    form: upload(),
  });
  console.log(
    `    same file again: ${reimported.created} created, ${reimported.failed} failed (${reimported.results[0].error})`,
  );

  const listing2 = await call('GET', `/shops/${shop2.id}/items`, 200);
  for (const i of listing2.items) {
    console.log(
      `      ${i.name.padEnd(22)} ${i.priceMin}-${i.priceMax}đ, ${i.stock} in stock`,
    );
  }

  step('11. Buyer fills a cart from both shops; seller then cuts a price');
  const whiteM = shirt.models.find(
    (m: { tierIndex: number[] }) => m.tierIndex.join() === '0,0',
  );
  const lamp = await call('GET', `/items/${listing2.items[0].id}`, 200);
  const cartAdd = (modelId: string, quantity: number, expected: number) =>
    call('POST', '/cart/items', expected, {
      token: buyer.accessToken,
      body: { modelId, quantity },
    });
  await cartAdd(whiteM.id, 2, 201);
  await cartAdd(whiteM.id, 1, 201);
  await cartAdd(lamp.models[0].id, 1, 201);
  await cartAdd(lamp.models[1].id, 5, 409);
  await call('POST', '/cart/items', 403, {
    token: seller.accessToken,
    body: { modelId: whiteM.id, quantity: 1 },
  });
  await call('PATCH', `/models/${whiteM.id}`, 200, {
    token: seller.accessToken,
    body: { price: 1500 },
  });
  const cart = await call('GET', '/cart', 200, { token: buyer.accessToken });
  for (const group of cart.shops) {
    console.log(`    ${group.shop.name}`);
    for (const line of group.items) {
      console.log(
        `      ${line.itemName} (${line.variation ?? '-'}) x${line.quantity}, ${line.price}đ${line.priceChange ? ` (${line.priceChange > 0 ? '+' : ''}${line.priceChange}đ since added at ${line.addedPrice}đ)` : ''}`,
      );
    }
  }

  step('12. Buyer saves two delivery addresses');
  const address = (body: object) =>
    call('POST', '/addresses', 201, { token: buyer.accessToken, body });
  const homeAddress = await address({
    recipientName: 'Nguyễn Văn Demo',
    phone: '0912 345 678',
    wardCode: '00004',
    street: '144 Xuân Thủy',
  });
  const workAddress = await address({
    recipientName: 'Nguyễn Văn Demo',
    phone: '0389123456',
    wardCode: '26740',
    street: '2 Hải Triều',
  });
  await call('DELETE', `/addresses/${homeAddress.id}`, 409, {
    token: buyer.accessToken,
  });
  await call('PUT', `/addresses/${workAddress.id}/default`, 200, {
    token: buyer.accessToken,
  });
  const book = await call('GET', '/addresses', 200, {
    token: buyer.accessToken,
  });
  for (const a of book) {
    console.log(
      `    ${a.isDefault ? '*' : ' '} ${a.recipientName}, ${a.phone}, ${a.street}, ${a.ward.name}, ${a.province.name}`,
    );
  }

  step('13. Buyer checks out the whole cart; one order per shop');
  const placed = await call('POST', '/checkout', 201, {
    token: buyer.accessToken,
    body: {
      cartItemIds: cart.shops.flatMap((g: { items: { id: string }[] }) =>
        g.items.map((l) => l.id),
      ),
      addressId: workAddress.id,
      paymentMethod: 'cod',
    },
    headers: { 'Idempotency-Key': `demo-${Date.now()}` },
  });
  for (const o of placed.orders) {
    console.log(
      `    ${o.shop.name.padEnd(14)} ${o.paymentMethod} ${o.status} items ${o.itemsTotal}đ + ship ${o.shippingFee}đ = ${o.total}đ (${o.pickupAddress.province.name} → ${o.shippingAddress.province.name})`,
    );
  }
  await call('GET', '/cart', 200, { token: buyer.accessToken });

  step(
    '14. Seller 1 arranges shipment and reports pickup and delivery, the buyer confirms; seller 2 cancels',
  );
  const order1 = placed.orders.find(
    (o: { shop: { id: string } }) => o.shop.id === shop.id,
  );
  const order2 = placed.orders.find(
    (o: { shop: { id: string } }) => o.shop.id === shop2.id,
  );
  await call('POST', `/orders/${order1.id}/ship`, 403, {
    token: buyer.accessToken,
  });
  await call('POST', `/orders/${order1.id}/ship`, 200, {
    token: seller.accessToken,
  });
  for (const status of ['picked_up', 'delivered']) {
    const updated = await call('POST', `/orders/${order1.id}/shipment`, 200, {
      token: seller.accessToken,
      body: { status },
    });
    console.log(`    shipment ${updated.shipment.status}`);
  }
  const received = await call('POST', `/orders/${order1.id}/receive`, 200, {
    token: buyer.accessToken,
  });
  console.log(
    `    ${order1.shop.name}: ${received.history.map((h: { to: string }) => h.to).join(' → ')}`,
  );
  const wallet = await call('GET', '/shops/me/wallet', 200, {
    token: seller.accessToken,
  });
  console.log(
    `    ${order1.shop.name} wallet: ${wallet.balance}đ (items ${received.itemsTotal}đ minus commission)`,
  );
  const cancelled = await call('POST', `/orders/${order2.id}/cancel`, 200, {
    token: seller2.accessToken,
  });
  console.log(
    `    ${order2.shop.name}: ${cancelled.history.map((h: { to: string }) => h.to).join(' → ')}`,
  );
  const shirtAfter = await call('GET', `/items/${shirt.id}`, 200);
  console.log(
    `    white/M stock after shipping 3: ${shirtAfter.models.find((m: { id: string }) => m.id === whiteM.id).stock}`,
  );

  step('15. Sellers add product images (uploaded straight to MinIO)');
  for (const color of [
    [233, 84, 32],
    [40, 40, 40],
    [240, 240, 235],
  ] as const) {
    await addImage(seller.accessToken, shirt.id, samplePng([...color]));
  }
  for (const color of [
    [196, 140, 72],
    [250, 214, 120],
  ] as const) {
    await addImage(seller2.accessToken, lamp.id, samplePng([...color]));
  }
  const withImages = await call('GET', `/items/${shirt.id}`, 200);
  console.log(`    cover: ${withImages.images[0].url}`);

  step(
    '16. Seller creates a shop voucher and a flash sale; admin creates platform vouchers',
  );
  const window = {
    startsAt: new Date(Date.now() - 60_000).toISOString(),
    endsAt: new Date(Date.now() + 30 * 24 * 3600_000).toISOString(),
  };
  await call('POST', '/shops/me/vouchers', 201, {
    token: seller.accessToken,
    body: {
      code: 'DEMOSHOP',
      name: 'Giảm 500đ cho đơn từ 2.000đ',
      discountKind: 'fixed',
      discountValue: 500,
      minSpend: 2000,
      usageLimit: 100,
      ...window,
    },
  });
  await call('POST', '/admin/vouchers', 201, {
    token: admin.accessToken,
    body: {
      type: 'platform_voucher',
      code: 'SALE10',
      name: 'Giảm 10% tối đa 1.000đ',
      discountKind: 'percent',
      discountValue: 10,
      maxDiscount: 1000,
      minSpend: 2000,
      usageLimit: 100,
      ...window,
    },
  });
  await call('POST', '/admin/vouchers', 201, {
    token: admin.accessToken,
    body: {
      type: 'shipping_voucher',
      code: 'FREESHIP',
      name: 'Giảm 15.000đ phí vận chuyển',
      discountKind: 'fixed',
      discountValue: 15000,
      minSpend: 0,
      usageLimit: 100,
      ...window,
    },
  });

  const whiteMNow = await call('GET', `/items/${shirt.id}`, 200);
  const flash = await call('POST', '/shops/me/flash-sales', 201, {
    token: seller.accessToken,
    body: {
      name: 'Giờ vàng áo thun',
      startsAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 2 * 3600_000).toISOString(),
      models: [
        {
          modelId: whiteM.id,
          price: 1000,
          quota: Math.min(
            5,
            whiteMNow.models.find((m: { id: string }) => m.id === whiteM.id)
              .stock,
          ),
          purchaseLimit: 2,
        },
      ],
    },
  });
  console.log(
    `    flash sale: ${flash.models[0].itemName} ${flash.models[0].originalPrice}đ → ${flash.models[0].price}đ, ${flash.models[0].quota} units`,
  );

  step('17. More orders in every state, from a second buyer too');
  const buyer2 = await call('POST', '/auth/register', 201, {
    body: { ...BUYER2, password: PASSWORD },
  });
  const buyer2Address = await call('POST', '/addresses', 201, {
    token: buyer2.accessToken,
    body: {
      recipientName: 'Trần Thị Demo',
      phone: '0987 654 321',
      wardCode: '00070',
      street: '8 Tràng Tiền',
    },
  });
  const model = (
    item: { models: { tierIndex: number[]; id: string }[] },
    tiers: string,
  ) => item.models.find((m) => m.tierIndex.join() === tiers)!.id;
  const buy = async (
    token: string,
    addressId: string,
    lines: [string, number][],
    extra: { voucherCodes?: string[]; paymentMethod?: string } = {},
  ) => {
    for (const [modelId, quantity] of lines) {
      await call('POST', '/cart/items', 201, {
        token,
        body: { modelId, quantity },
      });
    }
    const current = await call('GET', '/cart', 200, { token });
    const ids = current.shops.flatMap(
      (g: { items: { id: string; modelId: string }[] }) =>
        g.items
          .filter((l) => lines.some(([m]) => m === l.modelId))
          .map((l) => l.id),
    );
    const result = await call('POST', '/checkout', 201, {
      token,
      body: { cartItemIds: ids, addressId, paymentMethod: 'cod', ...extra },
      headers: { 'Idempotency-Key': randomUUID() },
    });
    return result.orders as {
      id: string;
      total: number;
      shop: { id: string };
    }[];
  };
  const sellerOf = (o: { shop: { id: string } }) =>
    o.shop.id === shop.id ? seller.accessToken : seller2.accessToken;
  const advance = async (
    o: { id: string; shop: { id: string } },
    to: 'shipping' | 'delivered',
  ) => {
    const token = sellerOf(o);
    await call('POST', `/orders/${o.id}/ship`, 200, { token });
    await call('POST', `/orders/${o.id}/shipment`, 200, {
      token,
      body: { status: 'picked_up' },
    });
    if (to === 'delivered') {
      await call('POST', `/orders/${o.id}/shipment`, 200, {
        token,
        body: { status: 'delivered' },
      });
    }
  };

  const discounted = await buy(
    buyer2.accessToken,
    buyer2Address.id,
    [
      [model(shirt, '0,1'), 2],
      [model(lamp, '0,0'), 1],
    ],
    { voucherCodes: ['DEMOSHOP', 'SALE10', 'FREESHIP'] },
  );
  for (const o of discounted) {
    await advance(o, 'delivered');
    await call('POST', `/orders/${o.id}/receive`, 200, {
      token: buyer2.accessToken,
    });
  }
  console.log(
    `    completed with 3 vouchers: ${discounted.map((o) => `${o.total}đ`).join(', ')}`,
  );

  const [returned] = await buy(buyer.accessToken, workAddress.id, [
    [model(lamp, '1,0'), 1],
  ]);
  await advance(returned, 'delivered');
  await call('POST', `/orders/${returned.id}/return`, 200, {
    token: buyer.accessToken,
    body: { reason: 'damaged', note: 'Chân đèn bị nứt' },
  });
  await call('POST', `/orders/${returned.id}/return/accept`, 200, {
    token: seller2.accessToken,
  });
  console.log('    returned and refund waiting for admin');

  const [shipping] = await buy(buyer.accessToken, workAddress.id, [
    [model(shirt, '1,0'), 1],
  ]);
  await advance(shipping, 'shipping');
  const [flashOrder] = await buy(buyer2.accessToken, buyer2Address.id, [
    [whiteM.id, 2],
  ]);
  console.log(`    bought 2 at the flash sale price: ${flashOrder.total}đ`);
  await buy(buyer2.accessToken, buyer2Address.id, [[model(lamp, '0,1'), 1]], {
    paymentMethod: 'online',
  });
  console.log(
    '    one shipping, one waiting to ship, one waiting for a bank transfer',
  );

  step('18. Buyers review what they received; the seller replies');
  const review = async (
    token: string,
    orderId: string,
    rating: number,
    comment: string,
  ) => {
    const detail = await call('GET', `/orders/${orderId}`, 200, { token });
    return call('POST', `/order-items/${detail.items[0].id}/review`, 201, {
      token,
      body: { rating, comment },
    });
  };
  const shirtReview = await review(
    buyer2.accessToken,
    discounted.find((o) => o.shop.id === shop.id)!.id,
    5,
    'Vải mát, đúng size',
  );
  await review(
    buyer2.accessToken,
    discounted.find((o) => o.shop.id === shop2.id)!.id,
    4,
    'Đèn xinh, giao hơi chậm',
  );
  const first = await review(buyer.accessToken, order1.id, 3, 'Tạm ổn');
  await call('PATCH', `/reviews/${first.id}`, 200, {
    token: buyer.accessToken,
    body: { rating: 4, comment: 'Giặt không phai màu' },
  });
  await call('POST', `/reviews/${shirtReview.id}/reply`, 201, {
    token: seller.accessToken,
    body: { reply: 'Cảm ơn bạn đã ủng hộ shop!' },
  });
  const rated = await call('GET', `/items/${shirt.id}`, 200);
  console.log(
    `    ${rated.name}: ${rated.rating}★ from ${rated.ratingCount} reviews`,
  );

  step('19. Seller withdraws half of the wallet');
  const balance = (
    await call('GET', '/shops/me/wallet', 200, { token: seller.accessToken })
  ).balance as number;
  if (balance > 1) {
    await call('POST', '/shops/me/payouts', 201, {
      token: seller.accessToken,
      body: {
        amount: Math.floor(balance / 2),
        bankName: 'MB Bank',
        accountNumber: '0123456789',
        accountName: 'NGUYEN VAN DEMO',
      },
    });
  }
  const after = await call('GET', '/shops/me/wallet', 200, {
    token: seller.accessToken,
  });
  console.log(`    wallet: ${balance}đ → ${after.balance}đ`);

  step('20. Buyer searches without accents');
  const found = await call('GET', '/items/search?q=ao%20thun', 200);
  console.log(
    `    "ao thun": ${found.items.map((i: { name: string; sold: number }) => `${i.name} (đã bán ${i.sold})`).join(', ')}`,
  );

  console.log(
    `\nDone. Data is kept in the dev database; open it with pnpm db:studio.`,
  );
  console.log('Notifications appear once the worker runs (pnpm dev:worker).');
  console.log(`  buyer  ${BUYER.email} / ${PASSWORD}`);
  console.log(`  seller ${SELLER.email} / ${PASSWORD}`);
  console.log(`  seller ${SELLER2.email} / ${PASSWORD} (CSV import)`);
  console.log(`  buyer  ${BUYER2.email} / ${PASSWORD}`);
  console.log(`  shop   ${API}/shops/${shop.id}`);
  console.log(`  items  ${API}/shops/${shop.id}/items`);
  console.log(`  items  ${API}/shops/${shop2.id}/items`);
}

main().catch((error: unknown) => {
  console.error(`\n${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
