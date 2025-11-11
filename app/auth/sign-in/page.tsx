'use client';

import { useState } from 'react';
import { signInWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function SignInPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const router = useRouter();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNeedsVerification(false);
    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      
      // Check if email is verified
      if (!cred.user.emailVerified) {
        setNeedsVerification(true);
        setError('Please verify your email before signing in.');
        await auth.signOut(); // Sign out unverified user
        setLoading(false);
        return;
      }
      
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const resendVerification = async () => {
    setError(null);
    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      await sendEmailVerification(cred.user);
      await auth.signOut();
      setError('Verification email sent! Please check your inbox.');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-semibold">Sign in</h1>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        {needsVerification && (
          <div className="border rounded p-3 bg-yellow-50 text-yellow-800 text-sm space-y-2">
            <p>Your email has not been verified yet.</p>
            <button
              type="button"
              onClick={resendVerification}
              className="underline text-yellow-900 font-medium"
              disabled={loading}
            >
              Resend verification email
            </button>
          </div>
        )}
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
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="text-sm">
          No account?{' '}
          <Link href="/auth/sign-up" className="underline">
            Create one
          </Link>
        </p>
      </form>
    </div>
  );
}
