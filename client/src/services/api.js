import axios from 'axios';
const apiBaseUrl = import.meta.env.VITE_API_URL ||
  'https://spendwise-api-97wv.onrender.com/api';
const api = axios.create({ baseURL: apiBaseUrl });
api.interceptors.request.use((c) => {
  const t = localStorage.getItem('token');
  if (t) c.headers.Authorization = 'Bearer ' + t;
  return c;
});
api.interceptors.response.use(
  (r) => r.data.data,
  (e) => Promise.reject(e.response?.data?.message || 'Network error, is the server running?'),
);
export default api;

