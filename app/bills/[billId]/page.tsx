'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { auth, db, storage } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  onSnapshot,
  runTransaction,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore';
import { formatBoth, gbp } from '@/lib/format';
import { ref as storageRef, getDownloadURL } from 'firebase/storage';
import { useUserProfiles, getDisplayName } from '@/lib/useUserProfiles';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

export default function BillPage() {
  const { billId } = useParams() as { billId: string };
  const search = useSearchParams();
  const communityId = search.get('community') as string;
  const router = useRouter();

  const [user, setUser] = useState<any>(null);
  const [bill, setBill] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [billName, setBillName] = useState<string>('');
  const [savingName, setSavingName] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [membersInitialized, setMembersInitialized] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  
  // Fetch user profiles for all members, item claimers, and bill creator
  const allUids = [
    ...members.map((m) => m.uid),
    ...items.map((it) => it.claimedBy).filter(Boolean),
    bill?.createdBy,
  ].filter(Boolean);
  const userProfiles = useUserProfiles(allUids);
  
  const isCreator = user && bill && bill.createdBy === user.uid;

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) router.push('/auth/sign-in');
      setUser(u);
    });
    return () => unsub();
  }, [router]);

  useEffect(() => {
    if (!communityId || !billId) return;
    const billRef = doc(db, 'communities', communityId, 'bills', billId);
    const unsubBill = onSnapshot(billRef, (snap) => {
      const data = snap.data() as any;
      if (!data) return;
      // Attach id from doc path if not present
      const withId = { id: data.id || snap.id, ...data };
      setBill(withId);
      if (withId.billName) setBillName(withId.billName);
      // Receipt URL: prefer stored receiptUrl; else try to resolve from storagePath
      if (withId.receiptUrl) {
        setReceiptUrl(withId.receiptUrl);
      } else if (withId.storagePath) {
        getDownloadURL(storageRef(storage, withId.storagePath))
          .then((url) => setReceiptUrl(url))
          .catch(() => setReceiptUrl(null));
      } else {
        setReceiptUrl(null);
      }
    });
    const itemsCol = collection(db, 'communities', communityId, 'bills', billId, 'items');
  const unsubItems = onSnapshot(itemsCol, (snap) => setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    const memCol = collection(db, 'communities', communityId, 'members');
    const unsubMembers = onSnapshot(memCol, (snap) => {
      setMembers(snap.docs.map((d) => d.data()));
      setMembersInitialized(true);
    });
    return () => {
      unsubBill();
      unsubItems();
      unsubMembers();
    };
  }, [communityId, billId]);

  // Redirect non-members away from the bill view
  const isMember = user && members.some((m) => m.uid === user.uid);
  useEffect(() => {
    if (!user || !membersInitialized) return;
    if (!isMember) {
      router.push('/dashboard');
    }
  }, [user, isMember, membersInitialized, router]);

  const participantIds = (bill?.participants as string[]) || [];
  const exchangeRate = bill?.exchangeRateGBPToCNY || 0;
  const isParticipant = user && participantIds.includes(user.uid);

  const totals = useMemo(() => {
    const privateTotals: Record<string, number> = {};
    let sharedTotal = 0;
    for (const it of items) {
      if (it.claimedBy) {
        privateTotals[it.claimedBy] = (privateTotals[it.claimedBy] || 0) + (it.price || 0);
      } else {
        sharedTotal += it.price || 0;
      }
    }
    const count = Math.max(participantIds.length, 1);
    const perHead = sharedTotal / count;
    const result = participantIds.map((uid) => ({
      uid,
      private: privateTotals[uid] || 0,
      share: perHead,
      total: (privateTotals[uid] || 0) + perHead,
    }));
    return { result, sharedTotal };
  }, [items, participantIds]);

  const toggleClaim = async (itemId: string) => {
    if (!user) return;
    setErr(null);
    const itemRef = doc(db, 'communities', communityId, 'bills', billId, 'items', itemId);
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(itemRef);
        const data = snap.data() as any;
        const current = data?.claimedBy || null;
        // Firestore rules require full object update (id, name, price, claimedBy)
        const updatePayload = {
          id: data.id,
          name: data.name,
          price: data.price,
          claimedBy: null as string | null
        };
        if (!current) {
          updatePayload.claimedBy = user.uid;
          tx.update(itemRef, updatePayload);
        } else if (current === user.uid) {
          updatePayload.claimedBy = null;
          tx.update(itemRef, updatePayload);
        } else {
          // someone else owns it; no-op
        }
      });
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const toggleParticipant = async (uid: string) => {
    if (!communityId || !billId) return;
    const billRef = doc(db, 'communities', communityId, 'bills', billId);
    const isIn = participantIds.includes(uid);
    await updateDoc(billRef, {
      participants: isIn ? arrayRemove(uid) : arrayUnion(uid),
    });
  };

  const updateRate = async (val: number) => {
    if (!communityId || !billId) return;
    const billRef = doc(db, 'communities', communityId, 'bills', billId);
    await updateDoc(billRef, { exchangeRateGBPToCNY: val });
  };

  const doDelete = async () => {
    setConfirmDeleteOpen(false);
    setDeleting(true);
    try {
      const ref = doc(db, 'communities', communityId, 'bills', billId);
      await deleteDoc(ref);
      router.push(`/communities/${communityId}`);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-screen p-6 space-y-8 max-w-4xl mx-auto bg-[hsl(var(--background))]">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-white">Bill</h1>
          {bill && bill.createdBy === user?.uid ? (
            <BillNameEditor
              communityId={communityId}
              billId={billId}
              currentName={billName}
              onSaved={(n) => setBillName(n)}
            />
          ) : (
            bill?.billName && <div className="text-lg font-medium text-black dark:text-white">{bill.billName}</div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Button as="a" href={`/communities/${communityId}`} variant="secondary" size="sm">Back</Button>
        </div>
      </div>

      {bill && (
          <div className="border border-zinc-300 dark:border-zinc-700 rounded p-3 space-y-2 bg-zinc-50 dark:bg-zinc-800">
            <div className="text-sm text-black dark:text-white">Bill ID: {bill.id}</div>
            <div className="text-sm text-black dark:text-white">Created by: {getDisplayName(bill.createdBy, userProfiles)}</div>
            <div className="text-sm text-black dark:text-white">Created: {new Date(bill.createdAt).toLocaleString()}</div>
            {/* 原始账单图片预览 */}
            {receiptUrl && (
              <div className="mt-2">
                <h3 className="text-sm font-medium text-black dark:text-white mb-1">Original Receipt</h3>
                <div className="flex items-center gap-3">
                  <a href={receiptUrl} target="_blank" rel="noopener noreferrer">
                    <img src={receiptUrl} alt="Receipt" className="max-h-40 rounded border border-zinc-200 dark:border-zinc-700 shadow hover:scale-105 transition-transform cursor-pointer" />
                  </a>
                  <a href={receiptUrl} download className="text-xs px-3 py-1 rounded bg-blue-600 dark:bg-blue-500 text-white font-medium hover:bg-blue-700 dark:hover:bg-blue-400 transition">Download</a>
                </div>
              </div>
            )}
            <div className="flex items-center gap-2 mt-2">
              <label className="text-sm text-black dark:text-white">GBP→CNY rate</label>
              <input
                type="number"
                step="0.0001"
                className="border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 dark:text-white p-1 rounded w-28 disabled:opacity-50"
                value={exchangeRate || 0}
                onChange={(e) => updateRate(parseFloat(e.target.value) || 0)}
                disabled={!isCreator}
              />
            </div>
            {isCreator && (
              <Button
                variant="danger"
                size="sm"
                disabled={deleting}
                onClick={() => setConfirmDeleteOpen(true)}
              >
                {deleting ? 'Deleting…' : 'Delete Bill'}
              </Button>
            )}
          </div>
      )}

      <section className="space-y-2">
        <h2 className="text-lg font-medium text-black dark:text-white">Participants</h2>
        {isCreator ? (
          <ul className="flex flex-wrap gap-2">
            {members.map((m) => (
              <li key={m.uid}>
                <label className="flex items-center gap-2 text-sm text-black dark:text-white border border-zinc-300 dark:border-zinc-700 p-2 rounded cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800">
                  <input
                    type="checkbox"
                    checked={participantIds.includes(m.uid)}
                    onChange={() => toggleParticipant(m.uid)}
                  />
                  <span>{getDisplayName(m.uid, userProfiles)}</span>
                </label>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {participantIds.map((uid) => (
              <li key={uid} className="text-sm text-black dark:text-white border border-zinc-300 dark:border-zinc-700 p-2 rounded bg-zinc-50 dark:bg-zinc-800">
                {getDisplayName(uid, userProfiles)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium text-black dark:text-white">Items</h2>
        {err && <p className="text-red-600 dark:text-red-400 text-sm">{err}</p>}
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it.id} className="border border-zinc-300 dark:border-zinc-700 rounded p-2 flex justify-between items-center gap-3 bg-white dark:bg-zinc-800">
              <div className="flex-1">
                <div className="font-medium text-sm text-black dark:text-white">{it.name}</div>
                {isCreator ? (
                  <ItemPriceEditor
                    communityId={communityId}
                    billId={billId}
                    itemId={it.id}
                    currentPrice={it.price}
                  />
                ) : (
                  <div className="text-xs text-zinc-600 dark:text-zinc-400">{gbp.format(it.price)}</div>
                )}
              </div>
              {isParticipant ? (
                <Button
                  onClick={() => toggleClaim(it.id)}
                  variant={it.claimedBy ? 'ghost' : 'primary'}
                  size="sm"
                >
                  {it.claimedBy ? `${getDisplayName(it.claimedBy, userProfiles)}` : 'Claim private'}
                </Button>
              ) : (
                <div className="px-3 py-1 text-sm text-zinc-500 dark:text-zinc-400">
                  {it.claimedBy ? `${getDisplayName(it.claimedBy, userProfiles)}` : 'Shared'}
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium text-black dark:text-white">Totals</h2>
        <div className="text-sm text-zinc-600 dark:text-zinc-400">Shared subtotal: {formatBoth((totals.sharedTotal || 0), exchangeRate)}</div>
        <ul className="space-y-2">
          {totals.result.map((row) => (
            <li key={row.uid} className="border border-zinc-300 dark:border-zinc-700 rounded p-2 flex justify-between items-center bg-zinc-50 dark:bg-zinc-800">
              <div>
                <div className="font-medium text-sm text-black dark:text-white">{getDisplayName(row.uid, userProfiles)}</div>
                <div className="text-xs text-zinc-600 dark:text-zinc-400">Private: {formatBoth(row.private, exchangeRate)} · Share: {formatBoth(row.share, exchangeRate)}</div>
              </div>
              <div className="text-sm font-medium text-black dark:text-white">{formatBoth(row.total, exchangeRate)}</div>
            </li>
          ))}
        </ul>
      </section>
      <ConfirmDialog
        open={confirmDeleteOpen}
        title="Delete Bill"
        message="Are you sure you want to delete this bill? This cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={doDelete}
        onClose={() => setConfirmDeleteOpen(false)}
      />
    </div>
  );
}

function ItemPriceEditor({ communityId, billId, itemId, currentPrice }: { communityId: string; billId: string; itemId: string; currentPrice: number }) {
  const [price, setPrice] = useState(currentPrice.toString());
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => setPrice(currentPrice.toString()), [currentPrice]);

  const save = async () => {
    const newPrice = parseFloat(price);
    if (isNaN(newPrice) || newPrice === currentPrice) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const ref = doc(db, 'communities', communityId, 'bills', billId, 'items', itemId);
      await updateDoc(ref, { price: newPrice });
      setEditing(false);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div className="text-xs text-zinc-600 dark:text-zinc-400 flex items-center gap-2">
        <span>{gbp.format(currentPrice)}</span>
        <Button onClick={() => setEditing(true)} size="sm" variant="secondary">Edit</Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        step="0.01"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        className="border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 rounded px-1 py-0.5 text-xs w-20"
        disabled={saving}
      />
      <Button onClick={save} disabled={saving} size="sm" variant="primary">
        {saving ? 'Saving...' : 'Save'}
      </Button>
      <Button onClick={() => { setEditing(false); setPrice(currentPrice.toString()); }} size="sm" variant="ghost">Cancel</Button>
    </div>
  );
}

function BillNameEditor({ communityId, billId, currentName, onSaved }: { communityId: string; billId: string; currentName: string; onSaved: (n: string) => void }) {
  const [name, setName] = useState(currentName || '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => setName(currentName || ''), [currentName]);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === currentName) return;
    setSaving(true);
    setMsg(null);
    try {
      const ref = doc(db, 'communities', communityId, 'bills', billId);
      await updateDoc(ref, { billName: trimmed });
      onSaved(trimmed);
      setMsg('Saved');
      setTimeout(() => setMsg(null), 1500);
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 rounded px-2 py-1 text-sm"
        placeholder="Bill name"
        maxLength={80}
      />
      <button
        onClick={save}
        disabled={saving || !name.trim() || name.trim() === currentName}
        className="text-xs px-2 py-1 rounded bg-black dark:bg-white text-white dark:text-black disabled:opacity-40 hover:opacity-80"
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
      {msg && <span className="text-xs text-zinc-500 dark:text-zinc-400">{msg}</span>}
    </div>
  );
}

//

// Extract original logic into an internal component to allow confirm dialog injection without rewriting the whole file
function BillPageInternal(props: { router: ReturnType<typeof useRouter>; billId: string; communityId: string; }) {
  const { router, billId, communityId } = props;
  const [user, setUser] = useState<any>(null);
  const [bill, setBill] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [billName, setBillName] = useState<string>('');
  const [savingName, setSavingName] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [membersInitialized, setMembersInitialized] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  // Fetch user profiles for all members, item claimers, and bill creator
  const allUids = [
    ...members.map((m) => m.uid),
    ...items.map((it) => it.claimedBy).filter(Boolean),
    bill?.createdBy,
  ].filter(Boolean);
  const userProfiles = useUserProfiles(allUids);
  const isCreator = user && bill && bill.createdBy === user.uid;

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) router.push('/auth/sign-in');
      setUser(u);
    });
    return () => unsub();
  }, [router]);

  useEffect(() => {
    if (!communityId || !billId) return;
    const billRef = doc(db, 'communities', communityId, 'bills', billId);
    const unsubBill = onSnapshot(billRef, (snap) => {
      const data = snap.data() as any;
      if (!data) return;
      const withId = { id: data.id || snap.id, ...data };
      setBill(withId);
      if (withId.billName) setBillName(withId.billName);
      if (withId.receiptUrl) {
        setReceiptUrl(withId.receiptUrl);
      } else if (withId.storagePath) {
        getDownloadURL(storageRef(storage, withId.storagePath))
          .then((url) => setReceiptUrl(url))
          .catch(() => setReceiptUrl(null));
      } else {
        setReceiptUrl(null);
      }
    });
    const itemsCol = collection(db, 'communities', communityId, 'bills', billId, 'items');
    const unsubItems = onSnapshot(itemsCol, (snap) => setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    const memCol = collection(db, 'communities', communityId, 'members');
    const unsubMembers = onSnapshot(memCol, (snap) => {
      setMembers(snap.docs.map((d) => d.data()));
      setMembersInitialized(true);
    });
    return () => {
      unsubBill();
      unsubItems();
      unsubMembers();
    };
  }, [communityId, billId]);

  const isMember = user && members.some((m) => m.uid === user.uid);
  useEffect(() => {
    if (!user || !membersInitialized) return;
    if (!isMember) {
      router.push('/dashboard');
    }
  }, [user, isMember, membersInitialized, router]);

  const participantIds = (bill?.participants as string[]) || [];
  const exchangeRate = bill?.exchangeRateGBPToCNY || 0;
  const isParticipant = user && participantIds.includes(user.uid);

  const totals = useMemo(() => {
    const privateTotals: Record<string, number> = {};
    let sharedTotal = 0;
    for (const it of items) {
      if (it.claimedBy) {
        privateTotals[it.claimedBy] = (privateTotals[it.claimedBy] || 0) + (it.price || 0);
      } else {
        sharedTotal += it.price || 0;
      }
    }
    const count = Math.max(participantIds.length, 1);
    const perHead = sharedTotal / count;
    const result = participantIds.map((uid) => ({
      uid,
      private: privateTotals[uid] || 0,
      share: perHead,
      total: (privateTotals[uid] || 0) + perHead,
    }));
    return { result, sharedTotal };
  }, [items, participantIds]);

  const toggleClaim = async (itemId: string) => {
    if (!user) return;
    setErr(null);
    const itemRef = doc(db, 'communities', communityId, 'bills', billId, 'items', itemId);
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(itemRef);
        const data = snap.data() as any;
        const current = data?.claimedBy || null;
        // Firestore rules require full object update (id, name, price, claimedBy)
        const updatePayload = {
          id: data.id,
          name: data.name,
          price: data.price,
          claimedBy: null as string | null
        };
        if (!current) {
          updatePayload.claimedBy = user.uid;
          tx.update(itemRef, updatePayload);
        } else if (current === user.uid) {
          updatePayload.claimedBy = null;
          tx.update(itemRef, updatePayload);
        }
      });
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const toggleParticipant = async (uid: string) => {
    if (!communityId || !billId) return;
    const billRef = doc(db, 'communities', communityId, 'bills', billId);
    const isIn = participantIds.includes(uid);
    await updateDoc(billRef, {
      participants: isIn ? arrayRemove(uid) : arrayUnion(uid),
    });
  };

  const updateRate = async (val: number) => {
    if (!communityId || !billId) return;
    const billRef = doc(db, 'communities', communityId, 'bills', billId);
    await updateDoc(billRef, { exchangeRateGBPToCNY: val });
  };

  const doDelete = async () => {
    setConfirmDeleteOpen(false);
    setDeleting(true);
    try {
      const ref = doc(db, 'communities', communityId, 'bills', billId);
      await deleteDoc(ref);
      router.push(`/communities/${communityId}`);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-screen p-6 space-y-8 max-w-4xl mx-auto bg-[hsl(var(--background))]">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-white">Bill</h1>
          {bill && bill.createdBy === user?.uid ? (
            <BillNameEditor
              communityId={communityId}
              billId={billId}
              currentName={billName}
              onSaved={(n) => setBillName(n)}
            />
          ) : (
            bill?.billName && <div className="text-lg font-medium text-black dark:text-white">{bill.billName}</div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Button as="a" href={`/communities/${communityId}`} variant="secondary" size="sm">Back</Button>
        </div>
      </div>

      {bill && (
        <div className="border border-zinc-300 dark:border-zinc-700 rounded p-3 space-y-2 bg-zinc-50 dark:bg-zinc-800">
          <div className="text-sm text-black dark:text-white">Bill ID: {bill.id}</div>
          <div className="text-sm text-black dark:text-white">Created by: {getDisplayName(bill.createdBy, userProfiles)}</div>
          <div className="text-sm text-black dark:text-white">Created: {new Date(bill.createdAt).toLocaleString()}</div>
          {receiptUrl && (
            <div className="mt-2">
              <h3 className="text-sm font-medium text-black dark:text-white mb-1">Original Receipt</h3>
              <div className="flex items-center gap-3">
                <a href={receiptUrl} target="_blank" rel="noopener noreferrer">
                  <img src={receiptUrl} alt="Receipt" className="max-h-40 rounded border border-zinc-200 dark:border-zinc-700 shadow hover:scale-105 transition-transform cursor-pointer" />
                </a>
                <a href={receiptUrl} download className="text-xs px-3 py-1 rounded bg-blue-600 dark:bg-blue-500 text-white font-medium hover:bg-blue-700 dark:hover:bg-blue-400 transition">Download</a>
              </div>
            </div>
          )}
          <div className="flex items-center gap-2 mt-2">
            <label className="text-sm text-black dark:text-white">GBP→CNY rate</label>
            <input
              type="number"
              step="0.0001"
              className="border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 dark:text-white p-1 rounded w-28 disabled:opacity-50"
              value={exchangeRate || 0}
              onChange={(e) => updateRate(parseFloat(e.target.value) || 0)}
              disabled={!isCreator}
            />
          </div>
          {isCreator && (
            <Button
              variant="danger"
              size="sm"
              disabled={deleting}
              onClick={() => setConfirmDeleteOpen(true)}
            >
              {deleting ? 'Deleting…' : 'Delete Bill'}
            </Button>
          )}
        </div>
      )}

      {/* ... keep the rest of the original sections (Participants, Items, Totals) ... */}

      <ConfirmDialog
        open={confirmDeleteOpen}
        title="Delete Bill"
        message="Are you sure you want to delete this bill? This cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={doDelete}
        onClose={() => setConfirmDeleteOpen(false)}
      />
    </div>
  );
}
