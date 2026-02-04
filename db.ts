
import { Dexie, type Table } from 'dexie';

export interface Order {
  id?: number;
  uuid: string;
  orderNo?: string;
  orderDate: number; // Business Order Date
  custCode?: string;
  customer: string;
  city: string;
  zipCode?: string;
  material: string;
  qty: number;
  status: string;
  createdAt: number; // Technical Creation Time
  updatedAt: number; // Technical Update Time
  note?: string;
  attachments?: string[];
  invoiceNo?: string;
  invoiceDate?: number;
  vehicleNo?: string;
  transporter?: string;
  lrNo?: string;
}

export interface Shipment {
  id?: number;
  uuid: string;
  reference: string;
  orderUuids: string[];
  attachments: string[];
  createdAt: number;
  updatedAt: number;
  dispatchDate: number;
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
    
    (this as any).version(12).stores({
      orders: '++id, &uuid, orderNo, orderDate, custCode, customer, city, material, qty, status, invoiceNo, vehicleNo, lrNo, createdAt, updatedAt',
      shipments: '++id, &uuid, reference, *orderUuids, createdAt, dispatchDate',
      customersMaster: '++id, &name',
      citiesMaster: '++id, &name',
      materialsMaster: '++id, &name'
    });
  }
}

export const db = new OrderTrackerDB();
