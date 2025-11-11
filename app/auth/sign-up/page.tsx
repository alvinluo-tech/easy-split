'use client';

import { useState } from 'react';
import { createUserWithEmailAndPassword, sendEmailVerification, updateProfile } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function SignUpPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const router = useRouter();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    // Validate displayName is not empty
    if (!displayName || displayName.trim().length === 0) {
      setError('Display name is required');
      return;
    }
    
    setLoading(true);
    
    try {
      const trimmedName = displayName.trim();
      
      // Step 1: Check if displayName already exists in displayNames collection
      // This can be done BEFORE authentication because the rule allows public reads
      const displayNameRef = doc(db, 'displayNames', trimmedName);
      const displayNameSnap = await getDoc(displayNameRef);
      
      if (displayNameSnap.exists()) {
        setError('Display name already taken. Please choose another one.');
        setLoading(false);
        return;
      }
      
      // Step 2: Create auth account
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: trimmedName });
      
      // Step 3: Send verification email
      await sendEmailVerification(cred.user);
      
      // Step 4: Claim the displayName in displayNames collection
      await setDoc(displayNameRef, {
        uid: cred.user.uid,
        displayName: trimmedName,
        claimedAt: Date.now(),
      });
      
      // Step 5: Create user profile doc
      await setDoc(doc(db, 'users', cred.user.uid), {
        uid: cred.user.uid,
        email: cred.user.email,
        displayName: trimmedName,
        emailVerified: false,
        createdAt: Date.now(),
      });
      
      setVerificationSent(true);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (verificationSent) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-[hsl(var(--background))]">
        <div className="w-full max-w-sm space-y-4 border border-zinc-300 dark:border-zinc-700 rounded-lg p-6 bg-white dark:bg-zinc-800 shadow-sm">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-white">Verify your email</h1>
          <div className="border border-green-300 dark:border-green-700 rounded p-4 bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300">
            <p className="text-sm">
              A verification email has been sent to <strong>{email}</strong>.
            </p>
            <p className="text-sm mt-2">
              Please check your inbox and click the verification link to activate your account.
            </p>
          </div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            After verifying your email, you can{' '}
            <Link href="/auth/sign-in" className="underline hover:text-blue-600 dark:hover:text-blue-400">
              sign in
            </Link>
            .
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 bg-[hsl(var(--background))]">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 border border-zinc-300 dark:border-zinc-700 rounded-lg p-6 bg-white dark:bg-zinc-800 shadow-sm">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-white">Sign up</h1>
        {error && <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>}
        <input
          type="text"
          placeholder="Display name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="w-full border border-zinc-300 dark:border-zinc-600 p-2 rounded bg-white dark:bg-zinc-900 dark:text-white placeholder:text-zinc-500 dark:placeholder:text-zinc-400"
          required
        />
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border border-zinc-300 dark:border-zinc-600 p-2 rounded bg-white dark:bg-zinc-900 dark:text-white placeholder:text-zinc-500 dark:placeholder:text-zinc-400"
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border border-zinc-300 dark:border-zinc-600 p-2 rounded bg-white dark:bg-zinc-900 dark:text-white placeholder:text-zinc-500 dark:placeholder:text-zinc-400"
          required
        />
        <button disabled={loading} className="w-full bg-black dark:bg-white text-white dark:text-black py-2 rounded hover:opacity-80 transition-opacity disabled:opacity-40">
          {loading ? 'Creating…' : 'Create account'}
        </button>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Already have an account?{' '}
          <Link href="/auth/sign-in" className="underline hover:text-blue-600 dark:hover:text-blue-400">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
