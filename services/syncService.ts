
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { db, Order } from '../db';

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

  const { error } = await client.from('orders').delete().neq('uuid', '00000000-0000-0000-0000-000000000000'); 

  if (error) throw error;
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
      let d: Date;
      if (typeof val === 'string' && val.includes('.')) {
        const parts = val.split('.');
        if (parts.length === 3) d = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]), 12, 0, 0);
        else d = new Date(val);
      } else {
        d = new Date(isNaN(val) ? val : Number(val));
      }
      if (!d.getTime()) return null;
      return d.toISOString().split('T')[0];
    };
    
    const parseToIsoTimestamp = (val: any) => {
      if (!val) return null;
      let d: Date;
      if (typeof val === 'string' && val.includes('.')) {
        const parts = val.split('.');
        if (parts.length === 3) d = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]), 12, 0, 0);
        else d = new Date(val);
      } else {
        d = new Date(isNaN(val) ? val : Number(val));
      }
      return d.getTime() ? d.toISOString() : null;
    };

    return {
      uuid: o.uuid || crypto.randomUUID(),
      plant: String(o.Plant || o.plant || '').trim(),
      invoice_number: String(o['Invoice Number'] || o.invoiceNumber || o.invoice_number || '').trim(),
      inv_date: parseToIsoDate(o['INV DATE'] || o.invDate || o.inv_date),
      reason_for_rejection: String(o['Reason for rejection'] || o.reasonForRejection || o.reason_for_rejection || '').trim(),
      sales_order: String(o['SALES ORDER'] || o.salesOrder || o.sales_order || o.orderNo || '').trim(),
      so_date: parseToIsoDate(o['SO DATE'] || o.soDate || o.so_date || o.orderDate),
      customer: String(o.CUSTOMER || o.customer || '').trim(),
      customer_name: String(o['Customer Name'] || o.customerName || o.customer_name || '').trim(),
      customer_city: String(o['Customer City'] || o.customerCity || o.customer_city || '').trim(),
      material: String(o.MATERIAL || o.material || '').trim(),
      material_description: String(o['Material Description'] || o.materialDescription || o.material_description || '').trim(),
      item_qty: Number(o['ITEM QTY'] || o.itemQty || o.item_qty || o.qty || 0),
      delivery: String(o.DELIVERY || o.delivery || '').trim(),
      del_date: parseToIsoDate(o['DEL DATE'] || o.delDate || o.del_date),
      del_qty: Number(o['DEL QTY'] || o.delQty || o.del_qty || 0),
      ind_ship_number: String(o['IND. SHIP. NUMBER'] || o.indShipNumber || o.ind_ship_number || '').trim(),
      col_shp_no: String(o['COL SHP NO'] || o.colShpNo || o.col_shp_no || '').trim(),
      ship_to_party: String(o['Ship To Party'] || o.shipToParty || o.ship_to_party || '').trim(),
      ship_to_party_name: String(o['Ship to Party Name'] || o.shipToPartyName || o.ship_to_party_name || '').trim(),
      ship_to_party_destination: String(o['Ship to Party Destination'] || o.shipToPartyDestination || o.ship_to_party_destination || '').trim(),
      payer: String(o.Payer || o.payer || '').trim(),
      value_part_ordered: Number(o['Value of Part ordered'] || o.valuePartOrdered || o.value_part_ordered || 0),
      order_type: String(o['Order type'] || o.orderType || o.order_type || '').trim(),
      gc_lr_no: String(o['GC L/R No'] || o.gcLrNo || o.gc_lr_no || o.lrNo || '').trim(),
      lr_date: parseToIsoDate(o['LR Date'] || o.lrDate || o.lr_date),
      road_permit: String(o['Road Permit'] || o.roadPermit || o.road_permit || '').trim(),
      truck_no: String(o['Truck No'] || o.truckNo || o.truck_no || o.vehicleNo || '').trim(),
      status: o.status || 'Pending',
      note: o.note || '',
      attachments: (() => {
        if (Array.isArray(o.attachments)) return o.attachments;
        if (typeof o.attachments === 'string' && o.attachments.startsWith('[')) {
          try { return JSON.parse(o.attachments); } catch { return []; }
        }
        return [];
      })(),
      created_at: parseToIsoTimestamp(o.createdAt || o.created_at) || nowIso,
      updated_at: nowIso
    };
  });

  const { error } = await client.from('orders').upsert(payload, { onConflict: 'uuid' });
  if (error) throw new Error(error.message);
  return payload.length;
};
