export type UserProfile = {
  uid: string;
  displayName: string | null;
  email: string | null;
};

export type Community = {
  id: string;
  name: string;
  ownerId: string;
  inviteCode: string; // unique code to join
  createdAt: number; // Date.now()
};

export type LineItem = {
  id: string;
  name: string;
  price: number; // GBP
  claimedBy: string | null; // uid of the claimer, null means shared
};

export type Bill = {
  id: string;
  communityId: string;
  createdBy: string;
  createdAt: number;
  currency: 'GBP';
  exchangeRateGBPToCNY: number; // stored per-bill, editable
  participants: string[]; // user ids
  total: number; // computed sum of items (GBP)
  storagePath?: string; // path in Firebase Storage for the receipt image
};
