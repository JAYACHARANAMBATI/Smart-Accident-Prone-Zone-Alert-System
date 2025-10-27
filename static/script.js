let map, routeLayer, userMarker;
let dangerMarkers = [];
let currentPosition = null;
let updateCount = 0;


map = L.map('map').setView([9.5745, 77.6752], 14);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19
}).addTo(map);


function speak(msg) {
  const utter = new SpeechSynthesisUtterance(msg);
  utter.rate = 1;
  speechSynthesis.speak(utter);
}


function trackLocation() {
  navigator.geolocation.getCurrentPosition(pos => {
    updateCount++;
    currentPosition = [pos.coords.latitude, pos.coords.longitude];
    console.log(`Location update #${updateCount} at: ${new Date().toLocaleTimeString()}`);

    if (!userMarker) {
      userMarker = L.marker(currentPosition, { title: "You are here" }).addTo(map);
    } else {
      userMarker.setLatLng(currentPosition);
    }

    checkProximityToDangerZones();
  });
}
setInterval(trackLocation, 5000); 
trackLocation();


async function getRoute() {
  const destination = document.getElementById('destination').value;
  if (!destination || !currentPosition) {
    showStatus("Please enter a destination and allow location access.", "warning");
    return;
  }

  
  document.querySelector('.loading').classList.add('active');
  document.querySelector('.search-btn').disabled = true;
  showStatus("Finding the safest route to your destination...");

  const res = await fetch('/get_route', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      origin_lat: currentPosition[0],
      origin_lon: currentPosition[1],
      destination: destination
    })
  });

  const data = await res.json();
  
  
  document.querySelector('.loading').classList.remove('active');
  document.querySelector('.search-btn').disabled = false;

  if (!data.success) {
    showStatus(data.error || "Route not found. Please try again.", "danger");
    return;
  }

  showStatus("Route found! Follow the blue line and watch for danger zones.", "success");

  
  if (routeLayer) map.removeLayer(routeLayer);
  routeLayer = L.polyline(data.route_coords, { color: 'blue' }).addTo(map);
  map.fitBounds(routeLayer.getBounds());

  
  dangerMarkers.forEach(m => map.removeLayer(m));
  dangerMarkers = data.danger_zones.map(zone => {
    const marker = L.circleMarker([zone.lat, zone.lon], {
      radius: 8, color: zone.type === "Accident" ? 'red' : 'orange'
    }).addTo(map);
    marker.bindPopup(`${zone.type}: ${zone.name}`);
    return { marker, zone };
  });

  speak("Route loaded. Drive safely!");
}


function showStatus(message, type = 'info') {
  const statusEl = document.getElementById('status');
  statusEl.innerHTML = `
    <div class="status-card ${type}">
      <i class="fas fa-${type === 'danger' ? 'exclamation-circle' : 
                       type === 'warning' ? 'exclamation-triangle' : 
                       type === 'success' ? 'check-circle' : 'info-circle'}"></i>
      ${message}
    </div>
  `;
}


function checkProximityToDangerZones() {
  if (!currentPosition || dangerMarkers.length === 0) return;

  dangerMarkers.forEach(({ zone }) => {
    const distance = getDistance(currentPosition[0], currentPosition[1], zone.lat, zone.lon);
    if (distance < 0.4) { 
      if (distance < 0.1) speak(`You are in a ${zone.type} zone. Be cautious.`);
      else if (distance < 0.2) speak(`You are 200 meters away from ${zone.type} zone.`);
      else if (distance < 0.3) speak(`Approaching ${zone.type} zone, slow down.`);
    }
  });
}


function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat/2) ** 2 +
    Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) *
    Math.sin(dLon/2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}
