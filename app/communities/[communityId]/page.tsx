'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { auth, db, storage } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  addDoc,
  setDoc,
  deleteDoc,
} from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
import { useUserProfiles, getDisplayName } from '@/lib/useUserProfiles';

export default function CommunityPage() {
  const { communityId } = useParams() as { communityId: string };
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [community, setCommunity] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [loadingUpload, setLoadingUpload] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bills, setBills] = useState<any[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [membersInitialized, setMembersInitialized] = useState(false);
  
  // Fetch user profiles for all members
  const memberUids = members.map((m) => m.uid);
  const userProfiles = useUserProfiles(memberUids);
  
  // Check if current user is owner
  const isOwner = user && community && community.ownerId === user.uid;

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) router.push('/auth/sign-in');
      setUser(u);
    });
    return () => unsub();
  }, [router]);

  // Load community doc (always readable) and lazily attach members/bills
  const [authorized, setAuthorized] = useState(false);
  useEffect(() => {
    if (!communityId) return;
    const cRef = doc(db, 'communities', communityId);
    const unsubCommunity = onSnapshot(cRef, (snap) => {
      setCommunity(snap.data());
    });
    return () => {
      unsubCommunity();
    };
  }, [communityId]);

  // Determine authorization to read members/bills: owner OR membership exists
  useEffect(() => {
    if (!communityId || !user) return;
    const cRef = doc(db, 'communities', communityId);
    const selfMemberRef = doc(db, 'communities', communityId, 'members', user.uid);
    // Listen to both community (for owner) and self membership
    const unsubs: Array<() => void> = [];
    unsubs.push(onSnapshot(cRef, (snap) => {
      const data = snap.data() as any;
      if (data?.ownerId === user.uid) setAuthorized(true);
    }));
    unsubs.push(onSnapshot(selfMemberRef, (snap) => {
      if (snap.exists()) setAuthorized(true);
    }, (_err) => {
      // ignore permission errors here; we'll retry when membership is created
    }));
    return () => unsubs.forEach((fn) => fn());
  }, [communityId, user]);

  // Attach members/bills once authorized
  useEffect(() => {
    if (!communityId || !authorized) return;
    const mCol = collection(db, 'communities', communityId, 'members');
    const unsubMembers = onSnapshot(mCol, (snap) => {
      setMembers(snap.docs.map((d) => d.data()));
      setMembersInitialized(true);
    });
    const billsCol = collection(db, 'communities', communityId, 'bills');
    const unsubBills = onSnapshot(billsCol, (snap) => {
      setBills(snap.docs.map((d) => d.data()).sort((a, b) => b.createdAt - a.createdAt));
    });
    return () => {
      unsubMembers();
      unsubBills();
    };
  }, [communityId, authorized]);

  // If user is no longer a member, redirect them away
  const isMember = user && members.some((m) => m.uid === user.uid);
  useEffect(() => {
    if (!user || !membersInitialized) return;
    if (!isMember) {
      router.push('/dashboard');
    }
  }, [user, isMember, membersInitialized, router]);

  const removeMember = async (memberUid: string) => {
    if (!user || !communityId) return;
    
    // Prevent owner from removing themselves
    if (memberUid === community?.ownerId) {
      setError('Owner cannot leave the community. Transfer ownership first or delete the community.');
      return;
    }
    
    // Check permissions: only owner can kick others, anyone can leave themselves
    if (memberUid !== user.uid && !isOwner) {
      setError('Only the owner can remove other members.');
      return;
    }
    
    const displayName = getDisplayName(memberUid, userProfiles);
    const confirmMsg = memberUid === user.uid 
      ? `Are you sure you want to leave this community?`
      : `Are you sure you want to remove ${displayName} from this community?`;
    
    if (!confirm(confirmMsg)) return;
    
    setActionLoading(memberUid);
    setError(null);
    
    try {
      // Delete from communities/{id}/members/{uid} first
      const memberRef = doc(db, 'communities', communityId, 'members', memberUid);
      await deleteDoc(memberRef);
      
      // Delete from users/{uid}/memberships/{communityId}
      // Both user leaving themselves and owner kicking someone should delete this
      // Note: If this fails due to permissions, it's okay - the dashboard guard will clean it up
      const membershipRef = doc(db, 'users', memberUid, 'memberships', communityId);
      try {
        await deleteDoc(membershipRef);
      } catch (membershipErr: any) {
        // Ignore permission errors for membership deletion - the dashboard guard will handle it
        // Only log other unexpected errors
        if (!membershipErr.message?.includes('permission') && !membershipErr.code?.includes('permission-denied')) {
          console.warn('Failed to delete membership mirror (non-permission error):', membershipErr);
        }
      }
      
      // If user left themselves, redirect to dashboard
      if (memberUid === user.uid) {
        router.push('/dashboard');
      }
    } catch (err: any) {
      console.error('Remove member error:', err);
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const onUploadReceipt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setError(null);
    setLoadingUpload(true);
    try {
      // Upload to Firebase Storage
      const storagePath = `receipts/${communityId}/${Date.now()}-${file.name}`;
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, file);
      // Call OCR API
      const res = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          communityId,
          storagePath,
          createdBy: user.uid,
          exchangeRateGBPToCNY: 9,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'OCR failed');
      console.log('OCR API Response:', data);
      if (data.debug) {
        alert('OCR Debug Info (check console for details):\n' + 
          `Documents: ${data.debug.documentsCount}\n` +
          `Fields: ${data.debug.firstDocFields?.join(', ')}\n` +
          `Items parsed: ${data.debug.parsedItems?.length}`
        );
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingUpload(false);
      e.target.value = '';
    }
  };

  return (
    <div className="min-h-screen p-6 space-y-8 max-w-4xl mx-auto bg-[hsl(var(--background))]">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-white">Community</h1>
        <div className="flex items-center gap-3">
          <a href="/dashboard" className="underline text-sm text-zinc-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400">Back</a>
        </div>
      </div>
      {community && (
        <div className="border border-zinc-300 dark:border-zinc-700 rounded p-4 space-y-2 bg-zinc-50 dark:bg-zinc-800">
          <div className="flex items-center gap-2">
            {isOwner ? (
              <CommunityNameEditor communityId={communityId} currentName={community.name} />
            ) : (
              <div className="font-medium text-lg text-zinc-900 dark:text-white">{community.name}</div>
            )}
          </div>
          <div className="text-xs text-zinc-600 dark:text-zinc-400">Invite code: {community.inviteCode}</div>
        </div>
      )}

      <section className="space-y-3">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-medium text-zinc-900 dark:text-white">Members ({members.length})</h2>
          {user && !isOwner && (
            <button
              onClick={() => removeMember(user.uid)}
              disabled={actionLoading === user.uid}
              className="text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-500 underline"
            >
              {actionLoading === user.uid ? 'Leaving...' : 'Leave Community'}
            </button>
          )}
        </div>
        <ul className="grid sm:grid-cols-2 gap-2">
          {members.map((m) => (
            <li key={m.uid} className="border border-zinc-300 dark:border-zinc-700 p-3 rounded bg-white dark:bg-zinc-800">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="font-medium text-sm text-zinc-900 dark:text-white flex items-center gap-2">
                    {getDisplayName(m.uid, userProfiles)}
                    {m.uid === community?.ownerId && (
                      <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded font-semibold">
                        👑 Owner
                      </span>
                    )}
                    {m.uid === user?.uid && m.uid !== community?.ownerId && (
                      <span className="text-xs bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 px-2 py-0.5 rounded">You</span>
                    )}
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{m.uid}</div>
                </div>
                {isOwner && m.uid !== community?.ownerId && (
                  <button
                    onClick={() => removeMember(m.uid)}
                    disabled={actionLoading === m.uid}
                    className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-500 underline ml-2"
                  >
                    {actionLoading === m.uid ? 'Removing...' : 'Remove'}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-white">Upload receipt</h2>
        {error && <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>}
        <input type="file" accept="image/*" onChange={onUploadReceipt} className="text-sm text-zinc-900 dark:text-white" />
        {loadingUpload && <p className="text-sm text-zinc-600 dark:text-zinc-400">Processing…</p>}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-white">Bills</h2>
        <ul className="space-y-3">
          {bills.map((b) => (
            <li key={b.id} className="border border-zinc-300 dark:border-zinc-700 rounded p-3 bg-white dark:bg-zinc-800">
              <div className="flex justify-between">
                <div>
                  <div className="font-medium text-zinc-900 dark:text-white">{b.billName || `Bill #${b.id.slice(0, 6)}`}</div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">Total: {b.total.toFixed(2)} GBP</div>
                </div>
                <a className="underline text-sm text-zinc-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400" href={`/bills/${b.id}?community=${communityId}`}>Open</a>
              </div>
            </li>
          ))}
          {bills.length === 0 && <li className="text-sm text-zinc-500 dark:text-zinc-400">No bills yet.</li>}
        </ul>
      </section>
    </div>
  );
}

function CommunityNameEditor({ communityId, currentName }: { communityId: string; currentName: string }) {
  const [name, setName] = useState(currentName);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => setName(currentName), [currentName]);

  const save = async () => {
    if (!name.trim() || name.trim() === currentName) return;
    setSaving(true);
    setMessage(null);
    try {
      const ref = doc(db, 'communities', communityId);
      await setDoc(ref, { name: name.trim() }, { merge: true });
      setMessage('Saved');
      setTimeout(() => setMessage(null), 1500);
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="border border-zinc-300 dark:border-zinc-600 rounded px-2 py-1 text-sm bg-white dark:bg-zinc-900 dark:text-white"
        maxLength={60}
      />
      <button
        onClick={save}
        disabled={saving || !name.trim() || name.trim() === currentName}
        className="text-xs px-2 py-1 rounded bg-black dark:bg-white text-white dark:text-black disabled:opacity-40 hover:opacity-80 transition-opacity"
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
      {message && <span className="text-xs text-zinc-500 dark:text-zinc-400">{message}</span>}
    </div>
  );
}
