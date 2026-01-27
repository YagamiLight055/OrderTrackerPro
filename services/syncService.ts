
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
    try {
      supabase = createClient(config.url, config.publishableKey);
    } catch (e) {
      console.error("Supabase Init Failed", e);
      return null;
    }
  }
  return supabase;
};

/**
 * Wipes all data from the remote Supabase 'orders' table.
 */
export const clearSupabaseData = async () => {
  const client = initSupabase();
  if (!client) throw new Error("Supabase is not configured. Go to the Cloud tab.");

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

/**
 * Sync Local Standalone Database with Remote Supabase (Manual Bridge)
 */
export const syncWithSupabase = async () => {
  const client = initSupabase();
  if (!client) throw new Error("Cloud Datastore not configured.");

  await repairLocalData();

  const storedLastSync = localStorage.getItem(LAST_SYNC_KEY);
  let lastSync = 0;
  if (storedLastSync) {
    const parsed = Number(storedLastSync);
    if (!isNaN(parsed)) lastSync = parsed;
  }
  
  const now = Date.now();

  // 1. PUSH: Local Changes -> Cloud
  const localChanges = await db.orders
    .where('updatedAt')
    .above(lastSync)
    .toArray();

  if (localChanges.length > 0) {
    const pushData = localChanges.map(o => ({
      uuid: o.uuid,
      customer: o.customer,
      city: o.city,
      material: o.material,
      qty: o.qty,
      status: o.status,
      note: o.note,
      attachments: o.attachments,
      created_at: new Date(o.createdAt || now).toISOString(),
      updated_at: new Date(o.updatedAt || now).toISOString()
    }));

    const { error: pushError } = await client
      .from('orders')
      .upsert(pushData, { onConflict: 'uuid' });

    if (pushError) throw new Error(`Push Operation Failed: ${pushError.message}`);
  }

  // 2. PULL: Cloud Changes -> Local
  let query = client.from('orders').select('*');
  if (lastSync > 0) {
    query = query.gt('updated_at', new Date(lastSync).toISOString());
  }

  const { data: remoteChanges, error: pullError } = await query;
  if (pullError) throw new Error(`Pull Operation Failed: ${pullError.message}`);

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

  localStorage.setItem(LAST_SYNC_KEY, now.toString());
  return { pushed: localChanges.length, pulled: pullCount };
};
