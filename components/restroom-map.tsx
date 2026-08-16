'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { Building2, Check, Loader2, Menu, Navigation, Send, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Field, FieldGroup } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

const CAMPUS_CENTER = { latitude: 37.2936, longitude: 126.9748 }

// 학교 영역 경계 좌표 (성균관대 자연과학캠퍼스 기준 - 모바일 드래그 여유 범위 확대)
const CAMPUS_BOUNDS = {
  sw: { latitude: 37.2870, longitude: 126.9670 },
  ne: { latitude: 37.3010, longitude: 126.9820 },
}

import { restrooms, type Restroom } from '@/lib/restrooms-data'

type NaverLatLng = {
  lat(): number
  lng(): number
}

type NaverLatLngBounds = unknown

type NaverMapInstance = {
  getCenter(): NaverLatLng
  setCenter(latlng: unknown): void
  setZoom(zoom: number): void
  getZoom(): number
}

type NaverMarkerInstance = {
  setMap(map: NaverMapInstance | null): void
}

type NaverEvent = {
  addListener(target: unknown, eventName: string, listener: (e?: unknown) => void): unknown
}

type NaverMaps = {
  LatLng: new (lat: number, lng: number) => NaverLatLng
  LatLngBounds: new (sw: NaverLatLng, ne: NaverLatLng) => NaverLatLngBounds
  Map: new (
    container: HTMLElement,
    options: {
      center: NaverLatLng
      zoom?: number
      minZoom?: number
      maxZoom?: number
      maxBounds?: NaverLatLngBounds
    },
  ) => NaverMapInstance
  Marker: new (options: {
    map: NaverMapInstance | null
    position: NaverLatLng
    title?: string
    icon?: {
      content: HTMLElement | string
      anchor?: unknown
    }
    zIndex?: number
  }) => NaverMarkerInstance
  Point: new (x: number, y: number) => unknown
  Event: NaverEvent
}

declare global {
  interface Window {
    naver?: { maps: NaverMaps }
    navermap_authFailure?: () => void
  }
}

function loadNaverMaps(clientId: string) {
  return new Promise<NaverMaps>((resolve, reject) => {
    if (window.naver?.maps) {
      resolve(window.naver.maps)
      return
    }

    const existingScript = document.querySelector<HTMLScriptElement>('script[data-naver-map-sdk]')
    if (existingScript) {
      const checkInterval = setInterval(() => {
        if (window.naver?.maps) {
          clearInterval(checkInterval)
          resolve(window.naver.maps)
        }
      }, 50)

      setTimeout(() => {
        clearInterval(checkInterval)
        if (window.naver?.maps) {
          resolve(window.naver.maps)
        } else {
          reject(new Error('네이버 지도 SDK 로드 응답이 지연되고 있습니다.'))
        }
      }, 10000)
      return
    }

    const script = document.createElement('script')
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(clientId)}`
    script.async = true
    script.dataset.naverMapSdk = 'true'

    script.onload = () => {
      if (window.naver?.maps) {
        resolve(window.naver.maps)
      } else {
        reject(new Error('네이버 지도 SDK를 불러오지 못했습니다.'))
      }
    }

    script.onerror = () => {
      reject(new Error('네이버 지도 SDK 연결에 실패했습니다.'))
    }

    document.head.appendChild(script)
  })
}

// 하버사인(Haversine) 공식으로 두 위경도 좌표 간 거리(미터) 계산
function getDistanceInMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const Δφ = ((lat2 - lat1) * Math.PI) / 180
  const Δλ = ((lon2 - lon1) * Math.PI) / 180

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c
}

export function RestroomMap() {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const [message, setMessage] = useState('')
  const [mapError, setMapError] = useState<string | null>(null)
  const [selectedGender, setSelectedGender] = useState<'male' | 'female'>('male')
  const [isMapReady, setIsMapReady] = useState(false)
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [userCoords, setUserCoords] = useState<{ latitude: number; longitude: number } | null>(null)

  const naverMapsRef = useRef<NaverMaps | null>(null)
  const mapInstanceRef = useRef<NaverMapInstance | null>(null)
  const markersRef = useRef<NaverMarkerInstance[]>([])
  const currentOverlayRef = useRef<NaverMarkerInstance | null>(null)
  const userLocationOverlayRef = useRef<NaverMarkerInstance | null>(null)

  const showUserLocationOnMap = (lat: number, lng: number) => {
    setUserCoords({ latitude: lat, longitude: lng })
    const maps = naverMapsRef.current
    const map = mapInstanceRef.current
    if (!maps || !map) return

    // 기존 현위치 빨간 점 마커 제거
    if (userLocationOverlayRef.current) {
      userLocationOverlayRef.current.setMap(null)
      userLocationOverlayRef.current = null
    }

    const userDotElement = document.createElement('div')
    userDotElement.style.cssText = `
      position: relative;
      width: 18px;
      height: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      transform: translate(-50%, -50%);
    `

    userDotElement.innerHTML = `
      <div style="
        position: absolute;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: rgba(239, 68, 68, 0.3);
        border: 1.5px solid rgba(239, 68, 68, 0.6);
      "></div>
      <div style="
        position: relative;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: #ef4444;
        border: 2px solid #ffffff;
        box-shadow: 0 2px 8px rgba(239, 68, 68, 0.6);
      "></div>
    `

    const userOverlay = new maps.Marker({
      map,
      position: new maps.LatLng(lat, lng),
      icon: {
        content: userDotElement,
      },
      zIndex: 4,
    })

    userLocationOverlayRef.current = userOverlay
  }

  const openOverlayForRestroom = (restroom: Restroom) => {
    const maps = naverMapsRef.current
    const map = mapInstanceRef.current
    if (!maps || !map) return

    // 열려있는 팝업 제거
    if (currentOverlayRef.current) {
      currentOverlayRef.current.setMap(null)
      currentOverlayRef.current = null
    }

    // 지도 중심을 선택한 화장실 위치로 이동
    const position = new maps.LatLng(restroom.latitude, restroom.longitude)
    map.setCenter(position)

    const initialFloor = restroom.floors[0]

    const container = document.createElement('div')
    container.style.cssText = `
      position: relative;
      transform: translate(-50%, -100%);
      margin-top: -10px;
      padding: 10px 14px;
      background: #ffffff;
      border: 1px solid rgba(0, 0, 0, 0.12);
      border-radius: 12px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
      font-family: system-ui, -apple-system, sans-serif;
      white-space: nowrap;
      cursor: default;
    `

    // 팝업 내부 클릭/터치 시 지도로 이벤트가 전파되어 팝업이 닫히지 않도록 방지
    const stopPropagation = (e: Event) => e.stopPropagation()
    container.addEventListener('click', stopPropagation)
    container.addEventListener('mousedown', stopPropagation)
    container.addEventListener('touchstart', stopPropagation, { passive: true })
    container.addEventListener('pointerdown', stopPropagation)

    // 건물/화장실 이름
    const titleDiv = document.createElement('div')
    titleDiv.style.cssText = 'font-weight: 700; font-size: 13px; color: #0f172a; margin-bottom: 6px;'
    titleDiv.textContent = restroom.name
    container.appendChild(titleDiv)

    // 세부 정보 행
    const rowDiv = document.createElement('div')
    rowDiv.style.cssText = 'display: flex; align-items: center; gap: 8px; font-size: 12px; color: #475569;'

    // 층선택 (다중 층일 때 드롭다운 표시)
    if (restroom.floors.length > 1) {
      const select = document.createElement('select')
      select.style.cssText = `
        padding: 3px 8px;
        font-size: 12px;
        font-weight: 600;
        color: #0f172a;
        background-color: #f1f5f9;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        outline: none;
        cursor: pointer;
      `
      restroom.floors.forEach((f) => {
        const opt = document.createElement('option')
        opt.value = f.floor
        opt.textContent = f.floor
        select.appendChild(opt)
      })

      select.addEventListener('change', (e) => {
        const selectedVal = (e.target as HTMLSelectElement).value
        const targetFloor = restroom.floors.find((f) => f.floor === selectedVal) ?? restroom.floors[0]
        updateBidetBadge(targetFloor.bidet)
      })

      rowDiv.appendChild(select)
    } else {
      const singleFloorSpan = document.createElement('span')
      singleFloorSpan.style.cssText = 'font-weight: 500;'
      singleFloorSpan.textContent = restroom.floors[0].floor
      rowDiv.appendChild(singleFloorSpan)
    }

    const dotSpan = document.createElement('span')
    dotSpan.style.color = '#cbd5e1'
    dotSpan.textContent = '•'
    rowDiv.appendChild(dotSpan)

    // 비데 유무 표시
    const bidetSpan = document.createElement('span')
    const updateBidetBadge = (hasBidet: boolean) => {
      bidetSpan.innerHTML = hasBidet
        ? '<span style="color: #16a34a; font-weight: 600;">비데 있음</span>'
        : '<span style="color: #dc2626; font-weight: 600;">비데 없음</span>'
    }
    updateBidetBadge(initialFloor.bidet)
    rowDiv.appendChild(bidetSpan)

    container.appendChild(rowDiv)

    // 말풍선 아래 화살표
    const tail = document.createElement('div')
    tail.style.cssText = `
      position: absolute;
      bottom: -5px;
      left: 50%;
      transform: translateX(-50%) rotate(45deg);
      width: 8px;
      height: 8px;
      background: #ffffff;
      border-right: 1px solid rgba(0, 0, 0, 0.12);
      border-bottom: 1px solid rgba(0, 0, 0, 0.12);
    `
    container.appendChild(tail)

    const overlay = new maps.Marker({
      map,
      position,
      icon: {
        content: container,
      },
      zIndex: 10,
    })

    currentOverlayRef.current = overlay
  }

  useEffect(() => {
    const container = mapContainerRef.current
    const clientId = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID
    if (!container) return

    if (!clientId) {
      setMapError('네이버 지도 API Client ID가 설정되지 않았습니다.')
      return
    }

    // 네이버 지도 인증 실패 시 네이버 SDK가 호출해주는 콜백
    window.navermap_authFailure = () => {
      setMapError(
        '네이버 지도 Open API 인증 실패! Naver Cloud Platform 콘솔의 [Web 서비스 URL] 등록 상태나 [Web Dynamic Map] 상품 활성화 여부를 확인해 주세요.',
      )
    }

    let cancelled = false

    loadNaverMaps(clientId)
      .then((maps) => {
        if (cancelled) return

        const bounds = new maps.LatLngBounds(
          new maps.LatLng(CAMPUS_BOUNDS.sw.latitude, CAMPUS_BOUNDS.sw.longitude),
          new maps.LatLng(CAMPUS_BOUNDS.ne.latitude, CAMPUS_BOUNDS.ne.longitude),
        )

        const map = new maps.Map(container, {
          center: new maps.LatLng(CAMPUS_CENTER.latitude, CAMPUS_CENTER.longitude),
          zoom: 16,
          minZoom: 15,
          maxZoom: 18,
          maxBounds: bounds,
        })

        // 이동 범위 제한 (캠퍼스 경계 - 무한 루프 방지용 임계값 추가)
        maps.Event.addListener(map, 'center_changed', () => {
          const center = map.getCenter()
          const lat = center.lat()
          const lng = center.lng()

          const clampedLat = Math.max(CAMPUS_BOUNDS.sw.latitude, Math.min(CAMPUS_BOUNDS.ne.latitude, lat))
          const clampedLng = Math.max(CAMPUS_BOUNDS.sw.longitude, Math.min(CAMPUS_BOUNDS.ne.longitude, lng))

          if (Math.abs(lat - clampedLat) > 0.0001 || Math.abs(lng - clampedLng) > 0.0001) {
            map.setCenter(new maps.LatLng(clampedLat, clampedLng))
          }
        })

        // 지도 바탕 클릭 시 열려있는 팝업 닫기
        maps.Event.addListener(map, 'click', () => {
          if (currentOverlayRef.current) {
            currentOverlayRef.current.setMap(null)
            currentOverlayRef.current = null
          }
        })

        naverMapsRef.current = maps
        mapInstanceRef.current = map
        setIsMapReady(true)

        // 지도가 처음 로드될 때 컨테이너 크기 계산 오류로 인한 회색 화면 방지
        setTimeout(() => {
          window.dispatchEvent(new Event('resize'))
        }, 100)
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setMapError(error instanceof Error ? error.message : '지도를 표시할 수 없습니다.')
        }
      })

    return () => {
      cancelled = true
      if (currentOverlayRef.current) {
        currentOverlayRef.current.setMap(null)
        currentOverlayRef.current = null
      }
      if (userLocationOverlayRef.current) {
        userLocationOverlayRef.current.setMap(null)
        userLocationOverlayRef.current = null
      }
      markersRef.current.forEach((marker) => marker.setMap(null))
      markersRef.current = []
    }
  }, [])

  // 성별 선택 변경 시 지도 마커 및 팝업 이벤트 업데이트
  useEffect(() => {
    const maps = naverMapsRef.current
    const map = mapInstanceRef.current
    if (!isMapReady || !maps || !map) return

    // 열려있는 팝업 제거
    if (currentOverlayRef.current) {
      currentOverlayRef.current.setMap(null)
      currentOverlayRef.current = null
    }

    // 기존 마커 제거
    markersRef.current.forEach((marker) => marker.setMap(null))
    markersRef.current = []

    // 선택된 성별 화장실만 필터링 후 마커 등록 및 핀 클릭 이벤트 추가
    const filtered = restrooms.filter((restroom) => restroom.gender === selectedGender)

    markersRef.current = filtered.map((restroom) => {
      const marker = new maps.Marker({
        map,
        position: new maps.LatLng(restroom.latitude, restroom.longitude),
        title: restroom.name,
      })

      // 핀 클릭 시 해당 위치로 팝업 표시
      maps.Event.addListener(marker, 'click', () => {
        openOverlayForRestroom(restroom)
      })

      return marker
    })
  }, [selectedGender, isMapReady])

  const handleGetCurrentLocation = () => {
    if (!('geolocation' in navigator)) {
      setToastMessage('이 브라우저에서는 위치 서비스를 지원하지 않습니다.')
      setTimeout(() => setToastMessage(null), 3000)
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude
        const lng = position.coords.longitude
        const maps = naverMapsRef.current
        const map = mapInstanceRef.current

        showUserLocationOnMap(lat, lng)

        if (maps && map) {
          map.setCenter(new maps.LatLng(lat, lng))
        }

        setToastMessage('현재 위치(빨간 점)로 이동했습니다!')
        setTimeout(() => setToastMessage(null), 3500)
      },
      () => {
        setToastMessage('위치 권한 허용이 필요합니다.')
        setTimeout(() => setToastMessage(null), 3500)
      },
      { enableHighAccuracy: true, timeout: 5000 },
    )
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = message.trim()
    if (!trimmed) return

    setIsSearching(true)

    const findAndShowClosest = (userLat: number, userLng: number) => {
      let candidateList = restrooms.filter((r) => r.gender === selectedGender)

      // '비데' 키워드가 포함되어 있으면 비데가 있는 화장실만 탐색
      if (trimmed.includes('비데')) {
        const bidetList = candidateList.filter((r) => r.floors.some((f) => f.bidet))
        if (bidetList.length > 0) {
          candidateList = bidetList
        }
      }

      if (candidateList.length === 0) {
        setToastMessage('조건에 맞는 화장실을 찾지 못했습니다.')
        setIsSearching(false)
        return
      }

      // 현위치 기준 가장 가까운 화장실 계산
      let closest = candidateList[0]
      let minDistance = getDistanceInMeters(userLat, userLng, closest.latitude, closest.longitude)

      for (let i = 1; i < candidateList.length; i++) {
        const dist = getDistanceInMeters(userLat, userLng, candidateList[i].latitude, candidateList[i].longitude)
        if (dist < minDistance) {
          minDistance = dist
          closest = candidateList[i]
        }
      }

      openOverlayForRestroom(closest)
      setMessage('')
      setIsSearching(false)

      const distText = minDistance > 1000 ? `${(minDistance / 1000).toFixed(1)}km` : `${Math.round(minDistance)}m`
      setToastMessage(`가장 가까운 ${closest.name} (약 ${distText}) 위치로 안내해 드려요!`)

      setTimeout(() => setToastMessage(null), 4500)
    }

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          showUserLocationOnMap(position.coords.latitude, position.coords.longitude)
          findAndShowClosest(position.coords.latitude, position.coords.longitude)
        },
        () => {
          // GPS 권한 거부 또는 획득 실패 시 캠퍼스 중심점 기준으로 계산
          findAndShowClosest(CAMPUS_CENTER.latitude, CAMPUS_CENTER.longitude)
        },
        { enableHighAccuracy: true, timeout: 5000 },
      )
    } else {
      findAndShowClosest(CAMPUS_CENTER.latitude, CAMPUS_CENTER.longitude)
    }
  }

  const handleSelectRestroomFromSheet = (restroom: Restroom) => {
    setIsSheetOpen(false)
    openOverlayForRestroom(restroom)
  }

  const refCoords = userCoords ?? CAMPUS_CENTER
  const filteredRestrooms = restrooms.filter((restroom) => restroom.gender === selectedGender)
  const nearby200mRestrooms = filteredRestrooms.filter(
    (restroom) =>
      getDistanceInMeters(refCoords.latitude, refCoords.longitude, restroom.latitude, restroom.longitude) <= 200,
  )

  return (
    <main className="relative isolate h-dvh h-screen w-full overflow-hidden bg-muted font-sans">
      <div ref={mapContainerRef} className="absolute inset-0 h-full w-full z-0" aria-label="성균관대학교 자연과학캠퍼스 화장실 지도" />

      {mapError ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-muted p-6" role="alert">
          <div className="max-w-sm rounded-2xl border bg-background p-5 text-center shadow-lg">
            <p className="font-semibold text-foreground">지도를 불러올 수 없어요</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{mapError}</p>
          </div>
        </div>
      ) : null}

      {toastMessage ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-30 flex justify-center px-4">
          <div className="animate-in fade-in slide-in-from-bottom-2 rounded-2xl bg-slate-900/90 px-4 py-2.5 text-xs font-medium text-white shadow-xl backdrop-blur-md">
            📍 {toastMessage}
          </div>
        </div>
      ) : null}

      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="rounded-xl bg-background/95 px-3 py-2 shadow-sm backdrop-blur-sm">
          <p className="text-sm font-semibold text-foreground">성균관대 자연과학캠퍼스</p>
          <p className="text-xs text-muted-foreground">
            가까운 화장실 {nearby200mRestrooms.length}곳 (반경 200m)
          </p>
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          {/* 남 / 여 선택 스위치 */}
          <div
            className="flex items-center rounded-xl border bg-background/95 p-1 shadow-md backdrop-blur-sm"
            role="radiogroup"
            aria-label="성별 선택"
          >
            <button
              type="button"
              role="radio"
              aria-checked={selectedGender === 'male'}
              onClick={() => setSelectedGender('male')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                selectedGender === 'male'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              남
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={selectedGender === 'female'}
              onClick={() => setSelectedGender('female')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                selectedGender === 'female'
                  ? 'bg-rose-500 text-white shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              여
            </button>
          </div>

          <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
            <SheetTrigger
              render={
                <Button
                  variant="outline"
                  size="icon-lg"
                  className="pointer-events-auto bg-background shadow-md"
                  aria-label="화장실 목록 열기"
                />
              }
            >
              <Menu />
            </SheetTrigger>
            <SheetContent side="right" className="w-[88%] max-w-sm bg-background p-0">
              <SheetHeader className="border-b p-5 pr-14">
                <SheetTitle className="text-lg font-bold">
                  가까운 화장실 ({selectedGender === 'male' ? '남성' : '여성'})
                </SheetTitle>
                <SheetDescription>선택한 성별의 캠퍼스 내 화장실 정보예요.</SheetDescription>
              </SheetHeader>
              <div className="flex flex-col gap-3 overflow-y-auto p-4">
                {filteredRestrooms.map((restroom) => {
                  const distMeters = getDistanceInMeters(
                    refCoords.latitude,
                    refCoords.longitude,
                    restroom.latitude,
                    restroom.longitude,
                  )
                  const walkMinutes = Math.max(1, Math.round(distMeters / 80))
                  const hasBidet = restroom.floors.some((f) => f.bidet)

                  return (
                    <article
                      key={restroom.id}
                      onClick={() => handleSelectRestroomFromSheet(restroom)}
                      className="flex cursor-pointer items-start gap-3 rounded-xl border bg-card p-3 transition-colors hover:bg-accent/80 active:scale-[0.98]"
                    >
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                        <Building2 aria-hidden="true" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <h2 className="truncate text-sm font-semibold">{restroom.name}</h2>
                          <span className="shrink-0 text-xs font-medium text-muted-foreground">약 {walkMinutes}분</span>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {restroom.floors.length > 1
                            ? `${restroom.floors[0].floor} ~ ${restroom.floors[restroom.floors.length - 1].floor}`
                            : restroom.floors[0].floor}
                        </p>
                        <div className="mt-2 flex items-center gap-1 text-xs font-medium">
                          {hasBidet ? (
                            <span className="flex items-center gap-1 font-semibold text-emerald-600">
                              <Check className="size-3.5 stroke-[2.5] text-emerald-600" aria-hidden="true" /> 비데 있음
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 font-semibold text-rose-600">
                              <X className="size-3.5 stroke-[2.5] text-rose-600" aria-hidden="true" /> 비데 없음
                            </span>
                          )}
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      {/* 우측 하단 전송 버튼 위쪽에 위치한 현위치 버튼 & 채팅 전송 입력 바 */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-xl flex-col items-end gap-2">
          {/* 진한 그레이 바탕의 현위치 버튼 */}
          <button
            type="button"
            onClick={handleGetCurrentLocation}
            className="pointer-events-auto flex size-11 items-center justify-center rounded-2xl bg-slate-700/90 text-white shadow-lg backdrop-blur-md transition-all hover:bg-slate-800 active:scale-95"
            aria-label="내 현위치 표시"
            title="내 현위치 표시"
          >
            <Navigation className="size-5 fill-white text-white" />
          </button>

          <form onSubmit={handleSubmit} className="pointer-events-auto w-full">
            <FieldGroup className="rounded-2xl border bg-background/95 p-2 shadow-xl backdrop-blur-md">
              <Field orientation="horizontal" className="gap-2">
                <label htmlFor="chat-message" className="sr-only">
                  챗봇에게 화장실 질문하기
                </label>
                <Input
                  id="chat-message"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="예: 비데 있는 가장 가까운 곳은?"
                  className="h-11 flex-1 border-0 bg-transparent px-3 shadow-none focus-visible:ring-0"
                  autoComplete="off"
                />
                <Button
                  type="submit"
                  size="icon-lg"
                  disabled={isSearching}
                  className="size-11 rounded-xl"
                  aria-label="메시지 전송"
                >
                  {isSearching ? <Loader2 className="size-5 animate-spin text-muted-foreground" /> : <Send />}
                </Button>
              </Field>
            </FieldGroup>
          </form>
        </div>
      </div>
    </main>
  )
}
