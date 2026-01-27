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

export const syncWithSupabase = async () => {
  const client = initSupabase();
  if (!client) throw new Error("Cloud configuration missing");

  const lastSync = Number(localStorage.getItem(LAST_SYNC_KEY) || 0);
  const now = Date.now();

  // 1. PUSH: Local Changes -> Supabase
  const localChanges = await db.orders
    .filter(order => (order.updatedAt || 0) > lastSync)
    .toArray();

  if (localChanges.length > 0) {
    // Map local structure to Supabase structure (Postgres)
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
      const local = await db.orders.where('uuid').equals(remote.uuid).first();
      
      const remoteUpdatedAt = remote.updated_at ? new Date(remote.updated_at).getTime() : 0;
      
      // Merge if remote is newer or doesn't exist locally
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
          // Fix: Use 'as any' to avoid Dexie UpdateSpec type conflicts with full Order objects containing arrays.
          await db.orders.update(local.id, orderData as any);
        } else {
          await db.orders.put(orderData);
        }
      }
    }
  }

  localStorage.setItem(LAST_SYNC_KEY, now.toString());
  return { pushed: localChanges.length, pulled: remoteChanges?.length || 0 };
};