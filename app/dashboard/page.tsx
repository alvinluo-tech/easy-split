'use client';

import { useEffect, useMemo, useState } from 'react';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  deleteDoc,
  where,
} from 'firebase/firestore';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { useRouter } from 'next/navigation';

function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [communities, setCommunities] = useState<any[]>([]);
  const [newName, setNewName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [membershipGuards, setMembershipGuards] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) router.push('/auth/sign-in');
      setUser(u);
    });
    return () => unsub();
  }, [router]);

  // Removed: This tried to listen to all communities, which violates security rules.
  // We now only use the memberships mirror collection below.

  // Simpler approach: query membership by subcollection isn't straightforward. We'll instead maintain a mirror collection users/{uid}/memberships/{communityId}
  // For MVP, when creating/joining, we will also write users/{uid}/memberships/{communityId} = { communityId, name }
  const [memberships, setMemberships] = useState<any[]>([]);
  useEffect(() => {
    if (!user) return;
    const q = collection(db, 'users', user.uid, 'memberships');
    const unsub = onSnapshot(q, (snap) => {
      setMemberships(snap.docs.map((d) => d.data()));
    });
    return () => unsub();
  }, [user]);

  // Live-validate each membership by checking that communities/{id}/members/{uid} still exists
  useEffect(() => {
    if (!user) return;
    const unsubs: Array<() => void> = [];

    for (const m of memberships) {
      const ref = doc(db, 'communities', m.communityId, 'members', user.uid);
      const unsub = onSnapshot(
        ref,
        (snap) => {
          setMembershipGuards((prev) => ({
            ...prev,
            [m.communityId]: snap.exists(),
          }));
        },
        (error: any) => {
          // If we don't have permission to read the membership doc anymore,
          // treat it as not a member so we hide the shell immediately.
          setMembershipGuards((prev) => ({
            ...prev,
            [m.communityId]: false,
          }));
        }
      );
      unsubs.push(unsub);
    }

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, [user, memberships]);

  // Best-effort cleanup: if the mirror membership exists but server-side membership is gone, delete the mirror
  useEffect(() => {
    if (!user) return;
    const stale = memberships.filter((m) => membershipGuards[m.communityId] === false);
    if (stale.length === 0) return;
    stale.forEach(async (m) => {
      try {
        const ref = doc(db, 'users', user.uid, 'memberships', m.communityId);
        const { deleteDoc } = await import('firebase/firestore');
        await deleteDoc(ref);
      } catch (_) {
        // ignore
      }
    });
  }, [user, memberships, membershipGuards]);
  const createCommunity = async () => {
    if (!user || !newName) return;
    setError(null);
    const inviteCode = generateInviteCode();
    const ref = doc(collection(db, 'communities'));
    await setDoc(ref, {
      id: ref.id,
      name: newName,
      ownerId: user.uid,
      inviteCode,
      createdAt: Date.now(),
    });
    await setDoc(doc(db, 'communities', ref.id, 'members', user.uid), {
      uid: user.uid,
      role: 'owner',
      joinedAt: Date.now(),
    });
    await setDoc(doc(db, 'users', user.uid, 'memberships', ref.id), {
      communityId: ref.id,
      name: newName,
      inviteCode,
    });
    setNewName('');
  };

  const joinCommunity = async () => {
    if (!user || !joinCode) return;
    setError(null);
    const q = query(collection(db, 'communities'), where('inviteCode', '==', joinCode.trim().toUpperCase()));
    const snap = await getDocs(q);
    if (snap.empty) {
      setError('Invalid invite code');
      return;
    }
    const c = snap.docs[0];
    await setDoc(doc(db, 'communities', c.id, 'members', user.uid), {
      uid: user.uid,
      role: 'member',
      joinedAt: Date.now(),
    });
    await setDoc(doc(db, 'users', user.uid, 'memberships', c.id), {
      communityId: c.id,
      name: c.data().name,
      inviteCode: c.data().inviteCode,
    });
    setJoinCode('');
  };

  const logout = async () => {
    await signOut(auth);
    router.push('/auth/sign-in');
  };

  return (
    <div className="min-h-screen p-6 max-w-3xl mx-auto space-y-8 bg-[hsl(var(--background))]">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-white">Dashboard</h1>
        <div className="flex items-center gap-3">
          <Button onClick={logout} variant="secondary" size="sm">Sign out</Button>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-white">Your communities</h2>
        <ul className="space-y-3">
          {memberships.filter((m) => membershipGuards[m.communityId] !== false).map((m) => (
            <li key={m.communityId} className="flex justify-between items-center border border-zinc-300 dark:border-zinc-700 p-3 rounded bg-white dark:bg-zinc-800">
              <div>
                <div className="font-medium text-zinc-900 dark:text-white">{m.name}</div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">Code: {m.inviteCode}</div>
              </div>
              <Button as="a" href={`/communities/${m.communityId}`} variant="primary" size="sm">Open</Button>
            </li>
          ))}
          {memberships.length === 0 && <li className="text-sm text-zinc-500 dark:text-zinc-400">No communities yet.</li>}
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="font-medium text-zinc-900 dark:text-white">Create community</h3>
        <div className="flex gap-2">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Community name" className="border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white p-2 rounded flex-1 placeholder:text-zinc-500 dark:placeholder:text-zinc-400" />
          <button onClick={createCommunity} className="bg-black dark:bg-white text-white dark:text-black px-4 rounded hover:opacity-80">Create</button>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="font-medium text-zinc-900 dark:text-white">Join via invite code</h3>
        {error && <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>}
        <div className="flex gap-2">
          <input value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="6-char code" className="border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white p-2 rounded flex-1 placeholder:text-zinc-500 dark:placeholder:text-zinc-400" />
          <button onClick={joinCommunity} className="bg-black dark:bg-white text-white dark:text-black px-4 rounded hover:opacity-80">Join</button>
        </div>
      </section>
    </div>
  );
}
