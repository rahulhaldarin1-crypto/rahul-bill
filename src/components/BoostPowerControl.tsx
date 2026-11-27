import React from 'react';
import { Minus, Plus, Zap } from 'lucide-react';
import { clampBoostPercentage } from '../utils/smartDiscovery';

interface BoostPowerControlProps {
  value: number;
  onChange: (nextPct: number) => void;
  disabled?: boolean;
  compact?: boolean;
  label?: string;
}

export const BoostPowerControl: React.FC<BoostPowerControlProps> = ({
  value,
  onChange,
  disabled = false,
  compact = false,
  label = 'Boost Power (1% – 100%)',
}) => {
  const safeVal = clampBoostPercentage(value, 50);

  const handleStep = (delta: number) => {
    if (disabled) return;
    onChange(clampBoostPercentage(safeVal + delta, safeVal));
  };

  const handleManualInput = (raw: string) => {
    if (disabled) return;
    const digitsOnly = raw.replace(/[^0-9]/g, '');
    if (!digitsOnly) {
      onChange(1);
      return;
    }
    const parsed = Number(digitsOnly);
    if (Number.isFinite(parsed)) {
      onChange(clampBoostPercentage(parsed, safeVal));
    }
  };

  return (
    <div
      className={`rounded-xl border border-[#E6D9EE] bg-[#FDFBFE] ${
        compact ? 'p-2.5 space-y-2' : 'p-3.5 space-y-2.5'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#4A3B59]">
          <Zap className="w-3.5 h-3.5 text-[#DB2777]" />
          <span>{label}</span>
        </span>

        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={disabled || safeVal <= 1}
            onClick={() => handleStep(-5)}
            className="rounded-lg border border-[#E6D9EE] bg-white px-1.5 py-1 text-[10px] font-bold text-[#5B4B6B] hover:border-[#9333EA] hover:text-[#7E22CE] disabled:opacity-45 cursor-pointer"
            title="Decrease by 5%"
          >
            -5%
          </button>
          <button
            type="button"
            disabled={disabled || safeVal <= 1}
            onClick={() => handleStep(-1)}
            aria-label="Decrease boost percentage by 1%"
            className="rounded-lg border border-[#E6D9EE] bg-white p-1 text-[#5B4B6B] hover:border-[#9333EA] hover:text-[#7E22CE] disabled:opacity-45 cursor-pointer"
          >
            <Minus className="w-3 h-3" />
          </button>

          <div className="inline-flex items-center rounded-lg border border-[#D8B4FE] bg-white px-1.5 py-0.5 focus-within:border-[#9333EA]">
            <input
              type="number"
              min={1}
              max={100}
              step={1}
              disabled={disabled}
              value={safeVal}
              onChange={(e) => handleManualInput(e.target.value)}
              aria-label="Boost percentage from 1 to 100"
              className="w-11 text-center font-mono-num text-xs font-bold text-[#7E22CE] bg-transparent focus:outline-none"
            />
            <span className="text-[11px] font-bold text-[#6B5B7B] pr-0.5">%</span>
          </div>

          <button
            type="button"
            disabled={disabled || safeVal >= 100}
            onClick={() => handleStep(1)}
            aria-label="Increase boost percentage by 1%"
            className="rounded-lg border border-[#E6D9EE] bg-white p-1 text-[#5B4B6B] hover:border-[#9333EA] hover:text-[#7E22CE] disabled:opacity-45 cursor-pointer"
          >
            <Plus className="w-3 h-3" />
          </button>
          <button
            type="button"
            disabled={disabled || safeVal >= 100}
            onClick={() => handleStep(5)}
            className="rounded-lg border border-[#E6D9EE] bg-white px-1.5 py-1 text-[10px] font-bold text-[#5B4B6B] hover:border-[#9333EA] hover:text-[#7E22CE] disabled:opacity-45 cursor-pointer"
            title="Increase by 5%"
          >
            +5%
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <span className="text-[10px] font-mono-num font-semibold text-[#6B5B7B] w-6 shrink-0">
          1%
        </span>
        <input
          type="range"
          min={1}
          max={100}
          step={1}
          disabled={disabled}
          value={safeVal}
          onChange={(e) =>
            onChange(clampBoostPercentage(Number(e.target.value), safeVal))
          }
          className="w-full accent-[#DB2777] cursor-pointer disabled:opacity-50"
        />
        <span className="text-[10px] font-mono-num font-semibold text-[#6B5B7B] w-8 text-right shrink-0">
          100%
        </span>
      </div>
    </div>
  );
};
