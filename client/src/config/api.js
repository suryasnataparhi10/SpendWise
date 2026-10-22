const API_BASE_URLS = {
  local: 'http://localhost:5000/api',
  render: 'https://spendwise-api-97wv.onrender.com/api',
};

const selectedTarget = import.meta.env.VITE_API_TARGET === 'local' ? 'local' : 'render';

// VITE_API_URL can override the named targets for another deployment.
export const API_BASE_URL = (import.meta.env.VITE_API_URL || API_BASE_URLS[selectedTarget]).replace(/\/$/, '');
export { API_BASE_URLS };
