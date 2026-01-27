
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { db, Order, Shipment } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { StorageMode } from '../types';
import { getShipments, saveShipment, deleteShipment } from '../services/shipmentService';
import { getOrders } from '../services/orderService';
import { initSupabase } from '../services/syncService';

interface Props {
  mode: StorageMode;
}

const Archive: React.FC<Props> = ({ mode }) => {
  const [isCreating, setIsCreating] = useState(false);
  const [selectedOrderUuids, setSelectedOrderUuids] = useState<Set<string>>(new Set());
  const [reference, setReference] = useState('');
  const [dispatchDate, setDispatchDate] = useState(new Date().toISOString().split('T')[0]);
  const [note, setNote] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [isProcessingImages, setIsProcessingImages] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Online data states
  const [onlineShipments, setOnlineShipments] = useState<Shipment[]>([]);
  const [onlineOrders, setOnlineOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Filter states
  const [filterRef, setFilterRef] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [isFilterExpanded, setIsFilterExpanded] = useState(false);

  // Local data
  const localOrders = useLiveQuery(() => db.orders.toArray());
  const localShipments = useLiveQuery(() => db.shipments.toArray());

  const fetchOnlineData = async () => {
    if (mode !== StorageMode.ONLINE) return;
    setIsLoading(true);
    try {
      const [shipmentsData, ordersData] = await Promise.all([
        getShipments(StorageMode.ONLINE),
        getOrders(StorageMode.ONLINE)
      ]);
      setOnlineShipments(shipmentsData || []);
      setOnlineOrders(ordersData || []);
    } catch (err) {
      console.error("Archive Fetch Error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (mode === StorageMode.ONLINE) {
      fetchOnlineData();
      const supabase = initSupabase();
      if (supabase) {
        // Fix: Use 'postgres_changes' as a literal type and include 'schema' to satisfy overloads
        const channel = supabase.channel('archive_realtime_v3_fixed_v2')
          .on(
            'postgres_changes' as any, 
            { event: '*', table: 'shipments', schema: 'public' }, 
            () => fetchOnlineData()
          )
          .on(
            'postgres_changes' as any, 
            { event: '*', table: 'orders', schema: 'public' }, 
            () => fetchOnlineData()
          )
          .subscribe();
        return () => { supabase.removeChannel(channel); };
      }
    }
  }, [mode]);

  const activeShipments: Shipment[] = mode === StorageMode.OFFLINE ? (localShipments || []) : onlineShipments;
  const activeOrders: Order[] = mode === StorageMode.OFFLINE ? (localOrders || []) : onlineOrders;

  const availableOrders = useMemo(() => {
    const archivedUuids = new Set<string>();
    activeShipments.forEach(s => {
      if (s.orderUuids && Array.isArray(s.orderUuids)) {
        s.orderUuids.forEach(uuid => archivedUuids.add(uuid));
      }
    });
    return activeOrders.filter(o => !archivedUuids.has(o.uuid));
  }, [activeOrders, activeShipments]);

  const filteredShipments = useMemo(() => {
    return activeShipments.filter(s => {
      const matchesRef = !filterRef || s.reference.toLowerCase().includes(filterRef.toLowerCase());
      
      const sDate = new Date(s.dispatchDate).setHours(0,0,0,0);
      const start = filterStartDate ? new Date(filterStartDate).setHours(0,0,0,0) : null;
      const end = filterEndDate ? new Date(filterEndDate).setHours(23,59,59,999) : null;

      const matchesStart = !start || sDate >= start;
      const matchesEnd = !end || sDate <= end;

      return matchesRef && matchesStart && matchesEnd;
    }).sort((a, b) => b.dispatchDate - a.dispatchDate);
  }, [activeShipments, filterRef, filterStartDate, filterEndDate]);

  const handleToggleOrder = (uuid: string) => {
    const next = new Set(selectedOrderUuids);
    if (next.has(uuid)) next.delete(uuid);
    else next.add(uuid);
    setSelectedOrderUuids(next);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsProcessingImages(true);
    try {
      const readFileAsDataURL = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = (error) => reject(error);
          reader.readAsDataURL(file);
        });
      };
      
      const downscaleImage = (dataUrl: string, maxWidth = 1200, quality = 0.7): Promise<string> => {
        return new Promise((resolve) => {
          const img = new Image();
          img.src = dataUrl;
          img.onload = () => {
            const canvas = document.createElement('canvas');
            let w = img.width;
            let h = img.height;
            if (w > maxWidth) {
              h = (maxWidth / w) * h;
              w = maxWidth;
            }
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', quality));
          };
          img.onerror = () => resolve(dataUrl);
        });
      };

      const fileArray: File[] = Array.from(files);
      const optimized = await Promise.all(
        fileArray.map(async (f: File) => {
          const dataUrl = await readFileAsDataURL(f);
          return downscaleImage(dataUrl);
        })
      );
      setAttachments(prev => [...prev, ...optimized]);
    } catch (err) {
      console.error("Error processing archive images", err);
    } finally {
      setIsProcessingImages(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleCreateShipment = async () => {
    if (!reference.trim() || selectedOrderUuids.size === 0 || !dispatchDate) {
      alert("Required: Reference, Dispatch Date, and at least one order.");
      return;
    }

    const newShipment: Shipment = {
      uuid: crypto.randomUUID(),
      reference: reference.trim(),
      orderUuids: Array.from(selectedOrderUuids),
      attachments,
      note: note.trim(),
      dispatchDate: new Date(`${dispatchDate}T12:00:00`).getTime(),
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    try {
      await saveShipment(mode, newShipment);
      setReference('');
      setNote('');
      setAttachments([]);
      setSelectedOrderUuids(new Set());
      setDispatchDate(new Date().toISOString().split('T')[0]);
      setIsCreating(false);
      if (mode === StorageMode.ONLINE) fetchOnlineData();
    } catch (err) {
      alert("Save failed.");
    }
  };

  const handleDeleteShipment = async (shipment: Shipment) => {
    if (confirm("Delete this archive bundle? Linked orders will return to history for re-bundling.")) {
      await deleteShipment(mode, shipment.id!, shipment.uuid);
      if (mode === StorageMode.ONLINE) fetchOnlineData();
    }
  };

  const hasActiveFilters = filterRef || filterStartDate || filterEndDate;

  if (isCreating) {
    return (
      <div className="max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500 pb-24 px-2">
        <div className="bg-white rounded-[3rem] shadow-2xl p-8 border border-gray-100 mb-8">
          <header className="mb-8 flex justify-between items-center">
            <div>
              <h2 className="text-3xl font-black text-gray-900 uppercase tracking-tighter">New Shipment</h2>
              <p className="text-gray-400 font-bold uppercase text-[10px] tracking-widest mt-1">
                {mode === StorageMode.ONLINE ? 'Supabase Live' : 'Standalone Local'} Mode
              </p>
            </div>
            <button onClick={() => setIsCreating(false)} className="text-gray-400 hover:text-gray-900 transition-colors">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </header>

          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Shipment Reference (Truck/CNTR)</label>
                <input
                  type="text"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className="w-full px-6 py-4 bg-gray-50 border-none rounded-2xl shadow-inner font-black text-lg focus:ring-2 focus:ring-indigo-500 transition-all"
                  placeholder="Ex: T-402-B"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Actual Dispatch Date</label>
                <input
                  type="date"
                  value={dispatchDate}
                  onChange={(e) => setDispatchDate(e.target.value)}
                  className="w-full px-6 py-4 bg-gray-50 border-none rounded-2xl shadow-inner font-bold outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
               <div className="flex flex-col">
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 ml-1">Select Orders ({selectedOrderUuids.size})</label>
                  <div className="bg-gray-50 rounded-[2.5rem] p-4 h-[400px] overflow-auto shadow-inner space-y-2 border border-gray-100 custom-scrollbar">
                     {availableOrders.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center p-8">
                           <p className="text-gray-300 font-black text-lg italic uppercase tracking-widest">No available orders</p>
                           <p className="text-gray-400 text-[10px] font-bold uppercase mt-2">All orders are already in shipments.</p>
                        </div>
                     ) : (
                        availableOrders.map(order => (
                           <div 
                             key={order.uuid} 
                             onClick={() => handleToggleOrder(order.uuid)}
                             className={`p-5 rounded-[1.75rem] cursor-pointer transition-all border-2 flex items-center gap-4 ${selectedOrderUuids.has(order.uuid) ? 'bg-indigo-600 border-indigo-600 shadow-xl' : 'bg-white border-transparent hover:border-indigo-100'}`}
                           >
                              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${selectedOrderUuids.has(order.uuid) ? 'bg-white border-white' : 'border-gray-200'}`}>
                                 {selectedOrderUuids.has(order.uuid) && <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={5}><path d="M5 13l4 4L19 7" /></svg>}
                              </div>
                              <div className="flex-1 truncate">
                                 <p className={`text-sm font-black ${selectedOrderUuids.has(order.uuid) ? 'text-white' : 'text-gray-900'}`}>{order.customer}</p>
                                 <p className={`text-[10px] font-bold uppercase tracking-widest ${selectedOrderUuids.has(order.uuid) ? 'text-indigo-100' : 'text-gray-400'}`}>{order.city} • {order.qty} units</p>
                              </div>
                           </div>
                        ))
                     )}
                  </div>
               </div>

               <div className="space-y-8">
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 ml-1">Loading Proof Photos</label>
                    <div className="grid grid-cols-3 gap-4">
                      {attachments.map((src, idx) => (
                        <div key={idx} className="relative aspect-square rounded-[1.5rem] overflow-hidden border-2 border-white shadow-lg group">
                          <img src={src} className="w-full h-full object-cover" alt="proof" />
                          <button 
                            type="button"
                            onClick={() => setAttachments(p => p.filter((_, i) => i !== idx))}
                            className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-full shadow-xl opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}><path d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isProcessingImages}
                        className="aspect-square rounded-[1.5rem] border-2 border-dashed border-gray-200 text-gray-400 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-600 transition-all flex flex-col items-center justify-center shadow-inner group"
                      >
                         {isProcessingImages ? (
                           <div className="w-6 h-6 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                         ) : (
                           <>
                            <svg className="w-8 h-8 mb-1 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M12 4v16m8-8H4" /></svg>
                            <span className="text-[9px] font-black uppercase tracking-widest">Attach Proof</span>
                           </>
                         )}
                      </button>
                    </div>
                    <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" multiple />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Dispatch Notes</label>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      className="w-full px-6 py-5 bg-gray-50 border-none rounded-[2rem] shadow-inner min-h-[140px] font-medium focus:ring-2 focus:ring-indigo-500 transition-all"
                      placeholder="Driver info, carrier ID, or loading details..."
                    />
                  </div>
               </div>
            </div>

            <div className="pt-8 border-t border-gray-100 flex gap-4">
              <button 
                onClick={handleCreateShipment}
                className={`flex-1 font-black py-5 rounded-[2.25rem] shadow-2xl transition-all active:scale-95 uppercase tracking-widest text-sm ${mode === StorageMode.ONLINE ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-200' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-100'} text-white`}
              >
                Seal & Archive Bundle
              </button>
              <button onClick={() => setIsCreating(false)} className="px-12 py-5 bg-gray-100 text-gray-500 font-black rounded-[2.25rem] hover:bg-gray-200 transition-all uppercase tracking-widest text-xs">Cancel</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-6xl mx-auto pb-24 px-2">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-4xl font-black text-gray-900 uppercase tracking-tighter">Shipment Archives</h2>
          <p className="text-gray-400 font-bold uppercase text-[10px] tracking-[0.3em] mt-1">Management Hub</p>
        </div>
        <button 
          onClick={() => setIsCreating(true)}
          className={`px-8 py-5 rounded-[1.75rem] font-black uppercase tracking-widest text-xs shadow-2xl transition-all flex items-center gap-3 active:scale-95 ${mode === StorageMode.ONLINE ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-100' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-100'} text-white`}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M12 4v16m8-8H4" /></svg>
          Bundle New Shipment
        </button>
      </header>

      {/* Filter Bar */}
      <div className="bg-white p-4 md:p-6 rounded-[2.5rem] shadow-xl shadow-gray-200/40 border border-gray-100 sticky top-[84px] z-30 flex flex-col md:flex-row gap-4">
        <div className="relative flex-1 w-full">
          <span className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </span>
          <input
            type="text"
            placeholder="Search by Shipment Ref..."
            value={filterRef}
            onChange={(e) => setFilterRef(e.target.value)}
            className="w-full pl-14 pr-6 py-4 bg-gray-50 border-none rounded-2xl shadow-inner font-black text-gray-900 focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-gray-300"
          />
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setIsFilterExpanded(!isFilterExpanded)}
            className={`px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 transition-all border ${isFilterExpanded ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100' : 'bg-white text-gray-500 border-gray-100 hover:bg-gray-50'}`}
          >
            <svg className={`w-4 h-4 transition-transform duration-300 ${isFilterExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M19 9l-7 7-7-7" /></svg>
            Period {hasActiveFilters && <span className="w-2 h-2 rounded-full bg-red-500"></span>}
          </button>
          
          {mode === StorageMode.ONLINE && (
            <button 
              onClick={fetchOnlineData}
              className={`p-4 bg-blue-50 text-blue-600 rounded-2xl hover:bg-blue-100 transition-all border border-blue-100 ${isLoading ? 'animate-spin' : ''}`}
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            </button>
          )}

          {hasActiveFilters && (
            <button 
              onClick={() => { setFilterRef(''); setFilterStartDate(''); setFilterEndDate(''); }} 
              className="p-4 bg-red-50 text-red-500 rounded-2xl hover:bg-red-100 transition-all border border-red-100"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
        </div>
      </div>

      {isFilterExpanded && (
        <div className="bg-white p-6 rounded-[2.5rem] shadow-2xl shadow-indigo-100/50 border border-indigo-50 grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-top-4 duration-300">
           <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Dispatch Range (From)</label>
              <input type="date" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)} className="w-full px-5 py-4 bg-gray-50 rounded-xl font-bold border-none focus:ring-2 focus:ring-indigo-500 shadow-inner" />
           </div>
           <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Dispatch Range (To)</label>
              <input type="date" value={filterEndDate} onChange={e => setFilterEndDate(e.target.value)} className="w-full px-5 py-4 bg-gray-50 rounded-xl font-bold border-none focus:ring-2 focus:ring-indigo-500 shadow-inner" />
           </div>
        </div>
      )}

      {/* Shipment Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {isLoading && activeShipments.length === 0 ? (
          <div className="col-span-full py-32 text-center">
             <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
             <p className="text-indigo-600 font-black uppercase tracking-widest text-lg">Fetching Archives...</p>
          </div>
        ) : filteredShipments.length === 0 ? (
          <div className="col-span-full py-32 text-center bg-white rounded-[4rem] border-4 border-dashed border-gray-100">
            <div className="w-24 h-24 bg-gray-50 rounded-[2.5rem] flex items-center justify-center mx-auto mb-6 text-gray-200">
               <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
            </div>
            <p className="text-gray-300 font-black text-2xl italic uppercase tracking-tighter">No Bundles Found</p>
            <p className="text-gray-400 text-[11px] font-bold uppercase mt-2 tracking-widest">Bundle existing orders into a shipment reference.</p>
          </div>
        ) : (
          filteredShipments.map(shipment => {
             const linked = shipment.orderUuids.map(uuid => activeOrders.find(o => o.uuid === uuid)).filter(Boolean) as Order[];
             const totalQty = linked.reduce((sum, o) => sum + o.qty, 0);

             return (
               <div key={shipment.uuid} className="bg-white rounded-[3rem] p-8 shadow-sm border border-gray-50 hover:shadow-2xl hover:shadow-indigo-100/50 transition-all duration-500 flex flex-col group relative overflow-hidden">
                 <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50/30 rounded-full -mr-16 -mt-16 group-hover:bg-indigo-100/50 transition-colors"></div>
                 
                 <div className="flex justify-between items-start mb-8 relative z-10">
                    <div className="flex-1 truncate mr-4">
                       <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full mb-3 inline-block shadow-sm ${mode === StorageMode.ONLINE ? 'bg-blue-50 text-blue-600' : 'bg-indigo-50 text-indigo-600'}`}>
                         Ref: {shipment.reference}
                       </span>
                       <h3 className="text-2xl font-black text-gray-900 leading-tight truncate">{linked.length} Order{linked.length !== 1 ? 's' : ''}</h3>
                       <div className="flex items-center gap-2 mt-2">
                          <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                          <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Disp: {new Date(shipment.dispatchDate).toLocaleDateString()}</p>
                       </div>
                    </div>
                    <div className={`${mode === StorageMode.ONLINE ? 'bg-blue-600 shadow-blue-200' : 'bg-indigo-600 shadow-indigo-200'} rounded-2xl p-4 text-center min-w-[70px] shadow-xl group-hover:scale-110 transition-transform`}>
                       <span className="block text-[10px] text-white opacity-70 font-black uppercase tracking-tighter">Units</span>
                       <span className="block text-2xl font-black text-white leading-none mt-1">{totalQty.toLocaleString()}</span>
                    </div>
                 </div>

                 <div className="flex-1 mb-6 relative z-10">
                    <div className="flex flex-wrap gap-2 mb-4">
                       {linked.slice(0, 4).map(o => (
                          <span key={o.uuid} className="text-[9px] font-bold text-gray-600 bg-gray-50 border border-gray-100 px-2.5 py-1.5 rounded-xl truncate max-w-[120px]">{o.customer}</span>
                       ))}
                       {linked.length > 4 && (
                          <span className="text-[9px] font-black text-indigo-400 bg-indigo-50 px-2.5 py-1.5 rounded-xl">+{linked.length - 4} More</span>
                       )}
                    </div>
                    {shipment.note && (
                       <p className="text-sm font-medium text-gray-500 italic bg-gray-50/50 p-4 rounded-2xl border border-gray-100/50 line-clamp-2 leading-relaxed">
                          {shipment.note}
                       </p>
                    )}
                 </div>

                 {shipment.attachments.length > 0 && (
                    <div className="flex gap-3 overflow-x-auto no-scrollbar mb-6 relative z-10 pb-2">
                       {shipment.attachments.map((src, i) => (
                          <img key={i} src={src} className="w-16 h-16 rounded-[1.25rem] object-cover border-2 border-white shadow-md flex-shrink-0 hover:scale-105 transition-transform" alt="loading-proof" />
                       ))}
                    </div>
                 )}

                 <div className="flex justify-end gap-3 pt-6 border-t border-gray-50 relative z-10">
                    <button 
                      onClick={() => handleDeleteShipment(shipment)}
                      className="p-3.5 bg-gray-50 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all shadow-sm"
                      title="Un-bundle Shipment"
                    >
                       <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                 </div>
               </div>
             )
          })
        )}
      </div>
    </div>
  );
};

export default Archive;
