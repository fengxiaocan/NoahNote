import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Button, DialogLayer, TextField } from "./ui";

export interface ConfirmDialogOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
}

export interface PromptDialogOptions {
  title?: string;
  message: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

type DialogRequest =
  | { kind: "confirm"; options: ConfirmDialogOptions }
  | { kind: "prompt"; options: PromptDialogOptions };

type PendingDialog = DialogRequest & {
  resolve: (result: boolean | string | null) => void;
  restoreFocus: HTMLElement | null;
};

interface AppDialogsApi {
  confirm: (options: string | ConfirmDialogOptions) => Promise<boolean>;
  prompt: (options: PromptDialogOptions) => Promise<string | null>;
}

const DialogsContext = createContext<AppDialogsApi | null>(null);

export function AppDialogsProvider({ children }: { children: ReactNode }) {
  const [activeDialog, setActiveDialog] = useState<PendingDialog | null>(null);
  const activeRef = useRef<PendingDialog | null>(null);
  const queueRef = useRef<PendingDialog[]>([]);
  const promptRef = useRef<HTMLInputElement | null>(null);

  const enqueue = useCallback((request: DialogRequest) => new Promise<boolean | string | null>((resolve) => {
    const pending: PendingDialog = {
      ...request,
      resolve,
      restoreFocus: document.activeElement instanceof HTMLElement ? document.activeElement : null,
    };
    if (activeRef.current) {
      queueRef.current.push(pending);
    } else {
      activeRef.current = pending;
      setActiveDialog(pending);
    }
  }), []);

  const confirm = useCallback(async (options: string | ConfirmDialogOptions) => {
    const normalized = typeof options === "string" ? { message: options } : options;
    return (await enqueue({ kind: "confirm", options: normalized })) === true;
  }, [enqueue]);

  const prompt = useCallback(async (options: PromptDialogOptions) => {
    const result = await enqueue({ kind: "prompt", options });
    return typeof result === "string" ? result : null;
  }, [enqueue]);

  const finish = useCallback((dialog: PendingDialog, result: boolean | string | null) => {
    if (activeRef.current !== dialog) return;
    dialog.resolve(result);
    const next = queueRef.current.shift() ?? null;
    if (next) next.restoreFocus = dialog.restoreFocus;
    activeRef.current = next;
    setActiveDialog(next);
    if (!next) window.requestAnimationFrame(() => { if (!activeRef.current) dialog.restoreFocus?.focus(); });
  }, []);

  useEffect(() => {
    if (!activeDialog) return;
    if (activeDialog.kind === "prompt" && promptRef.current) promptRef.current.value = activeDialog.options.initialValue ?? "";
  }, [activeDialog]);

  const submitPrompt = (event: React.FormEvent<HTMLFormElement>, dialog: PendingDialog) => {
    event.preventDefault();
    if (dialog.kind === "prompt") finish(dialog, promptRef.current?.value ?? "");
  };

  return <DialogsContext.Provider value={{ confirm, prompt }}>
    {children}
    {activeDialog ? <DialogLayer className="app-dialog-backdrop" focusKey={activeDialog} onClose={() => finish(activeDialog, activeDialog.kind === "confirm" ? false : null)}>
      {activeDialog.kind === "confirm" ? <div className="modal-card app-dialog-card" role="alertdialog" aria-modal="true" aria-labelledby="app-dialog-title" aria-describedby="app-dialog-message">
        <div className="modal-heading"><div><span className="eyebrow">确认操作</span><h2 id="app-dialog-title">{activeDialog.options.title ?? "请确认"}</h2></div></div>
        <p className="app-dialog-message" id="app-dialog-message">{activeDialog.options.message}</p>
        <div className="modal-actions"><Button variant="secondary" onClick={() => finish(activeDialog, false)}>{activeDialog.options.cancelLabel ?? "取消"}</Button><Button variant={activeDialog.options.tone === "danger" ? "danger" : "primary"} onClick={() => finish(activeDialog, true)}>{activeDialog.options.confirmLabel ?? "确定"}</Button></div>
      </div> : <form className="modal-card app-dialog-card" role="dialog" aria-modal="true" aria-labelledby="app-dialog-title" aria-describedby="app-dialog-message" onSubmit={(event) => submitPrompt(event, activeDialog)}>
        <div className="modal-heading"><div><span className="eyebrow">编辑内容</span><h2 id="app-dialog-title">{activeDialog.options.title ?? "请输入"}</h2></div></div>
        <label className="app-dialog-label"><span id="app-dialog-message">{activeDialog.options.message}</span><TextField autoFocus ref={promptRef} defaultValue={activeDialog.options.initialValue ?? ""} placeholder={activeDialog.options.placeholder} /></label>
        <div className="modal-actions"><Button type="button" variant="secondary" onClick={() => finish(activeDialog, null)}>{activeDialog.options.cancelLabel ?? "取消"}</Button><Button type="submit" variant="primary">{activeDialog.options.confirmLabel ?? "确定"}</Button></div>
      </form>}
    </DialogLayer> : null}
  </DialogsContext.Provider>;
}

export function useAppDialogs() {
  const dialogs = useContext(DialogsContext);
  if (!dialogs) throw new Error("useAppDialogs must be used inside AppDialogsProvider");
  return dialogs;
}
