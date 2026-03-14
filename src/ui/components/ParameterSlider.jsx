/**
 * ParameterSlider - A beautiful, interactive parameter control
 * Supports linear and logarithmic scales
 */
import React, { useState, useCallback } from 'react';
import './ParameterSlider.css';

const ParameterSlider = ({
  label,
  unit,
  min,
  max,
  value,
  onChange,
  description,
  logarithmic = false,
  step,
}) => {
  const [isDragging, setIsDragging] = useState(false);

  // Convert between linear slider position and actual value
  const toSlider = useCallback((val) => {
    if (logarithmic && min > 0) {
      const logMin = Math.log10(min);
      const logMax = Math.log10(max);
      return ((Math.log10(Math.max(val, min)) - logMin) / (logMax - logMin)) * 100;
    }
    return ((val - min) / (max - min)) * 100;
  }, [min, max, logarithmic]);

  const fromSlider = useCallback((sliderVal) => {
    if (logarithmic && min > 0) {
      const logMin = Math.log10(min);
      const logMax = Math.log10(max);
      return Math.pow(10, logMin + (sliderVal / 100) * (logMax - logMin));
    }
    return min + (sliderVal / 100) * (max - min);
  }, [min, max, logarithmic]);

  const handleChange = (e) => {
    const sliderValue = parseFloat(e.target.value);
    const actualValue = fromSlider(sliderValue);
    onChange(actualValue);
  };

  const sliderPosition = toSlider(value);

  // Format display value
  const displayValue = value >= 1000
    ? value.toExponential(2)
    : value >= 1
      ? value.toFixed(2)
      : value >= 0.01
        ? value.toFixed(4)
        : value.toExponential(2);

  // Color gradient based on position
  const gradient = `linear-gradient(90deg, 
    var(--accent-blue) 0%, 
    var(--accent-blue) ${sliderPosition}%, 
    var(--bg-secondary) ${sliderPosition}%, 
    var(--bg-secondary) 100%)`;

  return (
    <div className={`param-slider ${isDragging ? 'dragging' : ''}`}>
      <div className="param-header">
        <span className="param-label">{label}</span>
        <span className="param-value">
          {displayValue} <span className="param-unit">{unit}</span>
        </span>
      </div>
      {description && <div className="param-description">{description}</div>}
      <div className="slider-container">
        <input
          type="range"
          min="0"
          max="100"
          step="0.1"
          value={sliderPosition}
          onChange={handleChange}
          onMouseDown={() => setIsDragging(true)}
          onMouseUp={() => setIsDragging(false)}
          className="slider-input"
          style={{ background: gradient }}
        />
        <div className="slider-range">
          <span>{logarithmic && min > 0 ? min.toExponential(1) : min}</span>
          <span>{logarithmic && max > 0 ? max.toExponential(1) : max}</span>
        </div>
      </div>
    </div>
  );
};

export default ParameterSlider;
