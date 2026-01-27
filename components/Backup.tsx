
import React, { useState, useEffect } from 'react';
import { db } from '../db';
import { exportToCSV, parseCSV } from '../services/csvService';
import { saveSyncConfig, getSyncConfig, syncWithSupabase, clearSupabaseData } from '../services/syncService';

const Backup: React.FC = () => {
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [clearingCloud, setClearingCloud] = useState(false);
  const [clearingLocal, setClearingLocal] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  
  const [cloudConfig, setCloudConfig] = useState({
    url: '',
    publishableKey: ''
  });

  useEffect(() => {
    const config = getSyncConfig();
    if (config) setCloudConfig(config);
    setLastSync(localStorage.getItem('order_tracker_last_sync_time'));
  }, []);

  const handleSaveConfig = () => {
    if (!cloudConfig.url || !cloudConfig.publishableKey) {
      alert("Missing Information: Both Supabase URL and Key are required for synchronization.");
      return;
    }
    saveSyncConfig(cloudConfig);
    alert("Cloud Credentials Updated Successfully.");
  };

  const handleSyncNow = async () => {
    if (!cloudConfig.url) {
      alert("Configuration Missing: Go to Cloud Settings and enter your project details.");
      return;
    }
    setSyncing(true);
    try {
      const result = await syncWithSupabase();
      setLastSync(localStorage.getItem('order_tracker_last_sync_time'));
      alert(`Synchronization Complete!\n\n- Pushed ${result.pushed} updates to Cloud\n- Pulled ${result.pulled} updates from Cloud`);
    } catch (err: any) {
      console.error(err);
      alert(`Sync Error: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleWipeCloud = async () => {
    if (!confirm("CRITICAL ACTION: This will permanently ERASE all orders from your Supabase remote table. Local data remains safe. Proceed?")) return;
    
    setClearingCloud(true);
    try {
      await clearSupabaseData();
      alert("Cloud Datastore Reset Complete.");
      setLastSync(null);
    } catch (err: any) {
      console.error(err);
      alert(`Reset Failed: ${err.message}`);
    } finally {
      setClearingCloud(false);
    }
  };

  const handleWipeLocal = async () => {
    if (!confirm("CRITICAL ACTION: This will permanently ERASE all orders, customers, and catalogs from your LOCAL offline database. This cannot be undone. Proceed?")) return;
    
    setClearingLocal(true);
    try {
      await Promise.all([
        db.orders.clear(),
        db.customersMaster.clear(),
        db.citiesMaster.clear(),
        db.materialsMaster.clear()
      ]);
      localStorage.removeItem('order_tracker_last_sync_time');
      setLastSync(null);
      alert("Local Database Reset Complete.");
    } catch (err: any) {
      console.error(err);
      alert(`Local Reset Failed: ${err.message}`);
    } finally {
      setClearingLocal(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const orders = await db.orders.toArray();
      if (orders.length === 0) {
        alert("Export failed: Local database is currently empty.");
        return;
      }
      exportToCSV(orders, `order_tracker_pro_export_${new Date().toISOString().split('T')[0]}.csv`);
    } catch (err) {
      alert("CSV Export failed.");
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const data = await parseCSV(file);
      if (!Array.isArray(data)) throw new Error("Invalid CSV format.");

      let count = 0;
      for (const item of data) {
        if (!item.uuid) item.uuid = crypto.randomUUID();
        if (typeof item.attachments === 'string') {
          try { item.attachments = JSON.parse(item.attachments); } catch { item.attachments = []; }
        }
        const existing = await db.orders.where('uuid').equals(item.uuid).first();
        if (existing) {
          await db.orders.update(existing.id!, { ...item, updatedAt: Date.now() });
        } else {
          await db.orders.add({ ...item, updatedAt: Date.now() });
        }
        count++;
      }
      alert(`Import Success: Merged ${count} records into your local database.`);
    } catch (err: any) {
      console.error(err);
      alert(`Import Error: ${err.message}`);
    } finally {
      setImporting(false);
      if (e.target) e.target.value = '';
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-8 duration-700 pb-24 px-2">
      <header className="text-center space-y-2">
        <h2 className="text-4xl font-black text-gray-900 tracking-tighter uppercase">Cloud & Storage</h2>
        <div className="flex items-center justify-center gap-2">
          <span className="w-12 h-1 bg-indigo-600 rounded-full"></span>
          <p className="text-gray-400 font-bold uppercase text-[10px] tracking-[0.3em]">Data Management Center</p>
          <span className="w-12 h-1 bg-indigo-600 rounded-full"></span>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <button 
          onClick={handleExport}
          disabled={exporting}
          className="bg-white p-10 rounded-[3rem] border border-gray-100 shadow-2xl shadow-gray-200/50 hover:shadow-emerald-100 transition-all flex flex-col items-center gap-6 text-center group active:scale-95"
        >
          <div className="w-24 h-24 bg-emerald-50 text-emerald-600 rounded-[2.5rem] flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-all duration-500 shadow-inner">
             <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
               <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V10m0 0l-3 3m3-3l3 3m2-8H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V9l-5-5z" />
             </svg>
          </div>
          <div>
            <h4 className="font-black text-gray-900 text-2xl uppercase tracking-tighter">Export Archive</h4>
            <p className="text-[11px] text-gray-400 font-bold uppercase tracking-widest mt-2">Local CSV Backup</p>
          </div>
        </button>

        <label className="bg-white p-10 rounded-[3rem] border border-gray-100 shadow-2xl shadow-gray-200/50 hover:shadow-amber-100 transition-all flex flex-col items-center gap-6 text-center cursor-pointer group active:scale-95">
          <input type="file" accept=".csv" className="hidden" onChange={handleImport} disabled={importing} />
          <div className="w-24 h-24 bg-amber-50 text-amber-600 rounded-[2.5rem] flex items-center justify-center group-hover:bg-amber-600 group-hover:text-white transition-all duration-500 shadow-inner">
            {importing ? (
              <div className="w-10 h-10 border-[5px] border-amber-600 group-hover:border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                 <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            )}
          </div>
          <div>
            <h4 className="font-black text-gray-900 text-2xl uppercase tracking-tighter">{importing ? 'Processing...' : 'Import CSV'}</h4>
            <p className="text-[11px] text-gray-400 font-bold uppercase tracking-widest mt-2">Restore Local Database</p>
          </div>
        </label>
      </div>

      <section className="bg-white p-10 rounded-[3.5rem] shadow-[0_25px_80px_-15px_rgba(0,0,0,0.05)] border border-gray-100 relative overflow-hidden">
        <div className="flex flex-col md:flex-row items-center gap-6 mb-10 text-center md:text-left">
          <div className="w-20 h-20 bg-blue-600 rounded-[2rem] flex items-center justify-center text-white shadow-2xl shadow-blue-200">
            <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
            </svg>
          </div>
          <div>
            <h3 className="text-3xl font-black text-gray-900 uppercase tracking-tighter">Remote Bridge</h3>
            <p className="text-[11px] text-blue-500 font-black uppercase tracking-[0.4em] mt-1">Supabase Professional Engine</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
          <div className="space-y-2">
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-4">API Endpoint URL</label>
            <input 
              type="text" 
              value={cloudConfig.url} 
              onChange={e => setCloudConfig({ ...cloudConfig, url: e.target.value })}
              className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent rounded-[1.5rem] focus:bg-white focus:border-blue-100 transition-all font-bold text-sm shadow-inner"
              placeholder="https://your-project.supabase.co"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-4">Service Key (Anon)</label>
            <input 
              type="password" 
              value={cloudConfig.publishableKey} 
              onChange={e => setCloudConfig({ ...cloudConfig, publishableKey: e.target.value })}
              className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent rounded-[1.5rem] focus:bg-white focus:border-blue-100 transition-all font-bold text-sm shadow-inner"
              placeholder="••••••••••••••••"
            />
          </div>
          <div className="md:col-span-2 flex justify-end">
            <button 
              onClick={handleSaveConfig}
              className="text-blue-600 font-black text-[11px] uppercase tracking-widest hover:bg-blue-50 px-8 py-3 rounded-2xl transition-all active:scale-95 border border-blue-100"
            >
              Update Cloud Credentials
            </button>
          </div>
        </div>

        <div className="bg-blue-50/50 p-8 rounded-[3rem] border border-blue-100/50 flex flex-col md:flex-row items-center gap-8">
          <button 
            onClick={handleSyncNow}
            disabled={syncing || !cloudConfig.url}
            className={`w-full md:w-auto py-5 px-12 rounded-[2rem] font-black text-xl shadow-2xl transition-all active:scale-95 flex items-center justify-center gap-4 ${
              syncing ? 'bg-blue-300' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-200'
            } text-white`}
          >
            {syncing ? (
              <div className="w-6 h-6 border-4 border-white/20 border-t-white rounded-full animate-spin"></div>
            ) : (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            )}
            {syncing ? 'Syncing...' : 'Initiate Master Sync'}
          </button>
          
          <div className="flex-1 space-y-1">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Synchronization History</p>
            <p className="text-sm font-black text-gray-700">
              {lastSync ? `Confirmed: ${new Date(Number(lastSync)).toLocaleString()}` : 'No active bridge established'}
            </p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="bg-orange-50/30 p-10 rounded-[3.5rem] border-2 border-dashed border-orange-100 flex flex-col items-center justify-between gap-8">
          <div className="flex items-center gap-6 w-full">
            <div className="w-16 h-16 bg-orange-100 text-orange-600 rounded-[1.75rem] flex items-center justify-center flex-shrink-0 shadow-sm">
               <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </div>
            <div className="text-left flex-1">
              <h4 className="text-orange-900 font-black text-2xl uppercase tracking-tighter">Local Wipe</h4>
              <p className="text-orange-700/60 text-xs font-black uppercase tracking-widest mt-1">Erase Offline Database</p>
            </div>
          </div>
          <button 
            onClick={handleWipeLocal}
            disabled={clearingLocal}
            className="w-full px-12 py-5 bg-white text-orange-600 border-2 border-orange-100 font-black rounded-[2rem] hover:bg-orange-600 hover:text-white transition-all shadow-lg active:scale-95 disabled:opacity-50 uppercase tracking-widest text-[11px]"
          >
            {clearingLocal ? 'Wiping Local...' : 'Reset Local Database'}
          </button>
        </section>

        <section className="bg-red-50/30 p-10 rounded-[3.5rem] border-2 border-dashed border-red-100 flex flex-col items-center justify-between gap-8">
          <div className="flex items-center gap-6 w-full">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-[1.75rem] flex items-center justify-center flex-shrink-0 shadow-sm">
               <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            </div>
            <div className="text-left flex-1">
              <h4 className="text-red-900 font-black text-2xl uppercase tracking-tighter">Remote Reset</h4>
              <p className="text-red-700/60 text-xs font-black uppercase tracking-widest mt-1">Permanently wipe Cloud environment</p>
            </div>
          </div>
          <button 
            onClick={handleWipeCloud}
            disabled={clearingCloud || !cloudConfig.url}
            className="w-full px-12 py-5 bg-white text-red-600 border-2 border-red-100 font-black rounded-[2rem] hover:bg-red-600 hover:text-white transition-all shadow-lg active:scale-95 disabled:opacity-50 uppercase tracking-widest text-[11px]"
          >
            {clearingCloud ? 'Resetting Cloud...' : 'Erase All Remote Data'}
          </button>
        </section>
      </div>
    </div>
  );
};

export default Backup;
