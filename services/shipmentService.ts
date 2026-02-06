
import { db, Shipment } from '../db';
import { initSupabase } from './syncService';
import { StorageMode } from '../types';

export const getShipments = async (mode: StorageMode): Promise<Shipment[]> => {
  if (mode === StorageMode.OFFLINE) {
    return db.shipments.reverse().sortBy('dispatchDate');
  } else {
    const supabase = initSupabase();
    if (!supabase) throw new Error("Remote access not configured");
    
    const { data, error } = await supabase
      .from('shipments')
      .select('*')
      .order('dispatch_date', { ascending: false });
    
    if (error) throw error;
    
    return (data || []).map(remote => ({
      id: remote.id,
      uuid: remote.uuid,
      reference: remote.reference,
      orderUuids: remote.order_uuids || [],
      attachments: remote.attachments || [],
      dispatchDate: new Date(remote.dispatch_date).getTime(),
      note: remote.note,
      createdAt: new Date(remote.created_at).getTime(),
      updatedAt: new Date(remote.updated_at).getTime()
    }));
  }
};

export const saveShipment = async (mode: StorageMode, shipment: Shipment, editId?: number | null) => {
  if (mode === StorageMode.OFFLINE) {
    if (editId) {
      // Fix: Use 'as any' to resolve Dexie UpdateSpec type issues with array properties
      return await db.shipments.update(editId, shipment as any);
    } else {
      return await db.shipments.add(shipment);
    }
  } else {
    const supabase = initSupabase();
    if (!supabase) throw new Error("Remote access not configured");

    const payload = {
      uuid: shipment.uuid,
      reference: shipment.reference,
      order_uuids: shipment.orderUuids,
      attachments: shipment.attachments,
      dispatch_date: new Date(shipment.dispatchDate).toISOString(),
      note: shipment.note,
      updated_at: new Date().toISOString()
    };

    if (editId || shipment.uuid) {
      const { error } = await supabase
        .from('shipments')
        .upsert({ ...payload, created_at: new Date(shipment.createdAt).toISOString() }, { onConflict: 'uuid' });
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('shipments')
        .insert({ ...payload, created_at: new Date().toISOString() });
      if (error) throw error;
    }
  }
};

export const deleteShipment = async (mode: StorageMode, id: number, uuid: string) => {
  if (mode === StorageMode.OFFLINE) {
    return await db.shipments.delete(id);
  } else {
    const supabase = initSupabase();
    if (!supabase) throw new Error("Remote access not configured");
    const { error } = await supabase
      .from('shipments')
      .delete()
      .eq('uuid', uuid);
    if (error) throw error;
  }
};
