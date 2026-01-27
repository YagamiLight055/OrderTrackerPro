
import { Dexie } from 'dexie';
import type { Table } from 'dexie';

export interface Order {
  id?: number;
  uuid: string; // Globally unique identifier for cloud sync
  customer: string;
  city: string;
  material: string;
  qty: number;
  status: string;
  createdAt: number;
  updatedAt: number; // Timestamp for sync resolution
  note?: string;
  attachments?: string[]; // Array of base64 strings
}

export interface MasterItem {
  id?: number;
  name: string;
}

// Fix: Use named import { Dexie } to ensure that instance methods like 'version' are correctly inherited and recognized by the TypeScript compiler on the subclass.
export class OrderTrackerDB extends Dexie {
  orders!: Table<Order>;
  customersMaster!: Table<MasterItem>;
  citiesMaster!: Table<MasterItem>;
  materialsMaster!: Table<MasterItem>;

  constructor() {
    super('OrderTrackerDB');
    
    // Updated schema to version 7: Removed 'deleted' index and field.
    this.version(7).stores({
      orders: '++id, &uuid, customer, city, material, qty, status, createdAt, updatedAt',
      customersMaster: '++id, &name',
      citiesMaster: '++id, &name',
      materialsMaster: '++id, &name'
    });
  }
}

export const db = new OrderTrackerDB();
