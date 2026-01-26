
import React, { useState, useEffect, useRef } from 'react';

interface Props {
  label: string;
  value: string;
  onChange: (val: string) => void;
  options: string[];
  placeholder?: string;
  required?: boolean;
}

const AutocompleteInput: React.FC<Props> = ({ label, value, onChange, options, placeholder, required }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [filteredOptions, setFilteredOptions] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const search = value.toLowerCase().trim();
    if (!search) {
      setFilteredOptions(options.slice(0, 50));
    } else {
      setFilteredOptions(options.filter(opt => opt.toLowerCase().includes(search)).slice(0, 50));
    }
  }, [value, options]);

  return (
    <div className="relative w-full" ref={containerRef}>
      <label className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        placeholder={placeholder}
        className="w-full px-4 py-3 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500 shadow-inner font-medium text-gray-900 transition-all placeholder:text-gray-300"
        required={required}
      />
      
      {isOpen && filteredOptions.length > 0 && (
        <ul className="absolute z-50 w-full mt-2 bg-white border border-gray-100 rounded-2xl shadow-2xl max-h-64 overflow-auto py-2 animate-in slide-in-from-top-2 duration-200">
          {filteredOptions.map((option, idx) => (
            <li
              key={idx}
              className="px-5 py-3 hover:bg-indigo-50 cursor-pointer text-gray-700 font-medium border-b border-gray-50 last:border-none"
              onClick={() => {
                onChange(option);
                setIsOpen(false);
              }}
            >
              {option}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default AutocompleteInput;
