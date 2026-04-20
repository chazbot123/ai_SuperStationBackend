import { useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Tabs from "@/components/ui/Tabs";
import Badge from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Table, TableWrap, Td, Th, Tr } from "@/components/ui/Table";
import { usePageMeta } from "@/hooks/usePageMeta";
import { useAppStore } from "@/store/appStore";

export default function Reviews() {
  usePageMeta("审核中心");
  const contents = useAppStore((s) => s.contents);
  const products = useAppStore((s) => s.products);
  const updateContent = useAppStore((s) => s.updateContent);
  const approveProduct = useAppStore((s) => s.approveProduct);
  const rejectProduct = useAppStore((s) => s.rejectProduct);
  const [tab, setTab] = useState("materials");
  const [reason, setReason] = useState("");

  const materialItems = useMemo(
    () => contents.filter((item) => item.reviewStatus === "submitted"),
    [contents]
  );
  const productItems = useMemo(
    () => products.filter((item) => item.status === "submitted"),
    [products]
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>审核中心</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-zinc-300">
          当前审核中心只保留两类审核：素材审核和产品审核。
        </CardContent>
      </Card>

      <Tabs
        tabs={[
          { key: "materials", label: `素材审核 (${materialItems.length})` },
          { key: "products", label: `产品审核 (${productItems.length})` },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "materials" ? (
        <Card>
          <CardHeader>
            <CardTitle>素材审核</CardTitle>
          </CardHeader>
          <CardContent>
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>素材标题</Th>
                    <Th>类型</Th>
                    <Th>提交人</Th>
                    <Th>提交时间</Th>
                    <Th className="text-right">操作</Th>
                  </tr>
                </thead>
                <tbody>
                  {materialItems.length === 0 ? (
                    <Tr>
                      <Td colSpan={5} className="py-10 text-center text-zinc-400">
                        暂无待审核素材
                      </Td>
                    </Tr>
                  ) : (
                    materialItems.map((item) => (
                      <Tr key={item.id}>
                        <Td className="font-medium text-zinc-100">{item.title}</Td>
                        <Td className="text-zinc-300">{item.type === "video" ? "视频" : "图文"}</Td>
                        <Td className="text-zinc-300">{item.submittedByName ?? "-"}</Td>
                        <Td className="text-zinc-400">{item.submittedAt ? new Date(item.submittedAt).toLocaleString() : "-"}</Td>
                        <Td className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button size="sm" onClick={() => updateContent(item.id, { reviewStatus: "approved", rejectReason: null })}>
                              通过
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() =>
                                updateContent(item.id, {
                                  reviewStatus: "rejected",
                                  rejectReason: reason.trim() || "请补充素材信息后重新提交",
                                })
                              }
                            >
                              驳回
                            </Button>
                          </div>
                        </Td>
                      </Tr>
                    ))
                  )}
                </tbody>
              </Table>
            </TableWrap>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>产品审核</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="统一驳回原因（可选）" />
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>商品</Th>
                    <Th>创建人</Th>
                    <Th>价格</Th>
                    <Th>状态</Th>
                    <Th className="text-right">操作</Th>
                  </tr>
                </thead>
                <tbody>
                  {productItems.length === 0 ? (
                    <Tr>
                      <Td colSpan={5} className="py-10 text-center text-zinc-400">
                        暂无待审核商品
                      </Td>
                    </Tr>
                  ) : (
                    productItems.map((item) => (
                      <Tr key={item.id}>
                        <Td>
                          <div className="font-medium text-zinc-100">{item.name}</div>
                          <div className="text-xs text-zinc-400">{item.summary}</div>
                        </Td>
                        <Td className="text-zinc-300">{item.ownerName}</Td>
                        <Td className="text-zinc-300">{item.priceText}</Td>
                        <Td><Badge variant="amber">待审核</Badge></Td>
                        <Td className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button size="sm" onClick={() => approveProduct(item.id)}>
                              通过并上架
                            </Button>
                            <Button size="sm" variant="secondary" onClick={() => rejectProduct(item.id, reason)}>
                              驳回
                            </Button>
                          </div>
                        </Td>
                      </Tr>
                    ))
                  )}
                </tbody>
              </Table>
            </TableWrap>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
