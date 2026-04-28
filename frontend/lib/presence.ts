import { ref, onValue, off } from "firebase/database";
import { realtimeDb } from "./firebase";

export function watchFriendPresence(friendUids: string[], callback: (uid: string, status: string) => void) {
  const unsubscribeFunctions: (() => void)[] = [];

  friendUids.forEach((uid) => {
    const presenceRef = ref(realtimeDb, `presence/${uid}`);
    
    const unsubscribe = onValue(presenceRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        callback(uid, data.status);
      } else {
        callback(uid, "Offline");
      }
    });

    unsubscribeFunctions.push(() => off(presenceRef, 'value', unsubscribe));
  });

  return () => {
    unsubscribeFunctions.forEach((unsubscribe) => unsubscribe());
  };
}
