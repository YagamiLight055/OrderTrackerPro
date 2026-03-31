
import React, { useState, useEffect } from 'react';
import { db, Order } from '../db';
import { exportToCSV, parseCSV } from '../services/csvService';
import { saveSyncConfig, getSyncConfig, clearSupabaseData, importCsvToSupabase, initSupabase } from '../services/syncService';
import { getOrders } from '../services/orderService';
import { StorageMode } from '../types';

const Backup: React.FC = () => {
  const [importingLocal, setImportingLocal] = useState(false);
  const [importingCloudOrders, setImportingCloudOrders] = useState(false);
  const [exportingLocal, setExportingLocal] = useState(false);
  const [exportingCloud, setExportingCloud] = useState(false);
  const [clearingCloud, setClearingCloud] = useState(false);
  const [clearingLocal, setClearingLocal] = useState(false);
  
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

  const handleExportLocal = async () => {
    setExportingLocal(true);
    try {
      const data = await db.orders.toArray();
      if (data.length === 0) {
        alert(`Orders database is empty.`);
        return;
      }
      exportToCSV(data, `local_orders_backup_${new Date().toISOString().split('T')[0]}.csv`);
    } catch (err) {
      alert("CSV Export failed.");
    } finally {
      setExportingLocal(false);
    }
  };

  const handleExportCloud = async () => {
    const client = initSupabase();
    if (!client) {
      alert("Please configure Cloud credentials first.");
      return;
    }
    setExportingCloud(true);
    try {
      const data = await getOrders(StorageMode.ONLINE);
      if (data.length === 0) {
        alert(`No orders found in the cloud database.`);
        return;
      }
      exportToCSV(data, `cloud_orders_export_${new Date().toISOString().split('T')[0]}.csv`);
    } catch (err: any) {
      alert(`Cloud Export failed: ${err.message}`);
    } finally {
      setExportingCloud(false);
    }
  };

  // Helper to parse dd.mm.yyyy or standard date strings into Local Noon timestamp
  const parseDateToNoonTimestamp = (val: any): number | null => {
    if (!val) return null;
    let d: Date;
    
    // Check if it's a string in dd.mm.yyyy format
    if (typeof val === 'string' && val.includes('.')) {
      const parts = val.split('.');
      if (parts.length === 3) {
        // Assume DD.MM.YYYY
        d = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]), 12, 0, 0);
      } else {
        d = new Date(val);
      }
    } else {
      d = new Date(isNaN(val) ? val : Number(val));
    }

    if (isNaN(d.getTime())) return null;
    
    // Always force to Noon local time to avoid timezone shifts
    d.setHours(12, 0, 0, 0);
    return d.getTime();
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
        const targetTable = db.orders;
        
        if (!item.uuid) item.uuid = crypto.randomUUID();
        
        // Handle Order Date (soDate)
        const dateKey = item.soDate !== undefined ? 'soDate' : 
                        (item.so_date !== undefined ? 'so_date' : 
                        (item.orderDate !== undefined ? 'orderDate' : 
                        (item.order_date !== undefined ? 'order_date' : 
                        (item.Date !== undefined ? 'Date' : 'date'))));
        
        const timestamp = parseDateToNoonTimestamp(item[dateKey]);
        if (timestamp) {
          item.soDate = timestamp;
          if (dateKey !== 'soDate') delete item[dateKey];
        }

        // Handle Invoice Date (invDate)
        const invDateKey = item.invDate !== undefined ? 'invDate' : 
                           (item.inv_date !== undefined ? 'inv_date' : 
                           (item.invoiceDate !== undefined ? 'invoiceDate' : 
                           (item.invoice_date !== undefined ? 'invoice_date' : null)));
        
        if (invDateKey) {
          const invTs = parseDateToNoonTimestamp(item[invDateKey]);
          if (invTs) {
            item.invDate = invTs;
            if (invDateKey !== 'invDate') delete item[invDateKey];
          }
        }

        if (typeof item.attachments === 'string' && item.attachments.startsWith('[')) {
          try { item.attachments = JSON.parse(item.attachments); } catch { item.attachments = []; }
        } else if (!Array.isArray(item.attachments)) {
          item.attachments = [];
        }

        // Ensure note is at least an empty string
        if (item.note === undefined || item.note === null) {
          item.note = '';
        }

        const existing = await targetTable.where('uuid').equals(item.uuid).first();
        if (existing) {
          await targetTable.update((existing as any).id!, { ...item, updatedAt: Date.now() });
        } else {
          await targetTable.add({ ...item, createdAt: item.createdAt || Date.now(), updatedAt: Date.now() } as any);
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

  const handleImportToCloud = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !cloudConfig.url) {
      alert("Please configure Cloud credentials first.");
      return;
    }
    setImportingCloudOrders(true);
    try {
      const data = await parseCSV(file);
      const count = await importCsvToSupabase(data);
      alert(`Cloud Push Success: ${count} orders synchronized to Supabase.`);
    } catch (err: any) {
      console.error(err);
      alert(`Cloud Push Failed: ${err.message}`);
    } finally {
      setImportingCloudOrders(false);
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
                 <button onClick={handleExportLocal} className="flex-1 p-5 bg-emerald-50 text-emerald-700 rounded-3xl font-black uppercase tracking-widest text-[10px] hover:bg-emerald-600 hover:text-white transition-all">Export Orders</button>
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
                  <div className="grid grid-cols-1 gap-3">
                    <label className="flex items-center justify-between px-5 py-6 bg-blue-600 text-white rounded-[2rem] hover:bg-blue-700 cursor-pointer shadow-xl shadow-blue-100 transition-all font-black uppercase tracking-widest text-[10px]">
                        <input type="file" accept=".csv" className="hidden" onChange={handleImportToCloud} disabled={importingCloudOrders} />
                        <span>{importingCloudOrders ? 'Syncing...' : 'Push Order CSV'}</span>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                    </label>
                 </div>
                 <div className="flex gap-2">
                    <button onClick={handleExportCloud} disabled={!cloudConfig.url} className="flex-1 p-4 bg-gray-50 text-gray-400 rounded-2xl font-black uppercase tracking-widest text-[9px] hover:bg-blue-50 hover:text-blue-600 transition-all">Fetch Order CSV</button>
                 </div>
                 <button onClick={handleWipeCloud} disabled={clearingCloud || !cloudConfig.url} className="p-6 bg-red-50 text-red-600 rounded-3xl hover:bg-red-600 hover:text-white transition-all font-black uppercase tracking-widest text-xs mt-4">Reset Cloud DB</button>
              </div>
           </div>
        </section>
      </div>
    </div>
  );
};

export default Backup;
