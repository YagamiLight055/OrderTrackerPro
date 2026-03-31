
import { Dexie, type Table } from 'dexie';

export interface Order {
  id?: number;
  
  // User Requested Columns (1-24)
  "Plant"?: string;
  "Invoice Number"?: string;
  "INV DATE"?: number;
  "SALES ORDER": string;
  "SO DATE": number;
  "CUSTOMER": string;
  "MATERIAL": string;
  "Material Description"?: string;
  "ITEM QTY": number;
  "DELIVERY"?: string;
  "DEL DATE"?: number;
  "DEL QTY"?: number;
  "IND. SHIP. NUMBER"?: string;
  "COL SHP NO"?: string;
  "Ship To Party"?: string;
  "Ship to Party Name"?: string;
  "Ship to Party Destination"?: string;
  "Payer"?: string;
  "Value of Part ordered"?: number;
  "Order type"?: string;
  "GC L/R No"?: string;
  "LR Date"?: number;
  "Road Permit"?: string;
  "Truck No"?: string;

  // Existing Required Fields (attached at the end)
  uuid: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  note?: string;
  attachments?: string[];
  reasonForRejection?: string;
  customerName: string;
  customerCity: string;
}

export interface Shipment {
  id?: number;
  uuid: string;
  reference: string;
  orderUuids: string[];
  attachments: string[];
  note?: string;
  dispatchDate: number;
  invoiceNo?: string;
  invoiceDate?: number;
  vehicleNo?: string;
  transporter?: string;
  lrNo?: string;
  createdAt: number;
  updatedAt: number;
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
    
    this.version(18).stores({
      orders: '++id, &uuid, customerName, customerCity, status, createdAt, updatedAt',
      shipments: '++id, &uuid, reference, dispatchDate, createdAt',
      customersMaster: '++id, &name',
      citiesMaster: '++id, &name',
      materialsMaster: '++id, &name'
    });
  }
}

export const db = new OrderTrackerDB();
