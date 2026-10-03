import axios from "axios";

// Empty baseURL uses the Vite dev proxy (/api -> http://127.0.0.1:5000).
const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL || ""}/api`,
  timeout: 20000,
});

export const TOKEN_KEY = "pfm_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
}

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// If the token expires, clear it and send the user back to the login page.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const url = err.config?.url || "";
    if (err.response?.status === 401 && !url.startsWith("/auth/login") && !url.startsWith("/auth/register")) {
      localStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(TOKEN_KEY);
      if (!window.location.pathname.startsWith("/login")) {
        window.location.assign("/login?expired=1");
      }
    }
    return Promise.reject(err);
  },
);

// Download a CSV/PDF from an authenticated endpoint.
export async function downloadFile(path, params, fallbackName) {
  const res = await api.get(path, { params, responseType: "blob" });
  const disposition = res.headers["content-disposition"] || "";
  const match = disposition.match(/filename="?([^"]+)"?/);
  const url = URL.createObjectURL(res.data);
  const a = document.createElement("a");
  a.href = url;
  a.download = match ? match[1] : fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default api;
