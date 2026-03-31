
import React, { useState, useEffect, useRef } from 'react';
import { db, Order } from '../db';
import AutocompleteInput from './AutocompleteInput';
import { StorageMode } from '../types';
import { saveOrder, getOrders } from '../services/orderService';
import { initSupabase } from '../services/syncService';

interface Props {
  mode: StorageMode;
  editId?: number | null;
  onSuccess: () => void;
  onCancel: () => void;
}

const STATUS_OPTIONS = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];

const AddOrder: React.FC<Props> = ({ mode, editId, onSuccess, onCancel }) => {
  const [formData, setFormData] = useState<{
    uuid: string;
    "Plant": string;
    "Invoice Number": string;
    "INV DATE": string;
    "SALES ORDER": string;
    "SO DATE": string;
    "CUSTOMER": string;
    "MATERIAL": string;
    "Material Description": string;
    "ITEM QTY": number;
    "DELIVERY": string;
    "DEL DATE": string;
    "DEL QTY": number;
    "IND. SHIP. NUMBER": string;
    "COL SHP NO": string;
    "Ship To Party": string;
    "Ship to Party Name": string;
    "Ship to Party Destination": string;
    "Payer": string;
    "Value of Part ordered": number;
    "Order type": string;
    "GC L/R No": string;
    "LR Date": string;
    "Road Permit": string;
    "Truck No": string;
    status: string;
    note: string;
    attachments: string[];
    customerName: string;
    customerCity: string;
    reasonForRejection: string;
  }>({
    uuid: crypto.randomUUID(),
    "Plant": '',
    "Invoice Number": '',
    "INV DATE": '',
    "SALES ORDER": '',
    "SO DATE": new Date().toISOString().split('T')[0],
    "CUSTOMER": '',
    "MATERIAL": '',
    "Material Description": '',
    "ITEM QTY": 0,
    "DELIVERY": '',
    "DEL DATE": '',
    "DEL QTY": 0,
    "IND. SHIP. NUMBER": '',
    "COL SHP NO": '',
    "Ship To Party": '',
    "Ship to Party Name": '',
    "Ship to Party Destination": '',
    "Payer": '',
    "Value of Part ordered": 0,
    "Order type": '',
    "GC L/R No": '',
    "LR Date": '',
    "Road Permit": '',
    "Truck No": '',
    status: 'Pending',
    note: '',
    attachments: [],
    customerName: '',
    customerCity: '',
    reasonForRejection: ''
  });

  const [isProcessingImages, setIsProcessingImages] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [options, setOptions] = useState<{ customers: string[], cities: string[], materials: string[] }>({
    customers: [],
    cities: [],
    materials: []
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loadOptions = async () => {
      if (mode === StorageMode.OFFLINE) {
        const orders = await db.orders.toArray();
        const masterCustomers = await db.customersMaster.toArray();
        const masterCities = await db.citiesMaster.toArray();
        const masterMaterials = await db.materialsMaster.toArray();

        const distinct = (arr: string[]) => Array.from(new Set(arr.filter(Boolean).map(s => s.trim()))).sort();
        
        setOptions({
          customers: distinct([...orders.map(o => o.customerName), ...masterCustomers.map(c => c.name)]),
          cities: distinct([...orders.map(o => o.customerCity), ...masterCities.map(c => c.name)]),
          materials: distinct([...orders.map(o => o["MATERIAL"]), ...masterMaterials.map(m => m.name)]),
        });
      } else {
        const supabase = initSupabase();
        if (!supabase) return;
        
        const [ordersRes, customersRes, citiesRes, materialsRes] = await Promise.all([
           supabase.from('orders').select('customer_name, customer_city, material'),
           supabase.from('customersMaster').select('name'),
           supabase.from('citiesMaster').select('name'),
           supabase.from('materialsMaster').select('name')
        ]);

        const distinct = (arr: string[]) => Array.from(new Set(arr.filter(Boolean).map(s => s.trim()))).sort();

        setOptions({
          customers: distinct([...(ordersRes.data?.map(o => o.customer_name) || []), ...(customersRes.data?.map(c => c.name) || [])]),
          cities: distinct([...(ordersRes.data?.map(o => o.customer_city) || []), ...(citiesRes.data?.map(c => c.name) || [])]),
          materials: distinct([...(ordersRes.data?.map(o => o.material) || []), ...(materialsRes.data?.map(m => m.name) || [])]),
        });
      }
    };
    loadOptions();

    if (editId) {
      if (mode === StorageMode.OFFLINE) {
        db.orders.get(editId).then(order => {
          if (order) {
            setFormData({
              uuid: order.uuid || crypto.randomUUID(), 
              "Plant": order["Plant"] || '',
              "Invoice Number": order["Invoice Number"] || '',
              "INV DATE": order["INV DATE"] ? new Date(order["INV DATE"]).toISOString().split('T')[0] : '',
              "SALES ORDER": order["SALES ORDER"] || '',
              "SO DATE": new Date(order["SO DATE"]).toISOString().split('T')[0],
              "CUSTOMER": order["CUSTOMER"] || '',
              "MATERIAL": order["MATERIAL"] || '',
              "Material Description": order["Material Description"] || '',
              "ITEM QTY": order["ITEM QTY"] || 0,
              "DELIVERY": order["DELIVERY"] || '',
              "DEL DATE": order["DEL DATE"] ? new Date(order["DEL DATE"]).toISOString().split('T')[0] : '',
              "DEL QTY": order["DEL QTY"] || 0,
              "IND. SHIP. NUMBER": order["IND. SHIP. NUMBER"] || '',
              "COL SHP NO": order["COL SHP NO"] || '',
              "Ship To Party": order["Ship To Party"] || '',
              "Ship to Party Name": order["Ship to Party Name"] || '',
              "Ship to Party Destination": order["Ship to Party Destination"] || '',
              "Payer": order["Payer"] || '',
              "Value of Part ordered": order["Value of Part ordered"] || 0,
              "Order type": order["Order type"] || '',
              "GC L/R No": order["GC L/R No"] || '',
              "LR Date": order["LR Date"] ? new Date(order["LR Date"]).toISOString().split('T')[0] : '',
              "Road Permit": order["Road Permit"] || '',
              "Truck No": order["Truck No"] || '',
              status: order.status || 'Pending',
              note: order.note || '',
              attachments: order.attachments || [],
              customerName: order.customerName || '',
              customerCity: order.customerCity || '',
              reasonForRejection: order.reasonForRejection || ''
            });
          }
        });
      } else {
        const supabase = initSupabase();
        if (supabase) {
           supabase.from('orders').select('*').eq('id', editId).single().then(({ data }) => {
             if (data) {
               setFormData({
                 uuid: data.uuid,
                 "Plant": data.plant || '',
                 "Invoice Number": data.invoice_number || '',
                 "INV DATE": data.inv_date || '',
                 "SALES ORDER": data.sales_order || '',
                 "SO DATE": data.so_date || '',
                 "CUSTOMER": data.customer || '',
                 "MATERIAL": data.material || '',
                 "Material Description": data.material_description || '',
                 "ITEM QTY": data.item_qty || 0,
                 "DELIVERY": data.delivery || '',
                 "DEL DATE": data.del_date || '',
                 "DEL QTY": data.del_qty || 0,
                 "IND. SHIP. NUMBER": data.ind_ship_number || '',
                 "COL SHP NO": data.col_shp_no || '',
                 "Ship To Party": data.ship_to_party || '',
                 "Ship to Party Name": data.ship_to_party_name || '',
                 "Ship to Party Destination": data.ship_to_party_destination || '',
                 "Payer": data.payer || '',
                 "Value of Part ordered": data.value_part_ordered || 0,
                 "Order type": data.order_type || '',
                 "GC L/R No": data.gc_lr_no || '',
                 "LR Date": data.lr_date || '',
                 "Road Permit": data.road_permit || '',
                 "Truck No": data.truck_no || '',
                 status: data.status,
                 note: data.note,
                 attachments: data.attachments || [],
                 customerName: data.customer_name || '',
                 customerCity: data.customer_city || '',
                 reasonForRejection: data.reason_for_rejection || ''
               });
             }
           });
        }
      }
    }
  }, [editId, mode]);

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
            let width = img.width;
            let height = img.height;
            if (width > maxWidth) {
              height = (maxWidth / width) * height;
              width = maxWidth;
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', quality));
          };
          img.onerror = () => resolve(dataUrl);
        });
      };

      const rawDataUrls = await Promise.all(
        Array.from(files).map(file => readFileAsDataURL(file as File))
      );
      const optimizedAttachments = await Promise.all(
        rawDataUrls.map(url => downscaleImage(url))
      );
      setFormData(prev => ({
        ...prev,
        attachments: [...prev.attachments, ...optimizedAttachments]
      }));
    } catch (err) {
      console.error("Error reading files:", err);
    } finally {
      setIsProcessingImages(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    const { 
      uuid, status, note, attachments, customerName, customerCity
    } = formData;
    
    if (!formData["SALES ORDER"].trim() || !formData["SO DATE"] || !customerName.trim() || formData["ITEM QTY"] <= 0) {
      alert("Please fill all required fields (Sales Order, SO Date, Customer Name, Item Qty).");
      return;
    }

    setIsSaving(true);
    const now = Date.now();
    const parseDate = (d: string) => d ? new Date(`${d}T12:00:00`).getTime() : undefined;

    const orderData: Order = {
      uuid: uuid || crypto.randomUUID(),
      "Plant": formData["Plant"].trim(),
      "Invoice Number": formData["Invoice Number"].trim(),
      "INV DATE": parseDate(formData["INV DATE"]),
      "SALES ORDER": formData["SALES ORDER"].trim(),
      "SO DATE": parseDate(formData["SO DATE"]) || now,
      "CUSTOMER": formData["CUSTOMER"].trim(),
      "MATERIAL": formData["MATERIAL"].trim(),
      "Material Description": formData["Material Description"].trim(),
      "ITEM QTY": Number(formData["ITEM QTY"]),
      "DELIVERY": formData["DELIVERY"].trim(),
      "DEL DATE": parseDate(formData["DEL DATE"]),
      "DEL QTY": Number(formData["DEL QTY"]),
      "IND. SHIP. NUMBER": formData["IND. SHIP. NUMBER"].trim(),
      "COL SHP NO": formData["COL SHP NO"].trim(),
      "Ship To Party": formData["Ship To Party"].trim(),
      "Ship to Party Name": formData["Ship to Party Name"].trim(),
      "Ship to Party Destination": formData["Ship to Party Destination"].trim(),
      "Payer": formData["Payer"].trim(),
      "Value of Part ordered": Number(formData["Value of Part ordered"]),
      "Order type": formData["Order type"].trim(),
      "GC L/R No": formData["GC L/R No"].trim(),
      "LR Date": parseDate(formData["LR Date"]),
      "Road Permit": formData["Road Permit"].trim(),
      "Truck No": formData["Truck No"].trim(),
      status: status,
      note: note.trim(),
      attachments,
      customerName: customerName.trim(),
      customerCity: customerCity.trim(),
      reasonForRejection: formData.reasonForRejection.trim(),
      createdAt: editId ? (await db.orders.get(editId))?.createdAt || now : now,
      updatedAt: now,
    };

    try {
      await saveOrder(mode, orderData, editId);
      onSuccess();
    } catch (err: any) {
      console.error(err);
      alert(`Save failed: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-[2.5rem] shadow-2xl p-8 border border-gray-100">
        <header className="mb-8 flex justify-between items-start">
          <div>
            <h2 className="text-3xl font-black text-gray-900 leading-tight uppercase tracking-tighter">
              {editId ? 'Edit Record' : 'Add New Record'}
            </h2>
            <p className="text-gray-400 font-bold uppercase text-[10px] tracking-widest mt-1">Environment: {mode === StorageMode.ONLINE ? 'Cloud Live' : 'Standalone Local'}</p>
          </div>
          <div className={`w-3.5 h-3.5 rounded-full ${mode === StorageMode.ONLINE ? 'bg-blue-600 animate-pulse shadow-[0_0_12px_rgba(37,99,235,0.4)]' : 'bg-indigo-50 shadow-[0_0_12px_rgba(79,70,229,0.3)]'}`}></div>
        </header>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Section 1: Order Basics */}
          <div className="space-y-6">
            <h3 className="text-sm font-black text-indigo-600 uppercase tracking-widest border-b pb-2">Order Information</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div>
                <label className="block text-xs font-black text-gray-500 mb-2 uppercase tracking-widest">Plant</label>
                <input type="text" value={formData["Plant"]} onChange={e => setFormData({...formData, "Plant": e.target.value})} className="w-full px-5 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 shadow-inner font-bold" placeholder="Plant Code" />
              </div>
              <div>
                <label className="block text-xs font-black text-gray-500 mb-2 uppercase tracking-widest">Sales Order *</label>
                <input type="text" value={formData["SALES ORDER"]} onChange={e => setFormData({...formData, "SALES ORDER": e.target.value})} className="w-full px-5 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 shadow-inner font-bold" placeholder="SO Number" required />
              </div>
              <div>
                <label className="block text-xs font-black text-gray-500 mb-2 uppercase tracking-widest">SO Date *</label>
                <input type="date" value={formData["SO DATE"]} onChange={e => setFormData({...formData, "SO DATE": e.target.value})} className="w-full px-5 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 shadow-inner font-bold" required />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div>
                <label className="block text-xs font-black text-gray-500 mb-2 uppercase tracking-widest">Order Type</label>
                <input type="text" value={formData["Order type"]} onChange={e => setFormData({...formData, "Order type": e.target.value})} className="w-full px-5 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 shadow-inner font-bold" />
              </div>
              <div>
                <label className="block text-xs font-black text-gray-500 mb-2 uppercase tracking-widest">Payer</label>
                <input type="text" value={formData["Payer"]} onChange={e => setFormData({...formData, "Payer": e.target.value})} className="w-full px-5 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 shadow-inner font-bold" />
              </div>
              <div>
                <label className="block text-xs font-black text-gray-500 mb-2 uppercase tracking-widest">Value ordered</label>
                <input type="number" value={formData["Value of Part ordered"] || ''} onChange={e => setFormData({...formData, "Value of Part ordered": Number(e.target.value)})} className="w-full px-5 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 shadow-inner font-bold" />
              </div>
            </div>
          </div>

          {/* Section 2: Customer Info */}
          <div className="space-y-6">
            <h3 className="text-sm font-black text-indigo-600 uppercase tracking-widest border-b pb-2">Customer Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div>
                <label className="block text-xs font-black text-gray-500 mb-2 uppercase tracking-widest">Customer ID</label>
                <input type="text" value={formData["CUSTOMER"]} onChange={e => setFormData({...formData, "CUSTOMER": e.target.value})} className="w-full px-5 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 shadow-inner font-bold" placeholder="Cust Code" />
              </div>
              <div className="sm:col-span-2">
                <AutocompleteInput
                  label="Customer Name *"
                  value={formData.customerName}
                  onChange={(val) => setFormData({ ...formData, customerName: val })}
                  options={options.customers}
                  placeholder="Full customer name..."
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <AutocompleteInput
                label="Customer City"
                value={formData.customerCity}
                onChange={(val) => setFormData({ ...formData, customerCity: val })}
                options={options.cities}
                placeholder="City..."
              />
              <div>
                <label className="block text-xs font-black text-gray-500 mb-2 uppercase tracking-widest">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full px-5 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 shadow-inner font-bold cursor-pointer"
                >
                  {STATUS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Section 3: Material Info */}
          <div className="space-y-6">
            <h3 className="text-sm font-black text-indigo-600 uppercase tracking-widest border-b pb-2">Material Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <AutocompleteInput
                label="Material *"
                value={formData["MATERIAL"]}
                onChange={(val) => setFormData({ ...formData, "MATERIAL": val })}
                options={options.materials}
                placeholder="Material code..."
                required
              />
              <div>
                <label className="block text-xs font-black text-gray-500 mb-2 uppercase tracking-widest">Item Qty *</label>
                <input type="number" value={formData["ITEM QTY"] || ''} onChange={e => setFormData({...formData, "ITEM QTY": Number(e.target.value)})} className="w-full px-5 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 shadow-inner font-black text-lg" required min="1" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-black text-gray-500 mb-2 uppercase tracking-widest">Material Description</label>
              <input type="text" value={formData["Material Description"]} onChange={e => setFormData({...formData, "Material Description": e.target.value})} className="w-full px-5 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 shadow-inner font-bold" placeholder="Description..." />
            </div>
          </div>

          {/* Section 4: Shipping Info */}
          <div className="space-y-6 p-6 bg-blue-50/30 rounded-[2rem] border border-blue-100">
            <h3 className="text-sm font-black text-blue-600 uppercase tracking-widest border-b border-blue-100 pb-2">Shipping & Dispatch</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div>
                <label className="block text-xs font-black text-gray-400 mb-2 uppercase tracking-widest">Invoice Number</label>
                <input type="text" value={formData["Invoice Number"]} onChange={e => setFormData({...formData, "Invoice Number": e.target.value})} className="w-full px-4 py-2.5 bg-white border-none rounded-xl shadow-sm font-bold" />
              </div>
              <div>
                <label className="block text-xs font-black text-gray-400 mb-2 uppercase tracking-widest">INV DATE</label>
                <input type="date" value={formData["INV DATE"]} onChange={e => setFormData({...formData, "INV DATE": e.target.value})} className="w-full px-4 py-2.5 bg-white border-none rounded-xl shadow-sm font-bold" />
              </div>
              <div>
                <label className="block text-xs font-black text-gray-400 mb-2 uppercase tracking-widest">Truck No</label>
                <input type="text" value={formData["Truck No"]} onChange={e => setFormData({...formData, "Truck No": e.target.value})} className="w-full px-4 py-2.5 bg-white border-none rounded-xl shadow-sm font-bold" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div>
                <label className="block text-xs font-black text-gray-400 mb-2 uppercase tracking-widest">GC L/R No</label>
                <input type="text" value={formData["GC L/R No"]} onChange={e => setFormData({...formData, "GC L/R No": e.target.value})} className="w-full px-4 py-2.5 bg-white border-none rounded-xl shadow-sm font-bold" />
              </div>
              <div>
                <label className="block text-xs font-black text-gray-400 mb-2 uppercase tracking-widest">LR Date</label>
                <input type="date" value={formData["LR Date"]} onChange={e => setFormData({...formData, "LR Date": e.target.value})} className="w-full px-4 py-2.5 bg-white border-none rounded-xl shadow-sm font-bold" />
              </div>
              <div>
                <label className="block text-xs font-black text-gray-400 mb-2 uppercase tracking-widest">Road Permit</label>
                <input type="text" value={formData["Road Permit"]} onChange={e => setFormData({...formData, "Road Permit": e.target.value})} className="w-full px-4 py-2.5 bg-white border-none rounded-xl shadow-sm font-bold" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div>
                <label className="block text-xs font-black text-gray-400 mb-2 uppercase tracking-widest">Delivery</label>
                <input type="text" value={formData["DELIVERY"]} onChange={e => setFormData({...formData, "DELIVERY": e.target.value})} className="w-full px-4 py-2.5 bg-white border-none rounded-xl shadow-sm font-bold" />
              </div>
              <div>
                <label className="block text-xs font-black text-gray-400 mb-2 uppercase tracking-widest">DEL DATE</label>
                <input type="date" value={formData["DEL DATE"]} onChange={e => setFormData({...formData, "DEL DATE": e.target.value})} className="w-full px-4 py-2.5 bg-white border-none rounded-xl shadow-sm font-bold" />
              </div>
              <div>
                <label className="block text-xs font-black text-gray-400 mb-2 uppercase tracking-widest">DEL QTY</label>
                <input type="number" value={formData["DEL QTY"] || ''} onChange={e => setFormData({...formData, "DEL QTY": Number(e.target.value)})} className="w-full px-4 py-2.5 bg-white border-none rounded-xl shadow-sm font-bold" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-black text-gray-400 mb-2 uppercase tracking-widest">IND. SHIP. NUMBER</label>
                <input type="text" value={formData["IND. SHIP. NUMBER"]} onChange={e => setFormData({...formData, "IND. SHIP. NUMBER": e.target.value})} className="w-full px-4 py-2.5 bg-white border-none rounded-xl shadow-sm font-bold" />
              </div>
              <div>
                <label className="block text-xs font-black text-gray-400 mb-2 uppercase tracking-widest">COL SHP NO</label>
                <input type="text" value={formData["COL SHP NO"]} onChange={e => setFormData({...formData, "COL SHP NO": e.target.value})} className="w-full px-4 py-2.5 bg-white border-none rounded-xl shadow-sm font-bold" />
              </div>
            </div>
          </div>

          {/* Section 5: Ship To Info */}
          <div className="space-y-6">
            <h3 className="text-sm font-black text-indigo-600 uppercase tracking-widest border-b pb-2">Ship To Party</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div>
                <label className="block text-xs font-black text-gray-500 mb-2 uppercase tracking-widest">Ship To Party</label>
                <input type="text" value={formData["Ship To Party"]} onChange={e => setFormData({...formData, "Ship To Party": e.target.value})} className="w-full px-5 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 shadow-inner font-bold" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-black text-gray-500 mb-2 uppercase tracking-widest">Ship to Party Name</label>
                <input type="text" value={formData["Ship to Party Name"]} onChange={e => setFormData({...formData, "Ship to Party Name": e.target.value})} className="w-full px-5 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 shadow-inner font-bold" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-black text-gray-500 mb-2 uppercase tracking-widest">Ship to Destination</label>
              <input type="text" value={formData["Ship to Party Destination"]} onChange={e => setFormData({...formData, "Ship to Party Destination": e.target.value})} className="w-full px-5 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 shadow-inner font-bold" />
            </div>
          </div>

          {/* Section 6: Rejection & Notes */}
          <div className="space-y-6">
            <h3 className="text-sm font-black text-red-600 uppercase tracking-widest border-b pb-2">Rejection & Notes</h3>
            <div>
              <label className="block text-xs font-black text-gray-500 mb-2 uppercase tracking-widest">Reason for rejection</label>
              <input type="text" value={formData.reasonForRejection} onChange={e => setFormData({...formData, reasonForRejection: e.target.value})} className="w-full px-5 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-red-500 shadow-inner font-bold" />
            </div>
            <div>
              <label className="block text-xs font-black text-gray-500 mb-2 uppercase tracking-widest">Operational Notes</label>
              <textarea value={formData.note} onChange={(e) => setFormData({ ...formData, note: e.target.value })} className="w-full px-5 py-4 bg-gray-50 border-none rounded-[1.5rem] focus:ring-2 focus:ring-indigo-500 shadow-inner min-h-[100px] font-medium" placeholder="Internal memo..." />
            </div>
          </div>

          <div>
            <label className="block text-xs font-black text-gray-500 mb-3 uppercase tracking-widest">Attachments</label>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
              {formData.attachments.map((src, idx) => (
                <div key={idx} className="relative aspect-square rounded-2xl overflow-hidden border-2 border-white shadow-md group">
                  <img src={src} className="w-full h-full object-cover" alt="attachment" referrerPolicy="no-referrer" />
                  <button type="button" onClick={() => setFormData(p => ({ ...p, attachments: p.attachments.filter((_, i) => i !== idx) }))} className="absolute top-1.5 right-1.5 bg-red-500 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isProcessingImages} className="aspect-square rounded-2xl border-2 border-dashed border-gray-200 text-gray-400 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-500 flex flex-col items-center justify-center disabled:opacity-50 transition-all shadow-inner">
                {isProcessingImages ? <div className="w-6 h-6 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin"></div> : <><svg className="w-8 h-8 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M12 4v16m8-8H4" strokeWidth={2.5} /></svg><span className="text-[8px] font-black uppercase">Attach</span></>}
              </button>
            </div>
            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" multiple />
          </div>

          <div className="flex gap-4 pt-4">
            <button type="submit" disabled={isSaving} className={`flex-[2] text-white font-black py-5 rounded-2xl shadow-2xl transition-all active:scale-95 disabled:opacity-50 uppercase tracking-widest text-sm ${mode === StorageMode.ONLINE ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-200' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-100'}`}>
              {isSaving ? 'Processing...' : (editId ? 'Commit Changes' : 'Save Record')}
            </button>
            <button type="button" onClick={onCancel} className="flex-1 bg-gray-100 text-gray-500 font-black py-5 rounded-2xl hover:bg-gray-200 transition-colors uppercase tracking-widest text-xs">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddOrder;
