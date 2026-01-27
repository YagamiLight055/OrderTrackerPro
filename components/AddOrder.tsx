
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
    customer: string;
    city: string;
    material: string;
    qty: number;
    status: string;
    note: string;
    attachments: string[];
    createdAt: string; // ISO string for the date input
  }>({
    uuid: crypto.randomUUID(),
    customer: '',
    city: '',
    material: '',
    qty: 0,
    status: 'Pending',
    note: '',
    attachments: [],
    createdAt: new Date().toISOString().split('T')[0]
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
          customers: distinct([...orders.map(o => o.customer), ...masterCustomers.map(c => c.name)]),
          cities: distinct([...orders.map(o => o.city), ...masterCities.map(c => c.name)]),
          materials: distinct([...orders.map(o => o.material), ...masterMaterials.map(m => m.name)]),
        });
      } else {
        const supabase = initSupabase();
        if (!supabase) return;
        
        const [ordersRes, customersRes, citiesRes, materialsRes] = await Promise.all([
           supabase.from('orders').select('customer, city, material'),
           supabase.from('customersMaster').select('name'),
           supabase.from('citiesMaster').select('name'),
           supabase.from('materialsMaster').select('name')
        ]);

        const distinct = (arr: string[]) => Array.from(new Set(arr.filter(Boolean).map(s => s.trim()))).sort();

        setOptions({
          customers: distinct([...(ordersRes.data?.map(o => o.customer) || []), ...(customersRes.data?.map(c => c.name) || [])]),
          cities: distinct([...(ordersRes.data?.map(o => o.city) || []), ...(citiesRes.data?.map(c => c.name) || [])]),
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
              customer: order.customer,
              city: order.city,
              material: order.material,
              qty: order.qty,
              status: order.status || 'Pending',
              note: order.note || '',
              attachments: order.attachments || [],
              createdAt: new Date(order.createdAt).toISOString().split('T')[0]
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
                 customer: data.customer,
                 city: data.city,
                 material: data.material,
                 qty: data.qty,
                 status: data.status,
                 note: data.note,
                 attachments: data.attachments || [],
                 createdAt: new Date(data.created_at).toISOString().split('T')[0]
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

    const { uuid, customer, city, material, qty, status, note, attachments, createdAt } = formData;
    
    if (!customer.trim() || !city.trim() || !material.trim() || qty <= 0 || !createdAt) {
      alert("Please fill all required fields.");
      return;
    }

    setIsSaving(true);
    const now = Date.now();
    
    // Use the selected date. We set time to 12:00 PM to avoid timezone shifting issues.
    const finalCreatedAt = new Date(`${createdAt}T12:00:00`).getTime();

    const orderData: Order = {
      uuid: uuid || crypto.randomUUID(),
      customer: customer.trim(),
      city: city.trim(),
      material: material.trim(),
      qty: Number(qty),
      status: status,
      note: note.trim(),
      attachments,
      createdAt: finalCreatedAt,
      updatedAt: now 
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
    <div className="max-w-xl mx-auto">
      <div className="bg-white rounded-[2.5rem] shadow-2xl p-8 border border-gray-100">
        <header className="mb-8 flex justify-between items-start">
          <div>
            <h2 className="text-3xl font-black text-gray-900 leading-tight uppercase tracking-tighter">
              {editId ? 'Edit Order' : 'Add Order'}
            </h2>
            <p className="text-gray-400 font-bold uppercase text-[10px] tracking-widest mt-1">Environment: {mode === StorageMode.ONLINE ? 'Cloud Live' : 'Standalone Local'}</p>
          </div>
          <div className={`w-3.5 h-3.5 rounded-full ${mode === StorageMode.ONLINE ? 'bg-blue-600 animate-pulse shadow-[0_0_12px_rgba(37,99,235,0.4)]' : 'bg-indigo-50 shadow-[0_0_12px_rgba(79,70,229,0.3)]'}`}></div>
        </header>

        <form onSubmit={handleSubmit} className="space-y-6">
          <AutocompleteInput
            label="Customer Name"
            value={formData.customer}
            onChange={(val) => setFormData({ ...formData, customer: val })}
            options={options.customers}
            placeholder="Search or enter client..."
            required
          />

          <AutocompleteInput
            label="Material"
            value={formData.material}
            onChange={(val) => setFormData({ ...formData, material: val })}
            options={options.materials}
            placeholder="Search material..."
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <AutocompleteInput
              label="Destination City"
              value={formData.city}
              onChange={(val) => setFormData({ ...formData, city: val })}
              options={options.cities}
              placeholder="Select city..."
              required
            />
            <div>
              <label className="block text-xs font-black text-gray-500 mb-2 uppercase tracking-widest">Quantity</label>
              <input
                type="number"
                value={formData.qty || ''}
                onChange={(e) => setFormData({ ...formData, qty: Number(e.target.value) })}
                className="w-full px-5 py-3.5 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500 shadow-inner font-black text-lg"
                required
                min="1"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-black text-gray-500 mb-2 uppercase tracking-widest">Order Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full px-5 py-3.5 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500 shadow-inner font-bold cursor-pointer"
              >
                {STATUS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-black text-gray-500 mb-2 uppercase tracking-widest">Order Date</label>
              <input
                type="date"
                value={formData.createdAt}
                onChange={(e) => setFormData({ ...formData, createdAt: e.target.value })}
                className="w-full px-5 py-3.5 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500 shadow-inner font-bold outline-none"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-black text-gray-500 mb-3 uppercase tracking-widest">Attachments</label>
            <div className="grid grid-cols-4 gap-3">
              {formData.attachments.map((src, idx) => (
                <div key={idx} className="relative aspect-square rounded-2xl overflow-hidden border-2 border-white shadow-md group">
                  <img src={src} className="w-full h-full object-cover" alt="attachment" />
                  <button 
                    type="button"
                    onClick={() => setFormData(p => ({ ...p, attachments: p.attachments.filter((_, i) => i !== idx) }))}
                    className="absolute top-1.5 right-1.5 bg-red-500 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessingImages}
                className="aspect-square rounded-2xl border-2 border-dashed border-gray-200 text-gray-400 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-500 flex flex-col items-center justify-center disabled:opacity-50 transition-all shadow-inner"
              >
                {isProcessingImages ? (
                   <div className="w-6 h-6 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                ) : (
                   <>
                    <svg className="w-8 h-8 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M12 4v16m8-8H4" strokeWidth={2.5} /></svg>
                    <span className="text-[8px] font-black uppercase">Attach</span>
                   </>
                )}
              </button>
            </div>
            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" multiple />
          </div>
          <div>
             <label className="block text-xs font-black text-gray-500 mb-2 uppercase tracking-widest">Operational Notes</label>
             <textarea
                value={formData.note}
                onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                className="w-full px-5 py-4 bg-gray-50 border-none rounded-[1.5rem] focus:ring-2 focus:ring-indigo-500 shadow-inner min-h-[100px] font-medium"
                placeholder="Internal memo..."
              />
          </div>
          <div className="flex gap-4 pt-4">
            <button 
              type="submit" 
              disabled={isSaving}
              className={`flex-[2] text-white font-black py-5 rounded-2xl shadow-2xl transition-all active:scale-95 disabled:opacity-50 uppercase tracking-widest text-sm ${mode === StorageMode.ONLINE ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-200' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'}`}
            >
              {isSaving ? 'Processing...' : (editId ? 'Commit Changes' : 'Save Order')}
            </button>
            <button type="button" onClick={onCancel} className="flex-1 bg-gray-100 text-gray-500 font-black py-5 rounded-2xl hover:bg-gray-200 transition-colors uppercase tracking-widest text-xs">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddOrder;
