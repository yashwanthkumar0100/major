<<<<<<< HEAD
# Climate IndiaAI Infrastructure Observatory

## Local development

The frontend is a Vite app and the API is a separate FastAPI process. Run both in separate terminals from the repository root.

### 1. Install and start the API

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Check the API at <http://127.0.0.1:8000/api/health>.

### 2. Install and start the frontend

```powershell
npm install --prefix frontend
npm run dev --prefix frontend
```

Vite proxies `/api` to `http://127.0.0.1:8000`. If the API uses another address, set `API_PROXY_TARGET` before starting Vite. For a separately hosted production API, configure `VITE_API_BASE_URL` at frontend build time and set `ALLOWED_ORIGINS` on the API to explicit frontend origins.

If the API is unavailable, the UI clearly labels its embedded fallback records as demo data. Facility and risk records are prototype data; missing direct evidence links are disclosed rather than replaced with search links.

Place lookup uses OpenStreetMap Nominatim when the API is available, with a one-second typing debounce and a built-in approximate-location list for offline use. The map and search results identify the provider; production usage should follow Nominatim's current usage policy.

## Checks

```powershell
.\.venv\Scripts\python.exe -m pytest backend\test_main.py
npm run build --prefix frontend
npm run lint --prefix frontend
```
=======
# major
>>>>>>> de784f716a17d82db4180818800d130f94a6e317
