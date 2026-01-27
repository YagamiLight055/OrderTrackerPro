import React, { useState, useEffect } from 'react';
import { db } from '../db';
import { exportToCSV, parseCSV } from '../services/csvService';
import { saveSyncConfig, getSyncConfig, syncWithSupabase, clearSupabaseData, getDeletedCount, purgeLocalDeletedRecords } from '../services/syncService';

const Backup: React.FC = () => {
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [clearingCloud, setClearingCloud] = useState(false);
  const [purging, setPurging] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [deletedCount, setDeletedCount] = useState(0);
  
  const [cloudConfig, setCloudConfig] = useState({
    url: '',
    publishableKey: ''
  });

  useEffect(() => {
    const config = getSyncConfig();
    if (config) setCloudConfig(config);
    setLastSync(localStorage.getItem('order_tracker_last_sync_time'));
    refreshStats();
  }, []);

  const refreshStats = async () => {
    const count = await getDeletedCount();
    setDeletedCount(count);
  };

  const handleSaveConfig = () => {
    if (!cloudConfig.url || !cloudConfig.publishableKey) {
      alert("Please provide both Supabase URL and Publishable Key.");
      return;
    }
    saveSyncConfig(cloudConfig);
    alert("Configuration saved! You can now sync with your cloud database.");
  };

  const handleSyncNow = async () => {
    if (!cloudConfig.url) {
      alert("Please configure your cloud settings first.");
      return;
    }
    setSyncing(true);
    try {
      const result = await syncWithSupabase();
      setLastSync(localStorage.getItem('order_tracker_last_sync_time'));
      await refreshStats();
      alert(`Sync Successful!\n\n- Pushed ${result.pushed} local changes\n- Pulled ${result.pulled} cloud updates`);
    } catch (err: any) {
      console.error(err);
      alert(`Sync Failed: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const handlePurge = async () => {
    if (deletedCount === 0) return;
    if (!confirm(`Purge ${deletedCount} deleted records from local storage? This action cannot be undone. Make sure you have synced first!`)) return;
    
    setPurging(true);
    try {
      const purged = await purgeLocalDeletedRecords();
      alert(`Maintenance complete. Permanently removed ${purged} records.`);
      await refreshStats();
    } catch (err) {
      alert("Purge failed.");
    } finally {
      setPurging(false);
    }
  };

  const handleWipeCloud = async () => {
    if (!confirm("DANGER: This will permanently delete ALL records from your remote Supabase 'orders' table. Your local data will not be affected. Continue?")) return;
    
    setClearingCloud(true);
    try {
      await clearSupabaseData();
      alert("Cloud database cleared successfully.");
      setLastSync(null);
    } catch (err: any) {
      console.error(err);
      alert(`Failed to clear cloud: ${err.message}`);
    } finally {
      setClearingCloud(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const orders = await db.orders.toArray();
      if (orders.length === 0) {
        alert("No records to export.");
        return;
      }
      exportToCSV(orders, `order_tracker_pro_backup_${new Date().toISOString().split('T')[0]}.csv`);
    } catch (err) {
      alert("Export failed.");
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
      if (!Array.isArray(data)) throw new Error("Invalid CSV data format.");

      let count = 0;
      for (const item of data) {
        if (!item.uuid) item.uuid = crypto.randomUUID();

        if (typeof item.attachments === 'string') {
          try {
            item.attachments = JSON.parse(item.attachments);
          } catch {
            item.attachments = [];
          }
        }

        const existing = await db.orders.where('uuid').equals(item.uuid).first();
        if (existing) {
          await db.orders.update(existing.id!, { ...item, updatedAt: Date.now() });
        } else {
          await db.orders.add({ ...item, updatedAt: Date.now() });
        }
        count++;
      }
      await refreshStats();
      alert(`Import complete! Processed ${count} records.`);
    } catch (err: any) {
      console.error(err);
      alert(`Import failed: ${err.message}`);
    } finally {
      setImporting(false);
      if (e.target) e.target.value = '';
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-24">
      <header className="text-center">
        <h2 className="text-4xl font-black text-gray-900 mb-2 tracking-tight">Cloud & Data</h2>
        <p className="text-gray-500 font-medium">Manage your multi-device synchronization and local backups.</p>
      </header>

      {/* Cloud Connectivity Card */}
      <section className="bg-white p-8 rounded-[2.5rem] shadow-2xl shadow-indigo-100/50 border border-gray-100 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none">
          <svg className="w-48 h-48" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
        </div>

        <div className="flex items-center gap-4 mb-8">
          <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-indigo-200">
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" /></svg>
          </div>
          <div>
            <h3 className="text-2xl font-black text-gray-900">Supabase Sync</h3>
            <p className="text-sm text-gray-400 font-bold uppercase tracking-widest">Bi-Directional Gateway</p>
          </div>
        </div>

        <div className="space-y-5 mb-10">
          <div className="group">
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1 transition-colors group-focus-within:text-indigo-600">Project Endpoint</label>
            <input 
              type="text" 
              value={cloudConfig.url} 
              onChange={e => setCloudConfig({ ...cloudConfig, url: e.target.value })}
              className="w-full px-5 py-4 bg-gray-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-indigo-100 focus:ring-4 focus:ring-indigo-50/50 transition-all font-medium text-sm"
              placeholder="https://xxxx.supabase.co"
            />
          </div>
          <div className="group">
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1 transition-colors group-focus-within:text-indigo-600">Anon Public Key</label>
            <input 
              type="password" 
              value={cloudConfig.publishableKey} 
              onChange={e => setCloudConfig({ ...cloudConfig, publishableKey: e.target.value })}
              className="w-full px-5 py-4 bg-gray-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-indigo-100 focus:ring-4 focus:ring-indigo-50/50 transition-all font-medium text-sm"
              placeholder="eyJhbG..."
            />
          </div>
          <button 
            onClick={handleSaveConfig}
            className="text-indigo-600 font-black text-xs hover:bg-indigo-50 px-4 py-2 rounded-lg transition-colors inline-block"
          >
            Save Credentials
          </button>
        </div>

        <div className="bg-indigo-50/30 p-6 rounded-3xl border border-indigo-100/50 flex flex-col md:flex-row items-center gap-6">
          <button 
            onClick={handleSyncNow}
            disabled={syncing || !cloudConfig.url}
            className={`w-full md:w-auto py-5 px-10 rounded-2xl font-black text-xl shadow-2xl transition-all active:scale-95 flex items-center justify-center gap-4 ${
              syncing ? 'bg-indigo-300' : 'bg-indigo-600 hover:bg-indigo-700'
            } text-white`}
          >
            {syncing ? (
              <div className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            )}
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>
          
          <div className="flex-1 text-center md:text-left">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Last Connection</p>
            <p className="text-base font-black text-gray-700">
              {lastSync ? `${new Date(Number(lastSync)).toLocaleString()}` : 'Never synchronized'}
            </p>
          </div>
        </div>
      </section>

      {/* Maintenance Section */}
      <section className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col md:flex-row items-center gap-6">
        <div className="w-16 h-16 bg-gray-50 text-gray-400 rounded-2xl flex items-center justify-center flex-shrink-0">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
        </div>
        <div className="flex-1 text-center md:text-left">
           <h4 className="font-black text-gray-900 text-lg">Local Data Cleanup</h4>
           <p className="text-sm text-gray-500 font-medium">
             You have <span className="text-indigo-600 font-black">{deletedCount}</span> synced deletions in memory.
           </p>
        </div>
        <button 
          onClick={handlePurge}
          disabled={purging || deletedCount === 0}
          className="px-6 py-3 bg-gray-900 text-white rounded-xl font-black text-sm hover:bg-black transition-all active:scale-95 disabled:opacity-30 disabled:grayscale"
        >
          {purging ? 'Purging...' : 'Purge Tombstones'}
        </button>
      </section>

      {/* CSV Section */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <button 
          onClick={handleExport}
          disabled={exporting}
          className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-lg hover:shadow-indigo-100 transition-all flex flex-col items-center gap-4 text-center group"
        >
          <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-3xl flex items-center justify-center group-hover:scale-110 transition-transform">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
          </div>
          <div>
            <h4 className="font-black text-gray-900 text-lg">Export CSV</h4>
            <p className="text-xs text-gray-500 font-medium">Download full database snapshot.</p>
          </div>
        </button>

        <label className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-lg hover:shadow-indigo-100 transition-all flex flex-col items-center gap-4 text-center cursor-pointer group">
          <input type="file" accept=".csv" className="hidden" onChange={handleImport} disabled={importing} />
          <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-3xl flex items-center justify-center group-hover:scale-110 transition-transform">
            {importing ? (
              <div className="w-7 h-7 border-3 border-amber-600 border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
              </svg>
            )}
          </div>
          <div>
            <h4 className="font-black text-gray-900 text-lg">{importing ? 'Processing...' : 'Import CSV'}</h4>
            <p className="text-xs text-gray-500 font-medium">Restore or merge from backup file.</p>
          </div>
        </label>
      </div>

      {/* Danger Zone */}
      <section className="bg-red-50/50 p-8 rounded-[2.5rem] border-2 border-dashed border-red-100 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex gap-4">
          <div className="w-12 h-12 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center flex-shrink-0">
             <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          </div>
          <div>
            <h4 className="text-red-900 font-black text-xl">Cloud Wipe</h4>
            <p className="text-red-700/70 text-sm font-medium">Delete all records from the cloud while keeping local data safe.</p>
          </div>
        </div>
        <button 
          onClick={handleWipeCloud}
          disabled={clearingCloud || !cloudConfig.url}
          className="w-full md:w-auto px-8 py-4 bg-white text-red-600 border-2 border-red-100 font-black rounded-2xl hover:bg-red-600 hover:text-white transition-all shadow-sm active:scale-95 disabled:opacity-50"
        >
          {clearingCloud ? 'Clearing...' : 'Wipe Remote Database'}
        </button>
      </section>
    </div>
  );
};

export default Backup;
