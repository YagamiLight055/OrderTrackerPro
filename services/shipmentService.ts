
import { db, Shipment } from '../db';
import { StorageMode } from '../types';
import { initSupabase } from './syncService';

export const getShipments = async (mode: StorageMode): Promise<Shipment[]> => {
  if (mode === StorageMode.OFFLINE) {
    return await db.shipments.toArray();
  } else {
    const supabase = initSupabase();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('shipments')
      .select('*')
      .order('dispatchDate', { ascending: false });
    if (error) throw error;
    return data || [];
  }
};

export const saveShipment = async (mode: StorageMode, shipment: Shipment): Promise<void> => {
  if (mode === StorageMode.OFFLINE) {
    await db.shipments.put(shipment);
  } else {
    const supabase = initSupabase();
    if (!supabase) throw new Error("Supabase not initialized");
    const { error } = await supabase
      .from('shipments')
      .upsert(shipment);
    if (error) throw error;
  }
};

export const deleteShipment = async (mode: StorageMode, id: number, uuid: string): Promise<void> => {
  if (mode === StorageMode.OFFLINE) {
    await db.shipments.delete(id);
  } else {
    const supabase = initSupabase();
    if (!supabase) throw new Error("Supabase not initialized");
    const { error } = await supabase
      .from('shipments')
      .delete()
      .eq('uuid', uuid);
    if (error) throw error;
  }
};
