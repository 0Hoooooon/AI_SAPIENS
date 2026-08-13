export type FloorInfo = {
  floor: string
  bidet: boolean
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
      { floor: 'B1층', bidet: true },
      { floor: '1층', bidet: true },
      { floor: '2층', bidet: true },
      { floor: '3층', bidet: true },
      { floor: '4층', bidet: true },
      { floor: '5층', bidet: true },
    ],
  },
  {
    id: 2,
    name: '삼성학술정보관(여)',
    latitude: 37.29411719150855,
    longitude: 126.97468637207342,
    gender: 'female',
    floors: [
      { floor: 'B1층', bidet: true },
      { floor: '1층', bidet: true },
      { floor: '2층', bidet: true },
      { floor: '3층', bidet: true },
      { floor: '4층', bidet: true },
      { floor: '5층', bidet: true },
    ],
  },
  {
    id: 3,
    name: '학생회관(남)',
    latitude: 37.29436022567817,
    longitude: 126.97356129956843,
    gender: 'male',
    floors: [
      { floor: '1층', bidet: false },
      { floor: '3층', bidet: true },
    ],
  },
]
