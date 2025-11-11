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
    <div className="flex-1 flex flex-col items-center justify-center p-6 bg-[hsl(var(--background))]">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 border border-zinc-300 dark:border-zinc-700 rounded-lg p-6 bg-white dark:bg-zinc-800 shadow-sm">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-white">Sign in</h1>
        {error && <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>}
        {needsVerification && (
          <div className="border border-yellow-300 dark:border-yellow-700 rounded p-3 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-300 text-sm space-y-2">
            <p>Your email has not been verified yet.</p>
            <button
              type="button"
              onClick={resendVerification}
              className="underline text-yellow-900 dark:text-yellow-200 font-medium hover:opacity-80"
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
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          No account?{' '}
          <Link href="/auth/sign-up" className="underline hover:text-blue-600 dark:hover:text-blue-400">
            Create one
          </Link>
        </p>
      </form>
    </div>
  );
}
