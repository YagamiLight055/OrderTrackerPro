
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { db, Order, Shipment } from '../db';

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

export const clearSupabaseData = async () => {
  const client = initSupabase();
  if (!client) throw new Error("Supabase not configured.");

  // Clear both tables
  const { error: err1 } = await client.from('orders').delete().neq('uuid', '00000000-0000-0000-0000-000000000000'); 
  const { error: err2 } = await client.from('shipments').delete().neq('uuid', '00000000-0000-0000-0000-000000000000'); 

  if (err1) throw err1;
  if (err2) throw err2;
  
  localStorage.removeItem(LAST_SYNC_KEY);
};

export const syncWithSupabase = async () => {
  const client = initSupabase();
  if (!client) throw new Error("Cloud Datastore not configured.");

  const storedLastSync = localStorage.getItem(LAST_SYNC_KEY);
  let lastSync = 0;
  if (storedLastSync) {
    const parsed = Number(storedLastSync);
    if (!isNaN(parsed)) lastSync = parsed;
  }
  
  const now = Date.now();

  // --- ORDERS SYNC ---
  const localOrderChanges = await db.orders.where('updatedAt').above(lastSync).toArray();
  if (localOrderChanges.length > 0) {
    await client.from('orders').upsert(localOrderChanges.map(o => ({
      uuid: o.uuid,
      customer: o.customer,
      city: o.city,
      material: o.material,
      qty: o.qty,
      status: o.status,
      note: o.note,
      attachments: o.attachments,
      created_at: new Date(o.createdAt).toISOString(),
      updated_at: new Date(o.updatedAt).toISOString()
    })), { onConflict: 'uuid' });
  }

  // --- SHIPMENTS SYNC ---
  const localShipmentChanges = await db.shipments.where('updatedAt').above(lastSync).toArray();
  if (localShipmentChanges.length > 0) {
    await client.from('shipments').upsert(localShipmentChanges.map(s => ({
      uuid: s.uuid,
      reference: s.reference,
      order_uuids: s.orderUuids,
      attachments: s.attachments,
      dispatch_date: new Date(s.dispatchDate).toISOString(),
      note: s.note,
      created_at: new Date(s.createdAt).toISOString(),
      updated_at: new Date(s.updatedAt).toISOString()
    })), { onConflict: 'uuid' });
  }

  // --- PULL REMOTE ---
  const { data: remoteOrders } = await client.from('orders').select('*').gt('updated_at', new Date(lastSync).toISOString());
  if (remoteOrders) {
    for (const r of remoteOrders) {
      const local = await db.orders.where('uuid').equals(r.uuid).first();
      const updated = {
        uuid: r.uuid, customer: r.customer, city: r.city, material: r.material, qty: r.qty,
        status: r.status, note: r.note, attachments: r.attachments,
        createdAt: new Date(r.created_at).getTime(), updatedAt: new Date(r.updated_at).getTime()
      };
      if (local) await db.orders.update(local.id!, updated);
      else await db.orders.add(updated);
    }
  }

  const { data: remoteShipments } = await client.from('shipments').select('*').gt('updated_at', new Date(lastSync).toISOString());
  if (remoteShipments) {
    for (const r of remoteShipments) {
      const local = await db.shipments.where('uuid').equals(r.uuid).first();
      const updated = {
        uuid: r.uuid, reference: r.reference, orderUuids: r.order_uuids, attachments: r.attachments,
        dispatchDate: new Date(r.dispatch_date).getTime(), note: r.note,
        createdAt: new Date(r.created_at).getTime(), updatedAt: new Date(r.updated_at).getTime()
      };
      if (local) await db.shipments.update(local.id!, updated);
      else await db.shipments.add(updated);
    }
  }

  localStorage.setItem(LAST_SYNC_KEY, now.toString());
  return { pushed: localOrderChanges.length + localShipmentChanges.length, pulled: (remoteOrders?.length || 0) + (remoteShipments?.length || 0) };
};
