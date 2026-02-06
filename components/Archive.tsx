
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { db, Order, Shipment } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { StorageMode } from '../types';
import { getShipments, saveShipment, deleteShipment } from '../services/shipmentService';
import { getOrders } from '../services/orderService';
import { initSupabase } from '../services/syncService';
import { exportToCSV } from '../services/csvService';

interface Props {
  mode: StorageMode;
}

const Archive: React.FC<Props> = ({ mode }) => {
  const [isCreating, setIsCreating] = useState(false);
  const [editingShipmentId, setEditingShipmentId] = useState<number | null>(null);
  const [openedShipmentUuid, setOpenedShipmentUuid] = useState<string | null>(null);
  const [selectedOrderUuids, setSelectedOrderUuids] = useState<Set<string>>(new Set());
  const [dispatchDate, setDispatchDate] = useState(new Date().toISOString().split('T')[0]);
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [isProcessingImages, setIsProcessingImages] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isFilterExpanded, setIsFilterExpanded] = useState(false);
  const [galleryState, setGalleryState] = useState<{ images: string[], index: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Online data states
  const [onlineShipments, setOnlineShipments] = useState<Shipment[]>([]);
  const [onlineOrders, setOnlineOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Filter states
  const [filterRef, setFilterRef] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

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
        const channel = supabase.channel('archive_realtime_v7')
          .on('postgres_changes' as any, { event: '*', table: 'shipments', schema: 'public' }, () => fetchOnlineData())
          .on('postgres_changes' as any, { event: '*', table: 'orders', schema: 'public' }, () => fetchOnlineData())
          .subscribe();
        return () => { supabase.removeChannel(channel); };
      }
    }
  }, [mode]);

  const activeShipments: Shipment[] = mode === StorageMode.OFFLINE ? (localShipments || []) : onlineShipments;
  const activeOrders: Order[] = mode === StorageMode.OFFLINE ? (localOrders || []) : onlineOrders;

  const currentEditingShipment = useMemo(() => 
    editingShipmentId ? activeShipments.find(s => s.id === editingShipmentId) : null
  , [editingShipmentId, activeShipments]);

  const availableOrders = useMemo(() => {
    const archivedUuids = new Set<string>();
    activeShipments.forEach(s => {
      // If we're editing a shipment, we don't count its own orders as archived
      if (editingShipmentId && s.id === editingShipmentId) return;
      if (s.orderUuids && Array.isArray(s.orderUuids)) {
        s.orderUuids.forEach(uuid => archivedUuids.add(uuid));
      }
    });
    return activeOrders.filter(o => !archivedUuids.has(o.uuid));
  }, [activeOrders, activeShipments, editingShipmentId]);

  const filteredShipments = useMemo(() => {
    return activeShipments.filter(s => {
      const mainRef = s.reference || '';
      const matchesRef = !filterRef || mainRef.toLowerCase().includes(filterRef.toLowerCase());
      const sDate = new Date(s.dispatchDate).setHours(0,0,0,0);
      const start = filterStartDate ? new Date(filterStartDate).setHours(0,0,0,0) : null;
      const end = filterEndDate ? new Date(filterEndDate).setHours(23,59,59,999) : null;
      return matchesRef && (!start || sDate >= start) && (!end || sDate <= end);
    }).sort((a, b) => b.dispatchDate - a.dispatchDate);
  }, [activeShipments, filterRef, filterStartDate, filterEndDate]);

  const hasActiveFilters = filterStartDate || filterEndDate;

  const openedShipment = useMemo(() => 
    activeShipments.find(s => s.uuid === openedShipmentUuid), 
  [activeShipments, openedShipmentUuid]);

  const openedShipmentOrders = useMemo(() => {
    if (!openedShipment) return [];
    return (openedShipment.orderUuids || [])
      .map(uuid => activeOrders.find(o => o.uuid === uuid))
      .filter(Boolean) as Order[];
  }, [openedShipment, activeOrders]);

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
      const optimized = await Promise.all(Array.from(files).map(async f => {
        const url = await readFileAsDataURL(f as File);
        return downscaleImage(url);
      }));
      setAttachments(prev => [...prev, ...optimized]);
    } finally {
      setIsProcessingImages(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleStartEdit = (shipment: Shipment, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingShipmentId(shipment.id!);
    setReference(shipment.reference);
    setDispatchDate(new Date(shipment.dispatchDate).toISOString().split('T')[0]);
    setNote(shipment.note || '');
    setAttachments(shipment.attachments || []);
    setSelectedOrderUuids(new Set(shipment.orderUuids));
    setIsCreating(true);
    setOpenedShipmentUuid(null);
  };

  const handleSaveShipment = async () => {
    if (!reference.trim() || selectedOrderUuids.size === 0 || !dispatchDate) {
      alert("Required: Batch Reference, Dispatch Date, and at least one order.");
      return;
    }

    const shipmentData: Shipment = {
      uuid: currentEditingShipment?.uuid || crypto.randomUUID(),
      reference: reference.trim(), 
      orderUuids: Array.from(selectedOrderUuids),
      attachments,
      note: note.trim(),
      dispatchDate: new Date(`${dispatchDate}T12:00:00`).getTime(),
      createdAt: currentEditingShipment?.createdAt || Date.now(),
      updatedAt: Date.now()
    };

    try {
      await saveShipment(mode, shipmentData, editingShipmentId);
      setIsCreating(false);
      setEditingShipmentId(null);
      setNote(''); setReference(''); setAttachments([]); setSelectedOrderUuids(new Set());
      if (mode === StorageMode.ONLINE) fetchOnlineData();
    } catch (err) {
      alert("Save failed.");
    }
  };

  const handleDeleteShipment = async (shipment: Shipment, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Delete this archive bundle? Linked orders will return to history for re-bundling.")) {
      await deleteShipment(mode, shipment.id!, shipment.uuid);
      if (openedShipmentUuid === shipment.uuid) setOpenedShipmentUuid(null);
      if (mode === StorageMode.ONLINE) fetchOnlineData();
    }
  };

  const handleExportArchive = () => {
    if (activeShipments.length === 0) { alert("Archive is empty."); return; }
    setIsExporting(true);
    try {
      const csvData = activeShipments.map(s => {
        const linked = s.orderUuids.map(uuid => activeOrders.find(o => o.uuid === uuid)).filter(Boolean) as Order[];
        const primary = (linked[0] || {}) as Partial<Order>;
        return {
          BatchReference: s.reference,
          'Dispatch Date': new Date(s.dispatchDate).toISOString().split('T')[0],
          'Invoice Number': primary.invoiceNo || '',
          'Invoice Date': primary.invoiceDate ? new Date(primary.invoiceDate).toISOString().split('T')[0] : '',
          'Order Count': linked.length,
          'Total Quantity': linked.reduce((sum, o) => sum + o.qty, 0),
          Notes: s.note || ''
        };
      });
      exportToCSV(csvData, `shipment_archive_export_${new Date().toISOString().split('T')[0]}.csv`);
    } finally {
      setIsExporting(false);
    }
  };

  if (openedShipment && openedShipmentUuid) {
    const totalQty = openedShipmentOrders.reduce((sum, o) => sum + o.qty, 0);
    return (
      <div className="fixed inset-0 z-[100] bg-gray-50 flex flex-col animate-in slide-in-from-right duration-500 overflow-hidden">
        <header className="bg-white border-b border-gray-100 px-4 md:px-8 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
          <div className="flex items-center gap-4">
            <button onClick={() => setOpenedShipmentUuid(null)} className="p-3 bg-gray-100 text-gray-600 rounded-2xl hover:bg-indigo-600 hover:text-white transition-all">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M15 19l-7-7 7-7" /></svg>
            </button>
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">Manifest View</span>
              <h2 className="text-2xl font-black text-gray-900 tracking-tighter uppercase leading-none mt-1">{openedShipment.reference}</h2>
            </div>
          </div>
          <div className="flex items-center gap-2">
             <button onClick={() => handleStartEdit(openedShipment)} className="px-6 py-3 bg-indigo-50 text-indigo-600 font-black rounded-xl hover:bg-indigo-600 hover:text-white transition-all text-xs uppercase tracking-widest">Edit Bundle</button>
             <button onClick={(e) => handleDeleteShipment(openedShipment, e as any)} className="px-6 py-3 bg-red-50 text-red-600 font-black rounded-xl hover:bg-red-600 hover:text-white transition-all text-xs uppercase tracking-widest">Delete</button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 no-scrollbar">
           <div className="max-w-6xl mx-auto space-y-12">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100"><p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Total Units</p><p className="text-3xl font-black text-gray-900">{totalQty.toLocaleString()}</p></div>
                <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100"><p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Orders Bundled</p><p className="text-3xl font-black text-gray-900">{openedShipmentOrders.length}</p></div>
                <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100"><p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Dispatch Date</p><p className="text-3xl font-black text-indigo-600">{new Date(openedShipment.dispatchDate).toLocaleDateString()}</p></div>
              </div>
              {openedShipment.attachments.length > 0 && (
                <section>
                   <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.3em] mb-4 ml-2">Loading Proof Photos</h3>
                   <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
                      {openedShipment.attachments.map((src, i) => (
                        <div key={i} onClick={() => setGalleryState({ images: openedShipment.attachments, index: i })} className="aspect-square bg-white p-1 rounded-3xl shadow-sm border border-gray-100 group overflow-hidden cursor-zoom-in">
                          <img src={src} className="w-full h-full object-cover rounded-[1.25rem] group-hover:scale-110 transition-transform duration-500" alt="proof" />
                        </div>
                      ))}
                   </div>
                </section>
              )}
              <section className="space-y-6 pb-20">
                <h3 className="text-xl font-black text-gray-900 uppercase tracking-tighter">Items in Manifest</h3>
                <div className="space-y-4">
                   {openedShipmentOrders.map(order => (
                      <div key={order.uuid} className="bg-white rounded-[2.5rem] p-6 shadow-sm border border-gray-100 flex flex-col md:flex-row gap-6">
                        <div className="bg-gray-50 rounded-[2rem] w-full md:w-32 h-32 flex flex-col items-center justify-center text-center p-4">
                          <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">qty</span>
                          <p className="text-2xl font-black text-gray-900">{order.qty}</p>
                        </div>
                        <div className="flex-1 space-y-2">
                          <h4 className="text-lg font-black text-gray-900">{order.customer} <span className="text-xs font-bold text-gray-400 ml-2">#{order.orderNo}</span></h4>
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{order.city} • {order.material}</p>
                          {order.lrNo && <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">LR: {order.lrNo} • {order.vehicleNo}</p>}
                        </div>
                      </div>
                   ))}
                </div>
              </section>
           </div>
        </div>
      </div>
    );
  }

  if (isCreating) {
    return (
      <div className="max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500 pb-24 px-2">
        <div className="bg-white rounded-[3rem] shadow-2xl p-8 border border-gray-100 mb-8">
          <header className="mb-8 flex justify-between items-center">
            <div>
              <h2 className="text-3xl font-black text-gray-900 uppercase tracking-tighter">{editingShipmentId ? 'Modify Bundle' : 'New Shipment Bundle'}</h2>
              <p className="text-gray-400 font-bold uppercase text-[10px] tracking-widest mt-1">Status: {editingShipmentId ? 'Updating Entry' : 'New Entry'}</p>
            </div>
            <button onClick={() => { setIsCreating(false); setEditingShipmentId(null); setSelectedOrderUuids(new Set()); setAttachments([]); setNote(''); setReference(''); }} className="text-gray-400 hover:text-gray-900">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </header>
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Batch Reference</label>
                <input type="text" value={reference} onChange={e => setReference(e.target.value)} className="w-full px-6 py-4 bg-gray-50 border-none rounded-2xl shadow-inner font-black text-lg focus:ring-2 focus:ring-indigo-500" placeholder="Ex: TRIP-AUG-24" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Dispatch Date</label>
                <input type="date" value={dispatchDate} onChange={e => setDispatchDate(e.target.value)} className="w-full px-6 py-4 bg-gray-50 border-none rounded-2xl shadow-inner font-bold outline-none" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
               <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 ml-1">Manage Bundled Orders ({selectedOrderUuids.size})</label>
                  <div className="bg-gray-50 rounded-[2rem] p-4 h-[350px] overflow-auto shadow-inner space-y-2 border border-gray-100 no-scrollbar">
                     {availableOrders.length === 0 ? <p className="text-center p-8 text-gray-300 font-bold italic">No pending orders</p> : 
                        availableOrders.map(order => (
                           <div key={order.uuid} onClick={() => handleToggleOrder(order.uuid)} className={`p-4 rounded-2xl cursor-pointer transition-all border-2 flex items-center gap-3 ${selectedOrderUuids.has(order.uuid) ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-transparent hover:border-indigo-100'}`}>
                              <div className="flex-1">
                                 <p className="text-sm font-black">{order.customer}</p>
                                 <p className={`text-[9px] font-bold uppercase tracking-widest ${selectedOrderUuids.has(order.uuid) ? 'text-indigo-100' : 'text-gray-400'}`}>{order.city} • {order.qty} units • {order.lrNo || 'No LR'}</p>
                              </div>
                           </div>
                        ))
                     }
                  </div>
               </div>
               <div className="space-y-6">
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 ml-1">Batch Proof Photos</label>
                    <div className="grid grid-cols-3 gap-3">
                      {attachments.map((src, idx) => (
                        <div key={idx} className="relative aspect-square rounded-2xl overflow-hidden border border-gray-100 shadow-sm group">
                          <img src={src} className="w-full h-full object-cover" alt="proof" />
                          <button onClick={() => setAttachments(p => p.filter((_, i) => i !== idx))} className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}><path d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                      ))}
                      <button onClick={() => fileInputRef.current?.click()} disabled={isProcessingImages} className="aspect-square rounded-2xl border-2 border-dashed border-gray-200 text-gray-400 hover:bg-indigo-50 flex flex-col items-center justify-center">
                         {isProcessingImages ? <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div> : 
                          <><svg className="w-6 h-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M12 4v16m8-8H4" /></svg><span className="text-[8px] font-black uppercase">Add</span></>}
                      </button>
                    </div>
                    <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" multiple />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Batch Notes</label>
                    <textarea value={note} onChange={e => setNote(e.target.value)} className="w-full px-5 py-4 bg-gray-50 border-none rounded-[1.5rem] shadow-inner min-h-[120px] font-medium" placeholder="Operational details..." />
                  </div>
               </div>
            </div>
            <div className="pt-8 flex gap-4">
              <button onClick={handleSaveShipment} className={`flex-1 font-black py-5 rounded-[2rem] shadow-xl text-white uppercase tracking-widest text-sm ${mode === StorageMode.ONLINE ? 'bg-blue-600' : 'bg-indigo-600'}`}>
                {editingShipmentId ? 'Commit Modifications' : 'Confirm Bundle'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-6xl mx-auto pb-24 px-2">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div><h2 className="text-4xl font-black text-gray-900 uppercase tracking-tighter">Shipment Archives</h2><p className="text-gray-400 font-bold uppercase text-[10px] tracking-[0.3em] mt-1">History & Verification</p></div>
        <div className="flex flex-wrap gap-3">
          <button onClick={handleExportArchive} disabled={isExporting} className="px-6 py-5 rounded-[1.75rem] font-black uppercase tracking-widest text-xs shadow-xl flex items-center gap-3 bg-white text-gray-600 border border-gray-100 hover:bg-gray-50 disabled:opacity-50">
            {isExporting ? <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div> : <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
            Download CSV
          </button>
          <button onClick={() => setIsCreating(true)} className={`px-8 py-5 rounded-[1.75rem] font-black uppercase tracking-widest text-xs shadow-2xl transition-all flex items-center gap-3 active:scale-95 ${mode === StorageMode.ONLINE ? 'bg-blue-600 shadow-blue-100' : 'bg-indigo-600 shadow-indigo-100'} text-white`}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M12 4v16m8-8H4" /></svg>
            Bundle New Shipment
          </button>
        </div>
      </header>

      <div className="bg-white p-4 md:p-6 rounded-[2rem] shadow-sm border border-gray-100 mb-8 sticky top-[80px] z-30 space-y-4">
        <div className="flex flex-col md:flex-row gap-3 items-center">
          <div className="relative w-full flex-1">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg></span>
            <input type="text" placeholder="Filter by Reference..." value={filterRef} onChange={e => setFilterRef(e.target.value)} className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500 shadow-inner font-bold text-gray-900" />
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <button onClick={() => setIsFilterExpanded(!isFilterExpanded)} className={`flex-1 md:flex-none px-6 py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 border ${isFilterExpanded ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100' : 'bg-white text-gray-500 border-gray-100'}`}>
              <svg className={`w-4 h-4 transition-transform ${isFilterExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M19 9l-7 7-7-7" /></svg>
              Time Range
            </button>
          </div>
        </div>
        {isFilterExpanded && (
          <div className="grid grid-cols-2 gap-3 pt-4 border-t border-gray-50 animate-in slide-in-from-top-4">
             <div className="flex flex-col"><label className="text-[9px] font-black text-gray-400 uppercase mb-1 ml-1 tracking-widest">Dispatch Start</label><input type="date" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)} className="px-3 py-2 bg-gray-50 border rounded-xl text-[11px] font-bold outline-none" /></div>
             <div className="flex flex-col"><label className="text-[9px] font-black text-gray-400 uppercase mb-1 ml-1 tracking-widest">Dispatch End</label><input type="date" value={filterEndDate} onChange={e => setFilterEndDate(e.target.value)} className="px-3 py-2 bg-gray-50 border rounded-xl text-[11px] font-bold outline-none" /></div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 pb-20">
        {isLoading && activeShipments.length === 0 ? <div className="col-span-full py-32 text-center"><div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-6"></div></div> : 
         filteredShipments.length === 0 ? <div className="col-span-full py-32 text-center bg-white rounded-[4rem] border-4 border-dashed border-gray-100"><p className="text-gray-300 font-black text-2xl italic uppercase tracking-tighter">No Bundles Found</p></div> : 
          filteredShipments.map(shipment => {
             const linked = (shipment.orderUuids || []).map(uuid => activeOrders.find(o => o.uuid === uuid)).filter(Boolean) as Order[];
             const totalQty = linked.reduce((sum, o) => sum + o.qty, 0);
             const uniqueCities = Array.from(new Set(linked.map(l => l.city))).slice(0, 2);
             const uniqueClients = Array.from(new Set(linked.map(l => l.customer))).slice(0, 1);

             return (
               <div key={shipment.uuid} onClick={() => setOpenedShipmentUuid(shipment.uuid)} className="bg-white rounded-[3rem] p-8 shadow-sm border border-gray-100 hover:shadow-2xl hover:shadow-indigo-100/50 transition-all duration-500 flex flex-col group cursor-pointer relative overflow-hidden">
                 <div className="flex justify-between items-start mb-6">
                    <div className="flex-1 min-w-0">
                       <span className={`text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full mb-3 inline-block ${mode === StorageMode.ONLINE ? 'bg-blue-50 text-blue-600' : 'bg-indigo-50 text-indigo-600'}`}>Ref: {shipment.reference}</span>
                       <h3 className="text-2xl font-black text-gray-900 leading-none truncate mb-1">{linked.length} Orders</h3>
                       <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Disp: {new Date(shipment.dispatchDate).toLocaleDateString()}</p>
                    </div>
                    <div className={`${mode === StorageMode.ONLINE ? 'bg-blue-600 shadow-blue-100' : 'bg-indigo-600 shadow-indigo-100'} rounded-2xl p-4 text-center min-w-[75px] shadow-lg group-hover:scale-110 transition-transform`}>
                       <span className="block text-[10px] text-white opacity-70 font-black uppercase tracking-tighter">Units</span>
                       <span className="block text-2xl font-black text-white leading-none mt-1">{totalQty.toLocaleString()}</span>
                    </div>
                 </div>

                 <div className="bg-gray-50 rounded-2xl p-4 mb-6 space-y-2">
                    <div className="flex items-center gap-2">
                       <svg className="w-3 h-3 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                       <span className="text-[10px] font-bold text-gray-500 truncate">{uniqueClients.join(', ')} {linked.length > 1 && `+ ${linked.length - 1} more`}</span>
                    </div>
                    <div className="flex items-center gap-2">
                       <svg className="w-3 h-3 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /></svg>
                       <span className="text-[10px] font-bold text-gray-500 truncate">{uniqueCities.join(' / ')}</span>
                    </div>
                 </div>
                 
                 {shipment.attachments.length > 0 && (
                   <div className="flex gap-2 mb-6">
                      {shipment.attachments.slice(0, 3).map((img, idx) => (
                        <div key={idx} onClick={(e) => { e.stopPropagation(); setGalleryState({ images: shipment.attachments, index: idx }); }} className="w-12 h-12 rounded-xl overflow-hidden border-2 border-white shadow-sm flex-shrink-0 hover:scale-110 transition-transform">
                          <img src={img} className="w-full h-full object-cover" alt="thumbnail" />
                        </div>
                      ))}
                      {shipment.attachments.length > 3 && (
                        <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center text-[10px] font-black text-gray-400 border-2 border-white shadow-sm">+{shipment.attachments.length - 3}</div>
                      )}
                   </div>
                 )}

                 <div className="flex justify-between items-center pt-6 border-t border-gray-50 mt-auto">
                    <button onClick={(e) => { e.stopPropagation(); setOpenedShipmentUuid(shipment.uuid); }} className="text-[10px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-2">View Full Manifest <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}><path d="M9 5l7 7-7 7" /></svg></button>
                    <div className="flex gap-1">
                      <button onClick={(e) => handleStartEdit(shipment, e)} className="p-2.5 text-gray-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                      <button onClick={(e) => handleDeleteShipment(shipment, e)} className="p-2.5 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                    </div>
                 </div>
               </div>
             )
          })
        }
      </div>

      {galleryState && (
        <div className="fixed inset-0 z-[200] bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center p-4 animate-in fade-in duration-300" onClick={() => setGalleryState(null)}>
           <div className="relative w-full max-w-4xl flex flex-col items-center gap-6" onClick={e => e.stopPropagation()}>
              <img src={galleryState.images[galleryState.index]} className="max-w-full max-h-[75vh] object-contain rounded-2xl shadow-2xl animate-in zoom-in-95" alt="Proof" />
              <div className="flex gap-4">
                <button onClick={() => setGalleryState({ ...galleryState, index: (galleryState.index - 1 + galleryState.images.length) % galleryState.images.length })} className="p-4 bg-white/10 text-white rounded-full border border-white/20 hover:bg-white/20 transition-all"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M15 19l-7-7 7-7" /></svg></button>
                <button onClick={() => setGalleryState(null)} className="px-10 py-4 bg-white text-gray-900 rounded-full font-black uppercase tracking-widest text-xs hover:bg-gray-100 transition-all shadow-xl">Close Gallery</button>
                <button onClick={() => setGalleryState({ ...galleryState, index: (galleryState.index + 1) % galleryState.images.length })} className="p-4 bg-white/10 text-white rounded-full border border-white/20 hover:bg-white/20 transition-all"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M9 5l7 7-7 7" /></svg></button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default Archive;
