import { useEffect, useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import { Table, TableWrap, Td, Th, Tr } from "@/components/ui/Table";
import { usePageMeta } from "@/hooks/usePageMeta";
import {
  getStoreSearchConfig,
  importGaodeStores,
  listStoreSearchRegions,
  searchGaodeStores,
  type StoreSearchRegionItem,
  updateStoreSearchConfig,
  type StoreSearchItem,
  type StoreSearchResponse,
} from "@/lib/publishingStoreSearch";
import { useAuthStore } from "@/store/authStore";

function splitKeywords(text: string) {
  return [...new Set(
    text
      .split(/[、,，\n]/)
      .map((item) => item.trim())
      .filter(Boolean),
  )];
}

function getItemIdentity(item: StoreSearchItem) {
  return item.amapId || `${item.name}|${item.locationLng ?? ""},${item.locationLat ?? ""}`;
}

function getStreetOptionValue(input: { adcode?: string | null; name?: string | null }) {
  const adcode = input.adcode?.trim() || "";
  const name = input.name?.trim() || "";
  if (!adcode || !name) {
    return "";
  }
  return `${adcode}::${name}`;
}

function buildPageNumbers(currentPage: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set<number>([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  if (currentPage <= 3) {
    pages.add(2);
    pages.add(3);
    pages.add(4);
  }
  if (currentPage >= totalPages - 2) {
    pages.add(totalPages - 1);
    pages.add(totalPages - 2);
    pages.add(totalPages - 3);
  }

  const sortedPages = [...pages].filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b);
  const result: Array<number | "ellipsis"> = [];

  for (const page of sortedPages) {
    const lastItem = result[result.length - 1];
    if (typeof lastItem === "number" && page - lastItem > 1) {
      result.push("ellipsis");
    }
    result.push(page);
  }

  return result;
}

export default function PublishingStoreSearch() {
  const PAGE_SIZE = 20;
  usePageMeta("门店搜索");

  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const canImport = user?.roleKey === "main_company";

  const [keywordsText, setKeywordsText] = useState("");
  const [provinceAdcode, setProvinceAdcode] = useState("");
  const [provinceName, setProvinceName] = useState("");
  const [cityAdcode, setCityAdcode] = useState("");
  const [cityName, setCityName] = useState("");
  const [districtAdcode, setDistrictAdcode] = useState("");
  const [districtName, setDistrictName] = useState("");
  const [streetAdcode, setStreetAdcode] = useState("");
  const [streetName, setStreetName] = useState("");
  const [provinces, setProvinces] = useState<StoreSearchRegionItem[]>([]);
  const [cities, setCities] = useState<StoreSearchRegionItem[]>([]);
  const [districts, setDistricts] = useState<StoreSearchRegionItem[]>([]);
  const [streets, setStreets] = useState<StoreSearchRegionItem[]>([]);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [loadingProvinces, setLoadingProvinces] = useState(false);
  const [loadingCities, setLoadingCities] = useState(false);
  const [loadingDistricts, setLoadingDistricts] = useState(false);
  const [loadingStreets, setLoadingStreets] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [regionLoadError, setRegionLoadError] = useState<string | null>(null);
  const [result, setResult] = useState<StoreSearchResponse | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [detailItemId, setDetailItemId] = useState<string | null>(null);
  const [businessAreaFilter, setBusinessAreaFilter] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!accessToken) {
      setKeywordsText("");
      setProvinceAdcode("");
      setProvinceName("");
      setCityAdcode("");
      setCityName("");
      setDistrictAdcode("");
      setDistrictName("");
      setStreetAdcode("");
      setStreetName("");
      setProvinces([]);
      setCities([]);
      setDistricts([]);
      setStreets([]);
      setRegionLoadError(null);
      setResult(null);
      setSelectedIds([]);
      setBusinessAreaFilter("");
      setPage(1);
      return;
    }

    let cancelled = false;
    setLoadingConfig(true);

    void (async () => {
      try {
        const config = await getStoreSearchConfig(accessToken);
        if (cancelled) return;
        setKeywordsText(config.keywords.join("、"));
        setProvinceAdcode(config.provinceAdcode);
        setProvinceName(config.provinceName);
        setCityAdcode(config.cityAdcode);
        setCityName(config.cityName);
        setDistrictAdcode(config.districtAdcode);
        setDistrictName(config.districtName);
        setStreetAdcode(config.streetAdcode);
        setStreetName(config.streetName);
        setError(null);
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError instanceof Error ? requestError.message : "加载门店搜索配置失败");
        }
      } finally {
        if (!cancelled) {
          setLoadingConfig(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;

    let cancelled = false;
    setLoadingProvinces(true);

    void (async () => {
      try {
        const response = await listStoreSearchRegions({ accessToken });
        if (cancelled) return;
        setProvinces(response.items);
        setRegionLoadError(null);
      } catch (requestError) {
        if (!cancelled) {
          const message = requestError instanceof Error ? requestError.message : "加载省份列表失败";
          setRegionLoadError(message);
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoadingProvinces(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken || !provinceAdcode) {
      setCities([]);
      setCityAdcode("");
      setCityName("");
      setDistricts([]);
      setDistrictAdcode("");
      setDistrictName("");
      setStreets([]);
      setStreetAdcode("");
      setStreetName("");
      return;
    }

    let cancelled = false;
    setLoadingCities(true);

    void (async () => {
      try {
        const response = await listStoreSearchRegions({
          accessToken,
          parentAdcode: provinceAdcode,
        });
        if (cancelled) return;
        setCities(response.items);
        setRegionLoadError(null);
      } catch (requestError) {
        if (!cancelled) {
          const message = requestError instanceof Error ? requestError.message : "加载城市列表失败";
          setRegionLoadError(message);
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoadingCities(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, provinceAdcode]);

  useEffect(() => {
    if (!accessToken || !cityAdcode) {
      setDistricts([]);
      setDistrictAdcode("");
      setDistrictName("");
      setStreets([]);
      setStreetAdcode("");
      setStreetName("");
      return;
    }

    let cancelled = false;
    setLoadingDistricts(true);

    void (async () => {
      try {
        const response = await listStoreSearchRegions({
          accessToken,
          parentAdcode: cityAdcode,
        });
        if (cancelled) return;
        setDistricts(response.items);
        setRegionLoadError(null);
      } catch (requestError) {
        if (!cancelled) {
          const message = requestError instanceof Error ? requestError.message : "加载区县列表失败";
          setRegionLoadError(message);
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoadingDistricts(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, cityAdcode]);

  useEffect(() => {
    if (!accessToken || !districtAdcode) {
      setStreets([]);
      setStreetAdcode("");
      setStreetName("");
      return;
    }

    let cancelled = false;
    setLoadingStreets(true);

    void (async () => {
      try {
        const response = await listStoreSearchRegions({
          accessToken,
          parentAdcode: districtAdcode,
        });
        if (cancelled) return;
        setStreets(response.items);
        setRegionLoadError(null);
      } catch (requestError) {
        if (!cancelled) {
          const message = requestError instanceof Error ? requestError.message : "加载街道列表失败";
          setRegionLoadError(message);
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoadingStreets(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, districtAdcode]);

  const detailItem = useMemo(
    () => result?.items.find((item) => getItemIdentity(item) === detailItemId) ?? null,
    [detailItemId, result],
  );

  const selectedProvince = useMemo(
    () => provinces.find((item) => item.adcode === provinceAdcode) ?? null,
    [provinceAdcode, provinces],
  );
  const selectedCity = useMemo(
    () => cities.find((item) => item.adcode === cityAdcode) ?? null,
    [cities, cityAdcode],
  );
  const selectedDistrict = useMemo(
    () => districts.find((item) => item.adcode === districtAdcode) ?? null,
    [districtAdcode, districts],
  );
  const selectedStreet = useMemo(
    () => streets.find((item) => item.adcode === streetAdcode && item.name === streetName) ?? null,
    [streetAdcode, streetName, streets],
  );
  const selectedRegion = selectedStreet ?? selectedDistrict ?? selectedCity;
  const selectedRegionName =
    selectedStreet?.name
    || streetName
    || selectedDistrict?.name
    || districtName
    || selectedCity?.name
    || cityName;

  const regionSummary = useMemo(
    () =>
      [
        selectedProvince?.name || provinceName,
        selectedCity?.name || cityName,
        selectedDistrict?.name || districtName,
        selectedStreet?.name || streetName,
      ]
        .filter(Boolean)
        .join(" / "),
    [
      cityName,
      districtName,
      provinceName,
      selectedCity?.name,
      selectedDistrict?.name,
      selectedProvince?.name,
      selectedStreet?.name,
      streetName,
    ],
  );

  const businessAreaOptions = useMemo(() => {
    const optionSet = new Set<string>();
    for (const item of result?.items ?? []) {
      for (const businessArea of item.businessArea.split("、").map((value) => value.trim()).filter(Boolean)) {
        optionSet.add(businessArea);
      }
    }
    return [...optionSet].sort((a, b) => a.localeCompare(b, "zh-CN"));
  }, [result]);

  const visibleItems = useMemo(() => {
    if (!result) {
      return [];
    }
    if (!businessAreaFilter) {
      return result.items;
    }
    return result.items.filter((item) =>
      item.businessArea
        .split("、")
        .map((value) => value.trim())
        .filter(Boolean)
        .includes(businessAreaFilter),
    );
  }, [businessAreaFilter, result]);

  const selectedItems = useMemo(
    () => visibleItems.filter((item) => selectedIds.includes(getItemIdentity(item))),
    [selectedIds, visibleItems],
  );
  const visibleItemIds = useMemo(
    () => visibleItems.map((item) => getItemIdentity(item)),
    [visibleItems],
  );
  const isAllVisibleSelected = useMemo(
    () => visibleItemIds.length > 0 && visibleItemIds.every((id) => selectedIds.includes(id)),
    [selectedIds, visibleItemIds],
  );

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(visibleItems.length / PAGE_SIZE)),
    [visibleItems.length],
  );
  const pageNumbers = useMemo(() => buildPageNumbers(page, totalPages), [page, totalPages]);

  const pagedVisibleItems = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return visibleItems.slice(start, start + PAGE_SIZE);
  }, [page, visibleItems]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  async function handleSaveConfig() {
    if (!accessToken) return;
    const keywords = splitKeywords(keywordsText);
    try {
      setSavingConfig(true);
      const payload = await updateStoreSearchConfig({
        accessToken,
        keywords,
        provinceAdcode,
        provinceName: selectedProvince?.name || provinceName,
        cityAdcode,
        cityName: selectedCity?.name || cityName,
        districtAdcode,
        districtName: selectedDistrict?.name || districtName,
        streetAdcode,
        streetName: selectedStreet?.name || streetName,
      });
      setKeywordsText(payload.keywords.join("、"));
      setProvinceAdcode(payload.provinceAdcode);
      setProvinceName(payload.provinceName);
      setCityAdcode(payload.cityAdcode);
      setCityName(payload.cityName);
      setDistrictAdcode(payload.districtAdcode);
      setDistrictName(payload.districtName);
      setStreetAdcode(payload.streetAdcode);
      setStreetName(payload.streetName);
      setHint("搜索配置已保存");
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "保存搜索配置失败");
    } finally {
      setSavingConfig(false);
    }
  }

  async function handleSearch() {
    if (!accessToken || !selectedRegion || !selectedRegionName) return;
    try {
      setSearching(true);
      const response = await searchGaodeStores({
        accessToken,
        regionAdcode: selectedRegion.adcode,
        regionName: selectedRegionName,
      });
      setResult(response);
      setSelectedIds([]);
      setBusinessAreaFilter("");
      setPage(1);
      setHint(
        response.partialByBudget
          ? "已返回部分结果，当前搜索因请求预算上限提前停止。"
          : `本次共找到 ${response.total} 条门店结果。`,
      );
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "门店搜索失败");
    } finally {
      setSearching(false);
    }
  }

  async function handleImport() {
    if (!accessToken || selectedItems.length === 0 || !canImport) return;

    try {
      setImporting(true);
      const response = await importGaodeStores({
        accessToken,
        items: selectedItems.map((item) => ({
          amapId: item.amapId,
          name: item.name,
          primaryPhone: item.primaryPhone,
          telRaw: item.telRaw,
          address: item.address,
          type: item.type,
        })),
      });
      setHint(`已导入 ${response.createdCount} 条，跳过 ${response.skippedCount} 条`);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "导入客户管理失败");
    } finally {
      setImporting(false);
    }
  }

  function toggleSelected(item: StoreSearchItem) {
    const identity = getItemIdentity(item);
    setSelectedIds((current) =>
      current.includes(identity)
        ? current.filter((itemId) => itemId !== identity)
        : [...current, identity],
    );
  }

  function handleToggleAll() {
    if (visibleItemIds.length === 0) return;
    setSelectedIds((current) => {
      const allSelected = visibleItemIds.every((id) => current.includes(id));
      if (allSelected) {
        return current.filter((id) => !visibleItemIds.includes(id));
      }
      return [...new Set([...current, ...visibleItemIds])];
    });
  }

  function handleProvinceChange(nextProvinceAdcode: string) {
    const nextProvince = provinces.find((item) => item.adcode === nextProvinceAdcode) ?? null;
    setRegionLoadError(null);
    setProvinceAdcode(nextProvinceAdcode);
    setProvinceName(nextProvince?.name || "");
    setCityAdcode("");
    setCityName("");
    setDistrictAdcode("");
    setDistrictName("");
    setStreetAdcode("");
    setStreetName("");
    setCities([]);
    setDistricts([]);
    setStreets([]);
    setResult(null);
    setSelectedIds([]);
    setDetailItemId(null);
    setBusinessAreaFilter("");
    setPage(1);
  }

  function handleCityChange(nextCityAdcode: string) {
    const nextCity = cities.find((item) => item.adcode === nextCityAdcode) ?? null;
    setRegionLoadError(null);
    setCityAdcode(nextCityAdcode);
    setCityName(nextCity?.name || "");
    setDistrictAdcode("");
    setDistrictName("");
    setDistricts([]);
    setStreetAdcode("");
    setStreetName("");
    setStreets([]);
    setResult(null);
    setSelectedIds([]);
    setDetailItemId(null);
    setBusinessAreaFilter("");
    setPage(1);
  }

  function handleDistrictChange(nextDistrictAdcode: string) {
    const nextDistrict = districts.find((item) => item.adcode === nextDistrictAdcode) ?? null;
    setRegionLoadError(null);
    setDistrictAdcode(nextDistrictAdcode);
    setDistrictName(nextDistrict?.name || "");
    setStreetAdcode("");
    setStreetName("");
    setStreets([]);
    setResult(null);
    setSelectedIds([]);
    setDetailItemId(null);
    setBusinessAreaFilter("");
    setPage(1);
  }

  function handleStreetChange(nextStreetAdcode: string) {
    const [nextAdcode = "", nextName = ""] = nextStreetAdcode.split("::");
    const nextStreet = streets.find(
      (item) => item.adcode === nextAdcode && item.name === nextName,
    ) ?? null;
    setRegionLoadError(null);
    setStreetAdcode(nextStreet?.adcode || nextAdcode);
    setStreetName(nextStreet?.name || nextName);
    setResult(null);
    setSelectedIds([]);
    setDetailItemId(null);
    setBusinessAreaFilter("");
    setPage(1);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>搜索条件</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
            <label className="space-y-2">
              <span className="text-xs font-medium text-zinc-300">行业关键词</span>
              <textarea
                className="min-h-[92px] w-full rounded-xl border border-white/10 bg-zinc-950/70 px-3 py-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
                value={keywordsText}
                onChange={(event) => setKeywordsText(event.target.value)}
                placeholder="例如：装修公司、建材门店、门窗"
              />
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" onClick={() => void handleSaveConfig()} disabled={savingConfig || loadingConfig}>
                  {savingConfig ? "保存中..." : "保存配置"}
                </Button>
                {regionSummary ? <span className="text-xs text-zinc-400">{regionSummary}</span> : null}
              </div>
            </label>

            <div className="space-y-3">
              {regionLoadError ? (
                <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                  地区列表加载失败：{regionLoadError}
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-[repeat(4,minmax(0,1fr))_180px]">
                <label className="space-y-1.5">
                  <span className="text-xs font-medium text-zinc-300">省份</span>
                  <Select
                    value={provinceAdcode}
                    onChange={(event) => handleProvinceChange(event.target.value)}
                    disabled={!accessToken || loadingProvinces}
                    className="rounded-xl bg-zinc-950/70"
                  >
                    <option value="">
                      {loadingProvinces
                        ? "加载省份中..."
                        : regionLoadError && provinces.length === 0
                          ? "省份加载失败"
                          : "请选择省份"}
                    </option>
                    {provinces.map((item) => (
                      <option key={item.adcode} value={item.adcode}>
                        {item.name}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-medium text-zinc-300">城市</span>
                  <Select
                    value={cityAdcode}
                    onChange={(event) => handleCityChange(event.target.value)}
                    disabled={!accessToken || !provinceAdcode || loadingCities}
                    className="rounded-xl bg-zinc-950/70"
                  >
                    <option value="">
                      {!provinceAdcode ? "请先选择省份" : loadingCities ? "加载城市中..." : "请选择城市"}
                    </option>
                    {cities.map((item) => (
                      <option key={item.adcode} value={item.adcode}>
                        {item.name}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-medium text-zinc-300">区县</span>
                  <Select
                    value={districtAdcode}
                    onChange={(event) => handleDistrictChange(event.target.value)}
                    disabled={!accessToken || !cityAdcode || loadingDistricts}
                    className="rounded-xl bg-zinc-950/70"
                  >
                    <option value="">
                      {!cityAdcode ? "请先选择城市" : loadingDistricts ? "加载区县中..." : "可选区县"}
                    </option>
                    {districts.map((item) => (
                      <option key={item.adcode} value={item.adcode}>
                        {item.name}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-medium text-zinc-300">街道</span>
                  <Select
                    value={getStreetOptionValue({ adcode: streetAdcode, name: streetName })}
                    onChange={(event) => handleStreetChange(event.target.value)}
                    disabled={!accessToken || !districtAdcode || loadingStreets}
                    className="rounded-xl bg-zinc-950/70"
                  >
                    <option value="">
                      {!districtAdcode ? "请先选择区县" : loadingStreets ? "加载街道中..." : "可选街道"}
                    </option>
                    {streets.map((item) => (
                      <option key={getStreetOptionValue(item)} value={getStreetOptionValue(item)}>
                        {item.name}
                      </option>
                    ))}
                  </Select>
                </label>
                <div className="flex items-end">
                  <Button
                    type="button"
                    className="h-10 w-full rounded-xl"
                    onClick={() => void handleSearch()}
                    disabled={searching || !accessToken || !selectedRegion || !selectedRegionName}
                  >
                    {searching ? "搜索中..." : "开始搜索"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>地图预览</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {result?.staticMapUrl ? (
            <img
              src={result.staticMapUrl}
              alt="高德地图静态预览"
              className="h-auto w-full rounded-xl border border-white/10 bg-black/20"
            />
          ) : (
            <div className="rounded-xl border border-dashed border-white/10 bg-white/5 px-4 py-10 text-center text-sm text-zinc-400">
              先完成一次门店搜索，这里会展示当前区域的 2D 静态地图预览。
            </div>
          )}
          {result ? (
            <div className="grid grid-cols-1 gap-3 text-sm text-zinc-300 md:grid-cols-4">
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
                <div className="text-xs text-zinc-400">解析区域</div>
                <div className="mt-1 text-zinc-100">{result.resolvedRegion.name}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
                <div className="text-xs text-zinc-400">切片数量</div>
                <div className="mt-1 text-zinc-100">{result.sliceRegions.length}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
                <div className="text-xs text-zinc-400">上游请求数</div>
                <div className="mt-1 text-zinc-100">{result.upstreamRequestCount}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
                <div className="text-xs text-zinc-400">预算截断</div>
                <div className="mt-1 text-zinc-100">{result.partialByBudget ? "是" : "否"}</div>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>搜索结果</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {hint ? <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-300">{hint}</div> : null}
          {error ? <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div> : null}
          {result ? (
            <div className="grid grid-cols-1 gap-3 text-sm text-zinc-300 md:grid-cols-4">
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
                <div className="text-xs text-zinc-400">结果总数</div>
                <div className="mt-1 text-zinc-100">{result.total}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
                <div className="text-xs text-zinc-400">当前筛选结果</div>
                <div className="mt-1 text-zinc-100">{visibleItems.length}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
                <div className="text-xs text-zinc-400">无电话门店</div>
                <div className="mt-1 text-zinc-100">{visibleItems.filter((item) => !item.primaryPhone).length}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
                <div className="text-xs text-zinc-400">已选数量</div>
                <div className="mt-1 text-zinc-100">{selectedIds.length}</div>
              </div>
            </div>
          ) : null}

          {!canImport ? (
            <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              当前账号可搜索门店，但只有主公司账号可以导入到客户管理。
            </div>
          ) : null}

          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <label className="w-full max-w-[280px] space-y-1">
              <span className="text-xs font-medium text-zinc-300">商圈筛选</span>
              <Select
                value={businessAreaFilter}
                onChange={(event) => {
                  setBusinessAreaFilter(event.target.value);
                  setSelectedIds([]);
                  setPage(1);
                }}
                disabled={businessAreaOptions.length === 0}
              >
                <option value="">{businessAreaOptions.length === 0 ? "当前结果无商圈" : "全部商圈"}</option>
                {businessAreaOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
            </label>
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <Button type="button" variant="secondary" onClick={handleToggleAll} disabled={visibleItemIds.length === 0}>
                {isAllVisibleSelected ? "清空已选" : "全选"}
              </Button>
              <Button
                type="button"
                onClick={() => void handleImport()}
                disabled={importing || selectedItems.length === 0 || !canImport}
              >
                {importing ? "导入中..." : "导入客户管理"}
              </Button>
            </div>
          </div>

          <TableWrap>
            <Table>
              <thead>
                <Tr>
                  <Th className="w-[52px]">选择</Th>
                  <Th>门店名</Th>
                  <Th>电话</Th>
                  <Th>地址</Th>
                  <Th>地区</Th>
                  <Th>类型</Th>
                  <Th>命中关键词</Th>
                  <Th>坐标</Th>
                  <Th className="w-[96px]">操作</Th>
                </Tr>
              </thead>
              <tbody>
                {!result ? (
                  <Tr>
                    <Td colSpan={9} className="py-10 text-center text-zinc-400">
                      暂无搜索结果
                    </Td>
                  </Tr>
                ) : visibleItems.length === 0 ? (
                  <Tr>
                    <Td colSpan={9} className="py-10 text-center text-zinc-400">
                      {businessAreaFilter ? "当前商圈下没有门店" : "当前条件下没有搜索到门店"}
                    </Td>
                  </Tr>
                ) : (
                  pagedVisibleItems.map((item) => {
                    const identity = getItemIdentity(item);
                    return (
                      <Tr key={identity}>
                        <Td>
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(identity)}
                            onChange={() => toggleSelected(item)}
                          />
                        </Td>
                        <Td className="text-zinc-100">{item.name}</Td>
                        <Td>{item.primaryPhone || item.telRaw || "暂无"}</Td>
                        <Td className="max-w-[280px] truncate">{item.address || "暂无"}</Td>
                        <Td>{[item.pname, item.cityname, item.adname].filter(Boolean).join(" / ") || "暂无"}</Td>
                        <Td>{item.type || "暂无"}</Td>
                        <Td>{item.matchedKeywords.join("、")}</Td>
                        <Td>{item.locationLng !== null && item.locationLat !== null ? `${item.locationLng}, ${item.locationLat}` : "暂无"}</Td>
                        <Td>
                          <Button type="button" size="sm" variant="secondary" onClick={() => setDetailItemId(identity)}>
                            详情
                          </Button>
                        </Td>
                      </Tr>
                    );
                  })
                )}
              </tbody>
            </Table>
          </TableWrap>

          {result && visibleItems.length > PAGE_SIZE ? (
            <div className="flex flex-col gap-3 text-sm text-zinc-400 md:flex-row md:items-center md:justify-between">
              <span>
                第 {page} / {totalPages} 页，当前筛选共 {visibleItems.length} 条
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page <= 1}
                >
                  上一页
                </Button>
                {pageNumbers.map((item, index) =>
                  item === "ellipsis" ? (
                    <span key={`ellipsis-${index}`} className="px-1 text-zinc-500">
                      ...
                    </span>
                  ) : (
                    <Button
                      key={item}
                      type="button"
                      variant={item === page ? "primary" : "secondary"}
                      size="sm"
                      onClick={() => setPage(item)}
                    >
                      {item}
                    </Button>
                  ),
                )}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  disabled={page >= totalPages}
                >
                  下一页
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Modal
        open={Boolean(detailItem)}
        title="门店详情"
        onClose={() => setDetailItemId(null)}
        footer={
          <Button type="button" variant="secondary" onClick={() => setDetailItemId(null)}>
            关闭
          </Button>
        }
      >
        {detailItem ? (
          <div className="grid grid-cols-1 gap-3 text-sm text-zinc-300 md:grid-cols-2">
            <div>
              <div className="text-xs text-zinc-400">门店名</div>
              <div className="mt-1 text-zinc-100">{detailItem.name}</div>
            </div>
            <div>
              <div className="text-xs text-zinc-400">电话</div>
              <div className="mt-1 text-zinc-100">{detailItem.primaryPhone || detailItem.telRaw || "暂无"}</div>
            </div>
            <div className="md:col-span-2">
              <div className="text-xs text-zinc-400">地址</div>
              <div className="mt-1 text-zinc-100">{detailItem.address || "暂无"}</div>
            </div>
            <div>
              <div className="text-xs text-zinc-400">地区</div>
              <div className="mt-1 text-zinc-100">{[detailItem.pname, detailItem.cityname, detailItem.adname].filter(Boolean).join(" / ") || "暂无"}</div>
            </div>
            <div>
              <div className="text-xs text-zinc-400">商圈</div>
              <div className="mt-1 text-zinc-100">{detailItem.businessArea || "暂无"}</div>
            </div>
            <div>
              <div className="text-xs text-zinc-400">类型</div>
              <div className="mt-1 text-zinc-100">{detailItem.type || "暂无"}</div>
            </div>
            <div>
              <div className="text-xs text-zinc-400">类型编码</div>
              <div className="mt-1 text-zinc-100">{detailItem.typecode || "暂无"}</div>
            </div>
            <div>
              <div className="text-xs text-zinc-400">评分</div>
              <div className="mt-1 text-zinc-100">{detailItem.rating || "暂无"}</div>
            </div>
            <div>
              <div className="text-xs text-zinc-400">人均消费</div>
              <div className="mt-1 text-zinc-100">{detailItem.cost || "暂无"}</div>
            </div>
            <div className="md:col-span-2">
              <div className="text-xs text-zinc-400">命中关键词</div>
              <div className="mt-1 text-zinc-100">{detailItem.matchedKeywords.join("、") || "暂无"}</div>
            </div>
            <div className="md:col-span-2">
              <div className="text-xs text-zinc-400">坐标</div>
              <div className="mt-1 text-zinc-100">
                {detailItem.locationLng !== null && detailItem.locationLat !== null
                  ? `${detailItem.locationLng}, ${detailItem.locationLat}`
                  : "暂无"}
              </div>
            </div>
            <div className="md:col-span-2">
              <div className="text-xs text-zinc-400">网址</div>
              <div className="mt-1 break-all text-zinc-100">{detailItem.website || "暂无"}</div>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
