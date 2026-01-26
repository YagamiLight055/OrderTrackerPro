
import React, { useState } from 'react';
import { db } from '../db';
import { exportToCSV, parseCSV } from '../services/csvService';

const Backup: React.FC = () => {
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const orders = await db.orders.toArray();
      if (orders.length === 0) {
        alert("Database is currently empty.");
        return;
      }
      // Process takes a moment if many images exist
      exportToCSV(orders, `order_tracker_backup_${new Date().toISOString().split('T')[0]}.csv`);
    } catch (err) {
      console.error(err);
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
      
      const ordersToImport = data.map((item: any) => {
        let attachments: string[] = [];
        if (item.attachments) {
          try {
            // Check if attachments is stringified array or single string
            if (typeof item.attachments === 'string') {
               const trimmed = item.attachments.trim();
               if (trimmed.startsWith('[')) {
                 attachments = JSON.parse(trimmed);
               } else if (trimmed.startsWith('data:image')) {
                 attachments = [trimmed];
               }
            } else if (Array.isArray(item.attachments)) {
              attachments = item.attachments;
            }
          } catch (e) {
            console.error("Failed to parse attachments", e);
          }
        }

        return {
          customer: String(item.customer || '').trim(),
          city: String(item.city || '').trim(),
          material: String(item.material || '').trim(),
          qty: Number(item.qty || 0),
          status: String(item.status || 'Pending').trim(),
          attachments,
          createdAt: Number(item.createdAt || Date.now()),
          note: item.note ? String(item.note).trim() : undefined
        };
      }).filter(o => o.customer && o.city && o.material && o.qty > 0);

      if (confirm(`Detected ${ordersToImport.length} records. Merge with local data?`)) {
        await db.orders.bulkAdd(ordersToImport);
        alert("Import completed successfully!");
      }
    } catch (err) {
      console.error(err);
      alert("Critical: CSV Parsing Failed.");
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  const handleReset = async () => {
    if (confirm("DANGER: Wipe entire local database? This cannot be undone.")) {
      await db.orders.clear();
      alert("Local data purged.");
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-in slide-in-from-top-4 duration-500">
      <header className="text-center mb-10">
        <h2 className="text-4xl font-black text-gray-900 mb-2">Data Integrity</h2>
        <p className="text-gray-500 font-medium">Export, import, or manage your offline database.</p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <button 
          onClick={handleExport}
          disabled={exporting}
          className="group relative bg-white p-8 rounded-[2rem] shadow-xl shadow-indigo-100/30 border border-gray-100 hover:scale-[1.02] transition-all flex flex-col items-center text-center overflow-hidden disabled:opacity-50"
        >
          <div className="absolute inset-0 bg-indigo-600 translate-y-full group-hover:translate-y-0 transition-transform duration-500 opacity-[0.03]"></div>
          <div className={`w-20 h-20 ${exporting ? 'bg-indigo-600' : 'bg-indigo-100'} text-indigo-600 ${exporting ? 'text-white' : ''} rounded-3xl flex items-center justify-center mb-6 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300 shadow-inner`}>
             <svg className={`w-10 h-10 ${exporting ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
               {exporting ? (
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
               ) : (
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
               )}
             </svg>
          </div>
          <h3 className="font-black text-xl text-gray-900 mb-2">{exporting ? 'Generating...' : 'Export Data'}</h3>
          <p className="text-sm text-gray-500 leading-relaxed font-medium">Generate a secure CSV backup including all order details and optimized image data.</p>
        </button>

        <label className={`group relative bg-white p-8 rounded-[2rem] shadow-xl shadow-green-100/30 border border-gray-100 hover:scale-[1.02] transition-all flex flex-col items-center text-center cursor-pointer overflow-hidden ${importing ? 'opacity-50 cursor-not-allowed' : ''}`}>
          <input type="file" accept=".csv" onChange={handleImport} className="hidden" disabled={importing} />
          <div className="absolute inset-0 bg-green-600 translate-y-full group-hover:translate-y-0 transition-transform duration-500 opacity-[0.03]"></div>
          <div className={`w-20 h-20 ${importing ? 'bg-green-600' : 'bg-green-100'} text-green-600 ${importing ? 'text-white' : ''} rounded-3xl flex items-center justify-center mb-6 group-hover:bg-green-600 group-hover:text-white transition-all duration-300 shadow-inner`}>
             <svg className={`w-10 h-10 ${importing ? 'animate-bounce' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0l-4 4m4-4v12" /></svg>
          </div>
          <h3 className="font-black text-xl text-gray-900 mb-2">{importing ? 'Importing...' : 'Import Backup'}</h3>
          <p className="text-sm text-gray-500 leading-relaxed font-medium">Restore or merge an existing CSV file into your local database.</p>
        </label>
      </div>

      <div className="bg-red-50 p-8 rounded-[2rem] border border-red-100 mt-8 relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex-1">
            <h3 className="text-red-900 font-black text-xl mb-1">Advanced: Database Purge</h3>
            <p className="text-sm text-red-700/80 font-medium">Instantly remove all records stored on this device. Use with absolute caution.</p>
          </div>
          <button
            onClick={handleReset}
            className="px-8 py-4 bg-red-600 text-white rounded-2xl font-black hover:bg-red-700 transition shadow-lg shadow-red-200 active:scale-95 whitespace-nowrap"
          >
            Reset Everything
          </button>
        </div>
      </div>

      <div className="bg-indigo-900 text-white p-6 rounded-3xl shadow-xl flex items-center gap-4">
        <div className="text-3xl">💡</div>
        <p className="text-sm font-bold opacity-90 italic">Pro Tip: Images are optimized before storage to keep your database fast and your exports reliable!</p>
      </div>
    </div>
  );
};

export default Backup;
