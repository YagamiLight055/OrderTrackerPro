
export enum AppTab {
  ADD_ORDER = 'ADD_ORDER',
  ORDERS_LIST = 'ORDERS_LIST',
  SUMMARY = 'SUMMARY',
  MASTER_DATA = 'MASTER_DATA',
  BACKUP = 'BACKUP'
}

export interface SummaryRow {
  city: string;
  customer: string;
  material: string;
  orderCount: number;
  totalQty: number;
}
