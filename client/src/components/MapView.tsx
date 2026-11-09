import React, { useState, useEffect, useRef, useCallback } from 'react'
import { GoogleMap, useJsApiLoader, Marker, Polyline, Circle } from '@react-google-maps/api'
import { Coordinates } from '../types'

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY as string

// ── Dark map theme to match EasyRide UI ───────────────────────────────────────
const DARK_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry',                                      stylers: [{ color: '#0d1521' }] },
  { elementType: 'labels.text.stroke',                            stylers: [{ color: '#0a0f1e' }] },
  { elementType: 'labels.text.fill',                              stylers: [{ color: '#8a9bb5' }] },
  { featureType: 'administrative',       elementType: 'geometry', stylers: [{ color: '#1e293b' }] },
  { featureType: 'landscape',                                     stylers: [{ color: '#0d1521' }] },
  { featureType: 'poi',                                           stylers: [{ visibility: 'off' }] },
  { featureType: 'road',                 elementType: 'geometry', stylers: [{ color: '#1e2a3a' }] },
  { featureType: 'road',        elementType: 'geometry.stroke',   stylers: [{ color: '#162030' }] },
  { featureType: 'road',        elementType: 'labels.text.fill',  stylers: [{ color: '#9ca3af' }] },
  { featureType: 'road.highway', elementType: 'geometry',         stylers: [{ color: '#2d4a6a' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#e5e7eb' }] },
  { featureType: 'transit',                                       stylers: [{ visibility: 'off' }] },
  { featureType: 'water',        elementType: 'geometry',         stylers: [{ color: '#071525' }] },
  { featureType: 'water',        elementType: 'labels.text.fill', stylers: [{ color: '#4b5e78' }] },
]

const MAP_OPTIONS: google.maps.MapOptions = {
  styles: DARK_STYLE,
  disableDefaultUI: true,
  zoomControl: true,
  clickableIcons: false,
  gestureHandling: 'greedy',
}

// ── SVG marker icons ───────────────────────────────────────────────────────────
function svgUri(svg: string) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

const CAR_URL = svgUri(`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <circle cx="24" cy="24" r="20" fill="#16a34a" stroke="white" stroke-width="2.5"/>
  <text x="24" y="31" text-anchor="middle" font-size="20">🚗</text>
</svg>`)

const CLIENT_URL = svgUri(`<svg xmlns="http://www.w3.org/2000/svg" width="38" height="38" viewBox="0 0 38 38">
  <circle cx="19" cy="19" r="17" fill="#3b82f6" stroke="white" stroke-width="2.5"/>
  <text x="19" y="25" text-anchor="middle" font-size="15">👤</text>
</svg>`)

const PICKUP_URL = svgUri(`<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 34 34">
  <circle cx="17" cy="17" r="15" fill="#22c55e" stroke="white" stroke-width="2"/>
  <text x="17" y="23" text-anchor="middle" font-size="14">📍</text>
</svg>`)

const DROPOFF_URL = svgUri(`<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 34 34">
  <circle cx="17" cy="17" r="15" fill="#ef4444" stroke="white" stroke-width="2"/>
  <text x="17" y="23" text-anchor="middle" font-size="14">🏁</text>
</svg>`)

// ── Heat map colour ramp (green → yellow → red) ───────────────────────────────
function heatColor(ratio: number): string {
  if (ratio < 0.5) {
    const t = ratio * 2
    return `rgb(${Math.round(34 + 200 * t)},${Math.round(197 - 18 * t)},${Math.round(94 - 86 * t)})`
  }
  const t = (ratio - 0.5) * 2
  return `rgb(${Math.round(234 + 5 * t)},${Math.round(179 - 111 * t)},${Math.round(8 + 60 * t)})`
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function haversineKm(a: Coordinates, b: Coordinates) {
  const R = 6371, rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(h))
}

export interface RouteInfo { distance: number; duration: number }

interface MapViewProps {
  center?: Coordinates
  driverLocation?: Coordinates | null
  clientLocation?: Coordinates | null
  pickupLocation?: Coordinates | null
  dropoffLocation?: Coordinates | null
  routeFrom?: Coordinates | null
  routeTo?: Coordinates | null
  routeColor?: string
  showRoute?: boolean
  followDriver?: boolean
  onRouteInfo?: (info: RouteInfo) => void
  heatmapPoints?: Array<{ lat: number; lng: number; weight: number }>
  className?: string
  zoom?: number
}

export default function MapView({
  center, driverLocation, clientLocation, pickupLocation, dropoffLocation,
  routeFrom, routeTo, routeColor,
  showRoute = false, followDriver = false, onRouteInfo,
  heatmapPoints,
  className = 'h-80', zoom = 14,
}: MapViewProps) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: API_KEY,
  })

  const [map, setMap]           = useState<google.maps.Map | null>(null)
  const [routePath, setRoutePath] = useState<google.maps.LatLngLiteral[]>([])
  const lastFrom  = useRef<Coordinates | null>(null)
  const lastTo    = useRef<Coordinates | null>(null)
  const abortRef  = useRef<AbortController | null>(null)
  const cbRef     = useRef(onRouteInfo)
  useEffect(() => { cbRef.current = onRouteInfo }, [onRouteInfo])

  const onLoad    = useCallback((m: google.maps.Map) => setMap(m), [])
  const onUnmount = useCallback(() => setMap(null), [])

  const defaultCenter = center || driverLocation || clientLocation || pickupLocation || { lat: -17.8292, lng: 31.0522 }

  // Resolve route endpoints
  let rFrom: Coordinates | null = routeFrom ?? null
  let rTo:   Coordinates | null = routeTo   ?? null
  const rColor = routeColor ?? '#22c55e'

  if (!rFrom && !rTo && showRoute && pickupLocation && dropoffLocation) {
    rFrom = pickupLocation
    rTo   = dropoffLocation
  }

  // ── Auto-pan to follow driver ──────────────────────────────────────────────
  useEffect(() => {
    if (!followDriver || !driverLocation || !map) return
    map.panTo({ lat: driverLocation.lat, lng: driverLocation.lng })
  }, [driverLocation, followDriver, map])

  // ── OSRM road routing (free, no API key) ──────────────────────────────────
  useEffect(() => {
    if (!rFrom || !rTo) { setRoutePath([]); return }

    const fromOk = lastFrom.current && haversineKm(lastFrom.current, rFrom) < 0.05
    const toOk   = lastTo.current   && haversineKm(lastTo.current,   rTo)   < 0.05
    if (fromOk && toOk) return

    lastFrom.current = rFrom
    lastTo.current   = rTo

    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    const url = `https://router.project-osrm.org/route/v1/driving/${rFrom.lng},${rFrom.lat};${rTo.lng},${rTo.lat}?overview=full&geometries=geojson`

    fetch(url, { signal: ctrl.signal })
      .then(r => r.json())
      .then(data => {
        if (ctrl.signal.aborted || !data.routes?.[0]) return
        const pts: google.maps.LatLngLiteral[] = data.routes[0].geometry.coordinates.map(
          ([lng, lat]: [number, number]) => ({ lat, lng })
        )
        setRoutePath(pts)
        cbRef.current?.({
          distance: +(data.routes[0].distance / 1000).toFixed(1),
          duration: +(data.routes[0].duration / 60  ).toFixed(0),
        })
      })
      .catch(() => {
        if (ctrl.signal.aborted) return
        // Straight-line fallback
        setRoutePath([{ lat: rFrom!.lat, lng: rFrom!.lng }, { lat: rTo!.lat, lng: rTo!.lng }])
      })

    return () => ctrl.abort()
  // Use primitive values as deps to avoid object identity re-triggers
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rFrom?.lat, rFrom?.lng, rTo?.lat, rTo?.lng])

  if (loadError) return (
    <div className={`bg-700 rounded-xl d-flex align-items-center justify-content-center ${className}`}
      style={{ minHeight: 120 }}>
      <p className="text-muted small mb-0">Map unavailable</p>
    </div>
  )

  if (!isLoaded) return (
    <div className={`bg-700 rounded-xl d-flex align-items-center justify-content-center ${className}`}
      style={{ minHeight: 120 }}>
      <div className="spinner-border spinner-border-sm text-brand" role="status" />
    </div>
  )

  const G = window.google.maps

  const carIcon:     google.maps.Icon = { url: CAR_URL,     scaledSize: new G.Size(48, 48), anchor: new G.Point(24, 24) }
  const clientIcon:  google.maps.Icon = { url: CLIENT_URL,  scaledSize: new G.Size(38, 38), anchor: new G.Point(19, 19) }
  const pickupIcon:  google.maps.Icon = { url: PICKUP_URL,  scaledSize: new G.Size(34, 34), anchor: new G.Point(17, 17) }
  const dropoffIcon: google.maps.Icon = { url: DROPOFF_URL, scaledSize: new G.Size(34, 34), anchor: new G.Point(17, 17) }

  return (
    <div className={`rounded-xl overflow-hidden ${className}`}>
      <GoogleMap
        mapContainerStyle={{ width: '100%', height: '100%' }}
        center={{ lat: defaultCenter.lat, lng: defaultCenter.lng }}
        zoom={zoom}
        options={MAP_OPTIONS}
        onLoad={onLoad}
        onUnmount={onUnmount}
      >
        {driverLocation && (
          <Marker
            position={{ lat: driverLocation.lat, lng: driverLocation.lng }}
            icon={carIcon}
            title="Driver"
          />
        )}
        {clientLocation && (
          <Marker
            position={{ lat: clientLocation.lat, lng: clientLocation.lng }}
            icon={clientIcon}
            title="Your location"
          />
        )}
        {pickupLocation && (
          <Marker
            position={{ lat: pickupLocation.lat, lng: pickupLocation.lng }}
            icon={pickupIcon}
            title="Pickup"
          />
        )}
        {dropoffLocation && (
          <Marker
            position={{ lat: dropoffLocation.lat, lng: dropoffLocation.lng }}
            icon={dropoffIcon}
            title="Drop-off"
          />
        )}
        {routePath.length > 1 && (
          <Polyline
            path={routePath}
            options={{ strokeColor: rColor, strokeWeight: 5, strokeOpacity: 0.9, geodesic: true }}
          />
        )}
        {heatmapPoints && (() => {
          const maxW = Math.max(...heatmapPoints.map(p => p.weight), 1)
          return heatmapPoints.map((pt, i) => {
            const ratio = pt.weight / maxW
            const color = heatColor(ratio)
            return (
              <Circle
                key={`${pt.lat}-${pt.lng}`}
                center={{ lat: pt.lat, lng: pt.lng }}
                radius={600}
                options={{
                  fillColor: color,
                  fillOpacity: 0.22 + ratio * 0.38,
                  strokeColor: color,
                  strokeOpacity: 0.55,
                  strokeWeight: 1,
                  clickable: false,
                }}
              />
            )
          })
        })()}
      </GoogleMap>
    </div>
  )
}
