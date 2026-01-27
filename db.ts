
// Fix: Use named import for Dexie to ensure 'version' and other instance methods are correctly inherited and typed in subclasses.
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

export class OrderTrackerDB extends Dexie {
  orders!: Table<Order>;
  customersMaster!: Table<MasterItem>;
  citiesMaster!: Table<MasterItem>;
  materialsMaster!: Table<MasterItem>;

  constructor() {
    super('OrderTrackerDB');
    
    // Define the database version and schema.
    // version 5 includes sync-related fields
    this.version(5).stores({
      orders: '++id, &uuid, customer, city, material, qty, status, createdAt, updatedAt',
      customersMaster: '++id, &name',
      citiesMaster: '++id, &name',
      materialsMaster: '++id, &name'
    });
  }
}

export const db = new OrderTrackerDB();
