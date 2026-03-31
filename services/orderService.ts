
import { db, Order } from '../db';
import { initSupabase } from './syncService';
import { StorageMode } from '../types';

export const getOrders = async (mode: StorageMode): Promise<Order[]> => {
  if (mode === StorageMode.OFFLINE) {
    const all = await db.orders.toArray();
    return all.sort((a, b) => (b["SO DATE"] || 0) - (a["SO DATE"] || 0));
  } else {
    const supabase = initSupabase();
    if (!supabase) throw new Error("Remote access not configured");
    
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('so_date', { ascending: false });
    
    if (error) throw error;
    
    return (data || []).map(remote => {
      const parseDate = (d: string | null) => d ? new Date(d.includes('T') ? d : `${d}T12:00:00`).getTime() : undefined;
      
      return {
        id: remote.id,
        uuid: remote.uuid,
        "Plant": remote.plant,
        "Invoice Number": remote.invoice_number,
        "INV DATE": parseDate(remote.inv_date),
        reasonForRejection: remote.reason_for_rejection,
        "SALES ORDER": remote.sales_order,
        "SO DATE": parseDate(remote.so_date) || Date.now(),
        "CUSTOMER": remote.customer,
        customerName: remote.customer_name,
        customerCity: remote.customer_city,
        "MATERIAL": remote.material,
        "Material Description": remote.material_description,
        "ITEM QTY": remote.item_qty,
        "DELIVERY": remote.delivery,
        "DEL DATE": parseDate(remote.del_date),
        "DEL QTY": remote.del_qty,
        "IND. SHIP. NUMBER": remote.ind_ship_number,
        "COL SHP NO": remote.col_shp_no,
        "Ship To Party": remote.ship_to_party,
        "Ship to Party Name": remote.ship_to_party_name,
        "Ship to Party Destination": remote.ship_to_party_destination,
        "Payer": remote.payer,
        "Value of Part ordered": remote.value_part_ordered,
        "Order type": remote.order_type,
        "GC L/R No": remote.gc_lr_no,
        "LR Date": parseDate(remote.lr_date),
        "Road Permit": remote.road_permit,
        "Truck No": remote.truck_no,
        status: remote.status,
        note: remote.note,
        attachments: remote.attachments,
        createdAt: new Date(remote.created_at).getTime(),
        updatedAt: new Date(remote.updated_at).getTime(),
      };
    });
  }
};

export const saveOrder = async (mode: StorageMode, order: Order, editId?: number | null) => {
  const formatDate = (ts: number | undefined) => ts ? new Date(ts).toISOString().split('T')[0] : null;

  if (mode === StorageMode.OFFLINE) {
    if (editId) {
      return await db.orders.update(editId, order as any);
    } else {
      return await db.orders.add(order);
    }
  } else {
    const supabase = initSupabase();
    if (!supabase) throw new Error("Remote access not configured");

    const payload = {
      uuid: order.uuid,
      plant: order["Plant"],
      invoice_number: order["Invoice Number"],
      inv_date: formatDate(order["INV DATE"]),
      reason_for_rejection: order.reasonForRejection,
      sales_order: order["SALES ORDER"],
      so_date: formatDate(order["SO DATE"]),
      customer: order["CUSTOMER"],
      customer_name: order.customerName,
      customer_city: order.customerCity,
      material: order["MATERIAL"],
      material_description: order["Material Description"],
      item_qty: order["ITEM QTY"],
      delivery: order["DELIVERY"],
      del_date: formatDate(order["DEL DATE"]),
      del_qty: order["DEL QTY"],
      ind_ship_number: order["IND. SHIP. NUMBER"],
      col_shp_no: order["COL SHP NO"],
      ship_to_party: order["Ship To Party"],
      ship_to_party_name: order["Ship to Party Name"],
      ship_to_party_destination: order["Ship to Party Destination"],
      payer: order["Payer"],
      value_part_ordered: order["Value of Part ordered"],
      order_type: order["Order type"],
      gc_lr_no: order["GC L/R No"],
      lr_date: formatDate(order["LR Date"]),
      road_permit: order["Road Permit"],
      truck_no: order["Truck No"],
      status: order.status,
      note: order.note,
      attachments: order.attachments,
      created_at: new Date(order.createdAt).toISOString(),
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from('orders')
      .upsert(payload, { onConflict: 'uuid' });

    if (error) throw error;
  }
};

export const deleteOrder = async (mode: StorageMode, id: number, uuid: string) => {
  if (mode === StorageMode.OFFLINE) {
    return await db.orders.delete(id);
  } else {
    const supabase = initSupabase();
    if (!supabase) throw new Error("Remote access not configured");
    const { error } = await supabase
      .from('orders')
      .delete()
      .eq('uuid', uuid);
    if (error) throw error;
  }
};
