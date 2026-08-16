export type FloorInfo = {
  floor: string
  bidet: boolean
  accessible?: boolean
}

export type Restroom = {
  id: number
  name: string
  latitude: number
  longitude: number
  gender: 'male' | 'female'
  floors: FloorInfo[]
}

export const restrooms: Restroom[] = [
  {
    id: 1,
    name: '삼성학술정보관(남)',
    latitude: 37.29402719343835,
    longitude: 126.97518545621938,
    gender: 'male',
    floors: [
      { floor: 'B1층', bidet: true, accessible: false },
      { floor: '1층', bidet: true, accessible: true },
      { floor: '2층', bidet: true, accessible: false },
      { floor: '3층', bidet: true, accessible: false },
      { floor: '4층', bidet: true, accessible: false },
      { floor: '5층', bidet: true, accessible: false },
    ],
  },
  {
    id: 2,
    name: '삼성학술정보관(여)',
    latitude: 37.29409917618307,
    longitude: 126.97471175376053,
    gender: 'female',
    floors: [
      { floor: 'B1층', bidet: true, accessible: false },
      { floor: '1층', bidet: true, accessible: true },
      { floor: '2층', bidet: true, accessible: false },
      { floor: '3층', bidet: true, accessible: false },
      { floor: '4층', bidet: true, accessible: false },
      { floor: '5층', bidet: true, accessible: false },
    ],
  },
  {
    id: 3,
    name: '학생회관(남)',
    latitude: 37.2944247,
    longitude: 126.9736547,
    gender: 'male',
    floors: [
      { floor: '1층', bidet: false, accessible: true },
      { floor: '3층', bidet: true, accessible: false },
    ],
  },
  {
    id: 4,
    name: '제1종합연구동(남)',
    latitude: 37.29230454828907,
    longitude: 126.97817745824418,
    gender: 'male',
    floors: [
      { floor: '1층', bidet: true, accessible: false },
      { floor: '6층', bidet: false, accessible: false },
    ],
  },
  {
    id: 5,
    name: '제1종합연구동(여)',
    latitude: 37.29229783855852,
    longitude: 126.97843966899062,
    gender: 'female',
    floors: [{ floor: '6층', bidet: false, accessible: false }],
  },
  {
    id: 6,
    name: '공학실습동(남)',
    latitude: 37.29322581440059,
    longitude: 126.97793471650336,
    gender: 'male',
    floors: [{ floor: '1층', bidet: false, accessible: false }],
  },
  {
    id: 7,
    name: 'E센터1(남)',
    latitude: 37.2951757,
    longitude: 126.9778738,
    gender: 'male',
    floors: [
      { floor: '2층', bidet: false, accessible: false },
      { floor: '3층', bidet: false, accessible: false },
      { floor: '4층', bidet: false, accessible: false },
      { floor: '5층', bidet: false, accessible: false },
      { floor: '6층', bidet: false, accessible: false },
      { floor: '7층', bidet: false, accessible: false },
      { floor: '8층', bidet: false, accessible: false },
    ],
  },
]
