import AsyncStorage from "@react-native-async-storage/async-storage";
import { rememberBillCode } from "@/lib/billCodeStore";

export interface GuestBillRef {
  id: number;
  joinCode: string;
  title: string;
  date: string;
}

const GUEST_BILLS_KEY = "guest_bills";
const GUEST_OWNER_ID_KEY = "guest_owner_id";

export function registerJoinCode(billId: number, joinCode: string): void {
  rememberBillCode(billId, joinCode);
}

function generateGuestId(): string {
  const ts = Date.now().toString(36);
  const r1 = Math.random().toString(36).slice(2, 10);
  const r2 = Math.random().toString(36).slice(2, 10);
  return `guest_${ts}_${r1}${r2}`;
}

export async function getOrCreateGuestOwnerId(): Promise<string> {
  try {
    const existing = await AsyncStorage.getItem(GUEST_OWNER_ID_KEY);
    if (existing) return existing;
    const id = generateGuestId();
    await AsyncStorage.setItem(GUEST_OWNER_ID_KEY, id);
    return id;
  } catch {
    return generateGuestId();
  }
}

export async function listGuestBills(): Promise<GuestBillRef[]> {
  try {
    const raw = await AsyncStorage.getItem(GUEST_BILLS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as GuestBillRef[];
  } catch {
    return [];
  }
}

export async function appendGuestBill(ref: GuestBillRef): Promise<void> {
  try {
    const existing = await listGuestBills();
    const updated = [ref, ...existing.filter((b) => b.id !== ref.id)];
    await AsyncStorage.setItem(GUEST_BILLS_KEY, JSON.stringify(updated));
    rememberBillCode(ref.id, ref.joinCode);
  } catch {}
}

export async function removeGuestBill(billId: number): Promise<void> {
  try {
    const existing = await listGuestBills();
    const updated = existing.filter((b) => b.id !== billId);
    await AsyncStorage.setItem(GUEST_BILLS_KEY, JSON.stringify(updated));
  } catch {}
}

export async function clearGuestBills(): Promise<void> {
  try {
    await AsyncStorage.removeItem(GUEST_BILLS_KEY);
  } catch {}
}

export async function loadJoinCodesIntoMemory(): Promise<void> {
  const bills = await listGuestBills();
  for (const b of bills) {
    rememberBillCode(b.id, b.joinCode);
  }
}
