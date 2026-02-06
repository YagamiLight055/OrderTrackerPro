
import React, { useState, useMemo, useEffect } from 'react';
import { db, Order, Shipment } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { StorageMode } from '../types';
import { getOrders, deleteOrder } from '../services/orderService';
import { getShipments } from '../services/shipmentService';
import { initSupabase } from '../services/syncService';

interface Props {
  mode: StorageMode;
  onEdit: (id: number) => void;
}

const STATUS_OPTIONS = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];

const getStatusColor = (status: string) => {
  switch (status) {
    case 'Pending': return 'bg-yellow-50 text-yellow-600 border-yellow-100';
    case 'Processing': return 'bg-blue-50 text-blue-600 border-blue-100';
    case 'Shipped': return 'bg-indigo-50 text-indigo-600 border-indigo-100';
    case 'Delivered': return 'bg-green-50 text-green-600 border-green-100';
    case 'Cancelled': return 'bg-red-50 text-red-600 border-red-100';
    default: return 'bg-gray-50 text-gray-600 border-gray-100';
  }
};

const OrdersList: React.FC<Props> = ({ mode, onEdit }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCity, setFilterCity] = useState('');
  const [filterCustomer, setFilterCustomer] = useState('');
  const [filterMaterial, setFilterMaterial] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isFilterExpanded, setIsFilterExpanded] = useState(false);
  
  const [onlineOrders, setOnlineOrders] = useState<Order[]>([]);
  const [onlineShipments, setOnlineShipments] = useState<Shipment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRealtimeActive, setIsRealtimeActive] = useState(false);
  const [galleryState, setGalleryState] = useState<{ images: string[], index: number } | null>(null);

  const localOrders = useLiveQuery(() => 
    db.orders.reverse().sortBy('orderDate')
  );
  const localShipments = useLiveQuery(() => db.shipments.toArray());

  const fetchOnline = async () => {
    if (mode !== StorageMode.ONLINE) return;
    setIsLoading(true);
    try {
      const [ordersData, shipmentsData] = await Promise.all([
        getOrders(StorageMode.ONLINE),
        getShipments(StorageMode.ONLINE)
      ]);
      setOnlineOrders(ordersData);
      setOnlineShipments(shipmentsData);
    } catch (err) {
      console.error("Fetch Online Error:", err);
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
        .channel('public:orders_list_realtime_v3')
        .on('postgres_changes', { event: '*', table: 'orders', schema: 'public' }, () => fetchOnline())
        .on('postgres_changes', { event: '*', table: 'shipments', schema: 'public' }, () => fetchOnline())
        .subscribe((status) => {
          setIsRealtimeActive(status === 'SUBSCRIBED');
        });

      return () => {
        supabase.removeChannel(channel);
        setIsRealtimeActive(false);
      };
    } else {
      setOnlineOrders([]);
      setOnlineShipments([]);
      setIsRealtimeActive(false);
    }
  }, [mode]);

  const activeOrders = mode === StorageMode.OFFLINE ? (localOrders || []) : onlineOrders;
  const activeShipments = mode === StorageMode.OFFLINE ? (localShipments || []) : onlineShipments;

  // Identify which orders are already bundled in a shipment
  const bundledOrderUuids = useMemo(() => {
    const uuids = new Set<string>();
    activeShipments.forEach(s => {
      if (s.orderUuids && Array.isArray(s.orderUuids)) {
        s.orderUuids.forEach(u => uuids.add(u));
      }
    });
    return uuids;
  }, [activeShipments]);

  // Filter out the bundled orders from the History view
  const availableOrders = useMemo(() => {
    return activeOrders.filter(o => !bundledOrderUuids.has(o.uuid));
  }, [activeOrders, bundledOrderUuids]);

  const cities = useMemo(() => Array.from(new Set(availableOrders.map(o => o.city.trim()))).sort() as string[], [availableOrders]);
  const customers = useMemo(() => Array.from(new Set(availableOrders.map(o => o.customer.trim()))).sort() as string[], [availableOrders]);
  const materials = useMemo(() => Array.from(new Set(availableOrders.map(o => o.material.trim()))).sort() as string[], [availableOrders]);

  const filteredOrders = useMemo(() => {
    return availableOrders.filter(o => {
      const searchStr = searchTerm.toLowerCase().trim();
      const matchesSearch = !searchStr || 
        o.customer.toLowerCase().includes(searchStr) ||
        o.city.toLowerCase().includes(searchStr) ||
        o.material.toLowerCase().includes(searchStr) ||
        (o.lrNo && o.lrNo.toLowerCase().includes(searchStr)) ||
        (o.vehicleNo && o.vehicleNo.toLowerCase().includes(searchStr)) ||
        (o.orderNo && o.orderNo.toLowerCase().includes(searchStr));
      
      const matchesCity = !filterCity || o.city.trim() === filterCity;
      const matchesCustomer = !filterCustomer || o.customer.trim() === filterCustomer;
      const matchesMaterial = !filterMaterial || o.material.trim() === filterMaterial;
      const matchesStatus = !filterStatus || o.status === filterStatus;
      
      const orderDate = new Date(o.orderDate).setHours(0,0,0,0);
      const start = startDate ? new Date(startDate).setHours(0,0,0,0) : null;
      const end = endDate ? new Date(endDate).setHours(23,59,59,999) : null;

      const matchesStart = !start || orderDate >= start;
      const matchesEnd = !end || orderDate <= end;

      return matchesSearch && matchesCity && matchesCustomer && matchesMaterial && matchesStatus && matchesStart && matchesEnd;
    });
  }, [availableOrders, searchTerm, filterCity, filterCustomer, filterMaterial, filterStatus, startDate, endDate]);

  const hasActiveFilters = filterCity || filterCustomer || filterMaterial || filterStatus || startDate || endDate;

  const handleDelete = async (order: Order) => {
    if (confirm(`Delete record for ${order.customer}?`)) {
      try {
        await deleteOrder(mode, order.id!, order.uuid);
        if (mode === StorageMode.ONLINE) fetchOnline(); 
      } catch (err: any) {
        alert("Delete failed: " + err.message);
      }
    }
  };

  return (
    <div className="space-y-6">
      {mode === StorageMode.ONLINE && (
        <div className="flex justify-center -mt-2">
           <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${isRealtimeActive ? 'bg-blue-50 border-blue-100 text-blue-600' : 'bg-red-50 border-red-100 text-red-600'}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${isRealtimeActive ? 'bg-blue-600 animate-pulse' : 'bg-red-500'}`}></div>
              {isRealtimeActive ? 'Live Supabase Connection' : 'Realtime Disconnected'}
           </div>
        </div>
      )}

      <div className="bg-white p-4 md:p-6 rounded-[2rem] shadow-sm border border-gray-100 sticky top-[80px] z-30 space-y-4">
        <div className="flex flex-col md:flex-row gap-3 items-center">
          <div className="relative flex-1 w-full">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </span>
            <input
              type="text"
              placeholder={`Search Active History...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500 shadow-inner font-bold text-gray-900"
            />
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <button 
              onClick={() => setIsFilterExpanded(!isFilterExpanded)}
              className={`flex-1 md:flex-none px-6 py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all border ${isFilterExpanded ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100' : 'bg-white text-gray-500 border-gray-100 hover:bg-gray-50'}`}
            >
              <svg className={`w-4 h-4 transition-transform duration-300 ${isFilterExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M19 9l-7 7-7-7" /></svg>
              Refine {hasActiveFilters && <span className="w-2 h-2 rounded-full bg-red-500"></span>}
            </button>
            {mode === StorageMode.ONLINE && (
              <button onClick={fetchOnline} disabled={isLoading} className="p-3.5 bg-blue-50 text-blue-600 rounded-2xl hover:bg-blue-100 transition-colors border border-blue-100">
                <svg className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              </button>
            )}
            {(hasActiveFilters || searchTerm) && (
              <button onClick={() => { setSearchTerm(''); setFilterCity(''); setFilterCustomer(''); setFilterMaterial(''); setFilterStatus(''); setStartDate(''); setEndDate(''); }} className="p-3.5 bg-gray-50 text-gray-400 rounded-2xl border border-gray-100"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M6 18L18 6M6 6l12 12" /></svg></button>
            )}
          </div>
        </div>

        {isFilterExpanded && (
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 pt-4 border-t border-gray-50 animate-in slide-in-from-top-4">
            <div className="flex flex-col">
               <label className="text-[9px] font-black text-gray-400 uppercase mb-1 ml-1 tracking-widest">Customer</label>
               <select value={filterCustomer} onChange={(e) => setFilterCustomer(e.target.value)} className="px-3 py-2 bg-gray-50 border rounded-xl text-[11px] font-bold outline-none">
                  <option value="">All Clients</option>
                  {customers.map(c => <option key={c} value={c}>{c}</option>)}
               </select>
            </div>
            <div className="flex flex-col">
               <label className="text-[9px] font-black text-gray-400 uppercase mb-1 ml-1 tracking-widest">Status</label>
               <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-3 py-2 bg-gray-50 border rounded-xl text-[11px] font-bold outline-none">
                  <option value="">All Status</option>
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
               </select>
            </div>
            <div className="flex flex-col">
               <label className="text-[9px] font-black text-gray-400 uppercase mb-1 ml-1 tracking-widest">Location</label>
               <select value={filterCity} onChange={(e) => setFilterCity(e.target.value)} className="px-3 py-2 bg-gray-50 border rounded-xl text-[11px] font-bold outline-none">
                  <option value="">All Cities</option>
                  {cities.map(c => <option key={c} value={c}>{c}</option>)}
               </select>
            </div>
            <div className="flex flex-col">
               <label className="text-[9px] font-black text-gray-400 uppercase mb-1 ml-1 tracking-widest">Material</label>
               <select value={filterMaterial} onChange={(e) => setFilterMaterial(e.target.value)} className="px-3 py-2 bg-gray-50 border rounded-xl text-[11px] font-bold outline-none">
                  <option value="">All Items</option>
                  {materials.map(m => <option key={m} value={m}>{m}</option>)}
               </select>
            </div>
            <div className="flex flex-col">
               <label className="text-[9px] font-black text-gray-400 uppercase mb-1 ml-1 tracking-widest">Start Date</label>
               <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="px-3 py-2 bg-gray-50 border rounded-xl text-[11px] font-bold outline-none" />
            </div>
            <div className="flex flex-col">
               <label className="text-[9px] font-black text-gray-400 uppercase mb-1 ml-1 tracking-widest">End Date</label>
               <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="px-3 py-2 bg-gray-50 border rounded-xl text-[11px] font-bold outline-none" />
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredOrders.length === 0 ? (
          <div className="col-span-full py-32 text-center bg-white rounded-[3rem] border-4 border-dashed border-gray-100">
            <p className="text-gray-300 font-black text-2xl italic uppercase tracking-tighter">History is Empty</p>
          </div>
        ) : (
          filteredOrders.map(order => (
            <div key={order.uuid} className="bg-white rounded-[2.5rem] p-6 shadow-sm border border-gray-100 hover:shadow-2xl transition-all flex flex-col group relative overflow-hidden">
               <div className="flex justify-between items-start mb-4">
                  <div className="flex-1 min-w-0">
                    <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border mb-2 inline-block ${getStatusColor(order.status)}`}>{order.status}</span>
                    <h3 className="text-xl font-black text-gray-900 truncate leading-none mb-1">{order.customer}</h3>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{new Date(order.orderDate).toLocaleDateString()}</p>
                  </div>
                  <div className="bg-gray-50 rounded-2xl p-3 text-center min-w-[65px]">
                    <span className="block text-[10px] text-gray-400 font-black uppercase">Qty</span>
                    <span className="block text-xl font-black text-gray-900 leading-none mt-1">{order.qty}</span>
                  </div>
               </div>

               <div className="flex-1 space-y-3 mb-6">
                  <div className="flex items-center gap-2">
                    <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /></svg>
                    <span className="text-[11px] font-bold text-gray-500 uppercase tracking-tight">{order.city}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4" /></svg>
                    <span className="text-[11px] font-bold text-gray-500 uppercase tracking-tight">{order.material}</span>
                  </div>
               </div>

               {order.attachments && order.attachments.length > 0 && (
                 <div className="flex gap-2 mb-6">
                    {order.attachments.slice(0, 3).map((img, i) => (
                       <div key={i} onClick={() => setGalleryState({ images: order.attachments!, index: i })} className="w-10 h-10 rounded-xl overflow-hidden border-2 border-white shadow-sm flex-shrink-0 cursor-zoom-in">
                          <img src={img} className="w-full h-full object-cover" alt="proof" />
                       </div>
                    ))}
                 </div>
               )}

               <div className="flex gap-2 pt-6 border-t border-gray-50">
                  <button onClick={() => onEdit(order.id!)} className="flex-1 py-3 bg-indigo-50 text-indigo-600 rounded-xl font-black uppercase tracking-widest text-[9px] hover:bg-indigo-600 hover:text-white transition-all">Edit</button>
                  <button onClick={() => handleDelete(order)} className="p-3 bg-red-50 text-red-600 rounded-xl hover:bg-red-600 hover:text-white transition-all"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
               </div>
            </div>
          ))
        )}
      </div>

      {galleryState && (
        <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-xl flex flex-col items-center justify-center p-4 animate-in fade-in" onClick={() => setGalleryState(null)}>
           <img src={galleryState.images[galleryState.index]} className="max-w-full max-h-[80vh] object-contain rounded-2xl shadow-2xl" alt="Full view" />
           <div className="mt-8 flex gap-4">
              <button onClick={(e) => { e.stopPropagation(); setGalleryState(null); }} className="px-10 py-4 bg-white text-gray-900 rounded-full font-black uppercase tracking-widest text-xs">Close</button>
           </div>
        </div>
      )}
    </div>
  );
};

export default OrdersList;
