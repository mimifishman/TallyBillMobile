import type { Response } from "express";

const subscribers = new Map<number, Set<Response>>();
const userSubscribers = new Map<number, Set<Response>>();

export function subscribe(billId: number, res: Response): void {
  if (!subscribers.has(billId)) {
    subscribers.set(billId, new Set());
  }
  subscribers.get(billId)!.add(res);
}

export function unsubscribe(billId: number, res: Response): void {
  const subs = subscribers.get(billId);
  if (!subs) return;
  subs.delete(res);
  if (subs.size === 0) {
    subscribers.delete(billId);
  }
}

export function notifyBillChanged(billId: number): void {
  const subs = subscribers.get(billId);
  if (!subs || subs.size === 0) return;
  const msg = `data: ${JSON.stringify({ event: "bill_changed" })}\n\n`;
  const dead: Response[] = [];
  for (const res of subs) {
    try {
      res.write(msg);
    } catch {
      dead.push(res);
    }
  }
  for (const res of dead) {
    subs.delete(res);
  }
  if (subs.size === 0) {
    subscribers.delete(billId);
  }
}

export function subscribeUser(userId: number, res: Response): void {
  if (!userSubscribers.has(userId)) {
    userSubscribers.set(userId, new Set());
  }
  userSubscribers.get(userId)!.add(res);
}

export function unsubscribeUser(userId: number, res: Response): void {
  const subs = userSubscribers.get(userId);
  if (!subs) return;
  subs.delete(res);
  if (subs.size === 0) {
    userSubscribers.delete(userId);
  }
}

export function notifyUserBillsChanged(
  userId: number,
  payload?: { billTitle?: string; addedBy?: string },
): void {
  const subs = userSubscribers.get(userId);
  if (!subs || subs.size === 0) return;
  const msg = `data: ${JSON.stringify({ event: "bills_changed", ...payload })}\n\n`;
  const dead: Response[] = [];
  for (const res of subs) {
    try {
      res.write(msg);
    } catch {
      dead.push(res);
    }
  }
  for (const res of dead) {
    subs.delete(res);
  }
  if (subs.size === 0) {
    userSubscribers.delete(userId);
  }
}
