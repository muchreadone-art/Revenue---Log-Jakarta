import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId); /* CRITICAL: The app will break without this line */
export const auth = getAuth(app);

export async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log('[Firebase] Connection verified successfully');
  } catch (error: any) {
    if (
      error?.code === 'resource-exhausted' ||
      String(error?.message || error).toLowerCase().includes('quota')
    ) {
      console.warn('[Firebase] Daily quota reached; operating in persistent cache & offline mode.');
      return;
    }
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('[Firebase] Client is offline; using cached data.');
      return;
    }
    console.warn('[Firebase] Connection verification notice:', error?.message || error);
  }
}
