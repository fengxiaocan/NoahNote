import type { ContentSpace } from "../types";
import { Button } from "./ui";

interface SpaceMoveButtonProps {
  space: ContentSpace;
  onMove: (space: ContentSpace) => void | Promise<unknown>;
}

export function SpaceMoveButton({ space, onMove }: SpaceMoveButtonProps) {
  const nextSpace = space === "personal" ? "work" : "personal";
  const label = nextSpace === "work" ? "移到工作" : "移到个人";
  return <Button variant="subtle" size="small" title={label + "空间"} onClick={() => void Promise.resolve(onMove(nextSpace)).catch(() => undefined)}>{label}</Button>;
}
