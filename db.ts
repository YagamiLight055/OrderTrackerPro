
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

export class OrderTrackerDB extends Dexie {
  orders!: Table<Order>;
  shipments!: Table<Shipment>;
  customersMaster!: Table<MasterItem>;
  citiesMaster!: Table<MasterItem>;
  materialsMaster!: Table<MasterItem>;

  constructor() {
    super('OrderTrackerDB');
    
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
