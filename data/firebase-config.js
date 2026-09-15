/**
 * MEOWKING - Firebase Firestore Configuration
 * -------------------------------------------------------------
 * Powers the real-time, multi-user community guestbook.
 * Hosted on GitHub Pages (github.io).
 */

window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyCiYodNBoQAE69AvxxrLxe007vQRubfZco",
  authDomain: "meowking-guestbook.firebaseapp.com",
  projectId: "meowking-guestbook",
  storageBucket: "meowking-guestbook.firebasestorage.app",
  messagingSenderId: "230928221967",
  appId: "1:230928221967:web:6f397c578d17b69d49e07a"
};

// Initialize Firebase if compat library is loaded
(function initFirebase() {
  if (typeof firebase !== 'undefined' && window.FIREBASE_CONFIG) {
    try {
      if (!firebase.apps.length) {
        firebase.initializeApp(window.FIREBASE_CONFIG);
      }
      window.FIREBASE_DB = firebase.firestore();
      console.log("Firebase Firestore initialized successfully for meowking.");
    } catch (err) {
      console.warn("Firebase initialization warning:", err);
    }
  }
})();
