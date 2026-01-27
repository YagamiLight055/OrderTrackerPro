
import React, { useState, useEffect } from 'react';
import { db, MasterItem } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { StorageMode } from '../types';
import { initSupabase } from '../services/syncService';

interface ManagerProps {
  mode: StorageMode;
  title: string;
  table: any;
  tableName: string;
  placeholder: string;
  icon: React.ReactNode;
}

const MasterListManager: React.FC<ManagerProps> = ({ mode, title, table, tableName, placeholder, icon }) => {
  const [newValue, setNewValue] = useState('');
  const [onlineItems, setOnlineItems] = useState<MasterItem[]>([]);
  const [loading, setLoading] = useState(false);
  
  const localItems = useLiveQuery(() => table.toArray());

  const fetchOnline = async () => {
    if (mode !== StorageMode.ONLINE) return;
    setLoading(true);
    const supabase = initSupabase();
    if (!supabase) return;
    const { data } = await supabase.from(tableName).select('*').order('name');
    if (data) setOnlineItems(data);
    setLoading(false);
  };

  useEffect(() => {
    if (mode === StorageMode.ONLINE) fetchOnline();
  }, [mode]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = newValue.trim();
    if (!val) return;

    try {
      if (mode === StorageMode.OFFLINE) {
        await table.add({ name: val });
      } else {
        const supabase = initSupabase();
        if (supabase) {
          await supabase.from(tableName).insert({ name: val });
          fetchOnline();
        }
      }
      setNewValue('');
    } catch (err) {
      alert(`"${val}" could not be added.`);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Remove this item?")) return;
    if (mode === StorageMode.OFFLINE) {
      await table.delete(id);
    } else {
      const supabase = initSupabase();
      if (supabase) {
        await supabase.from(tableName).delete().eq('id', id);
        fetchOnline();
      }
    }
  };

  const currentItems = mode === StorageMode.OFFLINE ? (localItems || []) : onlineItems;

  return (
    <div className={`bg-white rounded-3xl shadow-sm border flex flex-col h-full overflow-hidden transition-colors ${mode === StorageMode.ONLINE ? 'border-blue-100' : 'border-gray-100'}`}>
      <div className="p-6 border-b border-gray-50 bg-gray-50/30">
        <div className="flex items-center gap-3 mb-4">
          <div className={`p-2 rounded-xl ${mode === StorageMode.ONLINE ? 'bg-blue-100 text-blue-600' : 'bg-indigo-100 text-indigo-600'}`}>
            {icon}
          </div>
          <h3 className="font-black text-xl text-gray-900">{title}</h3>
        </div>
        <form onSubmit={handleAdd} className="flex gap-2">
          <input
            type="text"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder={placeholder}
            className="flex-1 px-4 py-3 bg-white border border-gray-100 rounded-2xl focus:ring-2 focus:ring-indigo-500 shadow-sm font-medium text-sm"
          />
          <button 
            type="submit"
            className={`p-3 text-white rounded-2xl transition active:scale-95 shadow-lg ${mode === StorageMode.ONLINE ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-100' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-100'}`}
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" /></svg>
          </button>
        </form>
      </div>
      
      <div className="flex-1 overflow-auto max-h-[300px] p-4">
        {loading ? (
          <p className="text-center py-10 text-blue-400 font-bold italic text-sm">Syncing lists...</p>
        ) : currentItems.length === 0 ? (
          <p className="text-center py-10 text-gray-400 font-bold italic text-sm">No items configured.</p>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {currentItems.map((item: MasterItem) => (
              <div key={item.id} className="group flex items-center justify-between p-3 bg-gray-50 rounded-2xl border border-transparent hover:border-indigo-100 hover:bg-white transition-all">
                <span className="font-bold text-gray-700">{item.name}</span>
                <button 
                  onClick={() => handleDelete(item.id!)}
                  className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const MasterData: React.FC<{ mode: StorageMode }> = ({ mode }) => {
  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
      <header className="text-center max-w-2xl mx-auto">
        <h2 className="text-3xl font-black text-gray-900 mb-2 leading-tight">Smart Catalogs</h2>
        <p className="text-gray-500 font-medium">Managing dictionaries for: <span className={mode === StorageMode.ONLINE ? 'text-blue-600 font-black' : 'text-emerald-600 font-black'}>{mode === StorageMode.ONLINE ? 'Cloud environment' : 'Local environment'}</span></p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <MasterListManager 
          mode={mode}
          title="Customers" 
          table={db.customersMaster} 
          tableName="customersMaster"
          placeholder="New customer..."
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>}
        />
        <MasterListManager 
          mode={mode}
          title="Destinations" 
          table={db.citiesMaster} 
          tableName="citiesMaster"
          placeholder="New city..."
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
        />
        <MasterListManager 
          mode={mode}
          title="Materials" 
          table={db.materialsMaster} 
          tableName="materialsMaster"
          placeholder="New material..."
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>}
        />
      </div>
    </div>
  );
};

export default MasterData;
