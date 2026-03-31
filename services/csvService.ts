
// We use a global script for PapaParse in index.html to avoid import issues,
// but we'll use window.Papa in our functions.
declare const Papa: any;

const formatDateToCustom = (timestamp: any): string => {
  if (!timestamp) return '';
  const d = new Date(isNaN(timestamp) ? timestamp : Number(timestamp));
  if (isNaN(d.getTime())) return String(timestamp);
  
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
};

export const exportToCSV = (data: any[], filename: string) => {
  if (typeof Papa === 'undefined') {
    alert("CSV Library (PapaParse) is not available. Please check your internet connection.");
    return;
  }

  // Pre-process: Format dates to dd.mm.yyyy and stringify nested arrays
  const processedData = data.map(item => {
    const newItem = { ...item };
    
    // Format known date fields
    const dateFields = [
      'SO DATE', 'INV DATE', 'DEL DATE', 'LR Date', 
      'createdAt', 'updatedAt', 
      'so_date', 'inv_date', 'del_date', 'lr_date', 
      'created_at', 'updated_at'
    ];
    dateFields.forEach(field => {
      if (newItem[field]) {
        newItem[field] = formatDateToCustom(newItem[field]);
      }
    });

    if (newItem.attachments && Array.isArray(newItem.attachments)) {
      newItem.attachments = JSON.stringify(newItem.attachments);
    }
    if (newItem.orderUuids && Array.isArray(newItem.orderUuids)) {
      newItem.orderUuids = JSON.stringify(newItem.orderUuids);
    }
    
    // Remove internal IDs for cleaner backup if needed, but keeping for LWW
    return newItem;
  });

  try {
    const csv = Papa.unparse(processedData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    setTimeout(() => URL.revokeObjectURL(url), 100);
  } catch (error) {
    console.error("Export error:", error);
    alert("Error generating CSV.");
  }
};

export const parseCSV = (file: File): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    if (typeof Papa === 'undefined') {
      reject(new Error("PapaParse not loaded"));
      return;
    }
    Papa.parse(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: (results: any) => resolve(results.data),
      error: (error: any) => reject(error)
    });
  });
};
