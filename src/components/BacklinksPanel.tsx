import { useEffect, useState } from "react";
import { api, isTauri } from "../lib/api";
import type { DocumentKind, WikiLink } from "../types";

interface BacklinksPanelProps {
  id: string;
  kind: DocumentKind;
  onOpen: (id: string, kind: string) => void;
}

export function BacklinksPanel({ id, kind, onOpen }: BacklinksPanelProps) {
  const [outgoing, setOutgoing] = useState<WikiLink[]>([]);
  const [incoming, setIncoming] = useState<WikiLink[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isTauri()) {
      setOutgoing([]);
      setIncoming([]);
      return;
    }
    let active = true;
    void Promise.all([api.listWikiLinks(id, kind), api.listWikiBacklinks(id, kind)])
      .then(([nextOutgoing, nextIncoming]) => {
        if (!active) return;
        setOutgoing(nextOutgoing);
        setIncoming(nextIncoming);
        setError("");
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => { active = false; };
  }, [id, kind]);

  return <section className="backlinks-panel">
    <div className="backlinks-heading"><span className="card-kicker">知识关联</span><span className="muted">{outgoing.length + incoming.length} 条链接</span></div>
    {error ? <p className="form-error">{error}</p> : null}
    <div className="backlinks-columns">
      <LinkGroup title="本文引用" links={outgoing} direction="outgoing" onOpen={onOpen} />
      <LinkGroup title="引用本文" links={incoming} direction="incoming" onOpen={onOpen} />
    </div>
  </section>;
}

function LinkGroup({ title, links, direction, onOpen }: { title: string; links: WikiLink[]; direction: "outgoing" | "incoming"; onOpen: (id: string, kind: string) => void }) {
  return <div className="backlink-group"><div className="backlink-group-heading"><strong>{title}</strong><span>{links.length}</span></div>{links.length === 0 ? <p className="muted">暂无</p> : <div className="backlink-list">{links.map((link) => {
    const targetId = direction === "outgoing" ? link.targetId : link.sourceId;
    const targetKind = direction === "outgoing" ? link.targetKind : link.sourceKind;
    const titleText = direction === "outgoing" ? link.targetTitle : link.sourceTitle;
    return targetId && targetKind ? <button className="backlink-item" key={link.id} onClick={() => onOpen(targetId, targetKind)}><span>{direction === "outgoing" ? "↗" : "↙"}</span><strong>{titleText}</strong></button> : <div className="backlink-item is-unresolved" key={link.id}><span>?</span><strong>{titleText}</strong><small>未解析</small></div>;
  })}</div>}</div>;
}
