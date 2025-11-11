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
  where,
} from 'firebase/firestore';
import Link from 'next/link';
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
    <div className="p-6 max-w-3xl mx-auto space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <button onClick={logout} className="text-sm underline">Sign out</button>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Your communities</h2>
        <ul className="space-y-2">
          {memberships.map((m) => (
            <li key={m.communityId} className="flex justify-between items-center border p-3 rounded">
              <div>
                <div className="font-medium">{m.name}</div>
                <div className="text-xs text-zinc-500">Code: {m.inviteCode}</div>
              </div>
              <Link className="underline" href={`/communities/${m.communityId}`}>Open</Link>
            </li>
          ))}
          {memberships.length === 0 && <li className="text-sm text-zinc-500">No communities yet.</li>}
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="font-medium">Create community</h3>
        <div className="flex gap-2">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Community name" className="border p-2 rounded flex-1" />
          <button onClick={createCommunity} className="bg-black text-white px-4 rounded">Create</button>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="font-medium">Join via invite code</h3>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <div className="flex gap-2">
          <input value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="6-char code" className="border p-2 rounded flex-1" />
          <button onClick={joinCommunity} className="bg-black text-white px-4 rounded">Join</button>
        </div>
      </section>
    </div>
  );
}
