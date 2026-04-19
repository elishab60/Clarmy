"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useCockpit } from "@/lib/client/store";

export function ApprovalModalHost() {
  const s = useCockpit((st) => st.approvalFor);
  const setApprovalFor = useCockpit((st) => st.setApprovalFor);

  const close = () => setApprovalFor(null);
  const open = Boolean(s);

  if (!s || !s.approval) {
    return (
      <Dialog.Root open={false}>
        <Dialog.Portal>
          <Dialog.Overlay className="overlay" />
        </Dialog.Portal>
      </Dialog.Root>
    );
  }

  const act = (allow: boolean) => {
    void fetch(`/api/sessions/${s.id}/approve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ toolUseId: s.approval!.toolUseId, allow }),
    }).finally(close);
  };

  return (
    <Dialog.Root open={open} onOpenChange={(v) => { if (!v) close(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content className="modal" onEscapeKeyDown={close}>
          <div className="modal-head">
            <span className="sdot" />
            <Dialog.Title asChild><h3>Approve tool call</h3></Dialog.Title>
            <Dialog.Description asChild><span className="sub">{s.project}/ · {s.id}</span></Dialog.Description>
          </div>
          <div className="modal-body">
            <div className="tool-label">{s.approval.tool}</div>
            <pre className="cmd">{JSON.stringify(s.approval.args, null, 2)}</pre>
            <div className="context-row"><span>Session</span><span className="v">{s.name}</span></div>
            <div className="context-row"><span>Model</span><span className="v">{s.model}</span></div>
            {s.approval.destructive && (
              <div className="context-row">
                <span>Destructive</span>
                <span className="v" style={{ color: "var(--state-error)" }}>yes</span>
              </div>
            )}
          </div>
          <div className="modal-foot">
            <label className="opt"><input type="checkbox" />Remember for this session</label>
            <button className="btn deny" onClick={() => act(false)}>Deny</button>
            <button className="btn allow" onClick={() => act(true)}>Allow once</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
