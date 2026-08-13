'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { Building2, Check, Menu, Send, X } from 'lucide-react'

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

const restrooms = [
  { id: 1, name: '삼성학술정보관(남)', floor: '1층', bidet: true, latitude: 37.29402719343835, longitude: 126.97518545621938, gender: "male" },
  { id: 2, name: '삼성학술정보관(여)', floor: '1층', bidet: true, latitude: 37.29411719150855, longitude: 126.97468637207342, gender: "female" },
]

type KakaoLatLng = new (latitude: number, longitude: number) => unknown
type KakaoMap = new (container: HTMLElement, options: { center: unknown; level: number }) => unknown
type KakaoMarker = new (options: { map: unknown; position: unknown; title: string }) => { setMap: (map: null) => void }

type KakaoMaps = {
  load: (callback: () => void) => void
  LatLng: KakaoLatLng
  Map: KakaoMap
  Marker: KakaoMarker
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

export function RestroomMap() {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const [message, setMessage] = useState('')
  const [mapError, setMapError] = useState<string | null>(null)

  useEffect(() => {
    const container = mapContainerRef.current
    const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY
    if (!container) return

    if (!appKey) {
      setMapError('카카오맵 API 키가 설정되지 않았습니다.')
      return
    }

    let cancelled = false
    let markers: Array<{ setMap: (map: null) => void }> = []

    loadKakaoMaps(appKey)
      .then((maps) => {
        if (cancelled) return

        const map = new maps.Map(container, {
          center: new maps.LatLng(CAMPUS_CENTER.latitude, CAMPUS_CENTER.longitude),
          level: 3,
        })

        markers = restrooms.map((restroom) =>
          new maps.Marker({
            map,
            position: new maps.LatLng(restroom.latitude, restroom.longitude),
            title: `${restroom.name} ${restroom.floor}`,
          }),
        )
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setMapError(error instanceof Error ? error.message : '지도를 표시할 수 없습니다.')
        }
      })

    return () => {
      cancelled = true
      markers.forEach((marker) => marker.setMap(null))
    }
  }, [])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!message.trim()) return
    setMessage('')
  }

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

      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))]">

        <div className="rounded-xl bg-background/95 px-3 py-2 shadow-sm backdrop-blur-sm">
          <p className="text-sm font-semibold text-foreground">성균관대 자연과학캠퍼스</p>
          <p className="text-xs text-muted-foreground">가까운 화장실 5곳</p>
        </div>

        <Sheet>
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
              <SheetTitle className="text-lg font-bold">가까운 화장실</SheetTitle>
              <SheetDescription>캠퍼스 내 화장실 정보예요.</SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-3 overflow-y-auto p-4">
              {restrooms.map((restroom, index) => (
                <article key={restroom.id} className="flex items-start gap-3 rounded-xl border bg-card p-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                    <Building2 aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="truncate text-sm font-semibold">{restroom.name}</h2>
                      <span className="shrink-0 text-xs text-muted-foreground">{index + 2}분</span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{restroom.floor}</p>
                    <p className="mt-2 flex items-center gap-1 text-xs font-medium text-foreground">
                      {restroom.bidet ? <Check aria-hidden="true" /> : <X aria-hidden="true" />}
                      비데 {restroom.bidet ? '있음' : '없음'}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </header>

      <form
        onSubmit={handleSubmit}
        className="fixed inset-x-0 bottom-0 z-20 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <FieldGroup className="mx-auto max-w-xl rounded-2xl border bg-background/95 p-2 shadow-xl backdrop-blur-md">
          <Field orientation="horizontal" className="gap-2">
            <label htmlFor="chat-message" className="sr-only">챗봇에게 화장실 질문하기</label>
            <Input
              id="chat-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="예: 비데 있는 ���장 가까운 곳은?"
              className="h-11 flex-1 border-0 bg-transparent px-3 shadow-none focus-visible:ring-0"
              autoComplete="off"
            />
            <Button type="submit" size="icon-lg" className="size-11 rounded-xl" aria-label="메시지 전송">
              <Send />
            </Button>
          </Field>
        </FieldGroup>
      </form>
    </main>
  )
}
