import { useEffect, useState } from "react";
import { requestJson } from "@/lib/api";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";

type ChangePasswordModalProps = {
  open: boolean;
  mode: "self" | "admin";
  accessToken: string | null;
  targetLabel: string;
  targetUserId?: string;
  onClose: () => void;
  onSuccess?: () => void | Promise<void>;
};

const initialForm = {
  oldPassword: "",
  newPassword: "",
  confirmPassword: "",
};

export default function ChangePasswordModal({
  open,
  mode,
  accessToken,
  targetLabel,
  targetUserId,
  onClose,
  onSuccess,
}: ChangePasswordModalProps) {
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(initialForm);
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  const title = mode === "self" ? "修改我的密码" : `修改密码 - ${targetLabel}`;

  const submit = async () => {
    if (!accessToken) {
      setError("登录状态已失效");
      return;
    }

    const oldPassword = form.oldPassword.trim();
    const newPassword = form.newPassword.trim();
    const confirmPassword = form.confirmPassword.trim();

    if (mode === "self" && !oldPassword) {
      setError("请输入当前密码");
      return;
    }

    if (!newPassword) {
      setError("请输入新密码");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("两次输入的新密码不一致");
      return;
    }

    if (mode === "self" && oldPassword === newPassword) {
      setError("新密码不能与旧密码相同");
      return;
    }

    if (mode === "admin" && !targetUserId) {
      setError("缺少目标用户");
      return;
    }

    setSubmitting(true);

    try {
      if (mode === "self") {
        await requestJson<{ success: true }>("/api/auth/password", {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            oldPassword,
            newPassword,
          }),
        });
      } else {
        await requestJson(`/api/users/${targetUserId}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            password: newPassword,
          }),
        });
      }

      setForm(initialForm);
      setError(null);
      await onSuccess?.();
      onClose();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "修改密码失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            取消
          </Button>
          <Button onClick={() => void submit()} disabled={submitting}>
            {submitting ? "保存中..." : "确认修改"}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="text-sm text-zinc-300">
          {mode === "self"
            ? "修改自己的密码后，当前登录会失效，需要重新登录。"
            : `当前将直接重置 ${targetLabel} 的登录密码。`}
        </div>

        {mode === "self" ? (
          <div>
            <div className="mb-1 text-xs font-medium text-zinc-300">当前密码</div>
            <Input
              type="password"
              value={form.oldPassword}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, oldPassword: event.target.value }))
              }
              disabled={submitting}
            />
          </div>
        ) : null}

        <div>
          <div className="mb-1 text-xs font-medium text-zinc-300">新密码</div>
          <Input
            type="password"
            value={form.newPassword}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, newPassword: event.target.value }))
            }
            disabled={submitting}
          />
        </div>

        <div>
          <div className="mb-1 text-xs font-medium text-zinc-300">确认新密码</div>
          <Input
            type="password"
            value={form.confirmPassword}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, confirmPassword: event.target.value }))
            }
            disabled={submitting}
          />
        </div>

        {error ? <div className="text-sm text-red-300">{error}</div> : null}
      </div>
    </Modal>
  );
}
