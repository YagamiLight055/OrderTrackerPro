// Fix: Use named import for Dexie to ensure that class methods like version() are correctly inherited and typed in subclasses.
import { Dexie, type Table } from 'dexie';

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
  deleted?: number; // Flag for soft deletion (0 = false, 1 = true) to support cloud sync and indexing
}

export interface MasterItem {
  id?: number;
  name: string;
}

export class OrderTrackerDB extends Dexie {
  orders!: Table<Order>;
  customersMaster!: Table<MasterItem>;
  citiesMaster!: Table<MasterItem>;
  materialsMaster!: Table<MasterItem>;

  constructor() {
    super('OrderTrackerDB');
    
    // Define the database version and schema.
    // version 6 includes 'deleted' field for sync tracking
    // Fix: Using this.version() which is a standard Dexie instance method.
    this.version(6).stores({
      orders: '++id, &uuid, customer, city, material, qty, status, createdAt, updatedAt, deleted',
      customersMaster: '++id, &name',
      citiesMaster: '++id, &name',
      materialsMaster: '++id, &name'
    });
  }
}

export const db = new OrderTrackerDB();