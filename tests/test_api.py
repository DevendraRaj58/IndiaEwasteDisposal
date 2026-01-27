"""
test_api.py - API endpoint tests for India E-Waste Map

Run with: python -m pytest tests/ -v
"""

import pytest
import json
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app, db
from models import Marker


@pytest.fixture
def client():
    """Create a test client with a temporary database."""
    app.config['TESTING'] = True
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
    
    with app.test_client() as client:
        with app.app_context():
            db.create_all()
        yield client


@pytest.fixture
def sample_marker():
    """Sample marker data for testing."""
    return {
        'lat': 18.5204,
        'lng': 73.8567,
        'state': 'Maharashtra',
        'city': 'Pune',
        'locality': 'Kothrud',
        'category': 'devices',
        'contact': '+91 98765 43210'
    }


class TestIndexPage:
    """Tests for the main page endpoint."""
    
    def test_index_returns_html(self, client):
        """GET / should return HTML page."""
        response = client.get('/')
        assert response.status_code == 200
        assert b'<!DOCTYPE html>' in response.data
        assert b'India E-Waste Map' in response.data
    
    def test_index_has_required_elements(self, client):
        """Main page should have map, legend, and add button."""
        response = client.get('/')
        html = response.data.decode('utf-8')
        
        assert 'id="map"' in html
        assert 'map-legend' in html
        assert 'btn-add-location' in html
        assert 'modal-overlay' in html


class TestGetMarkers:
    """Tests for GET /api/markers endpoint."""
    
    def test_get_markers_empty(self, client):
        """GET /api/markers should return empty array when no markers exist."""
        response = client.get('/api/markers')
        assert response.status_code == 200
        assert response.content_type == 'application/json'
        
        data = json.loads(response.data)
        assert isinstance(data, list)
    
    def test_get_markers_returns_created_marker(self, client, sample_marker):
        """GET /api/markers should return markers that were created."""
        # Create a marker first
        client.post(
            '/api/markers',
            data=json.dumps(sample_marker),
            content_type='application/json'
        )
        
        # Get markers
        response = client.get('/api/markers')
        data = json.loads(response.data)
        
        assert len(data) >= 1
        assert data[0]['locality'] == 'Kothrud'


class TestCreateMarker:
    """Tests for POST /api/markers endpoint."""
    
    def test_create_marker_success(self, client, sample_marker):
        """POST /api/markers should create a new marker."""
        response = client.post(
            '/api/markers',
            data=json.dumps(sample_marker),
            content_type='application/json'
        )
        
        assert response.status_code == 201
        
        data = json.loads(response.data)
        assert data['lat'] == sample_marker['lat']
        assert data['lng'] == sample_marker['lng']
        assert data['city'] == sample_marker['city']
        assert 'id' in data
    
    def test_create_marker_missing_fields(self, client):
        """POST /api/markers should reject incomplete data."""
        incomplete_data = {
            'lat': 18.5,
            'lng': 73.8
            # Missing required fields
        }
        
        response = client.post(
            '/api/markers',
            data=json.dumps(incomplete_data),
            content_type='application/json'
        )
        
        assert response.status_code == 400
        data = json.loads(response.data)
        assert 'error' in data
        assert 'Missing required fields' in data['error']
    
    def test_create_marker_invalid_coordinates(self, client, sample_marker):
        """POST /api/markers should reject non-numeric coordinates."""
        sample_marker['lat'] = 'not-a-number'
        
        response = client.post(
            '/api/markers',
            data=json.dumps(sample_marker),
            content_type='application/json'
        )
        
        assert response.status_code == 400
        data = json.loads(response.data)
        assert 'Invalid coordinates' in data['error']
    
    def test_create_marker_outside_india(self, client, sample_marker):
        """POST /api/markers should reject coordinates outside India."""
        sample_marker['lat'] = 40.0  # Outside India
        sample_marker['lng'] = 100.0
        
        response = client.post(
            '/api/markers',
            data=json.dumps(sample_marker),
            content_type='application/json'
        )
        
        assert response.status_code == 400
        data = json.loads(response.data)
        assert 'India' in data['error']
    
    def test_create_marker_invalid_category(self, client, sample_marker):
        """POST /api/markers should reject invalid categories."""
        sample_marker['category'] = 'invalid-category'
        
        response = client.post(
            '/api/markers',
            data=json.dumps(sample_marker),
            content_type='application/json'
        )
        
        assert response.status_code == 400
        data = json.loads(response.data)
        assert 'Invalid category' in data['error']
    
    def test_create_marker_all_categories(self, client, sample_marker):
        """POST /api/markers should accept all valid categories."""
        for category in ['large', 'small', 'devices']:
            sample_marker['category'] = category
            sample_marker['locality'] = f'Test-{category}'  # Make unique
            
            response = client.post(
                '/api/markers',
                data=json.dumps(sample_marker),
                content_type='application/json'
            )
            
            assert response.status_code == 201


class TestDeleteMarker:
    """Tests for DELETE /api/markers/<id> endpoint."""
    
    def test_delete_marker_success(self, client, sample_marker):
        """DELETE /api/markers/<id> should remove an existing marker."""
        # Create marker first
        create_response = client.post(
            '/api/markers',
            data=json.dumps(sample_marker),
            content_type='application/json'
        )
        marker_id = json.loads(create_response.data)['id']
        
        # Delete it
        response = client.delete(f'/api/markers/{marker_id}')
        assert response.status_code == 200
        
        # Verify it's gone
        get_response = client.get('/api/markers')
        markers = json.loads(get_response.data)
        assert not any(m['id'] == marker_id for m in markers)
    
    def test_delete_marker_not_found(self, client):
        """DELETE /api/markers/<id> should return 404 for non-existent marker."""
        response = client.delete('/api/markers/99999')
        assert response.status_code == 404


class TestStaticFiles:
    """Tests for static file serving."""
    
    def test_india_geojson_served(self, client):
        """Static GeoJSON file should be accessible."""
        response = client.get('/static/data/india.geojson')
        assert response.status_code == 200
        
        data = json.loads(response.data)
        assert data['type'] == 'FeatureCollection'
        assert 'features' in data


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
