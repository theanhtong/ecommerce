// After the load test: the quota, the orders and the stock must all agree.
import { readFileSync } from 'node:fs';
import pg from 'pg';

process.loadEnvFile('../../.env');
const { modelId, quota } = JSON.parse(
  readFileSync('load/out/model.json', 'utf8'),
) as { modelId: string; quota: number };

const db = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
await db.connect();
const { rows } = await db.query<{
  sold: number;
  flash_units: number;
  regular_units: number;
  reserved: number;
  buyers_over_limit: number;
}>(
  `SELECT
     (SELECT sold FROM flash_sale_models WHERE model_id = $1) AS sold,
     (SELECT coalesce(sum(quantity), 0)::int FROM order_items
       WHERE model_id = $1 AND flash_sale_model_id IS NOT NULL) AS flash_units,
     (SELECT coalesce(sum(quantity), 0)::int FROM order_items
       WHERE model_id = $1 AND flash_sale_model_id IS NULL) AS regular_units,
     (SELECT reserved FROM inventory WHERE model_id = $1) AS reserved,
     (SELECT count(*)::int FROM (
        SELECT o.buyer_id FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE oi.model_id = $1 AND oi.flash_sale_model_id IS NOT NULL
        GROUP BY o.buyer_id HAVING sum(oi.quantity) > 1) x) AS buyers_over_limit`,
  [modelId],
);
await db.end();

const r = rows[0];
const results = {
  quota,
  sold: r.sold,
  'units at flash price': r.flash_units,
  'units at regular price': r.regular_units,
  'stock reserved': r.reserved,
  'buyers over the limit': r.buyers_over_limit,
};
console.table(results);
const ok =
  r.sold === quota &&
  r.flash_units === quota &&
  r.regular_units === 0 &&
  r.reserved === r.flash_units &&
  r.buyers_over_limit === 0;
console.log(ok ? 'PASS: no overselling' : 'FAIL');
process.exit(ok ? 0 : 1);
