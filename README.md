## Easy Split – Realtime collaborative bill splitting

Stack: Next.js (App Router) + Firebase (Auth, Firestore, Storage) + Azure Form Recognizer + Vercel.

### Prereqs
- Node 18+ and pnpm
- Firebase Project (Firestore, Storage, Authentication enabled)
- Azure AI Services: Form Recognizer (Receipt model)
- Vercel account (optional but recommended)

### Environment variables
Create a .env.local (local dev) and set the following, and configure the same on Vercel Project Settings → Environment Variables.

Client-side (public):
- NEXT_PUBLIC_FIREBASE_API_KEY
- NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
- NEXT_PUBLIC_FIREBASE_PROJECT_ID
- NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
- NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
- NEXT_PUBLIC_FIREBASE_APP_ID
- (optional) NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID

Server-side:
- FIREBASE_PROJECT_ID
- FIREBASE_CLIENT_EMAIL
- FIREBASE_PRIVATE_KEY  (paste JSON private key with newlines escaped as \n)
- FIREBASE_STORAGE_BUCKET
- AZURE_FORM_RECOGNIZER_ENDPOINT (e.g. https://<resource-name>.cognitiveservices.azure.com)
- AZURE_FORM_RECOGNIZER_KEY

### Run locally

```bash
pnpm dev
```

Open http://localhost:3000.

### Firebase Setup

**Important: Deploy Security Rules**
```bash
firebase deploy --only firestore:rules,storage:rules
```

**Enable Email Verification in Firebase Console:**
1. Go to Firebase Console → Authentication → Templates
2. Make sure "Email address verification" template is enabled
3. Customize the email template if needed (optional)

**Create Firestore Index for displayName uniqueness check:**
Go to Firebase Console → Firestore Database → Indexes → Create Index:
- Collection ID: `users`
- Fields: `displayName` (Ascending)
- Query scope: Collection

This index is required for the sign-up process to check if a display name is already taken.

### Usage flow
1) Sign up with email, password, and unique display name
2) Verify your email address (check inbox for verification link)
3) Sign in (requires verified email)
4) Create a community (invite code auto-generated) or join via invite code
5) Inside a community, upload a receipt image. The image is uploaded to Firebase Storage and the serverless OCR endpoint creates a bill + items in Firestore
6) Open a bill. Add participants, claim/unclaim items (private vs shared). Exchange rate (GBP→CNY) can be edited per bill
7) Totals update in realtime for all viewers

### Firestore data model
- communities/{communityId}
	- members/{uid} → { uid, role, joinedAt }
	- bills/{billId} → { id, participants[], exchangeRateGBPToCNY, createdBy, createdAt, total, storagePath }
		- items/{itemId} → { id, name, price, claimedBy|null }
- users/{uid} → { uid, email, displayName (required, unique), emailVerified, createdAt }
	- memberships/{communityId} → { communityId, name, inviteCode }

### Minimal security rules (outline)
Implement Firestore rules to enforce multi-tenant isolation, e.g.:
- Only authenticated users can read/write
- User must be a member of communities/{id}/members to read that community, its bills and items
- Only members can create bills in their community
- Item.claimedBy updates allowed if requester is a member; business constraint (exclusive claim) is best-enforced by client transaction plus server-side validation if using Cloud Functions

Storage rules: limit uploads to authenticated users and to paths under receipts/{communityId}/

### Notes
- OCR calls are executed server-side at `app/api/ocr/route.ts` using Azure Form Recognizer receipt model
- Claim/unclaim uses Firestore transactions for best-effort exclusivity
- Exchange rate is stored per bill; all amounts shown in GBP and converted CNY

### Roadmap / Improvements
- Better error toasts and optimistic UI
- Role-based permissions (owner/admin)
- Unit tests for calculation and claim conflict handling
- Profile edit page to update display name
