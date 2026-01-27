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
 * Ensures all local orders have a UUID. 
 * Fixes legacy data that might have been created before UUID was mandatory.
 */
const repairLocalData = async () => {
  const legacyOrders = await db.orders.filter(o => !o.uuid).toArray();
  if (legacyOrders.length > 0) {
    console.warn(`Repairing ${legacyOrders.length} orders missing UUIDs...`);
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
  if (!client) throw new Error("Cloud configuration missing");

  // 0. REPAIR: Fix missing UUIDs locally before pushing
  await repairLocalData();

  const lastSync = Number(localStorage.getItem(LAST_SYNC_KEY) || 0);
  const now = Date.now();

  // 1. PUSH: Local Changes -> Supabase
  const localChanges = await db.orders
    .filter(order => (order.updatedAt || 0) > lastSync)
    .toArray();

  // Robustness check: Ensure we only push items with valid UUIDs
  const validLocalChanges = localChanges.filter(o => !!o.uuid);

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
      created_at: new Date(o.createdAt || now).toISOString(),
      updated_at: new Date(o.updatedAt || now).toISOString()
    }));

    const { error: pushError } = await client
      .from('orders')
      .upsert(pushData, { onConflict: 'uuid' });

    if (pushError) throw pushError;
  }

  // 2. PULL: Supabase Changes -> Local
  const { data: remoteChanges, error: pullError } = await client
    .from('orders')
    .select('*')
    .gt('updated_at', new Date(lastSync).toISOString());

  if (pullError) throw pullError;

  if (remoteChanges && remoteChanges.length > 0) {
    for (const remote of remoteChanges) {
      if (!remote.uuid) continue; // Skip malformed remote data

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
      }
    }
  }

  localStorage.setItem(LAST_SYNC_KEY, now.toString());
  return { pushed: validLocalChanges.length, pulled: remoteChanges?.length || 0 };
};