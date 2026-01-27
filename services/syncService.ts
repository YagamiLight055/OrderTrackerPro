import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { db, Order } from '../db';

let supabase: SupabaseClient | null = null;

const SYNC_CONFIG_KEY = 'order_tracker_supabase_config';
const LAST_SYNC_KEY = 'order_tracker_last_sync_time';

interface SyncConfig {
  url: string;
  publishableKey: string;
}

export const getSyncConfig = (): SyncConfig | null => {
  const data = localStorage.getItem(SYNC_CONFIG_KEY);
  return data ? JSON.parse(data) : null;
};

export const saveSyncConfig = (config: SyncConfig) => {
  localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(config));
  supabase = createClient(config.url, config.publishableKey);
};

export const initSupabase = () => {
  const config = getSyncConfig();
  if (config && !supabase) {
    supabase = createClient(config.url, config.publishableKey);
  }
  return supabase;
};

/**
 * Physically removes soft-deleted records from the local IndexedDB.
 */
export const purgeLocalDeletedRecords = async () => {
  // Use numeric 1 for indexing as booleans are not standard IndexableTypes
  const deletedRecords = await db.orders.where('deleted').equals(1).toArray();
  if (deletedRecords.length === 0) return 0;
  
  const ids = deletedRecords.map(r => r.id).filter((id): id is number => id !== undefined);
  await db.orders.bulkDelete(ids);
  return ids.length;
};

/**
 * Returns count of records currently marked as deleted locally.
 */
export const getDeletedCount = async () => {
  try {
    // Use numeric 1 for the index query
    return await db.orders.where('deleted').equals(1).count();
  } catch (e) {
    console.warn("Deleted index query failed, falling back to filter", e);
    const all = await db.orders.toArray();
    return all.filter(o => o.deleted === 1).length;
  }
};

/**
 * Wipes all data from the remote Supabase 'orders' table.
 */
export const clearSupabaseData = async () => {
  const client = initSupabase();
  if (!client) throw new Error("Cloud configuration missing.");

  const { error } = await client
    .from('orders')
    .delete()
    .neq('uuid', '00000000-0000-0000-0000-000000000000'); 

  if (error) throw error;
  localStorage.removeItem(LAST_SYNC_KEY);
};

const repairLocalData = async () => {
  const legacyOrders = await db.orders.filter(o => !o.uuid || o.uuid === 'null' || o.uuid === '').toArray();
  if (legacyOrders.length > 0) {
    for (const order of legacyOrders) {
      if (order.id) {
        await db.orders.update(order.id, { 
          uuid: crypto.randomUUID(),
          updatedAt: Date.now() 
        });
      }
    }
  }
};

export const syncWithSupabase = async () => {
  const client = initSupabase();
  if (!client) throw new Error("Cloud configuration missing.");

  await repairLocalData();

  const storedLastSync = localStorage.getItem(LAST_SYNC_KEY);
  let lastSync = 0;
  if (storedLastSync) {
    const parsed = Number(storedLastSync);
    if (!isNaN(parsed)) {
      lastSync = parsed;
    }
  }
  
  const now = Date.now();

  // 1. PUSH: Local Changes -> Cloud
  const localChanges = await db.orders
    .where('updatedAt')
    .above(lastSync)
    .toArray();

  const validLocalChanges = localChanges.filter(o => !!o.uuid && o.uuid !== 'null');

  if (validLocalChanges.length > 0) {
    const pushData = validLocalChanges.map(o => ({
      uuid: o.uuid,
      customer: o.customer,
      city: o.city,
      material: o.material,
      qty: o.qty,
      status: o.status,
      note: o.note,
      attachments: o.attachments,
      deleted: o.deleted === 1, // Convert number 1 to boolean for Supabase
      created_at: new Date(o.createdAt || now).toISOString(),
      updated_at: new Date(o.updatedAt || now).toISOString()
    }));

    const { error: pushError } = await client
      .from('orders')
      .upsert(pushData, { onConflict: 'uuid' });

    if (pushError) throw new Error(`Push Error: ${pushError.message}`);
  }

  // 2. PULL: Cloud Changes -> Local
  let query = client.from('orders').select('*');
  
  if (lastSync > 0) {
    query = query.gt('updated_at', new Date(lastSync).toISOString());
  }

  const { data: remoteChanges, error: pullError } = await query;

  if (pullError) throw new Error(`Pull Error: ${pullError.message}`);

  let pullCount = 0;
  if (remoteChanges && remoteChanges.length > 0) {
    for (const remote of remoteChanges) {
      if (!remote.uuid) continue;

      const local = await db.orders.where('uuid').equals(remote.uuid).first();
      const remoteUpdatedAt = remote.updated_at ? new Date(remote.updated_at).getTime() : 0;
      
      if (!local || remoteUpdatedAt > (local.updatedAt || 0)) {
        const orderData: Order = {
          ...(local || {}),
          uuid: remote.uuid,
          customer: remote.customer,
          city: remote.city,
          material: remote.material,
          qty: remote.qty,
          status: remote.status,
          note: remote.note,
          attachments: remote.attachments,
          deleted: remote.deleted ? 1 : 0, // Convert boolean from cloud to number 0/1 for local
          createdAt: remote.created_at ? new Date(remote.created_at).getTime() : (local?.createdAt || now),
          updatedAt: remoteUpdatedAt || now
        };
        
        if (local && local.id) {
          await db.orders.update(local.id, orderData as any);
        } else {
          await db.orders.put(orderData);
        }
        pullCount++;
      }
    }
  }

  if (!isNaN(now)) {
    localStorage.setItem(LAST_SYNC_KEY, now.toString());
  }
  
  return { pushed: validLocalChanges.length, pulled: pullCount };
};