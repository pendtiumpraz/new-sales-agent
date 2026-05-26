"use client";

import "leaflet/dist/leaflet.css";
import {
  CircleMarker,
  MapContainer,
  Polyline,
  Popup,
  TileLayer,
} from "react-leaflet";

import type { FieldRep } from "@/lib/types";

const STATUS_COLOR: Record<FieldRep["status"], string> = {
  kunjungan: "#10B981",
  istirahat: "#F59E0B",
  selesai: "#94A3B8",
};

export function FieldMap({
  reps,
  selectedId,
  onSelect,
}: {
  reps: FieldRep[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const selected = reps.find((r) => r.id === selectedId) ?? null;

  return (
    <MapContainer
      center={[-6.9, 109.8]}
      zoom={7}
      scrollWheelZoom
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* Selected rep route */}
      {selected && (
        <>
          <Polyline
            positions={[
              [selected.lat, selected.lng],
              ...selected.route.map((p) => [p.lat, p.lng] as [number, number]),
            ]}
            pathOptions={{ color: "#0D9488", weight: 2, dashArray: "6 6" }}
          />
          {selected.route.map((p, i) => (
            <CircleMarker
              key={i}
              center={[p.lat, p.lng]}
              radius={4}
              pathOptions={{
                color: "#0D9488",
                fillColor: "#fff",
                fillOpacity: 1,
                weight: 2,
              }}
            >
              <Popup>{p.label}</Popup>
            </CircleMarker>
          ))}
        </>
      )}

      {/* Rep pins */}
      {reps.map((rep) => {
        const isSel = rep.id === selectedId;
        return (
          <CircleMarker
            key={rep.id}
            center={[rep.lat, rep.lng]}
            radius={isSel ? 11 : 8}
            eventHandlers={{ click: () => onSelect(rep.id) }}
            pathOptions={{
              color: "#fff",
              weight: 2,
              fillColor: STATUS_COLOR[rep.status],
              fillOpacity: 1,
            }}
          >
            <Popup>
              <span className="font-medium">{rep.name}</span>
              <br />
              {rep.city} · {rep.visitsToday}/{rep.visitsPlanned} kunjungan
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
