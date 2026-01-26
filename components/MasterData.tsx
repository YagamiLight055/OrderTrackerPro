
import React, { useState } from 'react';
import { db, MasterItem } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';

const MasterListManager: React.FC<{ 
  title: string, 
  table: any, 
  placeholder: string,
  icon: React.ReactNode
}> = ({ title, table, placeholder, icon }) => {
  const [newValue, setNewValue] = useState('');
  const items = useLiveQuery(() => table.toArray());

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = newValue.trim();
    if (!val) return;
    try {
      await table.add({ name: val });
      setNewValue('');
    } catch (err) {
      alert(`"${val}" already exists or could not be added.`);
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm("Remove this item from quick input?")) {
      await table.delete(id);
    }
  };

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 flex flex-col h-full overflow-hidden">
      <div className="p-6 border-b border-gray-50 bg-gray-50/30">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-indigo-100 text-indigo-600 rounded-xl">
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
            className="p-3 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 transition active:scale-95 shadow-lg shadow-indigo-100"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" /></svg>
          </button>
        </form>
      </div>
      
      <div className="flex-1 overflow-auto max-h-[300px] p-4">
        {!items || items.length === 0 ? (
          <p className="text-center py-10 text-gray-400 font-bold italic text-sm">Empty list.</p>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {items.map((item: MasterItem) => (
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

const MasterData: React.FC = () => {
  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
      <header className="text-center max-w-2xl mx-auto">
        <h2 className="text-3xl font-black text-gray-900 mb-2 leading-tight">Quick Input Management</h2>
        <p className="text-gray-500 font-medium">Pre-add frequently used values to speed up your order creation workflow.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <MasterListManager 
          title="Customers" 
          table={db.customersMaster} 
          placeholder="New customer..."
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>}
        />
        <MasterListManager 
          title="Destinations" 
          table={db.citiesMaster} 
          placeholder="New city..."
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
        />
        <MasterListManager 
          title="Materials" 
          table={db.materialsMaster} 
          placeholder="New material..."
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>}
        />
      </div>

      <div className="bg-indigo-50 p-6 rounded-3xl border border-indigo-100 flex items-start gap-4">
        <div className="text-2xl mt-1">💡</div>
        <div>
          <h4 className="font-black text-indigo-900">Consistency Matters</h4>
          <p className="text-indigo-700 text-sm font-medium leading-relaxed">
            By managing master lists, you prevent spelling variations (e.g., "Steel" vs "Steel Pipes") which ensures your <strong>Statistics</strong> remain accurate and grouped correctly.
          </p>
        </div>
      </div>
    </div>
  );
};

export default MasterData;
