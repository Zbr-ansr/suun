import { STARTER_NODES } from './config.js';

const DB_NAME = 'suun';
const STORES = ['nodes', 'items', 'captures', 'meta'];
let dbPromise = null;

export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('nodes', { keyPath: 'id' });
      const items = db.createObjectStore('items', { keyPath: 'id' });
      items.createIndex('nodeId', 'nodeId');
      db.createObjectStore('captures', { keyPath: 'id' });
      db.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onsuccess = () => {
      const db = req.result;
      // Another tab wants to delete or upgrade the database: let go so it is not blocked.
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => { dbPromise = null; reject(req.error); };
  });
  return dbPromise;
}

const wrap = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

const done = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error);
  tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
});

async function tx(stores, mode = 'readonly') {
  const db = await openDb();
  return db.transaction(stores, mode);
}

async function getAll(store) {
  const t = await tx(store);
  return wrap(t.objectStore(store).getAll());
}

async function getOne(store, id) {
  const t = await tx(store);
  return wrap(t.objectStore(store).get(id));
}

async function putOne(store, record) {
  const t = await tx(store, 'readwrite');
  t.objectStore(store).put(record);
  await done(t);
  return record;
}

export async function seedIfEmpty() {
  const t = await tx(['nodes', 'meta'], 'readwrite');
  const meta = t.objectStore('meta');
  const nodes = t.objectStore('nodes');
  const seeded = await wrap(meta.get('seeded'));
  if (!seeded) {
    const now = Date.now();
    STARTER_NODES.forEach((n, i) => {
      nodes.put({ id: crypto.randomUUID(), name: n.name, type: n.type, description: n.description,
        colour: n.colour, icon: n.icon, order: i + 1, createdAt: now + i, anchorVec: null,
        examples: [...n.examples], exampleVecs: null });
    });
    meta.put({ key: 'seeded', value: true });
  }
  await done(t);
}

export async function getNodes() {
  const nodes = await getAll('nodes');
  return nodes.sort((a, b) => a.order - b.order);
}

export async function addNode({ name, type, description, colour, icon }) {
  const t = await tx('nodes', 'readwrite');
  const store = t.objectStore('nodes');
  const all = await wrap(store.getAll());
  const order = all.reduce((m, n) => Math.max(m, n.order), 0) + 1;
  const node = { id: crypto.randomUUID(), name, type, description, colour, icon, order,
    createdAt: Date.now(), anchorVec: null, examples: [], exampleVecs: null };
  store.put(node);
  await done(t);
  return node;
}

export async function updateNode(id, patch) {
  const t = await tx('nodes', 'readwrite');
  const store = t.objectStore('nodes');
  const node = await wrap(store.get(id));
  if (!node) { t.abort(); throw new Error('Node not found: ' + id); }
  const updated = { ...node, ...patch, id };
  if ('name' in patch || 'description' in patch) updated.anchorVec = null;
  if ('examples' in patch) updated.exampleVecs = null;
  store.put(updated);
  await done(t);
  return updated;
}

export async function deleteNode(id) {
  const t = await tx(['nodes', 'items'], 'readwrite');
  t.objectStore('nodes').delete(id);
  const items = t.objectStore('items');
  const keys = await wrap(items.index('nodeId').getAllKeys(id));
  keys.forEach((k) => items.delete(k));
  await done(t);
}

export async function getItems(nodeId) {
  const t = await tx('items');
  const items = await wrap(t.objectStore('items').index('nodeId').getAll(nodeId));
  return items.sort((a, b) => a.createdAt - b.createdAt);
}

export function getAllItems() {
  return getAll('items');
}

export function addItem({ nodeId, text, captureId, confirmed = false, vec = null }) {
  return putOne('items', { id: crypto.randomUUID(), nodeId, text, done: false, confirmed, vec,
    captureId, createdAt: Date.now() });
}

export async function updateItem(id, patch) {
  const t = await tx('items', 'readwrite');
  const store = t.objectStore('items');
  const item = await wrap(store.get(id));
  if (!item) { t.abort(); throw new Error('Item not found: ' + id); }
  const updated = { ...item, ...patch, id };
  store.put(updated);
  await done(t);
  return updated;
}

export async function deleteItem(id) {
  const t = await tx('items', 'readwrite');
  t.objectStore('items').delete(id);
  await done(t);
}

export function addCapture({ text, source }) {
  return putOne('captures', { id: crypto.randomUUID(), text, source, createdAt: Date.now() });
}

export async function getCaptures() {
  const caps = await getAll('captures');
  return caps.sort((a, b) => b.createdAt - a.createdAt);
}

export async function exportAll() {
  const [nodes, items, captures] = await Promise.all([getNodes(), getAllItems(), getCaptures()]);
  return {
    app: 'suun', version: 1, exportedAt: Date.now(),
    nodes: nodes.map((n) => ({ ...n, anchorVec: null, exampleVecs: null })),
    items: items.map((i) => ({ ...i, vec: null })),
    captures
  };
}

export async function importAll(obj) {
  if (!obj || typeof obj !== 'object' || obj.app !== 'suun' || obj.version !== 1) {
    throw new Error('Not a Suun export (app or version mismatch)');
  }
  for (const k of ['nodes', 'items', 'captures']) {
    if (!Array.isArray(obj[k])) throw new Error('Invalid Suun export: missing ' + k);
  }
  const t = await tx(STORES, 'readwrite');
  STORES.forEach((s) => t.objectStore(s).clear());
  obj.nodes.forEach((n) => t.objectStore('nodes').put({ ...n, anchorVec: null,
    examples: Array.isArray(n.examples) ? n.examples : [], exampleVecs: null }));
  obj.items.forEach((i) => t.objectStore('items').put({ ...i, vec: null }));
  obj.captures.forEach((c) => t.objectStore('captures').put(c));
  t.objectStore('meta').put({ key: 'seeded', value: true });
  await done(t);
}
