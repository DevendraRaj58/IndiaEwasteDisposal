"""
models.py - SQLAlchemy database models for India E-Waste Map

This module defines the Marker and User models for storing e-waste disposal
locations and user accounts, and includes seed logic for first-run setup.
"""

import random
from datetime import datetime
from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash

# Initialize SQLAlchemy instance (will be bound to Flask app in app.py)
db = SQLAlchemy()


class User(UserMixin, db.Model):
    """
    User model for authentication and role-based access control.

    Roles:
        'admin' - Full access: add, edit, shutdown, reactivate, delete markers
        'user'  - Read-only: view map, contact info, directions, legend
    """
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    role = db.Column(db.String(20), nullable=False, default='user')

    def set_password(self, password):
        """Hash and store the password."""
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        """Verify a password against the stored hash."""
        return check_password_hash(self.password_hash, password)

    @property
    def is_admin(self):
        """Check if the user has admin role."""
        return self.role == 'admin'


class Marker(db.Model):
    """
    Marker model representing an e-waste disposal location.
    
    Attributes:
        id: Primary key
        lat: Latitude coordinate
        lng: Longitude coordinate
        state: State name (e.g., "Maharashtra")
        city: City name (e.g., "Pune")
        locality: Locality/area name (e.g., "Kothrud")
        category: One of 'large', 'small', or 'devices'
        contact: Contact information (phone/email)
        created_at: Timestamp of creation
    """
    __tablename__ = 'markers'
    
    id = db.Column(db.Integer, primary_key=True)
    lat = db.Column(db.Float, nullable=False)
    lng = db.Column(db.Float, nullable=False)
    state = db.Column(db.String(100), nullable=False)
    city = db.Column(db.String(100), nullable=False)
    locality = db.Column(db.String(200), nullable=False)
    # Category: 'large' (household appliances), 'small' (TVs, ovens), 'devices' (phones, laptops)
    category = db.Column(db.String(20), nullable=False)
    contact = db.Column(db.String(200), nullable=False)
    # is_active: True = operational, False = shut down
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def to_dict(self):
        """Serialize marker to dictionary for JSON response."""
        return {
            'id': self.id,
            'lat': self.lat,
            'lng': self.lng,
            'state': self.state,
            'city': self.city,
            'locality': self.locality,
            'category': self.category,
            'contact': self.contact,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


def init_db(app):
    """
    Initialize database tables within Flask app context.
    Creates all tables if they don't exist.
    """
    with app.app_context():
        db.create_all()


def seed_demo_markers(app):
    """
    Seed database with 2 randomized demo markers in Pune if the DB is empty.
    
    Each marker gets a random jitter around central Pune coordinates
    (lat 18.5204, lon 73.8567) to demonstrate the map functionality.
    """
    with app.app_context():
        # Only seed if no markers exist
        if Marker.query.count() == 0:
            # Base Pune coordinates
            base_lat = 18.5204
            base_lng = 73.8567
            
            # Demo localities in Pune
            demo_data = [
                {
                    'locality': 'Kothrud',
                    'category': 'large',
                    'contact': '+91 98765 43210'
                },
                {
                    'locality': 'Shivaji Nagar',
                    'category': 'devices',
                    'contact': '+91 87654 32109'
                }
            ]
            
            for data in demo_data:
                # Add random jitter (±0.02 degrees, roughly 2km)
                jitter_lat = random.uniform(-0.02, 0.02)
                jitter_lng = random.uniform(-0.02, 0.02)
                
                marker = Marker(
                    lat=base_lat + jitter_lat,
                    lng=base_lng + jitter_lng,
                    state='Maharashtra',
                    city='Pune',
                    locality=data['locality'],
                    category=data['category'],
                    contact=data['contact']
                )
                db.session.add(marker)
            
            db.session.commit()
            print("[OK] Seeded 2 demo markers in Pune")


def seed_users(app):
    """
    Seed database with default admin and user accounts if no users exist.

    Default credentials (DEMO ONLY):
        admin / admin123
        user  / user123
    """
    with app.app_context():
        if User.query.count() == 0:
            admin = User(username='admin', role='admin')
            admin.set_password('admin123')

            user = User(username='user', role='user')
            user.set_password('user123')

            db.session.add_all([admin, user])
            db.session.commit()
            print("[OK] Seeded default users (admin, user)")
