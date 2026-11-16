import { useRef, useState } from 'react';
import { siGooglepay, siPhonepe, siPaytm, siIcicibank } from 'simple-icons';
import Icon from '../theme/Icon';
import FloatingPanel from './FloatingPanel';

function BrandSvg({ icon }) {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
      <path d={icon.path} />
    </svg>
  );
}

const iconDetails = {
  'All payment methods': { mark: <Icon name="wallet" />, tone: 'other' },
  Cash: { mark: <Icon name="income" />, tone: 'cash' },
  Navi: { mark: 'N', tone: 'navi' },
  GPay: { mark: <BrandSvg icon={siGooglepay} />, tone: 'gpay' },
  PhonePe: { mark: <BrandSvg icon={siPhonepe} />, tone: 'phonepe' },
  Paytm: { mark: <BrandSvg icon={siPaytm} />, tone: 'paytm' },
  YONO: { mark: 'Y', tone: 'yono' },
  ICICI: { mark: <BrandSvg icon={siIcicibank} />, tone: 'icici' },
  Overseas: { mark: <Icon name="globe" />, tone: 'overseas' },
  'Debit Card': { mark: <Icon name="debitCard" />, tone: 'card' },
  'Credit Card': { mark: <Icon name="card" />, tone: 'card' },
  'Bank Transfer': { mark: <Icon name="bank" />, tone: 'bank' },
  Other: { mark: <Icon name="more" />, tone: 'other' },
};

function AppMark({ method }) {
  const { mark, tone } = iconDetails[method] || { mark: <Icon name="wallet" />, tone: 'other' };
  return <span className={`payment-app-icon ${tone}`} aria-hidden="true">{mark}</span>;
}

export const isUpiApp = (method) =>
  ['Navi', 'GPay', 'PhonePe', 'Paytm', 'YONO', 'ICICI', 'Overseas'].includes(method);

export const formatPaymentMethod = (method) =>
  isUpiApp(method) ? `UPI · ${method}` : method || 'Cash';

export function PaymentMethodBadge({ method }) {
  return (
    <span className="payment-method-badge">
      <AppMark method={method || 'Cash'} />
      <span>{formatPaymentMethod(method || 'Cash')}</span>
    </span>
  );
}

export default function PaymentMethodSelect({
  value,
  onChange,
  options,
  ariaLabel,
  id,
  className = '',
  align = 'start',
}) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);

  return (
    <div className={`payment-method-picker ${className}`} ref={root}>
      <button
        id={id}
        type="button"
        className="form-select payment-method-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="payment-method-current">
          <AppMark method={value} />
          <span>{formatPaymentMethod(value)}</span>
        </span>
      </button>
      <FloatingPanel
        anchor={root}
        open={open}
        onClose={() => setOpen(false)}
        align={align}
        matchWidth
        className="payment-method-menu"
        role="listbox"
        aria-label={ariaLabel}
      >
          {options.map((method) => (
            <button
              key={method}
              type="button"
              role="option"
              aria-selected={value === method}
              className={`payment-method-option${value === method ? ' selected' : ''}`}
              onClick={() => {
                onChange(method);
                setOpen(false);
              }}
            >
              <AppMark method={method} />
              <span>{formatPaymentMethod(method)}</span>
              {value === method && <Icon name="check" className="ms-auto" />}
            </button>
          ))}
      </FloatingPanel>
    </div>
  );
}
