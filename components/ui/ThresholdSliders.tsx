import React from 'react';
import { ThresholdConfig } from '../../types';

interface ThresholdSlidersProps {
  thresholds: ThresholdConfig;
  onChange: (thresholds: ThresholdConfig) => void;
  disabled?: boolean;
}

interface SliderConfig {
  key: keyof ThresholdConfig;
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
}

const sliderConfigs: SliderConfig[] = [
  {
    key: 'representationTarget',
    label: 'Representation Target',
    description: 'Score above which a participant is considered well-represented',
    min: 0.3,
    max: 0.9,
    step: 0.05,
    format: (v) => v.toFixed(2)
  },
  {
    key: 'matchingThreshold',
    label: 'Matching Threshold',
    description: 'Minimum similarity for sentence-to-input matching',
    min: 0.2,
    max: 0.7,
    step: 0.05,
    format: (v) => v.toFixed(2)
  },
  {
    key: 'isolationPercentile',
    label: 'Isolation Percentile',
    description: 'Top X% of isolated participants are considered "distinct"',
    min: 0.1,
    max: 0.5,
    step: 0.05,
    format: (v) => `${(v * 100).toFixed(0)}%`
  },
  {
    key: 'representationPercentile',
    label: 'At-Risk Percentile',
    description: 'Bottom X% by representation are flagged as at-risk',
    min: 0.1,
    max: 0.5,
    step: 0.05,
    format: (v) => `${(v * 100).toFixed(0)}%`
  },
  {
    key: 'anomalyZThreshold',
    label: 'Anomaly Z-Threshold',
    description: 'Standard deviations from mean to flag as anomaly',
    min: 1.0,
    max: 3.0,
    step: 0.5,
    format: (v) => `${v.toFixed(1)}σ`
  }
];

export const ThresholdSliders: React.FC<ThresholdSlidersProps> = ({
  thresholds,
  onChange,
  disabled = false
}) => {
  const handleSliderChange = (key: keyof ThresholdConfig, value: number) => {
    onChange({ ...thresholds, [key]: value });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-700">Analysis Thresholds</div>
        <button
          onClick={() => onChange({
            representationTarget: 0.6,
            matchingThreshold: 0.45,
            isolationPercentile: 0.25,
            representationPercentile: 0.25,
            anomalyZThreshold: 2.0
          })}
          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
          disabled={disabled}
        >
          Reset to Defaults
        </button>
      </div>

      {sliderConfigs.map((config) => (
        <div key={config.key} className="space-y-1">
          <div className="flex justify-between items-center">
            <label className="text-xs font-medium text-slate-600">
              {config.label}
            </label>
            <span className="text-xs font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-700">
              {config.format(thresholds[config.key])}
            </span>
          </div>

          <input
            type="range"
            min={config.min}
            max={config.max}
            step={config.step}
            value={thresholds[config.key]}
            onChange={(e) => handleSliderChange(config.key, parseFloat(e.target.value))}
            disabled={disabled}
            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer
                       disabled:opacity-50 disabled:cursor-not-allowed
                       [&::-webkit-slider-thumb]:appearance-none
                       [&::-webkit-slider-thumb]:w-4
                       [&::-webkit-slider-thumb]:h-4
                       [&::-webkit-slider-thumb]:bg-blue-600
                       [&::-webkit-slider-thumb]:rounded-full
                       [&::-webkit-slider-thumb]:cursor-pointer
                       [&::-webkit-slider-thumb]:shadow-md
                       [&::-webkit-slider-thumb]:hover:bg-blue-700
                       [&::-moz-range-thumb]:w-4
                       [&::-moz-range-thumb]:h-4
                       [&::-moz-range-thumb]:bg-blue-600
                       [&::-moz-range-thumb]:border-none
                       [&::-moz-range-thumb]:rounded-full
                       [&::-moz-range-thumb]:cursor-pointer"
          />

          <p className="text-[10px] text-slate-400">{config.description}</p>
        </div>
      ))}
    </div>
  );
};

// Default thresholds
export const DEFAULT_THRESHOLDS: ThresholdConfig = {
  representationTarget: 0.6,
  matchingThreshold: 0.45,
  isolationPercentile: 0.25,
  representationPercentile: 0.25,
  anomalyZThreshold: 2.0
};

export default ThresholdSliders;
