export type PlantSeededEvent = {
  eventType: "PlantSeeded";
  playerId: string;
  timestamp: string;
  payload: {
    plantId: string;
    xCoordinate: string;
    yCoordinate: string;
  };
};

export type PlantWateredEvent = {
  eventType: "PlantWatered";
  playerId: string;
  timestamp: string;
  payload: {
    plantId: string;
  };
};

export type PlantHarvestedEvent = {
  eventType: "PlantHarvested";
  playerId: string;
  timestamp: string;
  payload: {
    plantId: string;
  };
};
