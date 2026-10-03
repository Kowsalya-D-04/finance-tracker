import axios from "axios";

/*
  Local development:
    VITE_API_URL is usually empty.
    Requests go to /api and Vite proxies them to:
    http://127.0.0.1:5000

  Render / Production:
    Set:
    VITE_API_URL=https://finance-tracker-8a6a.onrender.com

    Requests become:
    https://finance-tracker-8a6a.onrender.com/api/...
*/

const API_ROOT = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");

const api = axios.create({
  baseURL: `${API_ROOT}/api`,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

export const TOKEN_KEY = "pfm_token";

export function getToken() {
  return (
    localStorage.getItem(TOKEN_KEY) ||
    sessionStorage.getItem(TOKEN_KEY)
  );
}

export function setToken(token, remember = false) {
  if (remember) {
    localStorage.setItem(TOKEN_KEY, token);
    sessionStorage.removeItem(TOKEN_KEY);
  } else {
    sessionStorage.setItem(TOKEN_KEY, token);
    localStorage.removeItem(TOKEN_KEY);
  }
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
}

/*
  Attach JWT token automatically
*/
api.interceptors.request.use(
  (config) => {
    const token = getToken();

    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error),
);

/*
  Handle API errors globally
*/
api.interceptors.response.use(
  (response) => response,

  (error) => {
    const requestUrl = error.config?.url || "";

    // Backend is unreachable
    if (!error.response) {
      console.error("Backend connection failed:", error);

      error.userMessage =
        "Cannot reach the backend server. Please try again in a moment.";

      return Promise.reject(error);
    }

    // Expired / invalid authentication
    if (
      error.response.status === 401 &&
      !requestUrl.startsWith("/auth/login") &&
      !requestUrl.startsWith("/auth/register")
    ) {
      clearToken();

      if (!window.location.pathname.startsWith("/login")) {
        window.location.assign("/login?expired=1");
      }
    }

    // Provide a clean message for UI components
    error.userMessage =
      error.response?.data?.message ||
      "Something went wrong. Please try again.";

    return Promise.reject(error);
  },
);

/*
  Download CSV / PDF from authenticated endpoint
*/
export async function downloadFile(
  path,
  params = {},
  fallbackName = "download",
) {
  const response = await api.get(path, {
    params,
    responseType: "blob",
  });

  const disposition =
    response.headers["content-disposition"] || "";

  const match = disposition.match(
    /filename\*?=(?:UTF-8''|")?([^";]+)"?/i,
  );

  const filename = match
    ? decodeURIComponent(match[1])
    : fallbackName;

  const blobUrl = URL.createObjectURL(response.data);

  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(blobUrl);
}

export default api;