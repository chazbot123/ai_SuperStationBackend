import { useEffect, useMemo, useState } from "react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import { usePageMeta } from "@/hooks/usePageMeta";
import { useAuthStore } from "@/store/authStore";
import { useDataStore } from "@/store/dataStore";
import type { KeywordRule } from "@/types/demo";

function toNumOrNull(v: string) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (v.trim() === "") return null;
  return n;
}

export default function KeywordRules() {
  usePageMeta("关键词规则");
  const user = useAuthStore((s) => s.user);
  const canEdit = user?.roleKey === "main_company";

  const rules = useDataStore((s) => s.rules);
  const createRule = useDataStore((s) => s.createRule);
  const updateRule = useDataStore((s) => s.updateRule);
  const agents = useDataStore((s) => s.agents);

  const [selectedId, setSelectedId] = useState(rules[0]?.id ?? "");
  const selected = rules.find((r) => r.id === selectedId) ?? null;

  const usedCount = useMemo(() => {
    const map: Record<string, number> = {};
    for (const a of agents) {
      if (!a.ruleId) continue;
      map[a.ruleId] = (map[a.ruleId] ?? 0) + 1;
    }
    return map;
  }, [agents]);

  const [draft, setDraft] = useState<KeywordRule | null>(selected);
  const [savedHint, setSavedHint] = useState<string | null>(null);

  useEffect(() => {
    setDraft(selected);
    setSavedHint(null);
  }, [selected]);

  if (!canEdit) {
    return (
      <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
        你的角色无权限编辑关键词规则。
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
      <Card className="md:col-span-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>规则列表</CardTitle>
            <Button
              size="sm"
              onClick={() => {
                const newId = createRule({
                  name: "新规则",
                  minCount: 1,
                  maxCount: 20,
                  minLen: 2,
                  maxLen: 20,
                  dedupeRequired: true,
                  sensitiveFilterEnabled: true,
                  submitRateLimitPerDay: null,
                });
                setSelectedId(newId);
              }}
            >
              新建
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {rules.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedId(r.id)}
                className={`w-full rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                  selectedId === r.id
                    ? "border-amber-400/30 bg-amber-500/10"
                    : "border-white/10 bg-white/5 hover:bg-white/10"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium text-zinc-100">{r.name}</div>
                  <Badge variant="gray">使用中 {usedCount[r.id] ?? 0}</Badge>
                </div>
                <div className="mt-1 text-xs text-zinc-400">创建：{new Date(r.createdAt).toLocaleDateString()}</div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="md:col-span-3">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>规则编辑</CardTitle>
            {savedHint ? <div className="text-xs text-green-600">{savedHint}</div> : null}
          </div>
        </CardHeader>
        <CardContent>
          {!draft ? (
            <div className="text-sm text-zinc-300">请选择一个规则。</div>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="mb-1 text-xs font-medium text-zinc-300">规则名称</div>
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-xs font-medium text-zinc-300">数量下限（min）</div>
                  <Input
                    type="number"
                    value={draft.minCount ?? ""}
                    onChange={(e) => setDraft({ ...draft, minCount: toNumOrNull(e.target.value) })}
                  />
                </div>
                <div>
                  <div className="mb-1 text-xs font-medium text-zinc-300">数量上限（max）</div>
                  <Input
                    type="number"
                    value={draft.maxCount ?? ""}
                    onChange={(e) => setDraft({ ...draft, maxCount: toNumOrNull(e.target.value) })}
                  />
                </div>
                <div>
                  <div className="mb-1 text-xs font-medium text-zinc-300">长度下限（min）</div>
                  <Input
                    type="number"
                    value={draft.minLen ?? ""}
                    onChange={(e) => setDraft({ ...draft, minLen: toNumOrNull(e.target.value) })}
                  />
                </div>
                <div>
                  <div className="mb-1 text-xs font-medium text-zinc-300">长度上限（max）</div>
                  <Input
                    type="number"
                    value={draft.maxLen ?? ""}
                    onChange={(e) => setDraft({ ...draft, maxLen: toNumOrNull(e.target.value) })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="flex items-center gap-2 text-sm text-zinc-200">
                  <input
                    type="checkbox"
                    checked={draft.dedupeRequired}
                    onChange={(e) => setDraft({ ...draft, dedupeRequired: e.target.checked })}
                  />
                  去重（必需）
                </label>
                <label className="flex items-center gap-2 text-sm text-zinc-200">
                  <input
                    type="checkbox"
                    checked={draft.sensitiveFilterEnabled}
                    onChange={(e) => setDraft({ ...draft, sensitiveFilterEnabled: e.target.checked })}
                  />
                  敏感词拦截
                </label>
              </div>

              <div>
                <div className="mb-1 text-xs font-medium text-zinc-300">提交频率限制（每日N次，可空）</div>
                <Input
                  type="number"
                  value={draft.submitRateLimitPerDay ?? ""}
                  onChange={(e) => setDraft({ ...draft, submitRateLimitPerDay: toNumOrNull(e.target.value) })}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setDraft(selected);
                    setSavedHint(null);
                  }}
                >
                  取消
                </Button>
                <Button
                  onClick={() => {
                    updateRule(draft.id, {
                      name: draft.name.trim() || "未命名规则",
                      minCount: draft.minCount,
                      maxCount: draft.maxCount,
                      minLen: draft.minLen,
                      maxLen: draft.maxLen,
                      dedupeRequired: draft.dedupeRequired,
                      sensitiveFilterEnabled: draft.sensitiveFilterEnabled,
                      submitRateLimitPerDay: draft.submitRateLimitPerDay,
                    });
                    setSavedHint("已保存");
                  }}
                >
                  保存
                </Button>
              </div>

              <div className="text-xs text-zinc-400">Demo占位：可在此扩展审核方式（人工/自动）、敏感词库管理等。</div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
