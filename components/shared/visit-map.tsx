"use client";

// Client-only Leaflet map for field visits. MUST be loaded via next/dynamic with
// { ssr: false } (Leaflet touches window/document). Uses OpenStreetMap tiles (free,
// no API key) and a divIcon pin (inline SVG) to avoid Leaflet's classic broken
// default-marker-icon issue with bundlers.

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface MapPoint {
  lat: number;
  lng: number;
  label?: string;
  kind?: "check_in" | "check_out" | "visit";
}

const PIN_COLOR: Record<string, string> = {
  check_in: "#FB5E3B", // coral — arrival
  check_out: "#10B981", // green — departure
  visit: "#6366F1", // indigo — the visit itself
};

function pinIcon(color: string) {
  return L.divIcon({
    className: "",
    html: `<svg width="26" height="26" viewBox="0 0 24 24" fill="${color}" stroke="#fff" stroke-width="1.4" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))"><path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7Z"/><circle cx="12" cy="9" r="2.4" fill="#fff" stroke="none"/></svg>`,
    iconSize: [26, 26],
    iconAnchor: [13, 26],
    popupAnchor: [0, -24],
  });
}

function FitBounds({ points }: { points: MapPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 15);
      return;
    }
    map.fitBounds(
      points.map((p) => [p.lat, p.lng] as [number, number]),
      { padding: [28, 28], maxZoom: 16 },
    );
  }, [points, map]);
  return null;
}

export default function VisitMap({
  points,
  className,
}: {
  points: MapPoint[];
  className?: string;
}) {
  // Jakarta fallback so the map isn't blank if a point slips through with no coords.
  const center: [number, number] = points.length
    ? [points[0].lat, points[0].lng]
    : [-6.2, 106.816];
  return (
    <div className={className}>
      <MapContainer
        center={center}
        zoom={13}
        scrollWheelZoom={false}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {points.map((p, i) => (
          <Marker key={i} position={[p.lat, p.lng]} icon={pinIcon(PIN_COLOR[p.kind ?? "visit"] ?? PIN_COLOR.visit)}>
            {p.label && <Popup>{p.label}</Popup>}
          </Marker>
        ))}
        <FitBounds points={points} />
      </MapContainer>
    </div>
  );
}
