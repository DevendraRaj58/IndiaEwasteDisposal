"""
app.py - Flask application for India E-Waste Map

Main entry point for the web application. Provides routes for:
- Serving the main UI page
- CRUD API endpoints for e-waste markers
- Static file serving for GeoJSON data

Configuration via environment variables:
- DATABASE_URL: Database connection string (default: SQLite)
- GEOCODER: Geocoding service ('nominatim' or 'mapbox')
- GEOCODER_API_KEY: API key for Mapbox (if using)
- PORT: Server port (default: 5000)
"""

import os
from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

# Load environment variables from .env file if present
load_dotenv()

# Import database models
from models import db, Marker, init_db, seed_demo_markers


def create_app():
    """
    Application factory function.
    Creates and configures the Flask application instance.
    """
    app = Flask(__name__)
    
    # Enable CORS for API endpoints (useful for development)
    CORS(app)
    
    # Database configuration
    # Uses DATABASE_URL env var for production (Postgres), falls back to SQLite
    database_url = os.getenv('DATABASE_URL', 'sqlite:///ewaste.db')
    
    # Handle Heroku-style postgres:// URLs (need postgresql://)
    if database_url.startswith('postgres://'):
        database_url = database_url.replace('postgres://', 'postgresql://', 1)
    
    app.config['SQLALCHEMY_DATABASE_URI'] = database_url
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    
    # Geocoder configuration (passed to frontend via template)
    app.config['GEOCODER'] = os.getenv('GEOCODER', 'nominatim')
    app.config['GEOCODER_API_KEY'] = os.getenv('GEOCODER_API_KEY', '')
    
    # Initialize database with app
    db.init_app(app)
    
    # Create tables and seed demo data
    init_db(app)
    seed_demo_markers(app)
    
    return app


# Create the application instance
app = create_app()


# ============================================================================
# India Boundary Validation
# ============================================================================

# India bounding box (approximate)
# Used for quick validation; Shapely recommended for precise polygon check
INDIA_BOUNDS = {
    'min_lat': 6.5,    # Southern tip (Kanyakumari area)
    'max_lat': 35.7,   # Northern tip (Kashmir area)
    'min_lng': 68.1,   # Western tip (Gujarat coast)
    'max_lng': 97.4    # Eastern tip (Arunachal Pradesh)
}


def is_point_in_india(lat, lng):
    """
    Check if a coordinate point lies within India's bounding box.
    
    For stricter validation using the actual India polygon,
    you can use Shapely with the india.geojson file:
    
    ```python
    from shapely.geometry import Point, shape
    import json
    
    with open('static/data/india.geojson') as f:
        india_geojson = json.load(f)
    india_polygon = shape(india_geojson['features'][0]['geometry'])
    point = Point(lng, lat)  # Note: GeoJSON uses (lng, lat) order
    return india_polygon.contains(point)
    ```
    
    Args:
        lat: Latitude coordinate
        lng: Longitude coordinate
    
    Returns:
        bool: True if point is within India bounds
    """
    return (
        INDIA_BOUNDS['min_lat'] <= lat <= INDIA_BOUNDS['max_lat'] and
        INDIA_BOUNDS['min_lng'] <= lng <= INDIA_BOUNDS['max_lng']
    )


# ============================================================================
# Routes
# ============================================================================

@app.route('/')
def index():
    """
    Serve the main UI page.
    Passes geocoder configuration to the frontend template.
    """
    return render_template(
        'index.html',
        geocoder=app.config['GEOCODER'],
        geocoder_api_key=app.config['GEOCODER_API_KEY']
    )


@app.route('/api/markers', methods=['GET'])
def get_markers():
    """
    Get all e-waste markers.
    
    Returns:
        JSON array of all markers with their details
    """
    markers = Marker.query.all()
    return jsonify([marker.to_dict() for marker in markers])


@app.route('/api/markers', methods=['POST'])
def create_marker():
    """
    Create a new e-waste marker.
    
    Expected JSON body:
    {
        "lat": float,
        "lng": float,
        "state": string,
        "city": string,
        "locality": string,
        "category": string ("large" | "small" | "devices"),
        "contact": string
    }
    
    Returns:
        201: Created marker data
        400: Validation error
    """
    data = request.get_json()
    
    # Validate required fields
    required_fields = ['lat', 'lng', 'state', 'city', 'locality', 'category', 'contact']
    missing_fields = [field for field in required_fields if field not in data]
    
    if missing_fields:
        return jsonify({
            'error': f'Missing required fields: {", ".join(missing_fields)}'
        }), 400
    
    # Validate coordinate types
    try:
        lat = float(data['lat'])
        lng = float(data['lng'])
    except (ValueError, TypeError):
        return jsonify({'error': 'Invalid coordinates: lat and lng must be numbers'}), 400
    
    # Validate point is within India
    if not is_point_in_india(lat, lng):
        return jsonify({
            'error': 'Location must be within India boundaries'
        }), 400
    
    # Validate category
    valid_categories = ['large', 'small', 'devices']
    if data['category'] not in valid_categories:
        return jsonify({
            'error': f'Invalid category. Must be one of: {", ".join(valid_categories)}'
        }), 400
    
    # Create new marker
    marker = Marker(
        lat=lat,
        lng=lng,
        state=data['state'].strip(),
        city=data['city'].strip(),
        locality=data['locality'].strip(),
        category=data['category'],
        contact=data['contact'].strip()
    )
    
    db.session.add(marker)
    db.session.commit()
    
    return jsonify(marker.to_dict()), 201


@app.route('/api/markers/<int:marker_id>', methods=['DELETE'])
def delete_marker(marker_id):
    """
    Delete a marker by ID.
    
    Args:
        marker_id: ID of the marker to delete
    
    Returns:
        200: Success message
        404: Marker not found
    """
    marker = Marker.query.get(marker_id)
    
    if not marker:
        return jsonify({'error': 'Marker not found'}), 404
    
    db.session.delete(marker)
    db.session.commit()
    
    return jsonify({'message': 'Marker deleted successfully'})


@app.route('/api/markers/<int:marker_id>/shutdown', methods=['PUT'])
def shutdown_marker(marker_id):
    """
    Mark a disposal centre as shut down.
    
    Args:
        marker_id: ID of the marker to shutdown
    
    Returns:
        200: Updated marker data
        404: Marker not found
    """
    marker = Marker.query.get(marker_id)
    
    if not marker:
        return jsonify({'error': 'Marker not found'}), 404
    
    # Set is_active to False
    marker.is_active = False
    db.session.commit()
    
    return jsonify(marker.to_dict())


@app.route('/api/markers/<int:marker_id>/reactivate', methods=['PUT'])
def reactivate_marker(marker_id):
    """
    Mark a disposal centre as operational again.
    
    Args:
        marker_id: ID of the marker to reactivate
    
    Returns:
        200: Updated marker data
        404: Marker not found
    """
    marker = Marker.query.get(marker_id)
    
    if not marker:
        return jsonify({'error': 'Marker not found'}), 404
    
    # Set is_active to True
    marker.is_active = True
    db.session.commit()
    
    return jsonify(marker.to_dict())


# ============================================================================
# Error Handlers
# ============================================================================

@app.errorhandler(404)
def not_found(error):
    """Handle 404 errors."""
    return jsonify({'error': 'Resource not found'}), 404


@app.errorhandler(500)
def server_error(error):
    """Handle 500 errors."""
    return jsonify({'error': 'Internal server error'}), 500


# ============================================================================
# Main Entry Point
# ============================================================================

if __name__ == '__main__':
    # Get port from environment variable or use default
    port = int(os.getenv('PORT', 5000))
    
    # Run development server
    # In production, use gunicorn: gunicorn app:app
    app.run(
        host='0.0.0.0',
        port=port,
        debug=os.getenv('FLASK_DEBUG', 'True').lower() == 'true'
    )
