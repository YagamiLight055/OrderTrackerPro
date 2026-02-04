
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { db, Order, Shipment } from '../db';

let supabase: SupabaseClient | null = null;

const SYNC_CONFIG_KEY = 'order_tracker_supabase_config';

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

  const { error: err1 } = await client.from('orders').delete().neq('uuid', '00000000-0000-0000-0000-000000000000'); 
  const { error: err2 } = await client.from('shipments').delete().neq('uuid', '00000000-0000-0000-0000-000000000000'); 

  if (err1) throw err1;
  if (err2) throw err2;
};

/**
 * Normalizes Order CSV data to Supabase schema with LWW conflict resolution.
 */
export const importCsvToSupabase = async (data: any[]) => {
  const client = initSupabase();
  if (!client) throw new Error("Cloud Datastore not configured.");

  const nowIso = new Date().toISOString();

  const payload = data.map(o => {
    const parseToIsoDate = (val: any) => {
      if (!val) return null;
      const d = new Date(isNaN(val) ? val : Number(val));
      return d.getTime() ? d.toISOString().split('T')[0] : null;
    };
    const parseToIsoTimestamp = (val: any) => {
      if (!val) return null;
      const d = new Date(isNaN(val) ? val : Number(val));
      return d.getTime() ? d.toISOString() : null;
    };

    let finalAttachments = [];
    if (o.attachments) {
      if (Array.isArray(o.attachments)) {
        finalAttachments = o.attachments;
      } else if (typeof o.attachments === 'string') {
        try {
          const parsed = JSON.parse(o.attachments);
          if (Array.isArray(parsed)) finalAttachments = parsed;
        } catch (e) {
          finalAttachments = [o.attachments];
        }
      }
    }

    return {
      uuid: o.uuid || crypto.randomUUID(),
      order_no: String(o.orderNo || o.order_no || '').trim(),
      order_date: parseToIsoDate(o.orderDate || o.order_date || o.createdAt || o.created_at) || nowIso.split('T')[0],
      cust_code: String(o.custCode || o.cust_code || '').trim(),
      customer: String(o.customer || 'Unknown').trim(),
      city: String(o.city || 'Unknown').trim(),
      zip_code: String(o.zipCode || o.zip_code || '').trim(),
      material: String(o.material || 'N/A').trim(),
      qty: Number(o.qty || 0),
      status: o.status || 'Pending',
      note: o.note || '',
      attachments: finalAttachments,
      invoice_no: o.invoiceNo || o.invoice_no || '',
      invoice_date: parseToIsoDate(o.invoiceDate || o.invoice_date),
      vehicle_no: o.vehicleNo || o.vehicle_no || '',
      transporter: o.transporter || '',
      lr_no: o.lrNo || o.lr_no || '',
      created_at: parseToIsoTimestamp(o.createdAt || o.created_at) || nowIso,
      updated_at: nowIso
    };
  });

  const { error } = await client.from('orders').upsert(payload, { onConflict: 'uuid' });
  if (error) throw new Error(error.message);
  return payload.length;
};

/**
 * importShipmentsCsvToSupabase handles the shipment table synchronization.
 */
export const importShipmentsCsvToSupabase = async (data: any[]) => {
  const client = initSupabase();
  if (!client) throw new Error("Cloud Datastore not configured.");

  const nowIso = new Date().toISOString();

  const payload = data.map(s => {
    const parseToIso = (val: any) => {
      if (!val) return null;
      const d = new Date(isNaN(val) ? val : Number(val));
      return d.getTime() ? d.toISOString() : null;
    };

    // Normalize order_uuids array
    let orderUuids = [];
    const rawUuids = s.orderUuids || s.order_uuids;
    if (Array.isArray(rawUuids)) {
      orderUuids = rawUuids;
    } else if (typeof rawUuids === 'string') {
      try {
        const parsed = JSON.parse(rawUuids);
        if (Array.isArray(parsed)) orderUuids = parsed;
      } catch {
        orderUuids = rawUuids.split(';').map(u => u.trim()).filter(Boolean);
      }
    }

    // Normalize attachments array
    let attachments = [];
    const rawAttachments = s.attachments;
    if (Array.isArray(rawAttachments)) {
      attachments = rawAttachments;
    } else if (typeof rawAttachments === 'string') {
      try {
        const parsed = JSON.parse(rawAttachments);
        if (Array.isArray(parsed)) attachments = parsed;
      } catch {
        attachments = [rawAttachments];
      }
    }

    return {
      uuid: s.uuid || crypto.randomUUID(),
      reference: String(s.reference || '').trim(),
      order_uuids: orderUuids,
      attachments: attachments,
      dispatch_date: parseToIso(s.dispatchDate || s.dispatch_date) || nowIso,
      note: s.note || '',
      created_at: parseToIso(s.createdAt || s.created_at) || nowIso,
      updated_at: nowIso
    };
  });

  const { error } = await client.from('shipments').upsert(payload, { onConflict: 'uuid' });
  if (error) throw new Error(error.message);
  return payload.length;
};
