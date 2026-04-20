import { useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { usePageMeta } from "@/hooks/usePageMeta";
import { useAppStore, type SpecialOfferItem } from "@/store/appStore";
import { useT } from "@/i18n/useT";

export default function SpecialOffers() {
  const t = useT();
  usePageMeta(t("page.specialOffers"));

  const settings = useAppStore((s) => s.settings);
  const setSpecialOfferTitle = useAppStore((s) => s.setSpecialOfferTitle);
  const setSpecialOfferSubtitle = useAppStore((s) => s.setSpecialOfferSubtitle);
  const addSpecialOffer = useAppStore((s) => s.addSpecialOffer);
  const updateSpecialOffer = useAppStore((s) => s.updateSpecialOffer);
  const removeSpecialOffer = useAppStore((s) => s.removeSpecialOffer);
  const toggleSiteModule = useAppStore((s) => s.toggleSiteModule);

  const specialOfferEnabled = useMemo(
    () => settings.siteModules.some((module) => module.key === "special_offer" && module.enabled),
    [settings.siteModules]
  );
  const enabledOffers = useMemo(() => settings.specialOffers.filter((offer) => offer.enabled), [settings.specialOffers]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("specialOffers.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
            <div className="md:col-span-5">
              <div className="rounded-xl border border-amber-400/20 bg-amber-500/5 p-4">
                <label className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-3">
                  <div>
                    <div className="text-sm font-medium text-zinc-100">{t("specialOffers.switch")}</div>
                    <div className="mt-1 text-xs text-zinc-400">{t("specialOffers.hint")}</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={specialOfferEnabled}
                    onChange={() => toggleSiteModule("special_offer")}
                    className="h-4 w-4 accent-amber-400"
                  />
                </label>

                <div className="mt-4 space-y-3">
                  <div>
                    <div className="mb-1 text-xs font-medium text-zinc-300">{t("specialOffers.sectionTitle")}</div>
                    <Input
                      value={settings.specialOfferTitle}
                      onChange={(e) => setSpecialOfferTitle(e.target.value)}
                      placeholder={t("specialOffers.sectionTitle")}
                    />
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-medium text-zinc-300">{t("specialOffers.sectionSubtitle")}</div>
                    <textarea
                      value={settings.specialOfferSubtitle}
                      onChange={(e) => setSpecialOfferSubtitle(e.target.value)}
                      placeholder={t("specialOffers.sectionSubtitle")}
                      rows={3}
                      className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none transition-shadow placeholder:text-zinc-400 focus:ring-2 focus:ring-amber-400/30"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-3">
                  <div className="text-sm text-zinc-300">{t("specialOffers.count", { count: settings.specialOffers.length })}</div>
                  <Button type="button" size="sm" onClick={addSpecialOffer}>
                    <Plus className="h-4 w-4" />
                    {t("specialOffers.add")}
                  </Button>
                </div>

                {settings.specialOffers.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-white/10 bg-black/20 px-4 py-6 text-sm text-zinc-300">
                    {t("specialOffers.noSlots")}
                  </div>
                ) : (
                  settings.specialOffers.map((offer, index) => (
                    <SpecialOfferEditor
                      key={offer.id}
                      index={index}
                      offer={offer}
                      updateOffer={updateSpecialOffer}
                      removeOffer={removeSpecialOffer}
                    />
                  ))
                )}
              </div>
            </div>

            <div className="md:col-span-7">
              <div className="mb-2 text-xs font-medium text-zinc-300">{t("specialOffers.preview")}</div>
              <SpecialOffersPreview
                enabled={specialOfferEnabled}
                title={settings.specialOfferTitle}
                subtitle={settings.specialOfferSubtitle}
                offers={enabledOffers}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SpecialOfferEditor(props: {
  index: number;
  offer: SpecialOfferItem;
  updateOffer: (id: string, patch: Partial<SpecialOfferItem>) => void;
  removeOffer: (id: string) => void;
}) {
  const t = useT();

  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="text-sm font-medium text-zinc-100">
            {t("specialOffers.cardIndex")} {props.index + 1}
          </div>
          <label className="flex items-center gap-2 text-xs text-zinc-300">
            <input
              type="checkbox"
              checked={props.offer.enabled}
              onChange={(e) => props.updateOffer(props.offer.id, { enabled: e.target.checked })}
              className="accent-amber-400"
            />
            {t("specialOffers.cardEnabled")}
          </label>
        </div>
        <Button type="button" size="sm" variant="danger" onClick={() => props.removeOffer(props.offer.id)}>
          <Trash2 className="h-4 w-4" />
          {t("specialOffers.remove")}
        </Button>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <div className="mb-1 text-xs font-medium text-zinc-300">{t("specialOffers.cardName")}</div>
          <Input
            value={props.offer.name}
            onChange={(e) => props.updateOffer(props.offer.id, { name: e.target.value })}
            placeholder={t("specialOffers.cardName")}
          />
        </div>
        <div>
          <div className="mb-1 text-xs font-medium text-zinc-300">{t("specialOffers.cardTag")}</div>
          <Input
            value={props.offer.tag}
            onChange={(e) => props.updateOffer(props.offer.id, { tag: e.target.value })}
            placeholder={t("specialOffers.cardTag")}
          />
        </div>
        <div className="md:col-span-2">
          <div className="mb-1 text-xs font-medium text-zinc-300">{t("specialOffers.cardSummary")}</div>
          <textarea
            value={props.offer.summary}
            onChange={(e) => props.updateOffer(props.offer.id, { summary: e.target.value })}
            placeholder={t("specialOffers.cardSummary")}
            rows={2}
            className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none transition-shadow placeholder:text-zinc-400 focus:ring-2 focus:ring-amber-400/30"
          />
        </div>
        <div>
          <div className="mb-1 text-xs font-medium text-zinc-300">{t("specialOffers.cardPrice")}</div>
          <Input
            value={props.offer.priceText}
            onChange={(e) => props.updateOffer(props.offer.id, { priceText: e.target.value })}
            placeholder="¥199"
          />
        </div>
        <div>
          <div className="mb-1 text-xs font-medium text-zinc-300">{t("specialOffers.cardOriginalPrice")}</div>
          <Input
            value={props.offer.originalPriceText}
            onChange={(e) => props.updateOffer(props.offer.id, { originalPriceText: e.target.value })}
            placeholder="¥399"
          />
        </div>
        <div className="md:col-span-2">
          <div className="mb-1 text-xs font-medium text-zinc-300">{t("specialOffers.cardCta")}</div>
          <Input
            value={props.offer.ctaText}
            onChange={(e) => props.updateOffer(props.offer.id, { ctaText: e.target.value })}
            placeholder={t("specialOffers.cardCta")}
          />
        </div>
      </div>
    </div>
  );
}

function SpecialOffersPreview(props: {
  enabled: boolean;
  title: string;
  subtitle: string;
  offers: SpecialOfferItem[];
}) {
  const t = useT();

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
      <div className="border-b border-white/10 px-4 py-3">
        <div className="text-sm font-semibold text-zinc-100">{t("specialOffers.title")}</div>
      </div>

      {!props.enabled ? (
        <div className="px-4 py-6 text-sm text-zinc-300">{t("specialOffers.disabled")}</div>
      ) : props.offers.length === 0 ? (
        <div className="px-4 py-6 text-sm text-zinc-300">{t("specialOffers.empty")}</div>
      ) : (
        <div className="border-t border-amber-400/20 bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-transparent px-4 py-4">
          <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-sm font-semibold text-zinc-100">{props.title}</div>
              <div className="mt-1 text-xs text-zinc-300">{props.subtitle}</div>
            </div>
            <Badge variant="amber">{t("specialOffers.badge")}</Badge>
          </div>

          <div
            className={`mt-3 grid gap-3 ${
              props.offers.length >= 3 ? "md:grid-cols-2 xl:grid-cols-3" : props.offers.length > 1 ? "md:grid-cols-2" : "grid-cols-1"
            }`}
          >
            {props.offers.map((offer) => (
              <div key={offer.id} className="rounded-xl border border-amber-400/20 bg-black/30 p-4 shadow-[0_0_0_1px_rgba(251,191,36,0.04)]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="inline-flex rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-1 text-[11px] text-amber-200">
                      {offer.tag || "特价"}
                    </div>
                    <div className="mt-2 text-base font-semibold text-white">{offer.name || "未命名商品"}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold text-amber-300">{offer.priceText || "¥0"}</div>
                    <div className="text-xs text-zinc-400 line-through">{offer.originalPriceText || "¥0"}</div>
                  </div>
                </div>
          <div className="mt-3 text-sm text-zinc-300">{offer.summary || "补充商品卖点与优惠说明，增强点击率。"}</div>
                <div className="mt-4 flex items-center justify-between">
                  <div className="text-xs text-zinc-500">{t("specialOffers.slotLabel")}</div>
                  <button
                    type="button"
                    className="rounded-md bg-amber-400 px-3 py-2 text-xs font-medium text-zinc-950 transition hover:bg-amber-300"
                  >
                    {offer.ctaText || "立即查看"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
