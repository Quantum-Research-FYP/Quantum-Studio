import { useEffect, useRef, useState } from 'react';
import type { GateParamSpec } from '../../circuit';
import { formatAngleDisplay } from '../../circuit';

const PRESETS = [
  { label: '0',    value: 0 },
  { label: 'π/8',  value: Math.PI / 8 },
  { label: 'π/4',  value: Math.PI / 4 },
  { label: 'π/3',  value: Math.PI / 3 },
  { label: 'π/2',  value: Math.PI / 2 },
  { label: 'π',    value: Math.PI },
  { label: '3π/2', value: 3 * Math.PI / 2 },
  { label: '-π/4', value: -Math.PI / 4 },
  { label: '-π/2', value: -Math.PI / 2 },
  { label: '-π',   value: -Math.PI },
];

interface AngleInputDialogProps {
  gateLabel: string;
  paramSpecs: GateParamSpec[];
  onConfirm: (values: Record<string, number>) => void;
  onCancel: () => void;
}

export default function AngleInputDialog({
  gateLabel,
  paramSpecs,
  onConfirm,
  onCancel,
}: AngleInputDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [values, setValues] = useState<Record<string, number>>(
    Object.fromEntries(paramSpecs.map((p) => [p.key, p.defaultValue])),
  );
  const [rawInputs, setRawInputs] = useState<Record<string, string>>(
    Object.fromEntries(paramSpecs.map((p) => [p.key, ''])),
  );

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const setPreset = (key: string, value: number) => {
    setValues((v) => ({ ...v, [key]: value }));
    setRawInputs((v) => ({ ...v, [key]: '' }));
  };

  const setCustom = (key: string, text: string) => {
    setRawInputs((v) => ({ ...v, [key]: text }));
    const n = parseFloat(text);
    if (!isNaN(n)) setValues((v) => ({ ...v, [key]: n }));
  };

  return (
    <dialog ref={ref} className="dialog angle-dialog" onCancel={onCancel}>
      <div className="dialog__content">
        <h2 className="dialog__title">Set angle — {gateLabel}</h2>
        {paramSpecs.map((spec) => (
          <div key={spec.key} className="angle-dialog__param">
            <div className="angle-dialog__param-label">{spec.label}</div>
            <div className="angle-dialog__presets">
              {PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  className={`angle-dialog__preset${
                    Math.abs(values[spec.key] - preset.value) < 1e-10
                      ? ' angle-dialog__preset--active'
                      : ''
                  }`}
                  onClick={() => setPreset(spec.key, preset.value)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="angle-dialog__custom-row">
              <input
                type="number"
                step="any"
                className="form-field__input angle-dialog__field"
                placeholder="Custom (radians)"
                value={rawInputs[spec.key]}
                onChange={(e) => setCustom(spec.key, e.target.value)}
              />
              <span className="angle-dialog__current">
                = {formatAngleDisplay(values[spec.key])}
              </span>
            </div>
          </div>
        ))}
        <div className="dialog__actions">
          <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => onConfirm(values)}
          >
            Apply
          </button>
        </div>
      </div>
    </dialog>
  );
}
