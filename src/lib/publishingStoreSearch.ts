import { requestJson } from "@/lib/api";

type RegionCenter = {
  lng: number;
  lat: number;
};

export type StoreSearchConfig = {
  keywords: string[];
  provinceAdcode: string;
  provinceName: string;
  cityAdcode: string;
  cityName: string;
  districtAdcode: string;
  districtName: string;
  streetAdcode: string;
  streetName: string;
};

export type StoreSearchResolvedRegion = {
  name: string;
  adcode: string;
  level: string;
  center: RegionCenter | null;
};

export type StoreSearchSliceRegion = {
  name: string;
  adcode: string;
  level: string;
  center: RegionCenter | null;
};

export type StoreSearchRegionItem = {
  name: string;
  adcode: string;
  level: string;
  center: RegionCenter | null;
};

export type StoreSearchItem = {
  amapId: string;
  name: string;
  matchedKeywords: string[];
  telRaw: string;
  primaryPhone: string;
  address: string;
  pname: string;
  cityname: string;
  adname: string;
  businessArea: string;
  type: string;
  typecode: string;
  locationLng: number | null;
  locationLat: number | null;
  website: string;
  rating: string;
  cost: string;
};

export type StoreSearchResponse = {
  keywords: string[];
  resolvedRegion: StoreSearchResolvedRegion;
  sliceRegions: StoreSearchSliceRegion[];
  items: StoreSearchItem[];
  total: number;
  partialByBudget: boolean;
  upstreamRequestCount: number;
  staticMapUrl: string;
};

function getAuthHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

export async function getStoreSearchConfig(accessToken: string) {
  return requestJson<StoreSearchConfig>("/api/publishing/store-search/config", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export async function updateStoreSearchConfig(input: {
  accessToken: string;
  keywords: string[];
  provinceAdcode?: string;
  provinceName?: string;
  cityAdcode?: string;
  cityName?: string;
  districtAdcode?: string;
  districtName?: string;
  streetAdcode?: string;
  streetName?: string;
}) {
  return requestJson<StoreSearchConfig>("/api/publishing/store-search/config", {
    method: "PUT",
    headers: getAuthHeaders(input.accessToken),
    body: JSON.stringify({
      keywords: input.keywords,
      provinceAdcode: input.provinceAdcode,
      provinceName: input.provinceName,
      cityAdcode: input.cityAdcode,
      cityName: input.cityName,
      districtAdcode: input.districtAdcode,
      districtName: input.districtName,
      streetAdcode: input.streetAdcode,
      streetName: input.streetName,
    }),
  });
}

export async function listStoreSearchRegions(input: {
  accessToken: string;
  parentAdcode?: string;
}) {
  const params = new URLSearchParams();
  if (input.parentAdcode?.trim()) {
    params.set("parentAdcode", input.parentAdcode.trim());
  }

  return requestJson<{ items: StoreSearchRegionItem[] }>(
    `/api/publishing/store-search/regions${params.toString() ? `?${params.toString()}` : ""}`,
    {
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
      },
    },
  );
}

export async function searchGaodeStores(input: {
  accessToken: string;
  regionAdcode: string;
  regionName: string;
}) {
  return requestJson<StoreSearchResponse>("/api/publishing/store-search/search", {
    method: "POST",
    headers: getAuthHeaders(input.accessToken),
    body: JSON.stringify({
      regionAdcode: input.regionAdcode,
      regionName: input.regionName,
    }),
  });
}

export async function importGaodeStores(input: {
  accessToken: string;
  items: Array<{
    amapId?: string;
    name: string;
    primaryPhone?: string;
    telRaw?: string;
    address?: string;
    type?: string;
  }>;
}) {
  return requestJson<{ createdCount: number; skippedCount: number }>(
    "/api/publishing/store-search/import",
    {
      method: "POST",
      headers: getAuthHeaders(input.accessToken),
      body: JSON.stringify({
        items: input.items,
      }),
    },
  );
}
