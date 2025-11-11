import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminStorage } from '@/lib/firebaseAdmin';
import { v4 as uuidv4 } from 'uuid';
import DocumentIntelligence, { getLongRunningPoller, isUnexpected } from '@azure-rest/ai-document-intelligence';

// Env required:
// AZURE_FORM_RECOGNIZER_ENDPOINT
// AZURE_FORM_RECOGNIZER_KEY

async function analyzeReceipt(bytes: Uint8Array) {
  const endpoint = process.env.AZURE_FORM_RECOGNIZER_ENDPOINT;
  const key = process.env.AZURE_FORM_RECOGNIZER_KEY;
  if (!endpoint || !key) {
    throw new Error('Missing Azure Form Recognizer env');
  }

  // Use official SDK
  const client = DocumentIntelligence(endpoint, { key });
  
  // Convert bytes to base64
  const base64 = Buffer.from(bytes).toString('base64');
  
  const initialResponse = await client
    .path('/documentModels/{modelId}:analyze', 'prebuilt-receipt')
    .post({
      contentType: 'application/json',
      body: {
        base64Source: base64,
      },
    });

  if (isUnexpected(initialResponse)) {
    console.error('[Azure] Unexpected response:', initialResponse.body.error);
    throw initialResponse.body.error;
  }

  const poller = getLongRunningPoller(client, initialResponse);
  const result = await poller.pollUntilDone();
  const analyzeResult = (result.body as any).analyzeResult;

  return { analyzeResult };
}

function parseItems(result: any) {
  // Follow official SDK pattern: result.documents[0].fields
  const documents = result?.analyzeResult?.documents;
  if (!documents || documents.length === 0) {
    console.error('[parseItems] No documents found in result');
    return { items: [], total: 0 };
  }
  
  const document = documents[0];
  const fields = document.fields || {};
  
  console.log('[parseItems] Document type:', document.docType);
  console.log('[parseItems] Merchant:', fields.MerchantName?.valueString);
  
  // Extract items following official SDK pattern
  const Items = fields.Items;
  const itemsArray = Items?.valueArray || [];
  console.log('[parseItems] Items count:', itemsArray.length);
  
  const parsedItems: { name: string; price: number }[] = [];
  
  // Official SDK pattern: for (const { valueObject: item } of Items.valueArray)
  for (const { valueObject: item } of itemsArray) {
    if (!item) continue;
    
    const Description = item.Description;
    const TotalPrice = item.TotalPrice;
    
    const name = Description?.valueString || 'Unknown Item';
    const price = TotalPrice?.valueCurrency?.amount || 0;
    
    console.log('[parseItems] Item:', {
      name,
      price,
      currency: TotalPrice?.valueCurrency?.currencyCode
    });
    
    if (name && price > 0) {
      parsedItems.push({ name, price });
    }
  }
  
  // Extract total following official SDK pattern
  const Total = fields.Total;
  let total = Total?.valueCurrency?.amount || 0;
  
  console.log('[parseItems] Total:', total, Total?.valueCurrency?.currencyCode);
  
  // Fallback: sum items if no total
  if (!total || total <= 0) {
    total = parsedItems.reduce((sum, item) => sum + item.price, 0);
    console.log('[parseItems] Calculated total from items:', total);
  }
  
  console.log('[parseItems] Final:', parsedItems.length, 'items, total:', total);
  
  return { items: parsedItems, total };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { communityId, storagePath, createdBy, exchangeRateGBPToCNY = 9 } = body || {};
    if (!communityId || !storagePath || !createdBy) {
      return NextResponse.json({ error: 'Missing communityId, storagePath or createdBy' }, { status: 400 });
    }

    // Download the image from Firebase Storage using Admin SDK
  const bucket = adminStorage().bucket();
    const file = bucket.file(storagePath);
  const [nodeBuffer] = await file.download();

    // Analyze with Azure using official SDK
    const result = await analyzeReceipt(new Uint8Array(nodeBuffer));
    const { items, total } = parseItems(result);
    console.log('[OCR] Parsed:', items.length, 'items, total:', total);

    // Derive a friendly default bill name (prefer merchant name if available)
    let billName = '';
    try {
      const doc0 = (result as any)?.analyzeResult?.documents?.[0];
      const merchant = doc0?.fields?.MerchantName?.valueString as string | undefined;
      billName = merchant ? `${merchant} Receipt` : `Bill ${new Date().toLocaleString()}`;
    } catch (e) {
      billName = `Bill ${new Date().toLocaleString()}`;
    }

    // Write bill and items to Firestore under community
    const billId = uuidv4();
    const billRef = adminDb()
      .collection('communities')
      .doc(communityId)
      .collection('bills')
      .doc(billId);

  const batch = adminDb().batch();

    batch.set(billRef, {
      id: billId,
      communityId,
      createdBy,
      createdAt: Date.now(),
      billName,
      currency: 'GBP',
      exchangeRateGBPToCNY,
      participants: [createdBy],
      total,
      storagePath,
    });

    const itemsCol = billRef.collection('items');
    items.forEach((it, idx) => {
      const itemRef = itemsCol.doc();
      batch.set(itemRef, {
        id: itemRef.id,
        name: it.name,
        price: it.price,
        claimedBy: null,
      });
    });

    await batch.commit();

    return NextResponse.json({ 
      billId, 
      itemsCount: items.length, 
      total,
      debug: {
        rawResultKeys: Object.keys(result || {}),
        analyzeResultKeys: Object.keys(result?.analyzeResult || {}),
        documentsCount: result?.analyzeResult?.documents?.length,
        firstDocFields: Object.keys(result?.analyzeResult?.documents?.[0]?.fields || {}),
        parsedItems: items,
      }
    });
  } catch (err: any) {
    console.error('OCR route error', err);
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
}
