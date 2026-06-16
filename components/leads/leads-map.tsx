"use client";

import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";

export interface ProvincePoint {
  province: string;
  lat: number;
  lng: number;
  people: number;
}

// Lead distribution across Indonesia (doc 40) — one CircleMarker per province,
// radius scaled by people count. Data comes from /api/profiles/by-province.
export function LeadsMap({ points }: { points: ProvincePoint[] }) {
  const max = Math.max(1, ...points.map((p) => p.people));
  return (
    <MapContainer center={[-2.5, 118]} zoom={5} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {points.map((p) => {
        // radius 8..30px by share of the busiest province
        const radius = 8 + Math.round((p.people / max) * 22);
        return (
          <CircleMarker
            key={p.province}
            center={[p.lat, p.lng]}
            radius={radius}
            pathOptions={{ color: "#FB5E3B", fillColor: "#FB5E3B", fillOpacity: 0.45, weight: 1.5 }}
          >
            <Popup>
              <div className="text-sm">
                <p className="font-semibold">{p.province}</p>
                <p>{p.people} orang</p>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
