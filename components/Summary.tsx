
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-50 transition-all hover:shadow-lg">
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Total Orders</p>
          <p className={`text-3xl font-black ${mode === StorageMode.ONLINE ? 'text-blue-600' : 'text-indigo-600'}`}>{stats.totalOrders}</p>
        </div>
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-50 transition-all hover:shadow-lg">
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Accumulated Qty</p>
          <p className={`text-3xl font-black ${mode === StorageMode.ONLINE ? 'text-blue-600' : 'text-indigo-600'}`}>{stats.totalQty.toLocaleString()}</p>
        </div>
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-50 transition-all hover:shadow-lg">
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Unique Clients</p>
          <p className={`text-3xl font-black ${mode === StorageMode.ONLINE ? 'text-blue-600' : 'text-indigo-600'}`}>{stats.uniqueCustomers}</p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-[2rem] shadow-xl shadow-gray-200/40 border border-gray-100 space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          <div className="flex flex-col">
             <label className="text-[10px] font-black text-gray-400 uppercase mb-1 ml-1">Customer</label>
             <select value={filterCustomer} onChange={(e) => setFilterCustomer(e.target.value)} className="px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="">All Customers</option>
                {customers.map(c => <option key={c} value={c}>{c}</option>)}
             </select>
          </div>
          <div className="flex flex-col">
             <label className="text-[10px] font-black text-gray-400 uppercase mb-1 ml-1">Status</label>
             <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="">All Statuses</option>
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
             </select>
          </div>
          <div className="flex flex-col">
             <label className="text-[10px] font-black text-gray-400 uppercase mb-1 ml-1">Location</label>
             <select value={filterCity} onChange={(e) => setFilterCity(e.target.value)} className="px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="">All Cities</option>
                {cities.map(c => <option key={c} value={c}>{c}</option>)}
             </select>
          </div>
          <div className="flex flex-col">
             <label className="text-[10px] font-black text-gray-400 uppercase mb-1 ml-1">Material</label>
             <select value={filterMaterial} onChange={(e) => setFilterMaterial(e.target.value)} className="px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="">All Materials</option>
                {materials.map(m => <option key={m} value={m}>{m}</option>)}
             </select>
          </div>
          <div className="flex flex-col">
             <label className="text-[10px] font-black text-gray-400 uppercase mb-1 ml-1">From</label>
             <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div className="flex flex-col">
             <label className="text-[10px] font-black text-gray-400 uppercase mb-1 ml-1">To</label>
             <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-[2rem] shadow-xl shadow-gray-200/40 border border-gray-100 overflow-hidden">
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
