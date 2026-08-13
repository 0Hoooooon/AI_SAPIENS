'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { Building2, Check, Menu, Navigation, Send, X } from 'lucide-react'

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

// 학교 영역 경계 좌표 (성균관대 자연과학캠퍼스 기준)
const CAMPUS_BOUNDS = {
  sw: { latitude: 37.2905, longitude: 126.9705 },
  ne: { latitude: 37.2975, longitude: 126.9790 },
}

import { restrooms, type Restroom } from '@/lib/restrooms-data'

type KakaoLatLng = new (latitude: number, longitude: number) => { getLat(): number; getLng(): number }
type KakaoMapInstance = {
  getCenter(): { getLat(): number; getLng(): number }
  setCenter(latlng: unknown): void
  setMinLevel(level: number): void
  setMaxLevel(level: number): void
}
type KakaoMap = new (container: HTMLElement, options: { center: unknown; level: number }) => KakaoMapInstance
type KakaoMarkerInstance = { setMap: (map: KakaoMapInstance | null) => void }
type KakaoMarker = new (options: { map: KakaoMapInstance | null; position: unknown; title: string }) => KakaoMarkerInstance
type KakaoCustomOverlayInstance = { setMap: (map: KakaoMapInstance | null) => void }
type KakaoCustomOverlay = new (options: {
  map?: KakaoMapInstance | null
  position: unknown
  content: HTMLElement | string
  xAnchor?: number
  yAnchor?: number
  zIndex?: number
}) => KakaoCustomOverlayInstance

type KakaoMaps = {
  load: (callback: () => void) => void
  LatLng: KakaoLatLng
  Map: KakaoMap
  Marker: KakaoMarker
  CustomOverlay: KakaoCustomOverlay
  event: {
    addListener: (target: unknown, type: string, callback: () => void) => void
  }
}

declare global {
  interface Window {
    kakao?: { maps: KakaoMaps }
  }
}

function loadKakaoMaps(appKey: string) {
  return new Promise<KakaoMaps>((resolve, reject) => {
    const existingMaps = window.kakao?.maps
    if (existingMaps) {
      existingMaps.load(() => resolve(existingMaps))
      return
    }

    const existingScript = document.querySelector<HTMLScriptElement>('script[data-kakao-map-sdk]')
    const script = existingScript ?? document.createElement('script')

    const timeout = window.setTimeout(() => {
      reject(
        new Error(
          `카카오맵 SDK 응답이 지연되고 있습니다. 카카오 개발자 콘솔의 Web 사이트 도메인에 ${window.location.origin}을 등록해 주세요.`,
        ),
      )
    }, 10000)

    const handleLoad = () => {
      window.clearTimeout(timeout)
      if (!window.kakao?.maps) {
        reject(new Error('카카오맵 SDK를 불러오지 못했습니다.'))
        return
      }
      window.kakao.maps.load(() => resolve(window.kakao!.maps))
    }

    const handleError = () => {
      window.clearTimeout(timeout)
      reject(
        new Error(
          `카카오맵 SDK 연결에 실패했습니다. 카카오 개발자 콘솔의 Web 사이트 도메인에 ${window.location.origin}을 등록해 주세요.`,
        ),
      )
    }
    script.addEventListener('load', handleLoad, { once: true })
    script.addEventListener('error', handleError, { once: true })

    if (!existingScript) {
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appKey)}&autoload=false`
      script.async = true
      script.dataset.kakaoMapSdk = 'true'
      document.head.appendChild(script)
    }
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

  const kakaoMapsRef = useRef<KakaoMaps | null>(null)
  const mapInstanceRef = useRef<KakaoMapInstance | null>(null)
  const markersRef = useRef<KakaoMarkerInstance[]>([])
  const currentOverlayRef = useRef<KakaoCustomOverlayInstance | null>(null)
  const userLocationOverlayRef = useRef<KakaoCustomOverlayInstance | null>(null)

  const showUserLocationOnMap = (lat: number, lng: number) => {
    const maps = kakaoMapsRef.current
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

    const userOverlay = new maps.CustomOverlay({
      map,
      position: new maps.LatLng(lat, lng),
      content: userDotElement,
      xAnchor: 0.5,
      yAnchor: 0.5,
      zIndex: 4,
    })

    userLocationOverlayRef.current = userOverlay
  }

  const openOverlayForRestroom = (restroom: Restroom, defaultFloor?: string) => {
    const maps = kakaoMapsRef.current
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

    const initialFloorInfo =
      (defaultFloor ? restroom.floors.find((f) => f.floor === defaultFloor) : null) ?? restroom.floors[0]

    const container = document.createElement('div')
    container.style.cssText = `
      position: relative;
      bottom: 36px;
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
        if (f.floor === initialFloorInfo.floor) {
          opt.selected = true
        }
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
      singleFloorSpan.textContent = `🏢 ${restroom.floors[0].floor}`
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
    updateBidetBadge(initialFloorInfo.bidet)
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

    const overlay = new maps.CustomOverlay({
      map,
      position,
      content: container,
      xAnchor: 0.5,
      yAnchor: 1.0,
      zIndex: 3,
    })

    currentOverlayRef.current = overlay
  }

  useEffect(() => {
    const container = mapContainerRef.current
    const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY
    if (!container) return

    if (!appKey) {
      setMapError('카카오맵 API 키가 설정되지 않았습니다.')
      return
    }

    let cancelled = false

    loadKakaoMaps(appKey)
      .then((maps) => {
        if (cancelled) return

        const map = new maps.Map(container, {
          center: new maps.LatLng(CAMPUS_CENTER.latitude, CAMPUS_CENTER.longitude),
          level: 3,
        })

        // 확대/축소 범위 제한
        map.setMinLevel(1)
        map.setMaxLevel(3)

        // 이동 범위 제한 (캠퍼스 경계)
        maps.event.addListener(map, 'center_changed', () => {
          const center = map.getCenter()
          const lat = center.getLat()
          const lng = center.getLng()

          const clampedLat = Math.max(CAMPUS_BOUNDS.sw.latitude, Math.min(CAMPUS_BOUNDS.ne.latitude, lat))
          const clampedLng = Math.max(CAMPUS_BOUNDS.sw.longitude, Math.min(CAMPUS_BOUNDS.ne.longitude, lng))

          if (lat !== clampedLat || lng !== clampedLng) {
            map.setCenter(new maps.LatLng(clampedLat, clampedLng))
          }
        })

        // 지도 바탕 클릭 시 열려있는 팝업 닫기
        maps.event.addListener(map, 'click', () => {
          if (currentOverlayRef.current) {
            currentOverlayRef.current.setMap(null)
            currentOverlayRef.current = null
          }
        })

        kakaoMapsRef.current = maps
        mapInstanceRef.current = map
        setIsMapReady(true)
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
    const maps = kakaoMapsRef.current
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
      maps.event.addListener(marker, 'click', () => {
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
        const maps = kakaoMapsRef.current
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
    if (!trimmed || isSearching) return

    setIsSearching(true)
    const userPrompt = trimmed
    setMessage('')
    setToastMessage('🤖 Gemini AI가 답변을 생각하는 중입니다...')

    const sendChatRequest = async (userLocation?: { latitude: number; longitude: number }) => {
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: userPrompt,
            selectedGender,
            userLocation,
          }),
        })

        const data = await res.json()

        if (data.reply) {
          setToastMessage(data.reply)
          setTimeout(() => setToastMessage(null), 7000)
        }

        if (data.restroomId) {
          const target = restrooms.find((r) => r.id === data.restroomId)
          if (target) {
            openOverlayForRestroom(target, data.selectedFloor)
          }
        }
      } catch (err) {
        console.error('Chat error:', err)
        setToastMessage('Gemini AI 답변을 불러오지 못했습니다.')
        setTimeout(() => setToastMessage(null), 3500)
      } finally {
        setIsSearching(false)
      }
    }

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          showUserLocationOnMap(position.coords.latitude, position.coords.longitude)
          sendChatRequest({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          })
        },
        () => {
          sendChatRequest()
        },
        { enableHighAccuracy: true, timeout: 5000 },
      )
    } else {
      sendChatRequest()
    }
  }

  const handleSelectRestroomFromSheet = (restroom: Restroom) => {
    setIsSheetOpen(false)
    openOverlayForRestroom(restroom)
  }

  const filteredRestrooms = restrooms.filter((restroom) => restroom.gender === selectedGender)

  return (
    <main className="relative isolate min-h-dvh overflow-hidden bg-muted font-sans">
      <div ref={mapContainerRef} className="absolute inset-0 z-0" aria-label="성균관대학교 자연과학캠퍼스 화장실 지도" />

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
          <div className="animate-in fade-in slide-in-from-bottom-2 max-w-md rounded-2xl bg-slate-900/90 px-4 py-2.5 text-xs font-medium text-white shadow-xl backdrop-blur-md">
            📍 {toastMessage}
          </div>
        </div>
      ) : null}

      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="rounded-xl bg-background/95 px-3 py-2 shadow-sm backdrop-blur-sm">
          <p className="text-sm font-semibold text-foreground">성균관대 자연과학캠퍼스</p>
          <p className="text-xs text-muted-foreground">
            가까운 {selectedGender === 'male' ? '남성' : '여성'} 화장실 {filteredRestrooms.length}곳
          </p>
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          {/* 현위치 빨간 점 표시 버튼 */}
          <Button
            type="button"
            variant="outline"
            size="icon-lg"
            onClick={handleGetCurrentLocation}
            className="pointer-events-auto bg-background/95 shadow-md backdrop-blur-sm active:scale-95"
            aria-label="내 현위치 표시"
            title="내 현위치 표시"
          >
            <Navigation className="size-4 fill-rose-500 text-rose-500" />
          </Button>

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
                {filteredRestrooms.map((restroom, index) => (
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
                        <span className="shrink-0 text-xs text-muted-foreground">{index + 2}분</span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {restroom.floors.length > 1
                          ? `${restroom.floors[0].floor} ~ ${restroom.floors[restroom.floors.length - 1].floor}`
                          : restroom.floors[0].floor}
                      </p>
                      <p className="mt-2 flex items-center gap-1 text-xs font-medium text-foreground">
                        {restroom.floors.some((f) => f.bidet) ? <Check aria-hidden="true" /> : <X aria-hidden="true" />}
                        비데 {restroom.floors.some((f) => f.bidet) ? '있음' : '없음'}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <form
        onSubmit={handleSubmit}
        className="fixed inset-x-0 bottom-0 z-20 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <FieldGroup className="mx-auto max-w-xl rounded-2xl border bg-background/95 p-2 shadow-xl backdrop-blur-md">
          <Field orientation="horizontal" className="gap-2">
            <label htmlFor="chat-message" className="sr-only">
              챗봇에게 화장실 질문하기
            </label>
            <Input
              id="chat-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={isSearching ? 'Gemini AI 생각 중...' : '예: 삼성학술정보관 3층 비데 어디야?'}
              disabled={isSearching}
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
              <Send />
            </Button>
          </Field>
        </FieldGroup>
      </form>
    </main>
  )
}
