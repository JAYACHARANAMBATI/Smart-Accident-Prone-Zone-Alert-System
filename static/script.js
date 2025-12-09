let map, routeLayer, altRouteLayer, userMarker;
let dangerMarkers = [];
let currentPosition = null;
let updateCount = 0;
let lastRoutes = null;


map = L.map('map').setView([9.5745, 77.6752], 14);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19
}).addTo(map);


function speak(msg) {
  const rateEl = document.getElementById('voiceRate');
  const toggleEl = document.getElementById('voiceToggle');
  const utter = new SpeechSynthesisUtterance(msg);
  utter.rate = rateEl ? parseFloat(rateEl.value) : 1;
  if (!toggleEl || toggleEl.dataset.enabled !== 'false') {
    speechSynthesis.speak(utter);
  }
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

// Voice toggle button logic
const voiceToggleBtn = document.getElementById('voiceToggle');
if (voiceToggleBtn) {
  voiceToggleBtn.dataset.enabled = 'true';
  voiceToggleBtn.addEventListener('click', () => {
    const enabled = voiceToggleBtn.dataset.enabled === 'true';
    voiceToggleBtn.dataset.enabled = enabled ? 'false' : 'true';
    voiceToggleBtn.style.background = enabled ? '#ef4444' : '#22c55e';
    voiceToggleBtn.innerHTML = enabled ? '<i class="fas fa-volume-mute"></i> Voice Off' : '<i class="fas fa-volume-up"></i> Voice On';
  });
}


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
  
  const routes = data.routes || [];
  if (routes.length === 0) {
    showStatus("No routes returned. Try another destination.", "danger");
    return;
  }
  lastRoutes = routes;

  // Draw best route in blue and alternative in gray
  if (routeLayer) map.removeLayer(routeLayer);
  if (altRouteLayer) map.removeLayer(altRouteLayer);

  routeLayer = L.polyline(routes[0].coords, { color: 'blue', weight: 5 }).addTo(map);
  if (routes[1]) {
    altRouteLayer = L.polyline(routes[1].coords, { color: '#808080', weight: 4, dashArray: '6,6' }).addTo(map);
  }
  const bounds = L.latLngBounds(routes.flatMap(r => r.coords.map(c => L.latLng(c[0], c[1]))));
  map.fitBounds(bounds);

  showStatus("Two routes available. Pick one below.", "success");

  // Populate selection UI
  const list = document.getElementById('routes-list');
  const options = document.getElementById('route-options');
  options.style.display = 'block';
  list.innerHTML = '';
  routes.slice(0, 2).forEach((r, idx) => {
    const mins = r.duration ? Math.round(r.duration / 60) : '-';
    const km = r.distance ? (r.distance / 1000).toFixed(1) : '-';
    const btn = document.createElement('button');
    btn.className = 'search-btn';
    btn.style.background = idx === 0 ? '#2563eb' : '#64748b';
    btn.innerHTML = `${idx === 0 ? 'Recommended' : 'Alternative'} · ${km} km · ${mins} min · Risk ${r.risk_score}`;
    btn.onclick = () => selectRoute(idx, routes);
    list.appendChild(btn);
  });

  // Auto pick safest if enabled
  const auto = document.getElementById('autoSafest');
  if (auto && auto.checked) {
    selectRoute(0, routes); // routes already sorted safest first
  } else {
    // default draw already done; show summary for recommended
    updateRouteSummary(0);
  }

  
  dangerMarkers.forEach(m => map.removeLayer(m));
  dangerMarkers = data.danger_zones.map(zone => {
    const marker = L.circleMarker([zone.lat, zone.lon], {
      radius: 8, color: zone.type === "Accident" ? 'red' : 'orange'
    }).addTo(map);
    marker.bindPopup(`${zone.type}: ${zone.name}`);
    return { marker, zone };
  });

  speak("Routes loaded. Pick your preferred route.");
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

// Allow user to select which route to follow
function selectRoute(index, routes) {
  if (!routes || !routes[index]) return;
  if (routeLayer) map.removeLayer(routeLayer);
  if (altRouteLayer) map.removeLayer(altRouteLayer);

  // Selected route in blue; show the other as dashed gray
  routeLayer = L.polyline(routes[index].coords, { color: 'blue', weight: 5 }).addTo(map);
  const otherIndex = index === 0 ? 1 : 0;
  if (routes[otherIndex]) {
    altRouteLayer = L.polyline(routes[otherIndex].coords, { color: '#808080', weight: 4, dashArray: '6,6' }).addTo(map);
  }
  const bounds = L.latLngBounds(routes[index].coords.map(c => L.latLng(c[0], c[1])));
  map.fitBounds(bounds);
  speak(`Route selected. Risk score ${routes[index].risk_score}. Drive safely!`);
  updateRouteSummary(index);
}

function updateRouteSummary(index) {
  if (!lastRoutes || !lastRoutes[index]) return;
  const r = lastRoutes[index];
  const mins = r.duration ? Math.round(r.duration / 60) : '-';
  const km = r.distance ? (r.distance / 1000).toFixed(1) : '-';
  const box = document.getElementById('route-summary');
  if (!box) return;
  box.style.display = 'block';
  const stepsList = (r.steps || []).slice(0, 8).map(s => `• ${s.instruction || 'Proceed'} on ${s.name || ''} (${Math.round((s.distance||0)/10)/100} km)`).join('<br/>');
  box.innerHTML = `
    <strong>Selected Route:</strong> ${km} km · ${mins} min · Risk ${r.risk_score}<br/>
    <div style="margin-top:0.5rem; color:#475569;">
      <strong>Steps:</strong><br/>
      ${stepsList || 'No step data available.'}
    </div>
  `;
}
