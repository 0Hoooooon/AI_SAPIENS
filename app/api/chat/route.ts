import { NextResponse } from 'next/server'
import { restrooms } from '@/lib/restrooms-data'

export async function POST(req: Request) {
  try {
    const { prompt, selectedGender, userLocation } = await req.json()

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        {
          error: 'GEMINI_API_KEY가 설정되지 않았습니다.',
          reply: 'Gemini API 키가 설정되지 않았습니다. .env.local 파일에 GEMINI_API_KEY를 등록해 주세요.',
        },
        { status: 200 },
      )
    }

    const filteredRestrooms = restrooms.filter((r) => r.gender === selectedGender)

    const promptText = `
너는 성균관대학교 자연과학캠퍼스 화장실 안내 AI 챗봇이다.
사용자의 질문, 선택한 성별 필터(${selectedGender === 'male' ? '남성' : '여성'}), 사용자의 GPS 좌표를 분석하여 질문에 대한 친절한 답변과 가장 적합한 화장실 정보 및 층수를 반환하라.

[캠퍼스 화장실 목록 (${selectedGender === 'male' ? '남성' : '여성'})]
${JSON.stringify(filteredRestrooms, null, 2)}

[사용자 정보]
- 선택 성별: ${selectedGender}
${userLocation ? `- 사용자 GPS 좌표: 위도 ${userLocation.latitude}, 경도 ${userLocation.longitude}` : '- 사용자 GPS 정보: 없음'}

[사용자 질문]
"${prompt}"

반드시 아래 형식의 순수한 JSON 구조로만 답하라 (다른 텍스트나 마크다운 기호 금지):
{
  "restroomId": 가장 적합한 화장실의 id (숫자 또는 null),
  "selectedFloor": 추천할 특정 층수 (예: "3층" 또는 null),
  "reply": "사용자에게 전달할 친절한 한국어 답변"
}
`

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: promptText }],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.2,
          },
        }),
      },
    )

    if (!response.ok) {
      const errText = await response.text()
      console.error('Gemini API Error:', errText)
      return NextResponse.json(
        {
          error: 'Gemini API 호출 오류',
          reply: 'Gemini API 연동 처리 중 오류가 발생했습니다. API 키 및 네트워크 상태를 확인해 주세요.',
        },
        { status: 200 },
      )
    }

    const data = await response.json()
    const textResponse = data?.candidates?.[0]?.content?.parts?.[0]?.text

    if (!textResponse) {
      return NextResponse.json(
        { error: 'No content from Gemini', reply: 'Gemini로부터 답변을 받지 못했습니다.' },
        { status: 200 },
      )
    }

    const parsed = JSON.parse(textResponse)
    return NextResponse.json(parsed)
  } catch (error) {
    console.error('Chat route error:', error)
    return NextResponse.json(
      { error: 'Internal server error', reply: '요청을 처리하는 도중 오류가 발생했습니다.' },
      { status: 200 },
    )
  }
}
