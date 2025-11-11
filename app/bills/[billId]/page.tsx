'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
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
import { useUserProfiles, getDisplayName } from '@/lib/useUserProfiles';

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
  
  // Fetch user profiles for all members and item claimers
  const allUids = [
    ...members.map((m) => m.uid),
    ...items.map((it) => it.claimedBy).filter(Boolean),
  ];
  const userProfiles = useUserProfiles(allUids);

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
      const data = snap.data();
      setBill(data);
      if (data?.billName) setBillName(data.billName);
    });
    const itemsCol = collection(db, 'communities', communityId, 'bills', billId, 'items');
    const unsubItems = onSnapshot(itemsCol, (snap) => setItems(snap.docs.map((d) => d.data())));
    const memCol = collection(db, 'communities', communityId, 'members');
    const unsubMembers = onSnapshot(memCol, (snap) => setMembers(snap.docs.map((d) => d.data())));
    return () => {
      unsubBill();
      unsubItems();
      unsubMembers();
    };
  }, [communityId, billId]);

  const participantIds = (bill?.participants as string[]) || [];
  const exchangeRate = bill?.exchangeRateGBPToCNY || 0;

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
        if (!current) {
          tx.update(itemRef, { claimedBy: user.uid });
        } else if (current === user.uid) {
          tx.update(itemRef, { claimedBy: null });
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

  return (
    <div className="p-6 space-y-8 max-w-4xl mx-auto">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">Bill</h1>
          {bill && bill.createdBy === user?.uid ? (
            <BillNameEditor
              communityId={communityId}
              billId={billId}
              currentName={billName}
              onSaved={(n) => setBillName(n)}
            />
          ) : (
            bill?.billName && <div className="text-lg font-medium">{bill.billName}</div>
          )}
        </div>
        <a className="underline text-sm" href={`/communities/${communityId}`}>Back</a>
      </div>

      {bill && (
        <div className="border rounded p-3 space-y-2">
          <div className="text-sm">Bill ID: {bill.id}</div>
          <div className="text-sm">Created: {new Date(bill.createdAt).toLocaleString()}</div>
          <div className="flex items-center gap-2">
            <label className="text-sm">GBP→CNY rate</label>
            <input
              type="number"
              step="0.0001"
              className="border p-1 rounded w-28"
              value={exchangeRate || 0}
              onChange={(e) => updateRate(parseFloat(e.target.value) || 0)}
            />
          </div>
          {bill.createdBy === user?.uid && (
            <button
              className="text-xs text-red-600 underline"
              disabled={deleting}
              onClick={async () => {
                if (!confirm('Delete this bill? This cannot be undone.')) return;
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
              }}
            >
              {deleting ? 'Deleting…' : 'Delete Bill'}
            </button>
          )}
        </div>
      )}

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Participants</h2>
        <ul className="flex flex-wrap gap-2">
          {members.map((m) => (
            <li key={m.uid}>
              <label className="flex items-center gap-2 text-sm border p-2 rounded cursor-pointer">
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
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Items</h2>
        {err && <p className="text-red-600 text-sm">{err}</p>}
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it.id} className="border rounded p-2 flex justify-between items-center">
              <div>
                <div className="font-medium text-sm">{it.name}</div>
                <div className="text-xs text-zinc-600">{gbp.format(it.price)}</div>
              </div>
              <button
                className={`px-3 py-1 rounded text-sm ${it.claimedBy ? 'bg-zinc-200' : 'bg-black text-white'}`}
                onClick={() => toggleClaim(it.id)}
              >
                {it.claimedBy ? `${getDisplayName(it.claimedBy, userProfiles)}` : 'Claim private'}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Totals</h2>
        <div className="text-sm text-zinc-600">Shared subtotal: {formatBoth((totals.sharedTotal || 0), exchangeRate)}</div>
        <ul className="space-y-2">
          {totals.result.map((row) => (
            <li key={row.uid} className="border rounded p-2 flex justify-between items-center">
              <div>
                <div className="font-medium text-sm">{getDisplayName(row.uid, userProfiles)}</div>
                <div className="text-xs text-zinc-600">Private: {formatBoth(row.private, exchangeRate)} · Share: {formatBoth(row.share, exchangeRate)}</div>
              </div>
              <div className="text-sm font-medium">{formatBoth(row.total, exchangeRate)}</div>
            </li>
          ))}
        </ul>
      </section>
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
        className="border rounded px-2 py-1 text-sm"
        placeholder="Bill name"
        maxLength={80}
      />
      <button
        onClick={save}
        disabled={saving || !name.trim() || name.trim() === currentName}
        className="text-xs px-2 py-1 rounded bg-black text-white disabled:opacity-40"
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
      {msg && <span className="text-xs text-zinc-500">{msg}</span>}
    </div>
  );
}
