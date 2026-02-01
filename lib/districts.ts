// Микрорайоны Сургута с координатами для отображения на карте
export interface District {
    id: string;
    name: string;
    coordinates: [number, number]; // [lng, lat]
}

export const districts: District[] = [
    { id: "7", name: "7 МИКРОРАЙОН", coordinates: [73.395, 61.248] },
    { id: "7a", name: "7А МИКРОРАЙОН", coordinates: [73.375, 61.252] },
    { id: "11", name: "11 МИКРОРАЙОН", coordinates: [73.385, 61.265] },
    { id: "12", name: "12 МИКРОРАЙОН", coordinates: [73.415, 61.258] },
    { id: "13", name: "13 МИКРОРАЙОН", coordinates: [73.425, 61.268] },
    { id: "14", name: "14 МИКРОРАЙОН", coordinates: [73.455, 61.262] },
    { id: "a", name: "МИКРОРАЙОН А", coordinates: [73.355, 61.258] },
];
