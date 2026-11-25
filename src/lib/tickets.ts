/** 联系管理工单：状态与文案（客户端 / 服务端共用，不依赖 auth） */

export const TICKET_STATUSES = ["open", "processing", "resolved"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  open: "待处理",
  processing: "处理中",
  resolved: "已解决",
};

export function isTicketStatus(value: unknown): value is TicketStatus {
  return typeof value === "string" && (TICKET_STATUSES as readonly string[]).includes(value);
}
