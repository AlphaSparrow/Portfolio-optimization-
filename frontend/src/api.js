import axios from 'axios';

const apiBaseUrl = import.meta.env.VITE_API_URL
  ? (import.meta.env.VITE_API_URL.endsWith('/api') ? import.meta.env.VITE_API_URL : `${import.meta.env.VITE_API_URL}/api`)
  : '/api';

const api = axios.create({
  baseURL: apiBaseUrl,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 120000,
});

// Response interceptor for consistent error handling
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const message = error.response?.data?.detail || error.message || 'API request failed';
    console.error('API Error:', message);
    return Promise.reject(new Error(message));
  }
);

export const fetchInstruments = () => api.get('/instruments');
export const optimizePortfolio = (payload) => api.post('/optimize', payload);
export const runWalkForwardBacktest = (payload) => api.post('/backtest', payload);
export const getPortfolioState = () => api.get('/portfolio/state');
export const rebalancePortfolio = (payload) => api.post('/portfolio/rebalance', payload);
export const placeManualOrder = (payload) => api.post('/portfolio/order', payload);
export const resetPortfolio = () => api.post('/portfolio/reset');
export const getEfficientFrontier = (symbols, covariance) =>
  api.get(`/analytics/frontier?symbols=${symbols.join(',')}&covariance=${covariance}`);
export const getAttribution = (symbols) =>
  api.get(`/analytics/attribution${symbols && symbols.length ? `?symbols=${symbols.join(',')}` : ''}`);
export const getUpstoxStatus = () => api.get('/upstox/status');
export const updateUpstoxConfig = (payload) => api.post('/upstox/config', payload);
export const fetchStrategies = () => api.get('/strategies');
export const runStrategy = (payload) => api.post('/strategies/run', payload);
export const getPortfolioBenchmarks = () => api.get('/portfolio/benchmarks');
export const getParetoFrontier = (symbols, covariance = 'ledoit_wolf') =>
  api.get(`/pareto_frontier?symbols=${symbols ? symbols.join(',') : ''}&covariance=${covariance}`);
export const getMarketOverview = () => api.get('/market/overview');
export const getCustomCodeTemplates = () => api.get('/strategies/custom-code/templates');
export const executeCustomStrategyCode = (payload) => api.post('/strategies/custom-code/execute', payload);

export default api;

