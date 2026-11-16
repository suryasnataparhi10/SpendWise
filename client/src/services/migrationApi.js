import axios from 'axios';
import api from './api';
import { API_BASE_URL } from '../config/api';

// Client for the Database Migration & Portability Center. All database work happens on the
// server; this module only sends requests and moves package/report files.
const BASE = '/admin/migration';
const authHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};
const errorMessage = async (error) => {
  const data = error.response?.data;
  if (data instanceof Blob) {
    try {
      return JSON.parse(await data.text()).message || 'Request failed';
    } catch {
      return 'Request failed';
    }
  }
  return data?.message || 'Network error, is the server running?';
};

export const migrationApi = {
  access: () => api.get(`${BASE}/access`),
  overview: () => api.get(`${BASE}/overview`),
  jobs: (type) => api.get(`${BASE}/jobs`, { params: type ? { type } : {} }),
  job: (id) => api.get(`${BASE}/jobs/${id}`),
  createExport: (source, passphrase) => api.post(`${BASE}/exports`, { source, passphrase }),
  analyze: (id, passphrase, destination) => api.post(`${BASE}/imports/${id}/analyze`, { passphrase, destination }),
  conflicts: (id, params) => api.get(`${BASE}/imports/${id}/conflicts`, { params }),
  decide: (id, body) => api.post(`${BASE}/imports/${id}/decisions`, body),
  preview: (id, strategy) => api.get(`${BASE}/imports/${id}/preview`, { params: { strategy } }),
  execute: (id, strategy, confirmation) => api.post(`${BASE}/imports/${id}/execute`, { strategy, confirmation }),
  resume: (id) => api.post(`${BASE}/jobs/${id}/resume`),
  discard: (id) => api.post(`${BASE}/imports/${id}/discard`),
  backups: () => api.get(`${BASE}/backups`),
  restore: (id, confirmation) => api.post(`${BASE}/backups/${id}/restore`, { confirmation }),
  audit: (page) => api.get(`${BASE}/audit`, { params: { page } }),

  async upload(file, onProgress) {
    try {
      const response = await axios.post(`${API_BASE_URL}${BASE}/imports`, file, {
        headers: { ...authHeader(), 'Content-Type': 'application/octet-stream', 'X-File-Name': file.name },
        onUploadProgress: (event) => event.total && onProgress?.(Math.round((event.loaded / event.total) * 100)),
      });
      return response.data.data;
    } catch (error) {
      throw await errorMessage(error);
    }
  },

  async download(path, filename) {
    try {
      const response = await axios.get(`${API_BASE_URL}${BASE}${path}`, { headers: authHeader(), responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      throw await errorMessage(error);
    }
  },
};
