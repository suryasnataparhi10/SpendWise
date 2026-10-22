import { useState } from 'react';

export default function PasswordInput({ className = 'form-control', wrapperClassName = '', ...props }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className={`input-group ${wrapperClassName}`.trim()}>
      <input {...props} className={className} type={visible ? 'text' : 'password'} />
      <button
        type="button"
        className="btn btn-outline-secondary"
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        onClick={() => setVisible((current) => !current)}
      >
        <i className={`bi ${visible ? 'bi-eye-slash' : 'bi-eye'}`} aria-hidden="true" />
      </button>
    </div>
  );
}
