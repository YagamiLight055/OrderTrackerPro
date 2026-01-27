
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
      setOnlineShipments(shipmentsData);
      setOnlineOrders(ordersData);
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
        const channel = supabase.channel('archive_realtime')
          .on('postgres_changes', { event: '*', table: 'shipments' }, () => fetchOnlineData())
          .on('postgres_changes', { event: '*', table: 'orders' }, () => fetchOnlineData())
          .subscribe();
        return () => { supabase.removeChannel(channel); };
      }
    }
  }, [mode]);

  const activeShipments = mode === StorageMode.OFFLINE ? (localShipments || []) : onlineShipments;
  const activeOrders = mode === StorageMode.OFFLINE ? (localOrders || []) : onlineOrders;

  const availableOrders = useMemo(() => {
    const archivedUuids = new Set(activeShipments.flatMap(s => s.orderUuids));
    return activeOrders.filter(o => !archivedUuids.has(o.uuid));
  }, [activeOrders, activeShipments]);

  const filteredShipments = useMemo(() => {
    return activeShipments.filter(s => {
      const matchesRef = !filterRef || s.reference.toLowerCase().includes(filterRef.toLowerCase());
      const sDate = new Date(s.dispatchDate).setHours(0,0,0,0);
      const start = filterStartDate ? new Date(filterStartDate).setHours(0,0,0,0) : null;
      const end = filterEndDate ? new Date(filterEndDate).setHours(23,59,59,999) : null;
      return matchesRef && (!start || sDate >= start) && (!end || sDate <= end);
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
            let w = img.width, h = img.height;
            if (w > maxWidth) { h = (maxWidth / w) * h; w = maxWidth; }
            canvas.width = w; canvas.height = h;
            canvas.getContext('2d')?.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', quality));
          };
          img.onerror = () => resolve(dataUrl);
        });
      };

      // Fixed: Explicitly cast 'f' to 'File' to satisfy the type requirement of readFileAsDataURL.
      const optimized = await Promise.all(Array.from(files).map(async f => downscaleImage(await readFileAsDataURL(f as File))));
      setAttachments(prev => [...prev, ...optimized]);
    } finally {
      setIsProcessingImages(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleCreateShipment = async () => {
    if (!reference.trim() || selectedOrderUuids.size === 0 || !dispatchDate) {
      alert("Please fill all required fields."); return;
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
      setReference(''); setNote(''); setAttachments([]); setSelectedOrderUuids(new Set());
      setDispatchDate(new Date().toISOString().split('T')[0]);
      setIsCreating(false);
      if (mode === StorageMode.ONLINE) fetchOnlineData();
    } catch (err) { alert("Action failed."); }
  };

  const handleDeleteShipment = async (shipment: Shipment) => {
    if (confirm("Delete this shipment grouping?")) {
      await deleteShipment(mode, shipment.id!, shipment.uuid);
      if (mode === StorageMode.ONLINE) fetchOnlineData();
    }
  };

  if (isCreating) {
    return (
      <div className="max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500 pb-24">
        <div className="bg-white rounded-[3rem] shadow-2xl p-8 border border-gray-100 mb-8">
          <header className="mb-8 flex justify-between items-center">
            <div>
              <h2 className="text-3xl font-black text-gray-900 uppercase tracking-tighter">New Shipment</h2>
              <p className="text-gray-400 font-bold uppercase text-[10px] tracking-widest mt-1">
                {mode === StorageMode.ONLINE ? 'CLOUD STORAGE' : 'OFFLINE STORAGE'}
              </p>
            </div>
            <button onClick={() => setIsCreating(false)} className="text-gray-400 hover:text-gray-900"><svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg></button>
          </header>

          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-black text-gray-500 mb-2 uppercase tracking-widest">Shipment Ref</label>
                <input type="text" value={reference} onChange={(e) => setReference(e.target.value)} className="w-full px-5 py-3.5 bg-gray-50 border-none rounded-2xl shadow-inner font-black text-lg" placeholder="T-402-B" />
              </div>
              <div>
                <label className="block text-xs font-black text-gray-500 mb-2 uppercase tracking-widest">Dispatch Date</label>
                <input type="date" value={dispatchDate} onChange={(e) => setDispatchDate(e.target.value)} className="w-full px-5 py-3.5 bg-gray-50 border-none rounded-2xl shadow-inner font-bold outline-none" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
               <div>
                  <label className="block text-xs font-black text-gray-500 mb-4 uppercase tracking-widest">Select Orders ({selectedOrderUuids.size})</label>
                  <div className="bg-gray-50 rounded-[2rem] p-4 h-[400px] overflow-auto shadow-inner space-y-2 border border-gray-100">
                     {availableOrders.length === 0 ? <p className="text-center py-10 text-gray-300 font-bold text-sm">No orders available.</p> : availableOrders.map(order => (
                       <div key={order.uuid} onClick={() => handleToggleOrder(order.uuid)} className={`p-4 rounded-2xl cursor-pointer transition-all border-2 flex items-center gap-4 ${selectedOrderUuids.has(order.uuid) ? 'bg-indigo-600 border-indigo-600 shadow-lg' : 'bg-white border-transparent'}`}>
                          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${selectedOrderUuids.has(order.uuid) ? 'bg-white border-white' : 'border-gray-200'}`}>
                             {selectedOrderUuids.has(order.uuid) && <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={5}><path d="M5 13l4 4L19 7" /></svg>}
                          </div>
                          <div className="flex-1">
                             <p className={`text-sm font-black ${selectedOrderUuids.has(order.uuid) ? 'text-white' : 'text-gray-900'}`}>{order.customer}</p>
                             <p className={`text-[10px] font-bold uppercase ${selectedOrderUuids.has(order.uuid) ? 'text-indigo-100' : 'text-gray-400'}`}>{order.city} • {order.qty} units</p>
                          </div>
                       </div>
                     ))}
                  </div>
               </div>
               <div className="space-y-6">
                  <div>
                    <label className="block text-xs font-black text-gray-500 mb-3 uppercase tracking-widest">Loading Proof</label>
                    <div className="grid grid-cols-3 gap-3">
                      {attachments.map((src, idx) => (
                        <div key={idx} className="relative aspect-square rounded-2xl overflow-hidden border-2 border-white shadow-md">
                          <img src={src} className="w-full h-full object-cover" />
                          <button onClick={() => setAttachments(p => p.filter((_, i) => i !== idx))} className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M6 18L18 6M6 6l12 12" strokeWidth={4} /></svg></button>
                        </div>
                      ))}
                      <button onClick={() => fileInputRef.current?.click()} className="aspect-square rounded-2xl border-2 border-dashed border-gray-200 text-gray-400 hover:bg-indigo-50 flex flex-col items-center justify-center shadow-inner">
                         <svg className="w-6 h-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M12 4v16m8-8H4" /></svg>
                         <span className="text-[8px] font-black uppercase">Attach</span>
                      </button>
                    </div>
                    <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" multiple />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-gray-500 mb-2 uppercase tracking-widest">Shipment Note</label>
                    <textarea value={note} onChange={(e) => setNote(e.target.value)} className="w-full px-5 py-4 bg-gray-50 border-none rounded-[1.5rem] shadow-inner min-h-[140px] font-medium" placeholder="Trucking details..." />
                  </div>
               </div>
            </div>
            <div className="pt-6 border-t border-gray-50 flex gap-4">
              <button onClick={handleCreateShipment} className="flex-1 bg-indigo-600 text-white font-black py-5 rounded-[2rem] shadow-xl hover:bg-indigo-700 active:scale-95 uppercase tracking-widest text-sm">Archive Shipment</button>
              <button onClick={() => setIsCreating(false)} className="px-10 py-5 bg-gray-100 text-gray-400 font-black rounded-[2rem] uppercase tracking-widest text-xs">Cancel</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-6xl mx-auto pb-24">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-4xl font-black text-gray-900 uppercase tracking-tighter">Shipment Archives</h2>
          <p className="text-gray-400 font-bold uppercase text-[10px] tracking-widest mt-1">Management Hub</p>
        </div>
        <button onClick={() => setIsCreating(true)} className="bg-indigo-600 text-white px-8 py-4 rounded-[1.75rem] font-black uppercase tracking-widest text-xs shadow-xl shadow-indigo-100 hover:bg-indigo-700 flex items-center gap-3">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M12 4v16m8-8H4" /></svg>
          New Shipment
        </button>
      </header>

      <div className="bg-white p-4 md:p-6 rounded-[2rem] shadow-sm border border-gray-100 sticky top-[80px] z-30 flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg></span>
          <input type="text" placeholder="Ref search..." value={filterRef} onChange={(e) => setFilterRef(e.target.value)} className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border-none rounded-2xl shadow-inner font-bold text-gray-900" />
        </div>
        <div className="flex gap-2">
           <button onClick={() => setIsFilterExpanded(!isFilterExpanded)} className={`px-6 py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 border ${isFilterExpanded ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500'}`}>Dates</button>
           {mode === StorageMode.ONLINE && <button onClick={fetchOnlineData} className={`p-3.5 bg-blue-50 text-blue-600 rounded-2xl ${isLoading ? 'animate-spin' : ''}`}><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg></button>}
        </div>
      </div>

      {isFilterExpanded && (
        <div className="bg-white p-6 rounded-[2rem] shadow-xl border border-indigo-50 flex gap-4 animate-in slide-in-from-top-4">
           <input type="date" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)} className="flex-1 bg-gray-50 p-3 rounded-xl font-bold" />
           <input type="date" value={filterEndDate} onChange={e => setFilterEndDate(e.target.value)} className="flex-1 bg-gray-50 p-3 rounded-xl font-bold" />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading && activeShipments.length === 0 ? <div className="col-span-full py-20 text-center text-indigo-600 font-black">Connecting...</div> : filteredShipments.length === 0 ? (
          <div className="col-span-full py-20 text-center bg-white rounded-[3rem] border-2 border-dashed border-gray-100">
            <p className="text-gray-300 font-black text-xl italic uppercase tracking-widest">No Shipments</p>
          </div>
        ) : filteredShipments.map(s => {
             const linked = s.orderUuids.map(uuid => activeOrders.find(o => o.uuid === uuid)).filter(Boolean) as Order[];
             return (
               <div key={s.uuid} className="bg-white rounded-[2.5rem] p-6 shadow-sm border border-gray-50 hover:shadow-2xl transition-all flex flex-col">
                 <div className="flex justify-between items-start mb-6">
                    <div>
                       <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest bg-indigo-50 px-3 py-1 rounded-full mb-2 inline-block">Ref: {s.reference}</span>
                       <h3 className="text-xl font-black text-gray-900">{linked.length} Orders</h3>
                       <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Disp: {new Date(s.dispatchDate).toLocaleDateString()}</p>
                    </div>
                    <div className="bg-indigo-600 rounded-2xl p-3 text-center min-w-[60px] shadow-lg">
                       <span className="block text-[8px] text-white opacity-70 font-black uppercase">Total Qty</span>
                       <span className="block text-xl font-black text-white leading-none">{linked.reduce((sum, o) => sum + o.qty, 0)}</span>
                    </div>
                 </div>
                 <div className="flex-1 mb-4">
                    <div className="flex flex-wrap gap-1.5 mb-3">{linked.slice(0, 3).map(o => <span key={o.uuid} className="text-[9px] font-bold text-gray-500 bg-gray-50 px-2 py-1 rounded-lg truncate">{o.customer}</span>)}</div>
                    {s.note && <p className="text-[11px] text-gray-500 italic bg-gray-50 p-3 rounded-xl border border-gray-100/50 line-clamp-2">{s.note}</p>}
                 </div>
                 {s.attachments.length > 0 && <div className="flex gap-2 overflow-x-auto no-scrollbar mb-4">{s.attachments.map((src, i) => <img key={i} src={src} className="w-16 h-16 rounded-xl object-cover border-2 border-white shadow-sm" />)}</div>}
                 <div className="flex justify-end pt-4 border-t border-gray-50"><button onClick={() => handleDeleteShipment(s)} className="p-3 bg-gray-50 text-gray-400 hover:text-red-600 rounded-xl transition-all shadow-sm"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button></div>
               </div>
             )
        })}
      </div>
    </div>
  );
};

export default Archive;