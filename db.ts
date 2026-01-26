
// Fix: Use named import for Dexie to ensure subclass correctly inherits properties like version().
import { Dexie, Table } from 'dexie';

export interface Order {
  id?: number;
  customer: string;
  city: string;
  material: string;
  qty: number;
  status: string;
  createdAt: number;
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
    // Fix: Using named import for Dexie ensures the 'version' property is correctly typed on the instance.
    this.version(4).stores({
      orders: '++id, customer, city, material, qty, status, createdAt',
      customersMaster: '++id, &name',
      citiesMaster: '++id, &name',
      materialsMaster: '++id, &name'
    });
  }
}

export const db = new OrderTrackerDB();
