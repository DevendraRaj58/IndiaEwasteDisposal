# India E-Waste Map 🇮🇳♻️

An interactive web application for mapping e-waste disposal locations across India. Users can view existing locations and add new ones, with automatic geocoding and category-based marker colors.

![Python](https://img.shields.io/badge/Python-3.9+-blue.svg)
![Flask](https://img.shields.io/badge/Flask-3.0-green.svg)
![Leaflet](https://img.shields.io/badge/Leaflet-1.9-brightgreen.svg)

## Features

- 🗺️ **Interactive Leaflet map** centered on India with panning/zoom restrictions
- 📍 **Progressive geocoding** — enter State → City → Locality, map zooms with each entry
- 🎨 **Color-coded markers** for 3 e-waste categories:
  - 🔴 Large household appliances (fridges, ACs)
  - 🟠 Small appliances (TVs, ovens, fans)
  - 🔵 Mobile phones, laptops, parts
- 📋 **Copy contact to clipboard** with one click
- 🌙 **Dark theme** with glassmorphism aesthetics
- ♿ **Accessible** — keyboard navigation, ARIA labels
- 🐳 **Docker-ready** for easy deployment

---

## Quick Start (Local Development)

### Prerequisites

- Python 3.9 or higher
- pip (Python package manager)

### Setup

```bash
# 1. Navigate to project directory
cd IndiaEwasteDisposal

# 2. Create virtual environment
python -m venv venv

# 3. Activate virtual environment
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# 4. Install dependencies
pip install -r requirements.txt

# 5. Run the application
python app.py
```

Open your browser at **http://localhost:5000**

Two demo markers in Pune are automatically created on first run!

---

## Docker Deployment

### Using Docker Compose (Recommended)

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f app

# Stop services
docker-compose down

# Stop and remove data volume
docker-compose down -v
```

The app will be available at **http://localhost:5000**

### Using Docker Only

```bash
# Build the image
docker build -t india-ewaste-map .

# Run with SQLite (development)
docker run -p 5000:5000 india-ewaste-map

# Run with external Postgres
docker run -p 5000:5000 \
  -e DATABASE_URL=postgresql://user:pass@host:5432/dbname \
  india-ewaste-map
```

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `sqlite:///ewaste.db` | Database connection string |
| `GEOCODER` | `nominatim` | Geocoding service (`nominatim` or `mapbox`) |
| `GEOCODER_API_KEY` | _(empty)_ | API key for Mapbox geocoding |
| `PORT` | `5000` | Server port |
| `FLASK_DEBUG` | `True` | Enable debug mode (set `False` for production) |

### Using Environment Variables

Create a `.env` file in the project root:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/ewaste
GEOCODER=mapbox
GEOCODER_API_KEY=pk.your_mapbox_token_here
FLASK_DEBUG=False
```

---

## Geocoding Configuration

### Nominatim (Default)

The app uses [OpenStreetMap Nominatim](https://nominatim.org/) by default for geocoding. This is free but has rate limits:

> ⚠️ **Nominatim Rate Limits:**
> - Maximum 1 request per second
> - No bulk geocoding
> - Requires valid User-Agent header
> 
> For high-traffic production use, switch to Mapbox.

### Mapbox (Production)

For production environments, we recommend [Mapbox Geocoding API](https://www.mapbox.com/geocoding):

1. Create a free account at [mapbox.com](https://www.mapbox.com/)
2. Get your access token from the dashboard
3. Set environment variables:
   ```env
   GEOCODER=mapbox
   GEOCODER_API_KEY=pk.your_mapbox_token_here
   ```

Mapbox free tier includes 100,000 requests/month.

---

## Replacing India GeoJSON

The included `static/data/india.geojson` is a simplified placeholder. For production, replace it with an authoritative boundary file.

### Recommended Sources

1. **Natural Earth** (Public Domain)
   - https://www.naturalearthdata.com/downloads/10m-cultural-vectors/
   - Download: Admin 0 – Countries

2. **GADM** (Academic/Non-commercial)
   - https://gadm.org/download_country.html
   - Select "India" and download GeoJSON

3. **geoBoundaries** (Open Database License)
   - https://www.geoboundaries.org/
   - Search for India ADM0

### Replacing the File

1. Download GeoJSON from one of the sources above
2. Extract/copy India's boundary geometry
3. Replace `static/data/india.geojson`
4. Ensure the structure matches:
   ```json
   {
     "type": "FeatureCollection",
     "features": [{
       "type": "Feature",
       "properties": { "name": "India" },
       "geometry": { ... }
     }]
   }
   ```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Main HTML page |
| `GET` | `/api/markers` | Get all markers (JSON) |
| `POST` | `/api/markers` | Create a new marker |
| `DELETE` | `/api/markers/<id>` | Delete a marker |

### POST /api/markers

Request body:
```json
{
  "lat": 18.5204,
  "lng": 73.8567,
  "state": "Maharashtra",
  "city": "Pune",
  "locality": "Kothrud",
  "category": "devices",
  "contact": "+91 98765 43210"
}
```

Response (201 Created):
```json
{
  "id": 3,
  "lat": 18.5204,
  "lng": 73.8567,
  "state": "Maharashtra",
  "city": "Pune",
  "locality": "Kothrud",
  "category": "devices",
  "contact": "+91 98765 43210",
  "created_at": "2024-01-15T10:30:00"
}
```

---

## Security Recommendations

For production deployment:

### 1. Use HTTPS
Deploy behind a reverse proxy (nginx, Caddy) with TLS:

```nginx
server {
    listen 443 ssl;
    server_name ewaste.example.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 2. Rate Limiting
Add rate limiting to prevent abuse:

```nginx
# In nginx http block
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;

# In location block
location /api/ {
    limit_req zone=api burst=20 nodelay;
    proxy_pass http://localhost:5000;
}
```

### 3. Environment Security
- Never commit `.env` files with secrets
- Use Docker secrets or environment managers for sensitive values
- Set `FLASK_DEBUG=False` in production

### 4. Database
- Use PostgreSQL for production (not SQLite)
- Regular backups
- Strong passwords

---

## Project Structure

```
IndiaEwasteDisposal/
├── app.py              # Flask application & API routes
├── models.py           # SQLAlchemy models & seed logic
├── requirements.txt    # Python dependencies
├── Dockerfile          # Docker build configuration
├── docker-compose.yml  # Multi-container deployment
├── README.md           # This file
├── templates/
│   └── index.html      # Main HTML template
├── static/
│   ├── css/
│   │   └── styles.css  # Custom dark theme styles
│   ├── js/
│   │   └── map.js      # Leaflet map & form logic
│   └── data/
│       └── india.geojson  # India boundary (placeholder)
└── tests/
    └── test_api.py     # API endpoint tests
```

---

## Testing

Run the test suite:

```bash
# Activate virtual environment first
python -m pytest tests/ -v
```

---

## License

MIT License — feel free to use and modify for your projects.

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

---

Made with 💚 for India's e-waste recycling efforts
