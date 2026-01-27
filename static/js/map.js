/**
 * map.js - Interactive Leaflet map for India E-Waste Map
 * 
 * Features:
 * - India-restricted map with boundary overlay
 * - Geocoding integration (Nominatim/Mapbox)
 * - Custom colored markers for e-waste categories
 * - Progressive address input with auto-zoom
 * - Copy-to-clipboard for contact info
 * - Toast notifications
 */

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  // Map bounds for India (with padding for smoother UX)
  indiaBounds: {
    north: 37.5,
    south: 5.5,
    west: 66.0,
    east: 98.0
  },

  // Initial map view: center of India
  initialView: {
    lat: 22.5,
    lng: 82.5,
    zoom: 5
  },

  // Zoom levels for address hierarchy
  zoomLevels: {
    state: 7,
    city: 11,
    locality: 14
  },

  // Marker category colors
  categoryColors: {
    large: '#e53935',    // Red - Large appliances
    small: '#fb8c00',    // Orange - Small appliances
    devices: '#1e88e5'   // Blue - Phones, laptops
  },

  // Marker category colors (inactive/shutdown - pale versions)
  categoryColorsInactive: {
    large: '#b0b0b0',    // Grey
    small: '#c0c0c0',    // Light grey
    devices: '#a0a0a0'   // Grey
  },

  // Category labels for display
  categoryLabels: {
    large: 'Large household appliances',
    small: 'Small appliances',
    devices: 'Mobile phones & laptops'
  }
};

// Get geocoder config from page (injected by Flask)
const GEOCODER = window.APP_CONFIG?.geocoder || 'nominatim';
const GEOCODER_API_KEY = window.APP_CONFIG?.geocoderApiKey || '';


// ============================================================================
// State Management
// ============================================================================

const state = {
  map: null,
  markers: [],
  indiaLayer: null,
  tempMarker: null,       // Temporary marker during placement
  isPlacingMarker: false, // Flag for map click mode
  formData: {
    state: '',
    city: '',
    locality: '',
    category: 'large',
    contact: ''
  }
};


// ============================================================================
// Map Initialization
// ============================================================================

/**
 * Initialize the Leaflet map with India restrictions
 */
function initMap() {
  // Create map with bounds restriction
  const indiaBounds = L.latLngBounds(
    [CONFIG.indiaBounds.south, CONFIG.indiaBounds.west],
    [CONFIG.indiaBounds.north, CONFIG.indiaBounds.east]
  );

  state.map = L.map('map', {
    center: [CONFIG.initialView.lat, CONFIG.initialView.lng],
    zoom: CONFIG.initialView.zoom,
    minZoom: 4,
    maxZoom: 18,
    maxBounds: indiaBounds,
    maxBoundsViscosity: 0.9 // Slight resistance when hitting bounds
  });

  // Add tile layer (OpenStreetMap Standard - shows detailed POIs, buildings, landmarks)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
  }).addTo(state.map);

  // Load India GeoJSON boundary
  loadIndiaBoundary();

  // Load existing markers
  loadMarkers();

  // Map click handler for marker placement
  state.map.on('click', handleMapClick);
}


/**
 * Load and display India boundary from GeoJSON
 */
async function loadIndiaBoundary() {
  try {
    const response = await fetch('/static/data/india.geojson');
    const geojson = await response.json();

    // Add boundary layer with styling
    state.indiaLayer = L.geoJSON(geojson, {
      style: {
        color: '#10b981',      // Emerald green
        weight: 2,
        opacity: 0.5,
        fillColor: '#10b981',
        fillOpacity: 0.03
      }
    }).addTo(state.map);

  } catch (error) {
    console.warn('Could not load India boundary:', error);
    // Continue without boundary - not critical
  }
}


// ============================================================================
// Marker Management
// ============================================================================

/**
 * Load all markers from API and display on map
 */
async function loadMarkers() {
  try {
    const response = await fetch('/api/markers');
    const markers = await response.json();

    // Clear existing markers
    state.markers.forEach(m => m.remove());
    state.markers = [];

    // Add markers to map
    markers.forEach(addMarkerToMap);

  } catch (error) {
    console.error('Failed to load markers:', error);
    showToast('Failed to load markers', 'error');
  }
}


/**
 * Create a custom colored marker icon
 * @param {string} category - Category key (large, small, devices)
 * @param {boolean} isActive - Whether the marker is active (default true)
 * @returns {L.DivIcon} Custom Leaflet DivIcon
 */
function createMarkerIcon(category, isActive = true) {
  // Use pale grey colors for inactive/shutdown markers
  const colorSet = isActive ? CONFIG.categoryColors : CONFIG.categoryColorsInactive;
  const color = colorSet[category] || colorSet.devices;

  // SVG marker with drop shadow
  const svg = `
    <svg width="32" height="40" viewBox="0 0 32 40" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="shadow-${category}-${isActive}" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity="${isActive ? 0.4 : 0.2}"/>
        </filter>
      </defs>
      <path d="M16 0C7.16 0 0 7.16 0 16c0 12 16 24 16 24s16-12 16-24c0-8.84-7.16-16-16-16z" 
            fill="${color}" filter="url(#shadow-${category}-${isActive})" opacity="${isActive ? 1 : 0.7}"/>
      <circle cx="16" cy="16" r="6" fill="white"/>
    </svg>
  `;

  return L.divIcon({
    html: svg,
    className: 'custom-marker-wrapper',
    iconSize: [32, 40],
    iconAnchor: [16, 40],
    popupAnchor: [0, -40],
    tooltipAnchor: [16, -20]
  });
}


/**
 * Add a marker to the map with popup and tooltip
 * @param {Object} data - Marker data from API
 */
function addMarkerToMap(data) {
  // Use isActive to determine icon color (default to true for backward compatibility)
  const isActive = data.is_active !== false;
  const icon = createMarkerIcon(data.category, isActive);

  const marker = L.marker([data.lat, data.lng], { icon })
    .addTo(state.map);

  // Tooltip (shown on hover)
  const statusText = isActive ? '' : ' (SHUT DOWN)';
  const tooltipContent = `
    <strong>${data.locality}${statusText}</strong><br>
    ${data.city}, ${data.state}<br>
    <em>${CONFIG.categoryLabels[data.category]}</em>
  `;
  marker.bindTooltip(tooltipContent);

  // Popup (shown on click)
  const popupContent = createPopupContent(data);
  marker.bindPopup(popupContent);

  // Store reference
  marker.markerData = data;
  state.markers.push(marker);
}


/**
 * Create popup HTML content for a marker
 * @param {Object} data - Marker data
 * @returns {string} HTML content
 */
function createPopupContent(data) {
  const isActive = data.is_active !== false;

  // Google Maps directions URL (FREE - no API key needed)
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${data.lat},${data.lng}`;

  // If marker is shut down, show different content with reactivate option
  if (!isActive) {
    return `
      <div class="popup-content popup-shutdown">
        <div class="popup-shutdown-badge">⚠️ SHUT DOWN</div>
        <div class="popup-title">${escapeHtml(data.locality)}</div>
        <div class="popup-address">${escapeHtml(data.city)}, ${escapeHtml(data.state)}</div>
        <div class="popup-shutdown-message">This disposal centre has been shut down and is no longer operational.</div>
        <button class="popup-reactivate-btn" onclick="reactivateMarker(${data.id})">
          ✅ Mark as Operational
        </button>
      </div>
    `;
  }

  // Active marker - show full controls with edit button
  return `
    <div class="popup-content">
      <div class="popup-header">
        <div class="popup-title">${escapeHtml(data.locality)}</div>
        <button class="popup-edit-btn" onclick="showShutdownConfirm(${data.id})" title="Edit marker" aria-label="Edit marker">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
      </div>
      <div class="popup-address">${escapeHtml(data.city)}, ${escapeHtml(data.state)}</div>
      <div class="popup-actions">
        <div class="popup-contact" 
             onclick="copyContact('${escapeHtml(data.contact)}')" 
             title="Click to copy"
             role="button"
             tabindex="0"
             aria-label="Copy contact: ${escapeHtml(data.contact)}">
          <svg class="popup-contact-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          ${escapeHtml(data.contact)}
        </div>
        <a href="${directionsUrl}" 
           target="_blank" 
           rel="noopener noreferrer"
           class="popup-directions"
           title="Get directions in Google Maps"
           aria-label="Get directions to ${escapeHtml(data.locality)}">
          <svg class="popup-directions-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="3 11 22 2 13 21 11 13 3 11"></polygon>
          </svg>
          Directions
        </a>
      </div>
      <div id="shutdown-confirm-${data.id}" class="popup-shutdown-confirm" style="display: none;">
        <div class="shutdown-confirm-text">Mark as shut down?</div>
        <button class="shutdown-confirm-btn" onclick="shutdownMarker(${data.id})">
          ⚠️ Disposal Centre Shut Down
        </button>
      </div>
    </div>
  `;
}


/**
 * Show the shutdown confirmation in popup
 * @param {number} markerId - ID of the marker
 */
function showShutdownConfirm(markerId) {
  const confirmDiv = document.getElementById(`shutdown-confirm-${markerId}`);
  if (confirmDiv) {
    confirmDiv.style.display = confirmDiv.style.display === 'none' ? 'block' : 'none';
  }
}


/**
 * Shutdown a marker (mark as inactive)
 * @param {number} markerId - ID of the marker to shutdown
 */
async function shutdownMarker(markerId) {
  try {
    const response = await fetch(`/api/markers/${markerId}/shutdown`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error('Failed to shutdown marker');
    }

    const updatedData = await response.json();

    // Find and update the marker on the map
    const markerObj = state.markers.find(m => m.markerData && m.markerData.id === markerId);
    if (markerObj) {
      // Update marker icon to pale color
      const newIcon = createMarkerIcon(updatedData.category, false);
      markerObj.setIcon(newIcon);

      // Update popup content
      markerObj.setPopupContent(createPopupContent(updatedData));

      // Update stored data
      markerObj.markerData = updatedData;

      // Update tooltip
      const tooltipContent = `
        <strong>${updatedData.locality} (SHUT DOWN)</strong><br>
        ${updatedData.city}, ${updatedData.state}<br>
        <em>${CONFIG.categoryLabels[updatedData.category]}</em>
      `;
      markerObj.setTooltipContent(tooltipContent);
    }

    showToast('Disposal centre marked as shut down', 'success');

  } catch (error) {
    console.error('Shutdown error:', error);
    showToast('Failed to update marker status', 'error');
  }
}


/**
 * Reactivate a marker (mark as operational again)
 * @param {number} markerId - ID of the marker to reactivate
 */
async function reactivateMarker(markerId) {
  try {
    const response = await fetch(`/api/markers/${markerId}/reactivate`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error('Failed to reactivate marker');
    }

    const updatedData = await response.json();

    // Find and update the marker on the map
    const markerObj = state.markers.find(m => m.markerData && m.markerData.id === markerId);
    if (markerObj) {
      // Update marker icon back to active color
      const newIcon = createMarkerIcon(updatedData.category, true);
      markerObj.setIcon(newIcon);

      // Update popup content
      markerObj.setPopupContent(createPopupContent(updatedData));

      // Update stored data
      markerObj.markerData = updatedData;

      // Update tooltip
      const tooltipContent = `
        <strong>${updatedData.locality}</strong><br>
        ${updatedData.city}, ${updatedData.state}<br>
        <em>${CONFIG.categoryLabels[updatedData.category]}</em>
      `;
      markerObj.setTooltipContent(tooltipContent);
    }

    showToast('Disposal centre is now operational!', 'success');

  } catch (error) {
    console.error('Reactivate error:', error);
    showToast('Failed to reactivate marker', 'error');
  }
}


// ============================================================================
// Geocoding
// ============================================================================

/**
 * Geocode an address query restricted to India
 * @param {string} query - Search query
 * @param {string} type - Address type (state, city, locality)
 * @returns {Promise<Object|null>} Geocoding result with lat, lng, displayName
 */
async function geocode(query, type = 'locality') {
  if (!query.trim()) return null;

  try {
    if (GEOCODER === 'mapbox' && GEOCODER_API_KEY) {
      return await geocodeMapbox(query, type);
    } else {
      return await geocodeNominatim(query, type);
    }
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
}


/**
 * Geocode using Nominatim (OpenStreetMap)
 * NOTE: Nominatim has rate limits (1 request/second). For production, use Mapbox.
 */
async function geocodeNominatim(query, type) {
  // Build context-aware query
  let searchQuery = query;

  if (type === 'city' && state.formData.state) {
    searchQuery = `${query}, ${state.formData.state}, India`;
  } else if (type === 'locality' && state.formData.city) {
    searchQuery = `${query}, ${state.formData.city}, ${state.formData.state}, India`;
  } else {
    searchQuery = `${query}, India`;
  }

  const params = new URLSearchParams({
    q: searchQuery,
    format: 'json',
    countrycodes: 'IN',
    limit: 1,
    addressdetails: 1
  });

  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?${params}`,
    {
      headers: {
        'Accept': 'application/json',
        // Nominatim requires a valid User-Agent
        'User-Agent': 'IndiaEWasteMap/1.0'
      }
    }
  );

  const results = await response.json();

  if (results.length === 0) return null;

  const result = results[0];
  return {
    lat: parseFloat(result.lat),
    lng: parseFloat(result.lon),
    displayName: result.display_name
  };
}


/**
 * Geocode using Mapbox Geocoding API
 * Requires GEOCODER_API_KEY to be set
 */
async function geocodeMapbox(query, type) {
  let searchQuery = query;

  if (type === 'city' && state.formData.state) {
    searchQuery = `${query}, ${state.formData.state}`;
  } else if (type === 'locality' && state.formData.city) {
    searchQuery = `${query}, ${state.formData.city}`;
  }

  const params = new URLSearchParams({
    access_token: GEOCODER_API_KEY,
    country: 'IN',
    limit: 1
  });

  const response = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(searchQuery)}.json?${params}`
  );

  const data = await response.json();

  if (!data.features || data.features.length === 0) return null;

  const feature = data.features[0];
  return {
    lat: feature.center[1],
    lng: feature.center[0],
    displayName: feature.place_name
  };
}


// ============================================================================
// Form Handling
// ============================================================================

/**
 * Open the Add Location side panel
 */
function openModal() {
  const modal = document.getElementById('modal-overlay');
  const mapContainer = document.querySelector('.map-container');

  modal.classList.add('active');
  mapContainer.classList.add('panel-open');

  // Reset form state
  resetForm();

  // Enable marker placement mode immediately
  state.isPlacingMarker = true;
  showInstructionBanner('📍 Fill in location details, then click on the map to place marker');
  document.getElementById('map').style.cursor = 'crosshair';

  // Resize map after panel opens (Leaflet needs this)
  setTimeout(() => {
    state.map.invalidateSize();
    document.getElementById('input-state').focus();
  }, 300);
}


/**
 * Close the Add Location side panel
 */
function closeModal() {
  const modal = document.getElementById('modal-overlay');
  const mapContainer = document.querySelector('.map-container');

  modal.classList.remove('active');
  mapContainer.classList.remove('panel-open');

  // Clean up
  resetForm();
  hideInstructionBanner();

  // Remove temporary marker if exists
  if (state.tempMarker) {
    state.tempMarker.remove();
    state.tempMarker = null;
  }

  state.isPlacingMarker = false;
  document.getElementById('map').style.cursor = '';

  // Resize map after panel closes
  setTimeout(() => {
    state.map.invalidateSize();
  }, 300);
}


/**
 * Reset all form fields and state
 */
function resetForm() {
  state.formData = {
    state: '',
    city: '',
    locality: '',
    category: 'large',
    contact: ''
  };

  // Clear input values
  ['state', 'city', 'locality', 'contact'].forEach(field => {
    const input = document.getElementById(`input-${field}`);
    if (input) {
      input.value = '';
      input.classList.remove('success', 'error');
    }
  });

  // Reset category
  const categorySelect = document.getElementById('input-category');
  if (categorySelect) categorySelect.value = 'large';

  // Hide category preview
  updateCategoryPreview('large');

  // Clear error messages
  document.querySelectorAll('.form-error').forEach(el => el.remove());
}


/**
 * Handle keydown on address field (Enter = geocode and move to next)
 * @param {string} field - Field name (state, city, locality)
 * @param {KeyboardEvent} event - Keyboard event
 */
async function handleAddressKeydown(field, event) {
  if (event.key === 'Escape') {
    closeModal();
    return;
  }

  if (event.key !== 'Enter') return;
  event.preventDefault();

  const input = event.target;
  const value = input.value.trim();

  if (!value) {
    showFieldError(input, 'Please enter a value');
    return;
  }

  // Show loading state
  input.classList.remove('success', 'error');
  clearFieldError(input);

  // Geocode the address
  const result = await geocode(value, field);

  if (!result) {
    input.classList.add('error');
    showFieldError(input, 'Location not found. Please try a different spelling.');
    return;
  }

  // Success - update state and UI
  input.classList.add('success');
  state.formData[field] = value;

  // Zoom map to result
  const zoomLevel = CONFIG.zoomLevels[field];
  state.map.flyTo([result.lat, result.lng], zoomLevel, {
    duration: 1
  });

  // Move to next field or start placement mode
  if (field === 'state') {
    document.getElementById('input-city').focus();
  } else if (field === 'city') {
    document.getElementById('input-locality').focus();
  } else if (field === 'locality') {
    // All address fields complete - prompt for map click
    startMarkerPlacement();
  }
}


/**
 * Start marker placement mode
 */
function startMarkerPlacement() {
  state.isPlacingMarker = true;

  // Show instruction banner
  showInstructionBanner('📍 Click on the map to place your marker');

  // Change cursor
  document.getElementById('map').style.cursor = 'crosshair';
}


/**
 * Handle map click during marker placement
 * @param {L.LeafletMouseEvent} event - Leaflet click event
 */
function handleMapClick(event) {
  if (!state.isPlacingMarker) return;

  const { lat, lng } = event.latlng;

  // Remove previous temp marker
  if (state.tempMarker) {
    state.tempMarker.remove();
  }

  // Create temp marker
  const category = state.formData.category || 'large';
  const icon = createMarkerIcon(category);

  state.tempMarker = L.marker([lat, lng], { icon })
    .addTo(state.map);

  // Store coordinates
  state.formData.lat = lat;
  state.formData.lng = lng;

  // Update instruction
  showInstructionBanner('✓ Location selected! Fill in remaining details and click Save.');

  // Reset cursor
  document.getElementById('map').style.cursor = '';

  // Focus contact field
  document.getElementById('input-contact').focus();
}


/**
 * Update category preview dot color
 * @param {string} category - Category key
 */
function updateCategoryPreview(category) {
  const preview = document.getElementById('category-preview');
  if (!preview) return;

  const color = CONFIG.categoryColors[category];
  preview.style.backgroundColor = color;
  preview.style.color = color;
  preview.classList.add('visible');

  // Update temp marker if exists
  if (state.tempMarker) {
    const icon = createMarkerIcon(category);
    state.tempMarker.setIcon(icon);
  }
}


/**
 * Handle form submission
 */
async function submitForm() {
  // Validate all fields
  const requiredFields = ['state', 'city', 'locality', 'contact'];
  let isValid = true;

  for (const field of requiredFields) {
    const input = document.getElementById(`input-${field}`);
    const value = input.value.trim();

    if (!value) {
      showFieldError(input, 'This field is required');
      input.classList.add('error');
      isValid = false;
    } else {
      state.formData[field] = value;
    }
  }

  // Check if marker was placed
  if (!state.formData.lat || !state.formData.lng) {
    showToast('Please click on the map to place the marker location', 'error');
    return;
  }

  // Get category
  state.formData.category = document.getElementById('input-category').value;

  if (!isValid) return;

  // Submit to API
  try {
    const response = await fetch('/api/markers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(state.formData)
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Failed to save marker');
    }

    // Success
    showToast('Location added successfully!', 'success');

    // Remove temp marker and add permanent one
    if (state.tempMarker) {
      state.tempMarker.remove();
      state.tempMarker = null;
    }

    addMarkerToMap(result);
    closeModal();

  } catch (error) {
    console.error('Submit error:', error);
    showToast(error.message, 'error');
  }
}


// ============================================================================
// UI Helpers
// ============================================================================

/**
 * Show instruction banner at bottom of map
 * @param {string} message - Message to display
 */
function showInstructionBanner(message) {
  const banner = document.getElementById('instruction-banner');
  banner.innerHTML = message;
  banner.classList.add('active');
}


/**
 * Hide instruction banner
 */
function hideInstructionBanner() {
  const banner = document.getElementById('instruction-banner');
  banner.classList.remove('active');
}


/**
 * Show error message under a form field
 * @param {HTMLElement} input - Input element
 * @param {string} message - Error message
 */
function showFieldError(input, message) {
  clearFieldError(input);

  const error = document.createElement('div');
  error.className = 'form-error';
  error.textContent = message;
  error.setAttribute('role', 'alert');

  input.parentNode.appendChild(error);
}


/**
 * Clear error message from a form field
 * @param {HTMLElement} input - Input element
 */
function clearFieldError(input) {
  const existing = input.parentNode.querySelector('.form-error');
  if (existing) existing.remove();
}


/**
 * Show a toast notification
 * @param {string} message - Message to display
 * @param {string} type - Toast type (success, error)
 */
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');

  const icon = type === 'success'
    ? '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
    : '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';

  toast.innerHTML = `${icon}<span>${escapeHtml(message)}</span>`;

  container.appendChild(toast);

  // Remove after animation
  setTimeout(() => {
    toast.remove();
  }, 3000);
}


/**
 * Copy contact info to clipboard
 * @param {string} contact - Contact string to copy
 */
async function copyContact(contact) {
  try {
    // Modern clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(contact);
    } else {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = contact;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }

    showToast('Contact copied to clipboard!', 'success');

  } catch (error) {
    console.error('Copy failed:', error);
    showToast('Failed to copy contact', 'error');
  }
}


/**
 * Escape HTML special characters
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}


// ============================================================================
// Keyboard & Accessibility
// ============================================================================

/**
 * Handle global keyboard shortcuts
 */
function handleGlobalKeydown(event) {
  // Escape closes modal
  if (event.key === 'Escape') {
    const modal = document.getElementById('modal-overlay');
    if (modal.classList.contains('active')) {
      closeModal();
    }
  }
}


// ============================================================================
// Initialize Application
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  // Initialize map
  initMap();

  // Set up event listeners
  document.getElementById('btn-add-location').addEventListener('click', openModal);
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('btn-cancel').addEventListener('click', closeModal);
  document.getElementById('btn-save').addEventListener('click', submitForm);

  // Address field enter handlers
  document.getElementById('input-state').addEventListener('keydown', e => handleAddressKeydown('state', e));
  document.getElementById('input-city').addEventListener('keydown', e => handleAddressKeydown('city', e));
  document.getElementById('input-locality').addEventListener('keydown', e => handleAddressKeydown('locality', e));

  // Contact field enter handler (submits form)
  document.getElementById('input-contact').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitForm();
    } else if (e.key === 'Escape') {
      closeModal();
    }
  });

  // Category change handler
  document.getElementById('input-category').addEventListener('change', e => {
    updateCategoryPreview(e.target.value);
    state.formData.category = e.target.value;
  });

  // Global keyboard handler
  document.addEventListener('keydown', handleGlobalKeydown);
});
