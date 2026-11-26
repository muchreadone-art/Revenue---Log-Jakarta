import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { formatMonthLabel } from '../utils/formatters';

interface MonthFilterDropdownProps {
  value: string[];
  options: string[];
  onChange: (months: string[]) => void;
}

export const MonthFilterDropdown: React.FC<MonthFilterDropdownProps> = ({
  value,
  options,
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

  const toggleMonth = (month: string) => {
    if (value.includes(month)) {
      onChange(value.filter((m) => m !== month));
    } else {
      const next = [...value, month].sort();
      onChange(next.length === options.length ? [] : next);
    }
  };

  const isFiltered = value.length > 0;

  const triggerLabel =
    value.length === 0
      ? 'Periode: Semua Bulan'
      : value.length === 1
        ? formatMonthLabel(value[0])
        : value.length === 2
          ? `${formatMonthLabel(value[0])}, ${formatMonthLabel(value[1])}`
          : `${value.length} Bulan dipilih`;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="Filter Bulan Periode"
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
              aria-label="Hapus filter bulan"
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
          aria-label="Pilih Bulan Periode"
          className="absolute right-0 left-0 z-40 mt-1.5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          {/* Header actions */}
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
              Semua Bulan
            </button>
            {isFiltered && (
              <span className="text-[11px] text-slate-400 dark:text-slate-500">
                {value.length} dipilih
              </span>
            )}
          </div>

          {/* Checkbox list */}
          <div className="max-h-64 overflow-y-auto py-1">
            {options.map((m) => {
              const checked = value.includes(m);
              return (
                <button
                  key={m}
                  type="button"
                  role="option"
                  aria-selected={checked}
                  onClick={() => toggleMonth(m)}
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
                  <span className="truncate">{formatMonthLabel(m)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
