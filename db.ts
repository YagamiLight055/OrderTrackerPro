
// Fixed: Using default import for Dexie to ensure proper inheritance of instance methods in TypeScript.
import Dexie from 'dexie';
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

export interface Shipment {
  id?: number;
  uuid: string;
  reference: string;
  orderUuids: string[];
  attachments: string[];
  createdAt: number;
  updatedAt: number;
  dispatchDate: number; // New: Actual date of dispatch/loading
  note?: string;
}

export interface MasterItem {
  id?: number;
  name: string;
}

// Fixed inheritance visibility: Using default import for Dexie to ensure that instance methods like 'version' are correctly inherited and recognized by the TypeScript compiler on the subclass.
export class OrderTrackerDB extends Dexie {
  orders!: Table<Order>;
  shipments!: Table<Shipment>;
  customersMaster!: Table<MasterItem>;
  citiesMaster!: Table<MasterItem>;
  materialsMaster!: Table<MasterItem>;

  constructor() {
    super('OrderTrackerDB');
    
    // Updated schema to version 9: Added dispatchDate to shipments.
    this.version(9).stores({
      orders: '++id, &uuid, customer, city, material, qty, status, createdAt, updatedAt',
      shipments: '++id, &uuid, reference, *orderUuids, createdAt, dispatchDate',
      customersMaster: '++id, &name',
      citiesMaster: '++id, &name',
      materialsMaster: '++id, &name'
    });
  }
}

export const db = new OrderTrackerDB();