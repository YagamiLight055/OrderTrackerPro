
import React, { useState, useMemo, useEffect } from 'react';
import { db, Order } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { SummaryRow, StorageMode } from '../types';
import { getOrders } from '../services/orderService';
import { initSupabase } from '../services/syncService';

interface Props {
  mode: StorageMode;
}

const STATUS_OPTIONS = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];

const Summary: React.FC<Props> = ({ mode }) => {
  const [filterCity, setFilterCity] = useState('');
  const [filterCustomer, setFilterCustomer] = useState('');
  const [filterMaterial, setFilterMaterial] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isFilterExpanded, setIsFilterExpanded] = useState(false);

  const [onlineOrders, setOnlineOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRealtimeActive, setIsRealtimeActive] = useState(false);

  // Local data is live via Dexie hooks
  const localOrders = useLiveQuery(() => db.orders.toArray());

  const fetchOnline = async () => {
    if (mode !== StorageMode.ONLINE) return;
    setIsLoading(true);
    try {
      const data = await getOrders(StorageMode.ONLINE);
      setOnlineOrders(data);
    } catch (err) {
      console.error("Summary Fetch Online Error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (mode === StorageMode.ONLINE) {
      fetchOnline();
      
      const supabase = initSupabase();
      if (!supabase) return;

      const channel = supabase
        .channel('public:orders_summary_realtime')
        .on(
          'postgres_changes',
          { event: '*', table: 'orders', schema: 'public' },
          () => fetchOnline()
        )
        .subscribe((status) => {
          setIsRealtimeActive(status === 'SUBSCRIBED');
        });

      return () => {
        supabase.removeChannel(channel);
        setIsRealtimeActive(false);
      };
    } else {
      setOnlineOrders([]);
      setIsRealtimeActive(false);
    }
  }, [mode]);

  const activeOrders = mode === StorageMode.OFFLINE ? (localOrders || []) : onlineOrders;

  const filteredOrders = useMemo(() => {
    return activeOrders.filter(o => {
      const cityMatch = !filterCity || o.city.trim() === filterCity;
      const customerMatch = !filterCustomer || o.customer.trim() === filterCustomer;
      const materialMatch = !filterMaterial || o.material.trim() === filterMaterial;
      const statusMatch = !filterStatus || o.status === filterStatus;
      
      const orderDate = new Date(o.createdAt).setHours(0,0,0,0);
      const start = startDate ? new Date(startDate).setHours(0,0,0,0) : null;
      const end = endDate ? new Date(endDate).setHours(23,59,59,999) : null;
      
      const matchesStart = !start || orderDate >= start;
      const matchesEnd = !end || orderDate <= end;

      return cityMatch && customerMatch && materialMatch && statusMatch && matchesStart && matchesEnd;
    });
  }, [activeOrders, filterCity, filterCustomer, filterMaterial, filterStatus, startDate, endDate]);

  const summaryData = useMemo(() => {
    const groups: Record<string, SummaryRow> = {};
    filteredOrders.forEach(o => {
      const key = `${o.city.trim()}|${o.customer.trim()}|${o.material.trim()}`;
      if (!groups[key]) {
        groups[key] = {
          city: o.city.trim(),
          customer: o.customer.trim(),
          material: o.material.trim(),
          orderCount: 0,
          totalQty: 0
        };
      }
      groups[key].orderCount += 1;
      groups[key].totalQty += o.qty;
    });
    return Object.values(groups).sort((a, b) => b.totalQty - a.totalQty);
  }, [filteredOrders]);

  const stats = useMemo(() => {
    return {
      totalOrders: filteredOrders.length,
      totalQty: filteredOrders.reduce((sum, o) => sum + o.qty, 0),
      uniqueCustomers: new Set(filteredOrders.map(o => o.customer.trim())).size
    };
  }, [filteredOrders]);

  const cities = useMemo(() => Array.from(new Set(activeOrders.map(o => o.city.trim()))).sort() as string[], [activeOrders]);
  const customers = useMemo(() => Array.from(new Set(activeOrders.map(o => o.customer.trim()))).sort() as string[], [activeOrders]);
  const materials = useMemo(() => Array.from(new Set(activeOrders.map(o => o.material.trim()))).sort() as string[], [activeOrders]);

  const hasActiveFilters = filterCity || filterCustomer || filterMaterial || filterStatus || startDate || endDate;

  if (isLoading && onlineOrders.length === 0) return <div className="p-12 text-center text-blue-600 font-black animate-pulse">Calculating Cloud Realtime Stats...</div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {mode === StorageMode.ONLINE && (
        <div className="flex justify-center -mt-2">
           <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${isRealtimeActive ? 'bg-blue-50 border-blue-100 text-blue-600' : 'bg-red-50 border-red-100 text-red-600'}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${isRealtimeActive ? 'bg-blue-600 animate-pulse' : 'bg-red-500'}`}></div>
              {isRealtimeActive ? 'Live Realtime Metrics' : 'Metrics Offline'}
           </div>
        </div>
      )}

      {/* Compact Stat Cards */}
      <div className="grid grid-cols-3 gap-3 md:gap-4">
        <div className="bg-white p-3 md:p-5 rounded-2xl md:rounded-3xl shadow-sm border border-gray-50 transition-all hover:shadow-lg flex flex-col justify-center">
          <p className="text-[8px] md:text-[10px] font-black uppercase tracking-widest text-gray-400 mb-0.5 md:mb-1">Orders</p>
          <p className={`text-xl md:text-3xl font-black leading-none ${mode === StorageMode.ONLINE ? 'text-blue-600' : 'text-indigo-600'}`}>{stats.totalOrders}</p>
        </div>
        <div className="bg-white p-3 md:p-5 rounded-2xl md:rounded-3xl shadow-sm border border-gray-50 transition-all hover:shadow-lg flex flex-col justify-center">
          <p className="text-[8px] md:text-[10px] font-black uppercase tracking-widest text-gray-400 mb-0.5 md:mb-1">Total Qty</p>
          <p className={`text-xl md:text-3xl font-black leading-none ${mode === StorageMode.ONLINE ? 'text-blue-600' : 'text-indigo-600'}`}>{stats.totalQty >= 1000000 ? (stats.totalQty / 1000000).toFixed(1) + 'M' : stats.totalQty.toLocaleString()}</p>
        </div>
        <div className="bg-white p-3 md:p-5 rounded-2xl md:rounded-3xl shadow-sm border border-gray-50 transition-all hover:shadow-lg flex flex-col justify-center">
          <p className="text-[8px] md:text-[10px] font-black uppercase tracking-widest text-gray-400 mb-0.5 md:mb-1">Clients</p>
          <p className={`text-xl md:text-3xl font-black leading-none ${mode === StorageMode.ONLINE ? 'text-blue-600' : 'text-indigo-600'}`}>{stats.uniqueCustomers}</p>
        </div>
      </div>

      {/* Collapsible Filter Section */}
      <div className="bg-white p-4 md:p-5 rounded-[2rem] shadow-sm border border-gray-100 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <button 
            onClick={() => setIsFilterExpanded(!isFilterExpanded)}
            className={`px-5 py-3 rounded-2xl font-black text-[10px] md:text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all border ${isFilterExpanded ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100' : 'bg-white text-gray-500 border-gray-100 hover:bg-gray-50'}`}
          >
            <svg className={`w-4 h-4 transition-transform duration-300 ${isFilterExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M19 9l-7 7-7-7" /></svg>
            Refine Analysis {hasActiveFilters && <span className="w-2 h-2 rounded-full bg-red-500"></span>}
          </button>
          
          {hasActiveFilters && (
            <button 
              onClick={() => { setFilterCity(''); setFilterCustomer(''); setFilterMaterial(''); setFilterStatus(''); setStartDate(''); setEndDate(''); }} 
              className="px-4 py-3 bg-gray-50 text-gray-400 rounded-xl hover:text-red-600 hover:bg-red-50 transition-colors border border-gray-100 text-[10px] font-black uppercase tracking-widest"
            >
              Clear
            </button>
          )}
        </div>

        {isFilterExpanded && (
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 pt-4 border-t border-gray-50 animate-in slide-in-from-top-4 duration-300">
            <div className="flex flex-col">
               <label className="text-[9px] font-black text-gray-400 uppercase mb-1 ml-1 tracking-widest">Customer</label>
               <select value={filterCustomer} onChange={(e) => setFilterCustomer(e.target.value)} className="px-3 py-2 bg-gray-50 border border-transparent rounded-xl text-[11px] font-bold shadow-sm focus:bg-white focus:border-indigo-100 outline-none cursor-pointer">
                  <option value="">All Clients</option>
                  {customers.map(c => <option key={c} value={c}>{c}</option>)}
               </select>
            </div>
            <div className="flex flex-col">
               <label className="text-[9px] font-black text-gray-400 uppercase mb-1 ml-1 tracking-widest">Status</label>
               <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-3 py-2 bg-gray-50 border border-transparent rounded-xl text-[11px] font-bold shadow-sm focus:bg-white focus:border-indigo-100 outline-none cursor-pointer">
                  <option value="">All Statuses</option>
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
               </select>
            </div>
            <div className="flex flex-col">
               <label className="text-[9px] font-black text-gray-400 uppercase mb-1 ml-1 tracking-widest">Location</label>
               <select value={filterCity} onChange={(e) => setFilterCity(e.target.value)} className="px-3 py-2 bg-gray-50 border border-transparent rounded-xl text-[11px] font-bold shadow-sm focus:bg-white focus:border-indigo-100 outline-none cursor-pointer">
                  <option value="">All Cities</option>
                  {cities.map(c => <option key={c} value={c}>{c}</option>)}
               </select>
            </div>
            <div className="flex flex-col">
               <label className="text-[9px] font-black text-gray-400 uppercase mb-1 ml-1 tracking-widest">Material</label>
               <select value={filterMaterial} onChange={(e) => setFilterMaterial(e.target.value)} className="px-3 py-2 bg-gray-50 border border-transparent rounded-xl text-[11px] font-bold shadow-sm focus:bg-white focus:border-indigo-100 outline-none cursor-pointer">
                  <option value="">All Materials</option>
                  {materials.map(m => <option key={m} value={m}>{m}</option>)}
               </select>
            </div>
            <div className="flex flex-col">
               <label className="text-[9px] font-black text-gray-400 uppercase mb-1 ml-1 tracking-widest">From</label>
               <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="px-3 py-2 bg-gray-50 border border-transparent rounded-xl text-[11px] font-bold shadow-sm focus:bg-white focus:border-indigo-100 outline-none" />
            </div>
            <div className="flex flex-col">
               <label className="text-[9px] font-black text-gray-400 uppercase mb-1 ml-1 tracking-widest">To</label>
               <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="px-3 py-2 bg-gray-50 border border-transparent rounded-xl text-[11px] font-bold shadow-sm focus:bg-white focus:border-indigo-100 outline-none" />
            </div>
          </div>
        )}
      </div>

      <div className="bg-white p-6 rounded-[2.5rem] shadow-xl shadow-gray-200/30 border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-50">
                <th className="pb-4 px-2 text-[10px] font-black uppercase tracking-widest text-gray-400">Location</th>
                <th className="pb-4 px-2 text-[10px] font-black uppercase tracking-widest text-gray-400">Customer</th>
                <th className="pb-4 px-2 text-[10px] font-black uppercase tracking-widest text-gray-400 text-center">Material</th>
                <th className="pb-4 px-2 text-[10px] font-black uppercase tracking-widest text-gray-400 text-center">Orders</th>
                <th className="pb-4 px-2 text-[10px] font-black uppercase tracking-widest text-gray-400 text-right">Qty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {summaryData.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-20 text-center text-gray-300 font-bold italic">No matching groups found.</td>
                </tr>
              ) : (
                summaryData.map((row, idx) => (
                  <tr key={idx} className="group hover:bg-indigo-50/50 transition-colors">
                    <td className="py-4 px-2 text-sm font-bold text-gray-500">{row.city}</td>
                    <td className="py-4 px-2 text-sm font-black text-gray-900">{row.customer}</td>
                    <td className="py-4 px-2 text-sm text-center">
                      <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-[10px] font-black uppercase">{row.material}</span>
                    </td>
                    <td className="py-4 px-2 text-sm text-center font-bold text-gray-400">{row.orderCount}</td>
                    <td className={`py-4 px-2 text-sm text-right font-black ${mode === StorageMode.ONLINE ? 'text-blue-600' : 'text-indigo-600'}`}>{row.totalQty.toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Summary;
