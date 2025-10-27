from flask import Flask, render_template, request, jsonify
import requests

app = Flask(__name__, static_folder="static", template_folder="templates")

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/get_route', methods=['POST'])
def get_route():
    data = request.json
    origin_lat = data.get('origin_lat')
    origin_lon = data.get('origin_lon')
    destination = data.get('destination', '')

    if origin_lat is None or origin_lon is None or not destination:
        return jsonify({"error": "Missing parameters."}), 400

   
    geo_url = "https://nominatim.openstreetmap.org/search"
    params = {"q": destination, "format": "json", "limit": 1}
    headers = {"User-Agent": "LiveRouteAlertsApp"}
    geo_resp = requests.get(geo_url, params=params, headers=headers)
    if geo_resp.status_code != 200 or not geo_resp.json():
        return jsonify({"error": "Destination not found."}), 404

    geo_data = geo_resp.json()[0]
    dest_lat, dest_lon = float(geo_data['lat']), float(geo_data['lon'])

    
    osrm_url = f"http://router.project-osrm.org/route/v1/driving/{origin_lon},{origin_lat};{dest_lon},{dest_lat}"
    osrm_params = {"overview": "full", "geometries": "geojson"}
    osrm_resp = requests.get(osrm_url, params=osrm_params)
    osrm_json = osrm_resp.json()

    if 'routes' not in osrm_json or not osrm_json['routes']:
        return jsonify({"error": "No route found."}), 404

    coords = osrm_json['routes'][0]['geometry']['coordinates']
    route_coords = [[c[1], c[0]] for c in coords]

    
    danger_zones = [
        {"name": "Accident Spot 1", "lat": 9.559210, "lon": 77.681154, "type": "Accident"},
        {"name": "Crime Zone 1", "lat": 9.559210, "lon": 77.681154, "type": "Crime"},
        {"name": "Accident Spot 2", "lat": 9.544436, "lon": 77.664293, "type": "Accident"},
        {"name": "Crime Zone 2", "lat": 9.544436, "lon": 77.664293, "type": "Crime"},
        {"name": "Accident Spot 3", "lat": 9.512063, "lon": 77.634338, "type": "Accident"},
        {"name": "Crime Zone 3", "lat": 9.508272, "lon": 77.640337, "type": "Crime"},
        {"name": "Accident Spot 4", "lat": 9.570519, "lon": 77.686035, "type": "Accident"},
        {"name": "Crime Zone 4", "lat": 9.571068, "lon": 77.685644, "type": "Crime"},
        {"name": "Accident Spot 5", "lat": 9.576028, "lon": 77.683616, "type": "Accident"},
        {"name": "Crime Zone 5", "lat": 9.574673, "lon": 77.683867, "type": "Crime"},
        {"name": "Accident Spot 6", "lat": 9.591808, "lon": 77.680069, "type": "Accident"},
        {"name": "Crime Zone 6", "lat": 9.587709, "lon": 77.682834, "type": "Crime"},
    ]

    return jsonify({
        "success": True,
        "dest_lat": dest_lat,
        "dest_lon": dest_lon,
        "route_coords": route_coords,
        "danger_zones": danger_zones
    })


if __name__ == '__main__':
    app.run(debug=True)
