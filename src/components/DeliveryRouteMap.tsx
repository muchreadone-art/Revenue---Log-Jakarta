import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  APIProvider,
  APILoadingStatus,
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useAdvancedMarkerRef,
  useApiLoadingStatus,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  AlertTriangle,
  Anchor,
  ArrowRight,
  Compass,
  Globe,
  Loader2,
  MapPin,
  Navigation,
  Route as RouteIcon,
  Search,
  Truck,
} from 'lucide-react';
import type {
  ModaKey,
  RouteCorridorRow,
  SalesOrderRecord,
  SoLegStep,
} from '../types/logistics';
import { formatInt, formatJuta } from '../utils/formatters';
import { buildMultiLegJourney, computeRouteNetworkSummary } from '../utils/logisticsEngine';

interface DeliveryRouteMapProps {
  orders: SalesOrderRecord[];
  darkMode: boolean;
  mapsApiKey: string;
  mapsConfigLoading?: boolean;
  selectedRouteKey: string | null;
  onSelectRouteKey: (route: string | null) => void;
  compact?: boolean;
  onOpenFullMap?: () => void;
}

interface ResolvedPlace {
  queryKey: string;
  lat: number;
  lng: number;
  displayName: string;
  formattedAddress: string;
  cachedAt: number;
}

interface CachedRoadPath {
  path: google.maps.LatLngLiteral[];
  distanceKm: number;
  durationText: string;
}

interface ActiveWaypoint {
  id: string;
  label: string;
  badge: string;
  rawName: string;
  place: ResolvedPlace;
  role: 'origin' | 'destination' | 'stop' | 'hub';
  subtitle: string;
  extraLines?: string[];
}

interface ActiveRouteStats {
  mode: 'network' | 'driving' | 'sea';
  distanceKm: number;
  durationText: string;
  legsCount: number;
  seaLegsCount: number;
  landLegsCount: number;
  hubCount?: number;
  totalDoCount?: number;
  totalRevenue?: number;
}

interface NetworkPolyRecord {
  corridor: RouteCorridorRow;
  poly: google.maps.Polyline;
  baseWeight: number;
  strokeColor: string;
  isDashed: boolean;
}

type MapViewMode = 'network' | 'corridor' | 'so-journey';

const PLACE_CACHE_STORAGE_KEY = 'logiflow_gmp_place_cache_v1';
const PLACE_CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 hari (<= batas 30 hari ToS)
const INDONESIA_DEFAULT_CENTER = { lat: -2.5489, lng: 118.0149 };

const MODA_STROKE_COLORS: Record<ModaKey, string> = {
  Transporter: '#0F766E',
  'Car Carrier': '#0284C7',
  'Self Drive': '#D97706',
  Shipment: '#6366F1',
};

const LOCATION_QUERY_HINTS: Array<[RegExp, string]> = [
  [/\b(PORT\s*)?(TJ\.?|TG\.?|TANJUNG)\s*PRIOK\b|\bPORT\s*PRIUK\b|\bPORT\s*TJ$/i, 'Pelabuhan Tanjung Priok, Jakarta Utara, Indonesia'],
  [/\bWALANG\s*\/?\s*MARUNDA\b|\b(PORT\s*)?MARUNDA\b/i, 'Marunda, Cilincing, Jakarta Utara, Indonesia'],
  [/\bCIBITUNG\s*\/?\s*CIKARANG\b|\bCIKARANG\b/i, 'Cikarang, Kabupaten Bekasi, Jawa Barat, Indonesia'],
  [/\bCIBITUNG\b/i, 'Cibitung, Kabupaten Bekasi, Jawa Barat, Indonesia'],
  [/\bSUNTER\b/i, 'Sunter, Tanjung Priok, Jakarta Utara, Indonesia'],
  [/\bCAKUNG\b/i, 'Cakung, Jakarta Timur, Indonesia'],
  [/\bKARAWANG\b|\bKIIC\b|\bSURYACIPTA\b/i, 'Karawang, Jawa Barat, Indonesia'],
  [/\bBEKASI\b/i, 'Bekasi, Jawa Barat, Indonesia'],
  [/\bMAKASSA?R\b|\bMKS\b/i, 'Makassar, Sulawesi Selatan, Indonesia'],
  [/\bBANJARMASIN\b|\bBJM\b/i, 'Banjarmasin, Kalimantan Selatan, Indonesia'],
  [/\bBALIKPAPAN\b|\bBPN\b/i, 'Balikpapan, Kalimantan Timur, Indonesia'],
  [/\bSAMARINDA\b|\bSMD\b/i, 'Samarinda, Kalimantan Timur, Indonesia'],
  [/\bPONTIANAK\b|\bPTK\b/i, 'Pontianak, Kalimantan Barat, Indonesia'],
  [/\b(TJ\.?|TG\.?|TANJUNG)\s*PERAK\b/i, 'Pelabuhan Tanjung Perak, Surabaya, Jawa Timur, Indonesia'],
  [/\bSURABAYA\b|\bSBY\b/i, 'Surabaya, Jawa Timur, Indonesia'],
  [/\bSEMARANG\b|\bSMG\b/i, 'Semarang, Jawa Tengah, Indonesia'],
  [/\bPALEMBANG\b|\bPLB\b/i, 'Palembang, Sumatera Selatan, Indonesia'],
  [/\bMEDAN\b|\bMDN\b|\bBELAWAN\b/i, 'Medan, Sumatera Utara, Indonesia'],
  [/\bLAMPUNG\b|\bPANJANG\b/i, 'Bandar Lampung, Lampung, Indonesia'],
  [/\bMERAK\b|\bCILEGON\b/i, 'Cilegon, Banten, Indonesia'],
  [/\bTANGERANG\b/i, 'Tangerang, Banten, Indonesia'],
  [/\bDELTAMAS\b/i, 'Kota Deltamas, Cikarang Pusat, Bekasi, Jawa Barat, Indonesia'],
  [/\bPATIMBAN\b/i, 'Pelabuhan Patimban, Subang, Jawa Barat, Indonesia'],
  [/\bJAKARTA\b|\bJKT\b/i, 'Jakarta, Indonesia'],
];

function buildLocationSearchQueries(rawName: string): string[] {
  const trimmed = rawName.trim();
  if (!trimmed) return [];
  const candidates: string[] = [];

  for (const [pattern, normalized] of LOCATION_QUERY_HINTS) {
    if (pattern.test(trimmed)) {
      candidates.push(normalized);
      break;
    }
  }

  const slashParts = trimmed
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean);
  if (slashParts.length > 1) {
    candidates.push(`${slashParts[slashParts.length - 1]}, Indonesia`);
    candidates.push(`${slashParts[0]}, Indonesia`);
  }

  candidates.push(`${trimmed}, Indonesia`);
  return Array.from(new Set(candidates));
}

function isQuotaError(err: unknown): boolean {
  const msg = String(
    (err as { message?: string; status?: string; code?: unknown })?.message ||
      (err as { status?: string })?.status ||
      err ||
      ''
  ).toUpperCase();
  return (
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('OVER_QUERY_LIMIT') ||
    msg.includes('QUOTAEXCEEDED') ||
    msg.includes('429')
  );
}

function triggerQuotaWarning(): void {
  window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
}

function loadPlaceCache(): Record<string, ResolvedPlace> {
  try {
    const raw = localStorage.getItem(PLACE_CACHE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, ResolvedPlace>;
    const now = Date.now();
    const valid: Record<string, ResolvedPlace> = {};
    for (const key of Object.keys(parsed)) {
      const entry = parsed[key];
      if (
        entry &&
        typeof entry.lat === 'number' &&
        typeof entry.lng === 'number' &&
        now - entry.cachedAt < PLACE_CACHE_TTL_MS
      ) {
        valid[key] = entry;
      }
    }
    return valid;
  } catch {
    return {};
  }
}

function persistPlaceCache(cache: Record<string, ResolvedPlace>): void {
  try {
    localStorage.setItem(PLACE_CACHE_STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Abaikan jika penyimpanan penuh
  }
}

function calcHaversineKm(
  a: google.maps.LatLngLiteral,
  b: google.maps.LatLngLiteral
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const c =
    sinDLat * sinDLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinDLng * sinDLng;
  return R * 2 * Math.atan2(Math.sqrt(c), Math.sqrt(1 - c));
}

function formatDurationMillis(ms?: number | null): string {
  if (!ms || !Number.isFinite(ms)) return '-';
  const totalMinutes = Math.round(ms / 60000);
  if (totalMinutes < 60) return `${totalMinutes} mnt`;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return mins > 0 ? `${hours} jam ${mins} mnt` : `${hours} jam`;
}

function extractRoutePath(route: google.maps.routes.Route): google.maps.LatLngLiteral[] {
  if (!route.path || route.path.length === 0) return [];
  return route.path.map((pt) => ({
    lat: typeof pt.lat === 'number' ? pt.lat : 0,
    lng: typeof pt.lng === 'number' ? pt.lng : 0,
  }));
}

const WaypointMarkerWithInfo: React.FC<{
  waypoint: ActiveWaypoint;
  isSelected: boolean;
  onSelect: () => void;
  onClose: () => void;
}> = ({ waypoint, isSelected, onSelect, onClose }) => {
  const [markerRef, marker] = useAdvancedMarkerRef();

  const isPortHub =
    waypoint.role === 'hub' && /\bPORT\b|\bPELABUHAN\b|\bPRIOK\b|\bPRIUK\b/i.test(waypoint.rawName);

  const pinPalette =
    waypoint.role === 'origin'
      ? { background: '#0F766E', borderColor: '#115E59', glyphColor: '#FFFFFF' }
      : waypoint.role === 'destination'
      ? { background: '#E11D48', borderColor: '#9F1239', glyphColor: '#FFFFFF' }
      : waypoint.role === 'hub'
      ? isPortHub
        ? { background: '#4F46E5', borderColor: '#3730A3', glyphColor: '#FFFFFF' }
        : { background: '#0F766E', borderColor: '#115E59', glyphColor: '#FFFFFF' }
      : { background: '#0284C7', borderColor: '#075985', glyphColor: '#FFFFFF' };

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: waypoint.place.lat, lng: waypoint.place.lng }}
        title={`${waypoint.label}: ${waypoint.rawName}`}
        onClick={onSelect}
      >
        <Pin
          background={pinPalette.background}
          borderColor={pinPalette.borderColor}
          glyphColor={pinPalette.glyphColor}
          glyphText={waypoint.badge}
          scale={waypoint.role === 'hub' ? 0.9 : waypoint.role === 'stop' ? 0.95 : 1.1}
        />
      </AdvancedMarker>
      {isSelected && marker && (
        <InfoWindow anchor={marker} maxWidth={280} onCloseClick={onClose}>
          <div className="space-y-1 p-0.5 text-slate-900">
            <div className="flex items-center gap-1.5">
              <span
                className={`inline-flex h-5 min-w-5 items-center justify-center rounded-md px-1.5 text-[11px] font-bold text-white ${
                  waypoint.role === 'origin'
                    ? 'bg-teal-700'
                    : waypoint.role === 'destination'
                    ? 'bg-rose-600'
                    : waypoint.role === 'hub'
                    ? isPortHub
                      ? 'bg-indigo-600'
                      : 'bg-teal-700'
                    : 'bg-sky-600'
                }`}
              >
                {waypoint.badge}
              </span>
              <span className="text-xs font-bold text-slate-900">{waypoint.label}</span>
            </div>
            <p className="text-xs font-semibold text-slate-800">{waypoint.rawName}</p>
            <p className="text-[11px] leading-snug text-slate-600">
              {waypoint.place.displayName}
              {waypoint.place.formattedAddress
                ? ` · ${waypoint.place.formattedAddress}`
                : ''}
            </p>
            {waypoint.subtitle && (
              <p className="border-t border-slate-100 pt-1 text-[11px] font-medium text-teal-700">
                {waypoint.subtitle}
              </p>
            )}
            {waypoint.extraLines && waypoint.extraLines.length > 0 && (
              <ul className="space-y-0.5 pt-0.5 text-[11px] text-slate-600">
                {waypoint.extraLines.map((line, i) => (
                  <li key={i} className="truncate">
                    • {line}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </InfoWindow>
      )}
    </>
  );
};

interface MapCanvasControllerProps {
  mode: MapViewMode;
  networkCorridors: RouteCorridorRow[];
  highlightedRouteKey: string | null;
  activeCorridor: RouteCorridorRow | null;
  activeSo: SalesOrderRecord | null;
  activeSoLegs: SoLegStep[];
  onWaypointsChange: (waypoints: ActiveWaypoint[]) => void;
  onStatsChange: (stats: ActiveRouteStats | null) => void;
  onLoadingChange: (loading: boolean) => void;
  onErrorChange: (error: string | null) => void;
  onSelectWaypointId: (id: string | null) => void;
  onSelectCorridorFromMap: (route: string) => void;
}

const MapCanvasController: React.FC<MapCanvasControllerProps> = ({
  mode,
  networkCorridors,
  highlightedRouteKey,
  activeCorridor,
  activeSo,
  activeSoLegs,
  onWaypointsChange,
  onStatsChange,
  onLoadingChange,
  onErrorChange,
  onSelectWaypointId,
  onSelectCorridorFromMap,
}) => {
  const map = useMap();
  const placesLib = useMapsLibrary('places');
  const routesLib = useMapsLibrary('routes');
  const mapsLib = useMapsLibrary('maps');
  const coreLib = useMapsLibrary('core');

  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  const networkPolysRef = useRef<NetworkPolyRecord[]>([]);
  const memoryPlaceCacheRef = useRef<Record<string, ResolvedPlace>>(loadPlaceCache());
  const sessionRoadCacheRef = useRef<Record<string, CachedRoadPath>>({});
  const onSelectCorridorFromMapRef = useRef(onSelectCorridorFromMap);
  onSelectCorridorFromMapRef.current = onSelectCorridorFromMap;

  const clearPolylines = useCallback(() => {
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];
    networkPolysRef.current = [];
  }, []);

  const resolvePlaceByText = useCallback(
    async (rawName: string): Promise<ResolvedPlace | null> => {
      const key = rawName.trim().toUpperCase();
      if (!key) return null;

      const queries = buildLocationSearchQueries(rawName);
      const canonicalKey = (queries[0] || key).trim().toUpperCase();

      const existing =
        memoryPlaceCacheRef.current[key] || memoryPlaceCacheRef.current[canonicalKey];
      if (existing && Date.now() - existing.cachedAt < PLACE_CACHE_TTL_MS) {
        memoryPlaceCacheRef.current[key] = existing;
        return existing;
      }

      if (!placesLib) return null;

      for (const q of queries) {
        try {
          const { places } = await placesLib.Place.searchByText({
            textQuery: q,
            fields: ['displayName', 'location', 'formattedAddress'],
            language: 'id',
            region: 'id',
            maxResultCount: 1,
          });
          const first = places?.[0];
          if (first?.location) {
            const resolved: ResolvedPlace = {
              queryKey: canonicalKey,
              lat: first.location.lat(),
              lng: first.location.lng(),
              displayName: first.displayName || rawName,
              formattedAddress: first.formattedAddress || '',
              cachedAt: Date.now(),
            };
            memoryPlaceCacheRef.current[key] = resolved;
            memoryPlaceCacheRef.current[canonicalKey] = resolved;
            persistPlaceCache(memoryPlaceCacheRef.current);
            // Jeda singkat agar tidak memicu rate-limit burst QPS
            await new Promise((r) => setTimeout(r, 120));
            return resolved;
          }
        } catch (err) {
          if (isQuotaError(err)) {
            triggerQuotaWarning();
            throw err;
          }
        }
      }
      return null;
    },
    [placesLib]
  );

  const createDashedSeaPolyline = useCallback(
    (
      origin: google.maps.LatLngLiteral,
      destination: google.maps.LatLngLiteral,
      color = '#6366F1',
      opacity = 0.85,
      scale = 3,
      zIndex = 5
    ): google.maps.Polyline | null => {
      if (!mapsLib || !map) return null;
      const lineSymbol: google.maps.Symbol = {
        path: 'M 0,-1 0,1',
        strokeOpacity: opacity,
        scale,
      };
      return new mapsLib.Polyline({
        path: [origin, destination],
        geodesic: true,
        strokeOpacity: 0,
        strokeColor: color,
        zIndex,
        icons: [
          {
            icon: lineSymbol,
            offset: '0',
            repeat: '14px',
          },
        ],
        map,
      });
    },
    [mapsLib, map]
  );

  // Compute/draw polylines when mode or route data changes
  useEffect(() => {
    if (!map || !placesLib || !routesLib || !mapsLib || !coreLib) return;

    let cancelled = false;
    clearPolylines();
    onSelectWaypointId(null);

    const runNetworkOverview = async () => {
      if (networkCorridors.length === 0) {
        onWaypointsChange([]);
        onStatsChange(null);
        onErrorChange(null);
        onLoadingChange(false);
        return;
      }

      onLoadingChange(true);
      onErrorChange(null);

      try {
        // 1. Kumpulkan semua nama lokasi unik dari koridor aktif
        const uniqueStopNames = Array.from(
          new Set(
            networkCorridors.flatMap((c) => [c.origin.trim(), c.destination.trim()]).filter(Boolean)
          )
        );

        const resolvedByName: Record<string, ResolvedPlace | null> = {};
        for (const name of uniqueStopNames) {
          if (cancelled) return;
          resolvedByName[name.toUpperCase()] = await resolvePlaceByText(name);
        }

        if (cancelled) return;

        // 2. Hitung agregasi Hub unik + bounding box
        const bounds = new coreLib.LatLngBounds();
        const hubAcc: Record<
          string,
          {
            rawName: string;
            place: ResolvedPlace;
            outDo: number;
            inDo: number;
            revenue: number;
            routes: string[];
          }
        > = {};

        let validBoundsCount = 0;
        for (const c of networkCorridors) {
          const origPlace = resolvedByName[c.origin.trim().toUpperCase()];
          const destPlace = resolvedByName[c.destination.trim().toUpperCase()];
          if (origPlace) {
            const k = origPlace.queryKey;
            if (!hubAcc[k]) {
              hubAcc[k] = {
                rawName: c.origin,
                place: origPlace,
                outDo: 0,
                inDo: 0,
                revenue: 0,
                routes: [],
              };
            }
            hubAcc[k].outDo += c.doCount;
            hubAcc[k].revenue += c.revenue;
            if (hubAcc[k].routes.length < 4) hubAcc[k].routes.push(c.route);
            bounds.extend({ lat: origPlace.lat, lng: origPlace.lng });
            validBoundsCount += 1;
          }
          if (destPlace) {
            const k = destPlace.queryKey;
            if (!hubAcc[k]) {
              hubAcc[k] = {
                rawName: c.destination,
                place: destPlace,
                outDo: 0,
                inDo: 0,
                revenue: 0,
                routes: [],
              };
            }
            hubAcc[k].inDo += c.doCount;
            if (hubAcc[k].routes.length < 4 && !hubAcc[k].routes.includes(c.route)) {
              hubAcc[k].routes.push(c.route);
            }
            bounds.extend({ lat: destPlace.lat, lng: destPlace.lng });
            validBoundsCount += 1;
          }
        }

        const hubWaypoints: ActiveWaypoint[] = Object.values(hubAcc).map((h, idx) => ({
          id: `hub-${h.place.queryKey}`,
          label: /\bPORT\b|\bPELABUHAN\b|\bPRIOK\b|\bPRIUK\b/i.test(h.rawName)
            ? 'Hub Pelabuhan'
            : 'Hub / Titik Pengiriman',
          badge: /\bPORT\b|\bPELABUHAN\b|\bPRIOK\b|\bPRIUK\b/i.test(h.rawName)
            ? 'P'
            : String(idx + 1),
          rawName: h.rawName,
          place: h.place,
          role: 'hub',
          subtitle: `Keluar ${formatInt(h.outDo)} DO · Masuk ${formatInt(h.inDo)} DO`,
          extraLines: h.routes,
        }));

        onWaypointsChange(hubWaypoints);

        // 3. Gambar semua koridor rute sekaligus (hemat kuota: gunakan jalur cache / garis koridor geodetik di Overview)
        const maxDo = Math.max(1, ...networkCorridors.map((c) => c.doCount));
        let seaCount = 0;
        let landCount = 0;
        let totalDo = 0;
        let totalRev = 0;
        let totalDistKm = 0;
        const createdNetworkRecords: NetworkPolyRecord[] = [];

        for (const c of networkCorridors) {
          if (cancelled) return;
          const origPlace = resolvedByName[c.origin.trim().toUpperCase()];
          const destPlace = resolvedByName[c.destination.trim().toUpperCase()];
          if (!origPlace || !destPlace) continue;

          totalDo += c.doCount;
          totalRev += c.revenue;

          const origLatLng = { lat: origPlace.lat, lng: origPlace.lng };
          const destLatLng = { lat: destPlace.lat, lng: destPlace.lng };
          const sameSpot =
            Math.abs(origLatLng.lat - destLatLng.lat) < 0.001 &&
            Math.abs(origLatLng.lng - destLatLng.lng) < 0.001;
          if (sameSpot) continue;

          const strokeColor = MODA_STROKE_COLORS[c.primaryModa] || '#0F766E';
          const weightRatio = Math.sqrt(c.doCount / maxDo);
          const baseWeight = Number((2.5 + weightRatio * 4).toFixed(1));
          const preferSea = c.primaryModa === 'Shipment';
          const routeCacheKey = `${origPlace.queryKey}->${destPlace.queryKey}`;

          const cachedRoad = !preferSea ? sessionRoadCacheRef.current[routeCacheKey] : undefined;
          const distKm = cachedRoad
            ? cachedRoad.distanceKm
            : calcHaversineKm(origLatLng, destLatLng);

          totalDistKm += distKm;

          let poly: google.maps.Polyline | null = null;
          let isDashed = false;

          if (preferSea) {
            seaCount += 1;
            isDashed = true;
            poly = createDashedSeaPolyline(origLatLng, destLatLng, strokeColor, 0.85, 2.8, 6);
            if (poly) poly.setOptions({ clickable: true });
          } else {
            landCount += 1;
            const path =
              cachedRoad && cachedRoad.path.length > 1
                ? cachedRoad.path
                : [origLatLng, destLatLng];
            poly = new mapsLib.Polyline({
              path,
              geodesic: true,
              strokeColor,
              strokeWeight: baseWeight,
              strokeOpacity: 0.84,
              zIndex: 10,
              clickable: true,
              map,
            });
          }

          if (poly) {
            poly.addListener('click', () => {
              onSelectCorridorFromMapRef.current(c.route);
            });
            polylinesRef.current.push(poly);
            createdNetworkRecords.push({
              corridor: c,
              poly,
              baseWeight,
              strokeColor,
              isDashed,
            });
          }
        }

        networkPolysRef.current = createdNetworkRecords;

        if (validBoundsCount > 0) {
          map.fitBounds(bounds, 68);
        }

        onStatsChange({
          mode: 'network',
          distanceKm: totalDistKm,
          durationText: `${formatInt(networkCorridors.length)} koridor aktif`,
          legsCount: networkCorridors.length,
          seaLegsCount: seaCount,
          landLegsCount: landCount,
          hubCount: hubWaypoints.length,
          totalDoCount: totalDo,
          totalRevenue: totalRev,
        });
      } catch (err) {
        if (!cancelled) {
          onErrorChange(
            isQuotaError(err)
              ? 'Kuota Google Maps Platform habis saat memuat overview rute.'
              : 'Gagal memuat jaringan rute pengiriman.'
          );
        }
      } finally {
        if (!cancelled) onLoadingChange(false);
      }
    };

    const runCorridor = async () => {
      if (!activeCorridor) {
        onWaypointsChange([]);
        onStatsChange(null);
        onErrorChange(null);
        onLoadingChange(false);
        return;
      }

      onLoadingChange(true);
      onErrorChange(null);

      try {
        const [origPlace, destPlace] = await Promise.all([
          resolvePlaceByText(activeCorridor.origin),
          resolvePlaceByText(activeCorridor.destination),
        ]);

        if (cancelled) return;

        if (!origPlace || !destPlace) {
          onWaypointsChange([]);
          onStatsChange(null);
          onErrorChange(
            `Lokasi titik rute (${activeCorridor.origin} → ${activeCorridor.destination}) tidak ditemukan di Google Maps.`
          );
          onLoadingChange(false);
          return;
        }

        const waypoints: ActiveWaypoint[] = [
          {
            id: 'origin',
            label: 'Titik Asal (Origin)',
            badge: 'A',
            rawName: activeCorridor.origin,
            place: origPlace,
            role: 'origin',
            subtitle: `${formatInt(activeCorridor.doCount)} DO · Moda dominan ${activeCorridor.primaryModa}`,
          },
          {
            id: 'destination',
            label: 'Titik Tujuan (Destination)',
            badge: 'B',
            rawName: activeCorridor.destination,
            place: destPlace,
            role: 'destination',
            subtitle: `Revenue Rp${formatJuta(activeCorridor.revenue)} jt · Margin Rp${formatJuta(
              activeCorridor.margin
            )} jt`,
          },
        ];

        onWaypointsChange(waypoints);

        const origLatLng = { lat: origPlace.lat, lng: origPlace.lng };
        const destLatLng = { lat: destPlace.lat, lng: destPlace.lng };

        const bounds = new coreLib.LatLngBounds();
        bounds.extend(origLatLng);
        bounds.extend(destLatLng);

        let renderedRoad = false;
        let distanceKm = calcHaversineKm(origLatLng, destLatLng);
        let durationText = 'Koridor Laut RORO';

        const preferSea = activeCorridor.primaryModa === 'Shipment';
        const sameSpot =
          Math.abs(origLatLng.lat - destLatLng.lat) < 0.001 &&
          Math.abs(origLatLng.lng - destLatLng.lng) < 0.001;

        if (!preferSea && !sameSpot) {
          try {
            const { routes } = await routesLib.Route.computeRoutes({
              origin: origLatLng,
              destination: destLatLng,
              travelMode: routesLib.TravelMode.DRIVING,
              fields: ['path', 'distanceMeters', 'durationMillis', 'viewport'],
            });

            if (cancelled) return;

            const primaryRoute = routes?.[0];
            if (primaryRoute) {
              const strokeColor = MODA_STROKE_COLORS[activeCorridor.primaryModa] || '#0F766E';
              const polylines = primaryRoute.createPolylines({
                polylineOptions: {
                  strokeColor,
                  strokeWeight: 5,
                  strokeOpacity: 0.92,
                },
              });
              polylines.forEach((p: google.maps.Polyline) => p.setMap(map));
              polylinesRef.current.push(...polylines);
              renderedRoad = true;
              distanceKm = (primaryRoute.distanceMeters ?? distanceKm * 1000) / 1000;
              durationText = formatDurationMillis(primaryRoute.durationMillis);

              const extracted = extractRoutePath(primaryRoute);
              if (extracted.length > 1) {
                sessionRoadCacheRef.current[`${origPlace.queryKey}->${destPlace.queryKey}`] = {
                  path: extracted,
                  distanceKm,
                  durationText,
                };
              }

              if (primaryRoute.viewport) {
                map.fitBounds(primaryRoute.viewport, 64);
              } else {
                map.fitBounds(bounds, 72);
              }
            }
          } catch (err) {
            if (isQuotaError(err)) {
              triggerQuotaWarning();
            }
          }
        }

        if (!renderedRoad) {
          if (!sameSpot) {
            const seaPoly = createDashedSeaPolyline(
              origLatLng,
              destLatLng,
              MODA_STROKE_COLORS[activeCorridor.primaryModa] || '#6366F1'
            );
            if (seaPoly) polylinesRef.current.push(seaPoly);
          }
          map.fitBounds(bounds, 80);
          if (sameSpot) {
            map.setZoom(13);
            durationText = 'Area Pelabuhan / Lokal';
          }
        }

        onStatsChange({
          mode: renderedRoad ? 'driving' : 'sea',
          distanceKm,
          durationText,
          legsCount: 1,
          seaLegsCount: renderedRoad ? 0 : 1,
          landLegsCount: renderedRoad ? 1 : 0,
        });
      } catch (err) {
        if (!cancelled) {
          onErrorChange(
            isQuotaError(err)
              ? 'Kuota Google Maps Platform habis saat memuat titik lokasi.'
              : 'Gagal menghitung jalur pengiriman di peta.'
          );
        }
      } finally {
        if (!cancelled) onLoadingChange(false);
      }
    };

    const runSoJourney = async () => {
      if (!activeSo || activeSoLegs.length === 0) {
        onWaypointsChange([]);
        onStatsChange(null);
        onErrorChange(null);
        onLoadingChange(false);
        return;
      }

      onLoadingChange(true);
      onErrorChange(null);

      try {
        const stopSequence: Array<{
          rawName: string;
          role: 'origin' | 'destination' | 'stop';
          subtitle: string;
        }> = [];

        activeSoLegs.forEach((leg, idx) => {
          const prev = stopSequence[stopSequence.length - 1];
          if (!prev || prev.rawName.toUpperCase() !== leg.origin.toUpperCase()) {
            stopSequence.push({
              rawName: leg.origin,
              role: idx === 0 ? 'origin' : 'stop',
              subtitle: `Muat ${leg.doRef} (${leg.moda})`,
            });
          }
          const isLastLeg = idx === activeSoLegs.length - 1;
          if (leg.destination.toUpperCase() !== leg.origin.toUpperCase()) {
            stopSequence.push({
              rawName: leg.destination,
              role: isLastLeg ? 'destination' : 'stop',
              subtitle: `Tujuan ${leg.doRef} · Rp${formatJuta(leg.rev)} jt`,
            });
          }
        });

        const uniqueNames = Array.from(new Set(stopSequence.map((s) => s.rawName)));
        const resolvedMap: Record<string, ResolvedPlace | null> = {};

        for (const name of uniqueNames) {
          if (cancelled) return;
          resolvedMap[name] = await resolvePlaceByText(name);
        }

        if (cancelled) return;

        const bounds = new coreLib.LatLngBounds();
        const waypoints: ActiveWaypoint[] = [];
        stopSequence.forEach((stop, idx) => {
          const place = resolvedMap[stop.rawName];
          if (!place) return;
          bounds.extend({ lat: place.lat, lng: place.lng });
          waypoints.push({
            id: `stop-${idx}`,
            label:
              idx === 0
                ? 'Titik Awal SO'
                : idx === stopSequence.length - 1
                ? 'Titik Akhir SO'
                : `Titik Singgah #${idx + 1}`,
            badge: String(idx + 1),
            rawName: stop.rawName,
            place,
            role:
              idx === 0
                ? 'origin'
                : idx === stopSequence.length - 1
                ? 'destination'
                : 'stop',
            subtitle: stop.subtitle,
          });
        });

        onWaypointsChange(waypoints);

        let totalDistanceKm = 0;
        let totalDurationMs = 0;
        let seaLegs = 0;
        let landLegs = 0;

        for (const leg of activeSoLegs.slice(0, 6)) {
          if (cancelled) return;
          const origPlace = resolvedMap[leg.origin];
          const destPlace = resolvedMap[leg.destination];
          if (!origPlace || !destPlace) continue;

          const origLatLng = { lat: origPlace.lat, lng: origPlace.lng };
          const destLatLng = { lat: destPlace.lat, lng: destPlace.lng };
          const sameSpot =
            Math.abs(origLatLng.lat - destLatLng.lat) < 0.001 &&
            Math.abs(origLatLng.lng - destLatLng.lng) < 0.001;
          if (sameSpot) continue;

          let drewRoad = false;
          if (leg.moda !== 'Shipment') {
            try {
              const { routes } = await routesLib.Route.computeRoutes({
                origin: origLatLng,
                destination: destLatLng,
                travelMode: routesLib.TravelMode.DRIVING,
                fields: ['path', 'distanceMeters', 'durationMillis'],
              });
              if (cancelled) return;
              const primaryRoute = routes?.[0];
              if (primaryRoute) {
                const polylines = primaryRoute.createPolylines({
                  polylineOptions: {
                    strokeColor: MODA_STROKE_COLORS[leg.moda] || '#0284C7',
                    strokeWeight: 4.5,
                    strokeOpacity: 0.9,
                  },
                });
                polylines.forEach((p: google.maps.Polyline) => p.setMap(map));
                polylinesRef.current.push(...polylines);
                totalDistanceKm += (primaryRoute.distanceMeters ?? 0) / 1000;
                totalDurationMs += primaryRoute.durationMillis ?? 0;
                landLegs += 1;
                drewRoad = true;
              }
            } catch (err) {
              if (isQuotaError(err)) triggerQuotaWarning();
            }
          }

          if (!drewRoad) {
            const seaPoly = createDashedSeaPolyline(
              origLatLng,
              destLatLng,
              MODA_STROKE_COLORS[leg.moda] || '#6366F1'
            );
            if (seaPoly) polylinesRef.current.push(seaPoly);
            totalDistanceKm += calcHaversineKm(origLatLng, destLatLng);
            seaLegs += 1;
          }
        }

        if (waypoints.length > 0) {
          map.fitBounds(bounds, 72);
          if (waypoints.length === 1) map.setZoom(13);
        }

        onStatsChange({
          mode: landLegs > 0 ? 'driving' : 'sea',
          distanceKm: totalDistanceKm,
          durationText:
            totalDurationMs > 0 ? formatDurationMillis(totalDurationMs) : 'Koridor Laut RORO',
          legsCount: activeSoLegs.length,
          seaLegsCount: seaLegs,
          landLegsCount: landLegs,
        });
      } catch (err) {
        if (!cancelled) {
          onErrorChange(
            isQuotaError(err)
              ? 'Kuota Google Maps Platform habis saat menyusun rute SO.'
              : 'Gagal menyusun rute multi-titik untuk SO ini.'
          );
        }
      } finally {
        if (!cancelled) onLoadingChange(false);
      }
    };

    if (mode === 'network') {
      void runNetworkOverview();
    } else if (mode === 'corridor') {
      void runCorridor();
    } else {
      void runSoJourney();
    }

    return () => {
      cancelled = true;
      clearPolylines();
    };
  }, [
    mode,
    networkCorridors,
    activeCorridor,
    activeSo,
    activeSoLegs,
    map,
    placesLib,
    routesLib,
    mapsLib,
    coreLib,
    resolvePlaceByText,
    createDashedSeaPolyline,
    clearPolylines,
    onWaypointsChange,
    onStatsChange,
    onLoadingChange,
    onErrorChange,
    onSelectWaypointId,
  ]);

  // Highlight selected route instantaneously inside 'network' mode without refetching API
  useEffect(() => {
    if (mode !== 'network' || networkPolysRef.current.length === 0) return;

    const hasHighlight = Boolean(
      highlightedRouteKey &&
        networkPolysRef.current.some((rec) => rec.corridor.route === highlightedRouteKey)
    );

    for (const rec of networkPolysRef.current) {
      const isMatch = hasHighlight && rec.corridor.route === highlightedRouteKey;
      if (rec.isDashed) {
        const opacity = !hasHighlight ? 0.85 : isMatch ? 1 : 0.22;
        const scale = isMatch ? 3.8 : 2.8;
        rec.poly.setOptions({
          zIndex: isMatch ? 50 : 6,
          icons: [
            {
              icon: {
                path: 'M 0,-1 0,1',
                strokeOpacity: opacity,
                scale,
              },
              offset: '0',
              repeat: '14px',
            },
          ],
        });
      } else {
        rec.poly.setOptions({
          strokeOpacity: !hasHighlight ? 0.84 : isMatch ? 1 : 0.2,
          strokeWeight: isMatch ? Math.max(6, rec.baseWeight + 1.5) : rec.baseWeight,
          zIndex: isMatch ? 50 : 10,
        });
      }
    }
  }, [mode, highlightedRouteKey]);

  return null;
};

const MapSdkStatusGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const status = useApiLoadingStatus();
  if (status === APILoadingStatus.FAILED || status === APILoadingStatus.AUTH_FAILURE) {
    return (
      <div className="flex h-[420px] flex-col items-center justify-center gap-2 rounded-2xl border border-amber-200 bg-amber-50/70 p-6 text-center dark:border-amber-900/60 dark:bg-amber-950/30">
        <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
        <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
          Google Maps Platform tidak dapat dimuat
        </p>
        <p className="max-w-md text-xs text-amber-800/80 dark:text-amber-300/80">
          Periksa konfigurasi API key Google Maps atau kuota proyek Anda untuk menampilkan peta jalur pengiriman.
        </p>
      </div>
    );
  }
  return <>{children}</>;
};

export const DeliveryRouteMap: React.FC<DeliveryRouteMapProps> = ({
  orders,
  darkMode,
  mapsApiKey,
  mapsConfigLoading = false,
  selectedRouteKey,
  onSelectRouteKey,
  compact = false,
  onOpenFullMap,
}) => {
  const [mapMode, setMapMode] = useState<MapViewMode>('network');
  const [networkLimit, setNetworkLimit] = useState<6 | 10 | 15>(() => (compact ? 6 : 10));
  const [modaFilter, setModaFilter] = useState<'all' | ModaKey>('all');
  const [routeSearch, setRouteSearch] = useState('');
  const [selectedSoKey, setSelectedSoKey] = useState<string>('');

  const [waypoints, setWaypoints] = useState<ActiveWaypoint[]>([]);
  const [routeStats, setRouteStats] = useState<ActiveRouteStats | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [selectedWaypointId, setSelectedWaypointId] = useState<string | null>(null);

  const corridors = useMemo(() => computeRouteNetworkSummary(orders), [orders]);

  const filteredCorridors = useMemo(() => {
    const q = routeSearch.trim().toLowerCase();
    return corridors.filter((c) => {
      if (modaFilter !== 'all' && c.modaCounts[modaFilter] === 0 && c.primaryModa !== modaFilter) {
        return false;
      }
      if (q) {
        return (
          c.route.toLowerCase().includes(q) ||
          c.origin.toLowerCase().includes(q) ||
          c.destination.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [corridors, modaFilter, routeSearch]);

  const networkCorridors = useMemo(() => {
    const base = filteredCorridors.slice(0, networkLimit);
    if (selectedRouteKey && !base.some((c) => c.route === selectedRouteKey)) {
      const extra = corridors.find((c) => c.route === selectedRouteKey);
      if (extra) return [extra, ...base.slice(0, networkLimit - 1)];
    }
    return base;
  }, [filteredCorridors, networkLimit, selectedRouteKey, corridors]);

  const activeCorridor = useMemo(() => {
    if (selectedRouteKey) {
      const exact = corridors.find((c) => c.route === selectedRouteKey);
      if (exact) return exact;
    }
    return filteredCorridors[0] || corridors[0] || null;
  }, [selectedRouteKey, corridors, filteredCorridors]);

  const highlightedNetworkCorridor = useMemo(() => {
    if (!selectedRouteKey) return null;
    return networkCorridors.find((c) => c.route === selectedRouteKey) || null;
  }, [selectedRouteKey, networkCorridors]);

  const multiLegSoCandidates = useMemo(() => {
    return [...orders]
      .filter((s) => s.lines.some((l) => (l[2] || '').trim() && (l[3] || '').trim()))
      .sort((a, b) => b.uniqueDoCount - a.uniqueDoCount || b.rev - a.rev)
      .slice(0, 60);
  }, [orders]);

  const activeSo = useMemo(() => {
    if (selectedSoKey) {
      const found = multiLegSoCandidates.find((s) => `${s.src}:${s.ref}` === selectedSoKey);
      if (found) return found;
    }
    return multiLegSoCandidates[0] || null;
  }, [selectedSoKey, multiLegSoCandidates]);

  const activeSoLegs = useMemo(
    () => (activeSo ? buildMultiLegJourney(activeSo) : []),
    [activeSo]
  );

  const handleSelectCorridor = useCallback(
    (route: string) => {
      if (mapMode === 'network') {
        onSelectRouteKey(selectedRouteKey === route ? null : route);
      } else {
        onSelectRouteKey(route);
      }
    },
    [mapMode, selectedRouteKey, onSelectRouteKey]
  );

  if (mapsConfigLoading) {
    return (
      <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_3px_rgba(15,23,42,0.03)] dark:border-slate-800 dark:bg-slate-900">
        <div className="flex h-[320px] flex-col items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin text-teal-600" />
          <span>Menyiapkan konfigurasi Google Maps...</span>
        </div>
      </section>
    );
  }

  if (!mapsApiKey) {
    return (
      <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_3px_rgba(15,23,42,0.03)] dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
            <MapPin className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Peta Jalur Pengiriman (Overview & Titik ke Titik)
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Kunci API Google Maps belum terdeteksi pada environment server/client. Muat ulang halaman atau aktifkan Google Maps di pengaturan AI Studio untuk menampilkan rute interaktif.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.03)] sm:p-6 dark:border-slate-800 dark:bg-slate-900">
      {/* Header & Mode Switch */}
      <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300">
              <Navigation className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                Peta Jalur Pengiriman
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Overview jaringan semua koridor rute sekaligus, detail titik ke titik, dan rangkaian per SO.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex flex-wrap rounded-xl bg-slate-100 p-1 text-xs font-medium dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setMapMode('network')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-colors ${
                mapMode === 'network'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-slate-100'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <Globe className="h-3.5 w-3.5" />
              Overview Semua Rute
            </button>
            <button
              type="button"
              onClick={() => setMapMode('corridor')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-colors ${
                mapMode === 'corridor'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-slate-100'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <RouteIcon className="h-3.5 w-3.5" />
              Titik ke Titik
            </button>
            <button
              type="button"
              onClick={() => setMapMode('so-journey')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-colors ${
                mapMode === 'so-journey'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-slate-100'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <Compass className="h-3.5 w-3.5" />
              Rute Multi-Titik SO
            </button>
          </div>

          {compact && onOpenFullMap && (
            <button
              type="button"
              onClick={onOpenFullMap}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-teal-700 transition-colors hover:bg-teal-50 dark:border-slate-700 dark:bg-slate-800 dark:text-teal-300 dark:hover:bg-slate-700"
            >
              Buka Peta Penuh
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Main Grid: Selector Sidebar + Interactive Map */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left Sidebar Selector */}
        <div className="flex flex-col gap-3 lg:col-span-4">
          {mapMode !== 'so-journey' ? (
            <>
              <div className="space-y-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={routeSearch}
                    onChange={(e) => setRouteSearch(e.target.value)}
                    placeholder="Cari kota asal / tujuan..."
                    className="h-9 w-full rounded-xl bg-slate-100/90 pr-3 pl-9 text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-teal-600/25 focus:outline-none dark:bg-slate-800 dark:text-slate-100 dark:focus:bg-slate-800"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1">
                    {(['all', 'Transporter', 'Car Carrier', 'Self Drive', 'Shipment'] as const).map(
                      (m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setModaFilter(m)}
                          className={`rounded-lg px-2 py-1 text-[11px] font-medium transition-colors ${
                            modaFilter === m
                              ? 'bg-teal-700 text-white dark:bg-teal-600'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                          }`}
                        >
                          {m === 'all' ? 'Semua' : m}
                        </button>
                      )
                    )}
                  </div>

                  {mapMode === 'network' && (
                    <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-0.5 text-[11px] dark:bg-slate-800">
                      {([6, 10, 15] as const).map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setNetworkLimit(n)}
                          className={`rounded-md px-2 py-0.5 font-mono font-semibold transition-colors ${
                            networkLimit === n
                              ? 'bg-white text-teal-700 shadow-xs dark:bg-slate-700 dark:text-teal-300'
                              : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                          }`}
                          title={`Tampilkan ${n} rute tersibuk sekaligus`}
                        >
                          Top {n}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {mapMode === 'network' && highlightedNetworkCorridor && (
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-teal-200 bg-teal-50/80 px-3 py-2 text-[11px] dark:border-teal-800/80 dark:bg-teal-950/40">
                    <span className="truncate font-medium text-teal-900 dark:text-teal-200">
                      Sorot: <strong>{highlightedNetworkCorridor.route}</strong>
                    </span>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setMapMode('corridor')}
                        className="rounded-md bg-teal-700 px-2 py-0.5 font-semibold text-white hover:bg-teal-800 dark:bg-teal-600"
                      >
                        Fokus 1 Rute
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelectRouteKey(null)}
                        className="rounded-md bg-white px-2 py-0.5 font-medium text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300"
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div
                className={`${
                  compact ? 'max-h-[340px]' : 'max-h-[450px]'
                } space-y-1.5 overflow-y-auto pr-1`}
              >
                {(mapMode === 'network' ? networkCorridors : filteredCorridors.slice(0, 40)).length ===
                0 ? (
                  <p className="rounded-xl bg-slate-50 p-4 text-center text-xs text-slate-500 dark:bg-slate-800/60">
                    Tidak ada koridor rute pada filter ini.
                  </p>
                ) : (
                  (mapMode === 'network' ? networkCorridors : filteredCorridors.slice(0, 40)).map(
                    (c, idx) => {
                      const isSelected =
                        mapMode === 'network'
                          ? highlightedNetworkCorridor?.route === c.route
                          : activeCorridor?.route === c.route;
                      return (
                        <button
                          key={c.route}
                          type="button"
                          onClick={() => handleSelectCorridor(c.route)}
                          className={`w-full rounded-xl border p-3 text-left transition-all ${
                            isSelected
                              ? 'border-teal-600/60 bg-teal-50/70 shadow-xs dark:border-teal-500/60 dark:bg-teal-950/40'
                              : 'border-slate-200/70 bg-white hover:border-slate-300 hover:bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800/60'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100">
                                {mapMode === 'network' && (
                                  <span
                                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                                    style={{
                                      backgroundColor:
                                        MODA_STROKE_COLORS[c.primaryModa] || '#0F766E',
                                    }}
                                  />
                                )}
                                <span className="font-mono text-[10px] text-slate-400">
                                  #{idx + 1}
                                </span>
                                <span className="truncate">{c.origin}</span>
                                <ArrowRight className="h-3 w-3 shrink-0 text-teal-600" />
                                <span className="truncate">{c.destination}</span>
                              </p>
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                                <span className="inline-flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300">
                                  {c.primaryModa === 'Shipment' ? (
                                    <Anchor className="h-3 w-3 text-indigo-500" />
                                  ) : (
                                    <Truck className="h-3 w-3 text-teal-600" />
                                  )}
                                  {c.primaryModa}
                                </span>
                                <span>·</span>
                                <span className="font-mono tabular-nums">
                                  {formatInt(c.doCount)} DO
                                </span>
                                <span>·</span>
                                <span className="font-mono tabular-nums">
                                  {formatInt(c.soCount)} SO
                                </span>
                              </div>
                            </div>
                            <span className="shrink-0 font-mono text-[11px] font-semibold text-teal-700 tabular-nums dark:text-teal-300">
                              Rp{formatJuta(c.revenue)} jt
                            </span>
                          </div>
                        </button>
                      );
                    }
                  )
                )}
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <label className="flex flex-col gap-1 text-xs">
                <span className="font-medium text-slate-500 dark:text-slate-400">
                  Pilih Sales Order (SO)
                </span>
                <select
                  value={activeSo ? `${activeSo.src}:${activeSo.ref}` : ''}
                  onChange={(e) => setSelectedSoKey(e.target.value)}
                  className="h-9 rounded-xl bg-slate-100/90 px-3 text-xs font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-teal-600/25 focus:outline-none dark:bg-slate-800 dark:text-slate-100"
                >
                  {multiLegSoCandidates.map((s) => (
                    <option key={`${s.src}:${s.ref}`} value={`${s.src}:${s.ref}`}>
                      {s.ref} · {s.customer} ({s.uniqueDoCount} DO)
                    </option>
                  ))}
                </select>
              </label>

              {activeSo && (
                <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/50">
                  <p className="font-semibold text-slate-900 dark:text-slate-100">
                    {activeSo.ref} · {activeSo.customer}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    {activeSo.date} · {formatInt(activeSo.uniqueDoCount)} DO · Rev Rp
                    {formatJuta(activeSo.rev)} jt
                  </p>
                </div>
              )}

              <div
                className={`${
                  compact ? 'max-h-[260px]' : 'max-h-[360px]'
                } space-y-2 overflow-y-auto pr-1`}
              >
                {activeSoLegs.length === 0 ? (
                  <p className="rounded-xl bg-slate-50 p-4 text-center text-xs text-slate-500 dark:bg-slate-800/60">
                    Tidak ada titik asal/tujuan pada SO ini.
                  </p>
                ) : (
                  activeSoLegs.map((leg) => (
                    <div
                      key={`${leg.doRef}-${leg.index}`}
                      className="rounded-xl border border-slate-200/70 bg-white p-2.5 text-xs dark:border-slate-800 dark:bg-slate-900"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] font-semibold text-teal-700 dark:text-teal-300">
                          Segmen #{leg.index} · {leg.doRef}
                        </span>
                        <span
                          className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-white"
                          style={{ backgroundColor: MODA_STROKE_COLORS[leg.moda] }}
                        >
                          {leg.moda}
                        </span>
                      </div>
                      <p className="mt-1 flex items-center gap-1.5 font-medium text-slate-800 dark:text-slate-200">
                        <span className="truncate">{leg.origin}</span>
                        <ArrowRight className="h-3 w-3 shrink-0 text-slate-400" />
                        <span className="truncate">{leg.destination}</span>
                      </p>
                      <p className="mt-0.5 font-mono text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                        Rev Rp{formatJuta(leg.rev)} jt · BOP Rp{formatJuta(leg.bop)} jt ·{' '}
                        {leg.invoiceStatus}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Interactive Google Map */}
        <div className="flex flex-col gap-3 lg:col-span-8">
          <APIProvider
            apiKey={mapsApiKey}
            language="id"
            region="ID"
            libraries={['places', 'routes', 'marker']}
          >
            <MapSdkStatusGuard>
              <div
                className={`relative w-full overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800 ${
                  compact ? 'h-[430px]' : 'h-[520px]'
                }`}
              >
                <GoogleMap
                  key={darkMode ? 'dark' : 'light'}
                  defaultCenter={INDONESIA_DEFAULT_CENTER}
                  defaultZoom={5}
                  mapId="DEMO_MAP_ID"
                  colorScheme={darkMode ? 'DARK' : 'LIGHT'}
                  gestureHandling="greedy"
                  mapTypeControl={false}
                  streetViewControl={false}
                  fullscreenControl={true}
                  internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                  style={{ width: '100%', height: '100%' }}
                >
                  <MapCanvasController
                    mode={mapMode}
                    networkCorridors={networkCorridors}
                    highlightedRouteKey={selectedRouteKey}
                    activeCorridor={activeCorridor}
                    activeSo={activeSo}
                    activeSoLegs={activeSoLegs}
                    onWaypointsChange={setWaypoints}
                    onStatsChange={setRouteStats}
                    onLoadingChange={setRouteLoading}
                    onErrorChange={setRouteError}
                    onSelectWaypointId={setSelectedWaypointId}
                    onSelectCorridorFromMap={handleSelectCorridor}
                  />

                  {waypoints.map((wp) => (
                    <WaypointMarkerWithInfo
                      key={wp.id}
                      waypoint={wp}
                      isSelected={selectedWaypointId === wp.id}
                      onSelect={() => setSelectedWaypointId(wp.id)}
                      onClose={() => setSelectedWaypointId(null)}
                    />
                  ))}
                </GoogleMap>

                {/* Loading Badge */}
                {routeLoading && (
                  <div className="pointer-events-none absolute top-3 left-3 z-10 inline-flex items-center gap-2 rounded-xl bg-white/95 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-md backdrop-blur-xs dark:bg-slate-900/95 dark:text-slate-200">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-teal-600" />
                    {mapMode === 'network'
                      ? `Memuat ${networkCorridors.length} koridor jaringan rute...`
                      : 'Memuat titik & jalur pengiriman...'}
                  </div>
                )}

                {/* Route Error Notice */}
                {routeError && !routeLoading && (
                  <div className="absolute bottom-3 left-3 right-3 z-10 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/95 px-3 py-2 text-xs text-amber-900 shadow-md dark:border-amber-800 dark:bg-amber-950/95 dark:text-amber-200">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                    <span>{routeError}</span>
                  </div>
                )}
              </div>
            </MapSdkStatusGuard>
          </APIProvider>

          {/* Legenda warna moda jalur */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-slate-500 dark:text-slate-400">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1 w-4 rounded-full bg-[#0F766E]" />
                Transporter (Darat)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1 w-4 rounded-full bg-[#0284C7]" />
                Car Carrier (Darat)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1 w-4 rounded-full bg-[#D97706]" />
                Self Drive (Darat)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-4 border-t-2 border-dashed border-[#6366F1]" />
                Shipment RORO (Laut)
              </span>
            </div>
            {mapMode === 'network' && (
              <span>Ketebalan garis = volume DO · Klik garis/rute untuk sorot</span>
            )}
          </div>

          {/* Route Telemetry Strip below map */}
          {routeStats && (
            <div className="grid grid-cols-2 gap-2.5 rounded-xl border border-slate-200/80 bg-slate-50/80 p-3 text-xs sm:grid-cols-4 dark:border-slate-800 dark:bg-slate-800/40">
              <div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {routeStats.mode === 'network' ? 'Cakupan Jaringan' : 'Jenis Jalur'}
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 font-semibold text-slate-900 dark:text-slate-100">
                  {routeStats.mode === 'network' ? (
                    <>
                      <Globe className="h-3.5 w-3.5 text-teal-600" />
                      <span>
                        {formatInt(routeStats.legsCount)} Rute ·{' '}
                        {formatInt(routeStats.hubCount ?? 0)} Hub
                      </span>
                    </>
                  ) : routeStats.mode === 'driving' ? (
                    <>
                      <Truck className="h-3.5 w-3.5 text-teal-600" />
                      <span>Jalur Darat</span>
                    </>
                  ) : (
                    <>
                      <Anchor className="h-3.5 w-3.5 text-indigo-600" />
                      <span>Koridor Laut RORO</span>
                    </>
                  )}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {routeStats.mode === 'network' ? 'Komposisi Koridor' : 'Estimasi Jarak'}
                </p>
                <p className="mt-0.5 font-mono font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                  {routeStats.mode === 'network'
                    ? `${routeStats.landLegsCount} darat · ${routeStats.seaLegsCount} laut`
                    : `${routeStats.distanceKm.toFixed(1)} km`}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {routeStats.mode === 'network' ? 'Total DO Terpetakan' : 'Waktu Tempuh'}
                </p>
                <p className="mt-0.5 font-mono font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                  {routeStats.mode === 'network'
                    ? `${formatInt(routeStats.totalDoCount ?? 0)} DO`
                    : routeStats.durationText}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {routeStats.mode === 'network'
                    ? 'Total Revenue Rute'
                    : mapMode === 'corridor'
                    ? 'Volume & Revenue'
                    : 'Segmen Pengiriman'}
                </p>
                <p className="mt-0.5 font-mono font-semibold text-teal-700 tabular-nums dark:text-teal-300">
                  {routeStats.mode === 'network'
                    ? `Rp${formatJuta(routeStats.totalRevenue ?? 0)} jt`
                    : mapMode === 'corridor' && activeCorridor
                    ? `${formatInt(activeCorridor.doCount)} DO · Rp${formatJuta(
                        activeCorridor.revenue
                      )} jt`
                    : `${formatInt(routeStats.legsCount)} segmen (${routeStats.landLegsCount} darat, ${routeStats.seaLegsCount} laut)`}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
