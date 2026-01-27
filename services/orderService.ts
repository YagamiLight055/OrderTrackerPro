
import { db, Order } from '../db';
import { initSupabase } from './syncService';
import { StorageMode } from '../types';

export const getOrders = async (mode: StorageMode): Promise<Order[]> => {
  if (mode === StorageMode.OFFLINE) {
    // STANDALONE OFFLINE: Read exclusively from Dexie
    return db.orders.reverse().sortBy('createdAt');
  } else {
    // REALTIME ONLINE: Read exclusively from Supabase
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
      customer: remote.customer,
      city: remote.city,
      material: remote.material,
      qty: remote.qty,
      status: remote.status,
      note: remote.note,
      attachments: remote.attachments,
      createdAt: new Date(remote.created_at).getTime(),
      updatedAt: new Date(remote.updated_at).getTime()
    }));
  }
};

export const saveOrder = async (mode: StorageMode, order: Order, editId?: number | null) => {
  if (mode === StorageMode.OFFLINE) {
    // STANDALONE OFFLINE: Write exclusively to Dexie
    if (editId) {
      return await db.orders.update(editId, order as any);
    } else {
      return await db.orders.add(order);
    }
  } else {
    // REALTIME ONLINE: Write exclusively to Supabase
    const supabase = initSupabase();
    if (!supabase) throw new Error("Remote access not configured");

    const payload = {
      uuid: order.uuid,
      customer: order.customer,
      city: order.city,
      material: order.material,
      qty: order.qty,
      status: order.status,
      note: order.note,
      attachments: order.attachments,
      updated_at: new Date().toISOString()
    };

    if (editId) {
      const { error } = await supabase
        .from('orders')
        .update(payload)
        .eq('uuid', order.uuid);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('orders')
        .insert({ ...payload, created_at: new Date().toISOString() });
      if (error) throw error;
    }
  }
};

export const deleteOrder = async (mode: StorageMode, id: number, uuid: string) => {
  if (mode === StorageMode.OFFLINE) {
    // STANDALONE OFFLINE: Permanent hard-delete from local storage
    return await db.orders.delete(id);
  } else {
    // REALTIME ONLINE: Direct hard-delete from Supabase
    const supabase = initSupabase();
    if (!supabase) throw new Error("Remote access not configured");
    const { error } = await supabase
      .from('orders')
      .delete()
      .eq('uuid', uuid);
    if (error) throw error;
  }
};
