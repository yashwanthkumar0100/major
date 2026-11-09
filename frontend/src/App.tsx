import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { GeoJSON, MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './App.css'

type FacilityTier = 'Confirmed' | 'Likely' | 'Mixed-use' | 'Unclassified'
type WaterStress = 'Low' | 'Medium' | 'High' | 'Extreme'
type RiskMode = 'water' | 'climate'

type Facility = {
  id: number
  name: string
  operator: string
  hub: string
  district: string
  classification_tier: FacilityTier
  water_stress: WaterStress
  climate_vulnerability: string
  capacity_mw: number
  latitude: number
  longitude: number
  rationale: string
  source: string
  source_url?: string
  last_verified: string
}

type Summary = {
  total_facilities: number
  confirmed_ai_percent: number
  high_water_stress_count: number
  top_hub: string
  hub_breakdown: Record<string, number>
}

type DistrictProperties = {
  name: string
  hub: string
  water_stress: WaterStress
  climate_vulnerability: string
}

type DistrictFeatureCollection = {
  type: 'FeatureCollection'
  features: Array<{
    type: 'Feature'
    id: string
    properties: DistrictProperties
    geometry: {
      type: 'Polygon'
      coordinates: number[][][]
    }
  }>
}

type SearchLocation = {
  name: string
  state: string
  displayName: string
  latitude: number
  longitude: number
}

const APP_TITLE = 'Climate IndiaAI Infrastructure Observatory'

const API_BASE = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? ''
const createApiUrl = (path: string) => (API_BASE ? `${API_BASE}${path}` : path)
const NEARBY_RADIUS_KM = 50
const hubs = ['All', 'Mumbai-Pune', 'Chennai', 'Hyderabad', 'NCR', 'Bengaluru']
const tierOptions = ['All', 'Confirmed', 'Likely', 'Mixed-use', 'Unclassified']
const operatorUrls: Record<string, string> = {
  Yotta: 'https://www.yotta.com/',
  AdaniConneX: 'https://www.adaniconnex.com/',
  CtrlS: 'https://www.ctrls.in/',
  'STT GDC India': 'https://www.sttelemediagdc.com/',
  Nxtra: 'https://www.nxtra.in/',
  Equinix: 'https://www.equinix.com/',
  EdgeConnex: 'https://www.edgeconnex.com/',
  Sify: 'https://www.sify.com/',
  Nile: 'https://www.niledata.com/',
}
const FALLBACK_FACILITIES: Facility[] = [
  {
    id: 1,
    name: 'Yotta NM1',
    operator: 'Yotta',
    hub: 'Mumbai-Pune',
    district: 'Panvel',
    classification_tier: 'Confirmed',
    water_stress: 'High',
    climate_vulnerability: 'High',
    capacity_mw: 150,
    latitude: 19.095,
    longitude: 73.01,
    rationale: 'Operator explicitly references GPU and AI compute expansion in public filings.',
    source: 'Yotta investor filings',
    last_verified: '2026-08-12',
  },
  {
    id: 2,
    name: 'Navi Mumbai Hyperscale 2',
    operator: 'AdaniConneX',
    hub: 'Mumbai-Pune',
    district: 'Navi Mumbai',
    classification_tier: 'Likely',
    water_stress: 'High',
    climate_vulnerability: 'Medium',
    capacity_mw: 120,
    latitude: 19.045,
    longitude: 73.017,
    rationale: 'Permit documents and operator expansion plans point to high-density compute racks.',
    source: 'AdaniConneX expansion announcement',
    last_verified: '2026-08-08',
  },
  {
    id: 3,
    name: 'Chennai DC 4',
    operator: 'CtrlS',
    hub: 'Chennai',
    district: 'Chennai North',
    classification_tier: 'Mixed-use',
    water_stress: 'Extreme',
    climate_vulnerability: 'High',
    capacity_mw: 80,
    latitude: 13.082,
    longitude: 80.27,
    rationale: 'General-purpose cloud facility known to host AI workloads alongside enterprise tenants.',
    source: 'CtrlS capacity and cloud portfolio',
    last_verified: '2026-07-28',
  },
  {
    id: 4,
    name: 'Hyderabad AI Cluster A',
    operator: 'STT GDC India',
    hub: 'Hyderabad',
    district: 'Gachibowli',
    classification_tier: 'Confirmed',
    water_stress: 'Medium',
    climate_vulnerability: 'Medium',
    capacity_mw: 200,
    latitude: 17.44,
    longitude: 78.388,
    rationale: 'Public release names GPU-rich AI and large language model workloads at the campus.',
    source: 'STT public release',
    last_verified: '2026-08-15',
  },
  {
    id: 5,
    name: 'Noida Cloud Campus',
    operator: 'Nxtra',
    hub: 'NCR',
    district: 'Noida',
    classification_tier: 'Likely',
    water_stress: 'Medium',
    climate_vulnerability: 'High',
    capacity_mw: 90,
    latitude: 28.535,
    longitude: 77.391,
    rationale: 'Regional hyperscale expansion and liquid-cooling references suggest AI-ready buildout.',
    source: 'Nxtra project brief',
    last_verified: '2026-08-03',
  },
  {
    id: 6,
    name: 'Bengaluru West DC',
    operator: 'Equinix',
    hub: 'Bengaluru',
    district: 'Whitefield',
    classification_tier: 'Mixed-use',
    water_stress: 'Medium',
    climate_vulnerability: 'Medium',
    capacity_mw: 64,
    latitude: 12.978,
    longitude: 77.751,
    rationale: 'Platform hosts enterprise and cloud workloads that are increasingly AI-enabled.',
    source: 'Equinix India site sheet',
    last_verified: '2026-08-09',
  },
  {
    id: 7,
    name: 'Dighi Edge Campus',
    operator: 'EdgeConnex',
    hub: 'Mumbai-Pune',
    district: 'Dighi',
    classification_tier: 'Unclassified',
    water_stress: 'High',
    climate_vulnerability: 'High',
    capacity_mw: 55,
    latitude: 18.522,
    longitude: 72.909,
    rationale: 'Facility identified but public disclosures are insufficient to confirm AI-specific usage.',
    source: 'Industry listing and operator profile',
    last_verified: '2026-07-19',
  },
  {
    id: 8,
    name: 'Hyderabad Mega DC',
    operator: 'Sify',
    hub: 'Hyderabad',
    district: 'Madhapur',
    classification_tier: 'Likely',
    water_stress: 'Medium',
    climate_vulnerability: 'Low',
    capacity_mw: 110,
    latitude: 17.45,
    longitude: 78.388,
    rationale: 'Regional AI cloud announcements align with facility expansion and rack density claims.',
    source: 'Sify investor deck',
    last_verified: '2026-08-11',
  },
  {
    id: 9,
    name: 'Bengaluru Campus 3',
    operator: 'Nile',
    hub: 'Bengaluru',
    district: 'Bommasandra',
    classification_tier: 'Unclassified',
    water_stress: 'Low',
    climate_vulnerability: 'Medium',
    capacity_mw: 48,
    latitude: 13.012,
    longitude: 77.648,
    rationale: 'Site is in active expansion but lacks clear public evidence of dedicated AI capacity.',
    source: 'Regional listing and press report',
    last_verified: '2026-08-02',
  },
]

const FALLBACK_DISTRICTS: DistrictFeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      id: 'panvel',
      properties: { name: 'Panvel', hub: 'Mumbai-Pune', water_stress: 'High', climate_vulnerability: 'High' },
      geometry: { type: 'Polygon', coordinates: [[[72.88, 19.0], [73.1, 19.0], [73.1, 19.18], [72.88, 19.18], [72.88, 19.0]]] },
    },
    {
      type: 'Feature',
      id: 'navi-mumbai',
      properties: { name: 'Navi Mumbai', hub: 'Mumbai-Pune', water_stress: 'High', climate_vulnerability: 'Medium' },
      geometry: { type: 'Polygon', coordinates: [[[72.91, 18.96], [73.15, 18.96], [73.15, 19.08], [72.91, 19.08], [72.91, 18.96]]] },
    },
    {
      type: 'Feature',
      id: 'chennai-north',
      properties: { name: 'Chennai North', hub: 'Chennai', water_stress: 'Extreme', climate_vulnerability: 'High' },
      geometry: { type: 'Polygon', coordinates: [[[80.17, 12.99], [80.37, 12.99], [80.37, 13.17], [80.17, 13.17], [80.17, 12.99]]] },
    },
    {
      type: 'Feature',
      id: 'gachibowli',
      properties: { name: 'Gachibowli', hub: 'Hyderabad', water_stress: 'Medium', climate_vulnerability: 'Medium' },
      geometry: { type: 'Polygon', coordinates: [[[78.31, 17.38], [78.47, 17.38], [78.47, 17.5], [78.31, 17.5], [78.31, 17.38]]] },
    },
    {
      type: 'Feature',
      id: 'noida',
      properties: { name: 'Noida', hub: 'NCR', water_stress: 'Medium', climate_vulnerability: 'High' },
      geometry: { type: 'Polygon', coordinates: [[[77.3, 28.46], [77.49, 28.46], [77.49, 28.61], [77.3, 28.61], [77.3, 28.46]]] },
    },
    {
      type: 'Feature',
      id: 'whitefield',
      properties: { name: 'Whitefield', hub: 'Bengaluru', water_stress: 'Medium', climate_vulnerability: 'Medium' },
      geometry: { type: 'Polygon', coordinates: [[[77.68, 12.91], [77.82, 12.91], [77.82, 13.06], [77.68, 13.06], [77.68, 12.91]]] },
    },
    {
      type: 'Feature',
      id: 'bommasandra',
      properties: { name: 'Bommasandra', hub: 'Bengaluru', water_stress: 'Low', climate_vulnerability: 'Medium' },
      geometry: { type: 'Polygon', coordinates: [[[77.57, 12.94], [77.72, 12.94], [77.72, 13.08], [77.57, 13.08], [77.57, 12.94]]] },
    },
    {
      type: 'Feature',
      id: 'dighi',
      properties: { name: 'Dighi', hub: 'Mumbai-Pune', water_stress: 'High', climate_vulnerability: 'High' },
      geometry: { type: 'Polygon', coordinates: [[[72.83, 18.46], [73.0, 18.46], [73.0, 18.59], [72.83, 18.59], [72.83, 18.46]]] },
    },
  ],
}

const getFallbackSummary = (): Summary => {
  const total = FALLBACK_FACILITIES.length
  const confirmed = FALLBACK_FACILITIES.filter((facility) => facility.classification_tier === 'Confirmed').length
  const highWaterStress = FALLBACK_FACILITIES.filter((facility) => facility.water_stress === 'High' || facility.water_stress === 'Extreme').length
  const counts = FALLBACK_FACILITIES.reduce<Record<string, number>>((accumulator, facility) => {
    accumulator[facility.hub] = (accumulator[facility.hub] ?? 0) + 1
    return accumulator
  }, {})
  const topHub = Object.entries(counts).sort((left, right) => right[1] - left[1])[0]?.[0] ?? 'Mumbai-Pune'

  return {
    total_facilities: total,
    confirmed_ai_percent: Number(((confirmed / total) * 100).toFixed(1)),
    high_water_stress_count: highWaterStress,
    top_hub: topHub,
    hub_breakdown: counts,
  }
}

const riskLegend = {
  water: [
    { level: 'Low', className: 'risk-low' },
    { level: 'Medium', className: 'risk-medium' },
    { level: 'High', className: 'risk-high' },
    { level: 'Extreme', className: 'risk-extreme' },
  ],
  climate: [
    { level: 'Low', className: 'risk-low' },
    { level: 'Medium', className: 'risk-medium' },
    { level: 'High', className: 'risk-high' },
  ],
} as const

const getTierClass = (tier: string) => {
  return tier.toLowerCase().replace(/\s+/g, '-')
}

const getRiskClass = (value: string) => {
  return value.toLowerCase().replace(/\s+/g, '-')
}

const getRiskColor = (value: string) => {
  const colors: Record<string, string> = {
    Low: '#34d399',
    Medium: '#fbbf24',
    High: '#f97316',
    Extreme: '#ef4444',
  }
  return colors[value] ?? '#94a3b8'
}

const isRecentlyVerified = (date: string) => date >= '2026-08-01'

const getCityMapsUrl = (location: SearchLocation) => {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${location.name}, ${location.state}`)}`
}

const getCitySearchUrl = (location: SearchLocation) => {
  return `https://www.google.com/search?q=${encodeURIComponent(`${location.name}, ${location.state} India`)}`
}

const getDistanceKm = (from: SearchLocation, facility: Facility) => {
  const radians = (degrees: number) => (degrees * Math.PI) / 180
  const latitudeDelta = radians(facility.latitude - from.latitude)
  const longitudeDelta = radians(facility.longitude - from.longitude)
  const arc =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(from.latitude)) *
      Math.cos(radians(facility.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc))
}

const isPointInRing = (longitude: number, latitude: number, ring: number[][]) => {
  let inside = false
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current++) {
    const [currentLongitude, currentLatitude] = ring[current]
    const [previousLongitude, previousLatitude] = ring[previous]
    const crossesLatitude = (currentLatitude > latitude) !== (previousLatitude > latitude)
    const crossingLongitude =
      ((previousLongitude - currentLongitude) * (latitude - currentLatitude)) /
        (previousLatitude - currentLatitude || Number.EPSILON) +
      currentLongitude
    if (crossesLatitude && longitude < crossingLongitude) inside = !inside
  }
  return inside
}

const getMarkerIcon = (tier: string, riskMode: RiskMode, riskValue: string) =>
  L.divIcon({
    className: 'custom-marker-wrapper',
    html: `<span class="marker-bubble marker-${getTierClass(tier)} ${riskMode === 'water' ? 'mode-water' : 'mode-climate'} risk-${getRiskClass(riskValue)}"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  })

const searchLocationIcon = L.divIcon({
  className: 'search-location-wrapper',
  html: '<span class="search-location-marker"></span>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
})

function MapViewport({
  location,
  facilities,
  focusToken,
}: {
  location: SearchLocation | null
  facilities: Facility[]
  focusToken: number
}) {
  const map = useMap()

  useEffect(() => {
    if (location) map.flyTo([location.latitude, location.longitude], 10, { duration: 0.8 })
  }, [location, map])

  useEffect(() => {
    if (!focusToken) return
    if (location) {
      map.flyTo([location.latitude, location.longitude], 10, { duration: 0.8 })
    } else if (facilities.length) {
      map.fitBounds(facilities.map((facility) => [facility.latitude, facility.longitude]), { padding: [36, 36] })
    } else {
      map.setView([22.5, 80.25], 5)
    }
  }, [facilities, focusToken, location, map])

  return null
}

const fallbackCityLocations: SearchLocation[] = [
  { name: 'Mumbai', state: 'Maharashtra', displayName: 'Mumbai, Maharashtra, India', latitude: 19.076, longitude: 72.8777 },
  { name: 'Panvel', state: 'Maharashtra', displayName: 'Panvel, Maharashtra, India', latitude: 18.989, longitude: 73.117 },
  { name: 'Dighi', state: 'Maharashtra', displayName: 'Dighi, Maharashtra, India', latitude: 18.53, longitude: 72.91 },
  { name: 'Pune', state: 'Maharashtra', displayName: 'Pune, Maharashtra, India', latitude: 18.5204, longitude: 73.8567 },
  { name: 'Chennai', state: 'Tamil Nadu', displayName: 'Chennai, Tamil Nadu, India', latitude: 13.0827, longitude: 80.2707 },
  { name: 'Hyderabad', state: 'Telangana', displayName: 'Hyderabad, Telangana, India', latitude: 17.385, longitude: 78.4867 },
  { name: 'Gachibowli', state: 'Telangana', displayName: 'Gachibowli, Telangana, India', latitude: 17.4401, longitude: 78.3802 },
  { name: 'Madhapur', state: 'Telangana', displayName: 'Madhapur, Telangana, India', latitude: 17.450, longitude: 78.388 },
  { name: 'Noida', state: 'Uttar Pradesh', displayName: 'Noida, Uttar Pradesh, India', latitude: 28.5355, longitude: 77.391 },
  { name: 'Delhi', state: 'Delhi', displayName: 'Delhi, India', latitude: 28.6139, longitude: 77.209 },
  { name: 'Gurugram', state: 'Haryana', displayName: 'Gurugram, Haryana, India', latitude: 28.4595, longitude: 77.0266 },
  { name: 'Bengaluru', state: 'Karnataka', displayName: 'Bengaluru, Karnataka, India', latitude: 12.9716, longitude: 77.5946 },
  { name: 'Whitefield', state: 'Karnataka', displayName: 'Whitefield, Bengaluru, Karnataka, India', latitude: 12.9698, longitude: 77.7499 },
  { name: 'Bommasandra', state: 'Karnataka', displayName: 'Bommasandra, Bengaluru, Karnataka, India', latitude: 13.012, longitude: 77.648 },
  { name: 'Navi Mumbai', state: 'Maharashtra', displayName: 'Navi Mumbai, Maharashtra, India', latitude: 19.033, longitude: 73.0297 },
]

const getMatchedHub = (location: SearchLocation) => {
  const value = `${location.name} ${location.displayName}`.toLowerCase()
  const matches: Array<[string, string[]]> = [
    ['Mumbai-Pune', ['mumbai', 'panvel', 'dighi', 'pune', 'navi mumbai']],
    ['Chennai', ['chennai']],
    ['Hyderabad', ['hyderabad', 'gachibowli', 'madhapur']],
    ['NCR', ['noida', 'delhi', 'gurgaon', 'gurugram']],
    ['Bengaluru', ['bengaluru', 'bangalore', 'whitefield', 'bommasandra']],
  ]

  return matches.find(([, names]) => names.some((name) => value.includes(name)))?.[0] ?? null
}

function App() {
  const [facilities, setFacilities] = useState<Facility[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [districts, setDistricts] = useState<DistrictFeatureCollection | null>(null)
  const [searchLocation, setSearchLocation] = useState<SearchLocation | null>(null)
  const [locationLoading, setLocationLoading] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [placeSuggestions, setPlaceSuggestions] = useState<SearchLocation[]>([])
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0)
  const [search, setSearch] = useState('')
  const [selectedHub, setSelectedHub] = useState('All')
  const [selectedTier, setSelectedTier] = useState('All')
  const [selectedFacilityId, setSelectedFacilityId] = useState<number | null>(null)
  const [mapMode, setMapMode] = useState<RiskMode>('water')
  const [mapFocusToken, setMapFocusToken] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [backendHealthy, setBackendHealthy] = useState(false)
  const [backendIssue, setBackendIssue] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    const loadData = async () => {
      try {
        setLoading(true)

        const healthResponse = await fetch(createApiUrl('/api/health'), { signal: controller.signal })
        if (!healthResponse.ok) {
          throw new Error('Backend health check failed.')
        }

        setBackendHealthy(true)

        const [facilityResponse, summaryResponse] = await Promise.all([
          fetch(createApiUrl('/api/facilities'), { signal: controller.signal }),
          fetch(createApiUrl('/api/stats/summary'), { signal: controller.signal }),
        ])

        const districtResponse = await fetch(createApiUrl('/api/districts/geojson'), { signal: controller.signal })

        if (!facilityResponse.ok || !summaryResponse.ok || !districtResponse.ok) {
          throw new Error('Unable to load observatory data.')
        }

        const facilityData = (await facilityResponse.json()) as Facility[]
        const summaryData = (await summaryResponse.json()) as Summary
        const districtData = (await districtResponse.json()) as DistrictFeatureCollection

        setFacilities(facilityData)
        setSummary(summaryData)
        setDistricts(districtData)
        setBackendIssue(null)
        setSelectedFacilityId((current) => {
          if (facilityData.some((facility) => facility.id === current)) return current
          return facilityData[0]?.id ?? null
        })
        setError(null)
      } catch (caughtError) {
        if ((caughtError as Error).name !== 'AbortError') {
          setBackendHealthy(false)
          setFacilities(FALLBACK_FACILITIES)
          setSummary(getFallbackSummary())
          setDistricts(FALLBACK_DISTRICTS)
          setSelectedFacilityId(FALLBACK_FACILITIES[0]?.id ?? null)
          setBackendIssue(caughtError instanceof Error ? caughtError.message : 'API request failed.')
        }
      } finally {
        setLoading(false)
      }
    }

    loadData()

    return () => controller.abort()
  }, [])

  useEffect(() => {
    const query = search.trim()
    if (query.length < 2 || searchLocation?.name === query) return

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        setLocationLoading(true)
        const response = await fetch(createApiUrl(`/api/places?q=${encodeURIComponent(query)}`), {
          signal: controller.signal,
        })
        if (!response.ok) {
          const fallbackLocations = fallbackCityLocations.filter((city) =>
            `${city.name} ${city.state} ${city.displayName}`.toLowerCase().includes(query.toLowerCase()),
          ).slice(0, 5)
          setPlaceSuggestions(fallbackLocations)
          setLocationError(fallbackLocations.length
            ? 'Live lookup unavailable; offline locations are approximate.'
            : response.status === 404
              ? 'No matching Indian place was found.'
              : 'Live place lookup is unavailable, and this city is not in the offline place list.')
          return
        }

        const results = (await response.json()) as Array<{
          name: string
          state: string
          display_name: string
          lat: string
          lon: string
        }>
        setPlaceSuggestions(results.map((result) => ({
          name: result.name,
          state: result.state,
          displayName: result.display_name,
          latitude: Number(result.lat),
          longitude: Number(result.lon),
        })))
        setActiveSuggestionIndex(0)
        setLocationError(null)
      } catch (caughtError) {
        if ((caughtError as Error).name !== 'AbortError') {
          const fallbackLocations = fallbackCityLocations.filter((city) =>
            `${city.name} ${city.state} ${city.displayName}`.toLowerCase().includes(query.toLowerCase()),
          ).slice(0, 5)
          setPlaceSuggestions(fallbackLocations)
          setLocationError(fallbackLocations.length
            ? 'Live lookup unavailable; offline locations are approximate.'
            : 'City lookup failed. Try a pilot city while the live place service is unavailable.')
        }
      } finally {
        if (!controller.signal.aborted) setLocationLoading(false)
      }
    }, 1000)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [search, searchLocation])

  const filteredFacilities = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return facilities.filter((facility) => {
      const matchesHub = selectedHub === 'All' || facility.hub === selectedHub
      const matchesTier = selectedTier === 'All' || facility.classification_tier === selectedTier
      const searchable = `${facility.name} ${facility.operator} ${facility.district} ${facility.hub}`.toLocaleLowerCase()
      return matchesHub && matchesTier && (!query || searchable.includes(query))
    })
  }, [facilities, search, selectedHub, selectedTier])

  const allNearbyFacilities = useMemo(() => {
    if (!searchLocation) return []
    return facilities
      .map((facility) => ({ facility, distance: getDistanceKm(searchLocation, facility) }))
      .filter(({ distance }) => distance <= NEARBY_RADIUS_KM)
      .sort((first, second) => first.distance - second.distance)
  }, [facilities, searchLocation])

  const nearbyFacilities = useMemo(
    () => allNearbyFacilities.filter(({ facility }) =>
      (selectedHub === 'All' || facility.hub === selectedHub) &&
      (selectedTier === 'All' || facility.classification_tier === selectedTier),
    ),
    [allNearbyFacilities, selectedHub, selectedTier],
  )

  const clearFacilityFilters = () => {
    setSelectedHub('All')
    setSelectedTier('All')
  }

  const mapFacilities = searchLocation
    ? nearbyFacilities.map(({ facility }) => facility)
    : filteredFacilities

  const selectedFacility = searchLocation
    ? nearbyFacilities.find(({ facility }) => facility.id === selectedFacilityId)?.facility ?? nearbyFacilities[0]?.facility ?? null
    : filteredFacilities.find((facility) => facility.id === selectedFacilityId) ?? filteredFacilities[0] ?? null

  const displayedDistricts = useMemo(() => {
    if (!districts || selectedHub === 'All') return districts
    return {
      ...districts,
      features: districts.features.filter((feature) => feature.properties.hub === selectedHub),
    }
  }, [districts, selectedHub])

  const summaryCards = summary
    ? [
        { label: 'Total facilities', value: summary.total_facilities.toString(), meta: 'Prototype dataset' },
        { label: 'Classification coverage', value: `${summary.confirmed_ai_percent}%`, meta: 'Confirmed AI facilities' },
        { label: 'High-water stress', value: summary.high_water_stress_count.toString(), meta: 'Facilities at risk' },
        { label: 'Top hub', value: summary.top_hub, meta: 'Largest concentration' },
      ]
    : []

  const hubBreakdown = useMemo(() => {
    const grouped = new Map<string, Record<FacilityTier, number>>()
    filteredFacilities.forEach((facility) => {
      const tiers = grouped.get(facility.hub) ?? { Confirmed: 0, Likely: 0, 'Mixed-use': 0, Unclassified: 0 }
      tiers[facility.classification_tier] += 1
      grouped.set(facility.hub, tiers)
    })
    return Array.from(grouped.entries()).map(([hub, tiers]) => ({
      hub,
      count: Object.values(tiers).reduce((total, value) => total + value, 0),
      tiers,
    }))
  }, [filteredFacilities])

  const activeRiskLabel = mapMode === 'water' ? 'Water stress' : 'Climate risk'

  const selectedFacilityRiskValue = selectedFacility
    ? mapMode === 'water'
      ? selectedFacility.water_stress
      : selectedFacility.climate_vulnerability
    : null

  const matchedHub = searchLocation ? getMatchedHub(searchLocation) : null
  const locationLabel = searchLocation
    ? [searchLocation.name, searchLocation.state].filter(Boolean).join(', ')
    : ''

  const locationDistrict = useMemo(() => {
    if (!searchLocation || !districts?.features.length) return null
    return districts.features.find((feature) =>
      isPointInRing(searchLocation.longitude, searchLocation.latitude, feature.geometry.coordinates[0]),
    ) ?? null
  }, [districts, searchLocation])

  const correlationPoints = useMemo(() => {
    const riskScores: Record<string, number> = { Low: 1, Medium: 2, High: 3, Extreme: 4 }
    const aiDensityByDistrict = new Map<string, number>()
    filteredFacilities.forEach((facility) => {
      const aiCount = facility.classification_tier === 'Confirmed' || facility.classification_tier === 'Likely' ? 1 : 0
      aiDensityByDistrict.set(facility.district, (aiDensityByDistrict.get(facility.district) ?? 0) + aiCount)
    })
    const maximumDensity = Math.max(...aiDensityByDistrict.values(), 1)

    return filteredFacilities.map((facility) => ({
      label: facility.district,
      x: ((riskScores[facility.water_stress] - 0.5) / 4) * 100,
      y: 10 + ((aiDensityByDistrict.get(facility.district) ?? 0) / maximumDensity) * 80,
    }))
  }, [filteredFacilities])

  const handleSearchChange = (value: string) => {
    setSearch(value)
    setSearchLocation(null)
    setLocationError(null)
    setPlaceSuggestions([])
    setActiveSuggestionIndex(0)
    setSuggestionsOpen(value.trim().length >= 2)
    setLocationLoading(value.trim().length >= 2)
    if (value.trim().length < 2) {
      setLocationLoading(false)
    }
  }

  const selectCitySuggestion = (location: SearchLocation) => {
    setSearch(location.name)
    setSearchLocation(location)
    setPlaceSuggestions([])
    setSuggestionsOpen(false)
    setLocationLoading(false)
    setLocationError(null)
  }

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setSuggestionsOpen(false)
    } else if (event.key === 'ArrowDown' && placeSuggestions.length) {
      event.preventDefault()
      setSuggestionsOpen(true)
      setActiveSuggestionIndex((index) => (index + 1) % placeSuggestions.length)
    } else if (event.key === 'ArrowUp' && placeSuggestions.length) {
      event.preventDefault()
      setActiveSuggestionIndex((index) => (index - 1 + placeSuggestions.length) % placeSuggestions.length)
    } else if (event.key === 'Enter' && placeSuggestions.length) {
      event.preventDefault()
      selectCitySuggestion(placeSuggestions[activeSuggestionIndex])
    }
  }

  const resetFilters = () => {
    handleSearchChange('')
    setSelectedHub('All')
    setSelectedTier('All')
  }

  const handleDownloadCsv = () => {
    const columns = ['Name', 'Operator', 'Hub', 'District', 'Tier', 'Water stress (prototype)', 'Climate vulnerability (prototype)', 'Capacity MW', 'Latitude', 'Longitude', 'Rationale', 'Source reference', 'Direct evidence URL', 'Last verified']
    const rows = filteredFacilities.map((facility) => [
      facility.name,
      facility.operator,
      facility.hub,
      facility.district,
      facility.classification_tier,
      facility.water_stress,
      facility.climate_vulnerability,
      facility.capacity_mw,
      facility.latitude,
      facility.longitude,
      facility.rationale,
      facility.source,
      facility.source_url ?? '',
      facility.last_verified,
    ])
    const escapeCsv = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`
    const csv = [columns, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'india-ai-data-centre-facilities.csv'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const handleExploreMap = () => {
    setMapFocusToken((token) => token + 1)
    document.querySelector('.map-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const districtStyle = (feature?: { properties?: DistrictProperties }) => {
    const properties = feature?.properties
    const value = properties
      ? mapMode === 'water'
        ? properties.water_stress
        : properties.climate_vulnerability
      : 'Low'

    return {
      color: getRiskColor(value),
      weight: 1.5,
      fillColor: getRiskColor(value),
      fillOpacity: 0.2,
      opacity: 0.85,
    }
  }

  return (
    <div className="app-shell">
      <div className={backendHealthy ? 'live-status live' : 'live-status offline'}>
        <span className="status-dot" />
        {backendHealthy
          ? 'API connected · prototype dataset'
          : `Demo data · API unavailable${backendIssue ? `: ${backendIssue}` : ''}`}
      </div>

      <header className="topbar">
        <div>
          <p className="eyebrow">AI Infrastructure Observatory</p>
          <h1>{APP_TITLE}</h1>
        </div>
        <div className="header-actions">
          <button className="ghost-button" type="button" onClick={handleDownloadCsv} disabled={!filteredFacilities.length}>
            Download CSV
          </button>
          <button className="primary-button" type="button" onClick={handleExploreMap}>Explore the map</button>
        </div>
      </header>

      <main className="content-grid">
        <aside className="filter-panel">
          <div className="panel-heading">
            <h2>Filters</h2>
            <button className="text-button" type="button" onClick={resetFilters}>
              Reset
            </button>
          </div>

          <div className="field-label">
            <label htmlFor="city-search">Search city or facility</label>
            <div className="search-input-wrap">
              <input
                id="city-search"
                type="text"
                value={search}
                onChange={(event) => handleSearchChange(event.target.value)}
                onFocus={() => setSuggestionsOpen(true)}
                onBlur={() => window.setTimeout(() => setSuggestionsOpen(false), 140)}
                onKeyDown={handleSearchKeyDown}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={suggestionsOpen && placeSuggestions.length > 0}
                aria-controls="city-suggestions"
                aria-activedescendant={placeSuggestions.length ? `city-suggestion-${activeSuggestionIndex}` : undefined}
                placeholder="Type a city, e.g. Mumbai"
              />
              {suggestionsOpen && search.trim().length >= 2 && (
                <div className="city-suggestions" id="city-suggestions" role="listbox" aria-label="City suggestions">
                  {locationLoading && <div className="suggestion-status">Searching Indian places…</div>}
                  {!locationLoading && placeSuggestions.map((location, index) => (
                    <button
                      id={`city-suggestion-${index}`}
                      className={index === activeSuggestionIndex ? 'city-suggestion active' : 'city-suggestion'}
                      key={`${location.displayName}-${location.latitude}-${location.longitude}`}
                      type="button"
                      role="option"
                      aria-selected={index === activeSuggestionIndex}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectCitySuggestion(location)}
                    >
                      <strong>{location.name}{location.state ? `, ${location.state}` : ''}</strong>
                      <span>{location.displayName}</span>
                    </button>
                  ))}
                  {!locationLoading && !placeSuggestions.length && search.trim().length >= 2 && (
                    <div className="suggestion-status">{locationError ?? 'No place suggestions found.'}</div>
                  )}
                  <div className="suggestion-attribution">Place suggestions by OpenStreetMap Nominatim</div>
                </div>
              )}
            </div>
          </div>

          <div className="filter-group">
            <span className="label-title">Hub</span>
            <div className="chip-row">
              {hubs.map((hub) => (
                <button
                  key={hub}
                  type="button"
                  className={hub === selectedHub ? 'chip active' : 'chip'}
                  onClick={() => setSelectedHub(hub)}
                >
                  {hub}
                </button>
              ))}
            </div>
          </div>

          <div className="filter-group">
            <span className="label-title">AI relevance</span>
            <div className="chip-row stacked">
              {tierOptions.map((tier) => (
                <button
                  key={tier}
                  type="button"
                  className={tier === selectedTier ? 'chip active' : 'chip'}
                  onClick={() => setSelectedTier(tier)}
                >
                  {tier}
                </button>
              ))}
            </div>
          </div>

          <div className="legend-box">
            <span className="label-title">Legend</span>
            <div className="legend-item"><span className="dot confirmed"></span>Confirmed</div>
            <div className="legend-item"><span className="dot likely"></span>Likely</div>
            <div className="legend-item"><span className="dot mixed"></span>Mixed-use</div>
            <div className="legend-item"><span className="dot unclassified"></span>Unclassified</div>
          </div>
        </aside>

        <section className="map-panel">
          <div className="map-header">
            <div>
              <p className="eyebrow">Prototype coverage</p>
              <h2>5 metro hubs</h2>
              <span className="map-data-note">Prototype risk areas · not verified city-level measurements</span>
            </div>
            <div className="toggle-group">
              <button
                className={mapMode === 'water' ? 'toggle active' : 'toggle'}
                type="button"
                onClick={() => setMapMode('water')}
              >
                Water stress
              </button>
              <button
                className={mapMode === 'climate' ? 'toggle active' : 'toggle'}
                type="button"
                onClick={() => setMapMode('climate')}
              >
                Climate risk
              </button>
            </div>
          </div>

          <div className="risk-legend" aria-label={`${activeRiskLabel} legend`}>
            {riskLegend[mapMode].map((item) => (
              <span key={item.level} className="risk-tag">
                <span className={`risk-dot ${item.className}`} />
                {item.level}
              </span>
            ))}
          </div>

          <div className="map-surface">
            {loading ? (
              <div className="map-loading">Loading facilities…</div>
            ) : error ? (
              <div className="map-loading error">{error}</div>
            ) : (
              <MapContainer center={[22.5, 80.25]} zoom={5} scrollWheelZoom className="leaflet-map">
                <MapViewport location={searchLocation} facilities={mapFacilities} focusToken={mapFocusToken} />
                <TileLayer
                  attribution='&copy; OpenStreetMap contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {displayedDistricts && (
                  <GeoJSON
                    key={mapMode}
                    data={displayedDistricts as never}
                    style={districtStyle}
                    onEachFeature={(feature, layer) => {
                      const properties = feature.properties as DistrictProperties
                      const riskValue = mapMode === 'water'
                        ? properties.water_stress
                        : properties.climate_vulnerability
                      layer.bindTooltip(
                        `<strong>${properties.name}</strong><br />${activeRiskLabel}: ${riskValue}`,
                        { sticky: true },
                      )
                      layer.bindPopup(
                        `<strong>${properties.name}</strong><br />${properties.hub}<br />${activeRiskLabel}: ${riskValue}`,
                      )
                    }}
                  />
                )}
                {searchLocation && (
                  <Marker position={[searchLocation.latitude, searchLocation.longitude]} icon={searchLocationIcon}>
                    <Popup>
                      <div className="popup-card">
                        <strong>Search location</strong>
                        <div>{searchLocation.displayName}</div>
                        <div className="popup-risk">Nearby facilities: {nearbyFacilities.length}</div>
                      </div>
                    </Popup>
                  </Marker>
                )}
                {mapFacilities.map((facility) => (
                  <Marker
                    key={facility.id}
                    position={[facility.latitude, facility.longitude]}
                    icon={getMarkerIcon(
                      facility.classification_tier,
                      mapMode,
                      mapMode === 'water' ? facility.water_stress : facility.climate_vulnerability,
                    )}
                    eventHandlers={{ click: () => setSelectedFacilityId(facility.id) }}
                  >
                    <Popup>
                      <div className="popup-card">
                        <strong>{facility.name}</strong>
                        <div>{facility.operator}</div>
                        <div>{facility.hub} • {facility.district}</div>
                        <div className="popup-tier">{facility.classification_tier}</div>
                        <div className="popup-risk">{activeRiskLabel}: {mapMode === 'water' ? facility.water_stress : facility.climate_vulnerability}</div>
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            )}
          </div>
          {search.trim() && (
            <div className="map-status" role="status">
              {locationLoading ? (
                'Locating this city…'
              ) : locationError ? (
                `${locationError}${searchLocation ? ` Showing ${locationLabel}.` : ''}`
              ) : searchLocation && !nearbyFacilities.length && allNearbyFacilities.length ? (
                <>
                  Located {locationLabel}. {allNearbyFacilities.length} nearby {allNearbyFacilities.length === 1 ? 'record is' : 'records are'} hidden by the active hub or AI-relevance filter.{' '}
                  <button className="inline-reset" type="button" onClick={clearFacilityFilters}>Clear facility filters</button>
                </>
              ) : searchLocation && !matchedHub ? (
                `${locationLabel} does not map to a named pilot hub in this prototype. The dataset covers five hubs: ${hubs.slice(1).join(', ')}.`
              ) : searchLocation && !nearbyFacilities.length ? (
                `Located ${locationLabel}. No matching facility records are within ${NEARBY_RADIUS_KM} km.`
              ) : searchLocation && !filteredFacilities.length ? (
                <>
                  Located {locationLabel}. Nearby facilities are shown separately; none match the city-name search.
                </>
              ) : searchLocation ? (
                `${locationLabel} · ${filteredFacilities.length} record-text matches · ${nearbyFacilities.length} facilities within ${NEARBY_RADIUS_KM} km`
              ) : !filteredFacilities.length ? (
                <>No location or facility found for “{search.trim()}”.</>
              ) : null}
            </div>
          )}
        </section>

        <aside className="detail-panel">
          {selectedFacility ? (
            <>
              <div className="detail-header">
                <p className="eyebrow">{searchLocation ? 'Nearby facility' : 'Selected facility'}</p>
                <h2>{selectedFacility.name}</h2>
                <p className="selection-context">
                  {searchLocation
                    ? `${getDistanceKm(searchLocation, selectedFacility).toFixed(1)} km from ${locationLabel} · proximity match; exact city membership is not verified.`
                    : 'Selected from the current filters.'}
                </p>
              </div>

              <div className="tier-pill">{selectedFacility.classification_tier}</div>
              {isRecentlyVerified(selectedFacility.last_verified) && (
                <span className="recent-badge">Recently verified</span>
              )}

              <dl className="detail-list">
                <div>
                  <dt>Operator</dt>
                  <dd>{selectedFacility.operator}</dd>
                </div>
                <div>
                  <dt>Hub</dt>
                  <dd>{selectedFacility.hub}</dd>
                </div>
                <div>
                  <dt>District</dt>
                  <dd>{selectedFacility.district}</dd>
                </div>
                <div>
                  <dt>Capacity</dt>
                  <dd>{selectedFacility.capacity_mw} MW</dd>
                </div>
                <div>
                  <dt>{activeRiskLabel} (prototype)</dt>
                  <dd>{selectedFacilityRiskValue ?? '—'}</dd>
                </div>
                <div>
                  <dt>{mapMode === 'water' ? 'Climate vulnerability' : 'Water stress'} (prototype)</dt>
                  <dd>{mapMode === 'water' ? selectedFacility.climate_vulnerability : selectedFacility.water_stress}</dd>
                </div>
                <div>
                  <dt>Last verified</dt>
                  <dd>{selectedFacility.last_verified}</dd>
                </div>
              </dl>

              <div className="rationale-box">
                <h3>{searchLocation ? 'Why this nearby facility is shown' : 'Why this facility is included'}</h3>
                <p>{selectedFacility.rationale}</p>
              </div>

              <div className="source-box">
                <h3>Source and evidence</h3>
                <p>{selectedFacility.source}</p>
                {selectedFacility.source_url ? (
                  <a href={selectedFacility.source_url}>Open cited source</a>
                ) : (
                  <p>No direct source URL is recorded for this prototype entry. The source label is a research lead, not independently verifiable proof.</p>
                )}
              </div>
            </>
          ) : searchLocation ? (
            <div className="empty-state city-empty-state">
              <div className="empty-state-content">
                <strong>No nearby facility selected</strong>
                <p>City risks, coverage notes, and the full nearby facility search are shown in the city results below.</p>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-content">
                <strong>No facility selected</strong>
                <p>The current search or filters returned no facility records.</p>
                <button className="inline-reset" type="button" onClick={resetFilters}>Reset filters</button>
              </div>
            </div>
          )}
        </aside>
      </main>

      {searchLocation && (
        <section className="city-profile city-profile-band panel" aria-label={`${locationLabel} city information`}>
          <div className="city-profile-heading">
            <div className="detail-header">
              <p className="eyebrow">City profile</p>
              <h2>{locationLabel}</h2>
              <p className="selection-context">{searchLocation.displayName}</p>
            </div>
            <p className="city-coordinates">{searchLocation.latitude.toFixed(4)}, {searchLocation.longitude.toFixed(4)}</p>
          </div>

          <div className="city-facts-grid">
            <div className="city-fact">
              <span>Water stress</span>
              <strong>{locationDistrict?.properties.water_stress ?? 'Not covered'}</strong>
              <small>{locationDistrict?.properties.name ?? 'No mapped prototype area'}</small>
            </div>
            <div className="city-fact">
              <span>Climate risk</span>
              <strong>{locationDistrict?.properties.climate_vulnerability ?? 'Not covered'}</strong>
              <small>{locationDistrict?.properties.name ?? 'No mapped prototype area'}</small>
            </div>
            <div className="city-fact">
              <span>Nearby facilities</span>
              <strong>{allNearbyFacilities.length}</strong>
              <small>within {NEARBY_RADIUS_KM} km of search point</small>
            </div>
            <div className="city-fact">
              <span>Pilot hub</span>
              <strong>{matchedHub ?? 'No name match'}</strong>
              <small>{matchedHub ? 'Name-based association, not a boundary' : 'Outside the five named pilot hubs'}</small>
            </div>
          </div>

          <div className="rationale-box city-summary-note">
            <h3>City coverage and risk</h3>
            <p>
              {locationDistrict
                ? 'Risk categories describe the prototype polygon containing this search point. They are not verified city-wide or facility measurements; dataset release and measurement date are not attached.'
                : 'No risk polygon covers this search point, so water stress and climate risk are not available for this city in the current prototype. The app does not infer values from a nearby district.'}
              {' '}
              {allNearbyFacilities.length
                ? `The list below shows ${allNearbyFacilities.length} facility record${allNearbyFacilities.length === 1 ? '' : 's'} within ${NEARBY_RADIUS_KM} km; proximity does not establish that a facility is inside the city.`
                : `No catalogued facility record is within ${NEARBY_RADIUS_KM} km. This means no record in the current prototype, not proof that the city has no data centres.`}
            </p>
            {allNearbyFacilities.length > 0 && nearbyFacilities.length === 0 && (
              <p>
                Nearby records are hidden by the active {selectedHub !== 'All' ? `hub filter (${selectedHub})` : `AI-relevance filter (${selectedTier})`}.
                {' '}<button className="inline-reset" type="button" onClick={clearFacilityFilters}>Clear facility filters</button>
              </p>
            )}
          </div>

          <section className="city-facility-list" aria-label="Nearby data centre records">
            <div className="panel-heading">
              <h3>Nearby data-centre records</h3>
              <span>{allNearbyFacilities.length} within {NEARBY_RADIUS_KM} km</span>
            </div>
            {allNearbyFacilities.length ? allNearbyFacilities.map(({ facility, distance }) => (
              <article className="city-facility-row" key={facility.id}>
                <button
                  className="city-facility-main"
                  type="button"
                  onClick={() => {
                    setSelectedHub('All')
                    setSelectedTier('All')
                    setSelectedFacilityId(facility.id)
                  }}
                >
                  <span className="city-facility-title">
                    <strong>{facility.name}</strong>
                    <span>{facility.operator} · {facility.hub} · {facility.district} · {distance.toFixed(1)} km</span>
                  </span>
                  <span className="mini-pill">{facility.classification_tier}</span>
                  <span className="city-facility-reason"><strong>Why included:</strong> {facility.rationale}</span>
                </button>
                <span className="city-facility-source">
                  {facility.source_url ? (
                    <a href={facility.source_url}>Open {facility.source}</a>
                  ) : (
                    <>
                      <span>{facility.source} · direct facility citation not recorded</span>
                      {operatorUrls[facility.operator] && (
                        <a href={operatorUrls[facility.operator]}>Operator background (not facility evidence)</a>
                      )}
                    </>
                  )}
                </span>
              </article>
            )) : (
              <p className="city-no-facilities">No facility in the current prototype catalog is within {NEARBY_RADIUS_KM} km. Search coverage is limited to five pilot hubs and is not an exhaustive national inventory.</p>
            )}
          </section>

          <div className="resource-links city-resources">
            <a href="https://www.wri.org/aqueduct">Open WRI Aqueduct</a>
            <a href="https://www.ceew.in/">Open CEEW research</a>
            <a href="https://nominatim.openstreetmap.org/">Open Nominatim</a>
            <a href={getCityMapsUrl(searchLocation)}>Open this city on Google Maps</a>
            <a href={getCitySearchUrl(searchLocation)}>Research city infrastructure</a>
          </div>
        </section>
      )}

      <section className="stats-grid" aria-label="summary statistics">
        {summaryCards.map((card) => (
          <article key={card.label} className="stat-card">
            <span>{card.label}</span>
            <strong>{card.value}</strong>
            <small>{card.meta}</small>
          </article>
        ))}
      </section>

      <section className="dashboard-grid">
        <article className="panel chart-panel">
          <div className="panel-heading">
            <h3>Facilities by hub</h3>
            <span>{filteredFacilities.length} visible</span>
          </div>

          <div className="bar-chart" aria-label="Facilities by hub stacked by tier">
            {hubBreakdown.map((hub) => {
              const total = hub.count
              return (
                <div key={hub.hub} className="hub-bar-group">
                  <div className="hub-labels">
                    <span>{hub.hub}</span>
                    <strong>{total}</strong>
                  </div>
                  <div className="stacked-bars">
                    {(Object.entries(hub.tiers) as Array<[FacilityTier, number]>).map(([tier, count]) => (
                      <span
                        key={tier}
                        style={{ width: `${(count / total) * 100}%` }}
                        className={`segment ${getTierClass(tier)}`}
                        title={`${tier}: ${count}`}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </article>

        <article className="panel chart-panel">
          <div className="panel-heading">
            <h3>AI density vs water stress</h3>
            <span>{filteredFacilities.length} plotted · descriptive only</span>
          </div>

          <div className="scatter-chart" aria-label="AI density versus water stress">
            <div className="axis-labels x-label">Water stress</div>
            <div className="axis-labels y-label">AI density</div>
            {correlationPoints.length ? correlationPoints.map((point, index) => (
              <button
                key={`${point.label}-${index}`}
                type="button"
                className="scatter-point"
                style={{ left: `${point.x}%`, bottom: `${point.y}%` }}
                aria-label={`${point.label}: water stress and AI density point`}
                title={`${point.label} · water stress / AI density`}
              />
            )) : (
              <div className="chart-empty">No facility observations match this search.</div>
            )}
          </div>
          <p className="chart-caption">
            Points update with the active facility search and filters. Risk categories and this small-sample pattern are exploratory prototype context, not a measured or causal relationship.
          </p>
        </article>
      </section>

      <section className="panel table-panel">
        <div className="panel-heading">
          <div>
            <h3>Facility catalog</h3>
            <span>Source-annotated dataset</span>
          </div>
          <button className="ghost-button small" type="button" onClick={handleDownloadCsv} disabled={!filteredFacilities.length}>Export</button>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Hub</th>
                <th>Tier</th>
                <th>Water stress</th>
                <th>Source reference</th>
              </tr>
            </thead>
            <tbody>
              {filteredFacilities.map((facility) => (
                <tr key={facility.id} onClick={() => setSelectedFacilityId(facility.id)}>
                  <td>{facility.name}</td>
                  <td>{facility.hub}</td>
                  <td>
                    <span className="mini-pill">{facility.classification_tier}</span>
                    {isRecentlyVerified(facility.last_verified) && <span className="table-recent">Recent</span>}
                  </td>
                  <td>{facility.water_stress}</td>
                  <td>
                    {facility.source_url ? (
                      <a
                        className="table-source-link"
                        href={facility.source_url}
                        onClick={(event) => event.stopPropagation()}
                      >
                        Open {facility.source}
                      </a>
                    ) : (
                      <span className="table-source-missing" title="No direct source URL is recorded">
                        {facility.source} · citation URL missing
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="methodology panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Methodology</p>
            <h3>How the classification works</h3>
          </div>
        </div>

        <div className="methodology-grid">
          <article>
            <span>01</span>
            <h4>Confirmed</h4>
            <p>Operator names AI, HPC, GPU clusters in public announcements or filings.</p>
          </article>
          <article>
            <span>02</span>
            <h4>Likely</h4>
            <p>Indirect evidence such as hyperscaler launch plans, GPU rack mentions, or liquid-cooling permits.</p>
          </article>
          <article>
            <span>03</span>
            <h4>Mixed-use</h4>
            <p>General-purpose data centres with clear evidence of some AI workloads.</p>
          </article>
          <article>
            <span>04</span>
            <h4>Unclassified</h4>
            <p>Facilities identified, but not enough public evidence to assess AI relevance confidently.</p>
          </article>
        </div>
      </section>
    </div>
  )
}

export default App
