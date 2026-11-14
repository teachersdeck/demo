/* Public demo build: no Firebase project is connected, so cloud sync is switched off
   and the app runs on its built-in demo / local-only mode.
   To connect your own project, paste its web config here. */
window.FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

/* Google sign-in inside the installed Chrome extension (js/ext-signin.js): the ID of the project's OAuth web client
   ("Web client (auto created by Google Service)"), a public identifier. Its redirect URIs are listed in js/ext-signin.js. */
window.GOOGLE_SIGNIN = {
  googleClientId: "YOUR_OAUTH_WEB_CLIENT_ID"
};
