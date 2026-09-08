import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const app = read('../src/App.jsx');
const store = read('../src/components/GalaxyStore.jsx');
const api = read('../src/services/api.js');
const schema = read('../supabase/schema.sql');

describe('Galaxy Store', () => {
  it('replaces En vivo and is available to members', () => {
    expect(app).toContain("['store', 'Galaxy Store', ShoppingBag]");
    expect(app).toContain("page === 'store'");
    expect(app).not.toContain("['live', 'En vivo'");
  });

  it('supports product detail, quantities, cart totals and USDT checkout', () => {
    expect(store).toContain('Agregar al carrito');
    expect(store).toContain('const total = products.reduce');
    expect(store).toContain('<Quantity');
    expect(store).toContain('manualPayment({ network, amount: total');
    expect(store).toContain('USDT');
  });

  it('lets only administrators persist products and upload safe images', () => {
    expect(store).toContain('isAdmin &&');
    expect(store).toContain('Marcar como agotado');
    expect(api).toContain("const GALAXY_STORE_BUCKET = 'galaxy-store-products'");
    expect(api).toContain("rpc('save_galaxy_store_product'");
    expect(schema).toContain('create table if not exists public.galaxy_store_products');
    expect(schema).toMatch(/function public\.save_galaxy_store_product[\s\S]*public\.require_admin\(\)/);
    expect(schema).toContain("values('galaxy-store-products','galaxy-store-products',true,8388608");
    expect(schema).toContain('galaxy_store_products_admin_insert');
  });
});
