
import React, { useState, useEffect } from 'react';
import { db } from '../db';
import { exportToCSV, parseCSV } from '../services/csvService';
import { saveSyncConfig, getSyncConfig, syncWithSupabase } from '../services/syncService';

const Backup: React.FC = () => {
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [syncing, setSyncing] = useState(false);
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
      alert("Please provide both Supabase URL and Publishable Key.");
      return;
    }
    saveSyncConfig(cloudConfig);
    alert("Cloud configuration saved locally!");
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const result = await syncWithSupabase();
      setLastSync(localStorage.getItem('order_tracker_last_sync_time'));
      alert(`Sync Complete!\nUpdated: ${result.pulled}\nUploaded: ${result.pushed}`);
    } catch (err: any) {
      console.error(err);
      alert(`Sync Failed: ${err.message || 'Unknown error'}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const orders = await db.orders.toArray();
      if (orders.length === 0) {
        alert("Database is empty.");
        return;
      }
      exportToCSV(orders, `order_tracker_backup_${new Date().toISOString().split('T')[0]}.csv`);
    } catch (err) {
      alert("Export failed.");
    } finally {
      setExporting(false);
    }
  };

  // Fix: Added handleImport to handle the CSV file upload and merge records into Dexie.
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const data = await parseCSV(file);
      if (!Array.isArray(data)) {
        throw new Error("Invalid CSV format.");
      }

      let count = 0;
      for (const item of data) {
        if (!item.uuid) continue;

        // Ensure attachments are parsed back into an array if they were stringified for CSV
        if (typeof item.attachments === 'string') {
          try {
            item.attachments = JSON.parse(item.attachments);
          } catch {
            item.attachments = [];
          }
        }

        const existing = await db.orders.where('uuid').equals(item.uuid).first();
        if (existing) {
          await db.orders.update(existing.id!, item);
        } else {
          await db.orders.add(item);
        }
        count++;
      }
      alert(`Successfully imported/updated ${count} records.`);
    } catch (err: any) {
      console.error(err);
      alert(`Import failed: ${err.message}`);
    } finally {
      setImporting(false);
      if (e.target) e.target.value = '';
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in duration-500">
      <header className="text-center mb-10">
        <h2 className="text-4xl font-black text-gray-900 mb-2 tracking-tight">Cloud & Backup</h2>
        <p className="text-gray-500 font-medium">Keep your data safe across all devices.</p>
      </header>

      {/* Cloud Sync Section */}
      <section className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-gray-100">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" /></svg>
          </div>
          <div>
            <h3 className="text-2xl font-black text-gray-900 leading-tight">Supabase Synchronization</h3>
            <p className="text-sm text-gray-500 font-medium">Real-time bi-directional cloud sync.</p>
          </div>
        </div>

        <div className="space-y-4 mb-8">
          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Supabase Project URL</label>
            <input 
              type="text" 
              value={cloudConfig.url} 
              onChange={e => setCloudConfig({ ...cloudConfig, url: e.target.value })}
              className="w-full px-4 py-3 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500 shadow-inner font-medium text-sm"
              placeholder="https://xxxx.supabase.co"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Publishable Key</label>
            <input 
              type="password" 
              value={cloudConfig.publishableKey} 
              onChange={e => setCloudConfig({ ...cloudConfig, publishableKey: e.target.value })}
              className="w-full px-4 py-3 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500 shadow-inner font-medium text-sm"
              placeholder="eyJhbG... (Supabase Anon Key)"
            />
          </div>
          <button 
            onClick={handleSaveConfig}
            className="text-indigo-600 font-bold text-xs hover:underline"
          >
            Update Config
          </button>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4 pt-4 border-t border-gray-100">
          <button 
            onClick={handleSyncNow}
            disabled={syncing || !cloudConfig.url}
            className={`flex-1 w-full sm:w-auto py-4 px-8 rounded-2xl font-black text-lg shadow-lg transition-all active:scale-95 flex items-center justify-center gap-3 ${
              syncing ? 'bg-indigo-300' : 'bg-indigo-600 hover:bg-indigo-700'
            } text-white`}
          >
            {syncing ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            )}
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>
          <div className="flex-1 text-center sm:text-left">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</p>
            <p className="text-sm font-bold text-gray-700">
              {lastSync ? `Last synced: ${new Date(Number(lastSync)).toLocaleString()}` : 'Not synced yet'}
            </p>
          </div>
        </div>
      </section>

      {/* Local Export Section */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <button 
          onClick={handleExport}
          className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm hover:shadow-md transition-all flex items-center gap-4 text-left"
        >
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" strokeWidth={2.5} /></svg>
          </div>
          <div>
            <h4 className="font-black text-gray-900">Export CSV</h4>
            <p className="text-xs text-gray-500 font-medium">Download offline backup.</p>
          </div>
        </button>

        <label className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm hover:shadow-md transition-all flex items-center gap-4 text-left cursor-pointer">
          {/* Fix: Wired up onChange to handleImport to enable CSV merging. */}
          <input type="file" accept=".csv" className="hidden" onChange={handleImport} disabled={importing} />
          <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center">
            {importing ? (
              <div className="w-5 h-5 border-2 border-amber-600 border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0l-4-4m4-4v12" strokeWidth={2.5} /></svg>
            )}
          </div>
          <div>
            <h4 className="font-black text-gray-900">{importing ? 'Importing...' : 'Import File'}</h4>
            <p className="text-xs text-gray-500 font-medium">Merge from local backup.</p>
          </div>
        </label>
      </div>

      <div className="bg-indigo-900 text-white p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden">
        <div className="relative z-10">
          <h4 className="text-xl font-black mb-2">Cloud Configuration Steps:</h4>
          <ol className="text-sm font-medium opacity-80 space-y-2 list-decimal ml-4">
            <li>Create a project at <a href="https://supabase.com" target="_blank" className="underline font-bold">supabase.com</a></li>
            <li>In SQL Editor, create an 'orders' table (uuid, customer, city, material, qty, status, note, attachments, created_at, updated_at).</li>
            <li>Enable RLS or create a public policy for testing.</li>
            <li>Copy your Project URL and <strong>Publishable (Anon) Key</strong> into the fields above.</li>
          </ol>
        </div>
      </div>
    </div>
  );
};

export default Backup;
