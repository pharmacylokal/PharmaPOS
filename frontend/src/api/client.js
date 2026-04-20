// Offline-first API client for PharmaPOS.\n// Supports authenticated API calls with role-based access.
// Supports queued sync for sales and inventory operations.
const DEFAULT_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3002';

const KEYS = {
  apiUrl: 'pharmapos_api_url',
  salesQueue: 'pharmapos_offline_sales_queue_v1',
  inventoryQueue: 'pharmapos_offline_inventory_queue_v1',
  productsCache: 'pharmapos_cache_products_v1',
  batchesCache: 'pharmapos_cache_batches_v1',
  categoriesCache: 'pharmapos_cache_categories_v1',
  idMap: 'pharmapos_sync_id_map_v1',
};

const syncListeners = new Set();

function normalizeBaseUrl(url) {
  return (url || '').trim().replace(/\/+$/, '');
}

function readJson(key, fallback) {
  if (typeof window === 'undefined') return fallback;
  const raw = window.localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed == null ? fallback : parsed;
  } catch (_) {
    return fallback;
  }
}

function writeJson(key, value) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function isUnexpired(dateStr) {
  return !!dateStr && dateStr >= todayIsoDate();
}

function createExternalId(prefix = 'offline') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function readProductsCache() {
  return readJson(KEYS.productsCache, []);
}

function writeProductsCache(products) {
  const sorted = [...products].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  writeJson(KEYS.productsCache, sorted);
}

function readBatchesCache() {
  return readJson(KEYS.batchesCache, {});
}

function writeBatchesCache(batchesByProduct) {
  writeJson(KEYS.batchesCache, batchesByProduct);
}

function readCategoriesCache() {
  return readJson(KEYS.categoriesCache, []);
}

function writeCategoriesCache(categories) {
  writeJson(KEYS.categoriesCache, Array.from(new Set((categories || []).filter(Boolean))));
}

function readIdMap() {
  return readJson(KEYS.idMap, { products: {}, batches: {} });
}

function writeIdMap(map) {
  writeJson(KEYS.idMap, map);
}

function getProductBatches(productId, batchesByProduct) {
  return Array.isArray(batchesByProduct[String(productId)]) ? batchesByProduct[String(productId)] : [];
}

function setProductBatches(productId, batches, batchesByProduct) {
  batchesByProduct[String(productId)] = batches;
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeBatchIdValueForSort(idValue) {
  if (typeof idValue === 'number') return idValue;
  const parsed = Number(idValue);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function computeAggregatesFromBatches(batches) {
  const valid = batches
    .filter((b) => toNumber(b.quantity, 0) > 0 && isUnexpired(b.expiry_date))
    .sort((a, b) => {
      if (a.expiry_date === b.expiry_date) {
        return normalizeBatchIdValueForSort(a.id) - normalizeBatchIdValueForSort(b.id);
      }
      return String(a.expiry_date).localeCompare(String(b.expiry_date));
    });

  const totalStock = valid.reduce((sum, b) => sum + toNumber(b.quantity, 0), 0);
  const nearestExpiry = valid.length > 0 ? valid[0].expiry_date : null;
  const prices = valid.map((b) => toNumber(b.selling_price, 0));

  return {
    total_stock: totalStock,
    nearest_expiry: nearestExpiry,
    min_price: prices.length > 0 ? Math.min(...prices) : null,
    max_price: prices.length > 0 ? Math.max(...prices) : null,
    current_price: valid.length > 0 ? toNumber(valid[0].selling_price, 0) : null,
  };
}

function recomputeProduct(products, batchesByProduct, productId) {
  const idx = products.findIndex((p) => String(p.id) === String(productId));
  if (idx < 0) return;
  const batches = getProductBatches(productId, batchesByProduct);
  products[idx] = { ...products[idx], ...computeAggregatesFromBatches(batches) };
}

function replaceProductIdEverywhere(fromId, toId) {
  const products = readProductsCache();
  const batchesByProduct = readBatchesCache();

  const nextProducts = products.map((p) => (String(p.id) === String(fromId) ? { ...p, id: toId } : p));

  const fromKey = String(fromId);
  const toKey = String(toId);
  if (batchesByProduct[fromKey]) {
    const existing = Array.isArray(batchesByProduct[toKey]) ? batchesByProduct[toKey] : [];
    batchesByProduct[toKey] = [...existing, ...batchesByProduct[fromKey]].map((b) => ({
      ...b,
      product_id: toId,
    }));
    delete batchesByProduct[fromKey];
  }

  writeProductsCache(nextProducts);
  writeBatchesCache(batchesByProduct);
}

function replaceBatchIdEverywhere(fromId, toId) {
  const batchesByProduct = readBatchesCache();
  for (const key of Object.keys(batchesByProduct)) {
    batchesByProduct[key] = getProductBatches(key, batchesByProduct).map((b) => (
      String(b.id) === String(fromId) ? { ...b, id: toId } : b
    ));
  }
  writeBatchesCache(batchesByProduct);
}

function filterProducts(products, { search, category } = {}) {
  const normalizedSearch = String(search || '').trim().toLowerCase();
  const normalizedCategory = String(category || '').trim();

  return products.filter((p) => {
    if (normalizedCategory && p.category !== normalizedCategory) return false;
    if (!normalizedSearch) return true;

    const name = String(p.name || '').toLowerCase();
    const generic = String(p.generic_name || '').toLowerCase();
    const barcode = String(p.barcode || '').toLowerCase();
    return (
      name.includes(normalizedSearch)
      || generic.includes(normalizedSearch)
      || barcode === normalizedSearch
    );
  });
}

function readSalesQueue() {
  return readJson(KEYS.salesQueue, []);
}

function writeSalesQueue(queue) {
  writeJson(KEYS.salesQueue, queue);
  emitCurrentSyncStatus({ syncing: false });
}

function readInventoryQueue() {
  return readJson(KEYS.inventoryQueue, []);
}

function writeInventoryQueue(queue) {
  writeJson(KEYS.inventoryQueue, queue);
  emitCurrentSyncStatus({ syncing: false });
}

function enqueueSalesOperation(payload) {
  const queue = readSalesQueue();
  const entry = {
    id: payload.external_id || createExternalId('sale'),
    type: 'create_sale',
    payload,
    attempts: 0,
    last_error: null,
    created_at: new Date().toISOString(),
  };
  queue.push(entry);
  writeSalesQueue(queue);
  return entry;
}

function enqueueInventoryOperation(type, payload) {
  const queue = readInventoryQueue();
  const entry = {
    id: createExternalId('inv-op'),
    type,
    payload,
    attempts: 0,
    last_error: null,
    created_at: new Date().toISOString(),
  };
  queue.push(entry);
  writeInventoryQueue(queue);
  return entry;
}

// Get stored user for auth
function getStoredAuth() {
  try {
    const stored = localStorage.getItem('pharmapos_user');
    return stored ? JSON.parse(stored) : null;
  } catch { return null; }
}

// Get auth header
function getAuthHeader() {
  const user = getStoredAuth();
  if (!user) return {};
  const credentials = btoa(`${user.username}:${user.username}`);
  return { Authorization: `Basic ${credentials}` };
}

// Get API base URL
export function getApiBaseUrl() {
  const override = typeof window !== 'undefined' ? window.localStorage.getItem(KEYS.apiUrl) : '';
  return normalizeBaseUrl(override) || DEFAULT_BASE_URL;
}

export function setApiBaseUrl(url) {
  const value = normalizeBaseUrl(url);
  if (typeof window === 'undefined') return DEFAULT_BASE_URL;
  if (value) window.localStorage.setItem(KEYS.apiUrl, value);
  else window.localStorage.removeItem(KEYS.apiUrl);
  return getApiBaseUrl();
}

export function getPendingSalesSyncCount() {
  return readSalesQueue().length;
}

export function getPendingInventorySyncCount() {
  return readInventoryQueue().length;
}

export function getPendingSyncCount() {
  return getPendingSalesSyncCount() + getPendingInventorySyncCount();
}

function emitCurrentSyncStatus(extra = {}) {
  const status = {
    syncing: false,
    pending_sales: getPendingSalesSyncCount(),
    pending_inventory: getPendingInventorySyncCount(),
    pending: getPendingSyncCount(),
    ...extra,
  };

  for (const listener of syncListeners) {
    try {
      listener(status);
    } catch (_) {
      // ignore listener errors
    }
  }
}

export function subscribeToSyncStatus(listener) {
  syncListeners.add(listener);
  emitCurrentSyncStatus();
  return () => syncListeners.delete(listener);
}

async function request(method, path, body = null) {
  const storedUser = readJson('pharmapos_user', null);
  const storedPass = readJson('pharmapos_password', null);
  const authHeaders = {};
  if (storedUser && storedPass) {
    authHeaders['Authorization'] = 'Basic ' + btoa(storedUser.username + ':' + storedPass);
  }
  const opts = { method, headers: { ...authHeaders } };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(`${getApiBaseUrl()}${path}`, opts);
  } catch (_) {
    const error = new Error('Unable to reach the API. Check your network or API URL.');
    error.code = 'NETWORK';
    throw error;
  }

  let data = null;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) data = await res.json();
  else {
    const text = await res.text();
    data = text ? { error: text } : {};
  }

  if (!res.ok) {
    const error = new Error(data.error || `Request failed: ${res.status}`);
    error.code = 'HTTP';
    error.status = res.status;
    throw error;
  }

  return data;
}

function resolveMappedId(rawId, mapBucket) {
  const str = String(rawId);
  return mapBucket[str] || rawId;
}

function applyInventoryLocalOperation(type, payload) {
  const products = readProductsCache();
  const batchesByProduct = readBatchesCache();
  const affectedProducts = new Set();

  if (type === 'create_product') {
    const localId = payload.local_id || createExternalId('product');
    const created = {
      id: localId,
      name: payload.name,
      generic_name: payload.generic_name || null,
      barcode: payload.barcode || null,
      category: payload.category || null,
      total_stock: 0,
      nearest_expiry: null,
      min_price: null,
      max_price: null,
      current_price: null,
      created_at: new Date().toISOString(),
    };
    products.push(created);
    setProductBatches(localId, getProductBatches(localId, batchesByProduct), batchesByProduct);
    writeProductsCache(products);
    writeBatchesCache(batchesByProduct);
    const categories = Array.from(new Set([...readCategoriesCache(), created.category].filter(Boolean)));
    writeCategoriesCache(categories);
    return created;
  }

  if (type === 'update_product') {
    const idx = products.findIndex((p) => String(p.id) === String(payload.id));
    if (idx >= 0) {
      products[idx] = {
        ...products[idx],
        name: payload.name,
        generic_name: payload.generic_name || null,
        barcode: payload.barcode || null,
        category: payload.category || null,
      };
      writeProductsCache(products);
      const categories = Array.from(new Set([...readCategoriesCache(), ...products.map((p) => p.category)].filter(Boolean)));
      writeCategoriesCache(categories);
      return products[idx];
    }
    return null;
  }

  if (type === 'delete_product') {
    const remaining = products.filter((p) => String(p.id) !== String(payload.id));
    delete batchesByProduct[String(payload.id)];
    writeProductsCache(remaining);
    writeBatchesCache(batchesByProduct);
    return { success: true };
  }

  if (type === 'create_batch') {
    const localId = payload.local_id || createExternalId('batch');
    const productId = payload.product_id;
    const nextBatch = {
      id: localId,
      product_id: productId,
      batch_number: payload.batch_number,
      expiry_date: payload.expiry_date,
      quantity: toNumber(payload.quantity, 0),
      cost_price: toNumber(payload.cost_price, 0),
      selling_price: toNumber(payload.selling_price, 0),
      created_at: new Date().toISOString(),
    };

    const current = getProductBatches(productId, batchesByProduct);
    setProductBatches(productId, [...current, nextBatch], batchesByProduct);
    affectedProducts.add(productId);

    for (const productIdValue of affectedProducts) {
      recomputeProduct(products, batchesByProduct, productIdValue);
    }

    writeProductsCache(products);
    writeBatchesCache(batchesByProduct);
    return nextBatch;
  }

  if (type === 'update_batch') {
    let updatedBatch = null;
    for (const key of Object.keys(batchesByProduct)) {
      const updated = getProductBatches(key, batchesByProduct).map((b) => {
        if (String(b.id) !== String(payload.id)) return b;
        updatedBatch = {
          ...b,
          batch_number: payload.batch_number,
          expiry_date: payload.expiry_date,
          quantity: toNumber(payload.quantity, 0),
          cost_price: toNumber(payload.cost_price, 0),
          selling_price: toNumber(payload.selling_price, 0),
        };
        affectedProducts.add(updatedBatch.product_id || key);
        return updatedBatch;
      });
      setProductBatches(key, updated, batchesByProduct);
    }

    for (const productIdValue of affectedProducts) {
      recomputeProduct(products, batchesByProduct, productIdValue);
    }

    writeProductsCache(products);
    writeBatchesCache(batchesByProduct);
    return updatedBatch;
  }

  if (type === 'delete_batch') {
    for (const key of Object.keys(batchesByProduct)) {
      const current = getProductBatches(key, batchesByProduct);
      const next = current.filter((b) => String(b.id) !== String(payload.id));
      if (next.length !== current.length) {
        setProductBatches(key, next, batchesByProduct);
        affectedProducts.add(key);
      }
    }

    for (const productIdValue of affectedProducts) {
      recomputeProduct(products, batchesByProduct, productIdValue);
    }

    writeProductsCache(products);
    writeBatchesCache(batchesByProduct);
    return { success: true };
  }

  return null;
}

function updateCachesFromOnlineProducts(products) {
  writeProductsCache(products);
  const categories = Array.from(new Set([...readCategoriesCache(), ...products.map((p) => p.category)].filter(Boolean)));
  writeCategoriesCache(categories);
}

function updateCachesFromOnlineBatches(productId, batches) {
  const batchesByProduct = readBatchesCache();
  setProductBatches(productId, batches, batchesByProduct);
  writeBatchesCache(batchesByProduct);

  const products = readProductsCache();
  recomputeProduct(products, batchesByProduct, productId);
  writeProductsCache(products);
}

export async function syncPendingSales({ maxItems = 25 } = {}) {
  const queue = [...readSalesQueue()];
  if (queue.length === 0) {
    emitCurrentSyncStatus({ syncing: false, synced_sales: 0, failed_sales: 0 });
    return { synced: 0, failed: 0, remaining: 0 };
  }

  let synced = 0;
  let failed = 0;
  emitCurrentSyncStatus({ syncing: true, synced_sales: 0, failed_sales: 0 });

  for (let i = 0; i < queue.length && i < maxItems; i += 1) {
    const entry = queue[i];
    try {
      await request('POST', '/sales', entry.payload);
      queue.splice(i, 1);
      i -= 1;
      synced += 1;
      emitCurrentSyncStatus({ syncing: true, synced_sales: synced, failed_sales: failed });
    } catch (error) {
      if (error.code === 'NETWORK') break;
      failed += 1;
      entry.attempts = (entry.attempts || 0) + 1;
      entry.last_error = error.message;
      emitCurrentSyncStatus({ syncing: true, synced_sales: synced, failed_sales: failed });
    }
  }

  writeSalesQueue(queue);
  emitCurrentSyncStatus({ syncing: false, synced_sales: synced, failed_sales: failed });
  return { synced, failed, remaining: queue.length };
}

export async function syncPendingInventory({ maxItems = 50 } = {}) {
  const queue = [...readInventoryQueue()];
  if (queue.length === 0) {
    emitCurrentSyncStatus({ syncing: false, synced_inventory: 0, failed_inventory: 0 });
    return { synced: 0, failed: 0, remaining: 0 };
  }

  let synced = 0;
  let failed = 0;
  const idMap = readIdMap();
  emitCurrentSyncStatus({ syncing: true, synced_inventory: 0, failed_inventory: 0 });

  for (let i = 0; i < queue.length && i < maxItems; i += 1) {
    const entry = queue[i];

    try {
      if (entry.type === 'create_product') {
        const payload = { ...entry.payload };
        delete payload.local_id;
        const created = await request('POST', '/products', payload);
        const localId = entry.payload.local_id;
        if (localId) {
          idMap.products[String(localId)] = created.id;
          replaceProductIdEverywhere(localId, created.id);
        }
        queue.splice(i, 1);
        i -= 1;
        synced += 1;
        continue;
      }

      if (entry.type === 'update_product') {
        const resolvedId = resolveMappedId(entry.payload.id, idMap.products);
        if (String(entry.payload.id).startsWith('offline-product-') && String(resolvedId) === String(entry.payload.id)) {
          break;
        }
        await request('PUT', `/products/${resolvedId}`, {
          name: entry.payload.name,
          generic_name: entry.payload.generic_name,
          barcode: entry.payload.barcode,
          category: entry.payload.category,
        });
        queue.splice(i, 1);
        i -= 1;
        synced += 1;
        continue;
      }

      if (entry.type === 'delete_product') {
        const resolvedId = resolveMappedId(entry.payload.id, idMap.products);
        if (String(entry.payload.id).startsWith('offline-product-') && String(resolvedId) === String(entry.payload.id)) {
          queue.splice(i, 1);
          i -= 1;
          synced += 1;
          continue;
        }
        await request('DELETE', `/products/${resolvedId}`);
        queue.splice(i, 1);
        i -= 1;
        synced += 1;
        continue;
      }

      if (entry.type === 'create_batch') {
        const resolvedProductId = resolveMappedId(entry.payload.product_id, idMap.products);
        if (String(entry.payload.product_id).startsWith('offline-product-') && String(resolvedProductId) === String(entry.payload.product_id)) {
          break;
        }
        const payload = {
          ...entry.payload,
          product_id: resolvedProductId,
        };
        delete payload.local_id;
        const created = await request('POST', '/batches', payload);
        const localBatchId = entry.payload.local_id;
        if (localBatchId) {
          idMap.batches[String(localBatchId)] = created.id;
          replaceBatchIdEverywhere(localBatchId, created.id);
        }
        queue.splice(i, 1);
        i -= 1;
        synced += 1;
        continue;
      }

      if (entry.type === 'update_batch') {
        const resolvedBatchId = resolveMappedId(entry.payload.id, idMap.batches);
        if (String(entry.payload.id).startsWith('offline-batch-') && String(resolvedBatchId) === String(entry.payload.id)) {
          break;
        }
        await request('PUT', `/batches/${resolvedBatchId}`, {
          batch_number: entry.payload.batch_number,
          expiry_date: entry.payload.expiry_date,
          quantity: entry.payload.quantity,
          cost_price: entry.payload.cost_price,
          selling_price: entry.payload.selling_price,
        });
        queue.splice(i, 1);
        i -= 1;
        synced += 1;
        continue;
      }

      if (entry.type === 'delete_batch') {
        const resolvedBatchId = resolveMappedId(entry.payload.id, idMap.batches);
        if (String(entry.payload.id).startsWith('offline-batch-') && String(resolvedBatchId) === String(entry.payload.id)) {
          queue.splice(i, 1);
          i -= 1;
          synced += 1;
          continue;
        }
        await request('DELETE', `/batches/${resolvedBatchId}`);
        queue.splice(i, 1);
        i -= 1;
        synced += 1;
        continue;
      }

      queue.splice(i, 1);
      i -= 1;
    } catch (error) {
      if (error.code === 'NETWORK') break;
      failed += 1;
      entry.attempts = (entry.attempts || 0) + 1;
      entry.last_error = error.message;
    }

    emitCurrentSyncStatus({ syncing: true, synced_inventory: synced, failed_inventory: failed });
  }

  writeIdMap(idMap);
  writeInventoryQueue(queue);
  emitCurrentSyncStatus({ syncing: false, synced_inventory: synced, failed_inventory: failed });
  return { synced, failed, remaining: queue.length };
}

export async function syncPendingChanges() {
  const sales = await syncPendingSales();
  const inventory = await syncPendingInventory();
  const syncedTotal = sales.synced + inventory.synced;
  const failedTotal = sales.failed + inventory.failed;
  emitCurrentSyncStatus({
    syncing: false,
    synced_total: syncedTotal,
    failed_total: failedTotal,
    synced_sales: sales.synced,
    synced_inventory: inventory.synced,
    failed_sales: sales.failed,
    failed_inventory: inventory.failed,
  });
  return {
    synced: syncedTotal,
    failed: failedTotal,
    remaining: sales.remaining + inventory.remaining,
  };
}

export const api = {
  // Products
  getProducts: async (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    try {
      const data = await request('GET', `/products${qs ? `?${qs}` : ''}`);
      updateCachesFromOnlineProducts(data);
      return data;
    } catch (error) {
      if (error.code !== 'NETWORK') throw error;
      return filterProducts(readProductsCache(), params);
    }
  },

  getProduct: async (id) => {
    try {
      return await request('GET', `/products/${id}`);
    } catch (error) {
      if (error.code !== 'NETWORK') throw error;
      const product = readProductsCache().find((p) => String(p.id) === String(id));
      if (!product) throw new Error('Product not found');
      const batches = getProductBatches(id, readBatchesCache());
      return { ...product, batches };
    }
  },

  createProduct: async (data) => {
    try {
      const created = await request('POST', '/products', data);
      updateCachesFromOnlineProducts(await api.getProducts());
      return created;
    } catch (error) {
      if (error.code !== 'NETWORK') throw error;
      const localPayload = { ...data, local_id: createExternalId('offline-product') };
      const created = applyInventoryLocalOperation('create_product', localPayload);
      enqueueInventoryOperation('create_product', localPayload);
      return { ...created, queued_offline: true };
    }
  },

  updateProduct: async (id, data) => {
    try {
      const updated = await request('PUT', `/products/${id}`, data);
      updateCachesFromOnlineProducts(await api.getProducts());
      return updated;
    } catch (error) {
      if (error.code !== 'NETWORK') throw error;
      const payload = { id, ...data };
      const updated = applyInventoryLocalOperation('update_product', payload);
      enqueueInventoryOperation('update_product', payload);
      return { ...updated, queued_offline: true };
    }
  },

  deleteProduct: async (id) => {
    try {
      const result = await request('DELETE', `/products/${id}`);
      applyInventoryLocalOperation('delete_product', { id });
      return result;
    } catch (error) {
      if (error.code !== 'NETWORK') throw error;
      applyInventoryLocalOperation('delete_product', { id });
      enqueueInventoryOperation('delete_product', { id });
      return { success: true, queued_offline: true };
    }
  },

  getCategories: async () => {
    try {
      const categories = await request('GET', '/products/categories/list');
      writeCategoriesCache(Array.from(new Set([...readCategoriesCache(), ...categories])));
      return categories;
    } catch (error) {
      if (error.code !== 'NETWORK') throw error;
      return readCategoriesCache();
    }
  },

  // Batches
  getBatches: async (productId) => {
    try {
      const data = await request('GET', `/batches/${productId}`);
      updateCachesFromOnlineBatches(productId, data);
      return data;
    } catch (error) {
      if (error.code !== 'NETWORK') throw error;
      return getProductBatches(productId, readBatchesCache());
    }
  },

  createBatch: async (data) => {
    try {
      const created = await request('POST', '/batches', data);
      const list = await api.getBatches(data.product_id);
      updateCachesFromOnlineBatches(data.product_id, list);
      return created;
    } catch (error) {
      if (error.code !== 'NETWORK') throw error;
      const localPayload = { ...data, local_id: createExternalId('offline-batch') };
      const created = applyInventoryLocalOperation('create_batch', localPayload);
      enqueueInventoryOperation('create_batch', localPayload);
      return { ...created, queued_offline: true };
    }
  },

  updateBatch: async (id, data) => {
    try {
      const updated = await request('PUT', `/batches/${id}`, data);
      return updated;
    } catch (error) {
      if (error.code !== 'NETWORK') throw error;
      const payload = { id, ...data };
      const updated = applyInventoryLocalOperation('update_batch', payload);
      enqueueInventoryOperation('update_batch', payload);
      return { ...updated, queued_offline: true };
    }
  },

  deleteBatch: async (id) => {
    try {
      const result = await request('DELETE', `/batches/${id}`);
      applyInventoryLocalOperation('delete_batch', { id });
      return result;
    } catch (error) {
      if (error.code !== 'NETWORK') throw error;
      applyInventoryLocalOperation('delete_batch', { id });
      enqueueInventoryOperation('delete_batch', { id });
      return { success: true, queued_offline: true };
    }
  },

  // Sales
  createSale: async (data) => {
    const payload = { ...data, external_id: data.external_id || createExternalId('sale') };
    try {
      return await request('POST', '/sales', payload);
    } catch (error) {
      if (error.code !== 'NETWORK') throw error;
      const queued = enqueueSalesOperation(payload);
      return {
        queued_offline: true,
        pending_sync_count: getPendingSyncCount(),
        sale: {
          id: `OFFLINE-${String(queued.id).slice(0, 8)}`,
          date: new Date().toISOString(),
          external_id: payload.external_id,
          discount_type: payload.discount_type || null,
        },
        items: [],
        change: 0,
      };
    }
  },

  getSales: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request('GET', `/sales${qs ? `?${qs}` : ''}`);
  },

  getSale: (id) => request('GET', `/sales/${id}`),
  // Auth helpers\n  login: async (username, password) => request(\x27POST\x27, \x27/auth/login\x27, { username, password }),\n  register: async (data) => request(\x27POST\x27, \x27/auth/register\x27, data),\n  getCurrentUser: () => request(\x27GET\x27, \x27/auth/me\x27),\n  getHealth: () => request('GET', '/health'),

  // Reports
  getDailyReport: (date) => request('GET', `/reports/daily${date ? `?date=${date}` : ''}`),
  getInventoryReport: () => request('GET', '/reports/inventory'),
  getExpiringReport: (days = 30) => request('GET', `/reports/expiring?days=${days}`),

  // CSV exports (download link)
  getCsvUrl: (type, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return `${getApiBaseUrl()}/reports/${type}/csv${qs ? `?${qs}` : ''}`;
  },
  downloadCsv: async (type, params = {}, filename) => {
    const storedUser = readJson('pharmapos_user', null);
    const storedPass = readJson('pharmapos_password', null);
    const authHeaders = {};
    if (storedUser && storedPass) {
      authHeaders['Authorization'] = 'Basic ' + btoa(storedUser.username + ':' + storedPass);
    }
    const qs = new URLSearchParams(params).toString();
    const url = `${getApiBaseUrl()}/reports/${type}/csv${qs ? `?${qs}` : ''}`;
    const response = await fetch(url, { headers: authHeaders });
    if (!response.ok) throw new Error('Download failed');
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename || `export_${type}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(blobUrl);
  },
};
