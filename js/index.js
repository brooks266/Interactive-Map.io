import { auth, db, onAuthStateChanged, signOut, collection, addDoc,
         getDocs, doc, getDoc, updateDoc, deleteDoc, query, where,
         orderBy, serverTimestamp } from './firebase-config.js';
import { showLoading, showError, showSuccess, handleError } from './utils.js';

// Wait for DOM and deferred scripts to load
document.addEventListener('DOMContentLoaded', function() {
    let map;
    let markers;
    let allMarkers = [];
    let searchTimeout;
    let creationMode = false;
    let tempMarker = null;
    let clickLat, clickLon;
    let currentUser = null;
    let currentUserData = null;
    let editingLocationId = null;

    // Session Check: Redirect to login if not authenticated
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = './login.html';
            return;
        }

        currentUser = user;

        // Load user profile from Firestore
        try {
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            if (userDoc.exists()) {
                currentUserData = userDoc.data();
            }
        } catch (error) {
            console.error('Error loading user profile:', error);
        }

        // Initialize map after authentication
        initializeMap();
    });

    function initializeMap() {
        // Initialize the map with default view (will be updated if geolocation succeeds)
        map = L.map('map').setView([39.8283, -98.5795], 4);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);

        markers = L.markerClusterGroup({
            maxClusterRadius: 50,
            spiderfyOnMaxZoom: true,
            showCoverageOnHover: true,
            zoomToBoundsOnClick: true
        });

        // Try to get user's location and center map on it
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                // Success callback
                function(position) {
                    const userLat = position.coords.latitude;
                    const userLon = position.coords.longitude;

                    // Center map on user's location with closer zoom
                    map.setView([userLat, userLon], 13);

                    console.log(`Map centered on user location: ${userLat.toFixed(6)}, ${userLon.toFixed(6)}`);
                },
                // Error callback
                function(error) {
                    console.log('Geolocation error or denied:', error.message);
                    console.log('Using default map center (US)');
                },
                // Options
                {
                    enableHighAccuracy: false,
                    timeout: 5000,
                    maximumAge: 0
                }
            );
        } else {
            console.log('Geolocation not supported by browser. Using default map center.');
        }

        // Load locations from Firestore
        loadLocationsFromFirestore();

        // Event listeners
        document.getElementById('add-btn').addEventListener('click', toggleCreationMode);
        document.getElementById('search').addEventListener('input', handleSearch);
        document.getElementById('settings-btn').addEventListener('click', () => {
            window.location.href = './settings.html';
        });
        document.getElementById('submit-location-btn').addEventListener('click', submitNewLocation);
        document.getElementById('cancel-location-btn').addEventListener('click', cancelNewLocation);
        document.getElementById('update-location-btn').addEventListener('click', updateLocation);
        document.getElementById('delete-location-btn').addEventListener('click', deleteLocation);
        document.getElementById('cancel-edit-btn').addEventListener('click', cancelEdit);

        // PWA: Register Service Worker
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js')
                .then(registration => console.log('SW registered: ', registration))
                .catch(error => console.log('SW registration failed: ', error));
        }

        // PWA: Offline Detection
        window.addEventListener('online', () => {
            document.getElementById('offline-message').style.display = 'none';
        });
        window.addEventListener('offline', () => {
            document.getElementById('offline-message').style.display = 'block';
            if (creationMode) {
                showError('Offline: Cannot add new locations. Reload when online.');
            }
        });
    }

    // Load locations from Firestore with lazy loading
    async function loadLocationsFromFirestore() {
        showLoading(true);
        try {
            const locationsRef = collection(db, 'locations');
            const q = query(locationsRef, orderBy('createdAt', 'desc'));
            const querySnapshot = await getDocs(q);

            allMarkers = [];
            let validMarkers = 0;
            const batchSize = 50; // Load markers in batches for better performance
            let currentBatch = [];

            for (const docSnap of querySnapshot.docs) {
                const data = docSnap.data();
                const locationId = docSnap.id;

                const lat = parseFloat(data.latitude);
                const lon = parseFloat(data.longitude);
                const title = data.title || 'Untitled Location';
                const notes = data.notes || '';
                const address = data.address || '';
                const userId = data.userId || '';

                // Get username from user profile (batch these requests if possible)
                let username = 'Unknown User';
                if (userId) {
                    try {
                        const userDoc = await getDoc(doc(db, 'users', userId));
                        if (userDoc.exists()) {
                            username = userDoc.data().displayName || userDoc.data().email || 'Unknown User';
                        }
                    } catch (error) {
                        console.error('Error loading user:', error);
                    }
                }

                if (!isNaN(lat) && !isNaN(lon)) {
                    const popupContent = createPopupContent(locationId, title, lat, lon, notes, address, username, userId);
                    const marker = L.marker([lat, lon]).bindPopup(popupContent);

                    const markerObj = {
                        locationId,
                        title,
                        notes,
                        address,
                        user: username,
                        userId,
                        lat,
                        lon,
                        marker
                    };

                    allMarkers.push(markerObj);
                    currentBatch.push(markerObj);
                    validMarkers++;

                    // Add markers in batches to avoid blocking the UI
                    if (currentBatch.length >= batchSize) {
                        currentBatch.forEach(obj => markers.addLayer(obj.marker));
                        currentBatch = [];
                        // Allow UI to update between batches
                        await new Promise(resolve => setTimeout(resolve, 10));
                    }
                }
            }

            // Add remaining markers
            currentBatch.forEach(obj => markers.addLayer(obj.marker));

            map.addLayer(markers);
            console.log(`${validMarkers} markers loaded from Firestore.`);
        } catch (error) {
            console.error('Error loading locations:', error);
            showError('Failed to load locations. Please refresh the page.');
        } finally {
            showLoading(false);
        }
    }

    // Create popup content
    function createPopupContent(locationId, title, lat, lon, notes, address, user, userId) {
        let popupContent = `<b>${title}</b><br>`;
        if (address) {
            popupContent += `<br><strong>Address:</strong><br>${address}`;
        }
        if (user) {
            popupContent += `<br><strong>User:</strong> ${user}`;
        }
        if (notes) {
            popupContent += `<br><br><strong>Notes:</strong><br>${notes}`;
        }

        // Add View Details link
        popupContent += `<br><br><a href="./location.html?id=${locationId}" style="background: #007cba; color: white; padding: 5px 10px; text-decoration: none; border-radius: 3px; display: inline-block;">View Details</a>`;

        // Add Edit/Delete buttons if user owns this location
        if (currentUser && userId === currentUser.uid) {
            popupContent += `
                <div class="popup-actions">
                    <button class="popup-edit" onclick="window.editLocation('${locationId}')">Edit</button>
                    <button class="popup-delete" onclick="window.confirmDeleteLocation('${locationId}')">Delete</button>
                </div>
            `;
        }

        return popupContent;
    }

    // Edit location
    window.editLocation = async function(locationId) {
        try {
            const locationDoc = await getDoc(doc(db, 'locations', locationId));
            if (locationDoc.exists()) {
                const data = locationDoc.data();
                editingLocationId = locationId;

                document.getElementById('edit-title').value = data.title || '';
                document.getElementById('edit-notes').value = data.notes || '';
                document.getElementById('edit-address').value = data.address || '';

                document.getElementById('edit-modal').style.display = 'block';
            }
        } catch (error) {
            console.error('Error loading location:', error);
            showError('Failed to load location details.');
        }
    };

    // Update location
    async function updateLocation() {
        if (!editingLocationId) return;

        const title = document.getElementById('edit-title').value.trim();
        const notes = document.getElementById('edit-notes').value.trim();
        const address = document.getElementById('edit-address').value.trim();

        if (!title) {
            showError('Title is required!');
            return;
        }

        showLoading(true);

        try {
            await updateDoc(doc(db, 'locations', editingLocationId), {
                title,
                notes,
                address,
                updatedAt: serverTimestamp()
            });

            document.getElementById('edit-modal').style.display = 'none';
            editingLocationId = null;

            // Reload locations
            await loadLocationsFromFirestore();

            showSuccess('Location updated successfully!');
        } catch (error) {
            console.error('Error updating location:', error);
            showError('Failed to update location. Please try again.');
        } finally {
            showLoading(false);
        }
    }

    // Confirm delete location
    window.confirmDeleteLocation = function(locationId) {
        if (confirm('Are you sure you want to delete this location? This cannot be undone.')) {
            deleteLocationById(locationId);
        }
    };

    // Delete location
    async function deleteLocation() {
        if (!editingLocationId) return;

        if (confirm('Are you sure you want to delete this location? This cannot be undone.')) {
            await deleteLocationById(editingLocationId);
            document.getElementById('edit-modal').style.display = 'none';
            editingLocationId = null;
        }
    }

    async function deleteLocationById(locationId) {
        showLoading(true);

        try {
            await deleteDoc(doc(db, 'locations', locationId));

            // Reload locations
            await loadLocationsFromFirestore();

            showSuccess('Location deleted successfully!');
        } catch (error) {
            console.error('Error deleting location:', error);
            showError('Failed to delete location. Please try again.');
        } finally {
            showLoading(false);
        }
    }

    function cancelEdit() {
        document.getElementById('edit-modal').style.display = 'none';
        editingLocationId = null;
    }

    // Filter markers
    function filterMarkers(searchTerm) {
        const term = searchTerm.trim().toLowerCase();
        markers.clearLayers();
        let visibleCount = 0;

        if (term === '') {
            allMarkers.forEach(markerObj => {
                markers.addLayer(markerObj.marker);
                visibleCount++;
            });
        } else {
            allMarkers.forEach(markerObj => {
                const titleMatch = markerObj.title.toLowerCase().includes(term);
                const notesMatch = markerObj.notes.toLowerCase().includes(term);
                const addressMatch = (markerObj.address || '').toLowerCase().includes(term);
                const userMatch = (markerObj.user || '').toLowerCase().includes(term);

                if (titleMatch || notesMatch || addressMatch || userMatch) {
                    markers.addLayer(markerObj.marker);
                    visibleCount++;
                }
            });
        }

        console.log(`Showing ${visibleCount} markers (search: "${searchTerm}")`);
    }

    // Debounced search handler
    function handleSearch() {
        if (searchTimeout) clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            const searchTerm = document.getElementById('search').value;
            filterMarkers(searchTerm);
        }, 300);
    }

    // Toggle creation mode
    function toggleCreationMode() {
        creationMode = !creationMode;
        const addBtn = document.getElementById('add-btn');
        addBtn.classList.toggle('active', creationMode);
        const searchInput = document.getElementById('search');
        searchInput.disabled = creationMode;

        if (creationMode) {
            map.on('click', handleMapClick);
            console.log('Creation mode: ON - Click map to add pin');
        } else {
            map.off('click', handleMapClick);
            if (tempMarker) {
                map.removeLayer(tempMarker);
                tempMarker = null;
            }
            searchInput.disabled = false;
            const currentSearch = searchInput.value;
            if (currentSearch) filterMarkers(currentSearch);
            console.log('Creation mode: OFF');
        }
    }

    // Handle map click in creation mode
    function handleMapClick(e) {
        const lat = e.latlng.lat;
        const lon = e.latlng.lng;
        clickLat = lat;
        clickLon = lon;

        if (tempMarker) {
            map.removeLayer(tempMarker);
        }

        tempMarker = L.marker([lat, lon], {
            icon: L.divIcon({
                className: 'temp-marker',
                html: '<div style="background-color: red; width: 20px; height: 20px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>',
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            })
        }).addTo(map);

        document.getElementById('click-coords').textContent = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
        document.getElementById('creation-modal').style.display = 'block';
        document.getElementById('new-title').focus();

        // Pre-fill user field
        const userInput = document.getElementById('new-user');
        if (userInput && currentUserData) {
            userInput.value = currentUserData.displayName || currentUser.email;
        }
    }

    // Submit new location
    async function submitNewLocation() {
        const title = document.getElementById('new-title').value.trim();
        const notes = document.getElementById('new-notes').value.trim();
        const address = document.getElementById('new-address').value.trim();

        if (!title) {
            showError('Title is required!');
            return;
        }

        showLoading(true);

        try {
            // Add to Firestore
            await addDoc(collection(db, 'locations'), {
                userId: currentUser.uid,
                latitude: clickLat,
                longitude: clickLon,
                title,
                notes,
                address,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });

            // Clear and close modal
            document.getElementById('new-title').value = '';
            document.getElementById('new-notes').value = '';
            document.getElementById('new-address').value = '';
            document.getElementById('creation-modal').style.display = 'none';

            if (tempMarker) {
                map.removeLayer(tempMarker);
                tempMarker = null;
            }

            // Exit creation mode
            toggleCreationMode();

            // Reload locations
            await loadLocationsFromFirestore();

            console.log('Location added successfully!');
        } catch (error) {
            console.error('Error adding location:', error);
            showError('Failed to add location. Please try again.');
        } finally {
            showLoading(false);
        }
    }

    // Cancel new location
    function cancelNewLocation() {
        if (tempMarker) {
            map.removeLayer(tempMarker);
            tempMarker = null;
        }
        document.getElementById('creation-modal').style.display = 'none';
        document.getElementById('new-title').value = '';
        document.getElementById('new-notes').value = '';
        document.getElementById('new-address').value = '';
    }
});
