import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import type { ModaKey } from '../types/logistics';
import { MODA_ORDER } from '../utils/logisticsEngine';

interface ModaFilterDropdownProps {
  value: ModaKey[];
  onChange: (modas: ModaKey[]) => void;
}

const MODA_DOT_CLASS: Record<ModaKey, string> = {
  'Self Drive': 'bg-sky-600',
  'Car Carrier': 'bg-teal-600',
  Shipment: 'bg-amber-500',
  Transporter: 'bg-indigo-500',
};

export const ModaFilterDropdown: React.FC<ModaFilterDropdownProps> = ({
  value,
  onChange,
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const toggleModa = (moda: ModaKey) => {
    if (value.includes(moda)) {
      onChange(value.filter((m) => m !== moda));
    } else {
      const next = MODA_ORDER.filter((m) => m === moda || value.includes(m));
      onChange(next.length === MODA_ORDER.length ? [] : next);
    }
  };

  const isFiltered = value.length > 0;

  const triggerLabel =
    value.length === 0
      ? 'Moda: Semua'
      : value.length === 1
        ? `Moda: ${value[0]}`
        : value.length === 2
          ? `${value[0]}, ${value[1]}`
          : `${value.length} Moda dipilih`;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="Filter Moda"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className={`flex h-9 w-full items-center justify-between gap-2 rounded-xl px-3 text-left text-xs font-medium transition-colors focus:ring-2 focus:ring-teal-600/25 focus:outline-none ${
          open
            ? 'bg-white text-slate-900 ring-2 ring-teal-600/25 dark:bg-slate-800 dark:text-slate-100'
            : 'bg-slate-100/90 text-slate-800 hover:bg-slate-200/70 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700/80'
        }`}
      >
        <span className="truncate">{triggerLabel}</span>
        <span className="flex shrink-0 items-center gap-1">
          {isFiltered && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Hapus filter moda"
              onClick={(e) => {
                e.stopPropagation();
                onChange([]);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  onChange([]);
                }
              }}
              className="rounded-md p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
            >
              <X className="h-3 w-3" />
            </span>
          )}
          <ChevronDown
            className={`h-3.5 w-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-multiselectable="true"
          aria-label="Pilih Moda"
          className="absolute right-0 left-0 z-40 mt-1.5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 dark:border-slate-800">
            <button
              type="button"
              onClick={() => onChange([])}
              className={`text-[11px] font-semibold transition-colors ${
                !isFiltered
                  ? 'text-teal-700 dark:text-teal-400'
                  : 'text-slate-500 hover:text-teal-700 dark:text-slate-400 dark:hover:text-teal-400'
              }`}
            >
              Semua Moda
            </button>
            {isFiltered && (
              <span className="text-[11px] text-slate-400 dark:text-slate-500">
                {value.length} dipilih
              </span>
            )}
          </div>

          <div className="py-1">
            {MODA_ORDER.map((moda) => {
              const checked = value.includes(moda);
              return (
                <button
                  key={moda}
                  type="button"
                  role="option"
                  aria-selected={checked}
                  onClick={() => toggleModa(moda)}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors ${
                    checked
                      ? 'bg-teal-50/80 font-semibold text-teal-800 dark:bg-teal-950/50 dark:text-teal-300'
                      : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800/80'
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                      checked
                        ? 'border-teal-600 bg-teal-600 text-white dark:border-teal-500 dark:bg-teal-500'
                        : 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800'
                    }`}
                  >
                    {checked && <Check className="h-3 w-3 stroke-[2.5]" />}
                  </span>
                  <span className={`h-2 w-2 shrink-0 rounded-full ${MODA_DOT_CLASS[moda]}`} />
                  <span className="truncate">{moda}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
