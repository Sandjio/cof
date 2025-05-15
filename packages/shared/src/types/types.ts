export interface Coordinate {
  id: string;
  xCoordinate: number;
  yCoordinate: number;
}

export interface Plant {
  name: string;
  quantity: number;
  coordinates: Coordinate[];
}

export interface UserStats {
  Gold?: number;
  Trophy?: number;
  Experience?: number;
}
