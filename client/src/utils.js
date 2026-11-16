export const PAY = ['Cash', 'Navi', 'GPay', 'PhonePe', 'Paytm', 'YONO', 'ICICI', 'Overseas', 'Debit Card', 'Credit Card', 'Bank Transfer', 'Other'];
export const inr = (n) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0);
export const today = () => new Date().toISOString().slice(0, 10);
export const fmtDate = (d) =>
  new Date(d).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
