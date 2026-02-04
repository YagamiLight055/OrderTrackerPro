
import React, { useState, useEffect } from 'react';
import { db, Order, Shipment } from '../db';
import { exportToCSV, parseCSV } from '../services/csvService';
import { saveSyncConfig, getSyncConfig, clearSupabaseData, importCsvToSupabase, importShipmentsCsvToSupabase, initSupabase } from '../services/syncService';
import { getOrders } from '../services/orderService';
import { getShipments } from '../services/shipmentService';
import { StorageMode } from '../types';

const Backup: React.FC = () => {
  const [importingLocal, setImportingLocal] = useState(false);
  const [importingCloudOrders, setImportingCloudOrders] = useState(false);
  const [importingCloudShipments, setImportingCloudShipments] = useState(false);
  const [exportingLocal, setExportingLocal] = useState(false);
  const [exportingCloud, setExportingCloud] = useState(false);
  const [clearingCloud, setClearingCloud] = useState(false);
  const [clearingLocal, setClearingLocal] = useState(false);
  const [showSql, setShowSql] = useState(false);
  
  const [cloudConfig, setCloudConfig] = useState({
    url: '',
    publishableKey: ''
  });

  useEffect(() => {
    const config = getSyncConfig();
    if (config) setCloudConfig(config);
  }, []);

  const handleSaveConfig = () => {
    if (!cloudConfig.url || !cloudConfig.publishableKey) {
      alert("Missing Information: Both Supabase URL and Key are required.");
      return;
    }
    saveSyncConfig(cloudConfig);
    alert("Cloud Credentials Updated.");
  };

  const handleExportLocal = async (type: 'orders' | 'shipments') => {
    setExportingLocal(true);
    try {
      const data = type === 'orders' ? await db.orders.toArray() : await db.shipments.toArray();
      if (data.length === 0) {
        alert(`${type} database is empty.`);
        return;
      }
      exportToCSV(data, `local_${type}_backup_${new Date().toISOString().split('T')[0]}.csv`);
    } catch (err) {
      alert("CSV Export failed.");
    } finally {
      setExportingLocal(false);
    }
  };

  const handleExportCloud = async (type: 'orders' | 'shipments') => {
    const client = initSupabase();
    if (!client) {
      alert("Please configure Cloud credentials first.");
      return;
    }
    setExportingCloud(true);
    try {
      const data = type === 'orders' ? await getOrders(StorageMode.ONLINE) : await getShipments(StorageMode.ONLINE);
      if (data.length === 0) {
        alert(`No ${type} found in the cloud database.`);
        return;
      }
      exportToCSV(data, `cloud_${type}_export_${new Date().toISOString().split('T')[0]}.csv`);
    } catch (err: any) {
      alert(`Cloud Export failed: ${err.message}`);
    } finally {
      setExportingCloud(false);
    }
  };

  const handleImportLocal = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportingLocal(true);
    try {
      const data = await parseCSV(file);
      if (!Array.isArray(data)) throw new Error("Invalid CSV format.");

      let count = 0;
      for (const item of data) {
        const isShipment = !!(item.orderUuids || item.order_uuids || item.reference);
        const targetTable = isShipment ? db.shipments : db.orders;
        if (!item.uuid) item.uuid = crypto.randomUUID();
        if (typeof item.attachments === 'string') {
          try { item.attachments = JSON.parse(item.attachments); } catch { item.attachments = []; }
        }
        if (isShipment && typeof (item.orderUuids || item.order_uuids) === 'string') {
           const raw = item.orderUuids || item.order_uuids;
           try { item.orderUuids = JSON.parse(raw); } catch { item.orderUuids = raw.split(';').map((u: string) => u.trim()); }
        }
        const existing = await targetTable.where('uuid').equals(item.uuid).first();
        if (existing) {
          await targetTable.update((existing as any).id!, { ...item, updatedAt: Date.now() });
        } else {
          await targetTable.add({ ...item, updatedAt: Date.now() } as any);
        }
        count++;
      }
      alert(`Local Import Success: Merged ${count} records.`);
    } catch (err: any) {
      alert(`Import Error: ${err.message}`);
    } finally {
      setImportingLocal(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleImportToCloud = async (e: React.ChangeEvent<HTMLInputElement>, type: 'orders' | 'shipments') => {
    const file = e.target.files?.[0];
    if (!file || !cloudConfig.url) {
      alert("Please configure Cloud credentials first.");
      return;
    }
    type === 'orders' ? setImportingCloudOrders(true) : setImportingCloudShipments(true);
    try {
      const data = await parseCSV(file);
      const count = type === 'orders' ? await importCsvToSupabase(data) : await importShipmentsCsvToSupabase(data);
      alert(`Cloud Push Success: ${count} ${type} synchronized to Supabase.`);
    } catch (err: any) {
      console.error(err);
      alert(`Cloud Push Failed: ${err.message}`);
    } finally {
      type === 'orders' ? setImportingCloudOrders(false) : setImportingCloudShipments(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleWipeCloud = async () => {
    if (!confirm("WARNING: This will permanently DELETE all records from Supabase. Offline data remains safe. Proceed?")) return;
    setClearingCloud(true);
    try {
      await clearSupabaseData();
      alert("Remote database successfully cleared.");
    } catch (err: any) {
      alert(`Reset Failed: ${err.message}`);
    } finally {
      setClearingCloud(false);
    }
  };

  const handleWipeLocal = async () => {
    if (!confirm("WARNING: This will permanently DELETE all local data. Proceed?")) return;
    setClearingLocal(true);
    try {
      await Promise.all([
        db.orders.clear(),
        db.shipments.clear(),
        db.customersMaster.clear(),
        db.citiesMaster.clear(),
        db.materialsMaster.clear()
      ]);
      alert("Local device storage cleared.");
    } catch (err: any) {
      alert(`Wipe Failed: ${err.message}`);
    } finally {
      setClearingLocal(false);
    }
  };

  const supabaseSqlSchema = `-- 1. Orders Table
create table public.orders (
  id bigint generated always as identity primary key,
  uuid uuid not null unique default gen_random_uuid(),
  order_no text,
  cust_code text,
  customer text not null,
  city text not null,
  zip_code text,
  material text not null,
  qty numeric not null default 0,
  status text default 'Pending',
  note text,
  attachments jsonb default '[]'::jsonb,
  invoice_no text,
  invoice_date timestamp with time zone,
  vehicle_no text,
  transporter text,
  lr_no text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- 2. Shipments (Archive) Table
create table public.shipments (
  id bigint generated always as identity primary key,
  uuid uuid not null unique default gen_random_uuid(),
  reference text not null,
  order_uuids jsonb default '[]'::jsonb,
  attachments jsonb default '[]'::jsonb,
  dispatch_date timestamp with time zone default now(),
  note text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- 3. Master Data Tables
create table public."customersMaster" (
  id bigint generated always as identity primary key,
  name text not null unique
);

create table public."citiesMaster" (
  id bigint generated always as identity primary key,
  name text not null unique
);

create table public."materialsMaster" (
  id bigint generated always as identity primary key,
  name text not null unique
);`;

  return (
    <div className="max-w-5xl mx-auto space-y-12 animate-in fade-in duration-700 pb-24 px-4">
      <header className="text-center">
        <h2 className="text-4xl font-black text-gray-900 tracking-tighter uppercase">Cloud & Storage</h2>
        <p className="text-gray-400 font-bold uppercase text-[10px] tracking-[0.3em] mt-2">Data Conflict Management Hub</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        <section className="bg-white p-8 md:p-10 rounded-[3rem] border border-gray-100 shadow-xl space-y-8 h-full">
           <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shadow-inner">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" /></svg>
              </div>
              <div>
                <h3 className="text-2xl font-black text-gray-900 uppercase tracking-tighter">Device Storage</h3>
                <p className="text-[10px] text-emerald-600 font-black uppercase tracking-widest">Offline Workspace</p>
              </div>
           </div>
           <div className="grid grid-cols-1 gap-4">
              <div className="flex gap-2">
                 <button onClick={() => handleExportLocal('orders')} className="flex-1 p-5 bg-emerald-50 text-emerald-700 rounded-3xl font-black uppercase tracking-widest text-[10px] hover:bg-emerald-600 hover:text-white transition-all">Export Orders</button>
                 <button onClick={() => handleExportLocal('shipments')} className="flex-1 p-5 bg-emerald-50 text-emerald-700 rounded-3xl font-black uppercase tracking-widest text-[10px] hover:bg-emerald-600 hover:text-white transition-all">Export Archives</button>
              </div>
              <label className="flex items-center justify-between p-6 bg-white border-2 border-dashed border-emerald-100 text-emerald-600 rounded-3xl hover:bg-emerald-50 cursor-pointer transition-all font-black uppercase tracking-widest text-xs">
                <input type="file" accept=".csv" className="hidden" onChange={handleImportLocal} disabled={importingLocal} />
                <span>{importingLocal ? 'Merging...' : 'Import CSV to Local'}</span>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5" /></svg>
              </label>
              <button onClick={handleWipeLocal} disabled={clearingLocal} className="p-6 bg-red-50 text-red-600 rounded-3xl hover:bg-red-600 hover:text-white transition-all font-black uppercase tracking-widest text-xs">Erase Device DB</button>
           </div>
        </section>

        <section className="bg-white p-8 md:p-10 rounded-[3rem] border border-gray-100 shadow-xl space-y-8">
           <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-xl shadow-blue-100">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
              </div>
              <div>
                <h3 className="text-2xl font-black text-gray-900 uppercase tracking-tighter">Cloud Engine</h3>
                <p className="text-[10px] text-blue-600 font-black uppercase tracking-widest">LWW Synchronization</p>
              </div>
           </div>
           <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3">
                <input type="text" value={cloudConfig.url} onChange={e => setCloudConfig({ ...cloudConfig, url: e.target.value })} className="w-full px-5 py-3.5 bg-gray-50 border border-transparent rounded-2xl focus:bg-white focus:border-blue-100 font-bold text-xs" placeholder="Supabase Project URL" />
                <input type="password" value={cloudConfig.publishableKey} onChange={e => setCloudConfig({ ...cloudConfig, publishableKey: e.target.value })} className="w-full px-5 py-3.5 bg-gray-50 border border-transparent rounded-2xl focus:bg-white focus:border-blue-100 font-bold text-xs" placeholder="Supabase Public API Key" />
                <button onClick={handleSaveConfig} className="w-full py-3.5 bg-blue-50 text-blue-600 rounded-2xl font-black uppercase tracking-widest text-[10px] border border-blue-100 hover:bg-blue-600 hover:text-white transition-all">Apply Cloud Setup</button>
              </div>
              <div className="grid grid-cols-1 gap-4 pt-4 border-t border-gray-50">
                 <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100 mb-2">
                    <p className="text-[9px] font-black text-blue-700 uppercase tracking-widest flex items-center gap-2">
                       <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                       LWW Policy: Overwrite on UUID Match
                    </p>
                 </div>
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="flex items-center justify-between px-5 py-6 bg-blue-600 text-white rounded-[2rem] hover:bg-blue-700 cursor-pointer shadow-xl shadow-blue-100 transition-all font-black uppercase tracking-widest text-[10px]">
                        <input type="file" accept=".csv" className="hidden" onChange={(e) => handleImportToCloud(e, 'orders')} disabled={importingCloudOrders} />
                        <span>{importingCloudOrders ? 'Syncing...' : 'Push Order CSV'}</span>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                    </label>
                    <label className="flex items-center justify-between px-5 py-6 bg-white border-2 border-blue-100 text-blue-600 rounded-[2rem] hover:bg-blue-50 cursor-pointer transition-all font-black uppercase tracking-widest text-[10px]">
                        <input type="file" accept=".csv" className="hidden" onChange={(e) => handleImportToCloud(e, 'shipments')} disabled={importingCloudShipments} />
                        <span>{importingCloudShipments ? 'Syncing...' : 'Push Archive CSV'}</span>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                    </label>
                 </div>
                 <div className="flex gap-2">
                    <button onClick={() => handleExportCloud('orders')} disabled={!cloudConfig.url} className="flex-1 p-4 bg-gray-50 text-gray-400 rounded-2xl font-black uppercase tracking-widest text-[9px] hover:bg-blue-50 hover:text-blue-600 transition-all">Fetch Order CSV</button>
                    <button onClick={() => handleExportCloud('shipments')} disabled={!cloudConfig.url} className="flex-1 p-4 bg-gray-50 text-gray-400 rounded-2xl font-black uppercase tracking-widest text-[9px] hover:bg-blue-50 hover:text-blue-600 transition-all">Fetch Archive CSV</button>
                 </div>
                 <button onClick={handleWipeCloud} disabled={clearingCloud || !cloudConfig.url} className="p-6 bg-red-50 text-red-600 rounded-3xl hover:bg-red-600 hover:text-white transition-all font-black uppercase tracking-widest text-xs mt-4">Reset Cloud DB</button>
              </div>
           </div>
        </section>
      </div>

      <section className="bg-gray-900 rounded-[3rem] p-8 md:p-12 shadow-2xl text-white">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
            <div>
              <h3 className="text-2xl font-black uppercase tracking-tighter">Database Setup SQL</h3>
              <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mt-1">Run this script in your Supabase SQL Editor</p>
            </div>
            <button 
              onClick={() => setShowSql(!showSql)}
              className="px-6 py-3 bg-white/10 hover:bg-white/20 rounded-xl font-black text-[10px] uppercase tracking-widest border border-white/10 transition-all"
            >
              {showSql ? 'Hide SQL Code' : 'Show SQL Code'}
            </button>
          </div>

          {showSql && (
            <div className="animate-in slide-in-from-top-4 duration-500">
              <div className="bg-black/50 rounded-2xl p-6 border border-white/5 font-mono text-xs overflow-x-auto text-emerald-400 leading-relaxed shadow-inner">
                <pre>{supabaseSqlSchema}</pre>
              </div>
              <div className="mt-6 flex justify-end">
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(supabaseSqlSchema);
                    alert("SQL Schema copied to clipboard!");
                  }}
                  className="px-8 py-4 bg-blue-600 hover:bg-blue-500 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-900/20 transition-all active:scale-95"
                >
                  Copy All to Clipboard
                </button>
              </div>
            </div>
          )}
      </section>
    </div>
  );
};

export default Backup;
