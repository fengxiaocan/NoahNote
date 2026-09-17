export const formatDate = (value: string | null | undefined, withTime = false) => {
  if (!value) return "无日期";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
};

export const formatRelative = (value: string) => {
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  return formatDate(value);
};

export const todayKey = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const parseTags = (value: string) =>
  [...new Set(value.split(/[\s,，#]+/).map((tag) => tag.trim()).filter(Boolean))];

export const statusLabel: Record<string, string> = {
  todo: "待处理",
  in_progress: "进行中",
  waiting: "等待",
  done: "已完成",
  cancelled: "已取消",
};

export const priorityLabel: Record<string, string> = {
  urgent: "紧急",
  high: "高",
  normal: "普通",
  low: "低",
};

export const projectStatusLabel: Record<string, string> = {
  planning: "规划中",
  active: "进行中",
  paused: "已暂停",
  completed: "已完成",
  archived: "已归档",
};
