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
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-4">
          <h1 className="text-2xl font-semibold">Verify your email</h1>
          <div className="border rounded p-4 bg-green-50 text-green-800">
            <p className="text-sm">
              A verification email has been sent to <strong>{email}</strong>.
            </p>
            <p className="text-sm mt-2">
              Please check your inbox and click the verification link to activate your account.
            </p>
          </div>
          <p className="text-sm text-zinc-600">
            After verifying your email, you can{' '}
            <Link href="/auth/sign-in" className="underline">
              sign in
            </Link>
            .
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-semibold">Sign up</h1>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <input
          type="text"
          placeholder="Display name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="w-full border p-2 rounded"
          required
        />
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border p-2 rounded"
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border p-2 rounded"
          required
        />
        <button disabled={loading} className="w-full bg-black text-white py-2 rounded">
          {loading ? 'Creating…' : 'Create account'}
        </button>
        <p className="text-sm">
          Already have an account?{' '}
          <Link href="/auth/sign-in" className="underline">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
