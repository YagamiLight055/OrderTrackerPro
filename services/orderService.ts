
import { db, Order } from '../db';
import { initSupabase } from './syncService';
import { StorageMode } from '../types';

export const getOrders = async (mode: StorageMode): Promise<Order[]> => {
  if (mode === StorageMode.OFFLINE) {
    return db.orders.reverse().sortBy('createdAt');
  } else {
    const supabase = initSupabase();
    if (!supabase) throw new Error("Remote access not configured");
    
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    return (data || []).map(remote => ({
      id: remote.id,
      uuid: remote.uuid,
      orderNo: remote.order_no,
      custCode: remote.cust_code,
      customer: remote.customer,
      city: remote.city,
      zipCode: remote.zip_code,
      material: remote.material,
      qty: remote.qty,
      status: remote.status,
      note: remote.note,
      attachments: remote.attachments,
      createdAt: new Date(remote.created_at).getTime(),
      updatedAt: new Date(remote.updated_at).getTime(),
      invoiceNo: remote.invoice_no,
      invoiceDate: remote.invoice_date ? new Date(remote.invoice_date).getTime() : undefined,
      vehicleNo: remote.vehicle_no,
      transporter: remote.transporter,
      lrNo: remote.lr_no
    }));
  }
};

export const saveOrder = async (mode: StorageMode, order: Order, editId?: number | null) => {
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
      order_no: order.orderNo,
      cust_code: order.custCode,
      customer: order.customer,
      city: order.city,
      zip_code: order.zipCode,
      material: order.material,
      qty: order.qty,
      status: order.status,
      note: order.note,
      attachments: order.attachments,
      invoice_no: order.invoiceNo,
      invoice_date: order.invoiceDate ? new Date(order.invoiceDate).toISOString() : null,
      vehicle_no: order.vehicleNo,
      transporter: order.transporter,
      lr_no: order.lrNo,
      created_at: new Date(order.createdAt).toISOString(),
      updated_at: new Date().toISOString()
    };

    // Use upsert with onConflict: 'uuid' to ensure no duplicates are created
    // even if the user saves multiple times or network retries occur.
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
