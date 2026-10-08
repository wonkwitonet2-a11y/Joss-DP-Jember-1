import React, { useState, useEffect, useRef } from "react";

interface NumberInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
  value: number;
  onChange: (val: number) => void;
  allowDecimal?: boolean;
  decimalPlaces?: number;
  min?: number;
  max?: number;
}

function formatDecimalDisplay(val: number | undefined | null, decimalPlaces = 2): string {
  if (val === undefined || val === null || isNaN(val)) return "0";
  const num = Number(val);
  return num.toLocaleString("id-ID", {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  });
}

function NumberInputInner({
  value,
  onChange,
  allowDecimal = false,
  decimalPlaces = 2,
  min,
  max,
  className = "",
  disabled = false,
  onFocus,
  onBlur,
  ...rest
}: NumberInputProps) {
  const isFocusedRef = useRef(false);

  const getInitialDisplay = () => {
    if (value === undefined || value === null || isNaN(value)) return "0";
    if (allowDecimal) {
      return formatDecimalDisplay(value, decimalPlaces);
    }
    return String(Math.trunc(value));
  };

  const [displayVal, setDisplayVal] = useState<string>(getInitialDisplay);

  // Sync displayVal when value prop changes externally
  useEffect(() => {
    if (isFocusedRef.current) return;
    const num = value !== undefined && value !== null && !isNaN(value) ? Number(value) : 0;
    if (allowDecimal) {
      const parsedCurrent = parseFloat(displayVal.replace(/\./g, "").replace(",", ".")) || 0;
      if (Math.abs(parsedCurrent - num) > 0.0001 || (num === 0 && displayVal !== "0" && displayVal !== "0,00")) {
        setDisplayVal(formatDecimalDisplay(num, decimalPlaces));
      }
    } else {
      const valTrunc = Math.trunc(num);
      const parsedCurrent = parseInt(displayVal, 10) || 0;
      if (parsedCurrent !== valTrunc || (valTrunc === 0 && displayVal !== "0" && displayVal !== "")) {
        setDisplayVal(String(valTrunc));
      }
    }
  }, [value, allowDecimal, decimalPlaces]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value;

    if (!allowDecimal) {
      // Strip any dot/comma and everything after it
      raw = raw.split(/[.,]/)[0];
      raw = raw.replace(/[^0-9-]/g, "");

      if (!raw || raw.trim() === "") {
        setDisplayVal("");
        let num = 0;
        if (min !== undefined && num < min) num = min;
        if (max !== undefined && num > max) num = max;
        onChange(num);
        return;
      }

      // Remove leading zeroes before digits (e.g. "05" -> "5", "00" -> "0")
      let sanitized = raw.replace(/^-?0+(?=\d)/, raw.startsWith("-") ? "-" : "");
      if (sanitized === "" || sanitized === "-") sanitized = "";

      let num = parseInt(sanitized, 10);
      if (isNaN(num)) num = 0;

      if (min !== undefined && num < min) num = min;
      if (max !== undefined && num > max) num = max;

      setDisplayVal(sanitized);
      onChange(num);
      return;
    }

    // Allow Decimal mode
    raw = raw.replace(/[^0-9.,-]/g, "");

    if (!raw || raw.trim() === "") {
      setDisplayVal("");
      let num = 0;
      if (min !== undefined && num < min) num = min;
      if (max !== undefined && num > max) num = max;
      onChange(num);
      return;
    }

    // Keep only the decimal separator (prefer comma if Indonesian, else dot)
    let workingRaw = raw;
    const commaIdx = workingRaw.lastIndexOf(",");
    if (commaIdx !== -1) {
      const beforeComma = workingRaw.slice(0, commaIdx).replace(/\./g, "");
      let afterComma = workingRaw.slice(commaIdx + 1).replace(/[.,]/g, "");
      if (decimalPlaces !== undefined) {
        afterComma = afterComma.slice(0, decimalPlaces);
      }
      workingRaw = `${beforeComma},${afterComma}`;
    } else {
      const dotIdx = workingRaw.lastIndexOf(".");
      if (dotIdx !== -1) {
        const beforeDot = workingRaw.slice(0, dotIdx).replace(/\./g, "");
        let afterDot = workingRaw.slice(dotIdx + 1).replace(/[.,]/g, "");
        if (decimalPlaces !== undefined) {
          afterDot = afterDot.slice(0, decimalPlaces);
        }
        workingRaw = `${beforeDot}.${afterDot}`;
      }
    }

    let sanitized = workingRaw;
    if (/^-?0+[1-9]/.test(sanitized)) {
      sanitized = sanitized.replace(/^-?0+/, sanitized.startsWith("-") ? "-" : "");
    }

    const normalizedForFloat = sanitized.replace(/\./g, "").replace(",", ".");
    let num = parseFloat(normalizedForFloat);
    if (isNaN(num)) num = 0;

    if (min !== undefined && num < min) num = min;
    if (max !== undefined && num > max) num = max;

    setDisplayVal(sanitized);
    onChange(Number(num.toFixed(decimalPlaces)));
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    isFocusedRef.current = true;
    e.target.select();
    if (onFocus) onFocus(e);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    isFocusedRef.current = false;
    if (allowDecimal) {
      const num = value !== undefined && value !== null && !isNaN(value) ? Number(value) : 0;
      setDisplayVal(formatDecimalDisplay(num, decimalPlaces));
    }
    if (onBlur) onBlur(e);
  };

  return (
    <input
      type="text"
      inputMode={allowDecimal ? "decimal" : "numeric"}
      value={displayVal}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onDragStart={(e) => e.preventDefault()}
      disabled={disabled}
      className={className}
      {...rest}
    />
  );
}

export const NumberInput = React.memo(NumberInputInner);
