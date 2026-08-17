'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { Building2, Check, Loader2, Menu, MessageSquareHeart, Navigation, Send, X } from 'lucide-react'

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

const CAMPUS_CONFIGS = {
  nsc: {
    name: '자연과학캠퍼스',
    shortName: '자과',
    center: { latitude: 37.2936, longitude: 126.9748 },
    bounds: {
      sw: { latitude: 37.287, longitude: 126.967 },
      ne: { latitude: 37.301, longitude: 126.982 },
    },
  },
  hssc: {
    name: '인문사회캠퍼스',
    shortName: '인사',
    center: { latitude: 37.5882, longitude: 126.9936 },
    bounds: {
      sw: { latitude: 37.58, longitude: 126.985 },
      ne: { latitude: 37.597, longitude: 127.003 },
    },
  },
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

// 챗봇 입력 쿼리에서 층수 추출 (예: "3층", "B1층", "b1층", "지하 1층", "7층")
function extractFloorFromQuery(query: string): string | null {
  const basementMatch = query.match(/(?:b|B|지하)\s*(\d+)/)
  if (basementMatch) {
    return `B${basementMatch[1]}층`
  }
  const floorMatch = query.match(/(\d+)\s*층/)
  if (floorMatch) {
    return `${floorMatch[1]}층`
  }
  return null
}

// 변기(🚽) 아이콘이 포함된 커스텀 지도 핀 생성 (슬림한 올-그린 #0c4f34 핀)
function createToiletPinElement() {
  const skkuGreen = '#0c4f34'

  const pinDiv = document.createElement('div')
  pinDiv.style.cssText = `
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 25px;
    height: 32px;
    transform: translate(-50%, -100%);
    cursor: pointer;
    filter: drop-shadow(0 3px 5px rgba(0, 0, 0, 0.3));
  `

  pinDiv.innerHTML = `
    <div style="
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
    ">
      <div style="
        width: 24px;
        height: 24px;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        background: ${skkuGreen};
        border: 1.5px solid rgba(255, 255, 255, 0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 6px rgba(0,0,0,0.25);
      ">
        <span style="
          transform: rotate(45deg);
          font-size: 13px;
          line-height: 1;
          user-select: none;
        ">🚽</span>
      </div>
    </div>
  `

  return pinDiv
}

export function RestroomMap() {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const [message, setMessage] = useState('')
  const [mapError, setMapError] = useState<string | null>(null)
  const [selectedGender, setSelectedGender] = useState<'male' | 'female'>('male')
  const [selectedCampus, setSelectedCampus] = useState<'nsc' | 'hssc'>('nsc')
  const selectedCampusRef = useRef(selectedCampus)
  selectedCampusRef.current = selectedCampus
  const [isMapReady, setIsMapReady] = useState(false)
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [userCoords, setUserCoords] = useState<{ latitude: number; longitude: number } | null>(null)

  // 피드백 모달 관련 상태
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false)
  const [feedbackRating, setFeedbackRating] = useState<'good' | 'normal' | 'bad' | null>(null)
  const [feedbackText, setFeedbackText] = useState('')
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false)

  const handleFeedbackSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!feedbackRating) return

    setIsSubmittingFeedback(true)

    try {
      const formUrl =
        process.env.NEXT_PUBLIC_GOOGLE_FORM_URL ||
        'https://docs.google.com/forms/d/e/1FAIpQLSfRLpxdym1sINJ11qzhFv3VSJtKiU9V06cJA6yCIviqxTPszA/formResponse'

      const ratingText =
        feedbackRating === 'good' ? '만족' : feedbackRating === 'normal' ? '보통' : '아쉬운'

      const formData = new URLSearchParams()
      formData.append('entry.1875055341', ratingText)
      if (feedbackText.trim()) {
        formData.append('entry.1137740737', feedbackText.trim())
      }

      await fetch(formUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      })

      setIsFeedbackOpen(false)
      setFeedbackRating(null)
      setFeedbackText('')
      setToastMessage('소중한 피드백이 전달되었습니다. 감사합니다.')
      setTimeout(() => setToastMessage(null), 4000)
    } catch (err) {
      console.error(err)
      setToastMessage('의견 제출 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.')
      setTimeout(() => setToastMessage(null), 3000)
    } finally {
      setIsSubmittingFeedback(false)
    }
  }

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

  const openOverlayForRestroom = (restroom: Restroom, defaultFloor?: string) => {
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

    const initialFloor = (defaultFloor && restroom.floors.find((f) => f.floor === defaultFloor)) || restroom.floors[0]

    const container = document.createElement('div')
    container.style.cssText = `
      position: relative;
      transform: translate(-50%, -100%);
      margin-top: -32px;
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

    // 1번째 줄: 위치 이름 + 층수
    const line1 = document.createElement('div')
    line1.style.cssText = 'display: flex; align-items: center; gap: 6px; font-weight: 700; font-size: 13px; color: #0f172a; margin-bottom: 6px;'

    const titleSpan = document.createElement('span')
    titleSpan.textContent = restroom.name
    line1.appendChild(titleSpan)

    // 층선택 (다중 층일 때 드롭다운 표시, 단일 층일 때 텍스트 표시)
    if (restroom.floors.length > 1) {
      const select = document.createElement('select')
      select.style.cssText = `
        padding: 2px 6px;
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
        if (f.floor === initialFloor.floor) {
          opt.selected = true
        }
        select.appendChild(opt)
      })

      select.addEventListener('change', (e) => {
        const selectedVal = (e.target as HTMLSelectElement).value
        const targetFloor = restroom.floors.find((f) => f.floor === selectedVal) ?? restroom.floors[0]
        updateBadges(targetFloor)
      })

      line1.appendChild(select)
    } else {
      const singleFloorSpan = document.createElement('span')
      singleFloorSpan.style.cssText = 'font-size: 12px; font-weight: 600; color: #475569;'
      singleFloorSpan.textContent = `(${restroom.floors[0].floor})`
      line1.appendChild(singleFloorSpan)
    }

    container.appendChild(line1)

    // 2번째 줄: 비데 유무
    const line2 = document.createElement('div')
    line2.style.cssText = 'font-size: 12px; margin-bottom: 3px;'
    const bidetSpan = document.createElement('span')
    line2.appendChild(bidetSpan)
    container.appendChild(line2)

    // 3번째 줄: 장애인용 화장실 유무
    const line3 = document.createElement('div')
    line3.style.cssText = 'font-size: 12px;'
    const accessibleSpan = document.createElement('span')
    line3.appendChild(accessibleSpan)
    container.appendChild(line3)

    const updateBadges = (floor: FloorInfo) => {
      bidetSpan.innerHTML = floor.bidet
        ? '<span style="color: #16a34a; font-weight: 600;">비데 있음</span>'
        : '<span style="color: #dc2626; font-weight: 600;">비데 없음</span>'

      accessibleSpan.innerHTML =
        floor.accessible === 'unisex'
          ? '<span style="color: #8b5cf6; font-weight: 600;">장애인용(공용) 화장실 있음</span>'
          : floor.accessible
          ? '<span style="color: #2563eb; font-weight: 600;">장애인용 화장실 있음</span>'
          : '<span style="color: #dc2626; font-weight: 600;">장애인용 화장실 없음</span>'
    }

    updateBadges(initialFloor)

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

        const initialCampus = CAMPUS_CONFIGS[selectedCampusRef.current]
        const bounds = new maps.LatLngBounds(
          new maps.LatLng(initialCampus.bounds.sw.latitude, initialCampus.bounds.sw.longitude),
          new maps.LatLng(initialCampus.bounds.ne.latitude, initialCampus.bounds.ne.longitude),
        )

        const map = new maps.Map(container, {
          center: new maps.LatLng(initialCampus.center.latitude, initialCampus.center.longitude),
          zoom: 16,
          minZoom: 14,
          maxZoom: 19,
          maxBounds: bounds,
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

    // 선택된 성별 & 캠퍼스 화장실만 필터링 후 마커 등록 및 핀 클릭 이벤트 추가
    const filtered = restrooms.filter(
      (restroom) => restroom.gender === selectedGender && (restroom.campus ?? 'nsc') === selectedCampus,
    )

    markersRef.current = filtered.map((restroom) => {
      const pinElement = createToiletPinElement()

      const marker = new maps.Marker({
        map,
        position: new maps.LatLng(restroom.latitude, restroom.longitude),
        title: restroom.name,
        icon: {
          content: pinElement,
        },
      })

      // 핀 클릭 시 해당 위치로 팝업 표시
      maps.Event.addListener(marker, 'click', () => {
        openOverlayForRestroom(restroom)
      })

      return marker
    })
  }, [selectedGender, selectedCampus, isMapReady])

  const handleCampusChange = (campusKey: 'nsc' | 'hssc') => {
    setSelectedCampus(campusKey)
    selectedCampusRef.current = campusKey

    const map = mapInstanceRef.current
    const maps = naverMapsRef.current
    if (map && maps) {
      const config = CAMPUS_CONFIGS[campusKey]
      const newBounds = new maps.LatLngBounds(
        new maps.LatLng(config.bounds.sw.latitude, config.bounds.sw.longitude),
        new maps.LatLng(config.bounds.ne.latitude, config.bounds.ne.longitude),
      )
      const newCenter = new maps.LatLng(config.center.latitude, config.center.longitude)

      map.setCenter(newCenter)
      map.setZoom(16)
      map.setOptions({ maxBounds: newBounds })
    }
  }

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
      const targetFloor = extractFloorFromQuery(trimmed)
      const effectiveFloor = targetFloor ?? '1층'
      const hasBidetQuery = trimmed.includes('비데')
      const hasAccessibleQuery = trimmed.includes('장애인') || trimmed.includes('휠체어')

      let candidateList = restrooms.filter(
        (r) => r.gender === selectedGender && (r.campus ?? 'nsc') === selectedCampus,
      )

      // 층수 (기본 1층) + 비데 + 장애인화장실 조건 검색
      const exactMatched = candidateList.filter((r) =>
        r.floors.some(
          (f) =>
            f.floor === effectiveFloor &&
            (!hasBidetQuery || f.bidet) &&
            (!hasAccessibleQuery || f.accessible),
        ),
      )

      if (exactMatched.length > 0) {
        candidateList = exactMatched
      } else {
        // 지정된 층(또는 1층)에 비데/장애인 조건이 없을 경우, 비데/장애인 조건만 만족하는 화장실 검색
        const featureMatched = candidateList.filter((r) =>
          r.floors.some(
            (f) => (!hasBidetQuery || f.bidet) && (!hasAccessibleQuery || f.accessible),
          ),
        )
        if (featureMatched.length > 0) {
          candidateList = featureMatched
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

      openOverlayForRestroom(closest, effectiveFloor)
      setMessage('')
      setIsSearching(false)

      const distText = minDistance > 1000 ? `${(minDistance / 1000).toFixed(1)}km` : `${Math.round(minDistance)}m`
      const floorDesc = `${effectiveFloor} `
      const featureDesc = hasBidetQuery ? '비데가 있는 ' : hasAccessibleQuery ? '장애인 화장실이 있는 ' : ''
      setToastMessage(`가장 가까운 ${floorDesc}${featureDesc}${closest.name} (약 ${distText}) 위치로 안내해 드려요!`)

      setTimeout(() => setToastMessage(null), 4500)
    }

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          showUserLocationOnMap(position.coords.latitude, position.coords.longitude)
          findAndShowClosest(position.coords.latitude, position.coords.longitude)
        },
        () => {
          // GPS 권한 거부 또는 획득 실패 시 활성 캠퍼스 중심점 기준으로 계산
          const campusCenter = CAMPUS_CONFIGS[selectedCampusRef.current].center
          findAndShowClosest(campusCenter.latitude, campusCenter.longitude)
        },
        { enableHighAccuracy: true, timeout: 5000 },
      )
    } else {
      const campusCenter = CAMPUS_CONFIGS[selectedCampusRef.current].center
      findAndShowClosest(campusCenter.latitude, campusCenter.longitude)
    }
  }

  const handleSelectRestroomFromSheet = (restroom: Restroom) => {
    setIsSheetOpen(false)
    openOverlayForRestroom(restroom)
  }

  const activeCampus = CAMPUS_CONFIGS[selectedCampus]
  const refCoords = userCoords ?? activeCampus.center
  const filteredRestrooms = restrooms.filter(
    (restroom) => restroom.gender === selectedGender && (restroom.campus ?? 'nsc') === selectedCampus,
  )
  const nearby100mRestrooms = filteredRestrooms.filter(
    (restroom) =>
      getDistanceInMeters(refCoords.latitude, refCoords.longitude, restroom.latitude, restroom.longitude) <= 100,
  )

  return (
    <main className="relative isolate h-dvh h-screen w-full overflow-hidden bg-muted font-sans">
      <div ref={mapContainerRef} className="absolute inset-0 h-full w-full z-0" aria-label="성균관대학교 화장실 지도" />

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
            {toastMessage}
          </div>
        </div>
      ) : null}

      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2">
          {/* 캠퍼스 선택 스위치 (자과: 파란색 / 인사: 연녹색) */}
          <div
            className="pointer-events-auto flex items-center rounded-xl border bg-background/95 p-1 shadow-md backdrop-blur-sm"
            role="radiogroup"
            aria-label="캠퍼스 선택"
          >
            <button
              type="button"
              role="radio"
              aria-checked={selectedCampus === 'nsc'}
              onClick={() => handleCampusChange('nsc')}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition-all ${
                selectedCampus === 'nsc'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              자과
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={selectedCampus === 'hssc'}
              onClick={() => handleCampusChange('hssc')}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition-all ${
                selectedCampus === 'hssc'
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              인사
            </button>
          </div>

          <div className="rounded-xl bg-background/95 px-3 py-1.5 shadow-sm backdrop-blur-sm">
            <p className="text-xs font-semibold text-foreground">{activeCampus.name}</p>
            <p className="text-[11px] font-medium text-emerald-700">
              {userCoords
                ? `가까운 화장실 ${nearby100mRestrooms.length}곳 (반경 100m)`
                : '현위치 버튼을 눌러주세요!'}
            </p>
          </div>
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
                  {userCoords
                    ? `가까운 화장실 (${selectedGender === 'male' ? '남성' : '여성'})`
                    : `현위치를 눌러주세요! (${selectedGender === 'male' ? '남성' : '여성'})`}
                </SheetTitle>
                <SheetDescription>
                  {userCoords
                    ? '내 현위치 기준 가까운 순서로 정렬된 화장실 정보예요.'
                    : '하단 현위치 버튼을 누르면 내 위치 기준 거리로 안내해 드려요.'}
                </SheetDescription>
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
                  const hasAccessible = restroom.floors.some((f) => f.accessible)
                  const hasUnisexAccessible = restroom.floors.some((f) => f.accessible === 'unisex')

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
                          <span className="shrink-0 text-xs font-medium text-muted-foreground">
                            {userCoords ? `약 ${walkMinutes}분` : `캠퍼스 중심`}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {restroom.floors.length > 1
                            ? `${restroom.floors[0].floor} ~ ${restroom.floors[restroom.floors.length - 1].floor}`
                            : restroom.floors[0].floor}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs font-medium">
                          {hasBidet ? (
                            <span className="flex items-center gap-1 font-semibold text-emerald-600">
                              <Check className="size-3.5 stroke-[2.5] text-emerald-600" aria-hidden="true" /> 비데 있음
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 font-semibold text-rose-600">
                              <X className="size-3.5 stroke-[2.5] text-rose-600" aria-hidden="true" /> 비데 없음
                            </span>
                          )}
                          <span className="text-muted-foreground/40">•</span>
                          {hasAccessible ? (
                            <span
                              className={`flex items-center gap-1 font-semibold ${
                                hasUnisexAccessible ? 'text-purple-600' : 'text-blue-600'
                              }`}
                            >
                              <Check
                                className={`size-3.5 stroke-[2.5] ${
                                  hasUnisexAccessible ? 'text-purple-600' : 'text-blue-600'
                                }`}
                                aria-hidden="true"
                              />{' '}
                              {hasUnisexAccessible ? '장애인용(공용) 있음' : '장애인용 있음'}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 font-semibold text-rose-600">
                              <X className="size-3.5 stroke-[2.5] text-rose-600" aria-hidden="true" /> 장애인용 없음
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
          {/* 현위치 버튼 & 피드백 버튼 행 */}
          <div className="pointer-events-auto flex w-full items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setIsFeedbackOpen(true)}
              className="flex items-center gap-1.5 rounded-2xl border bg-background/95 px-3.5 py-2.5 text-xs font-semibold text-slate-700 shadow-lg backdrop-blur-md transition-all hover:bg-slate-50 active:scale-95"
              aria-label="의견 보내기"
            >
              <MessageSquareHeart className="size-4 text-[#0c4f34]" />
              <span>의견 남기기</span>
            </button>

            <button
              type="button"
              onClick={handleGetCurrentLocation}
              className="flex size-11 items-center justify-center rounded-2xl bg-slate-700/90 text-white shadow-lg backdrop-blur-md transition-all hover:bg-slate-800 active:scale-95"
              aria-label="내 현위치 표시"
              title="내 현위치 표시"
            >
              <Navigation className="size-5 fill-white text-white" />
            </button>
          </div>

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
                  placeholder="예: 근처 3층 비데 있는 화장실 찾아줘"
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

      {/* 의견 남기기 커스텀 모달 팝업 */}
      {isFeedbackOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setIsFeedbackOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl border bg-background p-5 shadow-2xl transition-all"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
                  <MessageSquareHeart className="size-5 text-[#0c4f34]" />
                  서비스 후기 및 의견 남기기
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  성균관대 화장실 정보 서비스 이용 후기를 남겨주세요!
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsFeedbackOpen(false)}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="닫기"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleFeedbackSubmit} className="mt-4 flex flex-col gap-4">
              {/* 이용 만족도 선택 (👍 좋아요 / 😐 보통 / 👎 아쉬워요) */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-700">이용 만족도</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setFeedbackRating('good')}
                    className={`flex flex-col items-center justify-center gap-1 rounded-2xl border p-3 transition-all ${
                      feedbackRating === 'good'
                        ? 'border-[#0c4f34] bg-[#0c4f34]/10 text-[#0c4f34] font-bold shadow-xs'
                        : 'border-slate-200 bg-slate-50/50 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <span className="text-2xl">👍</span>
                    <span className="text-xs">좋아요</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFeedbackRating('normal')}
                    className={`flex flex-col items-center justify-center gap-1 rounded-2xl border p-3 transition-all ${
                      feedbackRating === 'normal'
                        ? 'border-[#0c4f34] bg-[#0c4f34]/10 text-[#0c4f34] font-bold shadow-xs'
                        : 'border-slate-200 bg-slate-50/50 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <span className="text-2xl">😐</span>
                    <span className="text-xs">보통이에요</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFeedbackRating('bad')}
                    className={`flex flex-col items-center justify-center gap-1 rounded-2xl border p-3 transition-all ${
                      feedbackRating === 'bad'
                        ? 'border-[#0c4f34] bg-[#0c4f34]/10 text-[#0c4f34] font-bold shadow-xs'
                        : 'border-slate-200 bg-slate-50/50 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <span className="text-2xl">👎</span>
                    <span className="text-xs">아쉬워요</span>
                  </button>
                </div>
              </div>

              {/* 추가 의견 텍스트 입력창 */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="feedback-comment" className="text-xs font-semibold text-slate-700">
                  추가 의견 (선택)
                </label>
                <textarea
                  id="feedback-comment"
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  placeholder="개선점이나 추가되었으면 하는 화장실 위치 등 자유로운 의견을 남겨주세요."
                  className="h-24 w-full resize-none rounded-2xl border bg-slate-50/50 p-3 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0c4f34]"
                />
              </div>

              <div className="mt-2 flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsFeedbackOpen(false)}
                  className="flex-1 rounded-xl text-xs"
                >
                  취소
                </Button>
                <Button
                  type="submit"
                  disabled={!feedbackRating || isSubmittingFeedback}
                  className="flex-1 rounded-xl bg-[#0c4f34] text-xs font-semibold text-white hover:bg-[#093d28]"
                >
                  {isSubmittingFeedback ? <Loader2 className="size-4 animate-spin text-white" /> : '의견 보내기'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  )
}
